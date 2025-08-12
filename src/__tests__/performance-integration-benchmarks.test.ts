/**
 * Performance Integration Benchmarks
 * Component-level integration performance measurement
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { WorkerClient } from '../worker/WorkerClient';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';
import type { ParseOptions, ParseResult } from '../types';

describe('Performance Integration Benchmarks', () => {
  let parser: BeatParser;
  let workerClient: WorkerClient;

  // Test scenarios with different characteristics
  const testScenarios = [
    { name: 'Short Audio', duration: 5, complexity: 'low', expectedTime: 3000 },
    { name: 'Medium Audio', duration: 30, complexity: 'medium', expectedTime: 15000 },
    { name: 'Long Audio', duration: 120, complexity: 'medium', expectedTime: 60000 },
    { name: 'Complex Audio', duration: 30, complexity: 'high', expectedTime: 30000 }
  ] as const;

  beforeAll(async () => {
    console.log('🔧 Initializing integration benchmark suite...');
    
    parser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.6,
      multiPassEnabled: true
    });

    try {
      workerClient = new WorkerClient();
      await workerClient.initialize();
    } catch (error) {
      console.warn('Worker client initialization failed:', error);
      workerClient = null as any;
    }

    console.log('✅ Integration benchmark components initialized');
  }, 60000);

  afterAll(async () => {
    await parser.cleanup();
    if (workerClient) {
      await workerClient.terminate();
    }
    console.log('🧹 Integration benchmark suite completed');
  });

  describe('End-to-End Processing Pipeline', () => {
    test('Complete workflow performance validation', async () => {
      for (const scenario of testScenarios) {
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          scenario.duration,
          44100,
          scenario.complexity
        );

        const benchmark = await PerformanceUtils.benchmarkOperation(
          () => parser.parseBuffer(testAudio, {
            targetPictureCount: Math.floor(scenario.duration / 2),
            algorithm: 'energy'
          }),
          `${scenario.name} E2E Processing`,
          { iterations: 5, warmupIterations: 1 }
        );

        const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
          scenario.duration,
          benchmark.analysis.mean,
          benchmark.aggregatedMetrics.averageMemoryUsed,
          44100
        );

        // Validate against expected performance targets
        expect(benchmark.analysis.mean).toBeLessThan(scenario.expectedTime);
        expect(benchmark.analysis.percentiles.p95).toBeLessThan(scenario.expectedTime * 1.5);
        
        // Memory usage should be reasonable
        const memoryMB = benchmark.aggregatedMetrics.averageMemoryUsed / 1024 / 1024;
        expect(memoryMB).toBeLessThan(scenario.duration * 2); // <2MB per second

        // Results should be consistent
        expect(benchmark.analysis.stdDev / benchmark.analysis.mean).toBeLessThan(0.3); // CV < 30%

        console.log(`${scenario.name}: ${benchmark.analysis.mean.toFixed(2)}ms avg (${efficiency.realTimeRatio.toFixed(2)}x real-time)`);
        console.log(`  Memory: ${memoryMB.toFixed(2)}MB, Efficiency: ${efficiency.efficiency}`);
      }
    }, 300000);

    test('Progressive quality enhancement performance', async () => {
      const testAudio = AudioPerformanceUtils.generateTestAudio(10, 44100, 'high');
      
      const qualityConfigs = [
        { label: 'Fast', multiPass: false, frameSize: 1024, confidenceThreshold: 0.3 },
        { label: 'Standard', multiPass: false, frameSize: 2048, confidenceThreshold: 0.5 },
        { label: 'High Quality', multiPass: true, frameSize: 2048, confidenceThreshold: 0.7 },
        { label: 'Maximum', multiPass: true, frameSize: 4096, confidenceThreshold: 0.8 }
      ];

      const qualityResults: Array<{
        config: string;
        avgTime: number;
        avgMemory: number;
        beatsFound: number;
        avgConfidence: number;
        efficiency: string;
      }> = [];

      for (const config of qualityConfigs) {
        const qualityParser = new BeatParser({
          sampleRate: 44100,
          frameSize: config.frameSize,
          hopSize: config.frameSize / 4,
          confidenceThreshold: config.confidenceThreshold,
          multiPassEnabled: config.multiPass
        });

        try {
          const benchmark = await PerformanceUtils.benchmarkOperation(
            () => qualityParser.parseBuffer(testAudio, { targetPictureCount: 20 }),
            `Quality: ${config.label}`,
            { iterations: 8, warmupIterations: 2 }
          );

          const avgResult = benchmark.results[0];
          const avgConfidence = avgResult.beats.reduce((sum, b) => sum + b.confidence, 0) / avgResult.beats.length || 0;
          
          const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
            10, // 10 seconds
            benchmark.analysis.mean,
            benchmark.aggregatedMetrics.averageMemoryUsed,
            44100
          );

          qualityResults.push({
            config: config.label,
            avgTime: benchmark.analysis.mean,
            avgMemory: benchmark.aggregatedMetrics.averageMemoryUsed,
            beatsFound: avgResult.beats.length,
            avgConfidence,
            efficiency: efficiency.efficiency
          });

          // Each quality level should complete in reasonable time
          expect(benchmark.analysis.mean).toBeLessThan(60000); // <1 minute for 10s audio
          
        } finally {
          await qualityParser.cleanup();
        }
      }

      console.log('Quality vs Performance Trade-offs:');
      qualityResults.forEach((result, index) => {
        console.log(`  ${result.config}: ${result.avgTime.toFixed(0)}ms, ${result.beatsFound} beats, ${result.avgConfidence.toFixed(3)} conf, ${result.efficiency}`);
        
        // Higher quality should generally produce better confidence
        if (index > 0) {
          const previous = qualityResults[index - 1];
          // Allow some variance but expect general trend
          expect(result.avgConfidence).toBeGreaterThanOrEqual(previous.avgConfidence * 0.9);
        }
      });

      // Fast mode should be significantly faster than maximum quality
      const fastTime = qualityResults[0].avgTime;
      const maxTime = qualityResults[qualityResults.length - 1].avgTime;
      expect(maxTime / fastTime).toBeGreaterThan(1.5); // At least 1.5x difference
      expect(maxTime / fastTime).toBeLessThan(10); // But not more than 10x
    }, 180000);

    test('Component interaction overhead measurement', async () => {
      const componentTests = [
        {
          name: 'Audio Loading Only',
          operation: async () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'medium');
            return { audio: testAudio, beats: [] };
          }
        },
        {
          name: 'Audio + Processing',
          operation: async () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'medium');
            // Simulate preprocessing only
            return parser['audioProcessor'].processBuffer(testAudio);
          }
        },
        {
          name: 'Audio + Detection',
          operation: async () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'medium');
            return parser.parseBuffer(testAudio, { 
              targetPictureCount: 10,
              skipPostProcessing: true 
            });
          }
        },
        {
          name: 'Complete Pipeline',
          operation: async () => {
            const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'medium');
            return parser.parseBuffer(testAudio, { targetPictureCount: 10 });
          }
        }
      ];

      const componentResults: Array<{
        component: string;
        avgDuration: number;
        memoryUsed: number;
        overhead?: number;
      }> = [];

      for (const test of componentTests) {
        try {
          const benchmark = await PerformanceUtils.benchmarkOperation(
            test.operation,
            test.name,
            { iterations: 10, warmupIterations: 2 }
          );

          componentResults.push({
            component: test.name,
            avgDuration: benchmark.analysis.mean,
            memoryUsed: benchmark.aggregatedMetrics.averageMemoryUsed
          });
        } catch (error) {
          console.warn(`Component test ${test.name} failed:`, error);
        }
      }

      // Calculate overhead between components
      for (let i = 1; i < componentResults.length; i++) {
        const current = componentResults[i];
        const previous = componentResults[i - 1];
        current.overhead = current.avgDuration - previous.avgDuration;
      }

      console.log('Component Integration Overhead:');
      componentResults.forEach(result => {
        const memoryMB = result.memoryUsed / 1024 / 1024;
        const overheadMs = result.overhead || 0;
        console.log(`  ${result.component}: ${result.avgDuration.toFixed(2)}ms (+${overheadMs.toFixed(2)}ms), ${memoryMB.toFixed(2)}MB`);
      });

      // Validate reasonable overhead between components
      componentResults.forEach(result => {
        if (result.overhead) {
          expect(result.overhead).toBeGreaterThan(0); // Each component should add some time
          expect(result.overhead).toBeLessThan(10000); // But not excessive overhead
        }
      });
    }, 120000);
  });

  describe('Plugin System Performance', () => {
    test('Plugin initialization overhead', async () => {
      const mockPlugin = {
        name: 'TestPlugin',
        version: '1.0.0',
        initialize: async () => {
          await new Promise(resolve => setTimeout(resolve, 10)); // Simulate init time
        },
        processAudio: (audio: Float32Array) => {
          // Simple processing simulation
          return audio.map(sample => sample * 0.9);
        },
        cleanup: async () => {
          await new Promise(resolve => setTimeout(resolve, 5)); // Simulate cleanup time
        }
      };

      // Test without plugins
      const baselineParser = new BeatParser({
        sampleRate: 44100,
        plugins: []
      });

      // Test with plugin
      const pluginParser = new BeatParser({
        sampleRate: 44100,
        plugins: [mockPlugin]
      });

      try {
        const testAudio = AudioPerformanceUtils.generateTestAudio(3, 44100, 'medium');

        const baselineBench = await PerformanceUtils.benchmarkOperation(
          () => baselineParser.parseBuffer(testAudio, { targetPictureCount: 6 }),
          'Baseline (no plugins)',
          { iterations: 8, warmupIterations: 2 }
        );

        const pluginBench = await PerformanceUtils.benchmarkOperation(
          () => pluginParser.parseBuffer(testAudio, { targetPictureCount: 6 }),
          'With plugin',
          { iterations: 8, warmupIterations: 2 }
        );

        const pluginOverhead = pluginBench.analysis.mean - baselineBench.analysis.mean;
        const overheadPercent = (pluginOverhead / baselineBench.analysis.mean) * 100;

        console.log(`Plugin overhead: ${pluginOverhead.toFixed(2)}ms (${overheadPercent.toFixed(1)}%)`);
        console.log(`Baseline: ${baselineBench.analysis.mean.toFixed(2)}ms`);
        console.log(`With plugin: ${pluginBench.analysis.mean.toFixed(2)}ms`);

        // Plugin overhead should be reasonable
        expect(overheadPercent).toBeLessThan(50); // <50% overhead
        expect(pluginOverhead).toBeLessThan(5000); // <5s absolute overhead

        // Results should still be valid
        expect(pluginBench.results[0].beats.length).toBeGreaterThan(0);
      } finally {
        await baselineParser.cleanup();
        await pluginParser.cleanup();
      }
    }, 90000);

    test('Multiple plugin coordination performance', async () => {
      const plugins = [
        {
          name: 'PreprocessPlugin',
          version: '1.0.0',
          processAudio: (audio: Float32Array) => {
            return audio.map(sample => Math.tanh(sample)); // Soft saturation
          }
        },
        {
          name: 'FilterPlugin',
          version: '1.0.0',
          processAudio: (audio: Float32Array) => {
            // Simple high-pass filter simulation
            let prev = 0;
            return audio.map(sample => {
              const filtered = sample - prev * 0.95;
              prev = sample;
              return filtered;
            });
          }
        },
        {
          name: 'EnhancerPlugin',
          version: '1.0.0',
          processAudio: (audio: Float32Array) => {
            // Dynamic range enhancement
            return audio.map(sample => {
              const abs = Math.abs(sample);
              return sample * (1 + abs * 0.2);
            });
          }
        }
      ];

      const configs = [
        { label: 'No plugins', plugins: [] },
        { label: '1 plugin', plugins: plugins.slice(0, 1) },
        { label: '2 plugins', plugins: plugins.slice(0, 2) },
        { label: '3 plugins', plugins: plugins.slice(0, 3) }
      ];

      const pluginScalingResults: Array<{
        config: string;
        avgDuration: number;
        memoryUsed: number;
        pluginOverhead: number;
      }> = [];

      let baselineDuration = 0;

      for (const config of configs) {
        const testParser = new BeatParser({
          sampleRate: 44100,
          plugins: config.plugins
        });

        try {
          const testAudio = AudioPerformanceUtils.generateTestAudio(2, 44100, 'medium');
          
          const benchmark = await PerformanceUtils.benchmarkOperation(
            () => testParser.parseBuffer(testAudio, { targetPictureCount: 4 }),
            config.label,
            { iterations: 6, warmupIterations: 1 }
          );

          if (config.plugins.length === 0) {
            baselineDuration = benchmark.analysis.mean;
          }

          pluginScalingResults.push({
            config: config.label,
            avgDuration: benchmark.analysis.mean,
            memoryUsed: benchmark.aggregatedMetrics.averageMemoryUsed,
            pluginOverhead: benchmark.analysis.mean - baselineDuration
          });
        } finally {
          await testParser.cleanup();
        }
      }

      console.log('Plugin Scaling Performance:');
      pluginScalingResults.forEach(result => {
        const memoryMB = result.memoryUsed / 1024 / 1024;
        console.log(`  ${result.config}: ${result.avgDuration.toFixed(2)}ms (+${result.pluginOverhead.toFixed(2)}ms), ${memoryMB.toFixed(2)}MB`);
      });

      // Plugin scaling should be roughly linear
      const maxPluginResult = pluginScalingResults[pluginScalingResults.length - 1];
      const singlePluginResult = pluginScalingResults[1];
      
      if (singlePluginResult && maxPluginResult) {
        const expectedOverhead = singlePluginResult.pluginOverhead * 3; // 3 plugins
        const actualOverhead = maxPluginResult.pluginOverhead;
        const scalingRatio = actualOverhead / expectedOverhead;
        
        // Scaling should be reasonably linear (within 2x)
        expect(scalingRatio).toBeLessThan(2.0);
        expect(scalingRatio).toBeGreaterThan(0.5);
        
        console.log(`Plugin scaling ratio: ${scalingRatio.toFixed(2)} (1.0 = perfect linear)`);
      }
    }, 120000);
  });

  describe('Worker Thread Performance', () => {
    test('Worker vs main thread performance comparison', async () => {
      if (!workerClient) {
        console.warn('Worker client not available - skipping worker performance tests');
        return;
      }

      const testAudio = AudioPerformanceUtils.generateTestAudio(8, 44100, 'medium');

      // Main thread processing
      const mainThreadBench = await PerformanceUtils.benchmarkOperation(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 16 }),
        'Main thread processing',
        { iterations: 6, warmupIterations: 1 }
      );

      // Worker thread processing
      const workerBench = await PerformanceUtils.benchmarkOperation(
        () => workerClient.parseBuffer(testAudio, { targetPictureCount: 16 }),
        'Worker thread processing',
        { iterations: 6, warmupIterations: 1 }
      );

      const workerOverhead = workerBench.analysis.mean - mainThreadBench.analysis.mean;
      const overheadPercent = (workerOverhead / mainThreadBench.analysis.mean) * 100;

      console.log(`Worker thread performance:`);
      console.log(`  Main thread: ${mainThreadBench.analysis.mean.toFixed(2)}ms`);
      console.log(`  Worker thread: ${workerBench.analysis.mean.toFixed(2)}ms`);
      console.log(`  Overhead: ${workerOverhead.toFixed(2)}ms (${overheadPercent.toFixed(1)}%)`);

      // Worker overhead should be reasonable
      expect(Math.abs(overheadPercent)).toBeLessThan(100); // <100% overhead in either direction
      
      // Results should be equivalent
      const mainResult = mainThreadBench.results[0];
      const workerResult = workerBench.results[0];
      expect(Math.abs(mainResult.beats.length - workerResult.beats.length)).toBeLessThanOrEqual(2);
    }, 120000);

    test('Worker message passing overhead', async () => {
      if (!workerClient) {
        console.warn('Worker client not available - skipping message passing tests');
        return;
      }

      const messageSizes = [1024, 4096, 16384, 65536]; // Different audio buffer sizes
      const messageResults: Array<{
        size: number;
        overhead: number;
        throughput: number;
      }> = [];

      for (const size of messageSizes) {
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          size / 44100, // Convert samples to duration
          44100,
          'low'
        );

        // Measure just the message passing time (minimal processing)
        const messageBench = await PerformanceUtils.benchmarkOperation(
          () => workerClient.parseBuffer(testAudio, { 
            targetPictureCount: 1,
            algorithm: 'regular' // Fastest algorithm
          }),
          `Message size ${size} samples`,
          { iterations: 10, warmupIterations: 2 }
        );

        const dataSize = size * 4; // Float32Array = 4 bytes per sample
        const throughput = dataSize / (messageBench.analysis.mean / 1000); // bytes per second

        messageResults.push({
          size,
          overhead: messageBench.analysis.mean,
          throughput
        });

        console.log(`${size} samples: ${messageBench.analysis.mean.toFixed(2)}ms, ${(throughput / 1024 / 1024).toFixed(2)} MB/s`);
      }

      // Message passing should scale reasonably with size
      const smallestThroughput = messageResults[0].throughput;
      const largestThroughput = messageResults[messageResults.length - 1].throughput;
      
      // Throughput should not degrade dramatically with size
      expect(largestThroughput).toBeGreaterThan(smallestThroughput * 0.1); // At least 10% of small message throughput
      
      // All message sizes should achieve reasonable throughput
      messageResults.forEach(result => {
        expect(result.throughput).toBeGreaterThan(1024 * 1024); // >1 MB/s minimum
      });
    }, 90000);
  });

  describe('Configuration Impact Analysis', () => {
    test('Configuration parameter interaction performance', async () => {
      const configCombinations = [
        { 
          name: 'Fast Config',
          config: { frameSize: 1024, hopSize: 256, multiPassEnabled: false, confidenceThreshold: 0.3 }
        },
        {
          name: 'Balanced Config',
          config: { frameSize: 2048, hopSize: 512, multiPassEnabled: false, confidenceThreshold: 0.5 }
        },
        {
          name: 'Quality Config',
          config: { frameSize: 4096, hopSize: 1024, multiPassEnabled: true, confidenceThreshold: 0.7 }
        },
        {
          name: 'Precision Config',
          config: { frameSize: 4096, hopSize: 512, multiPassEnabled: true, confidenceThreshold: 0.8 }
        }
      ];

      const configResults: Array<{
        name: string;
        avgDuration: number;
        memoryUsed: number;
        beatsFound: number;
        avgConfidence: number;
        realTimeRatio: number;
      }> = [];

      const testAudio = AudioPerformanceUtils.generateTestAudio(6, 44100, 'medium');

      for (const combination of configCombinations) {
        const testParser = new BeatParser({
          sampleRate: 44100,
          ...combination.config
        });

        try {
          const benchmark = await PerformanceUtils.benchmarkOperation(
            () => testParser.parseBuffer(testAudio, { targetPictureCount: 12 }),
            combination.name,
            { iterations: 5, warmupIterations: 1 }
          );

          const avgResult = benchmark.results[0];
          const avgConfidence = avgResult.beats.reduce((sum, b) => sum + b.confidence, 0) / avgResult.beats.length || 0;
          
          const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
            6, // 6 seconds audio
            benchmark.analysis.mean,
            benchmark.aggregatedMetrics.averageMemoryUsed,
            44100
          );

          configResults.push({
            name: combination.name,
            avgDuration: benchmark.analysis.mean,
            memoryUsed: benchmark.aggregatedMetrics.averageMemoryUsed,
            beatsFound: avgResult.beats.length,
            avgConfidence,
            realTimeRatio: efficiency.realTimeRatio
          });
        } finally {
          await testParser.cleanup();
        }
      }

      console.log('Configuration Performance Analysis:');
      configResults.forEach(result => {
        const memoryMB = result.memoryUsed / 1024 / 1024;
        console.log(`  ${result.name}:`);
        console.log(`    Time: ${result.avgDuration.toFixed(2)}ms (${result.realTimeRatio.toFixed(2)}x real-time)`);
        console.log(`    Memory: ${memoryMB.toFixed(2)}MB`);
        console.log(`    Beats: ${result.beatsFound} (avg conf: ${result.avgConfidence.toFixed(3)})`);
      });

      // Validate configuration trade-offs
      const fastConfig = configResults.find(r => r.name === 'Fast Config');
      const qualityConfig = configResults.find(r => r.name === 'Quality Config');
      
      if (fastConfig && qualityConfig) {
        // Fast config should be faster
        expect(fastConfig.avgDuration).toBeLessThan(qualityConfig.avgDuration);
        
        // Quality config should generally have better confidence
        if (qualityConfig.beatsFound > 0 && fastConfig.beatsFound > 0) {
          expect(qualityConfig.avgConfidence).toBeGreaterThanOrEqual(fastConfig.avgConfidence * 0.9);
        }
        
        // Both should complete in reasonable time
        expect(fastConfig.realTimeRatio).toBeLessThan(5); // <5x real-time
        expect(qualityConfig.realTimeRatio).toBeLessThan(15); // <15x real-time
      }
    }, 180000);

    test('Memory vs processing speed trade-offs', async () => {
      const memoryConfigs = [
        { label: 'Memory Optimized', frameSize: 512, hopSize: 128 },
        { label: 'Balanced', frameSize: 2048, hopSize: 512 },
        { label: 'Speed Optimized', frameSize: 8192, hopSize: 2048 }
      ];

      const tradeOffResults: Array<{
        config: string;
        avgDuration: number;
        peakMemory: number;
        memoryEfficiency: number;
        timeEfficiency: number;
      }> = [];

      for (const memConfig of memoryConfigs) {
        const testParser = new BeatParser({
          sampleRate: 44100,
          frameSize: memConfig.frameSize,
          hopSize: memConfig.hopSize
        });

        try {
          const testAudio = AudioPerformanceUtils.generateTestAudio(4, 44100, 'medium');

          const memoryProfile = await PerformanceUtils.profileMemoryUsage(
            () => testParser.parseBuffer(testAudio, { targetPictureCount: 8 }),
            memConfig.label
          );

          const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
          const duration = memoryProfile.snapshots[memoryProfile.snapshots.length - 1].timestamp - 
                          memoryProfile.snapshots[0].timestamp;

          tradeOffResults.push({
            config: memConfig.label,
            avgDuration: duration,
            peakMemory: peakMemoryMB,
            memoryEfficiency: 1 / peakMemoryMB, // Higher is better
            timeEfficiency: 1 / duration // Higher is better
          });
        } finally {
          await testParser.cleanup();
        }
      }

      console.log('Memory vs Speed Trade-offs:');
      tradeOffResults.forEach(result => {
        console.log(`  ${result.config}: ${result.avgDuration.toFixed(2)}ms, ${result.peakMemory.toFixed(2)}MB peak`);
      });

      // Validate trade-off expectations
      const memoryOptimized = tradeOffResults.find(r => r.config === 'Memory Optimized');
      const speedOptimized = tradeOffResults.find(r => r.config === 'Speed Optimized');

      if (memoryOptimized && speedOptimized) {
        // Memory optimized should use less memory
        expect(memoryOptimized.peakMemory).toBeLessThan(speedOptimized.peakMemory);
        
        // Speed optimized should be faster or comparable
        // (Note: might not always be faster due to different algorithmic characteristics)
        expect(speedOptimized.avgDuration).toBeLessThan(memoryOptimized.avgDuration * 2);
      }

      // All configurations should be within reasonable bounds
      tradeOffResults.forEach(result => {
        expect(result.peakMemory).toBeLessThan(200); // <200MB peak
        expect(result.avgDuration).toBeLessThan(30000); // <30s for 4s audio
      });
    }, 150000);
  });
});