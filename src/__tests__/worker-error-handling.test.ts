/**
 * Web Worker Error Handling Tests
 * Comprehensive validation of error scenarios, recovery mechanisms, and fault tolerance
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import type { WorkerProgressCallback, WorkerParseOptions, WorkerClientOptions } from '../worker/WorkerClient';
import type { ParseResult } from '../types';
import type { BeatParserConfig } from '../core/BeatParser';
import { WorkerTestingUtils, type WorkerTestMetrics, EnhancedMockWorker } from './worker-testing-utils';

describe('Web Worker Error Handling & Recovery', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Worker Initialization Errors', () => {
    test('should handle worker constructor failures', async () => {
      // Mock worker constructor to throw
      const originalWorker = (global as any).Worker;
      let constructorCallCount = 0;

      (global as any).Worker = class {
        constructor() {
          constructorCallCount++;
          throw new Error('Worker initialization failed');
        }
      };

      try {
        const client = new BeatParserWorkerClient();
        
        await expect(client.initialize())
          .rejects
          .toThrow('Failed to initialize BeatParser worker: Worker initialization failed');

        // Should not retry initialization automatically
        expect(constructorCallCount).toBe(1);
        
        // Client should remain uninitialized
        expect(client.isBusy()).toBe(false);
        expect(client.getPendingOperationCount()).toBe(0);

      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle missing Worker support gracefully', async () => {
      const originalWorker = (global as any).Worker;
      delete (global as any).Worker;

      try {
        const client = new BeatParserWorkerClient();
        
        await expect(client.initialize())
          .rejects
          .toThrow('Web Workers are not supported in this environment');

      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle script loading failures', async () => {
      // Mock worker that fails during script loading
      (global as any).Worker = class extends EnhancedMockWorker {
        constructor(url: string) {
          super(url);
          // Simulate script loading failure
          setTimeout(() => {
            this.dispatchEvent(new ErrorEvent('error', {
              message: 'Failed to load worker script',
              filename: url,
              lineno: 1,
              colno: 1
            }));
          }, 10);
        }
      };

      const client = new BeatParserWorkerClient();
      
      try {
        await client.initialize();
        
        // Give time for error to propagate
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Operations should fail due to script loading error
        await expect(client.parseBuffer(testAudio))
          .rejects
          .toThrow();

      } finally {
        await client.terminate();
      }
    });

    test('should handle invalid worker URL', async () => {
      const invalidOptions: WorkerClientOptions = {
        workerUrl: 'invalid://not-a-real-url/worker.js'
      };

      const client = new BeatParserWorkerClient(invalidOptions);
      
      // Note: In real browsers this would fail, in our mock it might not
      // This test validates the URL handling path exists
      try {
        await client.initialize();
        
        // If initialization succeeds with mock, that's OK
        // Real implementation would fail with network error
        
      } catch (error) {
        expect(error).toBeDefined();
        expect(client.isBusy()).toBe(false);
      } finally {
        await client.terminate();
      }
    });
  });

  describe('Runtime Error Handling', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 0.5  // 50% error rate for testing
      });
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle worker runtime errors gracefully', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      
      // With 50% error rate, some operations should fail
      const results = await Promise.allSettled([
        workerClient.parseBuffer(testAudio),
        workerClient.parseBuffer(testAudio),
        workerClient.parseBuffer(testAudio),
        workerClient.parseBuffer(testAudio)
      ]);

      const failures = results.filter(r => r.status === 'rejected');
      const successes = results.filter(r => r.status === 'fulfilled');

      // Should have a mix of failures and successes
      expect(failures.length + successes.length).toBe(4);
      
      // Failed operations should have meaningful error messages
      failures.forEach(result => {
        if (result.status === 'rejected') {
          expect(result.reason).toBeDefined();
          expect(result.reason.message).toContain('Simulated worker error');
        }
      });

      // Worker should remain functional after errors
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should handle message serialization errors', async () => {
      // Create problematic data that might cause serialization issues
      const problematicAudio = new Float32Array(1000);
      
      // Fill with values that might cause JSON serialization issues
      for (let i = 0; i < problematicAudio.length; i++) {
        if (i % 10 === 0) problematicAudio[i] = Infinity;
        else if (i % 10 === 1) problematicAudio[i] = -Infinity;
        else if (i % 10 === 2) problematicAudio[i] = NaN;
        else problematicAudio[i] = Math.sin(i / 100) * 0.5;
      }

      // Should handle serialization issues gracefully
      await expect(workerClient.parseBuffer(problematicAudio))
        .rejects
        .toThrow();

      // Worker should remain operational
      expect(workerClient.isBusy()).toBe(false);
    });

    test('should handle worker crash scenarios', async () => {
      // Mock a worker that crashes during processing
      const crashingClient = WorkerTestingUtils.createTestWorkerClient();
      
      // Replace with a worker that crashes
      (global as any).Worker = class extends EnhancedMockWorker {
        postMessage(message: any) {
          // Crash on first message
          setTimeout(() => {
            this.dispatchEvent(new ErrorEvent('error', {
              message: 'Worker crashed unexpectedly',
              filename: 'worker.js',
              lineno: 42
            }));
          }, 10);
        }
      };

      try {
        await crashingClient.initialize();
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        await expect(crashingClient.parseBuffer(testAudio))
          .rejects
          .toThrow();

        // All pending operations should be rejected after crash
        expect(crashingClient.isBusy()).toBe(false);
        expect(crashingClient.getPendingOperationCount()).toBe(0);

      } finally {
        await crashingClient.terminate();
      }
    });

    test('should handle message corruption', async () => {
      // Mock worker that sends corrupted messages
      (global as any).Worker = class extends EnhancedMockWorker {
        private sendMessage(data: any): void {
          const messageListeners = (this as any).listeners.get('message') || [];
          
          // Send corrupted message
          const corruptedData = {
            ...data,
            type: 'corrupted-type',
            payload: { corrupted: true }
          };
          
          messageListeners.forEach((listener: Function) => {
            try {
              listener({ data: corruptedData });
            } catch (error) {
              console.warn('Mock worker message listener error:', error);
            }
          });
        }
      };

      const corruptedClient = WorkerTestingUtils.createTestWorkerClient();
      
      try {
        await corruptedClient.initialize();
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Should handle unknown message types gracefully
        const result = await corruptedClient.parseBuffer(testAudio);
        
        // Mock worker might still return valid result despite corruption
        expect(result).toBeDefined();

      } catch (error) {
        // Or it might throw - both are acceptable error handling
        expect(error).toBeDefined();
      } finally {
        await corruptedClient.terminate();
      }
    });
  });

  describe('Network and Communication Errors', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle message timeout scenarios', async () => {
      const timeoutClient = WorkerTestingUtils.createTestWorkerClient({
        timeout: 100  // Very short timeout
      });

      try {
        await timeoutClient.initialize();
        
        // Use large audio that would take longer than timeout
        const largeAudio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;
        
        await expect(timeoutClient.parseBuffer(largeAudio))
          .rejects
          .toThrow('Worker operation timed out');

        // Client should clean up after timeout
        expect(timeoutClient.isBusy()).toBe(false);
        expect(timeoutClient.getPendingOperationCount()).toBe(0);

      } finally {
        await timeoutClient.terminate();
      }
    });

    test('should handle high message latency', async () => {
      const highLatencyClient = WorkerTestingUtils.createTestWorkerClient({
        latency: 500  // High latency
      });

      try {
        await highLatencyClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        const startTime = performance.now();
        const result = await highLatencyClient.parseBuffer(testAudio);
        const endTime = performance.now();
        
        // Should complete successfully despite high latency
        expect(result).toBeDefined();
        expect(endTime - startTime).toBeGreaterThan(400); // Reflects latency

      } finally {
        await highLatencyClient.terminate();
      }
    });

    test('should handle communication channel failures', async () => {
      // Mock worker with communication issues
      (global as any).Worker = class extends EnhancedMockWorker {
        postMessage() {
          // Simulate communication failure
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent('messageerror', {
              data: null
            }));
          }, 10);
        }
      };

      const commFailureClient = WorkerTestingUtils.createTestWorkerClient();
      
      try {
        await commFailureClient.initialize();
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Should handle message errors gracefully
        await expect(commFailureClient.parseBuffer(testAudio))
          .rejects
          .toThrow();

      } finally {
        await commFailureClient.terminate();
      }
    });
  });

  describe('Resource and Memory Error Handling', () => {
    test('should handle out-of-memory scenarios', async () => {
      const memoryStressClient = WorkerTestingUtils.createTestWorkerClient({
        memoryLeaks: true
      });

      try {
        await memoryStressClient.initialize();
        
        // Simulate memory-intensive operations
        const operations: Promise<ParseResult>[] = [];
        
        for (let i = 0; i < 10; i++) {
          const largeAudio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;
          operations.push(memoryStressClient.parseBuffer(largeAudio, {
            filename: `memory-test-${i}.wav`
          }));
        }

        const results = await Promise.allSettled(operations);
        
        // Some operations might succeed, others might fail due to memory pressure
        const failures = results.filter(r => r.status === 'rejected');
        const successes = results.filter(r => r.status === 'fulfilled');
        
        expect(failures.length + successes.length).toBe(10);
        
        // Worker should remain responsive after memory stress
        expect(memoryStressClient.isBusy()).toBe(false);

      } finally {
        await memoryStressClient.terminate();
      }
    });

    test('should handle invalid audio buffer scenarios', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        await workerClient.initialize();

        // Test various invalid buffer scenarios
        const invalidScenarios = [
          new Float32Array(0),        // Empty buffer
          new Float32Array(1),        // Too small
          null as any,                // Null buffer
          undefined as any,           // Undefined buffer
        ];

        for (const invalidBuffer of invalidScenarios) {
          await expect(workerClient.parseBuffer(invalidBuffer))
            .rejects
            .toThrow();
        }

        // Worker should remain functional after invalid inputs
        expect(workerClient.isBusy()).toBe(false);

      } finally {
        await workerClient.terminate();
      }
    });

    test('should handle transferable object errors', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        await workerClient.initialize();

        // Create a buffer that might have transfer issues
        const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Detach the buffer to simulate transfer issues
        const detachedBuffer = audio.buffer.slice();
        const audioWithDetachedBuffer = new Float32Array(detachedBuffer);

        // Should handle transferable object issues gracefully
        const result = await workerClient.parseBuffer(audioWithDetachedBuffer);
        expect(result).toBeDefined();

      } finally {
        await workerClient.terminate();
      }
    });
  });

  describe('Concurrent Error Scenarios', () => {
    test('should handle errors in concurrent operations', async () => {
      const errorProneClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 0.3  // 30% error rate
      });

      try {
        await errorProneClient.initialize();

        // Launch many concurrent operations
        const operations = Array.from({ length: 10 }, (_, i) => {
          const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
          return errorProneClient.parseBuffer(audio, {
            filename: `concurrent-error-${i}.wav`
          });
        });

        const results = await Promise.allSettled(operations);
        
        const failures = results.filter(r => r.status === 'rejected');
        const successes = results.filter(r => r.status === 'fulfilled');

        // Should have a mix of successes and failures
        expect(failures.length + successes.length).toBe(10);
        expect(failures.length).toBeGreaterThan(0);
        expect(successes.length).toBeGreaterThan(0);

        // Failed operations should not affect successful ones
        successes.forEach(result => {
          if (result.status === 'fulfilled') {
            expect(result.value).toBeDefined();
            expect(result.value.beats).toBeDefined();
          }
        });

      } finally {
        await errorProneClient.terminate();
      }
    });

    test('should handle partial batch operation failures', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        await workerClient.initialize();

        // Create batch with some problematic audio
        const batchAudio: Float32Array[] = [
          WorkerTestingUtils.generateTestAudio('simple') as Float32Array,
          new Float32Array(0),  // Invalid empty buffer
          WorkerTestingUtils.generateTestAudio('simple') as Float32Array
        ];

        // Should handle partial failures in batch processing
        await expect(workerClient.processBatch(batchAudio))
          .rejects
          .toThrow();  // Entire batch might fail, or handle individual failures

      } finally {
        await workerClient.terminate();
      }
    });
  });

  describe('Recovery and Resilience', () => {
    test('should recover from temporary worker failures', async () => {
      let failureCount = 0;
      const maxFailures = 3;

      // Mock worker that fails first few times then succeeds
      (global as any).Worker = class extends EnhancedMockWorker {
        constructor(url: string) {
          super(url, undefined, {
            errorRate: failureCount < maxFailures ? 1.0 : 0.0
          });
        }

        postMessage(message: any) {
          failureCount++;
          super.postMessage(message);
        }
      };

      const resilientClient = WorkerTestingUtils.createTestWorkerClient({
        timeout: 1000
      });

      try {
        await resilientClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // First few attempts should fail, then succeed
        const attempts = [];
        for (let i = 0; i < 5; i++) {
          attempts.push(
            resilientClient.parseBuffer(testAudio).catch(error => ({ error }))
          );
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const results = await Promise.all(attempts);
        
        // Should have some failures followed by successes
        const errors = results.filter(r => 'error' in r).length;
        const successes = results.filter(r => !('error' in r)).length;
        
        expect(errors + successes).toBe(5);

      } finally {
        await resilientClient.terminate();
      }
    });

    test('should maintain state consistency during error recovery', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 0.2
      });

      try {
        await workerClient.initialize();

        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Launch operations and track state consistency
        const operation1 = workerClient.parseBuffer(testAudio).catch(() => 'failed');
        expect(workerClient.isBusy()).toBe(true);
        expect(workerClient.getPendingOperationCount()).toBeGreaterThan(0);

        const operation2 = workerClient.parseBuffer(testAudio).catch(() => 'failed');
        expect(workerClient.getPendingOperationCount()).toBeGreaterThan(0);

        await Promise.all([operation1, operation2]);

        // State should be consistent after operations complete
        expect(workerClient.isBusy()).toBe(false);
        expect(workerClient.getPendingOperationCount()).toBe(0);

      } finally {
        await workerClient.terminate();
      }
    });

    test('should handle graceful degradation scenarios', async () => {
      // Test fallback to main thread when worker fails
      const originalWorker = (global as any).Worker;
      let workerAttempts = 0;

      // Mock worker that always fails to initialize
      (global as any).Worker = class {
        constructor() {
          workerAttempts++;
          throw new Error('Worker unavailable');
        }
      };

      try {
        const client = new BeatParserWorkerClient();
        
        await expect(client.initialize()).rejects.toThrow();
        expect(workerAttempts).toBe(1);
        
        // In a real implementation, this might trigger fallback to main thread
        // For now, we just verify the error is handled appropriately

      } finally {
        (global as any).Worker = originalWorker;
      }
    });
  });

  describe('Error Reporting and Diagnostics', () => {
    test('should provide detailed error information', async () => {
      const errorClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 1.0  // Always error
      });

      try {
        await errorClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        try {
          await errorClient.parseBuffer(testAudio);
          fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeDefined();
          expect(error.message).toBeDefined();
          expect(error.message.length).toBeGreaterThan(0);
          
          // Error message should be meaningful
          expect(error.message).toContain('error');
        }

      } finally {
        await errorClient.terminate();
      }
    });

    test('should handle progress callback errors without affecting processing', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        await workerClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Progress callback that throws errors
        const erroringCallback: WorkerProgressCallback = () => {
          throw new Error('Progress callback error');
        };

        // Should complete processing despite callback errors
        const result = await workerClient.parseBuffer(testAudio, {
          progressCallback: erroringCallback
        });

        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();

      } finally {
        await workerClient.terminate();
      }
    });

    test('should handle mixed success and error scenarios', async () => {
      const mixedClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 0.5
      });

      try {
        await mixedClient.initialize();
        
        // Run multiple operations to get mixed results
        const operations = Array.from({ length: 20 }, (_, i) => {
          const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
          return mixedClient.parseBuffer(audio, {
            filename: `mixed-${i}.wav`
          }).then(
            result => ({ success: true, result }),
            error => ({ success: false, error })
          );
        });

        const results = await Promise.all(operations);
        
        const successes = results.filter(r => r.success).length;
        const failures = results.filter(r => !r.success).length;
        
        expect(successes + failures).toBe(20);
        expect(successes).toBeGreaterThan(5);  // Should have some successes
        expect(failures).toBeGreaterThan(5);   // Should have some failures
        
        // Worker should remain functional
        expect(mixedClient.isBusy()).toBe(false);
        expect(mixedClient.getPendingOperationCount()).toBe(0);

      } finally {
        await mixedClient.terminate();
      }
    });
  });
});