/**
 * Web Worker Stress Testing & Edge Cases
 * Extreme load testing and edge case validation for Web Worker implementation
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import { WorkerTestingUtils, type WorkerStressTestConfig } from './worker-testing-utils';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';

describe('Web Worker Stress Testing & Edge Cases', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('High Load Stress Testing', () => {
    test('should handle extreme concurrent operations', async () => {
      const stressConfig: WorkerStressTestConfig = {
        maxConcurrentWorkers: 15,
        operationsPerWorker: 10,
        stressDurationMs: 30000,
        memoryPressure: true,
        timeoutStress: false,
        errorInjection: false
      };

      const workers: BeatParserWorkerClient[] = [];
      const allOperations: Promise<any>[] = [];
      const startTime = performance.now();

      try {
        // Create workers and operations
        for (let w = 0; w < stressConfig.maxConcurrentWorkers; w++) {
          const worker = WorkerTestingUtils.createTestWorkerClient();
          await worker.initialize();
          workers.push(worker);

          // Add operations for this worker
          for (let op = 0; op < stressConfig.operationsPerWorker; op++) {
            const audio = WorkerTestingUtils.generateTestAudio('medium', {
              duration: 1 + Math.random() * 2 // 1-3 seconds
            }) as Float32Array;

            allOperations.push(
              worker.parseBuffer(audio, {
                filename: `stress-w${w}-op${op}.wav`,
                targetPictureCount: Math.floor(Math.random() * 5) + 1
              })
            );
          }
        }

        console.log(`Starting stress test with ${workers.length} workers and ${allOperations.length} operations`);

        // Execute all operations with timeout
        const results = await Promise.race([
          Promise.allSettled(allOperations),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Stress test timeout')), stressConfig.stressDurationMs)
          )
        ]) as PromiseSettledResult<any>[];

        const endTime = performance.now();
        const totalTime = endTime - startTime;

        // Analyze results
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        const successRate = successful / results.length;

        console.log(`Stress test completed in ${totalTime.toFixed(2)}ms:`);
        console.log(`  Success rate: ${(successRate * 100).toFixed(1)}%`);
        console.log(`  Successful operations: ${successful}`);
        console.log(`  Failed operations: ${failed}`);
        console.log(`  Throughput: ${((successful / totalTime) * 1000).toFixed(2)} ops/sec`);

        // Validate stress test results
        expect(results).toHaveLength(allOperations.length);
        expect(successRate).toBeGreaterThan(0.6); // At least 60% should succeed under stress
        expect(totalTime).toBeLessThan(stressConfig.stressDurationMs); // Should complete before timeout

      } finally {
        // Cleanup all workers
        await Promise.allSettled(workers.map(w => w.terminate()));
      }
    });

    test('should handle memory pressure scenarios', async () => {
      const memorySizes = [5, 10, 20, 50]; // MB of audio data
      const memoryResults: Array<{
        sizeMB: number;
        success: boolean;
        processingTime?: number;
        peakMemory?: number;
      }> = [];

      for (const sizeMB of memorySizes) {
        const worker = WorkerTestingUtils.createTestWorkerClient({
          memoryLeaks: sizeMB > 20 // Simulate memory leaks for large sizes
        });

        try {
          await worker.initialize();
          
          // Generate large audio buffer
          const samples = Math.floor(sizeMB * 1024 * 1024 / 4); // Convert MB to samples
          const audioDuration = samples / 44100;
          
          console.log(`Testing ${sizeMB}MB (${audioDuration.toFixed(1)}s) audio processing...`);
          
          const startMemory = process.memoryUsage();
          const startTime = performance.now();
          
          const largeAudio = new Float32Array(samples);
          
          // Fill with audio data
          for (let i = 0; i < samples; i++) {
            largeAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
          }

          try {
            const result = await worker.parseBuffer(largeAudio, {
              filename: `memory-pressure-${sizeMB}mb.wav`,
              targetPictureCount: Math.max(5, Math.floor(audioDuration))
            });

            const endTime = performance.now();
            const endMemory = process.memoryUsage();
            
            const processingTime = endTime - startTime;
            const peakMemory = endMemory.heapUsed;

            memoryResults.push({
              sizeMB,
              success: true,
              processingTime,
              peakMemory
            });

            expect(result).toBeDefined();
            expect(result.metadata.processingInfo.audioLength).toBeCloseTo(audioDuration, 1);

            console.log(`  ✓ ${sizeMB}MB: ${processingTime.toFixed(2)}ms, ${(peakMemory / 1024 / 1024).toFixed(2)}MB peak`);

          } catch (error) {
            memoryResults.push({
              sizeMB,
              success: false
            });

            console.log(`  ✗ ${sizeMB}MB: Failed - ${error}`);
          }

        } finally {
          await worker.terminate();
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      // Analyze memory pressure results
      expect(memoryResults).toHaveLength(memorySizes.length);
      
      // Smaller sizes should generally succeed
      const smallSizes = memoryResults.filter(r => r.sizeMB <= 10);
      const smallSuccessRate = smallSizes.filter(r => r.success).length / smallSizes.length;
      expect(smallSuccessRate).toBeGreaterThan(0.8);

      // Processing time should scale somewhat predictably
      const successfulResults = memoryResults.filter(r => r.success);
      if (successfulResults.length > 1) {
        successfulResults.forEach((result, i) => {
          if (i > 0 && result.processingTime && successfulResults[i - 1].processingTime) {
            const timeRatio = result.processingTime / successfulResults[i - 1].processingTime!;
            const sizeRatio = result.sizeMB / successfulResults[i - 1].sizeMB;
            
            // Time should scale reasonably with size (not exponentially)
            expect(timeRatio).toBeLessThan(sizeRatio * 3);
          }
        });
      }
    });

    test('should handle rapid worker creation and destruction', async () => {
      const cycleCount = 20;
      const creationTimes: number[] = [];
      const terminationTimes: number[] = [];

      for (let cycle = 0; cycle < cycleCount; cycle++) {
        // Create worker
        const createStart = performance.now();
        const worker = WorkerTestingUtils.createTestWorkerClient();
        await worker.initialize();
        const createEnd = performance.now();
        creationTimes.push(createEnd - createStart);

        // Quick operation
        const testAudio = new Float32Array(1000);
        testAudio.fill(0.1);
        
        const result = await worker.parseBuffer(testAudio, {
          filename: `rapid-cycle-${cycle}.wav`
        });

        expect(result).toBeDefined();

        // Terminate worker
        const terminateStart = performance.now();
        await worker.terminate();
        const terminateEnd = performance.now();
        terminationTimes.push(terminateEnd - terminateStart);

        if (cycle % 5 === 0) {
          console.log(`Cycle ${cycle + 1}/${cycleCount} completed`);
        }
      }

      // Analyze rapid cycling results
      const avgCreationTime = creationTimes.reduce((sum, t) => sum + t, 0) / creationTimes.length;
      const avgTerminationTime = terminationTimes.reduce((sum, t) => sum + t, 0) / terminationTimes.length;
      const maxCreationTime = Math.max(...creationTimes);
      const maxTerminationTime = Math.max(...terminationTimes);

      console.log(`Rapid cycling results:`);
      console.log(`  Average creation: ${avgCreationTime.toFixed(2)}ms`);
      console.log(`  Average termination: ${avgTerminationTime.toFixed(2)}ms`);
      console.log(`  Max creation: ${maxCreationTime.toFixed(2)}ms`);
      console.log(`  Max termination: ${maxTerminationTime.toFixed(2)}ms`);

      // Performance should remain reasonable
      expect(avgCreationTime).toBeLessThan(1000); // Less than 1 second average
      expect(avgTerminationTime).toBeLessThan(500); // Less than 500ms average
      expect(maxCreationTime).toBeLessThan(3000); // No creation should take more than 3 seconds
    });
  });

  describe('Edge Case Scenarios', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle zero-length audio data', async () => {
      const emptyAudio = new Float32Array(0);
      
      await expect(
        workerClient.parseBuffer(emptyAudio, { filename: 'empty.wav' })
      ).rejects.toThrow();
    });

    test('should handle single-sample audio', async () => {
      const singleSample = new Float32Array([0.5]);
      
      await expect(
        workerClient.parseBuffer(singleSample, { filename: 'single-sample.wav' })
      ).rejects.toThrow();
    });

    test('should handle extremely long audio', async () => {
      // 30 minutes of audio at 44.1kHz = very large buffer
      const longDuration = 30 * 60; // 30 minutes
      const samples = Math.floor(longDuration * 44100);
      
      // Only test with a smaller representative sample due to memory constraints
      const testSamples = Math.min(samples, 44100 * 30); // 30 seconds max for testing
      const longAudio = new Float32Array(testSamples);
      
      for (let i = 0; i < testSamples; i++) {
        longAudio[i] = Math.sin(2 * Math.PI * 60 * i / 44100) * 0.2; // 60 BPM pattern
      }

      try {
        const result = await workerClient.parseBuffer(longAudio, {
          filename: 'extremely-long.wav',
          targetPictureCount: 50
        });

        expect(result).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(50);
        expect(result.metadata.processingInfo.audioLength).toBeCloseTo(testSamples / 44100, 1);

        console.log(`Long audio (${testSamples} samples): ${result.beats.length} beats detected`);
      } catch (error) {
        // Long audio might fail due to memory or processing limits
        expect(error).toBeInstanceOf(Error);
        console.log(`Long audio processing failed as expected: ${error}`);
      }
    });

    test('should handle audio with extreme values', async () => {
      const extremeAudio = new Float32Array(44100); // 1 second
      
      // Fill with extreme values
      for (let i = 0; i < extremeAudio.length; i++) {
        if (i % 100 === 0) {
          extremeAudio[i] = Number.MAX_VALUE;
        } else if (i % 100 === 1) {
          extremeAudio[i] = -Number.MAX_VALUE;
        } else if (i % 100 === 2) {
          extremeAudio[i] = Infinity;
        } else if (i % 100 === 3) {
          extremeAudio[i] = -Infinity;
        } else if (i % 100 === 4) {
          extremeAudio[i] = NaN;
        } else {
          extremeAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.1;
        }
      }

      try {
        const result = await workerClient.parseBuffer(extremeAudio, {
          filename: 'extreme-values.wav'
        });

        // If it succeeds, result should be valid
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      } catch (error) {
        // Extreme values should cause appropriate error
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message.length).toBeGreaterThan(0);
      }
    });

    test('should handle corrupted or malformed data', async () => {
      const corruptedPatterns = [
        { name: 'All NaN', generator: () => { const a = new Float32Array(1000); a.fill(NaN); return a; } },
        { name: 'All Infinity', generator: () => { const a = new Float32Array(1000); a.fill(Infinity); return a; } },
        { name: 'All Zero', generator: () => { const a = new Float32Array(1000); a.fill(0); return a; } },
        { name: 'Max Values', generator: () => { const a = new Float32Array(1000); a.fill(Number.MAX_VALUE); return a; } }
      ];

      for (const pattern of corruptedPatterns) {
        try {
          const corruptedAudio = pattern.generator();
          const result = await workerClient.parseBuffer(corruptedAudio, {
            filename: `corrupted-${pattern.name.toLowerCase().replace(' ', '-')}.wav`
          });

          if (result) {
            console.log(`${pattern.name}: Processed successfully with ${result.beats.length} beats`);
          }
        } catch (error) {
          console.log(`${pattern.name}: Failed as expected - ${error}`);
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    test('should handle very high frequency operations', async () => {
      const operationCount = 50;
      const smallAudio = new Float32Array(256); // Very small buffer
      smallAudio.fill(0.1);

      const operations: Promise<any>[] = [];
      
      // Launch rapid-fire operations
      for (let i = 0; i < operationCount; i++) {
        operations.push(
          workerClient.parseBuffer(smallAudio, {
            filename: `rapid-${i}.wav`,
            targetPictureCount: 1
          })
        );
      }

      const startTime = performance.now();
      const results = await Promise.allSettled(operations);
      const endTime = performance.now();

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const totalTime = endTime - startTime;
      const throughput = successful / (totalTime / 1000);

      console.log(`High frequency operations:`);
      console.log(`  Success rate: ${(successful / operationCount * 100).toFixed(1)}%`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} ops/sec`);

      expect(results).toHaveLength(operationCount);
      expect(successful).toBeGreaterThan(operationCount * 0.7); // At least 70% success rate
    });
  });

  describe('Resource Exhaustion Testing', () => {
    test('should handle file descriptor exhaustion simulation', async () => {
      const workerLimit = 50; // Simulate system limit
      const workers: BeatParserWorkerClient[] = [];
      let successfulCreations = 0;

      try {
        for (let i = 0; i < workerLimit; i++) {
          try {
            const worker = WorkerTestingUtils.createTestWorkerClient();
            await worker.initialize();
            workers.push(worker);
            successfulCreations++;
            
            if (i % 10 === 0) {
              console.log(`Created ${i + 1} workers successfully`);
            }
          } catch (error) {
            console.log(`Worker creation failed at ${i + 1}: ${error}`);
            break; // Stop creating workers after first failure
          }
        }

        console.log(`Successfully created ${successfulCreations} workers`);
        
        // Test that existing workers still function
        if (workers.length > 0) {
          const testAudio = new Float32Array(1000);
          testAudio.fill(0.2);
          
          const testWorker = workers[0];
          const result = await testWorker.parseBuffer(testAudio, {
            filename: 'resource-exhaustion-test.wav'
          });
          
          expect(result).toBeDefined();
        }

      } finally {
        // Cleanup all workers
        await Promise.allSettled(workers.map(w => w.terminate()));
      }

      expect(successfulCreations).toBeGreaterThan(5); // Should create at least some workers
    });

    test('should handle timeout cascading failures', async () => {
      const timeoutClient = WorkerTestingUtils.createTestWorkerClient({
        timeout: 100, // Very short timeout
        latency: 200   // Longer latency than timeout
      });

      try {
        await timeoutClient.initialize();
        
        const operations: Promise<any>[] = [];
        const operationCount = 10;
        
        // Create multiple operations that will timeout
        for (let i = 0; i < operationCount; i++) {
          const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
          operations.push(
            timeoutClient.parseBuffer(audio, { filename: `timeout-${i}.wav` })
          );
        }

        const results = await Promise.allSettled(operations);
        const timeouts = results.filter(r => 
          r.status === 'rejected' && 
          (r.reason as Error).message.includes('timeout')
        ).length;

        console.log(`Timeout cascading test: ${timeouts}/${operationCount} operations timed out`);

        expect(timeouts).toBeGreaterThan(operationCount * 0.8); // Most should timeout
        expect(timeoutClient.getPendingOperationCount()).toBe(0); // Should clean up properly
        
      } finally {
        await timeoutClient.terminate();
      }
    });

    test('should handle memory leak scenarios', async () => {
      const memoryLeakClient = WorkerTestingUtils.createTestWorkerClient({
        memoryLeaks: true
      });

      try {
        await memoryLeakClient.initialize();
        
        const initialMemory = process.memoryUsage().heapUsed;
        const operationCount = 20;
        
        // Perform many operations to potentially cause memory leaks
        for (let i = 0; i < operationCount; i++) {
          const audio = WorkerTestingUtils.generateTestAudio('medium') as Float32Array;
          
          try {
            const result = await memoryLeakClient.parseBuffer(audio, {
              filename: `memory-leak-${i}.wav`
            });
            expect(result).toBeDefined();
          } catch (error) {
            // Some operations might fail due to memory issues
            console.log(`Operation ${i} failed: ${error}`);
          }

          // Check memory usage periodically
          if (i % 5 === 0) {
            const currentMemory = process.memoryUsage().heapUsed;
            const memoryGrowth = currentMemory - initialMemory;
            console.log(`After ${i + 1} operations: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`);
          }
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const totalGrowth = finalMemory - initialMemory;
        
        console.log(`Total memory growth: ${(totalGrowth / 1024 / 1024).toFixed(2)}MB`);

        // Memory growth should be bounded
        expect(totalGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
        
      } finally {
        await memoryLeakClient.terminate();
        
        // Force garbage collection
        if (global.gc) {
          global.gc();
        }
      }
    });
  });

  describe('Long-Running Stability Tests', () => {
    test('should maintain performance over extended operation', async () => {
      const testDuration = 10000; // 10 seconds
      const operationInterval = 200; // Operation every 200ms
      const expectedOperations = Math.floor(testDuration / operationInterval);
      
      const workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();

      try {
        const results: Array<{ operationNumber: number; processingTime: number }> = [];
        const startTime = performance.now();

        while (performance.now() - startTime < testDuration) {
          const operationNumber = results.length + 1;
          const testAudio = new Float32Array(2048);
          
          // Generate varying audio pattern
          const frequency = 220 + (operationNumber % 10) * 44;
          for (let i = 0; i < testAudio.length; i++) {
            testAudio[i] = Math.sin(2 * Math.PI * frequency * i / 44100) * 0.3;
          }

          const opStart = performance.now();
          
          try {
            const result = await workerClient.parseBuffer(testAudio, {
              filename: `stability-${operationNumber}.wav`,
              targetPictureCount: 2
            });

            const opEnd = performance.now();
            const processingTime = opEnd - opStart;

            results.push({ operationNumber, processingTime });
            expect(result).toBeDefined();

          } catch (error) {
            console.log(`Operation ${operationNumber} failed: ${error}`);
          }

          // Wait for next interval
          await new Promise(resolve => setTimeout(resolve, operationInterval));
        }

        // Analyze long-running performance
        const totalTime = performance.now() - startTime;
        const actualOperations = results.length;
        const averageProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
        
        console.log(`Long-running stability test (${totalTime.toFixed(2)}ms):`);
        console.log(`  Operations completed: ${actualOperations}/${expectedOperations}`);
        console.log(`  Average processing time: ${averageProcessingTime.toFixed(2)}ms`);
        console.log(`  Success rate: ${((actualOperations / expectedOperations) * 100).toFixed(1)}%`);

        expect(actualOperations).toBeGreaterThan(expectedOperations * 0.8); // At least 80% completion
        
        // Performance should remain stable (no significant degradation)
        if (results.length >= 10) {
          const firstHalf = results.slice(0, Math.floor(results.length / 2));
          const secondHalf = results.slice(Math.floor(results.length / 2));
          
          const firstHalfAvg = firstHalf.reduce((sum, r) => sum + r.processingTime, 0) / firstHalf.length;
          const secondHalfAvg = secondHalf.reduce((sum, r) => sum + r.processingTime, 0) / secondHalf.length;
          
          const performanceDegradation = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
          
          console.log(`  Performance change: ${(performanceDegradation * 100).toFixed(1)}%`);
          
          // Performance shouldn't degrade significantly
          expect(performanceDegradation).toBeLessThan(0.5); // Less than 50% degradation
        }

      } finally {
        await workerClient.terminate();
      }
    });
  });
});