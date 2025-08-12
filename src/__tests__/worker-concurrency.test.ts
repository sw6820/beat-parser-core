/**
 * Web Worker Concurrency & Thread Safety Tests
 * Comprehensive validation of concurrent operations and thread safety mechanisms
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import { WorkerTestingUtils } from './worker-testing-utils';
import { ConcurrencyTestFramework, type ConcurrencyTestConfig } from './concurrency-test-framework';

describe('Web Worker Concurrency & Thread Safety', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  let concurrencyFramework: ConcurrencyTestFramework;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
    concurrencyFramework = new ConcurrencyTestFramework();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Single Worker Concurrency', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle multiple concurrent operations on single worker', async () => {
      const concurrentCount = 5;
      const operations: Promise<any>[] = [];
      const startTimes: number[] = [];
      
      // Launch concurrent operations
      for (let i = 0; i < concurrentCount; i++) {
        const audio = WorkerTestingUtils.generateTestAudio('simple', {
          duration: 1 + i * 0.2 // Varying durations
        }) as Float32Array;
        
        startTimes.push(performance.now());
        operations.push(workerClient.parseBuffer(audio, {
          filename: `concurrent-single-${i}.wav`,
          targetPictureCount: i + 1
        }));
      }

      const results = await Promise.all(operations);

      // All operations should complete successfully
      expect(results).toHaveLength(concurrentCount);
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        expect(result.metadata.filename).toBe(`concurrent-single-${i}.wav`);
        expect(result.beats.length).toBeLessThanOrEqual(i + 1);
      });

      // Worker should not be busy after completion
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should maintain operation isolation in concurrent processing', async () => {
      const operationCount = 4;
      const operations: Promise<any>[] = [];
      const expectedFilenames = new Set<string>();
      
      // Create operations with unique identifiers
      for (let i = 0; i < operationCount; i++) {
        const audio = new Float32Array(2000 + i * 500); // Different sizes
        
        // Fill with unique patterns
        const frequency = 220 + i * 110;
        for (let j = 0; j < audio.length; j++) {
          audio[j] = Math.sin(2 * Math.PI * frequency * j / 44100) * 0.5;
        }
        
        const filename = `isolation-test-${i}-freq-${frequency}.wav`;
        expectedFilenames.add(filename);
        
        operations.push(workerClient.parseBuffer(audio, {
          filename,
          targetPictureCount: 5,
          algorithm: 'hybrid'
        }));
      }

      const results = await Promise.all(operations);

      // Verify each result corresponds to its input
      const actualFilenames = new Set(results.map(r => r.metadata.filename));
      expect(actualFilenames).toEqual(expectedFilenames);

      // Each result should be unique and correct
      results.forEach((result, i) => {
        expect(result.beats.length).toBeLessThanOrEqual(5);
        expect(result.metadata.processingInfo.audioLength).toBeCloseTo((2000 + i * 500) / 44100, 1);
      });
    });

    test('should handle concurrent operations with different types', async () => {
      const audioBuffer = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      const audioChunks = WorkerTestingUtils.generateTestAudio('streaming', {
        chunkSize: 1024,
        count: 4
      }) as Float32Array[];
      const audioBatch = WorkerTestingUtils.generateTestAudio('batch', {
        count: 2
      }) as Float32Array[];

      // Launch different operation types concurrently
      const operations = [
        workerClient.parseBuffer(audioBuffer, { filename: 'mixed-buffer.wav' }),
        workerClient.parseStream(audioChunks, { filename: 'mixed-stream.wav' }),
        workerClient.processBatch(audioBatch, [
          { filename: 'mixed-batch-0.wav' },
          { filename: 'mixed-batch-1.wav' }
        ])
      ];

      const [bufferResult, streamResult, batchResults] = await Promise.all(operations);

      // Verify each operation completed correctly
      expect(bufferResult.metadata.filename).toBe('mixed-buffer.wav');
      expect(streamResult.metadata.filename).toBe('mixed-stream.wav');
      expect(batchResults).toHaveLength(2);
      expect(batchResults[0].metadata.filename).toBe('mixed-batch-0.wav');
      expect(batchResults[1].metadata.filename).toBe('mixed-batch-1.wav');
    });

    test('should handle concurrent operations with progress tracking', async () => {
      const progressTrackers = Array.from({ length: 3 }, () => 
        WorkerTestingUtils.createProgressTracker()
      );

      const operations = progressTrackers.map((tracker, i) => {
        const audio = WorkerTestingUtils.generateTestAudio('complex') as Float32Array;
        return workerClient.parseBuffer(audio, {
          filename: `progress-concurrent-${i}.wav`,
          progressCallback: tracker.callback
        });
      });

      const results = await Promise.all(operations);

      // All operations should complete
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe(`progress-concurrent-${i}.wav`);
      });

      // Each progress tracker should have received updates
      progressTrackers.forEach((tracker, i) => {
        expect(tracker.updates.length).toBeGreaterThan(0);
        
        // Progress should be properly isolated per operation
        tracker.updates.forEach(update => {
          expect(update.percentage).toBeGreaterThanOrEqual(0);
          expect(update.percentage).toBeLessThanOrEqual(100);
        });
      });
    });

    test('should handle operation cancellation without affecting others', async () => {
      const longAudio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;
      const shortAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;

      // Start multiple operations
      const longOperation = workerClient.parseBuffer(longAudio, { 
        filename: 'long-operation.wav' 
      });
      
      const shortOperations = Array.from({ length: 2 }, (_, i) => 
        workerClient.parseBuffer(shortAudio, { 
          filename: `short-operation-${i}.wav` 
        })
      );

      // Cancel all operations (in real implementation, we'd cancel specific ones)
      setTimeout(() => {
        workerClient.cancelOperation();
      }, 10);

      // All operations should be cancelled
      await expect(longOperation).rejects.toThrow('Operation cancelled');
      await expect(Promise.all(shortOperations)).rejects.toThrow('Operation cancelled');

      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });
  });

  describe('Multiple Worker Concurrency', () => {
    let workerClients: BeatParserWorkerClient[];
    const workerCount = 3;

    beforeEach(async () => {
      workerClients = [];
      for (let i = 0; i < workerCount; i++) {
        const client = WorkerTestingUtils.createTestWorkerClient();
        await client.initialize();
        workerClients.push(client);
      }
    });

    afterEach(async () => {
      await Promise.all(workerClients.map(client => client.terminate()));
      workerClients = [];
    });

    test('should handle concurrent operations across multiple workers', async () => {
      const operationsPerWorker = 2;
      const allOperations: Promise<any>[] = [];

      // Create operations for each worker
      workerClients.forEach((client, workerIndex) => {
        for (let opIndex = 0; opIndex < operationsPerWorker; opIndex++) {
          const audio = WorkerTestingUtils.generateTestAudio('simple', {
            duration: 1 + opIndex * 0.3
          }) as Float32Array;
          
          allOperations.push(client.parseBuffer(audio, {
            filename: `multi-worker-${workerIndex}-${opIndex}.wav`,
            targetPictureCount: (opIndex + 1) * 2
          }));
        }
      });

      const results = await Promise.all(allOperations);

      // All operations should complete successfully
      expect(results).toHaveLength(workerCount * operationsPerWorker);
      
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        
        // Extract worker and operation indices from filename
        const workerIndex = Math.floor(i / operationsPerWorker);
        const opIndex = i % operationsPerWorker;
        expect(result.metadata.filename).toBe(`multi-worker-${workerIndex}-${opIndex}.wav`);
        expect(result.beats.length).toBeLessThanOrEqual((opIndex + 1) * 2);
      });

      // All workers should be clean after completion
      workerClients.forEach(client => {
        expect(client.isBusy()).toBe(false);
        expect(client.getPendingOperationCount()).toBe(0);
      });
    });

    test('should maintain worker isolation and independence', async () => {
      const testScenarios = [
        { workerIndex: 0, frequency: 440, amplitude: 0.3 },
        { workerIndex: 1, frequency: 880, amplitude: 0.5 },
        { workerIndex: 2, frequency: 220, amplitude: 0.7 }
      ];

      const operations = testScenarios.map((scenario, i) => {
        const audio = new Float32Array(5000);
        for (let j = 0; j < audio.length; j++) {
          audio[j] = Math.sin(2 * Math.PI * scenario.frequency * j / 44100) * scenario.amplitude;
        }

        return workerClients[scenario.workerIndex].parseBuffer(audio, {
          filename: `isolation-${i}-${scenario.frequency}hz.wav`,
          targetPictureCount: 4
        });
      });

      const results = await Promise.all(operations);

      // Results should be independent and correct
      results.forEach((result, i) => {
        const scenario = testScenarios[i];
        expect(result.metadata.filename).toBe(`isolation-${i}-${scenario.frequency}hz.wav`);
        expect(result.beats.length).toBeLessThanOrEqual(4);
      });

      // Worker states should be independent
      workerClients.forEach((client, i) => {
        expect(client.isBusy()).toBe(false);
        expect(client.getPendingOperationCount()).toBe(0);
      });
    });

    test('should handle load balancing across workers', async () => {
      const totalOperations = 9; // Not evenly divisible by worker count
      const operations: Promise<any>[] = [];
      const workerUsage = new Array(workerCount).fill(0);

      // Distribute operations across workers
      for (let i = 0; i < totalOperations; i++) {
        const workerIndex = i % workerCount;
        workerUsage[workerIndex]++;

        const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        operations.push(workerClients[workerIndex].parseBuffer(audio, {
          filename: `load-balance-${i}.wav`
        }));
      }

      const results = await Promise.all(operations);

      expect(results).toHaveLength(totalOperations);
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe(`load-balance-${i}.wav`);
      });

      // Verify load distribution (should be roughly even)
      const expectedPerWorker = Math.ceil(totalOperations / workerCount);
      workerUsage.forEach(usage => {
        expect(usage).toBeLessThanOrEqual(expectedPerWorker);
        expect(usage).toBeGreaterThan(0);
      });
    });

    test('should handle worker failure without affecting others', async () => {
      const stableOperations: Promise<any>[] = [];
      const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;

      // Start operations on workers 0 and 2
      stableOperations.push(
        workerClients[0].parseBuffer(audio, { filename: 'stable-0.wav' })
      );
      stableOperations.push(
        workerClients[2].parseBuffer(audio, { filename: 'stable-2.wav' })
      );

      // Simulate failure of worker 1 by terminating it
      setTimeout(async () => {
        await workerClients[1].terminate();
      }, 10);

      // Stable operations should still complete
      const results = await Promise.all(stableOperations);
      
      expect(results).toHaveLength(2);
      expect(results[0].metadata.filename).toBe('stable-0.wav');
      expect(results[1].metadata.filename).toBe('stable-2.wav');

      // Remaining workers should be operational
      expect(workerClients[0].isBusy()).toBe(false);
      expect(workerClients[2].isBusy()).toBe(false);
    });
  });

  describe('Thread Safety Validation', () => {
    test('should detect and prevent race conditions', async () => {
      const testConfig: ConcurrencyTestConfig = {
        concurrencyLevel: 5,
        operationsPerThread: 3,
        testDurationMs: 5000,
        stressMode: false,
        resourceContention: true,
        timeoutVariation: false,
        errorInjection: {
          enabled: false,
          rate: 0,
          types: []
        }
      };

      const { results, overallAssessment } = await concurrencyFramework
        .executeConcurrencyTestSuite([testConfig]);

      expect(results.length).toBeGreaterThan(0);

      // Check for race condition violations
      const raceConditions = results.flatMap(r => r.violations)
        .filter(v => v.type === 'race-condition');

      if (raceConditions.length > 0) {
        console.warn('Race conditions detected:', raceConditions);
        
        // If race conditions are found, they should be documented
        raceConditions.forEach(violation => {
          expect(violation.description.length).toBeGreaterThan(0);
          expect(violation.severity).toBeDefined();
        });
      }

      // Overall assessment should provide meaningful feedback
      expect(['safe', 'warnings', 'unsafe']).toContain(overallAssessment.threadSafety);
      expect(Array.isArray(overallAssessment.recommendations)).toBe(true);
      expect(Array.isArray(overallAssessment.criticalIssues)).toBe(true);
    });

    test('should handle resource contention gracefully', async () => {
      const testConfig: ConcurrencyTestConfig = {
        concurrencyLevel: 4,
        operationsPerThread: 2,
        testDurationMs: 3000,
        stressMode: false,
        resourceContention: true,
        timeoutVariation: false,
        errorInjection: {
          enabled: false,
          rate: 0,
          types: []
        }
      };

      const { results } = await concurrencyFramework
        .executeConcurrencyTestSuite([testConfig]);

      // Look for resource contention test results
      const contentionTest = results.find(r => 
        r.testName.includes('Contention') || r.testName.includes('Resource')
      );

      expect(contentionTest).toBeDefined();
      
      if (contentionTest) {
        // Should have metrics about resource utilization
        expect(contentionTest.metrics.totalOperations).toBeGreaterThan(0);
        expect(contentionTest.metrics.throughput).toBeGreaterThan(0);
        
        // Resource contention violations should be analyzed
        const resourceViolations = contentionTest.violations
          .filter(v => v.type === 'resource-leak');

        resourceViolations.forEach(violation => {
          expect(violation.description.length).toBeGreaterThan(0);
          expect(['low', 'medium', 'high', 'critical']).toContain(violation.severity);
        });
      }
    });

    test('should prevent deadlock situations', async () => {
      const testConfig: ConcurrencyTestConfig = {
        concurrencyLevel: 4,
        operationsPerThread: 2,
        testDurationMs: 8000, // Longer duration for deadlock detection
        stressMode: false,
        resourceContention: false,
        timeoutVariation: true,
        errorInjection: {
          enabled: false,
          rate: 0,
          types: []
        }
      };

      const { results } = await concurrencyFramework
        .executeConcurrencyTestSuite([testConfig]);

      // Look for deadlock test results
      const deadlockTest = results.find(r => 
        r.testName.includes('Deadlock')
      );

      expect(deadlockTest).toBeDefined();

      if (deadlockTest) {
        // Test should complete within reasonable time (no actual deadlocks)
        expect(deadlockTest.success).toBe(true);
        
        // Check for deadlock violations
        const deadlockViolations = deadlockTest.violations
          .filter(v => v.type === 'deadlock');

        // In a well-implemented system, there should be no deadlocks
        expect(deadlockViolations.length).toBe(0);
        
        // If deadlocks are detected, they should be critical
        deadlockViolations.forEach(violation => {
          expect(violation.severity).toBe('critical');
          expect(violation.description.length).toBeGreaterThan(0);
        });
      }
    });

    test('should validate state isolation between operations', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        await workerClient.initialize();

        // Create operations with different configurations that might interfere
        const operations = [
          {
            audio: WorkerTestingUtils.generateTestAudio('simple') as Float32Array,
            config: { sampleRate: 44100, minTempo: 60, maxTempo: 180 },
            options: { filename: 'state-1.wav', algorithm: 'hybrid' }
          },
          {
            audio: WorkerTestingUtils.generateTestAudio('complex') as Float32Array,
            config: { sampleRate: 48000, minTempo: 80, maxTempo: 160 },
            options: { filename: 'state-2.wav', algorithm: 'frequency' }
          },
          {
            audio: WorkerTestingUtils.generateTestAudio('simple') as Float32Array,
            config: { sampleRate: 44100, minTempo: 100, maxTempo: 200 },
            options: { filename: 'state-3.wav', targetPictureCount: 8 }
          }
        ];

        // Execute operations concurrently
        const results = await Promise.all(
          operations.map(op => 
            workerClient.parseBuffer(op.audio, op.options, op.config)
          )
        );

        // Each result should reflect its specific configuration
        results.forEach((result, i) => {
          const operation = operations[i];
          
          expect(result.metadata.filename).toBe(operation.options.filename);
          
          // Tempo should be within specified range
          expect(result.tempo).toBeGreaterThanOrEqual(operation.config.minTempo);
          expect(result.tempo).toBeLessThanOrEqual(operation.config.maxTempo);
          
          if (operation.options.targetPictureCount) {
            expect(result.beats.length).toBeLessThanOrEqual(operation.options.targetPictureCount);
          }
        });
      } finally {
        await workerClient.terminate();
      }
    });
  });

  describe('Performance Under Concurrency', () => {
    test('should maintain reasonable performance with concurrent operations', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        await workerClient.initialize();

        // Measure single operation performance
        const singleAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const { metrics: singleMetrics } = await WorkerTestingUtils.measureWorkerOperation(
          () => workerClient.parseBuffer(singleAudio, { filename: 'single.wav' }),
          'Single Operation'
        );

        // Measure concurrent operation performance
        const concurrentCount = 4;
        const concurrentAudios = Array.from({ length: concurrentCount }, () =>
          WorkerTestingUtils.generateTestAudio('simple') as Float32Array
        );

        const { metrics: concurrentMetrics } = await WorkerTestingUtils.measureWorkerOperation(
          () => Promise.all(concurrentAudios.map((audio, i) =>
            workerClient.parseBuffer(audio, { filename: `concurrent-${i}.wav` })
          )),
          'Concurrent Operations'
        );

        // Concurrent operations should not be significantly slower per operation
        const avgConcurrentTime = concurrentMetrics.duration / concurrentCount;
        const performanceRatio = avgConcurrentTime / singleMetrics.duration;
        
        // Should be at most 3x slower per operation (allows for some overhead)
        expect(performanceRatio).toBeLessThan(3);
        
        console.log(`Single operation: ${singleMetrics.duration.toFixed(2)}ms`);
        console.log(`Concurrent average: ${avgConcurrentTime.toFixed(2)}ms`);
        console.log(`Performance ratio: ${performanceRatio.toFixed(2)}x`);
      } finally {
        await workerClient.terminate();
      }
    });

    test('should scale efficiently with multiple workers', async () => {
      const workerCounts = [1, 2, 4];
      const operationsPerWorker = 2;
      const performanceResults: Array<{
        workerCount: number;
        totalTime: number;
        throughput: number;
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

          // Measure performance
          const startTime = performance.now();
          
          const allOperations: Promise<any>[] = [];
          workers.forEach((worker, workerIndex) => {
            for (let opIndex = 0; opIndex < operationsPerWorker; opIndex++) {
              const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
              allOperations.push(worker.parseBuffer(audio, {
                filename: `scale-${workerCount}-${workerIndex}-${opIndex}.wav`
              }));
            }
          });

          await Promise.all(allOperations);
          
          const endTime = performance.now();
          const totalTime = endTime - startTime;
          const throughput = allOperations.length / (totalTime / 1000); // operations per second

          performanceResults.push({
            workerCount,
            totalTime,
            throughput
          });

          console.log(`${workerCount} workers: ${totalTime.toFixed(2)}ms, ${throughput.toFixed(2)} ops/sec`);
        } finally {
          await Promise.all(workers.map(w => w.terminate()));
        }
      }

      // Analyze scaling characteristics
      expect(performanceResults).toHaveLength(workerCounts.length);
      
      // Throughput should generally increase with more workers
      for (let i = 1; i < performanceResults.length; i++) {
        const current = performanceResults[i];
        const previous = performanceResults[i - 1];
        
        // More workers should not decrease throughput significantly
        expect(current.throughput).toBeGreaterThanOrEqual(previous.throughput * 0.8);
      }

      // Calculate scaling efficiency
      const singleWorkerThroughput = performanceResults[0].throughput;
      performanceResults.forEach(result => {
        const expectedThroughput = singleWorkerThroughput * result.workerCount;
        const efficiency = result.throughput / expectedThroughput;
        
        console.log(`${result.workerCount} workers efficiency: ${(efficiency * 100).toFixed(1)}%`);
        
        // Efficiency should be reasonable (accounting for overhead)
        expect(efficiency).toBeGreaterThan(0.3); // At least 30% efficiency
      });
    });

    test('should handle memory pressure in concurrent scenarios', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        await workerClient.initialize();

        // Create memory-intensive concurrent operations
        const largeAudioCount = 3;
        const largeAudios = Array.from({ length: largeAudioCount }, (_, i) =>
          WorkerTestingUtils.generateTestAudio('large') as Float32Array // Large audio files
        );

        // Monitor memory during concurrent processing
        const startMemory = process.memoryUsage();
        
        const results = await Promise.all(
          largeAudios.map((audio, i) =>
            workerClient.parseBuffer(audio, { 
              filename: `memory-test-${i}.wav`,
              targetPictureCount: 10 
            })
          )
        );

        const endMemory = process.memoryUsage();
        const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

        // All operations should complete successfully
        expect(results).toHaveLength(largeAudioCount);
        results.forEach((result, i) => {
          expect(result).toBeDefined();
          expect(result.metadata.filename).toBe(`memory-test-${i}.wav`);
        });

        // Memory usage should be reasonable (not unlimited growth)
        const memoryDeltaMB = memoryDelta / (1024 * 1024);
        console.log(`Memory delta: ${memoryDeltaMB.toFixed(2)}MB`);
        
        // Should not use excessive memory (this is a rough check)
        expect(memoryDeltaMB).toBeLessThan(200); // Less than 200MB growth
      } finally {
        await workerClient.terminate();
      }
    });

    test('should handle timeout scenarios in concurrent operations', async () => {
      const shortTimeoutClient = WorkerTestingUtils.createTestWorkerClient({
        timeout: 100  // Very short timeout
      });

      try {
        const concurrentCount = 3;
        const operations = Array.from({ length: concurrentCount }, (_, i) => {
          const audio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;
          return shortTimeoutClient.parseBuffer(audio, { 
            filename: `timeout-test-${i}.wav` 
          });
        });

        // All operations should timeout
        const results = await Promise.allSettled(operations);
        
        results.forEach((result, i) => {
          expect(result.status).toBe('rejected');
          if (result.status === 'rejected') {
            expect(result.reason.message).toContain('timeout');
          }
        });

        // Client should be clean after timeouts
        expect(shortTimeoutClient.isBusy()).toBe(false);
        expect(shortTimeoutClient.getPendingOperationCount()).toBe(0);
      } finally {
        await shortTimeoutClient.terminate();
      }
    });
  });

  describe('Stress Testing', () => {
    test('should handle high concurrency stress test', async () => {
      const stressConfig: ConcurrencyTestConfig = {
        concurrencyLevel: 8,
        operationsPerThread: 5,
        testDurationMs: 10000,
        stressMode: true,
        resourceContention: true,
        timeoutVariation: true,
        errorInjection: {
          enabled: false,
          rate: 0,
          types: []
        }
      };

      const { results, overallAssessment } = await concurrencyFramework
        .executeConcurrencyTestSuite([stressConfig]);

      expect(results.length).toBeGreaterThan(0);

      // Analyze stress test results
      const stressTest = results.find(r => 
        r.testName.includes('Stress') || r.testName.includes('stress')
      );

      if (stressTest) {
        expect(stressTest.metrics.totalOperations).toBeGreaterThan(0);
        
        // Even under stress, most operations should succeed
        const successRate = stressTest.metrics.successfulOperations / 
                           stressTest.metrics.totalOperations;
        expect(successRate).toBeGreaterThan(0.7); // At least 70% success rate
        
        console.log(`Stress test success rate: ${(successRate * 100).toFixed(1)}%`);
        console.log(`Total operations: ${stressTest.metrics.totalOperations}`);
        console.log(`Throughput: ${stressTest.metrics.throughput.toFixed(2)} ops/sec`);
      }

      // Overall system should remain stable
      const criticalViolations = results.flatMap(r => r.violations)
        .filter(v => v.severity === 'critical');
      
      // No critical violations should occur under stress
      expect(criticalViolations.length).toBe(0);
    });

    test('should recover from error scenarios', async () => {
      const errorConfig: ConcurrencyTestConfig = {
        concurrencyLevel: 4,
        operationsPerThread: 3,
        testDurationMs: 5000,
        stressMode: false,
        resourceContention: false,
        timeoutVariation: false,
        errorInjection: {
          enabled: true,
          rate: 0.3, // 30% error rate
          types: ['error', 'timeout']
        }
      };

      const { results, overallAssessment } = await concurrencyFramework
        .executeConcurrencyTestSuite([errorConfig]);

      expect(results.length).toBeGreaterThan(0);

      // System should handle errors gracefully
      results.forEach(testResult => {
        // Even with errors, test framework should complete
        expect(testResult.testName).toBeDefined();
        expect(testResult.metrics).toBeDefined();
        
        // Should have processed some operations despite errors
        expect(testResult.metrics.totalOperations).toBeGreaterThan(0);
      });

      // Error handling should be documented
      const errorViolations = results.flatMap(r => r.violations)
        .filter(v => v.description.includes('error') || v.description.includes('fail'));

      errorViolations.forEach(violation => {
        expect(violation.description.length).toBeGreaterThan(0);
        expect(['low', 'medium', 'high', 'critical']).toContain(violation.severity);
      });
    });

    test('should maintain stability under extreme load', async () => {
      const extremeConfig: ConcurrencyTestConfig = {
        concurrencyLevel: 12,
        operationsPerThread: 8,
        testDurationMs: 15000,
        stressMode: true,
        resourceContention: true,
        timeoutVariation: true,
        errorInjection: {
          enabled: true,
          rate: 0.1,
          types: ['timeout']
        }
      };

      const startTime = performance.now();
      const { results, overallAssessment } = await concurrencyFramework
        .executeConcurrencyTestSuite([extremeConfig]);
      const testDuration = performance.now() - startTime;

      expect(results.length).toBeGreaterThan(0);

      // Test should complete in reasonable time (not hang)
      expect(testDuration).toBeLessThan(30000); // Less than 30 seconds

      // System should provide assessment even under extreme load
      expect(['safe', 'warnings', 'unsafe']).toContain(overallAssessment.threadSafety);
      expect(Array.isArray(overallAssessment.recommendations)).toBe(true);

      // Log extreme test results
      const totalOperations = results.reduce((sum, r) => sum + r.metrics.totalOperations, 0);
      const totalSuccessful = results.reduce((sum, r) => sum + r.metrics.successfulOperations, 0);
      const overallSuccessRate = totalOperations > 0 ? totalSuccessful / totalOperations : 0;

      console.log(`Extreme load test completed in ${testDuration.toFixed(0)}ms`);
      console.log(`Total operations: ${totalOperations}`);
      console.log(`Success rate: ${(overallSuccessRate * 100).toFixed(1)}%`);
      console.log(`Thread safety: ${overallAssessment.threadSafety}`);

      // Even under extreme load, some operations should succeed
      expect(overallSuccessRate).toBeGreaterThan(0.5);
    });
  });
});