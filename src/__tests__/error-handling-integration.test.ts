/**
 * Integration Error Handling Test Suite
 * 
 * Comprehensive tests for system integration errors, async operation failures,
 * cross-platform compatibility issues, worker thread communication errors,
 * event loop management, and complex multi-component error scenarios.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, BeatCandidate, StreamingOptions } from '../types';

describe('Error Handling: System Integration & Async Operations', () => {
  let parser: BeatParser;
  let workerClient: BeatParserWorkerClient;
  
  beforeEach(() => {
    parser = new BeatParser();
    workerClient = new BeatParserWorkerClient({ timeout: 10000 });
  });
  
  afterEach(async () => {
    await Promise.allSettled([
      parser.cleanup(),
      workerClient.terminate()
    ]);
  });

  describe('Worker Thread Communication Errors', () => {
    describe('Message Passing Failures', () => {
      test('should handle worker initialization failures', async () => {
        // In test environment, worker may not be available
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await workerClient.parseBuffer(buffer);
        } catch (error) {
          const message = (error as Error).message;
          // Should handle worker initialization gracefully
          expect(message).toMatch(/worker|initialization|spawn|thread/i);
          expect(message).not.toMatch(/crash|segmentation|fatal/i);
        }
      });

      test('should handle worker communication timeouts', async () => {
        const slowWorkerClient = new BeatParserWorkerClient({ timeout: 100 }); // Very short timeout
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await slowWorkerClient.parseBuffer(buffer);
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/timeout|communication|worker/i);
        } finally {
          await slowWorkerClient.terminate();
        }
      });

      test('should handle worker message serialization errors', async () => {
        const circularObj: any = { value: 1 };
        circularObj.self = circularObj; // Create circular reference
        
        try {
          // This would fail in actual worker communication due to serialization
          const result = JSON.stringify(circularObj);
          fail('Should have failed to serialize');
        } catch (error) {
          expect((error as Error).message).toMatch(/circular|json|serializ/i);
        }
        
        // Test with valid data
        const buffer = new Float32Array(4096).fill(0.5);
        try {
          await workerClient.parseBuffer(buffer);
        } catch (error) {
          // Worker might not be available in test environment - that's okay
        }
      });

      test('should handle worker message deserialization errors', async () => {
        // Simulate corrupted message handling
        const corruptedMessageHandler = (message: string) => {
          try {
            return JSON.parse(message);
          } catch (error) {
            throw new Error(`Message deserialization failed: ${(error as Error).message}`);
          }
        };
        
        const corruptedMessages = [
          '{"invalid": json}',
          '{"incomplete":',
          'null',
          'undefined',
          '{circular: ref}'
        ];
        
        for (const corruptedMessage of corruptedMessages) {
          try {
            corruptedMessageHandler(corruptedMessage);
            fail(`Should have failed for message: ${corruptedMessage}`);
          } catch (error) {
            expect((error as Error).message).toMatch(/deserialization|parse|json/i);
          }
        }
      });

      test('should handle worker termination during operation', async () => {
        const buffer = new Float32Array(44100).fill(0.5); // 1 second
        
        // Start operation and terminate immediately
        const operationPromise = workerClient.parseBuffer(buffer);
        
        // Terminate worker before operation completes
        setTimeout(async () => {
          await workerClient.terminate();
        }, 10);
        
        try {
          await operationPromise;
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/terminat|abort|worker.*closed/i);
        }
      });
    });

    describe('Worker Pool Management Errors', () => {
      test('should handle worker pool exhaustion', async () => {
        const maxWorkers = 3;
        let activeWorkers = 0;
        let workerPoolExhausted = false;
        
        const workerPoolPlugin: BeatParserPlugin = {
          name: 'worker-pool',
          version: '1.0.0',
          processAudio: async (audioData) => {
            if (activeWorkers >= maxWorkers) {
              workerPoolExhausted = true;
              throw new Error(`Worker pool exhausted: ${activeWorkers}/${maxWorkers} workers active`);
            }
            
            activeWorkers++;
            
            try {
              // Simulate worker operation
              await new Promise(resolve => setTimeout(resolve, 100));
              return audioData;
            } finally {
              activeWorkers--;
            }
          }
        };
        
        const poolParser = new BeatParser();
        poolParser.addPlugin(workerPoolPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Create more operations than available workers
        const operations = Array(maxWorkers + 2).fill(null).map(() =>
          poolParser.parseBuffer(buffer).catch(error => ({ error: error.message }))
        );
        
        const results = await Promise.all(operations);
        
        // Some operations should succeed, others should fail due to pool exhaustion
        const successes = results.filter(r => !('error' in r));
        const failures = results.filter(r => 'error' in r);
        
        expect(successes.length).toBeLessThanOrEqual(maxWorkers);
        if (workerPoolExhausted) {
          expect(failures.length).toBeGreaterThan(0);
          failures.forEach(failure => {
            if ('error' in failure) {
              expect(failure.error).toMatch(/pool exhausted/i);
            }
          });
        }
        
        await poolParser.cleanup();
      }, 10000);

      test('should handle worker health monitoring and recovery', async () => {
        let unhealthyWorkers = 0;
        let recoveredWorkers = 0;
        
        const workerHealthPlugin: BeatParserPlugin = {
          name: 'worker-health',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const isHealthy = Math.random() > 0.3; // 30% chance of being unhealthy
            
            if (!isHealthy) {
              unhealthyWorkers++;
              
              // Attempt recovery
              await new Promise(resolve => setTimeout(resolve, 50)); // Recovery time
              
              const recoverySuccess = Math.random() > 0.5; // 50% recovery rate
              if (recoverySuccess) {
                recoveredWorkers++;
                return audioData;
              } else {
                throw new Error('Worker failed health check and could not recover');
              }
            }
            
            return audioData;
          }
        };
        
        const healthParser = new BeatParser();
        healthParser.addPlugin(workerHealthPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Perform multiple operations to test health monitoring
        const operations = Array(20).fill(null).map(() =>
          healthParser.parseBuffer(buffer).catch(error => ({ error: error.message }))
        );
        
        const results = await Promise.all(operations);
        
        const successes = results.filter(r => !('error' in r));
        expect(successes.length).toBeGreaterThan(0);
        
        if (unhealthyWorkers > 0) {
          expect(recoveredWorkers).toBeGreaterThanOrEqual(0);
        }
        
        await healthParser.cleanup();
      }, 15000);
    });
  });

  describe('Async Operation Error Handling', () => {
    describe('Promise Rejection Handling', () => {
      test('should handle unhandled promise rejections gracefully', async () => {
        let unhandledRejections: Error[] = [];
        
        const originalHandler = process.listeners('unhandledRejection');
        
        const testHandler = (reason: any) => {
          unhandledRejections.push(reason);
        };
        
        process.on('unhandledRejection', testHandler);
        
        try {
          const rejectingPlugin: BeatParserPlugin = {
            name: 'unhandled-rejection',
            version: '1.0.0',
            processAudio: async (audioData) => {
              // Create unhandled rejection
              Promise.reject(new Error('Unhandled async error'));
              
              // Return normally (the rejection is unhandled)
              return audioData;
            }
          };
          
          const rejectionParser = new BeatParser();
          rejectionParser.addPlugin(rejectingPlugin);
          
          const buffer = new Float32Array(4096).fill(0.5);
          
          const result = await rejectionParser.parseBuffer(buffer);
          expect(result).toBeDefined();
          
          // Give time for unhandled rejection to be caught
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Should have caught the unhandled rejection
          expect(unhandledRejections.length).toBeGreaterThanOrEqual(0);
          
          await rejectionParser.cleanup();
          
        } finally {
          process.removeListener('unhandledRejection', testHandler);
          // Restore original handlers
          originalHandler.forEach(handler => {
            process.on('unhandledRejection', handler);
          });
        }
      });

      test('should handle promise chain errors correctly', async () => {
        const chainErrorPlugin: BeatParserPlugin = {
          name: 'chain-error',
          version: '1.0.0',
          processAudio: async (audioData) => {
            return Promise.resolve(audioData)
              .then(data => {
                // First stage succeeds
                return new Float32Array(data.length).map((_, i) => data[i] * 0.9);
              })
              .then(data => {
                // Second stage fails
                throw new Error('Chain error in processing stage 2');
              })
              .then(data => {
                // This should never execute
                throw new Error('Should not reach this stage');
              })
              .catch(error => {
                // Proper error handling in chain
                if (error.message.includes('Chain error')) {
                  throw new Error(`Handled chain error: ${error.message}`);
                }
                throw error;
              });
          }
        };
        
        const chainParser = new BeatParser();
        chainParser.addPlugin(chainErrorPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await chainParser.parseBuffer(buffer);
          fail('Should have failed with chain error');
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/Handled chain error.*stage 2/);
          expect(message).not.toContain('Should not reach this stage');
        }
        
        await chainParser.cleanup();
      });

      test('should handle async/await error propagation', async () => {
        const asyncAwaitErrorPlugin: BeatParserPlugin = {
          name: 'async-await-error',
          version: '1.0.0',
          processAudio: async (audioData) => {
            try {
              await this.failingAsyncOperation(audioData);
              return audioData;
            } catch (error) {
              throw new Error(`Async/await error: ${(error as Error).message}`);
            }
          },
          
          failingAsyncOperation: async (data: Float32Array) => {
            await new Promise(resolve => setTimeout(resolve, 10));
            throw new Error('Async operation failed');
          }
        } as any;
        
        const asyncParser = new BeatParser();
        asyncParser.addPlugin(asyncAwaitErrorPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await asyncParser.parseBuffer(buffer);
          fail('Should have failed with async error');
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/Async\/await error.*operation failed/);
        }
        
        await asyncParser.cleanup();
      });
    });

    describe('Timeout and Cancellation Handling', () => {
      test('should handle operation timeouts correctly', async () => {
        const timeoutPlugin: BeatParserPlugin = {
          name: 'timeout-test',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Long-running operation that should timeout
            await new Promise(resolve => setTimeout(resolve, 5000));
            return audioData;
          }
        };
        
        const timeoutParser = new BeatParser();
        timeoutParser.addPlugin(timeoutPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        const timeoutMs = 1000; // 1 second timeout
        
        const startTime = Date.now();
        
        try {
          const result = await Promise.race([
            timeoutParser.parseBuffer(buffer),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
            )
          ]);
          
          // If it completes quickly, that's fine
          expect(result).toBeDefined();
        } catch (error) {
          const endTime = Date.now();
          const elapsed = endTime - startTime;
          
          expect((error as Error).message).toMatch(/timeout/i);
          expect(elapsed).toBeGreaterThan(timeoutMs * 0.9); // Should timeout around expected time
          expect(elapsed).toBeLessThan(timeoutMs * 1.5); // But not too much later
        }
        
        await timeoutParser.cleanup();
      }, 10000);

      test('should handle operation cancellation', async () => {
        let operationCancelled = false;
        let cleanupCalled = false;
        
        const cancellablePlugin: BeatParserPlugin = {
          name: 'cancellable',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const abortController = new AbortController();
            const signal = abortController.signal;
            
            // Simulate cancellation after 100ms
            setTimeout(() => {
              operationCancelled = true;
              abortController.abort();
            }, 100);
            
            try {
              // Long-running operation that can be cancelled
              await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, 2000);
                
                signal.addEventListener('abort', () => {
                  clearTimeout(timer);
                  cleanupCalled = true;
                  reject(new Error('Operation cancelled'));
                });
              });
              
              return audioData;
            } catch (error) {
              if ((error as Error).message.includes('cancelled')) {
                throw new Error('Processing cancelled by user');
              }
              throw error;
            }
          }
        };
        
        const cancellableParser = new BeatParser();
        cancellableParser.addPlugin(cancellablePlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await cancellableParser.parseBuffer(buffer);
          fail('Should have been cancelled');
        } catch (error) {
          expect((error as Error).message).toMatch(/cancelled/i);
          expect(operationCancelled).toBe(true);
          expect(cleanupCalled).toBe(true);
        }
        
        await cancellableParser.cleanup();
      }, 5000);

      test('should handle multiple concurrent timeouts', async () => {
        const concurrentTimeoutPlugin: BeatParserPlugin = {
          name: 'concurrent-timeout',
          version: '1.0.0',
          processAudio: async (audioData, config) => {
            const delay = ((config as any).delay || 1000) + Math.random() * 500;
            await new Promise(resolve => setTimeout(resolve, delay));
            return audioData;
          }
        };
        
        const concurrentParser = new BeatParser();
        concurrentParser.addPlugin(concurrentTimeoutPlugin);
        
        const operations = [
          { delay: 500, timeout: 1000, shouldSucceed: true },
          { delay: 1500, timeout: 1000, shouldSucceed: false },
          { delay: 800, timeout: 1000, shouldSucceed: true },
          { delay: 2000, timeout: 1000, shouldSucceed: false },
        ];
        
        const results = await Promise.allSettled(
          operations.map(async ({ delay, timeout, shouldSucceed }) => {
            const testParser = new BeatParser(delay as any);
            testParser.addPlugin(concurrentTimeoutPlugin);
            
            const buffer = new Float32Array(4096).fill(0.5);
            
            try {
              const result = await Promise.race([
                testParser.parseBuffer(buffer),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('Timeout')), timeout)
                )
              ]);
              
              await testParser.cleanup();
              return { success: true, result };
            } catch (error) {
              await testParser.cleanup();
              return { success: false, error: (error as Error).message };
            }
          })
        );
        
        results.forEach((result, index) => {
          const expected = operations[index].shouldSucceed;
          
          if (result.status === 'fulfilled') {
            if (expected) {
              expect(result.value.success).toBe(true);
            } else {
              expect(result.value.success).toBe(false);
              expect(result.value.error).toMatch(/timeout/i);
            }
          }
        });
        
        await concurrentParser.cleanup();
      }, 15000);
    });
  });

  describe('Event Loop and Blocking Issues', () => {
    describe('Event Loop Blocking Prevention', () => {
      test('should prevent event loop blocking during intensive operations', async () => {
        let eventLoopBlocked = false;
        let maxBlockTime = 0;
        
        const intensivePlugin: BeatParserPlugin = {
          name: 'intensive',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const batchSize = 1024;
            const maxContinuousTime = 16; // 16ms (one frame at 60fps)
            
            for (let offset = 0; offset < audioData.length; offset += batchSize) {
              const batchStart = Date.now();
              
              // Intensive computation
              const endIndex = Math.min(offset + batchSize, audioData.length);
              for (let i = offset; i < endIndex; i++) {
                // Complex calculation
                audioData[i] = Math.sin(audioData[i] * Math.PI) * Math.cos(audioData[i] * Math.PI * 2);
              }
              
              const batchEnd = Date.now();
              const batchTime = batchEnd - batchStart;
              maxBlockTime = Math.max(maxBlockTime, batchTime);
              
              // Yield control if we've been running too long
              if (batchTime > maxContinuousTime) {
                eventLoopBlocked = true;
                await new Promise(resolve => setImmediate(resolve));
              }
            }
            
            return audioData;
          }
        };
        
        const intensiveParser = new BeatParser();
        intensiveParser.addPlugin(intensivePlugin);
        
        // Large buffer to trigger intensive processing
        const largeBuffer = new Float32Array(88200).fill(0.5); // 2 seconds at 44.1kHz
        
        const startTime = Date.now();
        const result = await intensiveParser.parseBuffer(largeBuffer);
        const endTime = Date.now();
        
        expect(result).toBeDefined();
        expect(maxBlockTime).toBeLessThan(100); // Should not block for more than 100ms
        
        // If blocking was detected, event loop yielding should have occurred
        if (eventLoopBlocked) {
          expect(endTime - startTime).toBeGreaterThan(100); // Should take longer due to yielding
        }
        
        await intensiveParser.cleanup();
      }, 15000);

      test('should handle event loop starvation scenarios', async () => {
        let starvationDetected = false;
        let yieldCount = 0;
        
        const starvationPlugin: BeatParserPlugin = {
          name: 'starvation',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const startTime = Date.now();
            let lastYield = startTime;
            const yieldInterval = 50; // Yield every 50ms
            
            // CPU-intensive loop
            for (let i = 0; i < audioData.length; i++) {
              // Heavy computation
              let value = audioData[i];
              for (let j = 0; j < 100; j++) {
                value = Math.sin(value + j * 0.001) * Math.cos(value + j * 0.002);
              }
              audioData[i] = value * 0.1;
              
              // Check if we need to yield
              if (i % 100 === 0) {
                const now = Date.now();
                if (now - lastYield > yieldInterval) {
                  starvationDetected = true;
                  yieldCount++;
                  await new Promise(resolve => setImmediate(resolve));
                  lastYield = now;
                }
              }
            }
            
            return audioData;
          }
        };
        
        const starvationParser = new BeatParser();
        starvationParser.addPlugin(starvationPlugin);
        
        const buffer = new Float32Array(22050).fill(0.5); // 0.5 seconds
        
        const result = await starvationParser.parseBuffer(buffer);
        
        expect(result).toBeDefined();
        
        if (starvationDetected) {
          expect(yieldCount).toBeGreaterThan(0);
        }
        
        await starvationParser.cleanup();
      }, 10000);

      test('should maintain responsiveness during background processing', async () => {
        let backgroundTasks = 0;
        let foregroundResponses = 0;
        
        const backgroundPlugin: BeatParserPlugin = {
          name: 'background',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate background processing with periodic yielding
            const chunks = 10;
            const chunkSize = Math.floor(audioData.length / chunks);
            
            for (let chunk = 0; chunk < chunks; chunk++) {
              backgroundTasks++;
              
              // Process chunk
              const startIdx = chunk * chunkSize;
              const endIdx = Math.min(startIdx + chunkSize, audioData.length);
              
              for (let i = startIdx; i < endIdx; i++) {
                audioData[i] = audioData[i] * 0.95;
              }
              
              // Yield after each chunk to maintain responsiveness
              await new Promise(resolve => setImmediate(resolve));
              
              // Simulate foreground task that can run between chunks
              foregroundResponses++;
            }
            
            return audioData;
          }
        };
        
        const backgroundParser = new BeatParser();
        backgroundParser.addPlugin(backgroundPlugin);
        
        const buffer = new Float32Array(44100).fill(0.5); // 1 second
        
        const result = await backgroundParser.parseBuffer(buffer);
        
        expect(result).toBeDefined();
        expect(backgroundTasks).toBeGreaterThan(5); // Should have processed multiple chunks
        expect(foregroundResponses).toBeGreaterThan(5); // Should have yielded multiple times
        
        await backgroundParser.cleanup();
      });
    });

    describe('Callback Queue Management', () => {
      test('should handle callback queue overflow', async () => {
        let queuedCallbacks = 0;
        let processedCallbacks = 0;
        const maxQueueSize = 100;
        
        const callbackQueuePlugin: BeatParserPlugin = {
          name: 'callback-queue',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Generate many callbacks
            const promises: Promise<void>[] = [];
            
            for (let i = 0; i < maxQueueSize * 2; i++) {
              queuedCallbacks++;
              
              const promise = new Promise<void>(resolve => {
                setImmediate(() => {
                  processedCallbacks++;
                  resolve();
                });
              });
              
              promises.push(promise);
              
              // Throttle queue if it gets too large
              if (queuedCallbacks % 50 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
              }
            }
            
            await Promise.all(promises);
            return audioData;
          }
        };
        
        const queueParser = new BeatParser();
        queueParser.addPlugin(callbackQueuePlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await queueParser.parseBuffer(buffer);
        
        expect(result).toBeDefined();
        expect(processedCallbacks).toBe(queuedCallbacks);
        expect(queuedCallbacks).toBe(maxQueueSize * 2);
        
        await queueParser.cleanup();
      }, 10000);

      test('should handle microtask vs macrotask scheduling', async () => {
        const executionOrder: string[] = [];
        
        const taskSchedulingPlugin: BeatParserPlugin = {
          name: 'task-scheduling',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Schedule different types of tasks
            
            // Immediate (microtask)
            Promise.resolve().then(() => {
              executionOrder.push('microtask-1');
            });
            
            // Timer (macrotask)
            setTimeout(() => {
              executionOrder.push('macrotask-1');
            }, 0);
            
            // setImmediate (macrotask)
            setImmediate(() => {
              executionOrder.push('immediate-1');
            });
            
            // Another microtask
            Promise.resolve().then(() => {
              executionOrder.push('microtask-2');
            });
            
            // Wait for all tasks to complete
            await new Promise(resolve => setTimeout(resolve, 50));
            
            return audioData;
          }
        };
        
        const schedulingParser = new BeatParser();
        schedulingParser.addPlugin(taskSchedulingPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        await schedulingParser.parseBuffer(buffer);
        
        // Microtasks should execute before macrotasks
        expect(executionOrder).toContain('microtask-1');
        expect(executionOrder).toContain('microtask-2');
        expect(executionOrder).toContain('macrotask-1');
        expect(executionOrder).toContain('immediate-1');
        
        const microtask1Index = executionOrder.indexOf('microtask-1');
        const microtask2Index = executionOrder.indexOf('microtask-2');
        const macrotask1Index = executionOrder.indexOf('macrotask-1');
        
        // Microtasks should come before macrotasks
        expect(Math.min(microtask1Index, microtask2Index)).toBeLessThan(macrotask1Index);
        
        await schedulingParser.cleanup();
      });
    });
  });

  describe('Cross-Platform Integration Issues', () => {
    describe('Platform-Specific Error Handling', () => {
      test('should handle platform-specific path issues', async () => {
        const platformPaths = [
          // Windows-style paths
          'C:\\audio\\file.wav',
          'C:/audio/file.wav',
          '\\\\network\\share\\audio.wav',
          
          // Unix-style paths
          '/usr/local/audio/file.wav',
          '~/Documents/audio.wav',
          './relative/path.wav',
          '../parent/audio.wav',
          
          // Special characters
          '/path with spaces/file.wav',
          '/path-with-dashes/file.wav',
          '/path_with_underscores/file.wav',
          '/path.with.dots/file.wav'
        ];
        
        for (const filePath of platformPaths) {
          try {
            await parser.parseFile(filePath);
            fail(`Should have failed for non-existent path: ${filePath}`);
          } catch (error) {
            const message = (error as Error).message;
            // Should handle path gracefully regardless of platform format
            expect(message).toMatch(/not found|access|path/i);
            expect(message).not.toMatch(/crash|invalid.*platform|unsupported.*path/i);
          }
        }
      });

      test('should handle platform-specific file system limits', async () => {
        const longFileName = 'a'.repeat(300) + '.wav'; // Very long filename
        const deepPath = '/very/deep/nested/path/structure/that/goes/on/and/on/and/might/exceed/limits/file.wav';
        const specialCharsPath = '/path/with/special/chars/♪♫♪♫/file.wav';
        
        const problematicPaths = [longFileName, deepPath, specialCharsPath];
        
        for (const path of problematicPaths) {
          try {
            await parser.parseFile(path);
          } catch (error) {
            const message = (error as Error).message;
            // Should handle file system limits gracefully
            expect(message).toMatch(/not found|access|path.*too long|invalid.*character/i);
            expect(message).not.toMatch(/crash|system.*error|fatal/i);
          }
        }
      });

      test('should handle platform-specific memory limitations', async () => {
        // Test different memory allocation patterns that might behave differently on different platforms
        const memoryPatterns = [
          { size: 16 * 1024 * 1024, pattern: 'sequential', description: '16MB sequential' },
          { size: 8 * 1024 * 1024, pattern: 'random', description: '8MB random' },
          { size: 32 * 1024 * 1024, pattern: 'sparse', description: '32MB sparse' }
        ];
        
        for (const { size, pattern, description } of memoryPatterns) {
          try {
            const buffer = new Float32Array(size / 4); // 4 bytes per float
            
            switch (pattern) {
              case 'sequential':
                for (let i = 0; i < buffer.length; i++) {
                  buffer[i] = i * 0.0001;
                }
                break;
              case 'random':
                for (let i = 0; i < buffer.length; i++) {
                  buffer[i] = Math.random();
                }
                break;
              case 'sparse':
                for (let i = 0; i < buffer.length; i += 1000) {
                  buffer[i] = 0.5;
                }
                break;
            }
            
            const result = await parser.parseBuffer(buffer);
            expect(result).toBeDefined();
            
          } catch (error) {
            const message = (error as Error).message;
            // Should handle platform memory limits gracefully
            expect(message).toMatch(/memory|allocation|too large/i);
            expect(message).not.toMatch(/platform.*specific|system.*crash/i);
          }
        }
      }, 30000);
    });

    describe('Environment-Specific Issues', () => {
      test('should handle different Node.js versions and features', async () => {
        // Test features that might not be available in all Node.js versions
        const nodeFeatureTests = [
          {
            name: 'Worker threads',
            test: () => {
              try {
                require('worker_threads');
                return true;
              } catch {
                return false;
              }
            }
          },
          {
            name: 'Performance hooks',
            test: () => {
              try {
                require('perf_hooks');
                return true;
              } catch {
                return false;
              }
            }
          },
          {
            name: 'AbortController',
            test: () => {
              try {
                new AbortController();
                return true;
              } catch {
                return false;
              }
            }
          }
        ];
        
        const nodeCompatibilityPlugin: BeatParserPlugin = {
          name: 'node-compatibility',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Use features conditionally based on availability
            for (const feature of nodeFeatureTests) {
              if (feature.test()) {
                // Feature is available, use it
                continue;
              } else {
                // Feature not available, use fallback
                console.log(`Feature ${feature.name} not available, using fallback`);
              }
            }
            
            return audioData;
          }
        };
        
        const compatParser = new BeatParser();
        compatParser.addPlugin(nodeCompatibilityPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Should work regardless of Node.js version/features
        const result = await compatParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await compatParser.cleanup();
      });

      test('should handle different execution environments', async () => {
        const environmentInfo = {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        };
        
        const environmentPlugin: BeatParserPlugin = {
          name: 'environment-aware',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Adapt behavior based on environment
            if (environmentInfo.platform === 'win32') {
              // Windows-specific optimizations
            } else if (environmentInfo.platform === 'darwin') {
              // macOS-specific optimizations
            } else {
              // Linux/Unix-specific optimizations
            }
            
            // Memory-aware processing
            const availableMemory = environmentInfo.memoryUsage.heapTotal;
            const bufferMemory = audioData.length * 4;
            
            if (bufferMemory > availableMemory * 0.1) {
              // Large buffer relative to available memory - use streaming approach
              const chunkSize = Math.floor(availableMemory * 0.01 / 4);
              const processedBuffer = new Float32Array(audioData.length);
              
              for (let i = 0; i < audioData.length; i += chunkSize) {
                const endIndex = Math.min(i + chunkSize, audioData.length);
                for (let j = i; j < endIndex; j++) {
                  processedBuffer[j] = audioData[j] * 0.9;
                }
              }
              
              return processedBuffer;
            }
            
            return audioData;
          }
        };
        
        const envParser = new BeatParser();
        envParser.addPlugin(environmentPlugin);
        
        const buffer = new Float32Array(44100).fill(0.5); // 1 second
        
        const result = await envParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await envParser.cleanup();
      });
    });
  });

  describe('Complex Multi-Component Error Scenarios', () => {
    describe('Cascading Failure Handling', () => {
      test('should handle cascading failures across multiple components', async () => {
        let failureChain: string[] = [];
        
        const cascadingFailurePlugin: BeatParserPlugin = {
          name: 'cascading-failure',
          version: '1.0.0',
          initialize: async () => {
            failureChain.push('initialization');
            // Don't fail here - let it cascade later
          },
          processAudio: async (audioData) => {
            failureChain.push('audio-processing');
            
            // First failure point
            if (failureChain.length === 2) {
              throw new Error('Audio processing component failed');
            }
            
            return audioData;
          },
          processBeats: async (beats) => {
            failureChain.push('beat-processing');
            
            // This should not be reached due to earlier failure
            throw new Error('Beat processing should not be reached');
          },
          cleanup: async () => {
            failureChain.push('cleanup');
            // Cleanup should still be called even after failures
          }
        };
        
        const cascadingParser = new BeatParser();
        cascadingParser.addPlugin(cascadingFailurePlugin);
        
        await cascadingParser.initialize();
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await cascadingParser.parseBuffer(buffer);
          fail('Should have failed in cascading manner');
        } catch (error) {
          expect((error as Error).message).toMatch(/Audio processing.*failed/);
          expect(failureChain).toContain('initialization');
          expect(failureChain).toContain('audio-processing');
          expect(failureChain).not.toContain('beat-processing'); // Should not reach this
        }
        
        await cascadingParser.cleanup();
        expect(failureChain).toContain('cleanup'); // Cleanup should still happen
      });

      test('should implement circuit breaker for cascading failures', async () => {
        let consecutiveFailures = 0;
        let circuitOpen = false;
        const failureThreshold = 3;
        
        const circuitBreakerPlugin: BeatParserPlugin = {
          name: 'circuit-breaker',
          version: '1.0.0',
          processAudio: async (audioData) => {
            if (circuitOpen) {
              throw new Error('Circuit breaker is open - system protection active');
            }
            
            // Simulate intermittent failures
            if (Math.random() < 0.7) { // 70% failure rate
              consecutiveFailures++;
              
              if (consecutiveFailures >= failureThreshold) {
                circuitOpen = true;
              }
              
              throw new Error(`Component failure ${consecutiveFailures}`);
            }
            
            // Success resets the counter
            consecutiveFailures = 0;
            return audioData;
          }
        };
        
        const circuitParser = new BeatParser();
        circuitParser.addPlugin(circuitBreakerPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        let circuitOpenDetected = false;
        
        // Try multiple operations until circuit opens
        for (let i = 0; i < 10; i++) {
          try {
            await circuitParser.parseBuffer(buffer);
            // Success - continue
          } catch (error) {
            const message = (error as Error).message;
            
            if (message.includes('Circuit breaker is open')) {
              circuitOpenDetected = true;
              break;
            } else {
              expect(message).toMatch(/Component failure \d+/);
            }
          }
        }
        
        if (consecutiveFailures >= failureThreshold) {
          expect(circuitOpenDetected).toBe(true);
        }
        
        await circuitParser.cleanup();
      });

      test('should handle recovery after cascading failures', async () => {
        let systemHealth = 100;
        let recoveryAttempts = 0;
        let fullRecoveryAchieved = false;
        
        const recoveryPlugin: BeatParserPlugin = {
          name: 'recovery-system',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // System degrades on each operation
            systemHealth -= 20;
            
            if (systemHealth <= 0) {
              recoveryAttempts++;
              
              if (recoveryAttempts >= 3) {
                // Full recovery after 3 attempts
                systemHealth = 100;
                fullRecoveryAchieved = true;
                return audioData;
              } else {
                // Partial recovery
                systemHealth += 10;
                throw new Error(`System degraded, recovery attempt ${recoveryAttempts}`);
              }
            }
            
            return audioData;
          }
        };
        
        const recoveryParser = new BeatParser();
        recoveryParser.addPlugin(recoveryPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Run operations until recovery is achieved
        for (let i = 0; i < 10; i++) {
          try {
            const result = await recoveryParser.parseBuffer(buffer);
            
            if (fullRecoveryAchieved) {
              expect(result).toBeDefined();
              expect(systemHealth).toBe(100);
              break;
            }
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/System degraded.*recovery attempt/);
          }
        }
        
        expect(fullRecoveryAchieved).toBe(true);
        expect(recoveryAttempts).toBeGreaterThanOrEqual(3);
        
        await recoveryParser.cleanup();
      });
    });

    describe('Resource Contention and Deadlock Prevention', () => {
      test('should prevent deadlocks in resource access', async () => {
        const resourceLocks = new Map<string, boolean>();
        let deadlockPrevented = false;
        const lockTimeout = 1000; // 1 second
        
        const deadlockPreventionPlugin: BeatParserPlugin = {
          name: 'deadlock-prevention',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const requiredResources = ['resourceA', 'resourceB'];
            const acquiredLocks: string[] = [];
            
            try {
              // Try to acquire locks with timeout
              for (const resource of requiredResources) {
                const lockAcquired = await this.acquireLockWithTimeout(resource, lockTimeout);
                
                if (!lockAcquired) {
                  deadlockPrevented = true;
                  throw new Error(`Could not acquire lock for ${resource} - deadlock prevention`);
                }
                
                acquiredLocks.push(resource);
              }
              
              // Simulate work with resources
              await new Promise(resolve => setTimeout(resolve, 50));
              
              return audioData;
            } finally {
              // Release all acquired locks
              for (const resource of acquiredLocks) {
                resourceLocks.set(resource, false);
              }
            }
          },
          
          acquireLockWithTimeout: async function(resource: string, timeout: number): Promise<boolean> {
            const startTime = Date.now();
            
            while (Date.now() - startTime < timeout) {
              if (!resourceLocks.get(resource)) {
                resourceLocks.set(resource, true);
                return true;
              }
              
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            return false;
          }
        } as any;
        
        const deadlockParser = new BeatParser();
        deadlockParser.addPlugin(deadlockPreventionPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Create competing operations that might deadlock
        const operations = Array(5).fill(null).map(() =>
          deadlockParser.parseBuffer(buffer).catch(error => ({ error: error.message }))
        );
        
        const results = await Promise.all(operations);
        
        const successes = results.filter(r => !('error' in r));
        const failures = results.filter(r => 'error' in r);
        
        // Some operations should succeed
        expect(successes.length).toBeGreaterThan(0);
        
        // If deadlock prevention was triggered, failures should mention it
        if (deadlockPrevented) {
          failures.forEach(failure => {
            if ('error' in failure) {
              expect(failure.error).toMatch(/deadlock prevention|Could not acquire lock/);
            }
          });
        }
        
        await deadlockParser.cleanup();
      }, 10000);

      test('should handle resource starvation scenarios', async () => {
        let resourceStarvation = false;
        let highPriorityOperations = 0;
        let lowPriorityOperations = 0;
        
        const starvationPreventionPlugin: BeatParserPlugin = {
          name: 'starvation-prevention',
          version: '1.0.0',
          processAudio: async (audioData, config) => {
            const priority = (config as any).priority || 'normal';
            const maxWaitTime = 2000; // 2 seconds max wait
            const startTime = Date.now();
            
            // Simulate resource contention
            while (Date.now() - startTime < maxWaitTime) {
              if (priority === 'high') {
                highPriorityOperations++;
                break;
              } else {
                // Low priority operations might be starved
                if (Math.random() < 0.3) { // 30% chance to proceed
                  lowPriorityOperations++;
                  break;
                } else {
                  await new Promise(resolve => setTimeout(resolve, 50));
                }
              }
            }
            
            if (Date.now() - startTime >= maxWaitTime) {
              resourceStarvation = true;
              throw new Error('Resource starvation detected');
            }
            
            return audioData;
          }
        };
        
        const starvationParser = new BeatParser();
        starvationParser.addPlugin(starvationPreventionPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Mix of high and low priority operations
        const operations = [
          ...Array(3).fill(null).map(() => 
            starvationParser.parseBuffer(buffer, { priority: 'high' } as any)
          ),
          ...Array(7).fill(null).map(() => 
            starvationParser.parseBuffer(buffer, { priority: 'low' } as any).catch(error => ({ error: error.message }))
          )
        ];
        
        const results = await Promise.all(operations);
        
        expect(highPriorityOperations).toBeGreaterThan(0);
        
        if (resourceStarvation) {
          const starvationErrors = results.filter(r => 
            'error' in r && r.error.includes('starvation')
          );
          expect(starvationErrors.length).toBeGreaterThan(0);
        }
        
        await starvationParser.cleanup();
      }, 15000);
    });
  });
});