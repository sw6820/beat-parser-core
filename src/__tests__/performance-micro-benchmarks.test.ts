/**
 * Performance Micro-Benchmarks
 * Algorithm-level performance measurement with sub-millisecond precision
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { HybridDetector } from '../algorithms/HybridDetector';
import { OnsetDetection } from '../algorithms/OnsetDetection';
import { TempoTracking } from '../algorithms/TempoTracking';
import { BeatSelector } from '../core/BeatSelector';
import { AudioProcessor } from '../core/AudioProcessor';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';
import type { BeatCandidate, AudioFeatures } from '../types';

describe('Performance Micro-Benchmarks', () => {
  let parser: BeatParser;
  let audioProcessor: AudioProcessor;
  let hybridDetector: HybridDetector;
  let onsetDetection: OnsetDetection;
  let tempoTracking: TempoTracking;
  let beatSelector: BeatSelector;

  // Test data sizes for algorithm complexity validation
  const testSizes = [1024, 2048, 4096, 8192, 16384, 32768];
  const sampleRates = [22050, 44100, 48000, 96000];
  
  beforeAll(async () => {
    console.log('🔬 Initializing micro-benchmark suite...');
    
    // Initialize core components
    parser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.6
    });

    audioProcessor = new AudioProcessor({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512
    });

    hybridDetector = new HybridDetector({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512
    });

    onsetDetection = new OnsetDetection({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512
    });

    tempoTracking = new TempoTracking({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      minTempo: 60,
      maxTempo: 200
    });

    beatSelector = new BeatSelector();

    console.log('✅ Components initialized');
  }, 30000);

  afterAll(async () => {
    await parser.cleanup();
    console.log('🧹 Micro-benchmark suite completed');
  });

  describe('Audio Processing Algorithm Benchmarks', () => {
    test('AudioProcessor.processFrame performance scaling', async () => {
      const results = await PerformanceUtils.scalabilityTest(
        (frameSize) => () => {
          const testFrame = AudioPerformanceUtils.generateTestAudio(
            frameSize / 44100, // Convert samples to duration
            44100,
            'medium'
          );
          return audioProcessor.processFrame(testFrame);
        },
        testSizes,
        'AudioProcessor.processFrame',
        'O(n log n)' // Expected due to FFT
      );

      // Validate performance targets
      results.results.forEach(result => {
        expect(result.duration).toBeLessThan(result.inputSize * 0.01); // <0.01ms per sample
        
        // Memory usage should be reasonable (less than 10x input size)
        expect(result.memoryUsed).toBeLessThan(result.inputSize * 4 * 10); // 4 bytes per float32 * 10x
      });

      // Validate algorithmic complexity
      expect(results.complexityAnalysis.apparent).toMatch(/O\((n log n|n²)\)/);
      expect(results.scalingFactor).toBeLessThan(3); // Should scale reasonably
    }, 60000);

    test('AudioProcessor.computeSpectrum FFT performance', async () => {
      const benchmark = await PerformanceUtils.benchmarkOperation(
        () => {
          const testData = AudioPerformanceUtils.generateTestAudio(0.1, 44100, 'high');
          return audioProcessor.computeSpectrum(testData);
        },
        'AudioProcessor.computeSpectrum (4410 samples)',
        { iterations: 50, warmupIterations: 10 }
      );

      const analysis = benchmark.analysis;
      
      // Sub-millisecond target for small frames
      expect(analysis.mean).toBeLessThan(1.0);
      expect(analysis.percentiles.p95).toBeLessThan(2.0);
      
      // Consistency check
      expect(analysis.stdDev / analysis.mean).toBeLessThan(0.5); // CV < 50%

      console.log(`FFT Performance: ${analysis.mean.toFixed(3)}ms avg, ${analysis.percentiles.p95.toFixed(3)}ms p95`);
    }, 30000);

    test('Audio windowing and overlap performance', async () => {
      const windowSizes = [512, 1024, 2048, 4096];
      
      for (const windowSize of windowSizes) {
        const benchmark = await PerformanceUtils.benchmarkOperation(
          () => {
            const testData = AudioPerformanceUtils.generateTestAudio(1.0, 44100, 'medium');
            return audioProcessor.applyWindow(testData.slice(0, windowSize));
          },
          `Audio windowing (${windowSize} samples)`,
          { iterations: 100, warmupIterations: 10 }
        );

        // Windowing should be very fast (linear complexity)
        expect(benchmark.analysis.mean).toBeLessThan(windowSize * 0.001); // <0.001ms per sample
        expect(benchmark.aggregatedMetrics.throughput).toBeGreaterThan(1000); // >1000 ops/sec
      }
    }, 45000);
  });

  describe('Beat Detection Algorithm Benchmarks', () => {
    test('OnsetDetection.detectOnsets complexity validation', async () => {
      const results = await PerformanceUtils.scalabilityTest(
        (duration) => () => {
          const testAudio = AudioPerformanceUtils.generateTestAudio(
            duration / 1000, // Convert ms to seconds
            44100,
            'high'
          );
          return onsetDetection.detectOnsets(testAudio);
        },
        [100, 200, 500, 1000, 2000, 5000], // Duration in ms
        'OnsetDetection.detectOnsets',
        'O(n log n)'
      );

      // Validate linear scaling with audio length
      expect(results.scalingFactor).toBeLessThan(2.0);
      expect(results.complexityAnalysis.rSquared).toBeGreaterThan(0.8);

      results.results.forEach(result => {
        const durationSeconds = result.inputSize / 1000;
        const maxExpectedTime = durationSeconds * 500; // 500ms per second of audio
        expect(result.duration).toBeLessThan(maxExpectedTime);
      });
    }, 90000);

    test('TempoTracking.estimateTempo performance', async () => {
      const tempoRanges = [
        { min: 60, max: 100, label: 'Slow' },
        { min: 100, max: 140, label: 'Medium' },
        { min: 140, max: 200, label: 'Fast' }
      ];

      for (const range of tempoRanges) {
        const customTempoTracking = new TempoTracking({
          sampleRate: 44100,
          frameSize: 2048,
          hopSize: 512,
          minTempo: range.min,
          maxTempo: range.max
        });

        const benchmark = await PerformanceUtils.benchmarkOperation(
          () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(5.0, 44100, 'high');
            return customTempoTracking.estimateTempo(testAudio);
          },
          `TempoTracking (${range.label}: ${range.min}-${range.max} BPM)`,
          { iterations: 20, warmupIterations: 5 }
        );

        // Tempo estimation should complete in reasonable time
        expect(benchmark.analysis.mean).toBeLessThan(2000); // <2s for 5s audio
        expect(benchmark.analysis.percentiles.p95).toBeLessThan(3000); // <3s p95
        
        // Memory usage should be bounded
        const avgMemoryMB = benchmark.aggregatedMetrics.averageMemoryUsed / 1024 / 1024;
        expect(avgMemoryMB).toBeLessThan(100); // <100MB

        console.log(`${range.label} tempo: ${benchmark.analysis.mean.toFixed(2)}ms avg, ${avgMemoryMB.toFixed(2)}MB`);
      }
    }, 120000);

    test('HybridDetector peak detection performance', async () => {
      const peakThresholds = [0.3, 0.5, 0.7, 0.9];
      
      for (const threshold of peakThresholds) {
        const customDetector = new HybridDetector({
          sampleRate: 44100,
          frameSize: 2048,
          hopSize: 512,
          confidenceThreshold: threshold
        });

        const benchmark = await PerformanceUtils.benchmarkOperation(
          () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(2.0, 44100, 'high');
            return customDetector.detectBeats(testAudio);
          },
          `HybridDetector (threshold=${threshold})`,
          { iterations: 25, warmupIterations: 5 }
        );

        // Higher thresholds should generally be faster (fewer candidates)
        expect(benchmark.analysis.mean).toBeLessThan(1000); // <1s for 2s audio
        
        // Throughput should be acceptable
        expect(benchmark.aggregatedMetrics.throughput).toBeGreaterThan(10); // >10 ops/sec
      }
    }, 90000);
  });

  describe('Beat Selection Algorithm Benchmarks', () => {
    test('BeatSelector algorithm complexity comparison', async () => {
      const algorithms = ['energy', 'regular', 'musical', 'adaptive'] as const;
      const beatCounts = [10, 50, 100, 500, 1000];
      
      for (const algorithm of algorithms) {
        const results = await PerformanceUtils.scalabilityTest(
          (beatCount) => () => {
            // Generate test beat candidates
            const candidates: BeatCandidate[] = [];
            for (let i = 0; i < beatCount * 2; i++) {
              candidates.push({
                time: i * 0.1,
                confidence: Math.random() * 0.5 + 0.5,
                strength: Math.random(),
                frequency: 60 + Math.random() * 140
              });
            }
            
            return beatSelector.selectBeats(candidates, {
              targetCount: beatCount,
              algorithm: algorithm,
              confidenceThreshold: 0.5
            });
          },
          beatCounts,
          `BeatSelector.${algorithm}`,
          algorithm === 'energy' ? 'O(n log n)' : // Sorting-based
          algorithm === 'adaptive' ? 'O(n²)' : // DP-based
          'O(n)' // Simple algorithms
        );

        console.log(`${algorithm} algorithm complexity: ${results.complexityAnalysis.apparent}`);
        
        // Validate performance targets based on algorithm type
        results.results.forEach(result => {
          const maxTimePerBeat = algorithm === 'adaptive' ? 1.0 : 0.1; // ms
          expect(result.duration).toBeLessThan(result.inputSize * maxTimePerBeat);
        });

        // All algorithms should handle reasonable beat counts
        expect(results.results[results.results.length - 1].duration).toBeLessThan(5000); // <5s for 1000 beats
      }
    }, 120000);

    test('Beat selection memory efficiency', async () => {
      const largeBeatCount = 5000;
      const candidates: BeatCandidate[] = [];
      
      // Generate large candidate set
      for (let i = 0; i < largeBeatCount; i++) {
        candidates.push({
          time: i * 0.05,
          confidence: Math.random() * 0.5 + 0.5,
          strength: Math.random(),
          frequency: 60 + Math.random() * 140
        });
      }

      const memoryProfile = await PerformanceUtils.profileMemoryUsage(
        () => beatSelector.selectBeats(candidates, {
          targetCount: 100,
          algorithm: 'energy',
          confidenceThreshold: 0.6
        }),
        'Beat selection memory usage',
        50 // 50ms intervals
      );

      const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
      const memoryDeltaMB = memoryProfile.memoryDelta.heapUsed / 1024 / 1024;
      
      // Memory usage should be reasonable for large candidate sets
      expect(peakMemoryMB).toBeLessThan(50); // <50MB peak
      expect(memoryDeltaMB).toBeLessThan(20); // <20MB retained

      console.log(`Beat selection peak memory: ${peakMemoryMB.toFixed(2)}MB`);
      console.log(`Memory delta: ${memoryDeltaMB.toFixed(2)}MB`);
    }, 60000);
  });

  describe('Parameter Sensitivity Performance', () => {
    test('Frame size impact on processing speed', async () => {
      const frameSizes = [512, 1024, 2048, 4096, 8192];
      const frameResults: Array<{ frameSize: number; avgDuration: number; throughput: number }> = [];

      for (const frameSize of frameSizes) {
        const customParser = new BeatParser({
          sampleRate: 44100,
          frameSize,
          hopSize: frameSize / 4,
          confidenceThreshold: 0.6
        });

        try {
          const benchmark = await PerformanceUtils.benchmarkOperation(
            () => {
              const testAudio = AudioPerformanceUtils.generateTestAudio(1.0, 44100, 'medium');
              return customParser.parseBuffer(testAudio, { targetPictureCount: 10 });
            },
            `Frame size ${frameSize}`,
            { iterations: 15, warmupIterations: 3 }
          );

          frameResults.push({
            frameSize,
            avgDuration: benchmark.analysis.mean,
            throughput: benchmark.aggregatedMetrics.throughput
          });

          // Each frame size should process in reasonable time
          expect(benchmark.analysis.mean).toBeLessThan(10000); // <10s for 1s audio
        } finally {
          await customParser.cleanup();
        }
      }

      // Analyze frame size scaling
      const minDuration = Math.min(...frameResults.map(r => r.avgDuration));
      const maxDuration = Math.max(...frameResults.map(r => r.avgDuration));
      
      // Frame size should not cause dramatic performance differences
      expect(maxDuration / minDuration).toBeLessThan(10); // <10x difference

      console.log('Frame size performance scaling:');
      frameResults.forEach(result => {
        console.log(`  ${result.frameSize}: ${result.avgDuration.toFixed(2)}ms avg`);
      });
    }, 180000);

    test('Sample rate processing efficiency', async () => {
      const sampleRateResults: Array<{
        sampleRate: number;
        realTimeRatio: number;
        efficiency: string;
      }> = [];

      for (const sampleRate of sampleRates) {
        const customParser = new BeatParser({
          sampleRate,
          frameSize: 2048,
          hopSize: 512
        });

        try {
          const audioDuration = 2.0; // 2 seconds
          const testAudio = AudioPerformanceUtils.generateTestAudio(
            audioDuration,
            sampleRate,
            'medium'
          );

          const { metrics } = await PerformanceUtils.measureOperation(
            () => customParser.parseBuffer(testAudio, { targetPictureCount: 20 }),
            `Sample rate ${sampleRate}Hz`
          );

          const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
            audioDuration,
            metrics.duration,
            Math.max(0, metrics.memoryUsage.heapUsed),
            sampleRate
          );

          sampleRateResults.push({
            sampleRate,
            realTimeRatio: efficiency.realTimeRatio,
            efficiency: efficiency.efficiency
          });

          // Higher sample rates should still be reasonable
          if (sampleRate <= 48000) {
            expect(efficiency.realTimeRatio).toBeLessThan(10); // <10x real-time
          } else {
            expect(efficiency.realTimeRatio).toBeLessThan(20); // <20x real-time for 96kHz
          }
        } finally {
          await customParser.cleanup();
        }
      }

      console.log('Sample rate efficiency:');
      sampleRateResults.forEach(result => {
        console.log(`  ${result.sampleRate}Hz: ${result.realTimeRatio.toFixed(2)}x real-time (${result.efficiency})`);
      });

      // At least some sample rates should achieve real-time or better
      const realTimeCount = sampleRateResults.filter(r => r.realTimeRatio <= 1.0).length;
      expect(realTimeCount).toBeGreaterThanOrEqual(1);
    }, 120000);

    test('Confidence threshold performance impact', async () => {
      const thresholds = [0.1, 0.3, 0.5, 0.7, 0.9];
      const thresholdResults: Array<{
        threshold: number;
        avgDuration: number;
        beatsFound: number;
        avgConfidence: number;
      }> = [];

      for (const threshold of thresholds) {
        const customParser = new BeatParser({
          sampleRate: 44100,
          confidenceThreshold: threshold
        });

        try {
          const benchmark = await PerformanceUtils.benchmarkOperation(
            async () => {
              const testAudio = AudioPerformanceUtils.generateTestAudio(3.0, 44100, 'high');
              return await customParser.parseBuffer(testAudio, { targetPictureCount: 30 });
            },
            `Confidence threshold ${threshold}`,
            { iterations: 10, warmupIterations: 2 }
          );

          const avgResult = benchmark.results[0]; // All results should be similar
          thresholdResults.push({
            threshold,
            avgDuration: benchmark.analysis.mean,
            beatsFound: avgResult.beats.length,
            avgConfidence: avgResult.beats.reduce((sum, b) => sum + b.confidence, 0) / avgResult.beats.length || 0
          });

          // All thresholds should process in reasonable time
          expect(benchmark.analysis.mean).toBeLessThan(15000); // <15s for 3s audio
        } finally {
          await customParser.cleanup();
        }
      }

      // Analyze threshold impact
      console.log('Confidence threshold impact:');
      thresholdResults.forEach(result => {
        console.log(`  ${result.threshold}: ${result.avgDuration.toFixed(2)}ms, ${result.beatsFound} beats, ${result.avgConfidence.toFixed(3)} avg conf`);
      });

      // Higher thresholds should generally find fewer beats but with higher confidence
      for (let i = 1; i < thresholdResults.length; i++) {
        const current = thresholdResults[i];
        const previous = thresholdResults[i - 1];
        
        expect(current.beatsFound).toBeLessThanOrEqual(previous.beatsFound);
        if (current.beatsFound > 0 && previous.beatsFound > 0) {
          expect(current.avgConfidence).toBeGreaterThanOrEqual(previous.avgConfidence * 0.9); // Allow some variance
        }
      }
    }, 150000);
  });

  describe('Memory Allocation Patterns', () => {
    test('Allocation hotspots in audio processing', async () => {
      const allocations: Array<{
        operation: string;
        memoryDelta: number;
        duration: number;
        efficiency: number;
      }> = [];

      const operations = [
        {
          name: 'Audio loading',
          op: () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(5.0, 44100, 'medium');
            return Promise.resolve(testAudio);
          }
        },
        {
          name: 'Spectrum computation',
          op: async () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(1.0, 44100, 'medium');
            return audioProcessor.computeSpectrum(testAudio);
          }
        },
        {
          name: 'Beat detection',
          op: async () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(2.0, 44100, 'high');
            return hybridDetector.detectBeats(testAudio);
          }
        },
        {
          name: 'Beat selection',
          op: () => {
            const candidates: BeatCandidate[] = [];
            for (let i = 0; i < 1000; i++) {
              candidates.push({
                time: i * 0.1,
                confidence: Math.random() * 0.5 + 0.5,
                strength: Math.random(),
                frequency: 60 + Math.random() * 140
              });
            }
            return beatSelector.selectBeats(candidates, {
              targetCount: 100,
              algorithm: 'energy'
            });
          }
        }
      ];

      for (const operation of operations) {
        const { metrics } = await PerformanceUtils.measureOperation(
          operation.op,
          operation.name,
          { iterations: 1, forceGC: true }
        );

        const memoryDelta = Math.max(0, metrics.memoryUsage.heapUsed);
        const efficiency = memoryDelta / metrics.duration; // bytes per ms

        allocations.push({
          operation: operation.name,
          memoryDelta,
          duration: metrics.duration,
          efficiency
        });

        console.log(`${operation.name}: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB in ${metrics.duration.toFixed(2)}ms`);
      }

      // Validate memory usage patterns
      allocations.forEach(alloc => {
        const memoryMB = alloc.memoryDelta / 1024 / 1024;
        
        // No single operation should use excessive memory
        expect(memoryMB).toBeLessThan(200); // <200MB per operation
        
        // Efficiency should be reasonable (not too much memory per unit time)
        expect(alloc.efficiency).toBeLessThan(1024 * 1024); // <1MB per ms
      });
    }, 60000);

    test('Garbage collection impact measurement', async () => {
      if (!global.gc) {
        console.warn('Garbage collection not available - skipping GC impact test');
        return;
      }

      const testAudio = AudioPerformanceUtils.generateTestAudio(1.0, 44100, 'medium');
      
      // Test with forced GC
      const withGC = await PerformanceUtils.benchmarkOperation(
        async () => {
          global.gc!();
          return parser.parseBuffer(testAudio, { targetPictureCount: 10 });
        },
        'With forced GC',
        { iterations: 10, warmupIterations: 2, forceGC: false }
      );

      // Test without forced GC
      const withoutGC = await PerformanceUtils.benchmarkOperation(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 10 }),
        'Without forced GC',
        { iterations: 10, warmupIterations: 2, forceGC: false }
      );

      const gcImpact = withGC.analysis.mean / withoutGC.analysis.mean;
      
      console.log(`GC impact: ${gcImpact.toFixed(2)}x slower with forced GC`);
      console.log(`With GC: ${withGC.analysis.mean.toFixed(2)}ms avg`);
      console.log(`Without GC: ${withoutGC.analysis.mean.toFixed(2)}ms avg`);

      // GC should not cause dramatic slowdown
      expect(gcImpact).toBeLessThan(3.0); // <3x slower with GC
      expect(gcImpact).toBeGreaterThan(0.5); // Should be at least somewhat slower
    }, 90000);
  });

  describe('Algorithm Performance Validation', () => {
    test('Complexity verification against theoretical bounds', async () => {
      const algorithms = [
        {
          name: 'FFT',
          operation: (size: number) => () => {
            const data = AudioPerformanceUtils.generateTestAudio(size / 44100, 44100, 'low');
            return audioProcessor.computeSpectrum(data);
          },
          expectedComplexity: 'O(n log n)',
          sizes: [512, 1024, 2048, 4096, 8192]
        },
        {
          name: 'Beat Detection',
          operation: (duration: number) => () => {
            const data = AudioPerformanceUtils.generateTestAudio(duration / 1000, 44100, 'medium');
            return hybridDetector.detectBeats(data);
          },
          expectedComplexity: 'O(n log n)',
          sizes: [500, 1000, 2000, 4000, 8000] // ms
        },
        {
          name: 'Energy-based Selection',
          operation: (beatCount: number) => () => {
            const candidates: BeatCandidate[] = [];
            for (let i = 0; i < beatCount * 2; i++) {
              candidates.push({
                time: i * 0.1,
                confidence: Math.random() * 0.5 + 0.5,
                strength: Math.random(),
                frequency: 60 + Math.random() * 140
              });
            }
            return beatSelector.selectBeats(candidates, {
              targetCount: beatCount,
              algorithm: 'energy'
            });
          },
          expectedComplexity: 'O(n log n)',
          sizes: [50, 100, 200, 400, 800]
        }
      ];

      for (const algorithm of algorithms) {
        const results = await PerformanceUtils.scalabilityTest(
          algorithm.operation,
          algorithm.sizes,
          algorithm.name,
          algorithm.expectedComplexity as any
        );

        console.log(`${algorithm.name} complexity analysis:`);
        console.log(`  Apparent: ${results.complexityAnalysis.apparent}`);
        console.log(`  Expected: ${algorithm.expectedComplexity}`);
        console.log(`  R²: ${results.complexityAnalysis.rSquared.toFixed(3)}`);
        console.log(`  Scaling factor: ${results.scalingFactor.toFixed(3)}`);

        // Complexity should be reasonable
        expect(results.complexityAnalysis.rSquared).toBeGreaterThan(0.7); // Good fit
        expect(results.scalingFactor).toBeLessThan(5); // Reasonable scaling

        // Performance should meet targets
        results.results.forEach((result, index) => {
          const inputSize = algorithm.sizes[index];
          const maxExpectedTime = inputSize * (algorithm.name === 'Beat Detection' ? 1 : 0.01);
          expect(result.duration).toBeLessThan(maxExpectedTime);
        });
      }
    }, 180000);
  });
});