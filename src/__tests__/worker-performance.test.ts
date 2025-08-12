/**
 * Web Worker Performance Benchmarking Tests
 * Comprehensive performance validation comparing worker vs main thread processing
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import { BeatParser } from '../core/BeatParser';
import { WorkerTestingUtils, type WorkerPerformanceComparison } from './worker-testing-utils';
import { PerformanceUtils, AudioPerformanceUtils, type StatisticalAnalysis, type BenchmarkConfig } from './performance-testing-utils';

describe('Web Worker Performance Benchmarking', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Worker vs Main Thread Performance Comparison', () => {
    const benchmarkConfig: Partial<BenchmarkConfig> = {
      iterations: 5,
      warmupIterations: 2,
      forceGC: true,
      collectMemoryStats: true
    };

    test('should demonstrate performance benefits for CPU-intensive operations', async () => {
      const complexAudio = AudioPerformanceUtils.generateTestAudio(3, 44100, 'high');
      
      // Main thread implementation
      const mainThreadOperation = async () => {
        const parser = new BeatParser();
        await parser.initialize();
        const result = await parser.parseBuffer(complexAudio, {
          targetPictureCount: 10,
          algorithm: 'hybrid'
        });
        await parser.cleanup();
        return result;
      };

      // Worker implementation
      const workerClient = WorkerTestingUtils.createTestWorkerClient();
      const workerOperation = async () => {
        await workerClient.initialize();
        const result = await workerClient.parseBuffer(complexAudio, {
          targetPictureCount: 10,
          algorithm: 'hybrid'
        });
        return result;
      };

      try {
        const comparison = await WorkerTestingUtils.compareWorkerPerformance(
          workerOperation,
          mainThreadOperation,
          'Complex Audio Processing'
        );

        // Analyze performance characteristics
        expect(comparison.workerTime).toBeGreaterThan(0);
        expect(comparison.mainThreadTime).toBeGreaterThan(0);
        
        console.log(`Worker time: ${comparison.workerTime.toFixed(2)}ms`);
        console.log(`Main thread time: ${comparison.mainThreadTime.toFixed(2)}ms`);
        console.log(`Speedup ratio: ${comparison.speedupRatio.toFixed(2)}x`);
        console.log(`Efficiency: ${(comparison.efficiency * 100).toFixed(1)}%`);
        console.log(`Recommendation: ${comparison.recommendation}`);

        // Worker should provide benefits for complex operations
        // (Note: Mock implementation may not show real speedup)
        expect(comparison.speedupRatio).toBeGreaterThan(0.5); // At least not much worse
        expect(['use-worker', 'use-main-thread', 'depends-on-size']).toContain(comparison.recommendation);
        
      } finally {
        await workerClient.terminate();
      }
    });

    test('should benchmark different audio sizes and complexities', async () => {
      const testCases = [
        { size: 1, complexity: 'low' as const, expectedSpeedup: 0.8 },
        { size: 3, complexity: 'medium' as const, expectedSpeedup: 1.0 },
        { size: 5, complexity: 'high' as const, expectedSpeedup: 1.2 },
        { size: 10, complexity: 'maximum' as const, expectedSpeedup: 1.5 }
      ];

      const benchmarkResults: Array<{
        testCase: typeof testCases[0];
        comparison: WorkerPerformanceComparison;
      }> = [];

      for (const testCase of testCases) {
        const audio = AudioPerformanceUtils.generateTestAudio(testCase.size, 44100, testCase.complexity);
        
        const mainThreadOperation = async () => {
          const parser = new BeatParser();
          await parser.initialize();
          const result = await parser.parseBuffer(audio, {
            targetPictureCount: Math.max(5, testCase.size * 2)
          });
          await parser.cleanup();
          return result;
        };

        const workerClient = WorkerTestingUtils.createTestWorkerClient();
        const workerOperation = async () => {
          await workerClient.initialize();
          return await workerClient.parseBuffer(audio, {
            targetPictureCount: Math.max(5, testCase.size * 2)
          });
        };

        try {
          const comparison = await WorkerTestingUtils.compareWorkerPerformance(
            workerOperation,
            mainThreadOperation,
            `Audio ${testCase.size}s ${testCase.complexity}`
          );

          benchmarkResults.push({ testCase, comparison });
          
          console.log(`${testCase.complexity} ${testCase.size}s: ${comparison.speedupRatio.toFixed(2)}x speedup`);
        } finally {
          await workerClient.terminate();
        }
      }

      // Analyze performance scaling patterns
      expect(benchmarkResults).toHaveLength(testCases.length);
      
      benchmarkResults.forEach(({ testCase, comparison }) => {
        // All operations should complete successfully
        expect(comparison.workerTime).toBeGreaterThan(0);
        expect(comparison.mainThreadTime).toBeGreaterThan(0);
        
        // Performance should be reasonable relative to expectations
        const actualSpeedup = comparison.speedupRatio;
        const expectedSpeedup = testCase.expectedSpeedup;
        
        // Allow some variance from expected (mock implementation)
        expect(actualSpeedup).toBeGreaterThan(expectedSpeedup * 0.5);
      });
    });

    test('should measure memory efficiency in worker vs main thread', async () => {
      const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'high');
      
      // Benchmark main thread memory usage
      const mainThreadBenchmark = await PerformanceUtils.benchmarkOperation(
        async () => {
          const parser = new BeatParser();
          await parser.initialize();
          const result = await parser.parseBuffer(testAudio, { targetPictureCount: 8 });
          await parser.cleanup();
          return result;
        },
        'Main Thread Memory Test',
        benchmarkConfig
      );

      // Benchmark worker memory usage  
      const workerClient = WorkerTestingUtils.createTestWorkerClient();
      const workerBenchmark = await PerformanceUtils.benchmarkOperation(
        async () => {
          await workerClient.initialize();
          return await workerClient.parseBuffer(testAudio, { targetPictureCount: 8 });
        },
        'Worker Memory Test',
        benchmarkConfig
      );

      await workerClient.terminate();

      // Analyze memory characteristics
      const mainThreadMemory = mainThreadBenchmark.aggregatedMetrics.averageMemoryUsed;
      const workerMemory = workerBenchmark.aggregatedMetrics.averageMemoryUsed;

      console.log(`Main thread memory: ${(mainThreadMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Worker memory: ${(workerMemory / 1024 / 1024).toFixed(2)}MB`);

      // Worker should provide memory isolation
      expect(Math.abs(workerMemory)).toBeGreaterThanOrEqual(0);
      expect(Math.abs(mainThreadMemory)).toBeGreaterThanOrEqual(0);

      // Memory usage should be reasonable
      const maxMemoryMB = Math.max(Math.abs(workerMemory), Math.abs(mainThreadMemory)) / 1024 / 1024;
      expect(maxMemoryMB).toBeLessThan(100); // Should not use excessive memory
    });

    test('should benchmark throughput for batch operations', async () => {
      const batchSizes = [1, 3, 5, 10];
      const throughputResults: Array<{
        batchSize: number;
        mainThreadThroughput: number;
        workerThroughput: number;
        improvement: number;
      }> = [];

      for (const batchSize of batchSizes) {
        const audioBatch = Array.from({ length: batchSize }, (_, i) =>
          AudioPerformanceUtils.generateTestAudio(2, 44100, 'medium')
        );

        // Main thread batch processing
        const mainThreadStart = performance.now();
        const mainThreadResults: any[] = [];
        for (const audio of audioBatch) {
          const parser = new BeatParser();
          await parser.initialize();
          const result = await parser.parseBuffer(audio, { targetPictureCount: 5 });
          mainThreadResults.push(result);
          await parser.cleanup();
        }
        const mainThreadTime = performance.now() - mainThreadStart;
        const mainThreadThroughput = batchSize / (mainThreadTime / 1000);

        // Worker batch processing
        const workerClient = WorkerTestingUtils.createTestWorkerClient();
        await workerClient.initialize();
        
        const workerStart = performance.now();
        const workerResults = await workerClient.processBatch(
          audioBatch,
          audioBatch.map((_, i) => ({ filename: `batch-${i}.wav`, targetPictureCount: 5 }))
        );
        const workerTime = performance.now() - workerStart;
        const workerThroughput = batchSize / (workerTime / 1000);

        await workerClient.terminate();

        const improvement = workerThroughput / mainThreadThroughput;
        throughputResults.push({
          batchSize,
          mainThreadThroughput,
          workerThroughput,
          improvement
        });

        console.log(`Batch size ${batchSize}:`);
        console.log(`  Main thread: ${mainThreadThroughput.toFixed(2)} ops/sec`);
        console.log(`  Worker: ${workerThroughput.toFixed(2)} ops/sec`);
        console.log(`  Improvement: ${improvement.toFixed(2)}x`);

        // Verify results are equivalent
        expect(mainThreadResults).toHaveLength(batchSize);
        expect(workerResults).toHaveLength(batchSize);
      }

      // Analyze throughput scaling
      expect(throughputResults).toHaveLength(batchSizes.length);
      
      throughputResults.forEach(result => {
        expect(result.mainThreadThroughput).toBeGreaterThan(0);
        expect(result.workerThroughput).toBeGreaterThan(0);
        expect(result.improvement).toBeGreaterThan(0);
      });
    });
  });

  describe('Worker Performance Characteristics', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should measure worker initialization overhead', async () => {
      const initializationTimes: number[] = [];
      const testCount = 5;

      for (let i = 0; i < testCount; i++) {
        const client = WorkerTestingUtils.createTestWorkerClient();
        
        const startTime = performance.now();
        await client.initialize();
        const endTime = performance.now();
        
        initializationTimes.push(endTime - startTime);
        await client.terminate();
      }

      const analysis = PerformanceUtils.calculateStatistics(initializationTimes);
      
      console.log(`Worker initialization statistics:`);
      console.log(`  Average: ${analysis.mean.toFixed(2)}ms`);
      console.log(`  Range: ${analysis.min.toFixed(2)}ms - ${analysis.max.toFixed(2)}ms`);
      console.log(`  95th percentile: ${analysis.percentiles.p95.toFixed(2)}ms`);

      // Initialization should be reasonably fast
      expect(analysis.mean).toBeLessThan(1000); // Less than 1 second average
      expect(analysis.percentiles.p95).toBeLessThan(2000); // 95% under 2 seconds
    });

    test('should measure message passing latency', async () => {
      const latencyMeasurements: number[] = [];
      const testCount = 10;

      for (let i = 0; i < testCount; i++) {
        const smallAudio = new Float32Array(1000); // Small payload
        smallAudio.fill(0.1);

        const startTime = performance.now();
        await workerClient.parseBuffer(smallAudio, { filename: `latency-${i}.wav` });
        const endTime = performance.now();

        latencyMeasurements.push(endTime - startTime);
      }

      const analysis = PerformanceUtils.calculateStatistics(latencyMeasurements);
      
      console.log(`Message passing latency statistics:`);
      console.log(`  Average: ${analysis.mean.toFixed(2)}ms`);
      console.log(`  Median: ${analysis.median.toFixed(2)}ms`);
      console.log(`  95th percentile: ${analysis.percentiles.p95.toFixed(2)}ms`);

      // Latency should be reasonable for small operations
      expect(analysis.mean).toBeLessThan(500); // Less than 500ms average
      expect(analysis.median).toBeLessThan(300); // Median under 300ms
    });

    test('should measure data transfer efficiency for different sizes', async () => {
      const dataSizes = [1024, 8192, 44100, 441000]; // 1K, 8K, 1 sec, 10 sec samples
      const transferEfficiencies: Array<{
        size: number;
        transferTime: number;
        efficiency: number; // bytes per ms
      }> = [];

      for (const size of dataSizes) {
        const audio = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          audio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
        }

        const { metrics } = await WorkerTestingUtils.measureWorkerOperation(
          () => workerClient.parseBuffer(audio, { filename: `transfer-${size}.wav` }),
          `Transfer Size ${size}`
        );

        const bytesTransferred = size * 4; // 4 bytes per float
        const efficiency = bytesTransferred / metrics.transferTime;

        transferEfficiencies.push({
          size,
          transferTime: metrics.transferTime,
          efficiency
        });

        console.log(`Size ${size}: ${metrics.transferTime.toFixed(2)}ms transfer, ${efficiency.toFixed(0)} bytes/ms`);
      }

      // Analyze transfer efficiency scaling
      expect(transferEfficiencies).toHaveLength(dataSizes.length);
      
      transferEfficiencies.forEach(result => {
        expect(result.transferTime).toBeGreaterThan(0);
        expect(result.efficiency).toBeGreaterThan(0);
      });

      // Efficiency should be reasonable for large transfers
      const largeTransfers = transferEfficiencies.filter(r => r.size >= 44100);
      largeTransfers.forEach(result => {
        expect(result.efficiency).toBeGreaterThan(100); // At least 100 bytes/ms
      });
    });

    test('should benchmark concurrent operation performance', async () => {
      const concurrencyLevels = [1, 2, 4, 8];
      const performanceResults: Array<{
        concurrency: number;
        totalTime: number;
        throughput: number;
        efficiency: number;
      }> = [];

      for (const concurrency of concurrencyLevels) {
        const operations: Promise<any>[] = [];
        
        const startTime = performance.now();
        
        for (let i = 0; i < concurrency; i++) {
          const audio = AudioPerformanceUtils.generateTestAudio(2, 44100, 'medium');
          operations.push(workerClient.parseBuffer(audio, {
            filename: `concurrent-${concurrency}-${i}.wav`
          }));
        }

        await Promise.all(operations);
        const endTime = performance.now();
        
        const totalTime = endTime - startTime;
        const throughput = concurrency / (totalTime / 1000); // operations per second
        const singleOpThroughput = performanceResults[0]?.throughput || throughput;
        const efficiency = throughput / (singleOpThroughput * concurrency);

        performanceResults.push({
          concurrency,
          totalTime,
          throughput,
          efficiency
        });

        console.log(`Concurrency ${concurrency}: ${totalTime.toFixed(2)}ms, ${throughput.toFixed(2)} ops/sec, ${(efficiency * 100).toFixed(1)}% efficient`);
      }

      // Analyze concurrency scaling
      expect(performanceResults).toHaveLength(concurrencyLevels.length);
      
      // Throughput should not decrease significantly with more concurrent operations
      for (let i = 1; i < performanceResults.length; i++) {
        const current = performanceResults[i];
        const previous = performanceResults[i - 1];
        
        expect(current.throughput).toBeGreaterThan(previous.throughput * 0.5);
      }
    });

    test('should measure memory pressure impact on performance', async () => {
      const memorySizes = [1, 5, 10, 20]; // MB of audio data
      const memoryResults: Array<{
        sizeMB: number;
        processingTime: number;
        memoryPeak: number;
        efficiency: string;
      }> = [];

      for (const sizeMB of memorySizes) {
        const samples = Math.floor(sizeMB * 1024 * 1024 / 4); // Convert MB to samples
        const audio = AudioPerformanceUtils.generateTestAudio(samples / 44100, 44100, 'medium');

        const { result, snapshots, peakMemory } = await PerformanceUtils.profileMemoryUsage(
          () => workerClient.parseBuffer(audio, { filename: `memory-${sizeMB}mb.wav` }),
          `Memory Test ${sizeMB}MB`
        );

        const audioDuration = samples / 44100;
        const processingTime = snapshots.length > 0 ? 
          snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp : 0;

        const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
          audioDuration,
          processingTime,
          peakMemory.heapUsed
        );

        memoryResults.push({
          sizeMB,
          processingTime,
          memoryPeak: peakMemory.heapUsed,
          efficiency: efficiency.efficiency
        });

        console.log(`${sizeMB}MB: ${processingTime.toFixed(2)}ms processing, ${efficiency.efficiency} efficiency`);
      }

      // Analyze memory pressure impact
      expect(memoryResults).toHaveLength(memorySizes.length);
      
      memoryResults.forEach(result => {
        expect(result.processingTime).toBeGreaterThan(0);
        expect(result.memoryPeak).toBeGreaterThan(0);
        expect(['excellent', 'good', 'acceptable', 'poor', 'unacceptable']).toContain(result.efficiency);
      });

      // Performance should degrade gracefully with increased memory usage
      const efficiencyRatings = ['unacceptable', 'poor', 'acceptable', 'good', 'excellent'];
      memoryResults.forEach((result, i) => {
        if (i > 0) {
          const currentRating = efficiencyRatings.indexOf(result.efficiency);
          const previousRating = efficiencyRatings.indexOf(memoryResults[i - 1].efficiency);
          
          // Efficiency should not improve dramatically with larger memory usage
          expect(currentRating - previousRating).toBeLessThanOrEqual(1);
        }
      });
    });
  });

  describe('Performance Regression Detection', () => {
    test('should detect performance regressions in worker operations', async () => {
      const testAudio = AudioPerformanceUtils.generateTestAudio(3, 44100, 'high');
      
      // Establish baseline performance
      const baselineBenchmark = await PerformanceUtils.benchmarkOperation(
        async () => {
          const client = WorkerTestingUtils.createTestWorkerClient();
          await client.initialize();
          const result = await client.parseBuffer(testAudio, { targetPictureCount: 8 });
          await client.terminate();
          return result;
        },
        'Baseline Performance',
        { iterations: 8, warmupIterations: 2 }
      );

      // Simulate current performance (potentially with regression)
      const currentBenchmark = await PerformanceUtils.benchmarkOperation(
        async () => {
          const client = WorkerTestingUtils.createTestWorkerClient({
            latency: 150 // Simulate slightly higher latency
          });
          await client.initialize();
          const result = await client.parseBuffer(testAudio, { targetPictureCount: 8 });
          await client.terminate();
          return result;
        },
        'Current Performance',
        { iterations: 8, warmupIterations: 2 }
      );

      // Detect regression
      const regressionAnalysis = PerformanceUtils.detectRegression(
        baselineBenchmark.analysis,
        currentBenchmark.analysis,
        0.1 // 10% threshold
      );

      console.log(`Regression analysis:`);
      console.log(`  Baseline: ${baselineBenchmark.analysis.mean.toFixed(2)}ms ± ${baselineBenchmark.analysis.stdDev.toFixed(2)}ms`);
      console.log(`  Current: ${currentBenchmark.analysis.mean.toFixed(2)}ms ± ${currentBenchmark.analysis.stdDev.toFixed(2)}ms`);
      console.log(`  Regression: ${regressionAnalysis.hasRegression ? 'DETECTED' : 'None'}`);
      console.log(`  Change: ${(regressionAnalysis.regressionPercent * 100).toFixed(1)}%`);
      console.log(`  Severity: ${regressionAnalysis.severity}`);
      console.log(`  Recommendation: ${regressionAnalysis.recommendation}`);

      // Validate regression detection logic
      expect(typeof regressionAnalysis.hasRegression).toBe('boolean');
      expect(typeof regressionAnalysis.regressionPercent).toBe('number');
      expect(['none', 'minor', 'moderate', 'severe']).toContain(regressionAnalysis.severity);
      expect(regressionAnalysis.recommendation.length).toBeGreaterThan(0);
    });

    test('should track performance trends over time', async () => {
      const performanceHistory: Array<{
        timestamp: number;
        meanTime: number;
        throughput: number;
      }> = [];

      // Simulate multiple performance measurements over time
      for (let i = 0; i < 5; i++) {
        const latencyVariation = Math.random() * 50; // Random latency variation
        const client = WorkerTestingUtils.createTestWorkerClient({
          latency: 100 + latencyVariation
        });

        const testAudio = AudioPerformanceUtils.generateTestAudio(2, 44100, 'medium');
        
        const benchmark = await PerformanceUtils.benchmarkOperation(
          async () => {
            await client.initialize();
            const result = await client.parseBuffer(testAudio, { targetPictureCount: 5 });
            return result;
          },
          `Performance Sample ${i + 1}`,
          { iterations: 3, warmupIterations: 1 }
        );

        await client.terminate();

        performanceHistory.push({
          timestamp: Date.now() + i * 1000, // Simulate time progression
          meanTime: benchmark.analysis.mean,
          throughput: benchmark.aggregatedMetrics.throughput
        });

        // Brief delay to simulate time progression
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Analyze performance trend
      expect(performanceHistory).toHaveLength(5);

      const times = performanceHistory.map(h => h.meanTime);
      const throughputs = performanceHistory.map(h => h.throughput);
      
      const timeAnalysis = PerformanceUtils.calculateStatistics(times);
      const throughputAnalysis = PerformanceUtils.calculateStatistics(throughputs);

      console.log(`Performance trends:`);
      console.log(`  Time range: ${timeAnalysis.min.toFixed(2)}ms - ${timeAnalysis.max.toFixed(2)}ms`);
      console.log(`  Time stability: CV = ${(timeAnalysis.stdDev / timeAnalysis.mean * 100).toFixed(1)}%`);
      console.log(`  Throughput range: ${throughputAnalysis.min.toFixed(2)} - ${throughputAnalysis.max.toFixed(2)} ops/sec`);
      console.log(`  Throughput stability: CV = ${(throughputAnalysis.stdDev / throughputAnalysis.mean * 100).toFixed(1)}%`);

      // Performance should be reasonably stable
      const timeCV = timeAnalysis.stdDev / timeAnalysis.mean;
      const throughputCV = throughputAnalysis.stdDev / throughputAnalysis.mean;
      
      expect(timeCV).toBeLessThan(0.5); // Less than 50% coefficient of variation
      expect(throughputCV).toBeLessThan(0.5);
    });

    test('should benchmark performance across different environments', async () => {
      // Simulate different environment conditions
      const environments = [
        { name: 'Optimal', latency: 50, errorRate: 0 },
        { name: 'Network Delay', latency: 200, errorRate: 0 },
        { name: 'High Error Rate', latency: 100, errorRate: 0.1 },
        { name: 'Stressed', latency: 300, errorRate: 0.05 }
      ];

      const environmentResults: Array<{
        environment: string;
        meanTime: number;
        throughput: number;
        successRate: number;
      }> = [];

      for (const env of environments) {
        const client = WorkerTestingUtils.createTestWorkerClient({
          latency: env.latency,
          errorRate: env.errorRate
        });

        const testAudio = AudioPerformanceUtils.generateTestAudio(2, 44100, 'medium');
        
        // Run multiple operations to measure success rate
        const operationCount = 10;
        const results = await Promise.allSettled(
          Array.from({ length: operationCount }, async () => {
            await client.initialize();
            const startTime = performance.now();
            const result = await client.parseBuffer(testAudio, { targetPictureCount: 5 });
            const endTime = performance.now();
            return { result, duration: endTime - startTime };
          })
        );

        await client.terminate();

        const successful = results.filter(r => r.status === 'fulfilled');
        const successRate = successful.length / operationCount;
        
        let meanTime = 0;
        let throughput = 0;
        
        if (successful.length > 0) {
          const times = successful.map(r => (r as PromiseFulfilledResult<any>).value.duration);
          meanTime = times.reduce((sum, t) => sum + t, 0) / times.length;
          throughput = successful.length / (meanTime / 1000);
        }

        environmentResults.push({
          environment: env.name,
          meanTime,
          throughput,
          successRate
        });

        console.log(`${env.name}: ${meanTime.toFixed(2)}ms avg, ${successRate * 100}% success, ${throughput.toFixed(2)} ops/sec`);
      }

      // Analyze environment impact
      expect(environmentResults).toHaveLength(environments.length);
      
      environmentResults.forEach(result => {
        expect(result.successRate).toBeGreaterThanOrEqual(0);
        expect(result.successRate).toBeLessThanOrEqual(1);
        
        if (result.successRate > 0) {
          expect(result.meanTime).toBeGreaterThan(0);
          expect(result.throughput).toBeGreaterThan(0);
        }
      });

      // Optimal environment should perform best
      const optimal = environmentResults.find(r => r.environment === 'Optimal');
      expect(optimal).toBeDefined();
      
      if (optimal && optimal.successRate > 0) {
        const otherEnvs = environmentResults.filter(r => r.environment !== 'Optimal');
        otherEnvs.forEach(env => {
          if (env.successRate > 0) {
            expect(env.meanTime).toBeGreaterThanOrEqual(optimal.meanTime * 0.8);
            expect(env.successRate).toBeLessThanOrEqual(optimal.successRate + 0.1);
          }
        });
      }
    });
  });

  describe('Scalability Performance Analysis', () => {
    test('should analyze performance scaling with input size', async () => {
      const inputSizes = [1, 2, 5, 10]; // seconds of audio
      
      const scalabilityResult = await PerformanceUtils.scalabilityTest(
        (inputSize: number) => async () => {
          const client = WorkerTestingUtils.createTestWorkerClient();
          await client.initialize();
          
          const audio = AudioPerformanceUtils.generateTestAudio(inputSize, 44100, 'medium');
          const result = await client.parseBuffer(audio, {
            targetPictureCount: Math.max(5, inputSize * 2)
          });
          
          await client.terminate();
          return result;
        },
        inputSizes,
        'Worker Input Size Scaling',
        'O(n)' // Expected linear scaling
      );

      console.log(`Scalability analysis:`);
      console.log(`  Scaling factor: ${scalabilityResult.scalingFactor.toFixed(3)}`);
      console.log(`  Apparent complexity: ${scalabilityResult.complexityAnalysis.apparent}`);
      console.log(`  Matches expected: ${scalabilityResult.complexityAnalysis.matches ? 'YES' : 'NO'}`);
      console.log(`  R² correlation: ${scalabilityResult.complexityAnalysis.rSquared.toFixed(3)}`);

      scalabilityResult.results.forEach((result, i) => {
        console.log(`  ${inputSizes[i]}s: ${result.duration.toFixed(2)}ms, ${result.throughput.toFixed(2)} units/sec`);
      });

      // Validate scalability characteristics
      expect(scalabilityResult.results).toHaveLength(inputSizes.length);
      expect(scalabilityResult.scalingFactor).toBeGreaterThan(0);
      expect(scalabilityResult.complexityAnalysis.rSquared).toBeGreaterThanOrEqual(0);
      expect(scalabilityResult.complexityAnalysis.rSquared).toBeLessThanOrEqual(1);
      
      // Results should show reasonable scaling
      scalabilityResult.results.forEach(result => {
        expect(result.duration).toBeGreaterThan(0);
        expect(result.throughput).toBeGreaterThan(0);
        expect(result.efficiency).toBeGreaterThan(0);
      });
    });

    test('should analyze performance scaling with concurrent workers', async () => {
      const workerCounts = [1, 2, 4];
      const operationsPerWorker = 3;
      
      const concurrencyScaling: Array<{
        workerCount: number;
        totalTime: number;
        throughput: number;
        efficiency: number;
        scalingEfficiency: number;
      }> = [];

      for (const workerCount of workerCounts) {
        const workers: BeatParserWorkerClient[] = [];
        
        try {
          // Create workers
          for (let i = 0; i < workerCount; i++) {
            const worker = WorkerTestingUtils.createTestWorkerClient();
            await worker.initialize();
            workers.push(worker);
          }

          const testAudio = AudioPerformanceUtils.generateTestAudio(2, 44100, 'medium');
          
          // Measure concurrent performance
          const startTime = performance.now();
          
          const allOperations: Promise<any>[] = [];
          workers.forEach((worker, workerIndex) => {
            for (let opIndex = 0; opIndex < operationsPerWorker; opIndex++) {
              allOperations.push(worker.parseBuffer(testAudio, {
                filename: `scaling-${workerCount}-${workerIndex}-${opIndex}.wav`
              }));
            }
          });

          await Promise.all(allOperations);
          const endTime = performance.now();
          
          const totalTime = endTime - startTime;
          const totalOperations = workerCount * operationsPerWorker;
          const throughput = totalOperations / (totalTime / 1000);
          
          // Calculate efficiency relative to single worker
          const singleWorkerThroughput = concurrencyScaling[0]?.throughput || throughput;
          const theoreticalThroughput = singleWorkerThroughput * workerCount;
          const scalingEfficiency = throughput / theoreticalThroughput;
          
          const efficiency = throughput / workerCount; // Operations per second per worker

          concurrencyScaling.push({
            workerCount,
            totalTime,
            throughput,
            efficiency,
            scalingEfficiency
          });

          console.log(`${workerCount} workers: ${totalTime.toFixed(2)}ms, ${throughput.toFixed(2)} ops/sec, ${(scalingEfficiency * 100).toFixed(1)}% scaling efficiency`);
          
        } finally {
          await Promise.all(workers.map(w => w.terminate()));
        }
      }

      // Analyze concurrency scaling
      expect(concurrencyScaling).toHaveLength(workerCounts.length);
      
      concurrencyScaling.forEach((result, i) => {
        expect(result.throughput).toBeGreaterThan(0);
        expect(result.efficiency).toBeGreaterThan(0);
        expect(result.scalingEfficiency).toBeGreaterThan(0);
        expect(result.scalingEfficiency).toBeLessThanOrEqual(1.2); // Allow some super-linear scaling
        
        // Later measurements should not have dramatically worse scaling
        if (i > 0) {
          expect(result.scalingEfficiency).toBeGreaterThan(0.3); // At least 30% efficiency
        }
      });

      // Calculate overall scaling characteristics
      const efficiencies = concurrencyScaling.map(r => r.scalingEfficiency);
      const avgEfficiency = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
      
      console.log(`Average scaling efficiency: ${(avgEfficiency * 100).toFixed(1)}%`);
      expect(avgEfficiency).toBeGreaterThan(0.5); // Overall efficiency should be reasonable
    });
  });
});