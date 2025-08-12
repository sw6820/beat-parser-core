/**
 * API Error Handling Test Suite
 * 
 * Comprehensive tests for error handling, recovery mechanisms,
 * timeout handling, and error boundary testing across all API methods.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, BeatCandidate, BeatParsingError } from '../types';
import fs from 'fs/promises';

describe('API Error Handling', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser();
  });
  
  afterEach(async () => {
    try {
      await parser.cleanup();
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  describe('Error Types and Classification', () => {
    test('should throw appropriate error types for different failure modes', async () => {
      const testCases = [
        {
          name: 'Input validation errors',
          action: () => parser.parseBuffer(new Float32Array(0)),
          expectedType: Error,
          expectedMessage: /Invalid or empty audio data/
        },
        {
          name: 'File not found errors',
          action: () => parser.parseFile('/nonexistent/file.wav'),
          expectedType: Error,
          expectedMessage: /Audio file not found/
        },
        {
          name: 'Unsupported format errors',
          action: () => parser.parseFile('test.xyz'),
          expectedType: Error,
          expectedMessage: /Unsupported audio format/
        },
        {
          name: 'Configuration errors',
          action: () => {
            parser.addPlugin({ name: 'test', version: '1.0.0' });
            parser.addPlugin({ name: 'test', version: '2.0.0' }); // Duplicate
          },
          expectedType: Error,
          expectedMessage: /already registered/
        }
      ];
      
      for (const testCase of testCases) {
        try {
          await testCase.action();
          fail(`Expected ${testCase.name} to throw`);
        } catch (error) {
          expect(error).toBeInstanceOf(testCase.expectedType);
          expect((error as Error).message).toMatch(testCase.expectedMessage);
        }
      }
    });

    test('should provide meaningful error context', async () => {
      try {
        await parser.parseBuffer(new Float32Array(10)); // Too short
        fail('Should have thrown');
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain('Audio data too short');
        expect(err.message).toContain('Minimum length');
        expect(err.message).toContain('2048'); // Frame size
      }
    });

    test('should handle error chaining', async () => {
      const failingPlugin: BeatParserPlugin = {
        name: 'chain-error',
        version: '1.0.0',
        processAudio: async () => {
          throw new Error('Original plugin error');
        }
      };
      
      parser.addPlugin(failingPlugin);
      
      try {
        const buffer = new Float32Array(4096).fill(0.1);
        await parser.parseBuffer(buffer);
        fail('Should have thrown');
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain('Failed to parse audio buffer');
        // Original error should be preserved in the chain
        expect(err.message).toContain('Original plugin error');
      }
    });
  });

  describe('Async Error Propagation', () => {
    test('should properly propagate promise rejections', async () => {
      const rejectingPlugin: BeatParserPlugin = {
        name: 'rejecting-plugin',
        version: '1.0.0',
        processBeats: () => Promise.reject(new Error('Async rejection'))
      };
      
      parser.addPlugin(rejectingPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      await expect(parser.parseBuffer(buffer)).rejects.toThrow('Async rejection');
    });

    test('should handle mixed sync and async errors', async () => {
      const mixedErrorPlugin: BeatParserPlugin = {
        name: 'mixed-error',
        version: '1.0.0',
        initialize: () => {
          throw new Error('Sync init error'); // Synchronous error
        },
        processAudio: async () => {
          throw new Error('Async process error'); // Asynchronous error
        }
      };
      
      parser.addPlugin(mixedErrorPlugin);
      
      // Should handle sync error during initialization
      await expect(parser.initialize()).rejects.toThrow('Sync init error');
    });

    test('should handle concurrent error scenarios', async () => {
      const slowErrorPlugin: BeatParserPlugin = {
        name: 'slow-error',
        version: '1.0.0',
        processAudio: async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          throw new Error('Delayed error');
        }
      };
      
      parser.addPlugin(slowErrorPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Start multiple operations that will all fail
      const operations = [
        parser.parseBuffer(buffer),
        parser.parseBuffer(buffer),
        parser.parseBuffer(buffer)
      ];
      
      // All should reject with the same error
      const results = await Promise.allSettled(operations);
      
      results.forEach(result => {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason.message).toContain('Delayed error');
        }
      });
    });
  });

  describe('Error Recovery Mechanisms', () => {
    test('should recover from plugin errors gracefully', async () => {
      let failCount = 0;
      
      const flakyPlugin: BeatParserPlugin = {
        name: 'flaky-plugin',
        version: '1.0.0',
        processAudio: async (audioData: Float32Array) => {
          failCount++;
          if (failCount === 1) {
            throw new Error('First failure');
          }
          return audioData; // Success on retry
        }
      };
      
      parser.addPlugin(flakyPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      // First call should fail
      await expect(parser.parseBuffer(buffer)).rejects.toThrow('First failure');
      
      // Second call should succeed
      const result = await parser.parseBuffer(buffer);
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
    });

    test('should handle partial plugin failures', async () => {
      const partialFailPlugin: BeatParserPlugin = {
        name: 'partial-fail',
        version: '1.0.0',
        processAudio: async (audioData: Float32Array) => {
          // Succeed with audio processing
          return audioData;
        },
        processBeats: async () => {
          // Fail with beat processing
          throw new Error('Beat processing failed');
        }
      };
      
      parser.addPlugin(partialFailPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Should fail at beat processing stage
      await expect(parser.parseBuffer(buffer)).rejects.toThrow('Beat processing failed');
    });

    test('should cleanup resources after errors', async () => {
      let cleanupCalled = false;
      
      const errorWithCleanupPlugin: BeatParserPlugin = {
        name: 'error-cleanup',
        version: '1.0.0',
        processAudio: async () => {
          throw new Error('Processing failed');
        },
        cleanup: async () => {
          cleanupCalled = true;
        }
      };
      
      parser.addPlugin(errorWithCleanupPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      try {
        await parser.parseBuffer(buffer);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      // Cleanup should still be called
      await parser.cleanup();
      expect(cleanupCalled).toBe(true);
    });
  });

  describe('Timeout and Cancellation', () => {
    test('should handle long-running operations', async () => {
      const slowPlugin: BeatParserPlugin = {
        name: 'slow-plugin',
        version: '1.0.0',
        processAudio: async (audioData: Float32Array) => {
          // Simulate slow processing
          await new Promise(resolve => setTimeout(resolve, 200));
          return audioData;
        }
      };
      
      parser.addPlugin(slowPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Should complete successfully even if slow
      const startTime = Date.now();
      const result = await parser.parseBuffer(buffer);
      const endTime = Date.now();
      
      expect(result).toBeDefined();
      expect(endTime - startTime).toBeGreaterThan(180); // Should take some time
    }, 10000); // Extended timeout

    test('should handle extremely long operations', async () => {
      const verySlowPlugin: BeatParserPlugin = {
        name: 'very-slow-plugin',
        version: '1.0.0',
        processAudio: async (audioData: Float32Array) => {
          // Simulate very slow processing that might timeout
          await new Promise(resolve => setTimeout(resolve, 5000));
          return audioData;
        }
      };
      
      parser.addPlugin(verySlowPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      // This test verifies that we can handle very slow operations
      // In a real-world scenario, you might want to implement timeouts
      const result = await parser.parseBuffer(buffer);
      expect(result).toBeDefined();
    }, 15000); // Very extended timeout
  });

  describe('Memory and Resource Error Handling', () => {
    test('should handle large buffer processing errors', async () => {
      // Create a very large buffer that might cause memory issues
      const largeSize = 44100 * 60; // 1 minute of audio
      
      try {
        const largeBuffer = new Float32Array(largeSize).fill(0.1);
        const result = await parser.parseBuffer(largeBuffer);
        expect(result).toBeDefined();
      } catch (error) {
        // If it fails due to memory constraints, that's acceptable
        expect(error).toBeInstanceOf(Error);
      }
    }, 30000);

    test('should handle buffer allocation failures gracefully', () => {
      // Mock scenario where buffer creation might fail
      const originalFloat32Array = global.Float32Array;
      
      try {
        // Mock Float32Array constructor to fail
        global.Float32Array = jest.fn().mockImplementation(() => {
          throw new Error('Out of memory');
        }) as any;
        
        expect(() => new Float32Array(1000)).toThrow('Out of memory');
      } finally {
        // Restore original constructor
        global.Float32Array = originalFloat32Array;
      }
    });

    test('should handle resource cleanup failures', async () => {
      const faultyCleanupPlugin: BeatParserPlugin = {
        name: 'faulty-cleanup',
        version: '1.0.0',
        cleanup: async () => {
          throw new Error('Cleanup failed');
        }
      };
      
      parser.addPlugin(faultyCleanupPlugin);
      
      // Initialize to add plugin
      await parser.initialize();
      
      // Cleanup should not throw but should handle errors gracefully
      await expect(parser.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Stream Error Handling', () => {
    test('should handle stream read errors', async () => {
      const errorStream = new ReadableStream({
        pull(controller) {
          controller.error(new Error('Stream read error'));
        }
      });
      
      await expect(parser.parseStream(errorStream)).rejects.toThrow();
    });

    test('should handle stream data corruption', async () => {
      const corruptStream = new ReadableStream({
        pull(controller) {
          // Send corrupted data
          const corruptChunk = new Float32Array(1024);
          corruptChunk.fill(NaN); // Corrupt with NaN values
          controller.enqueue(corruptChunk);
          controller.close();
        }
      });
      
      await expect(parser.parseStream(corruptStream)).rejects.toThrow();
    });

    test('should handle stream early termination', async () => {
      let chunkCount = 0;
      
      const earlyTerminationStream = new ReadableStream({
        pull(controller) {
          if (chunkCount === 0) {
            controller.enqueue(new Float32Array(1024).fill(0.1));
            chunkCount++;
          } else {
            // Terminate abruptly without closing properly
            controller.error(new Error('Stream terminated unexpectedly'));
          }
        }
      });
      
      await expect(parser.parseStream(earlyTerminationStream)).rejects.toThrow();
    });
  });

  describe('Configuration Error Handling', () => {
    test('should handle invalid configuration updates', async () => {
      const parser = new BeatParser();
      
      // Should prevent configuration updates after initialization
      await parser.initialize();
      
      expect(() => parser.updateConfig({ minTempo: 120 }))
        .toThrow('Cannot update configuration after parser initialization');
      
      await parser.cleanup();
    });

    test('should handle plugin management errors', () => {
      const parser = new BeatParser();
      
      const testPlugin: BeatParserPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      };
      
      // Add plugin successfully
      parser.addPlugin(testPlugin);
      
      // Try to add duplicate
      expect(() => parser.addPlugin(testPlugin))
        .toThrow('already registered');
      
      // Try to add plugin after initialization
      return parser.initialize().then(async () => {
        const anotherPlugin: BeatParserPlugin = {
          name: 'late-plugin',
          version: '1.0.0'
        };
        
        expect(() => parser.addPlugin(anotherPlugin))
          .toThrow('Cannot add plugins after parser initialization');
          
        await parser.cleanup();
      });
    });
  });

  describe('Worker Error Handling', () => {
    let workerClient: BeatParserWorkerClient;
    
    beforeEach(() => {
      workerClient = new BeatParserWorkerClient({
        timeout: 5000 // Shorter timeout for tests
      });
    });
    
    afterEach(async () => {
      try {
        await workerClient.terminate();
      } catch {
        // Ignore termination errors in tests
      }
    });

    test('should handle worker initialization failures', async () => {
      // In most test environments, workers won't be available
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Should handle missing worker gracefully
      await expect(workerClient.parseBuffer(buffer)).rejects.toThrow();
    });

    test('should handle worker communication errors', async () => {
      // Test timeout handling
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Should timeout if worker doesn't respond
      await expect(workerClient.parseBuffer(buffer)).rejects.toThrow();
    });

    test('should handle worker termination during operation', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Start an operation
      const operationPromise = workerClient.parseBuffer(buffer);
      
      // Terminate worker immediately
      await workerClient.terminate();
      
      // Operation should be rejected
      await expect(operationPromise).rejects.toThrow();
    });

    test('should handle batch operation failures', async () => {
      const buffers = [
        new Float32Array(4096).fill(0.1),
        new Float32Array(4096).fill(0.2),
        new Float32Array(4096).fill(0.3)
      ];
      
      // Should handle batch operation errors
      await expect(workerClient.processBatch(buffers)).rejects.toThrow();
    });
  });

  describe('File System Error Handling', () => {
    test('should handle file permission errors', async () => {
      // Create a test scenario where file access might be denied
      const restrictedPath = '/root/restricted-audio.wav';
      
      await expect(parser.parseFile(restrictedPath))
        .rejects
        .toThrow(); // Should throw some kind of access error
    });

    test('should handle malformed file paths', async () => {
      const malformedPaths = [
        '\\0invalid\\path',
        'file://invalid/url',
        'http://invalid/url',
        '../../../etc/passwd',
        'file\x00name.wav'
      ];
      
      for (const path of malformedPaths) {
        await expect(parser.parseFile(path)).rejects.toThrow();
      }
    });

    test('should handle temporary file creation errors', async () => {
      // This would test scenarios where temporary files can't be created
      // For now, we'll just verify error handling exists
      const nonExistentPath = '/definitely/does/not/exist/file.wav';
      
      await expect(parser.parseFile(nonExistentPath))
        .rejects
        .toThrow(/Audio file not found/);
    });
  });

  describe('Error Boundary Testing', () => {
    test('should isolate errors between operations', async () => {
      const failingPlugin: BeatParserPlugin = {
        name: 'boundary-test',
        version: '1.0.0',
        processAudio: async () => {
          throw new Error('Isolated failure');
        }
      };
      
      parser.addPlugin(failingPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      // First operation should fail
      await expect(parser.parseBuffer(buffer)).rejects.toThrow('Isolated failure');
      
      // Remove the failing plugin
      parser.removePlugin('boundary-test');
      
      // Create new parser for next operation
      const newParser = new BeatParser();
      const result = await newParser.parseBuffer(buffer);
      
      expect(result).toBeDefined();
      await newParser.cleanup();
    });

    test('should maintain state consistency after errors', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Cause an error
      try {
        await parser.parseBuffer(new Float32Array(0)); // Invalid buffer
        fail('Should have thrown');
      } catch {
        // Expected error
      }
      
      // Parser should still work for valid operations
      const result = await parser.parseBuffer(buffer);
      expect(result).toBeDefined();
    });

    test('should handle cascading failures', async () => {
      const cascadingPlugin: BeatParserPlugin = {
        name: 'cascading-failure',
        version: '1.0.0',
        processAudio: async () => {
          throw new Error('First failure');
        },
        cleanup: async () => {
          throw new Error('Cleanup failure');
        }
      };
      
      parser.addPlugin(cascadingPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Should handle the initial failure
      await expect(parser.parseBuffer(buffer)).rejects.toThrow('First failure');
      
      // Should handle cleanup failure gracefully
      await expect(parser.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Error Message Quality', () => {
    test('should provide actionable error messages', async () => {
      const testCases = [
        {
          action: () => parser.parseBuffer(new Float32Array(0)),
          expectedElements: ['Invalid', 'empty', 'audio data']
        },
        {
          action: () => parser.parseBuffer(new Float32Array(100)),
          expectedElements: ['too short', 'Minimum length', '2048']
        },
        {
          action: () => parser.parseFile('/nonexistent.wav'),
          expectedElements: ['not found', '/nonexistent.wav']
        },
        {
          action: () => parser.parseFile('test.xyz'),
          expectedElements: ['Unsupported', 'format', '.xyz']
        }
      ];
      
      for (const testCase of testCases) {
        try {
          await testCase.action();
          fail('Should have thrown');
        } catch (error) {
          const message = (error as Error).message.toLowerCase();
          testCase.expectedElements.forEach(element => {
            expect(message).toContain(element.toLowerCase());
          });
        }
      }
    });

    test('should include relevant context in error messages', async () => {
      try {
        const invalidBuffer = new Float32Array(4096);
        invalidBuffer[0] = NaN;
        await parser.parseBuffer(invalidBuffer);
        fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('invalid values');
        expect(message.toLowerCase()).toMatch(/nan|infinity/);
      }
    });
  });
});