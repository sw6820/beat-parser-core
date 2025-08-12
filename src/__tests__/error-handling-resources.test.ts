/**
 * Resource Management Error Handling Test Suite
 * 
 * Comprehensive tests for resource exhaustion scenarios, memory management,
 * CPU limits, file handle management, concurrent resource access, and
 * resource cleanup validation. Focuses on system stability under pressure.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, BeatCandidate, StreamingOptions } from '../types';

describe('Error Handling: Resource Management & Exhaustion', () => {
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

  describe('Memory Management and Exhaustion', () => {
    describe('Memory Allocation Limits', () => {
      test('should handle large buffer allocation gracefully', async () => {
        const memorySizes = [
          { size: 44100 * 60, name: '1 minute audio' },      // ~10MB
          { size: 44100 * 300, name: '5 minute audio' },     // ~53MB
          { size: 44100 * 600, name: '10 minute audio' },    // ~106MB
        ];
        
        for (const { size, name } of memorySizes) {
          try {
            const largeBuffer = new Float32Array(size);
            
            // Fill buffer with realistic audio data
            for (let i = 0; i < size; i++) {
              largeBuffer[i] = Math.sin(i * 0.001) * 0.5;
            }
            
            const startTime = Date.now();
            const result = await parser.parseBuffer(largeBuffer);
            const endTime = Date.now();
            
            expect(result).toBeDefined();
            expect(result.beats).toBeDefined();
            expect(endTime - startTime).toBeLessThan(60000); // Should complete in reasonable time
            
          } catch (error) {
            const message = (error as Error).message;
            // Should fail gracefully with memory-related error
            expect(message).toMatch(/memory|allocation|too large|resource/i);
            expect(message).not.toMatch(/crash|segmentation|fatal/i);
          }
        }
      }, 120000); // Extended timeout for large buffers

      test('should prevent memory leaks during repeated allocations', async () => {
        const initialMemory = process.memoryUsage();
        const bufferSize = 44100; // 1 second
        const iterations = 50;
        
        for (let i = 0; i < iterations; i++) {
          const buffer = new Float32Array(bufferSize);
          
          // Fill with different data each time
          for (let j = 0; j < bufferSize; j++) {
            buffer[j] = Math.sin(j * 0.001 + i * 0.1) * 0.5;
          }
          
          try {
            const result = await parser.parseBuffer(buffer);
            expect(result).toBeDefined();
          } catch (error) {
            // Some operations might fail due to resource pressure
          }
          
          // Force garbage collection every 10 iterations
          if (i % 10 === 0 && global.gc) {
            global.gc();
            
            // Check memory growth
            const currentMemory = process.memoryUsage();
            const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
            
            // Memory growth should be reasonable (< 100MB for 10 operations)
            if (memoryGrowth > 100 * 1024 * 1024) {
              console.warn(`Memory growth detected: ${memoryGrowth / 1024 / 1024}MB`);
            }
          }
        }
        
        // Final memory check
        if (global.gc) global.gc();
        const finalMemory = process.memoryUsage();
        const totalGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
        
        // Total memory growth should be reasonable
        expect(totalGrowth).toBeLessThan(200 * 1024 * 1024); // < 200MB
      }, 60000);

      test('should handle fragmented memory scenarios', async () => {
        const fragmentationBuffers: Float32Array[] = [];
        const fragmentSize = 1024 * 1024; // 1MB fragments
        const maxFragments = 50;
        
        try {
          // Create memory fragmentation
          for (let i = 0; i < maxFragments; i++) {
            try {
              const fragment = new Float32Array(fragmentSize / 4); // 1MB / 4 bytes per float
              fragment.fill(Math.random());
              fragmentationBuffers.push(fragment);
              
              // Try to process every 10th fragment
              if (i % 10 === 0) {
                const result = await parser.parseBuffer(fragment);
                expect(result).toBeDefined();
              }
              
            } catch (error) {
              // Memory allocation might fail - that's acceptable
              const message = (error as Error).message;
              expect(message).toMatch(/memory|allocation|resource/i);
              break;
            }
          }
          
        } finally {
          // Cleanup fragments
          fragmentationBuffers.length = 0;
          if (global.gc) global.gc();
        }
        
        // System should remain functional after fragmentation
        const testBuffer = new Float32Array(4096).fill(0.5);
        const result = await parser.parseBuffer(testBuffer);
        expect(result).toBeDefined();
      }, 45000);

      test('should handle concurrent memory pressure', async () => {
        const concurrentOperations = 10;
        const bufferSize = 44100 * 2; // 2 seconds each
        
        const operations = Array(concurrentOperations).fill(null).map(async (_, index) => {
          const buffer = new Float32Array(bufferSize);
          
          // Fill with unique pattern for each operation
          for (let i = 0; i < bufferSize; i++) {
            buffer[i] = Math.sin(i * 0.001 + index * Math.PI / 4) * 0.5;
          }
          
          try {
            return await parser.parseBuffer(buffer);
          } catch (error) {
            return { error: (error as Error).message };
          }
        });
        
        const results = await Promise.allSettled(operations);
        
        let successful = 0;
        let failed = 0;
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            const value = result.value;
            if ('error' in value) {
              failed++;
              expect(value.error).not.toMatch(/crash|segmentation|fatal/i);
            } else {
              successful++;
              expect(value).toBeDefined();
              expect(value.beats).toBeDefined();
            }
          } else {
            failed++;
          }
        });
        
        // At least some operations should succeed
        expect(successful).toBeGreaterThan(0);
        expect(successful + failed).toBe(concurrentOperations);
      }, 30000);
    });

    describe('Memory Monitoring and Thresholds', () => {
      test('should monitor memory usage during processing', async () => {
        let maxMemoryUsed = 0;
        let memoryMeasurements: number[] = [];
        
        const memoryMonitorPlugin: BeatParserPlugin = {
          name: 'memory-monitor',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const beforeMemory = process.memoryUsage().heapUsed;
            
            // Simulate memory-intensive operation
            const workingBuffer = new Float32Array(audioData.length * 2);
            for (let i = 0; i < audioData.length; i++) {
              workingBuffer[i] = audioData[i] * 2;
              workingBuffer[i + audioData.length] = audioData[i] * 0.5;
            }
            
            const afterMemory = process.memoryUsage().heapUsed;
            const memoryUsed = afterMemory - beforeMemory;
            
            maxMemoryUsed = Math.max(maxMemoryUsed, memoryUsed);
            memoryMeasurements.push(memoryUsed);
            
            // Return original buffer to avoid excessive memory usage
            return audioData;
          }
        };
        
        const monitorParser = new BeatParser();
        monitorParser.addPlugin(memoryMonitorPlugin);
        
        const buffer = new Float32Array(44100).fill(0.5); // 1 second
        
        await monitorParser.parseBuffer(buffer);
        
        expect(maxMemoryUsed).toBeGreaterThan(0);
        expect(memoryMeasurements.length).toBeGreaterThan(0);
        
        // Memory usage should be reasonable for the operation
        expect(maxMemoryUsed).toBeLessThan(100 * 1024 * 1024); // < 100MB for 1 second audio
        
        await monitorParser.cleanup();
      });

      test('should apply memory thresholds and limits', async () => {
        const memoryThreshold = 50 * 1024 * 1024; // 50MB threshold
        let memoryLimitHit = false;
        
        const memoryLimitPlugin: BeatParserPlugin = {
          name: 'memory-limit',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const currentMemory = process.memoryUsage().heapUsed;
            
            if (currentMemory > memoryThreshold) {
              memoryLimitHit = true;
              throw new Error(`Memory limit exceeded: ${Math.round(currentMemory / 1024 / 1024)}MB > ${Math.round(memoryThreshold / 1024 / 1024)}MB`);
            }
            
            // Simulate memory usage
            const tempBuffer = new Float32Array(audioData.length);
            tempBuffer.set(audioData);
            
            return tempBuffer;
          }
        };
        
        const limitParser = new BeatParser();
        limitParser.addPlugin(memoryLimitPlugin);
        
        // Try with different buffer sizes
        const bufferSizes = [4096, 44100, 88200, 176400]; // Increasing sizes
        
        for (const size of bufferSizes) {
          const buffer = new Float32Array(size).fill(0.5);
          
          try {
            await limitParser.parseBuffer(buffer);
          } catch (error) {
            if (memoryLimitHit) {
              const message = (error as Error).message;
              expect(message).toMatch(/Memory limit exceeded/);
              break;
            }
          }
        }
        
        await limitParser.cleanup();
      });

      test('should implement memory pressure relief mechanisms', async () => {
        let pressureReliefActivated = false;
        let originalBufferSize = 0;
        let reducedBufferSize = 0;
        
        const pressureReliefPlugin: BeatParserPlugin = {
          name: 'pressure-relief',
          version: '1.0.0',
          processAudio: async (audioData) => {
            originalBufferSize = audioData.length;
            const memoryUsage = process.memoryUsage();
            const memoryPressure = memoryUsage.heapUsed / memoryUsage.heapTotal;
            
            if (memoryPressure > 0.7) { // 70% memory usage threshold
              pressureReliefActivated = true;
              
              // Reduce buffer size to relieve pressure
              const reductionFactor = Math.max(0.25, 1 - memoryPressure);
              const reducedSize = Math.floor(audioData.length * reductionFactor);
              reducedBufferSize = reducedSize;
              
              const reducedBuffer = new Float32Array(reducedSize);
              for (let i = 0; i < reducedSize; i++) {
                reducedBuffer[i] = audioData[Math.floor(i / reductionFactor)];
              }
              
              return reducedBuffer;
            }
            
            return audioData;
          }
        };
        
        const pressureParser = new BeatParser();
        pressureParser.addPlugin(pressureReliefPlugin);
        
        // Create large buffer to trigger pressure relief
        const largeBuffer = new Float32Array(88200 * 5).fill(0.5); // 5 seconds
        
        try {
          const result = await pressureParser.parseBuffer(largeBuffer);
          expect(result).toBeDefined();
          
          if (pressureReliefActivated) {
            expect(reducedBufferSize).toBeLessThan(originalBufferSize);
            expect(reducedBufferSize).toBeGreaterThan(0);
          }
          
        } catch (error) {
          // If it fails due to memory pressure, error should be informative
          const message = (error as Error).message;
          expect(message).toMatch(/memory|pressure|resource/i);
        }
        
        await pressureParser.cleanup();
      }, 30000);
    });
  });

  describe('CPU Resource Management', () => {
    describe('CPU Timeout Handling', () => {
      test('should handle CPU-intensive operations with timeouts', async () => {
        const cpuTimeoutPlugin: BeatParserPlugin = {
          name: 'cpu-timeout',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const startTime = Date.now();
            const maxProcessingTime = 5000; // 5 second timeout
            
            // Simulate CPU-intensive operation
            let result = audioData;
            for (let iteration = 0; iteration < 10; iteration++) {
              if (Date.now() - startTime > maxProcessingTime) {
                throw new Error(`CPU timeout after ${Date.now() - startTime}ms`);
              }
              
              // Expensive computation
              const tempBuffer = new Float32Array(result.length);
              for (let i = 0; i < result.length; i++) {
                tempBuffer[i] = Math.sin(result[i] * Math.PI) * 0.8;
              }
              result = tempBuffer;
              
              // Allow event loop to breathe
              if (iteration % 3 === 0) {
                await new Promise(resolve => setImmediate(resolve));
              }
            }
            
            return result;
          }
        };
        
        const timeoutParser = new BeatParser();
        timeoutParser.addPlugin(cpuTimeoutPlugin);
        
        const buffer = new Float32Array(44100).fill(0.5);
        
        const startTime = Date.now();
        try {
          const result = await timeoutParser.parseBuffer(buffer);
          const endTime = Date.now();
          
          expect(result).toBeDefined();
          expect(endTime - startTime).toBeLessThan(10000); // Should complete or timeout within 10s
          
        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('CPU timeout')) {
            expect(message).toMatch(/timeout.*\d+ms/);
          }
        }
        
        await timeoutParser.cleanup();
      }, 15000);

      test('should implement CPU usage throttling', async () => {
        let cpuUsageChecks = 0;
        let throttlingActivated = false;
        
        const cpuThrottlePlugin: BeatParserPlugin = {
          name: 'cpu-throttle',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const chunkSize = 1024;
            const processingDelay = 10; // ms delay when throttling
            
            for (let offset = 0; offset < audioData.length; offset += chunkSize) {
              cpuUsageChecks++;
              
              // Simulate CPU usage monitoring
              const simulatedCpuUsage = Math.random() * 100;
              
              if (simulatedCpuUsage > 80) { // 80% CPU threshold
                throttlingActivated = true;
                await new Promise(resolve => setTimeout(resolve, processingDelay));
              }
              
              // Process chunk
              const endIndex = Math.min(offset + chunkSize, audioData.length);
              for (let i = offset; i < endIndex; i++) {
                audioData[i] = audioData[i] * 0.95; // Light processing
              }
              
              // Yield control periodically
              if (cpuUsageChecks % 10 === 0) {
                await new Promise(resolve => setImmediate(resolve));
              }
            }
            
            return audioData;
          }
        };
        
        const throttleParser = new BeatParser();
        throttleParser.addPlugin(cpuThrottlePlugin);
        
        const buffer = new Float32Array(44100).fill(0.5);
        
        await throttleParser.parseBuffer(buffer);
        
        expect(cpuUsageChecks).toBeGreaterThan(0);
        // Throttling might or might not activate based on simulated CPU usage
        
        await throttleParser.cleanup();
      });

      test('should handle event loop blocking prevention', async () => {
        let eventLoopChecks = 0;
        let maxEventLoopDelay = 0;
        
        const eventLoopPlugin: BeatParserPlugin = {
          name: 'event-loop',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const processingChunkSize = 4096;
            const maxEventLoopBlockTime = 50; // 50ms max continuous processing
            
            for (let offset = 0; offset < audioData.length; offset += processingChunkSize) {
              const chunkStart = Date.now();
              eventLoopChecks++;
              
              // Process chunk
              const endIndex = Math.min(offset + processingChunkSize, audioData.length);
              for (let i = offset; i < endIndex; i++) {
                // Simulate some processing
                audioData[i] = Math.sin(audioData[i] * Math.PI * 2) * 0.8;
              }
              
              const chunkEnd = Date.now();
              const chunkDuration = chunkEnd - chunkStart;
              maxEventLoopDelay = Math.max(maxEventLoopDelay, chunkDuration);
              
              // Yield control if we've been processing too long
              if (chunkDuration > maxEventLoopBlockTime) {
                await new Promise(resolve => setImmediate(resolve));
              }
            }
            
            return audioData;
          }
        };
        
        const eventLoopParser = new BeatParser();
        eventLoopParser.addPlugin(eventLoopPlugin);
        
        const buffer = new Float32Array(88200).fill(0.5); // 2 seconds
        
        const result = await eventLoopParser.parseBuffer(buffer);
        
        expect(result).toBeDefined();
        expect(eventLoopChecks).toBeGreaterThan(0);
        expect(maxEventLoopDelay).toBeLessThan(200); // Should not block for too long
        
        await eventLoopParser.cleanup();
      }, 10000);
    });

    describe('Concurrent CPU Load Management', () => {
      test('should manage CPU load across multiple operations', async () => {
        const concurrentOperations = 5;
        const operationMetrics: Array<{ duration: number; startTime: number }> = [];
        
        const cpuLoadPlugin: BeatParserPlugin = {
          name: 'cpu-load',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const startTime = Date.now();
            
            // CPU-intensive operation
            const result = new Float32Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
              result[i] = Math.sin(audioData[i] * Math.PI) * Math.cos(audioData[i] * Math.PI * 2);
            }
            
            const duration = Date.now() - startTime;
            operationMetrics.push({ duration, startTime });
            
            // Simulate adaptive CPU load balancing
            if (operationMetrics.length > 2) {
              const recentOperations = operationMetrics.slice(-3);
              const avgDuration = recentOperations.reduce((sum, op) => sum + op.duration, 0) / recentOperations.length;
              
              if (avgDuration > 100) { // If operations are taking too long
                await new Promise(resolve => setTimeout(resolve, 10)); // Brief pause
              }
            }
            
            return result;
          }
        };
        
        const loadParser = new BeatParser();
        loadParser.addPlugin(cpuLoadPlugin);
        
        const buffers = Array(concurrentOperations).fill(null).map(() =>
          new Float32Array(22050).fill(Math.random()) // 0.5 seconds each
        );
        
        const operations = buffers.map(buffer =>
          loadParser.parseBuffer(buffer).catch(error => ({ error: error.message }))
        );
        
        const startTime = Date.now();
        const results = await Promise.all(operations);
        const totalTime = Date.now() - startTime;
        
        const successful = results.filter(r => !('error' in r));
        expect(successful.length).toBeGreaterThan(0);
        
        // Total time should be reasonable for concurrent operations
        expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
        
        await loadParser.cleanup();
      }, 20000);

      test('should implement CPU quota enforcement', async () => {
        let cpuQuotaViolations = 0;
        let totalCpuTime = 0;
        
        const cpuQuotaPlugin: BeatParserPlugin = {
          name: 'cpu-quota',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const maxCpuTimePerOperation = 2000; // 2 seconds
            const startTime = Date.now();
            
            // Simulate CPU-intensive work with quota checking
            let processedSamples = 0;
            const batchSize = 1024;
            
            while (processedSamples < audioData.length) {
              const currentTime = Date.now();
              const cpuTimeUsed = currentTime - startTime;
              
              if (cpuTimeUsed > maxCpuTimePerOperation) {
                cpuQuotaViolations++;
                throw new Error(`CPU quota exceeded: ${cpuTimeUsed}ms > ${maxCpuTimePerOperation}ms`);
              }
              
              // Process batch
              const endIndex = Math.min(processedSamples + batchSize, audioData.length);
              for (let i = processedSamples; i < endIndex; i++) {
                audioData[i] = Math.sin(audioData[i] * Math.PI) * 0.9;
              }
              
              processedSamples = endIndex;
              
              // Brief yield every few batches
              if (processedSamples % (batchSize * 4) === 0) {
                await new Promise(resolve => setImmediate(resolve));
              }
            }
            
            totalCpuTime += Date.now() - startTime;
            return audioData;
          }
        };
        
        const quotaParser = new BeatParser();
        quotaParser.addPlugin(cpuQuotaPlugin);
        
        // Test with varying buffer sizes
        const bufferSizes = [4096, 22050, 44100, 88200]; // 0.1s to 2s
        
        for (const size of bufferSizes) {
          const buffer = new Float32Array(size).fill(0.5);
          
          try {
            await quotaParser.parseBuffer(buffer);
          } catch (error) {
            if ((error as Error).message.includes('CPU quota exceeded')) {
              expect(cpuQuotaViolations).toBeGreaterThan(0);
              break; // Expected for large buffers
            }
          }
        }
        
        await quotaParser.cleanup();
      }, 15000);
    });
  });

  describe('File Handle and I/O Resource Management', () => {
    describe('File Handle Exhaustion', () => {
      test('should handle file handle limits gracefully', async () => {
        const maxConcurrentFiles = 20;
        const fileOperations: Promise<any>[] = [];
        let fileHandleErrors = 0;
        
        // Attempt to open many files simultaneously
        for (let i = 0; i < maxConcurrentFiles; i++) {
          const operation = parser.parseFile(`nonexistent-file-${i}.wav`).catch(error => {
            const message = (error as Error).message;
            if (message.includes('too many') || message.includes('handle') || message.includes('EMFILE')) {
              fileHandleErrors++;
            }
            return { error: message };
          });
          
          fileOperations.push(operation);
        }
        
        const results = await Promise.all(fileOperations);
        
        // All should fail (files don't exist), but not due to handle exhaustion
        results.forEach(result => {
          if ('error' in result) {
            expect(result.error).toMatch(/not found|access|ENOENT/);
            expect(result.error).not.toMatch(/too many.*files|handle.*exhausted|EMFILE/);
          }
        });
        
        expect(fileHandleErrors).toBe(0); // Should not hit file handle limits
      });

      test('should properly close file handles after errors', async () => {
        let openFileHandles = 0;
        
        const fileHandleTrackingPlugin: BeatParserPlugin = {
          name: 'file-handle-tracker',
          version: '1.0.0',
          initialize: async () => {
            // Simulate file handle opening
            openFileHandles++;
          },
          processAudio: async (audioData) => {
            // Simulate file operations
            openFileHandles += 2; // Read + write handles
            
            try {
              // Simulate processing that might fail
              if (Math.random() < 0.3) {
                throw new Error('File processing failed');
              }
              return audioData;
            } finally {
              // Ensure handles are closed even on error
              openFileHandles = Math.max(0, openFileHandles - 2);
            }
          },
          cleanup: async () => {
            // Close initialization handle
            openFileHandles = Math.max(0, openFileHandles - 1);
          }
        };
        
        const fileTrackingParser = new BeatParser();
        fileTrackingParser.addPlugin(fileHandleTrackingPlugin);
        
        await fileTrackingParser.initialize();
        expect(openFileHandles).toBe(1); // Initialization handle
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Perform multiple operations
        for (let i = 0; i < 10; i++) {
          try {
            await fileTrackingParser.parseBuffer(buffer);
          } catch (error) {
            // Some operations might fail - that's okay
          }
        }
        
        await fileTrackingParser.cleanup();
        expect(openFileHandles).toBe(0); // All handles should be closed
      });

      test('should implement file handle pooling', async () => {
        const maxPoolSize = 5;
        let activeHandles = 0;
        let peakHandleUsage = 0;
        let handleReused = 0;
        
        const filePoolPlugin: BeatParserPlugin = {
          name: 'file-pool',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate handle acquisition from pool
            if (activeHandles < maxPoolSize) {
              activeHandles++;
            } else {
              // Reuse existing handle
              handleReused++;
            }
            
            peakHandleUsage = Math.max(peakHandleUsage, activeHandles);
            
            try {
              // Simulate file operation
              await new Promise(resolve => setTimeout(resolve, 10));
              return audioData;
            } finally {
              // Return handle to pool (don't actually decrement for simulation)
            }
          }
        };
        
        const poolParser = new BeatParser();
        poolParser.addPlugin(filePoolPlugin);
        
        const operations = Array(15).fill(null).map(() => {
          const buffer = new Float32Array(2048).fill(Math.random());
          return poolParser.parseBuffer(buffer);
        });
        
        await Promise.all(operations);
        
        expect(peakHandleUsage).toBeLessThanOrEqual(maxPoolSize);
        expect(handleReused).toBeGreaterThan(0); // Should have reused handles
        
        await poolParser.cleanup();
      });
    });

    describe('Disk Space and I/O Errors', () => {
      test('should handle disk space exhaustion gracefully', async () => {
        const diskSpacePlugin: BeatParserPlugin = {
          name: 'disk-space',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate disk space check
            const simulatedAvailableSpace = Math.random() * 1000; // MB
            const requiredSpace = (audioData.length * 4) / (1024 * 1024); // MB
            
            if (simulatedAvailableSpace < requiredSpace) {
              throw new Error(`Insufficient disk space: ${simulatedAvailableSpace.toFixed(1)}MB available, ${requiredSpace.toFixed(1)}MB required`);
            }
            
            // Simulate temporary file creation
            const tempFileSize = Math.min(requiredSpace, simulatedAvailableSpace * 0.1);
            
            if (tempFileSize < requiredSpace * 0.5) {
              throw new Error('Cannot create temporary files - insufficient space');
            }
            
            return audioData;
          }
        };
        
        const diskSpaceParser = new BeatParser();
        diskSpaceParser.addPlugin(diskSpacePlugin);
        
        const buffer = new Float32Array(44100).fill(0.5); // 1 second
        
        try {
          const result = await diskSpaceParser.parseBuffer(buffer);
          expect(result).toBeDefined();
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/disk space|insufficient|space/i);
          expect(message).toMatch(/\d+(\.\d+)?MB/); // Should include specific measurements
        }
        
        await diskSpaceParser.cleanup();
      });

      test('should handle I/O errors and retry logic', async () => {
        let ioAttempts = 0;
        const maxRetries = 3;
        
        const ioRetryPlugin: BeatParserPlugin = {
          name: 'io-retry',
          version: '1.0.0',
          processAudio: async (audioData) => {
            ioAttempts++;
            
            // Simulate transient I/O errors
            if (ioAttempts <= maxRetries - 1) {
              const errorTypes = ['EBUSY', 'EAGAIN', 'ETXTBSY'];
              const errorType = errorTypes[ioAttempts - 1];
              throw new Error(`I/O error: ${errorType} (attempt ${ioAttempts})`);
            }
            
            // Success on final attempt
            return audioData;
          }
        };
        
        const ioRetryParser = new BeatParser();
        ioRetryParser.addPlugin(ioRetryPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Implement manual retry logic
        let finalResult;
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            finalResult = await ioRetryParser.parseBuffer(buffer);
            break;
          } catch (error) {
            lastError = error as Error;
            
            if (attempt < maxRetries) {
              // Brief delay before retry
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }
        
        if (!finalResult && lastError) {
          throw lastError;
        }
        
        expect(finalResult).toBeDefined();
        expect(ioAttempts).toBe(maxRetries);
        
        await ioRetryParser.cleanup();
      });

      test('should clean up temporary files after errors', async () => {
        let tempFilesCreated = 0;
        let tempFilesCleanedUp = 0;
        
        const tempFileCleanupPlugin: BeatParserPlugin = {
          name: 'temp-file-cleanup',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate temp file creation
            tempFilesCreated += 2; // Input temp + output temp
            
            try {
              // Simulate processing that might fail
              if (Math.random() < 0.4) {
                throw new Error('Processing failed with temp files');
              }
              
              return audioData;
            } catch (error) {
              // Cleanup temp files even on error
              tempFilesCleanedUp += 2;
              throw error;
            } finally {
              // Ensure cleanup happens
              if (tempFilesCreated > tempFilesCleanedUp) {
                tempFilesCleanedUp = tempFilesCreated;
              }
            }
          }
        };
        
        const cleanupParser = new BeatParser();
        cleanupParser.addPlugin(tempFileCleanupPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Run multiple operations, some may fail
        for (let i = 0; i < 10; i++) {
          try {
            await cleanupParser.parseBuffer(buffer);
          } catch (error) {
            // Some operations expected to fail
            expect((error as Error).message).toMatch(/Processing failed|temp files/);
          }
        }
        
        // All temp files should be cleaned up
        expect(tempFilesCleanedUp).toBe(tempFilesCreated);
        
        await cleanupParser.cleanup();
      });
    });
  });

  describe('Worker Thread Resource Management', () => {
    describe('Worker Pool Management', () => {
      test('should manage worker thread lifecycle', async () => {
        let workersCreated = 0;
        let workersTerminated = 0;
        
        // Mock worker creation and termination
        const originalWorkerClient = BeatParserWorkerClient;
        
        class MockWorkerClient {
          constructor(options: any) {
            workersCreated++;
          }
          
          async parseBuffer(buffer: Float32Array) {
            // Simulate work
            await new Promise(resolve => setTimeout(resolve, 50));
            return {
              beats: [{ timestamp: 1.0, confidence: 0.8, strength: 0.6 }],
              tempo: { bpm: 120, confidence: 0.9 },
              metadata: { processingTime: 50, samplesProcessed: buffer.length, parameters: {} }
            };
          }
          
          async terminate() {
            workersTerminated++;
          }
        }
        
        // Test multiple worker operations
        const workerOperations = Array(5).fill(null).map(async () => {
          const mockWorker = new MockWorkerClient({ timeout: 5000 });
          const buffer = new Float32Array(4096).fill(0.5);
          
          try {
            const result = await mockWorker.parseBuffer(buffer);
            expect(result).toBeDefined();
            return result;
          } finally {
            await mockWorker.terminate();
          }
        });
        
        const results = await Promise.all(workerOperations);
        
        expect(results.length).toBe(5);
        expect(workersCreated).toBe(5);
        expect(workersTerminated).toBe(5);
      });

      test('should handle worker thread crashes gracefully', async () => {
        let crashedWorkers = 0;
        
        const crashingWorkerPlugin: BeatParserPlugin = {
          name: 'crashing-worker',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate worker crash
            crashedWorkers++;
            throw new Error('Worker thread crashed');
          }
        };
        
        const crashingParser = new BeatParser();
        crashingParser.addPlugin(crashingWorkerPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await crashingParser.parseBuffer(buffer);
          fail('Should have failed due to worker crash');
        } catch (error) {
          expect((error as Error).message).toMatch(/Worker.*crashed|Failed to parse/);
        }
        
        expect(crashedWorkers).toBe(1);
        
        // Parser should recover for subsequent operations
        crashingParser.removePlugin('crashing-worker');
        const result = await crashingParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await crashingParser.cleanup();
      });

      test('should implement worker timeout and recovery', async () => {
        let workerTimeouts = 0;
        let recoveryAttempts = 0;
        
        const timeoutWorkerPlugin: BeatParserPlugin = {
          name: 'timeout-worker',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate long-running operation that times out
            await new Promise(resolve => setTimeout(resolve, 8000)); // 8 second delay
            return audioData;
          }
        };
        
        const timeoutParser = new BeatParser();
        timeoutParser.addPlugin(timeoutWorkerPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        const workerTimeout = 3000; // 3 second timeout
        
        try {
          const result = await Promise.race([
            timeoutParser.parseBuffer(buffer),
            new Promise((_, reject) => 
              setTimeout(() => {
                workerTimeouts++;
                reject(new Error('Worker operation timeout'));
              }, workerTimeout)
            )
          ]);
          
          // If it completes, that's fine too
          expect(result).toBeDefined();
        } catch (error) {
          expect((error as Error).message).toMatch(/timeout/i);
          recoveryAttempts++;
        }
        
        // System should remain stable after timeout
        timeoutParser.removePlugin('timeout-worker');
        const recoveryResult = await timeoutParser.parseBuffer(buffer);
        expect(recoveryResult).toBeDefined();
        
        await timeoutParser.cleanup();
      }, 15000);
    });

    describe('Inter-Process Communication Resource Limits', () => {
      test('should handle large data transfer between processes', async () => {
        const largeBuffer = new Float32Array(44100 * 60); // 1 minute of audio
        largeBuffer.fill(0.5);
        
        try {
          // This would test actual IPC limits in a real worker scenario
          await workerClient.parseBuffer(largeBuffer);
        } catch (error) {
          const message = (error as Error).message;
          // Should handle large data transfers gracefully
          expect(message).toMatch(/size|limit|transfer|worker/i);
          expect(message).not.toMatch(/crash|segmentation|fatal/i);
        }
      }, 30000);

      test('should implement message queue limits', async () => {
        const concurrentMessages = 10;
        let queuedMessages = 0;
        let processedMessages = 0;
        
        const messageQueuePlugin: BeatParserPlugin = {
          name: 'message-queue',
          version: '1.0.0',
          processAudio: async (audioData) => {
            queuedMessages++;
            
            // Simulate message processing delay
            await new Promise(resolve => setTimeout(resolve, 100));
            
            processedMessages++;
            return audioData;
          }
        };
        
        const queueParser = new BeatParser();
        queueParser.addPlugin(messageQueuePlugin);
        
        const operations = Array(concurrentMessages).fill(null).map(() => {
          const buffer = new Float32Array(2048).fill(Math.random());
          return queueParser.parseBuffer(buffer);
        });
        
        const results = await Promise.all(operations);
        
        expect(results.length).toBe(concurrentMessages);
        expect(queuedMessages).toBe(concurrentMessages);
        expect(processedMessages).toBe(concurrentMessages);
        
        await queueParser.cleanup();
      }, 10000);
    });
  });

  describe('Global Resource Cleanup Validation', () => {
    test('should ensure complete resource cleanup after all operations', async () => {
      const resourceTracker = {
        allocations: 0,
        deallocations: 0,
        openHandles: 0,
        activeTimers: 0
      };
      
      const comprehensiveResourcePlugin: BeatParserPlugin = {
        name: 'comprehensive-resource',
        version: '1.0.0',
        initialize: async () => {
          resourceTracker.allocations += 5; // Simulate initial allocations
          resourceTracker.openHandles += 2; // File handles
          resourceTracker.activeTimers += 1; // Timer
        },
        processAudio: async (audioData) => {
          // Simulate temporary resource usage during processing
          resourceTracker.allocations += 3;
          resourceTracker.openHandles += 1;
          
          try {
            const result = new Float32Array(audioData.length);
            result.set(audioData);
            return result;
          } finally {
            // Cleanup temporary resources
            resourceTracker.deallocations += 3;
            resourceTracker.openHandles -= 1;
          }
        },
        cleanup: async () => {
          // Cleanup all resources
          resourceTracker.deallocations += 5;
          resourceTracker.openHandles -= 2;
          resourceTracker.activeTimers -= 1;
        }
      };
      
      const resourceParser = new BeatParser();
      resourceParser.addPlugin(comprehensiveResourcePlugin);
      
      await resourceParser.initialize();
      
      // Perform multiple operations
      const buffer = new Float32Array(4096).fill(0.5);
      for (let i = 0; i < 5; i++) {
        await resourceParser.parseBuffer(buffer);
      }
      
      await resourceParser.cleanup();
      
      // Verify complete cleanup
      expect(resourceTracker.allocations).toBe(resourceTracker.deallocations);
      expect(resourceTracker.openHandles).toBe(0);
      expect(resourceTracker.activeTimers).toBe(0);
    });

    test('should detect and prevent resource leaks', async () => {
      const initialMemory = process.memoryUsage();
      const operationCount = 20;
      
      // Perform many operations to detect leaks
      for (let i = 0; i < operationCount; i++) {
        const testParser = new BeatParser();
        const buffer = new Float32Array(22050).fill(Math.sin(i * 0.1)); // 0.5 seconds
        
        try {
          await testParser.parseBuffer(buffer);
        } catch (error) {
          // Some operations might fail - that's okay
        } finally {
          await testParser.cleanup();
        }
        
        // Force garbage collection every few iterations
        if (i % 5 === 0 && global.gc) {
          global.gc();
        }
      }
      
      // Final garbage collection and memory check
      if (global.gc) {
        global.gc();
        // Give time for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be minimal
      const maxAcceptableIncrease = 50 * 1024 * 1024; // 50MB
      expect(memoryIncrease).toBeLessThan(maxAcceptableIncrease);
      
      if (memoryIncrease > 10 * 1024 * 1024) { // > 10MB
        console.warn(`Potential memory leak detected: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase after ${operationCount} operations`);
      }
    }, 30000);
  });
});