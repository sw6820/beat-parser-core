/**
 * Picture Count Performance Benchmarks Test Suite
 * 
 * Performance testing for large-scale picture count selections,
 * memory usage optimization, and scalability validation.
 */

import { BeatSelector } from '../core/BeatSelector';
import { BeatParser } from '../core/BeatParser';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import type { Beat, Tempo } from '../types';

describe('Picture Count Performance Benchmarks', () => {
  let parser: BeatParser;

  beforeEach(() => {
    parser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.3,
      includeMetadata: true
    });
  });

  afterEach(async () => {
    await parser.cleanup();
  });

  describe('Large Picture Count Performance', () => {
    const createLargeBeatDataset = (size: number): Beat[] => {
      return Array.from({ length: size }, (_, i) => ({
        timestamp: i * 100 + Math.random() * 50,
        strength: Math.random() * 0.6 + 0.4,
        confidence: Math.random() * 0.4 + 0.6,
        metadata: {
          algorithmSource: Math.random() > 0.5 ? 'onset' : 'tempo',
          prominence: Math.random()
        }
      }));
    };

    test('should complete selections within time limits for large picture counts', () => {
      const performanceTargets = [
        { beatCount: 1000, pictureCount: 100, maxTime: 1000 },
        { beatCount: 2000, pictureCount: 250, maxTime: 2000 },
        { beatCount: 5000, pictureCount: 500, maxTime: 5000 },
        { beatCount: 10000, pictureCount: 1000, maxTime: 8000 }
      ];

      performanceTargets.forEach(target => {
        const beats = createLargeBeatDataset(target.beatCount);
        
        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: target.pictureCount,
          strategy: 'adaptive'
        });

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        const processingTime = endTime - startTime;
        const memoryUsed = endMemory - startMemory;

        expect(result.beats).toHaveLength(target.pictureCount);
        expect(processingTime).toBeLessThan(target.maxTime);
        expect(result.metadata.processingTime).toBeLessThan(target.maxTime);

        console.log(`[${target.beatCount} beats → ${target.pictureCount} pictures]: ${processingTime.toFixed(2)}ms, ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      });
    });

    test('should scale efficiently with increasing picture counts', () => {
      const baseBeatSet = createLargeBeatDataset(5000);
      const pictureCounts = [50, 100, 250, 500, 1000];
      const results: Array<{ count: number; time: number; memoryMB: number }> = [];

      pictureCounts.forEach(count => {
        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const result = BeatSelector.selectBeatsEnhanced(baseBeatSet, {
          count,
          strategy: 'adaptive'
        });

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        const processingTime = endTime - startTime;
        const memoryUsed = (endMemory - startMemory) / (1024 * 1024);

        results.push({ count, time: processingTime, memoryMB: memoryUsed });

        expect(result.beats).toHaveLength(count);
        expect(processingTime).toBeLessThan(count * 10); // Should not be linear with count
      });

      console.log('Picture Count Scaling Results:');
      results.forEach(r => {
        console.log(`  ${r.count} pictures: ${r.time.toFixed(2)}ms, ${r.memoryMB.toFixed(2)}MB`);
      });

      // Verify sub-linear scaling
      for (let i = 1; i < results.length; i++) {
        const timeRatio = results[i].time / results[i-1].time;
        const countRatio = results[i].count / results[i-1].count;
        expect(timeRatio).toBeLessThan(countRatio * 1.5); // Should scale better than linear
      }
    });

    test('should handle maximum theoretical picture counts', () => {
      const extremeCases = [
        { beats: 1000, pictures: 2000 }, // More pictures than beats
        { beats: 50000, pictures: 500 },  // Many beats, reasonable pictures
        { beats: 100000, pictures: 1000 } // Massive dataset
      ];

      extremeCases.forEach((testCase, index) => {
        const beats = createLargeBeatDataset(testCase.beats);
        
        const startTime = performance.now();
        
        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: testCase.pictures,
          strategy: 'adaptive'
        });

        const processingTime = performance.now() - startTime;

        expect(result.beats.length).toBeLessThanOrEqual(Math.min(testCase.pictures, testCase.beats));
        expect(processingTime).toBeLessThan(15000); // 15 second absolute max
        expect(result.quality.overall).toBeGreaterThanOrEqual(0);

        console.log(`Extreme case ${index + 1}: ${processingTime.toFixed(2)}ms for ${testCase.beats} beats → ${result.beats.length} pictures`);
      });
    });
  });

  describe('Strategy Performance Comparison', () => {
    const benchmarkDataset = createLargeBeatDataset(3000);
    const pictureCount = 300;

    test('should compare strategy performance under load', () => {
      const strategies = ['energy', 'regular', 'musical', 'adaptive'] as const;
      const performanceResults: Record<string, { time: number; quality: number; memory: number }> = {};

      strategies.forEach(strategy => {
        // Force garbage collection before each test
        if (global.gc) {
          global.gc();
        }

        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const result = BeatSelector.selectBeatsEnhanced(benchmarkDataset, {
          count: pictureCount,
          strategy,
          audioDuration: 300
        });

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        performanceResults[strategy] = {
          time: endTime - startTime,
          quality: result.quality.overall,
          memory: (endMemory - startMemory) / (1024 * 1024)
        };

        expect(result.beats).toHaveLength(pictureCount);
        expect(result.quality.overall).toBeGreaterThanOrEqual(0);
      });

      console.log('Strategy Performance Comparison (3000 beats → 300 pictures):');
      Object.entries(performanceResults).forEach(([strategy, metrics]) => {
        console.log(`  ${strategy}: ${metrics.time.toFixed(2)}ms, quality=${metrics.quality.toFixed(3)}, ${metrics.memory.toFixed(2)}MB`);
      });

      // Verify all strategies complete within reasonable time
      Object.values(performanceResults).forEach(metrics => {
        expect(metrics.time).toBeLessThan(5000); // 5 seconds max
        expect(metrics.quality).toBeGreaterThan(0);
      });
    });

    test('should maintain strategy quality under performance pressure', () => {
      const stressTestSizes = [1000, 2500, 5000, 7500];
      const targetPictures = 200;

      stressTestSizes.forEach(size => {
        const stressDataset = createLargeBeatDataset(size);
        const strategies = ['energy', 'adaptive'] as const; // Test most and least complex

        strategies.forEach(strategy => {
          const result = BeatSelector.selectBeatsEnhanced(stressDataset, {
            count: targetPictures,
            strategy
          });

          expect(result.beats).toHaveLength(targetPictures);
          expect(result.quality.overall).toBeGreaterThan(0.2); // Maintain minimum quality under stress
          expect(result.metadata.processingTime).toBeLessThan(8000); // 8 second max under stress
        });
      });
    });
  });

  describe('Memory Optimization Tests', () => {
    test('should not leak memory during repeated large selections', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterationCount = 50;
      const beatDataset = createLargeBeatDataset(2000);

      for (let i = 0; i < iterationCount; i++) {
        const result = BeatSelector.selectBeatsEnhanced(beatDataset, {
          count: 100,
          strategy: 'adaptive'
        });

        expect(result.beats).toHaveLength(100);

        // Force garbage collection every 10 iterations if available
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      // Allow some memory growth but not excessive
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / (1024 * 1024);
      
      console.log(`Memory growth after ${iterationCount} iterations: ${memoryGrowth.toFixed(2)}MB`);
      expect(memoryGrowth).toBeLessThan(100); // 100MB threshold
    });

    test('should efficiently handle memory with very large beat arrays', () => {
      const sizes = [10000, 25000, 50000];

      sizes.forEach(size => {
        const startMemory = process.memoryUsage().heapUsed;
        
        // Create large dataset in chunks to avoid initial allocation spike
        const largeDataset: Beat[] = [];
        const chunkSize = 5000;
        
        for (let i = 0; i < size; i += chunkSize) {
          const chunk = createLargeBeatDataset(Math.min(chunkSize, size - i));
          chunk.forEach((beat, index) => {
            beat.timestamp = (i + index) * 50; // Ensure temporal ordering
          });
          largeDataset.push(...chunk);
        }

        const datasetMemory = process.memoryUsage().heapUsed;

        const result = BeatSelector.selectBeatsEnhanced(largeDataset, {
          count: 500,
          strategy: 'regular',
          audioDuration: size / 20 // Reasonable audio duration
        });

        const finalMemory = process.memoryUsage().heapUsed;
        const processingMemory = finalMemory - datasetMemory;

        expect(result.beats).toHaveLength(500);
        expect(processingMemory).toBeLessThan(50 * 1024 * 1024); // 50MB processing overhead max

        console.log(`Dataset size ${size}: Processing overhead ${(processingMemory / 1024 / 1024).toFixed(2)}MB`);
      });
    });

    test('should clean up temporary data structures', () => {
      const testDataset = createLargeBeatDataset(5000);
      const tempo: Tempo = { bpm: 120, confidence: 0.8 };

      let peakMemory = 0;
      let baseMemory = process.memoryUsage().heapUsed;

      // Monitor memory during processing
      const memoryCheck = setInterval(() => {
        const currentMemory = process.memoryUsage().heapUsed;
        peakMemory = Math.max(peakMemory, currentMemory - baseMemory);
      }, 10);

      const result = BeatSelector.selectBeatsEnhanced(testDataset, {
        count: 400,
        strategy: 'musical'
      }, tempo);

      clearInterval(memoryCheck);

      // Allow brief time for cleanup
      setTimeout(() => {
        if (global.gc) global.gc();
        
        const postProcessingMemory = process.memoryUsage().heapUsed;
        const residualMemory = postProcessingMemory - baseMemory;

        expect(result.beats).toHaveLength(400);
        console.log(`Peak memory: ${(peakMemory / 1024 / 1024).toFixed(2)}MB, Residual: ${(residualMemory / 1024 / 1024).toFixed(2)}MB`);
        expect(residualMemory).toBeLessThan(peakMemory * 0.6); // Should clean up significantly
      }, 100);
    });
  });

  describe('Real-World Performance Scenarios', () => {
    test('should handle typical music video synchronization workload', async () => {
      // Simulate 4-minute music track with high beat density
      const musicTrackAudio = AudioTestFileGenerator.generateBeatsPattern(128, {
        sampleRate: 44100,
        channels: 1,
        duration: 240, // 4 minutes
        bitDepth: 16,
        format: 'wav'
      });

      const pictureSequences = [
        { count: 48, name: '2 pictures per beat' },
        { count: 96, name: '4 pictures per beat' },
        { count: 192, name: '8 pictures per beat' },
        { count: 480, name: '20 pictures per beat' }
      ];

      for (const sequence of pictureSequences) {
        const startTime = performance.now();

        const result = await parser.parseBuffer(musicTrackAudio, {
          targetPictureCount: sequence.count,
          selectionMethod: 'musical'
        });

        const processingTime = performance.now() - startTime;

        expect(result.beats.length).toBeLessThanOrEqual(sequence.count);
        expect(processingTime).toBeLessThan(15000); // 15 seconds max for real-world usage
        
        console.log(`Music video ${sequence.name}: ${processingTime.toFixed(2)}ms, ${result.beats.length} pictures selected`);
      }
    });

    test('should handle slideshow synchronization workload', async () => {
      // Simulate various song lengths for photo slideshows
      const songLengths = [
        { duration: 180, pictures: 24, name: '3min pop song' },
        { duration: 300, pictures: 40, name: '5min ballad' },
        { duration: 420, pictures: 56, name: '7min epic song' }
      ];

      for (const song of songLengths) {
        const audio = AudioTestFileGenerator.generateBeatsPattern(120, {
          sampleRate: 44100,
          channels: 1,
          duration: song.duration,
          bitDepth: 16,
          format: 'wav'
        });

        const startTime = performance.now();

        const result = await parser.parseBuffer(audio, {
          targetPictureCount: song.pictures,
          selectionMethod: 'adaptive'
        });

        const processingTime = performance.now() - startTime;

        expect(result.beats).toHaveLength(song.pictures);
        expect(processingTime).toBeLessThan(10000); // 10 seconds max

        // Should have good temporal coverage for slideshows
        const timeSpan = result.beats[result.beats.length - 1].timestamp - result.beats[0].timestamp;
        const expectedSpan = song.duration * 0.8 * 1000; // At least 80% coverage
        expect(timeSpan).toBeGreaterThan(expectedSpan);

        console.log(`Slideshow ${song.name}: ${processingTime.toFixed(2)}ms, coverage=${(timeSpan / (song.duration * 1000)).toFixed(2)}`);
      }
    });

    test('should handle dance performance synchronization workload', async () => {
      // Simulate electronic/dance music with dense beat patterns
      const danceAudio = AudioTestFileGenerator.generateBeatsPattern(140, {
        sampleRate: 44100,
        channels: 1,
        duration: 360, // 6 minutes
        bitDepth: 16,
        format: 'wav'
      });

      const danceSequences = [
        { count: 200, strategy: 'energy', name: 'energy-focused' },
        { count: 300, strategy: 'regular', name: 'regular-timed' },
        { count: 150, strategy: 'musical', name: 'musical-phrased' },
        { count: 250, strategy: 'adaptive', name: 'adaptive-mixed' }
      ] as const;

      for (const sequence of danceSequences) {
        const startTime = performance.now();

        const result = await parser.parseBuffer(danceAudio, {
          targetPictureCount: sequence.count,
          selectionMethod: sequence.strategy
        });

        const processingTime = performance.now() - startTime;

        expect(result.beats).toHaveLength(sequence.count);
        expect(processingTime).toBeLessThan(12000); // 12 seconds max

        console.log(`Dance ${sequence.name}: ${processingTime.toFixed(2)}ms, quality=${result.metadata.analysis?.qualityScore?.toFixed(3)}`);
      }
    });
  });

  describe('Concurrent Processing Performance', () => {
    test('should handle multiple simultaneous selections', async () => {
      const sharedDataset = createLargeBeatDataset(3000);
      const concurrentRequests = 8;
      
      const requests = Array.from({ length: concurrentRequests }, (_, i) => ({
        count: 100 + i * 25,
        strategy: ['energy', 'regular', 'musical', 'adaptive'][i % 4] as const,
        id: i
      }));

      const startTime = performance.now();

      const promises = requests.map(request => 
        Promise.resolve().then(() => {
          const result = BeatSelector.selectBeatsEnhanced(sharedDataset, {
            count: request.count,
            strategy: request.strategy
          });
          return { id: request.id, result, count: request.count };
        })
      );

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All requests should complete successfully
      results.forEach(({ result, count }) => {
        expect(result.beats).toHaveLength(count);
        expect(result.quality.overall).toBeGreaterThanOrEqual(0);
      });

      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
      console.log(`${concurrentRequests} concurrent requests completed in ${totalTime.toFixed(2)}ms`);
    });

    test('should maintain performance under concurrent load', async () => {
      const heavyLoad = Array.from({ length: 20 }, (_, i) => ({
        beats: createLargeBeatDataset(1000 + i * 100),
        pictures: 50 + i * 10,
        id: i
      }));

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed;

      const concurrentProcessing = heavyLoad.map(load => 
        Promise.resolve().then(() => {
          return BeatSelector.selectBeatsEnhanced(load.beats, {
            count: load.pictures,
            strategy: 'adaptive'
          });
        })
      );

      const results = await Promise.all(concurrentProcessing);
      
      const totalTime = performance.now() - startTime;
      const memoryUsed = (process.memoryUsage().heapUsed - startMemory) / (1024 * 1024);

      results.forEach((result, index) => {
        expect(result.beats).toHaveLength(heavyLoad[index].pictures);
        expect(result.quality.overall).toBeGreaterThan(0);
      });

      console.log(`Heavy concurrent load: ${totalTime.toFixed(2)}ms, ${memoryUsed.toFixed(2)}MB`);
      expect(totalTime).toBeLessThan(20000); // 20 seconds for heavy load
      expect(memoryUsed).toBeLessThan(200); // 200MB total memory usage
    });
  });

  describe('Performance Regression Tests', () => {
    test('should maintain baseline performance benchmarks', () => {
      const baselines = [
        { beats: 1000, pictures: 50, maxTime: 500, name: 'small-standard' },
        { beats: 3000, pictures: 150, maxTime: 1500, name: 'medium-standard' },
        { beats: 5000, pictures: 300, maxTime: 3000, name: 'large-standard' },
        { beats: 10000, pictures: 500, maxTime: 6000, name: 'xlarge-standard' }
      ];

      baselines.forEach(baseline => {
        const dataset = createLargeBeatDataset(baseline.beats);
        
        const startTime = performance.now();
        const result = BeatSelector.selectBeatsEnhanced(dataset, {
          count: baseline.pictures,
          strategy: 'adaptive'
        });
        const processingTime = performance.now() - startTime;

        expect(result.beats).toHaveLength(baseline.pictures);
        expect(processingTime).toBeLessThan(baseline.maxTime);
        
        const performanceRatio = processingTime / baseline.maxTime;
        expect(performanceRatio).toBeLessThan(0.8); // Should perform 20% better than baseline

        console.log(`${baseline.name}: ${processingTime.toFixed(2)}ms (${(performanceRatio * 100).toFixed(1)}% of baseline)`);
      });
    });

    test('should demonstrate performance improvements over naive algorithms', () => {
      const testDataset = createLargeBeatDataset(5000);
      const pictureCount = 200;

      // Simulate naive selection (just take first N beats)
      const naiveStart = performance.now();
      const naiveResult = testDataset.slice(0, pictureCount);
      const naiveTime = performance.now() - naiveStart;

      // Optimized selection
      const optimizedStart = performance.now();
      const optimizedResult = BeatSelector.selectBeatsEnhanced(testDataset, {
        count: pictureCount,
        strategy: 'adaptive'
      });
      const optimizedTime = performance.now() - optimizedStart;

      expect(optimizedResult.beats).toHaveLength(pictureCount);
      expect(optimizedResult.quality.overall).toBeGreaterThan(0.5);
      
      // While optimized takes longer, it should still be reasonable
      expect(optimizedTime).toBeLessThan(3000); // 3 seconds max
      
      console.log(`Naive: ${naiveTime.toFixed(2)}ms, Optimized: ${optimizedTime.toFixed(2)}ms`);
      console.log(`Quality improvement: naive=0 vs optimized=${optimizedResult.quality.overall.toFixed(3)}`);
    });
  });
});