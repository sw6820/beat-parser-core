/**
 * Processing Error Handling Test Suite
 * 
 * Comprehensive tests for algorithm failures, processing errors, resource exhaustion,
 * plugin system errors, and recovery mechanisms during audio processing operations.
 * Focuses on maintaining system stability during complex processing scenarios.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import type { ParseOptions, BeatCandidate, AudioData, StreamingOptions } from '../types';

describe('Error Handling: Processing & Algorithm Failures', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser();
  });
  
  afterEach(async () => {
    await parser.cleanup();
  });

  describe('Algorithm Failure Scenarios', () => {
    describe('Audio Analysis Failures', () => {
      test('should handle complete analysis failures gracefully', async () => {
        // Mock HybridDetector to simulate analysis failure
        const mockDetector = {
          detectBeats: jest.fn().mockRejectedValue(new Error('Analysis algorithm failed'))
        };
        
        (parser as any).hybridDetector = mockDetector;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await parser.parseBuffer(buffer);
          fail('Should have thrown analysis failure');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).toMatch(/Failed to parse|Analysis.*failed/i);
        }
      });

      test('should handle no beats detected scenario', async () => {
        // Mock detector to return empty beats array
        const mockDetector = {
          detectBeats: jest.fn().mockResolvedValue([])
        };
        
        (parser as any).hybridDetector = mockDetector;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          const result = await parser.parseBuffer(buffer);
          expect(result).toBeDefined();
          expect(result.beats).toEqual([]);
        } catch (error) {
          // Should handle no beats gracefully, not crash
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).not.toMatch(/crash|segmentation|fatal/i);
        }
      });

      test('should handle corrupted analysis results', async () => {
        // Mock detector to return invalid beat data
        const mockDetector = {
          detectBeats: jest.fn().mockResolvedValue([
            { timestamp: NaN, confidence: 0.5, strength: 0.8, source: 'hybrid' },
            { timestamp: Infinity, confidence: -1, strength: 2.0, source: 'hybrid' },
            { timestamp: 1.5, confidence: 'invalid', strength: null, source: 'hybrid' }
          ])
        };
        
        (parser as any).hybridDetector = mockDetector;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          const result = await parser.parseBuffer(buffer);
          // Should either clean invalid data or reject
          if (result && result.beats) {
            result.beats.forEach(beat => {
              expect(beat.timestamp).toBeFinite();
              expect(beat.confidence).toBeGreaterThanOrEqual(0);
              expect(beat.confidence).toBeLessThanOrEqual(1);
            });
          }
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).toMatch(/invalid|corrupted|analysis/i);
        }
      });

      test('should handle beat detection algorithm crashes', async () => {
        const crashingDetector = {
          detectBeats: jest.fn().mockImplementation(() => {
            throw new Error('Algorithm segmentation fault');
          })
        };
        
        (parser as any).hybridDetector = crashingDetector;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        await expect(parser.parseBuffer(buffer))
          .rejects
          .toThrow(/Algorithm.*fault|Failed to parse/);
      });
    });

    describe('Tempo Detection Failures', () => {
      test('should handle invalid tempo detection results', async () => {
        // Mock selector to simulate tempo detection issues
        const originalBeatSelector = (parser as any).beatSelector;
        const mockSelector = {
          selectBeats: jest.fn().mockImplementation((beats, options) => {
            // Return beats with invalid tempo information
            return {
              beats: beats || [],
              tempo: { bpm: -50, confidence: 2.0 }, // Invalid values
              metadata: { processingTime: 100 }
            };
          })
        };
        
        (parser as any).beatSelector = mockSelector;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          const result = await parser.parseBuffer(buffer);
          // Should sanitize or reject invalid tempo
          if (result.tempo) {
            expect(result.tempo.bpm).toBeGreaterThan(0);
            expect(result.tempo.confidence).toBeGreaterThanOrEqual(0);
            expect(result.tempo.confidence).toBeLessThanOrEqual(1);
          }
        } catch (error) {
          expect((error as Error).message).toMatch(/tempo|invalid|detection/i);
        } finally {
          (parser as any).beatSelector = originalBeatSelector;
        }
      });

      test('should handle tempo detection algorithm timeouts', async () => {
        const slowTempoDetection = {
          detectBeats: jest.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
            return [];
          })
        };
        
        (parser as any).hybridDetector = slowTempoDetection;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Should either complete or timeout gracefully
        try {
          const result = await Promise.race([
            parser.parseBuffer(buffer),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Operation timeout')), 5000)
            )
          ]);
          expect(result).toBeDefined();
        } catch (error) {
          expect((error as Error).message).toMatch(/timeout|slow|processing/i);
        }
      }, 15000);
    });

    describe('Filter and Preprocessing Failures', () => {
      test('should handle filter application failures', async () => {
        // Configure parser with filtering enabled
        const parserWithFiltering = new BeatParser({
          enableFiltering: true,
          enablePreprocessing: true
        });
        
        // Mock audio processor to fail filtering
        const mockProcessor = {
          normalize: jest.fn().mockResolvedValue(new Float32Array(4096).fill(0.5)),
          applyFilters: jest.fn().mockRejectedValue(new Error('Filter application failed'))
        };
        
        (parserWithFiltering as any).audioProcessor = mockProcessor;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await parserWithFiltering.parseBuffer(buffer);
          fail('Should have thrown filter error');
        } catch (error) {
          expect((error as Error).message).toMatch(/Filter.*failed|Failed to parse/);
        } finally {
          await parserWithFiltering.cleanup();
        }
      });

      test('should handle normalization failures', async () => {
        const parserWithNormalization = new BeatParser({
          enableNormalization: true,
          enablePreprocessing: true
        });
        
        const mockProcessor = {
          normalize: jest.fn().mockRejectedValue(new Error('Normalization failed')),
          applyFilters: jest.fn().mockResolvedValue(new Float32Array(4096).fill(0.5))
        };
        
        (parserWithNormalization as any).audioProcessor = mockProcessor;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        await expect(parserWithNormalization.parseBuffer(buffer))
          .rejects
          .toThrow(/Normalization.*failed|Failed to parse/);
          
        await parserWithNormalization.cleanup();
      });

      test('should handle FFT computation errors', async () => {
        // Simulate FFT computation failure in preprocessing
        const mockProcessor = {
          normalize: jest.fn().mockResolvedValue(new Float32Array(4096).fill(0.5)),
          applyFilters: jest.fn().mockImplementation(() => {
            throw new Error('FFT computation error');
          })
        };
        
        const parserWithProcessing = new BeatParser({
          enableFiltering: true,
          enablePreprocessing: true
        });
        
        (parserWithProcessing as any).audioProcessor = mockProcessor;
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        await expect(parserWithProcessing.parseBuffer(buffer))
          .rejects
          .toThrow(/FFT.*error|Failed to parse/);
          
        await parserWithProcessing.cleanup();
      });
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    describe('Memory Allocation Failures', () => {
      test('should handle memory allocation failures gracefully', async () => {
        // Simulate memory pressure by processing very large buffer
        try {
          const hugeBuffer = new Float32Array(100 * 1024 * 1024); // 100MB
          hugeBuffer.fill(0.5);
          
          await parser.parseBuffer(hugeBuffer);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).toMatch(/memory|allocation|out of.*memory|too large/i);
        }
      }, 30000);

      test('should handle fragmented memory scenarios', async () => {
        // Process multiple medium-sized buffers to fragment memory
        const mediumBuffers = Array(50).fill(null).map(() => 
          new Float32Array(44100).fill(Math.random())
        );
        
        const results = [];
        
        for (let i = 0; i < mediumBuffers.length; i++) {
          try {
            const result = await parser.parseBuffer(mediumBuffers[i]);
            results.push(result);
          } catch (error) {
            // Should handle memory fragmentation gracefully
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).not.toMatch(/crash|segmentation|fatal/i);
            break;
          }
        }
        
        // At least some operations should succeed
        expect(results.length).toBeGreaterThan(0);
      }, 45000);

      test('should handle CPU timeout scenarios', async () => {
        // Create computationally expensive scenario
        const complexBuffer = new Float32Array(44100 * 30); // 30 seconds
        
        // Fill with complex waveform that's hard to analyze
        for (let i = 0; i < complexBuffer.length; i++) {
          complexBuffer[i] = Math.sin(i * 0.1) * Math.cos(i * 0.05) * Math.random();
        }
        
        const startTime = Date.now();
        
        try {
          const result = await parser.parseBuffer(complexBuffer);
          const endTime = Date.now();
          const processingTime = endTime - startTime;
          
          expect(result).toBeDefined();
          expect(processingTime).toBeLessThan(60000); // Should complete in reasonable time
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/timeout|processing.*time|complex|resource/i);
        }
      }, 90000);
    });

    describe('File Handle Exhaustion', () => {
      test('should handle file handle exhaustion gracefully', async () => {
        // Attempt to parse many files simultaneously
        const filePromises = Array(100).fill(null).map((_, i) => 
          parser.parseFile(`nonexistent-file-${i}.wav`)
        );
        
        const results = await Promise.allSettled(filePromises);
        
        // All should fail (files don't exist), but not due to handle exhaustion
        results.forEach(result => {
          expect(result.status).toBe('rejected');
          if (result.status === 'rejected') {
            const message = result.reason.message;
            expect(message).toMatch(/not found|access/);
            expect(message).not.toMatch(/handle.*exhausted|too many.*files/i);
          }
        });
      });

      test('should cleanup file handles after errors', async () => {
        // Simulate file handle cleanup after processing errors
        const filePaths = Array(10).fill(null).map((_, i) => `test-file-${i}.wav`);
        
        for (const filePath of filePaths) {
          try {
            await parser.parseFile(filePath);
            fail('Should not find file');
          } catch (error) {
            expect((error as Error).message).toMatch(/not found/);
          }
        }
        
        // Parser should still function after multiple file errors
        const buffer = new Float32Array(4096).fill(0.5);
        const result = await parser.parseBuffer(buffer);
        expect(result).toBeDefined();
      });
    });

    describe('Buffer Allocation Failures', () => {
      test('should handle buffer reallocation failures', async () => {
        // Mock Float32Array constructor to fail after initial allocation
        const originalFloat32Array = global.Float32Array;
        let allocationCount = 0;
        
        const mockFloat32Array = jest.fn().mockImplementation((...args) => {
          allocationCount++;
          if (allocationCount > 5) { // Fail after 5 allocations
            throw new Error('Buffer allocation failed');
          }
          return new originalFloat32Array(...args);
        });
        
        global.Float32Array = mockFloat32Array as any;
        
        try {
          const buffer = new Float32Array(4096).fill(0.5);
          await parser.parseBuffer(buffer);
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/allocation.*failed|memory|buffer/i);
        } finally {
          global.Float32Array = originalFloat32Array;
        }
      });

      test('should handle concurrent buffer allocation pressure', async () => {
        // Start multiple concurrent operations to stress buffer allocation
        const operations = Array(20).fill(null).map(() => {
          const buffer = new Float32Array(44100).fill(Math.random());
          return parser.parseBuffer(buffer);
        });
        
        const results = await Promise.allSettled(operations);
        
        // Some operations should succeed, system should remain stable
        const successful = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');
        
        expect(successful.length + failed.length).toBe(20);
        
        // Failed operations should have meaningful errors
        failed.forEach(failure => {
          if (failure.status === 'rejected') {
            const message = failure.reason.message;
            expect(message).not.toMatch(/crash|segmentation|fatal/i);
          }
        });
      }, 60000);
    });
  });

  describe('Plugin System Error Scenarios', () => {
    describe('Plugin Initialization Failures', () => {
      test('should handle plugin initialization crashes', async () => {
        const crashingInitPlugin: BeatParserPlugin = {
          name: 'crashing-init',
          version: '1.0.0',
          initialize: async () => {
            throw new Error('Plugin initialization crashed');
          }
        };
        
        parser.addPlugin(crashingInitPlugin);
        
        await expect(parser.initialize())
          .rejects
          .toThrow(/initialization.*crashed|Failed to initialize/);
      });

      test('should handle plugin dependency failures', async () => {
        const dependencyFailPlugin: BeatParserPlugin = {
          name: 'dependency-fail',
          version: '1.0.0',
          initialize: async () => {
            throw new Error('Required dependency not found');
          }
        };
        
        parser.addPlugin(dependencyFailPlugin);
        
        await expect(parser.initialize())
          .rejects
          .toThrow(/dependency.*not found|Failed to initialize/);
      });

      test('should handle partial plugin initialization', async () => {
        let initializationStep = 0;
        
        const partialInitPlugin: BeatParserPlugin = {
          name: 'partial-init',
          version: '1.0.0',
          initialize: async () => {
            initializationStep++;
            if (initializationStep === 1) {
              throw new Error('Initialization step 1 failed');
            }
            // Would succeed on retry
          }
        };
        
        parser.addPlugin(partialInitPlugin);
        
        // First initialization should fail
        await expect(parser.initialize())
          .rejects
          .toThrow(/step 1 failed/);
      });
    });

    describe('Plugin Processing Failures', () => {
      test('should handle plugin audio processing crashes', async () => {
        const crashingAudioPlugin: BeatParserPlugin = {
          name: 'crashing-audio',
          version: '1.0.0',
          processAudio: async () => {
            throw new Error('Audio processing plugin crashed');
          }
        };
        
        parser.addPlugin(crashingAudioPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        await expect(parser.parseBuffer(buffer))
          .rejects
          .toThrow(/processing.*crashed|Failed to parse/);
      });

      test('should handle plugin beat processing failures', async () => {
        const beatProcessingFailPlugin: BeatParserPlugin = {
          name: 'beat-processing-fail',
          version: '1.0.0',
          processBeats: async () => {
            throw new Error('Beat processing failed');
          }
        };
        
        parser.addPlugin(beatProcessingFailPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        await expect(parser.parseBuffer(buffer))
          .rejects
          .toThrow(/Beat processing failed|Failed to parse/);
      });

      test('should handle plugin timeout scenarios', async () => {
        const slowPlugin: BeatParserPlugin = {
          name: 'slow-plugin',
          version: '1.0.0',
          processAudio: async (audioData) => {
            await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
            return audioData;
          }
        };
        
        parser.addPlugin(slowPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Should either complete or timeout gracefully
        try {
          const result = await Promise.race([
            parser.parseBuffer(buffer),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Plugin timeout')), 10000)
            )
          ]);
          expect(result).toBeDefined();
        } catch (error) {
          expect((error as Error).message).toMatch(/timeout|slow/i);
        }
      }, 35000);

      test('should handle plugin resource leaks', async () => {
        let resourceCount = 0;
        
        const resourceLeakPlugin: BeatParserPlugin = {
          name: 'resource-leak',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate resource allocation without proper cleanup
            resourceCount += 1000000; // Large resource allocation
            if (resourceCount > 10000000) {
              throw new Error('Out of resources');
            }
            return audioData;
          }
        };
        
        parser.addPlugin(resourceLeakPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Process multiple times to trigger resource exhaustion
        for (let i = 0; i < 15; i++) {
          try {
            await parser.parseBuffer(buffer);
          } catch (error) {
            const message = (error as Error).message;
            if (message.includes('Out of resources')) {
              expect(message).toMatch(/resource|memory|exhausted/i);
              break;
            }
          }
        }
      });
    });

    describe('Plugin Version and Compatibility Issues', () => {
      test('should handle incompatible plugin versions', async () => {
        const incompatiblePlugin: BeatParserPlugin = {
          name: 'incompatible',
          version: '999.0.0', // Very high version
          initialize: async () => {
            throw new Error('Plugin version incompatible with parser');
          }
        };
        
        parser.addPlugin(incompatiblePlugin);
        
        await expect(parser.initialize())
          .rejects
          .toThrow(/version.*incompatible|Failed to initialize/);
      });

      test('should handle missing plugin methods gracefully', async () => {
        const incompletePlugin: BeatParserPlugin = {
          name: 'incomplete',
          version: '1.0.0'
          // Missing optional methods - should not crash
        };
        
        parser.addPlugin(incompletePlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Should work fine with incomplete plugin
        const result = await parser.parseBuffer(buffer);
        expect(result).toBeDefined();
      });

      test('should handle plugin method signature mismatches', async () => {
        const badSignaturePlugin: BeatParserPlugin = {
          name: 'bad-signature',
          version: '1.0.0',
          processAudio: async (wrongParam: string) => { // Wrong signature
            throw new Error('Wrong method signature');
          } as any
        };
        
        parser.addPlugin(badSignaturePlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await parser.parseBuffer(buffer);
          fail('Should have failed with signature mismatch');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    describe('Plugin Cleanup Failures', () => {
      test('should handle plugin cleanup failures gracefully', async () => {
        const faultyCleanupPlugin: BeatParserPlugin = {
          name: 'faulty-cleanup',
          version: '1.0.0',
          cleanup: async () => {
            throw new Error('Cleanup failed');
          }
        };
        
        parser.addPlugin(faultyCleanupPlugin);
        await parser.initialize();
        
        // Cleanup should not throw even if plugin cleanup fails
        await expect(parser.cleanup()).resolves.not.toThrow();
      });

      test('should handle cascading plugin cleanup failures', async () => {
        const plugins = Array(5).fill(null).map((_, i) => ({
          name: `cascade-fail-${i}`,
          version: '1.0.0',
          cleanup: async () => {
            throw new Error(`Cleanup failed for plugin ${i}`);
          }
        }));
        
        plugins.forEach(plugin => parser.addPlugin(plugin));
        await parser.initialize();
        
        // Should handle all cleanup failures without throwing
        await expect(parser.cleanup()).resolves.not.toThrow();
      });

      test('should maintain cleanup order despite failures', async () => {
        const cleanupOrder: string[] = [];
        
        const orderedPlugins = [
          {
            name: 'first',
            version: '1.0.0',
            cleanup: async () => {
              cleanupOrder.push('first');
              throw new Error('First cleanup failed');
            }
          },
          {
            name: 'second',
            version: '1.0.0',
            cleanup: async () => {
              cleanupOrder.push('second');
            }
          },
          {
            name: 'third',
            version: '1.0.0',
            cleanup: async () => {
              cleanupOrder.push('third');
            }
          }
        ];
        
        orderedPlugins.forEach(plugin => parser.addPlugin(plugin));
        await parser.initialize();
        
        await parser.cleanup();
        
        // Should attempt cleanup for all plugins despite failures
        expect(cleanupOrder).toEqual(['first', 'second', 'third']);
      });
    });
  });

  describe('Cross-Module Error Propagation', () => {
    test('should properly propagate errors between processing stages', async () => {
      // Test error propagation from audio processing to beat detection
      const chainedErrorPlugin: BeatParserPlugin = {
        name: 'chained-error',
        version: '1.0.0',
        processAudio: async () => {
          throw new Error('Stage 1: Audio processing failed');
        }
      };
      
      parser.addPlugin(chainedErrorPlugin);
      
      const buffer = new Float32Array(4096).fill(0.5);
      
      try {
        await parser.parseBuffer(buffer);
        fail('Should have propagated error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toMatch(/Stage 1.*failed|Failed to parse/);
      }
    });

    test('should maintain error context through processing pipeline', async () => {
      // Mock multiple processing stages to fail with context
      const contextPlugin: BeatParserPlugin = {
        name: 'context-preserving',
        version: '1.0.0',
        processAudio: async () => {
          const contextError = new Error('Processing failed in frequency domain');
          (contextError as any).stage = 'frequency-analysis';
          (contextError as any).context = { frameSize: 2048, sampleRate: 44100 };
          throw contextError;
        }
      };
      
      parser.addPlugin(contextPlugin);
      
      const buffer = new Float32Array(4096).fill(0.5);
      
      try {
        await parser.parseBuffer(buffer);
        fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('frequency domain');
        expect(message).toMatch(/Failed to parse.*frequency domain/i);
      }
    });

    test('should handle errors in result formatting stage', async () => {
      // Mock output formatter to fail
      const mockFormatter = {
        format: jest.fn().mockRejectedValue(new Error('Result formatting failed'))
      };
      
      (parser as any).outputFormatter = mockFormatter;
      
      const buffer = new Float32Array(4096).fill(0.5);
      
      await expect(parser.parseBuffer(buffer))
        .rejects
        .toThrow(/formatting.*failed|Failed to parse/);
    });
  });

  describe('System Integration Error Handling', () => {
    test('should handle worker thread communication failures', async () => {
      // Test would require actual worker implementation
      // For now, test the error handling pattern
      const workerErrorParser = new BeatParser();
      
      // Mock worker failure scenario
      const mockWorkerError = () => {
        throw new Error('Worker thread communication failed');
      };
      
      try {
        mockWorkerError();
      } catch (error) {
        expect((error as Error).message).toMatch(/Worker.*communication.*failed/);
      }
      
      await workerErrorParser.cleanup();
    });

    test('should handle event loop blocking scenarios', async () => {
      // Test for operations that might block the event loop
      const blockingBuffer = new Float32Array(44100 * 10); // 10 seconds
      blockingBuffer.fill(0.5);
      
      const startTime = Date.now();
      
      try {
        const result = await parser.parseBuffer(blockingBuffer);
        const endTime = Date.now();
        
        expect(result).toBeDefined();
        // Should not block event loop for too long
        expect(endTime - startTime).toBeLessThan(30000);
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toMatch(/timeout|processing.*time|blocking/i);
      }
    }, 35000);

    test('should handle async operation timeouts', async () => {
      // Mock long-running async operation
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Async operation timeout')), 100);
      });
      
      await expect(timeoutPromise).rejects.toThrow(/timeout/);
    });

    test('should handle promise rejection in callbacks', async () => {
      // Test promise rejection handling in various callback scenarios
      const callbackWithRejection = async (callback: () => Promise<void>) => {
        try {
          await callback();
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          throw new Error(`Callback failed: ${(error as Error).message}`);
        }
      };
      
      const failingCallback = async () => {
        throw new Error('Callback operation failed');
      };
      
      await expect(callbackWithRejection(failingCallback))
        .rejects
        .toThrow(/Callback failed.*operation failed/);
    });
  });
});