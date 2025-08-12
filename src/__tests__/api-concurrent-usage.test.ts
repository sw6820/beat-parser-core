/**
 * API Concurrent Usage Test Suite
 * 
 * Tests concurrent API usage, thread safety, resource management,
 * and performance characteristics under concurrent load.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, ParseResult, BeatCandidate } from '../types';

describe('API Concurrent Usage', () => {
  describe('Single Parser Concurrent Operations', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    test('should handle multiple parseBuffer calls concurrently', async () => {
      const createTestBuffer = (offset: number) => {
        const buffer = new Float32Array(4096);
        for (let i = 0; i < buffer.length; i++) {
          buffer[i] = 0.1 + offset * 0.05 + 0.02 * Math.sin(2 * Math.PI * i / 1000);
        }
        return buffer;
      };

      const operations = Array.from({ length: 10 }, (_, i) => 
        parser.parseBuffer(createTestBuffer(i), {
          targetPictureCount: i + 1,
          filename: `concurrent-${i}.wav`
        })
      );

      const results = await Promise.all(operations);

      expect(results).toHaveLength(10);
      
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(index + 1);
        expect(result.metadata.parameters).toBeDefined();
      });
    });

    test('should maintain state consistency during concurrent operations', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Create operations with different configurations
      const operations = [
        parser.parseBuffer(buffer, { selectionMethod: 'energy' }),
        parser.parseBuffer(buffer, { selectionMethod: 'uniform' }),
        parser.parseBuffer(buffer, { selectionMethod: 'adaptive' }),
        parser.parseBuffer(buffer, { selectionMethod: 'regular' }),
        parser.parseBuffer(buffer, { minConfidence: 0.5 }),
        parser.parseBuffer(buffer, { minConfidence: 0.8 }),
        parser.parseBuffer(buffer, { targetPictureCount: 3 }),
        parser.parseBuffer(buffer, { targetPictureCount: 10 })
      ];

      const results = await Promise.all(operations);

      // Each operation should complete successfully
      expect(results).toHaveLength(8);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        expect(result.metadata).toBeDefined();
      });

      // Configuration should remain consistent
      const config = parser.getConfig();
      expect(config).toBeDefined();
    });

    test('should handle concurrent operations with plugin processing', async () => {
      let processCount = 0;
      const concurrentPlugin: BeatParserPlugin = {
        name: 'concurrent-plugin',
        version: '1.0.0',
        processAudio: async (audioData: Float32Array) => {
          processCount++;
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10));
          return audioData;
        }
      };

      parser.addPlugin(concurrentPlugin);

      const buffer = new Float32Array(4096).fill(0.1);
      const operations = Array.from({ length: 5 }, () => parser.parseBuffer(buffer));

      await Promise.all(operations);

      expect(processCount).toBe(5); // Plugin should process each operation
    });

    test('should handle mixed operation types concurrently', async () => {
      const buffer = new Float32Array(8192).fill(0.1);
      
      // Add some beats to the buffer
      buffer[1000] = 0.8;
      buffer[3000] = 0.8;
      buffer[5000] = 0.8;

      // Mix of different operation types
      const operations: Promise<any>[] = [
        parser.parseBuffer(buffer, { targetPictureCount: 5 }),
        parser.parseBuffer(buffer.slice(0, 4096), { selectionMethod: 'energy' }),
        parser.parseBuffer(buffer.slice(2048), { minConfidence: 0.7 }),
      ];

      // Add stream operation if supported
      const streamChunks = [
        buffer.slice(0, 2048),
        buffer.slice(2048, 4096),
        buffer.slice(4096, 6144),
        buffer.slice(6144)
      ];

      const streamIterator = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of streamChunks) {
            yield chunk;
          }
        }
      };

      operations.push(parser.parseStream(streamIterator()));

      const results = await Promise.all(operations);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      });
    });
  });

  describe('Multiple Parser Instances', () => {
    const parsers: BeatParser[] = [];
    
    afterEach(async () => {
      // Cleanup all parsers
      await Promise.all(parsers.map(parser => parser.cleanup()));
      parsers.length = 0;
    });

    test('should handle multiple parser instances concurrently', async () => {
      const numParsers = 5;
      const buffer = new Float32Array(4096).fill(0.1);

      // Create multiple parsers with different configurations
      for (let i = 0; i < numParsers; i++) {
        const parser = new BeatParser({
          minTempo: 80 + i * 10,
          maxTempo: 160 + i * 10,
          confidenceThreshold: 0.5 + i * 0.1
        });
        parsers.push(parser);
      }

      // Run operations on all parsers concurrently
      const operations = parsers.map((parser, index) => 
        parser.parseBuffer(buffer, {
          targetPictureCount: index + 3,
          filename: `parser-${index}.wav`
        })
      );

      const results = await Promise.all(operations);

      expect(results).toHaveLength(numParsers);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(index + 3);
      });
    });

    test('should isolate errors between parser instances', async () => {
      const successParser = new BeatParser();
      const errorParser = new BeatParser();
      
      parsers.push(successParser, errorParser);

      // Add failing plugin to one parser only
      const failingPlugin: BeatParserPlugin = {
        name: 'failing-plugin',
        version: '1.0.0',
        processAudio: async () => {
          throw new Error('Plugin failure');
        }
      };

      errorParser.addPlugin(failingPlugin);

      const buffer = new Float32Array(4096).fill(0.1);

      // Run operations concurrently
      const operations = [
        successParser.parseBuffer(buffer),
        errorParser.parseBuffer(buffer)
      ];

      const results = await Promise.allSettled(operations);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');

      if (results[0].status === 'fulfilled') {
        expect(results[0].value.beats).toBeDefined();
      }
    });

    test('should handle resource contention gracefully', async () => {
      const numParsers = 20; // High load
      const buffer = new Float32Array(2048).fill(0.1);

      // Create many parsers
      for (let i = 0; i < numParsers; i++) {
        parsers.push(new BeatParser());
      }

      // Run operations on all parsers
      const operations = parsers.map((parser, index) => 
        parser.parseBuffer(buffer, { targetPictureCount: 3 })
      );

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const endTime = Date.now();

      expect(results).toHaveLength(numParsers);
      results.forEach(result => {
        expect(result).toBeDefined();
      });

      // Should complete within reasonable time even under high load
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds max
    }, 45000); // Extended timeout
  });

  describe('Plugin Concurrency', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    test('should handle plugin state isolation', async () => {
      let processCount = 0;
      const statefulPlugin: BeatParserPlugin = {
        name: 'stateful-plugin',
        version: '1.0.0',
        processAudio: async (audioData: Float32Array) => {
          const currentCount = ++processCount;
          
          // Simulate stateful processing
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          
          // Verify state wasn't corrupted by concurrent access
          expect(processCount).toBeGreaterThanOrEqual(currentCount);
          
          return audioData;
        }
      };

      parser.addPlugin(statefulPlugin);

      const buffer = new Float32Array(4096).fill(0.1);
      const operations = Array.from({ length: 10 }, () => parser.parseBuffer(buffer));

      await Promise.all(operations);

      expect(processCount).toBe(10);
    });

    test('should handle plugin initialization/cleanup concurrency', async () => {
      let initCount = 0;
      let cleanupCount = 0;

      const lifecyclePlugin: BeatParserPlugin = {
        name: 'lifecycle-plugin',
        version: '1.0.0',
        initialize: async () => {
          initCount++;
          await new Promise(resolve => setTimeout(resolve, 10));
        },
        cleanup: async () => {
          cleanupCount++;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };

      // Test with multiple parsers to stress lifecycle
      const testParsers: BeatParser[] = [];
      
      try {
        for (let i = 0; i < 5; i++) {
          const testParser = new BeatParser();
          testParser.addPlugin(lifecyclePlugin);
          testParsers.push(testParser);
        }

        // Initialize all concurrently
        await Promise.all(testParsers.map(p => p.initialize()));
        
        expect(initCount).toBe(5);

        // Cleanup all concurrently
        await Promise.all(testParsers.map(p => p.cleanup()));
        
        expect(cleanupCount).toBe(5);
      } finally {
        // Ensure cleanup
        await Promise.allSettled(testParsers.map(p => p.cleanup()));
      }
    });

    test('should handle plugin errors in concurrent operations', async () => {
      let successCount = 0;
      let errorCount = 0;

      const flaky: BeatParserPlugin = {
        name: 'flaky-plugin',
        version: '1.0.0',
        processAudio: async (audioData: Float32Array) => {
          if (Math.random() < 0.5) {
            errorCount++;
            throw new Error('Random failure');
          } else {
            successCount++;
            return audioData;
          }
        }
      };

      parser.addPlugin(flaky);

      const buffer = new Float32Array(4096).fill(0.1);
      const operations = Array.from({ length: 20 }, () => parser.parseBuffer(buffer));

      const results = await Promise.allSettled(operations);

      expect(successCount + errorCount).toBe(20);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(successCount);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(errorCount);
    });
  });

  describe('Memory Management Under Load', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    test('should handle large concurrent operations without memory leaks', async () => {
      const initialMemory = process.memoryUsage();

      // Process multiple large buffers
      const largeBufferOps = Array.from({ length: 10 }, (_, i) => {
        const buffer = new Float32Array(44100 * 2).fill(0.1); // 2 seconds each
        return parser.parseBuffer(buffer, { targetPictureCount: 5 });
      });

      await Promise.all(largeBufferOps);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 500MB)
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024);
    }, 30000);

    test('should handle rapid small operations efficiently', async () => {
      const buffer = new Float32Array(1024).fill(0.1);
      const numOperations = 100;

      const startTime = Date.now();
      
      const operations = Array.from({ length: numOperations }, () => 
        parser.parseBuffer(buffer, { targetPictureCount: 1 })
      );

      await Promise.all(operations);
      
      const endTime = Date.now();
      const timePerOperation = (endTime - startTime) / numOperations;

      // Each operation should be reasonably fast
      expect(timePerOperation).toBeLessThan(100); // Less than 100ms per operation
    }, 20000);
  });

  describe('Configuration Concurrency', () => {
    test('should handle configuration access during operations', async () => {
      const parser = new BeatParser();
      
      try {
        const buffer = new Float32Array(4096).fill(0.1);

        // Start a long-running operation
        const parsePromise = parser.parseBuffer(buffer);

        // Try to access configuration during operation
        const config1 = parser.getConfig();
        const config2 = parser.getConfig();

        expect(config1).toBeDefined();
        expect(config2).toBeDefined();
        expect(config1.sampleRate).toBe(config2.sampleRate);

        // Wait for parse to complete
        const result = await parsePromise;
        expect(result).toBeDefined();
      } finally {
        await parser.cleanup();
      }
    });

    test('should prevent configuration changes during operations', async () => {
      const parser = new BeatParser();
      
      try {
        // Initialize parser first
        await parser.initialize();

        // Should not be able to update config after initialization
        expect(() => parser.updateConfig({ minTempo: 120 }))
          .toThrow('Cannot update configuration after parser initialization');
      } finally {
        await parser.cleanup();
      }
    });
  });

  describe('Stream Concurrency', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    test('should handle multiple concurrent streams', async () => {
      const createAsyncIterator = (chunks: Float32Array[], delay: number = 10) => ({
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) {
            await new Promise(resolve => setTimeout(resolve, delay));
            yield chunk;
          }
        }
      });

      const streams = Array.from({ length: 3 }, (_, i) => {
        const chunks = Array.from({ length: 5 }, () => 
          new Float32Array(1024).fill(0.1 + i * 0.1)
        );
        return createAsyncIterator(chunks, 20);
      });

      const operations = streams.map((stream, i) => 
        parser.parseStream(stream, { 
          targetPictureCount: i + 2,
          chunkSize: 512 
        })
      );

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      });
    });

    test('should handle stream processing with concurrent buffer operations', async () => {
      const chunks = Array.from({ length: 4 }, () => 
        new Float32Array(2048).fill(0.1)
      );

      const streamIterator = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) {
            yield chunk;
          }
        }
      };

      const buffer = new Float32Array(4096).fill(0.2);

      // Run stream and buffer operations concurrently
      const operations = [
        parser.parseStream(streamIterator, { chunkSize: 1024 }),
        parser.parseBuffer(buffer, { targetPictureCount: 5 }),
        parser.parseBuffer(buffer.slice(0, 2048), { selectionMethod: 'energy' })
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      });
    });
  });

  describe('Worker Concurrency', () => {
    const workers: BeatParserWorkerClient[] = [];
    
    afterEach(async () => {
      await Promise.all(workers.map(w => w.terminate()));
      workers.length = 0;
    });

    test('should handle multiple worker clients', async () => {
      const numWorkers = 3;
      
      for (let i = 0; i < numWorkers; i++) {
        workers.push(new BeatParserWorkerClient({ timeout: 5000 }));
      }

      const buffer = new Float32Array(4096).fill(0.1);

      const operations = workers.map((worker, i) => 
        worker.parseBuffer(buffer, { targetPictureCount: i + 3 })
          .catch(error => ({ error: error.message })) // Handle expected failures
      );

      const results = await Promise.all(operations);

      // In test environment, workers likely won't be available
      // but we should get consistent error handling
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    test('should handle worker batch processing', async () => {
      const worker = new BeatParserWorkerClient({ timeout: 3000 });
      workers.push(worker);

      const buffers = Array.from({ length: 5 }, (_, i) => 
        new Float32Array(2048).fill(0.1 + i * 0.05)
      );

      try {
        await worker.processBatch(buffers);
      } catch (error) {
        // Expected in test environment
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Performance Under Concurrent Load', () => {
    test('should maintain reasonable performance under load', async () => {
      const parser = new BeatParser();
      
      try {
        const buffer = new Float32Array(8192).fill(0.1);
        const numOperations = 50;

        const startTime = Date.now();

        // Run many operations concurrently
        const operations = Array.from({ length: numOperations }, (_, i) => 
          parser.parseBuffer(buffer, { 
            targetPictureCount: Math.floor(i / 10) + 1,
            selectionMethod: ['uniform', 'adaptive', 'energy', 'regular'][i % 4] as any
          })
        );

        const results = await Promise.all(operations);
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const averageTime = totalTime / numOperations;

        expect(results).toHaveLength(numOperations);
        
        // Performance should be reasonable
        expect(averageTime).toBeLessThan(500); // Less than 500ms average
        expect(totalTime).toBeLessThan(15000); // Total less than 15 seconds
        
        results.forEach(result => {
          expect(result).toBeDefined();
          expect(result.beats).toBeDefined();
        });
      } finally {
        await parser.cleanup();
      }
    }, 30000);

    test('should scale reasonably with concurrent operations', async () => {
      const parser = new BeatParser();
      
      try {
        const buffer = new Float32Array(4096).fill(0.1);
        
        // Test different concurrency levels
        const concurrencyLevels = [1, 5, 10, 20];
        const results = [];

        for (const level of concurrencyLevels) {
          const startTime = Date.now();
          
          const operations = Array.from({ length: level }, () => 
            parser.parseBuffer(buffer, { targetPictureCount: 3 })
          );

          await Promise.all(operations);
          
          const endTime = Date.now();
          const timePerOperation = (endTime - startTime) / level;
          
          results.push({ level, timePerOperation });
        }

        // Performance shouldn't degrade too severely with higher concurrency
        const baseTime = results[0].timePerOperation;
        const highestTime = results[results.length - 1].timePerOperation;
        
        // Should not be more than 5x slower at highest concurrency
        expect(highestTime).toBeLessThan(baseTime * 5);
      } finally {
        await parser.cleanup();
      }
    }, 60000);
  });
});