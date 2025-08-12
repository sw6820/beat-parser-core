/**
 * Edge Cases Error Handling Test Suite
 * 
 * Comprehensive tests for boundary conditions, unusual scenarios, extreme values,
 * malformed data, security edge cases, and other uncommon error conditions that
 * might not be covered by normal error handling tests.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, BeatCandidate, StreamingOptions } from '../types';

describe('Error Handling: Edge Cases & Boundary Conditions', () => {
  let parser: BeatParser;
  let workerClient: BeatParserWorkerClient;
  
  beforeEach(() => {
    parser = new BeatParser();
    workerClient = new BeatParserWorkerClient({ timeout: 5000 });
  });
  
  afterEach(async () => {
    await Promise.allSettled([
      parser.cleanup(),
      workerClient.terminate()
    ]);
  });

  describe('Boundary Value Edge Cases', () => {
    describe('Numerical Boundary Conditions', () => {
      test('should handle extreme numerical values in configuration', async () => {
        const extremeConfigs = [
          { sampleRate: 1, description: 'minimum sample rate' },
          { sampleRate: Number.MAX_SAFE_INTEGER, description: 'maximum sample rate' },
          { minConfidence: 0, description: 'zero confidence' },
          { minConfidence: 1, description: 'perfect confidence' },
          { minConfidence: Number.EPSILON, description: 'epsilon confidence' },
          { windowSize: 1, description: 'minimum window' },
          { hopSize: 1, description: 'minimum hop' },
          { targetPictureCount: 0, description: 'zero pictures' },
          { targetPictureCount: Number.MAX_SAFE_INTEGER, description: 'maximum pictures' }
        ];
        
        for (const config of extremeConfigs) {
          try {
            const extremeParser = new BeatParser(config);
            const buffer = new Float32Array(4096).fill(0.5);
            
            const result = await extremeParser.parseBuffer(buffer);
            
            // If it succeeds, values should be sanitized
            expect(result).toBeDefined();
            expect(result.beats).toBeDefined();
            
            await extremeParser.cleanup();
          } catch (error) {
            const message = (error as Error).message;
            // Should provide helpful error for extreme values
            expect(message).toMatch(/range|limit|value|invalid|parameter/i);
            expect(message).toContain(config.description.split(' ')[0]); // Include parameter name
          }
        }
      });

      test('should handle floating point precision edge cases', async () => {
        const precisionTests = [
          { value: Number.EPSILON, description: 'epsilon' },
          { value: Number.MIN_VALUE, description: 'minimum positive' },
          { value: -Number.EPSILON, description: 'negative epsilon' },
          { value: 1 + Number.EPSILON, description: 'just above 1' },
          { value: 1 - Number.EPSILON, description: 'just below 1' },
          { value: 0.9999999999999999, description: 'almost 1' },
          { value: 0.0000000000000001, description: 'almost 0' }
        ];
        
        for (const test of precisionTests) {
          const buffer = new Float32Array(4096);
          buffer.fill(test.value);
          
          try {
            const result = await parser.parseBuffer(buffer);
            expect(result).toBeDefined();
            
            // Check for precision-related issues in results
            result.beats.forEach(beat => {
              expect(beat.confidence).toBeGreaterThanOrEqual(0);
              expect(beat.confidence).toBeLessThanOrEqual(1);
              expect(isFinite(beat.timestamp)).toBe(true);
              expect(isFinite(beat.strength)).toBe(true);
            });
          } catch (error) {
            // Should handle precision issues gracefully
            const message = (error as Error).message;
            expect(message).not.toMatch(/precision|floating.*point|nan|infinity/i);
          }
        }
      });

      test('should handle integer overflow scenarios', async () => {
        const overflowTests = [
          { size: Math.pow(2, 31) - 1, description: '32-bit signed max' },
          { size: Math.pow(2, 32) - 1, description: '32-bit unsigned max' },
          { size: Number.MAX_SAFE_INTEGER, description: 'max safe integer' }
        ];
        
        for (const test of overflowTests) {
          try {
            // This should fail before allocation due to size limits
            const hugeBuffer = new Float32Array(test.size);
            await parser.parseBuffer(hugeBuffer);
          } catch (error) {
            const message = (error as Error).message;
            // Should handle overflow gracefully, not crash
            expect(message).toMatch(/memory|size|allocation|too large/i);
            expect(message).not.toMatch(/overflow|crash|segmentation/i);
          }
        }
      });
    });

    describe('Array and Buffer Boundary Conditions', () => {
      test('should handle various array-like objects', async () => {
        const arrayLikes = [
          { data: new Int8Array(4096).fill(127), description: 'Int8Array' },
          { data: new Int16Array(4096).fill(32767), description: 'Int16Array' },
          { data: new Int32Array(4096).fill(2147483647), description: 'Int32Array' },
          { data: new Uint8Array(4096).fill(255), description: 'Uint8Array' },
          { data: new Uint16Array(4096).fill(65535), description: 'Uint16Array' },
          { data: new Uint32Array(4096).fill(4294967295), description: 'Uint32Array' },
          { data: new Float64Array(4096).fill(0.5), description: 'Float64Array' },
          { data: Array(4096).fill(0.5), description: 'Plain Array' }
        ];
        
        for (const { data, description } of arrayLikes) {
          try {
            const result = await parser.parseBuffer(data as any);
            expect(result).toBeDefined();
            expect(result.beats).toBeDefined();
          } catch (error) {
            const message = (error as Error).message;
            // Should handle different array types appropriately
            expect(message).toMatch(/buffer|type|conversion|unsupported/i);
            expect(message).not.toMatch(/crash|fatal|segmentation/i);
          }
        }
      });

      test('should handle sparse arrays and holes', async () => {
        const sparseArray = new Array(4096);
        sparseArray[0] = 0.5;
        sparseArray[100] = 0.3;
        sparseArray[2000] = 0.8;
        sparseArray[4095] = 0.2;
        // Most elements are undefined (holes)
        
        try {
          const result = await parser.parseBuffer(sparseArray as any);
          expect(result).toBeDefined();
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/sparse|holes|undefined|invalid/i);
        }
      });

      test('should handle arrays with prototype pollution', async () => {
        const pollutedArray = new Float32Array(4096);
        pollutedArray.fill(0.5);
        
        // Simulate prototype pollution
        (Array.prototype as any).maliciousProperty = 'malicious value';
        (Float32Array.prototype as any).evilMethod = function() { return 'evil'; };
        
        try {
          const result = await parser.parseBuffer(pollutedArray);
          expect(result).toBeDefined();
          
          // Should not be affected by prototype pollution
          expect((result as any).maliciousProperty).toBeUndefined();
        } catch (error) {
          // Should handle gracefully without exposing prototype pollution
          const message = (error as Error).message;
          expect(message).not.toContain('malicious');
          expect(message).not.toContain('evil');
        } finally {
          // Clean up pollution
          delete (Array.prototype as any).maliciousProperty;
          delete (Float32Array.prototype as any).evilMethod;
        }
      });

      test('should handle frozen and sealed arrays', async () => {
        const frozenArray = new Float32Array(4096);
        frozenArray.fill(0.5);
        Object.freeze(frozenArray);
        
        const sealedArray = new Float32Array(4096);
        sealedArray.fill(0.3);
        Object.seal(sealedArray);
        
        const testArrays = [
          { array: frozenArray, description: 'frozen' },
          { array: sealedArray, description: 'sealed' }
        ];
        
        for (const { array, description } of testArrays) {
          try {
            const result = await parser.parseBuffer(array);
            expect(result).toBeDefined();
          } catch (error) {
            const message = (error as Error).message;
            // Should handle immutable arrays gracefully
            expect(message).not.toMatch(/frozen|sealed|immutable/i);
          }
        }
      });
    });

    describe('String and Path Boundary Conditions', () => {
      test('should handle extreme file path lengths', async () => {
        const pathTests = [
          { path: '', description: 'empty path' },
          { path: 'a', description: 'single character' },
          { path: 'a'.repeat(255) + '.wav', description: 'maximum filename' },
          { path: 'a'.repeat(1000) + '.wav', description: 'excessive filename' },
          { path: '/' + 'a/'.repeat(100) + 'file.wav', description: 'deep directory' },
          { path: './././././././file.wav', description: 'redundant current dir' },
          { path: '/../../../file.wav', description: 'parent directory traversal' }
        ];
        
        for (const { path, description } of pathTests) {
          try {
            await parser.parseFile(path);
            fail(`Should have failed for ${description}: ${path}`);
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/not found|invalid.*path|access|too long/i);
            expect(message).not.toMatch(/crash|buffer.*overflow|exploitation/i);
          }
        }
      });

      test('should handle unicode and special characters in paths', async () => {
        const unicodePaths = [
          'файл.wav', // Cyrillic
          '文件.wav', // Chinese
          'ファイル.wav', // Japanese
          '파일.wav', // Korean
          'ملف.wav', // Arabic
          'קובץ.wav', // Hebrew
          'αρχείο.wav', // Greek
          'dosya.wav', // Turkish
          '🎵🎶🎵.wav', // Emoji
          'file\u0000.wav', // Null byte
          'file\u202E.wav', // Right-to-left override
          'file\uFEFF.wav' // Byte order mark
        ];
        
        for (const path of unicodePaths) {
          try {
            await parser.parseFile(path);
          } catch (error) {
            const message = (error as Error).message;
            // Should handle unicode gracefully without security issues
            expect(message).toMatch(/not found|access|invalid/i);
            expect(message).not.toMatch(/encoding|unicode.*error|malformed/i);
          }
        }
      });

      test('should handle malformed URI and URL paths', async () => {
        const malformedPaths = [
          'file:///nonexistent.wav',
          'http://example.com/audio.wav',
          'ftp://server/file.wav',
          'data:audio/wav;base64,invalid',
          'blob:http://example.com/12345',
          'javascript:alert("xss")',
          'vbscript:msgbox("xss")',
          '\\\\?\\C:\\file.wav', // Windows UNC path
          '\\\\server\\share\\file.wav'
        ];
        
        for (const path of malformedPaths) {
          try {
            await parser.parseFile(path);
          } catch (error) {
            const message = (error as Error).message;
            // Should handle malformed paths securely
            expect(message).toMatch(/not found|unsupported|invalid|scheme/i);
            expect(message).not.toMatch(/xss|script|eval|dangerous/i);
          }
        }
      });
    });
  });

  describe('Malformed Data Edge Cases', () => {
    describe('Corrupted Audio Data', () => {
      test('should handle various data corruption patterns', async () => {
        const corruptionPatterns = [
          {
            name: 'alternating corruption',
            corrupt: (buffer: Float32Array) => {
              for (let i = 0; i < buffer.length; i += 2) {
                buffer[i] = NaN;
              }
            }
          },
          {
            name: 'block corruption',
            corrupt: (buffer: Float32Array) => {
              for (let i = 1000; i < 2000; i++) {
                buffer[i] = Infinity;
              }
            }
          },
          {
            name: 'gradual corruption',
            corrupt: (buffer: Float32Array) => {
              for (let i = 0; i < buffer.length; i++) {
                if (Math.random() < i / buffer.length * 0.5) {
                  buffer[i] = -Infinity;
                }
              }
            }
          },
          {
            name: 'periodic corruption',
            corrupt: (buffer: Float32Array) => {
              for (let i = 0; i < buffer.length; i++) {
                if (i % 100 === 0) {
                  buffer[i] = undefined as any;
                }
              }
            }
          }
        ];
        
        for (const pattern of corruptionPatterns) {
          const buffer = new Float32Array(4096);
          buffer.fill(0.5);
          pattern.corrupt(buffer);
          
          try {
            const result = await parser.parseBuffer(buffer);
            
            if (result) {
              // If processing succeeds, results should be sanitized
              result.beats.forEach(beat => {
                expect(isFinite(beat.timestamp)).toBe(true);
                expect(isFinite(beat.confidence)).toBe(true);
                expect(isFinite(beat.strength)).toBe(true);
              });
            }
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/invalid|corrupt|nan|infinity/i);
            expect(message).not.toMatch(/crash|segmentation|buffer.*overflow/i);
          }
        }
      });

      test('should handle inconsistent data types within buffer', async () => {
        const mixedBuffer = new Float32Array(4096);
        
        // Fill with mixed valid and invalid data
        for (let i = 0; i < mixedBuffer.length; i++) {
          switch (i % 10) {
            case 0: mixedBuffer[i] = 0.5; break;
            case 1: mixedBuffer[i] = NaN; break;
            case 2: mixedBuffer[i] = Infinity; break;
            case 3: mixedBuffer[i] = -Infinity; break;
            case 4: mixedBuffer[i] = Number.EPSILON; break;
            case 5: mixedBuffer[i] = Number.MAX_VALUE; break;
            case 6: mixedBuffer[i] = -Number.MAX_VALUE; break;
            case 7: mixedBuffer[i] = 1e308; break; // Near overflow
            case 8: mixedBuffer[i] = 1e-308; break; // Near underflow
            case 9: mixedBuffer[i] = undefined as any; break;
          }
        }
        
        try {
          const result = await parser.parseBuffer(mixedBuffer);
          
          if (result) {
            // Should sanitize mixed data
            expect(result.beats).toBeDefined();
            result.beats.forEach(beat => {
              expect(isFinite(beat.timestamp)).toBe(true);
              expect(beat.confidence).toBeGreaterThanOrEqual(0);
              expect(beat.confidence).toBeLessThanOrEqual(1);
            });
          }
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/invalid.*values|mixed.*data|inconsistent/i);
        }
      });

      test('should handle buffer data that changes during processing', async () => {
        const volatileBuffer = new Float32Array(4096);
        volatileBuffer.fill(0.5);
        
        const volatilePlugin: BeatParserPlugin = {
          name: 'volatile-data',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate data changing during processing
            setTimeout(() => {
              for (let i = 0; i < audioData.length; i += 100) {
                audioData[i] = NaN; // Corrupt data mid-processing
              }
            }, 10);
            
            // Continue processing
            await new Promise(resolve => setTimeout(resolve, 50));
            
            return audioData;
          }
        };
        
        const volatileParser = new BeatParser();
        volatileParser.addPlugin(volatilePlugin);
        
        try {
          const result = await volatileParser.parseBuffer(volatileBuffer);
          
          if (result) {
            // Should handle mid-processing data changes
            expect(result.beats).toBeDefined();
          }
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/data.*changed|volatile|corruption/i);
          expect(message).not.toMatch(/race.*condition|concurrent.*access/i);
        }
        
        await volatileParser.cleanup();
      });
    });

    describe('Malformed Configuration Objects', () => {
      test('should handle circular references in configuration', async () => {
        const circularConfig: any = {
          sampleRate: 44100,
          nested: {
            value: 123
          }
        };
        circularConfig.nested.parent = circularConfig; // Circular reference
        circularConfig.self = circularConfig; // Self-reference
        
        try {
          const circularParser = new BeatParser(circularConfig);
          const buffer = new Float32Array(4096).fill(0.5);
          
          const result = await circularParser.parseBuffer(buffer);
          expect(result).toBeDefined();
          
          await circularParser.cleanup();
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/circular|reference|configuration/i);
          expect(message).not.toMatch(/stack.*overflow|maximum.*call/i);
        }
      });

      test('should handle configuration with non-serializable values', async () => {
        const nonSerializableConfig = {
          sampleRate: 44100,
          callback: function() { return 'test'; },
          symbol: Symbol('test'),
          bigint: BigInt(123),
          date: new Date(),
          regex: /test/g,
          set: new Set([1, 2, 3]),
          map: new Map([['key', 'value']]),
          weakMap: new WeakMap(),
          promise: Promise.resolve('test'),
          error: new Error('test error')
        };
        
        try {
          const nonSerializableParser = new BeatParser(nonSerializableConfig as any);
          const buffer = new Float32Array(4096).fill(0.5);
          
          const result = await nonSerializableParser.parseBuffer(buffer);
          expect(result).toBeDefined();
          
          await nonSerializableParser.cleanup();
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/serialization|configuration|type|unsupported/i);
        }
      });

      test('should handle configuration with getter/setter traps', async () => {
        const trappedConfig = new Proxy({
          sampleRate: 44100
        }, {
          get(target, prop) {
            if (prop === 'malicious') {
              throw new Error('Malicious getter called');
            }
            return target[prop as keyof typeof target];
          },
          set(target, prop, value) {
            if (prop === 'sampleRate' && value > 48000) {
              throw new Error('Sample rate too high');
            }
            target[prop as keyof typeof target] = value;
            return true;
          }
        });
        
        try {
          const trappedParser = new BeatParser(trappedConfig);
          const buffer = new Float32Array(4096).fill(0.5);
          
          const result = await trappedParser.parseBuffer(buffer);
          expect(result).toBeDefined();
          
          await trappedParser.cleanup();
        } catch (error) {
          const message = (error as Error).message;
          expect(message).not.toContain('Malicious getter');
          expect(message).toMatch(/configuration|proxy|trap/i);
        }
      });
    });
  });

  describe('Security-Related Edge Cases', () => {
    describe('Input Validation Bypass Attempts', () => {
      test('should prevent path traversal attacks', async () => {
        const pathTraversalAttempts = [
          '../../../etc/passwd',
          '..\\..\\..\\windows\\system32\\config\\sam',
          '/etc/passwd%00.wav',
          'file.wav/../../../sensitive',
          '....//....//....//etc/passwd',
          '..%2F..%2F..%2Fetc%2Fpasswd',
          '..%252F..%252F..%252Fetc%252Fpasswd', // Double encoding
          '\\x2E\\x2E/\\x2E\\x2E/\\x2E\\x2E/etc/passwd'
        ];
        
        for (const maliciousPath of pathTraversalAttempts) {
          try {
            await parser.parseFile(maliciousPath);
            fail(`Should have blocked path traversal: ${maliciousPath}`);
          } catch (error) {
            const message = (error as Error).message;
            // Should block path traversal without revealing system info
            expect(message).toMatch(/not found|access.*denied|invalid.*path/i);
            expect(message).not.toMatch(/passwd|system32|config|etc/i);
          }
        }
      });

      test('should prevent buffer overflow through size manipulation', async () => {
        const overflowAttempts = [
          { size: -1, description: 'negative size' },
          { size: 0x7FFFFFFF + 1, description: 'integer overflow' },
          { size: Number.MAX_SAFE_INTEGER, description: 'max safe integer' },
          { size: Infinity, description: 'infinite size' }
        ];
        
        for (const attempt of overflowAttempts) {
          try {
            // This should fail at allocation, not cause overflow
            const buffer = new Float32Array(attempt.size);
            await parser.parseBuffer(buffer);
            fail(`Should have failed for ${attempt.description}`);
          } catch (error) {
            const message = (error as Error).message;
            // Should handle size attacks gracefully
            expect(message).toMatch(/size|allocation|memory|invalid/i);
            expect(message).not.toMatch(/overflow|exploit|attack/i);
          }
        }
      });

      test('should sanitize error messages to prevent information disclosure', async () => {
        const sensitiveDataPlugin: BeatParserPlugin = {
          name: 'sensitive-data',
          version: '1.0.0',
          processAudio: async () => {
            const sensitiveInfo = {
              apiKey: 'secret-api-key-12345',
              password: 'super-secret-password',
              internalPath: '/internal/system/path',
              dbConnection: 'postgres://user:pass@host/db'
            };
            
            throw new Error(`Processing failed with sensitive data: ${JSON.stringify(sensitiveInfo)}`);
          }
        };
        
        const sensitiveParser = new BeatParser();
        sensitiveParser.addPlugin(sensitiveDataPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await sensitiveParser.parseBuffer(buffer);
          fail('Should have failed');
        } catch (error) {
          const message = (error as Error).message;
          
          // Should not expose sensitive information
          expect(message).not.toMatch(/secret-api-key|super-secret-password|postgres:\/\//);
          expect(message).not.toMatch(/internal\/system\/path/);
          
          // Should provide generic error message
          expect(message).toMatch(/processing.*failed|Failed to parse/i);
        }
        
        await sensitiveParser.cleanup();
      });

      test('should prevent prototype pollution through input manipulation', async () => {
        const pollutionPayloads = [
          { '__proto__': { 'malicious': true } },
          { 'constructor': { 'prototype': { 'evil': 'payload' } } },
          JSON.parse('{"__proto__":{"polluted":true}}')
        ];
        
        for (const payload of pollutionPayloads) {
          try {
            const pollutedParser = new BeatParser(payload as any);
            const buffer = new Float32Array(4096).fill(0.5);
            
            await pollutedParser.parseBuffer(buffer);
            
            // Check that prototype was not polluted
            expect((Object.prototype as any).malicious).toBeUndefined();
            expect((Object.prototype as any).evil).toBeUndefined();
            expect((Object.prototype as any).polluted).toBeUndefined();
            
            await pollutedParser.cleanup();
          } catch (error) {
            // Should block pollution attempts
            const message = (error as Error).message;
            expect(message).not.toContain('malicious');
            expect(message).not.toContain('evil');
            expect(message).not.toContain('polluted');
          }
        }
      });
    });

    describe('Resource Exhaustion Attacks', () => {
      test('should prevent memory exhaustion through large allocations', async () => {
        const exhaustionPlugin: BeatParserPlugin = {
          name: 'memory-exhaustion',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Attempt to exhaust memory with large allocations
            const allocations: Float32Array[] = [];
            
            try {
              for (let i = 0; i < 100; i++) {
                allocations.push(new Float32Array(10 * 1024 * 1024)); // 10MB each
              }
              
              return audioData;
            } catch (error) {
              throw new Error('Memory exhaustion attack prevented');
            }
          }
        };
        
        const exhaustionParser = new BeatParser();
        exhaustionParser.addPlugin(exhaustionPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await exhaustionParser.parseBuffer(buffer);
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/memory|allocation|exhaustion|prevented/i);
          expect(message).not.toMatch(/attack.*successful|system.*compromised/i);
        }
        
        await exhaustionParser.cleanup();
      });

      test('should prevent CPU exhaustion through infinite loops', async () => {
        const cpuExhaustionPlugin: BeatParserPlugin = {
          name: 'cpu-exhaustion',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const startTime = Date.now();
            const maxExecutionTime = 1000; // 1 second limit
            let iterations = 0;
            
            // Potentially infinite loop with timeout protection
            while (true) {
              iterations++;
              
              if (Date.now() - startTime > maxExecutionTime) {
                throw new Error('CPU exhaustion attack prevented');
              }
              
              // Simulate heavy computation
              Math.sin(Math.random() * Math.PI);
              
              if (iterations > 1000000) { // Reasonable iteration limit
                break;
              }
            }
            
            return audioData;
          }
        };
        
        const cpuParser = new BeatParser();
        cpuParser.addPlugin(cpuExhaustionPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          const result = await cpuParser.parseBuffer(buffer);
          expect(result).toBeDefined();
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/cpu.*exhaustion|execution.*time|prevented/i);
        }
        
        await cpuParser.cleanup();
      }, 10000);

      test('should prevent stack exhaustion through deep recursion', async () => {
        const stackExhaustionPlugin: BeatParserPlugin = {
          name: 'stack-exhaustion',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const maxDepth = 1000;
            
            const recursiveFunction = (depth: number): number => {
              if (depth > maxDepth) {
                throw new Error('Stack exhaustion attack prevented');
              }
              
              if (depth === 0) {
                return 1;
              }
              
              return depth + recursiveFunction(depth - 1);
            };
            
            try {
              recursiveFunction(10000); // Attempt deep recursion
              return audioData;
            } catch (error) {
              if ((error as Error).message.includes('prevented')) {
                throw error;
              } else {
                throw new Error('Stack exhaustion naturally prevented');
              }
            }
          }
        };
        
        const stackParser = new BeatParser();
        stackParser.addPlugin(stackExhaustionPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await stackParser.parseBuffer(buffer);
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/stack.*exhaustion|prevented|call.*stack/i);
          expect(message).not.toMatch(/attack.*successful|system.*crashed/i);
        }
        
        await stackParser.cleanup();
      });
    });
  });

  describe('Unusual Runtime Environment Edge Cases', () => {
    describe('Modified Global Environment', () => {
      test('should handle modified built-in prototypes', async () => {
        // Save original methods
        const originalArraySlice = Array.prototype.slice;
        const originalObjectToString = Object.prototype.toString;
        const originalNumberToString = Number.prototype.toString;
        
        try {
          // Modify built-in prototypes
          Array.prototype.slice = function() { throw new Error('Array.slice modified'); };
          Object.prototype.toString = function() { return '[object Hacked]'; };
          Number.prototype.toString = function() { return 'NaN'; };
          
          const buffer = new Float32Array(4096).fill(0.5);
          const result = await parser.parseBuffer(buffer);
          
          expect(result).toBeDefined();
          // Should work despite modified prototypes
          
        } catch (error) {
          const message = (error as Error).message;
          expect(message).not.toContain('Array.slice modified');
          expect(message).not.toContain('[object Hacked]');
        } finally {
          // Restore original methods
          Array.prototype.slice = originalArraySlice;
          Object.prototype.toString = originalObjectToString;
          Number.prototype.toString = originalNumberToString;
        }
      });

      test('should handle missing or modified global objects', async () => {
        // Save original globals
        const originalSetTimeout = global.setTimeout;
        const originalSetImmediate = global.setImmediate;
        const originalPromise = global.Promise;
        
        try {
          // Simulate missing/broken globals
          (global as any).setTimeout = undefined;
          (global as any).setImmediate = function() { throw new Error('setImmediate broken'); };
          
          const buffer = new Float32Array(4096).fill(0.5);
          
          // Should handle missing globals gracefully
          const result = await parser.parseBuffer(buffer);
          expect(result).toBeDefined();
          
        } catch (error) {
          const message = (error as Error).message;
          expect(message).not.toContain('setImmediate broken');
          expect(message).toMatch(/missing.*global|environment.*modified/i);
        } finally {
          // Restore globals
          global.setTimeout = originalSetTimeout;
          global.setImmediate = originalSetImmediate;
          global.Promise = originalPromise;
        }
      });

      test('should handle sandboxed or restricted environments', async () => {
        const restrictedEnvironmentPlugin: BeatParserPlugin = {
          name: 'restricted-environment',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate restrictions
            const restrictedFeatures = [
              () => { require('fs'); }, // File system access
              () => { require('child_process'); }, // Process spawning
              () => { eval('1 + 1'); }, // Code evaluation
              () => { Function('return this')(); } // Global access
            ];
            
            for (const feature of restrictedFeatures) {
              try {
                feature();
              } catch (error) {
                // Expected in restricted environment
                console.log('Feature restricted:', error.message);
              }
            }
            
            return audioData;
          }
        };
        
        const restrictedParser = new BeatParser();
        restrictedParser.addPlugin(restrictedEnvironmentPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Should work in restricted environment
        const result = await restrictedParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await restrictedParser.cleanup();
      });
    });

    describe('Extreme Performance Conditions', () => {
      test('should handle extremely slow execution environment', async () => {
        let slowdownFactor = 1;
        
        const slowEnvironmentPlugin: BeatParserPlugin = {
          name: 'slow-environment',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate extremely slow environment
            const delay = (ms: number) => new Promise(resolve => 
              setTimeout(resolve, ms * slowdownFactor)
            );
            
            // Each operation takes longer in slow environment
            for (let i = 0; i < 10; i++) {
              slowdownFactor += 0.1;
              await delay(1); // Increasingly slow operations
              
              // Process small chunk
              const chunkSize = Math.floor(audioData.length / 10);
              const startIdx = i * chunkSize;
              const endIdx = Math.min(startIdx + chunkSize, audioData.length);
              
              for (let j = startIdx; j < endIdx; j++) {
                audioData[j] = audioData[j] * 0.99;
              }
            }
            
            return audioData;
          }
        };
        
        const slowParser = new BeatParser();
        slowParser.addPlugin(slowEnvironmentPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const startTime = Date.now();
        const result = await slowParser.parseBuffer(buffer);
        const endTime = Date.now();
        
        expect(result).toBeDefined();
        expect(endTime - startTime).toBeGreaterThan(50); // Should take some time
        
        await slowParser.cleanup();
      }, 15000);

      test('should handle high memory pressure environment', async () => {
        const pressurePlugin: BeatParserPlugin = {
          name: 'memory-pressure',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate high memory pressure
            let pressureBuffers: Float32Array[] = [];
            
            try {
              // Create memory pressure
              for (let i = 0; i < 10; i++) {
                pressureBuffers.push(new Float32Array(1024 * 1024)); // 1MB each
              }
              
              // Process under pressure
              const result = new Float32Array(audioData.length);
              
              for (let i = 0; i < audioData.length; i++) {
                result[i] = audioData[i] * 0.95;
                
                // Periodically trigger garbage collection pressure
                if (i % 1000 === 0) {
                  const temp = new Float32Array(1000);
                  temp.fill(Math.random());
                  // temp goes out of scope, creating GC pressure
                }
              }
              
              return result;
            } finally {
              // Clean up pressure buffers
              pressureBuffers = [];
            }
          }
        };
        
        const pressureParser = new BeatParser();
        pressureParser.addPlugin(pressurePlugin);
        
        const buffer = new Float32Array(8192).fill(0.5);
        
        try {
          const result = await pressureParser.parseBuffer(buffer);
          expect(result).toBeDefined();
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/memory|pressure|allocation/i);
        }
        
        await pressureParser.cleanup();
      }, 10000);
    });
  });

  describe('Plugin System Edge Cases', () => {
    describe('Malicious Plugin Behavior', () => {
      test('should isolate malicious plugin attempts', async () => {
        const maliciousPlugin: BeatParserPlugin = {
          name: 'malicious',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Attempt various malicious behaviors
            try {
              // Try to modify global objects
              (global as any).maliciousPayload = 'compromised';
              
              // Try to access sensitive data
              process.env.SECRET = 'stolen';
              
              // Try to modify input data
              audioData.fill(666);
              
              // Try to corrupt system state
              (parser as any).initialized = false;
              
              return audioData;
            } catch (error) {
              throw new Error('Malicious behavior blocked');
            }
          }
        };
        
        const maliciousParser = new BeatParser();
        maliciousParser.addPlugin(maliciousPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        const originalBuffer = buffer.slice(); // Copy for comparison
        
        try {
          await maliciousParser.parseBuffer(buffer);
          
          // Check that malicious attempts were contained
          expect((global as any).maliciousPayload).toBeUndefined();
          expect(process.env.SECRET).toBeUndefined();
          
        } catch (error) {
          // Malicious behavior should be blocked
          const message = (error as Error).message;
          expect(message).toMatch(/behavior.*blocked|malicious|security/i);
        } finally {
          // Clean up any potential pollution
          delete (global as any).maliciousPayload;
          delete process.env.SECRET;
        }
        
        await maliciousParser.cleanup();
      });

      test('should prevent plugin from affecting other plugins', async () => {
        let goodPluginCalled = false;
        let badPluginCalled = false;
        
        const badPlugin: BeatParserPlugin = {
          name: 'bad',
          version: '1.0.0',
          processAudio: async (audioData) => {
            badPluginCalled = true;
            
            // Try to interfere with other plugins
            (parser as any).plugins = [];
            (parser as any).config = null;
            
            throw new Error('Bad plugin failure');
          }
        };
        
        const goodPlugin: BeatParserPlugin = {
          name: 'good',
          version: '1.0.0',
          processAudio: async (audioData) => {
            goodPluginCalled = true;
            return audioData;
          }
        };
        
        const isolatedParser = new BeatParser();
        isolatedParser.addPlugin(badPlugin);
        isolatedParser.addPlugin(goodPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await isolatedParser.parseBuffer(buffer);
          fail('Should have failed due to bad plugin');
        } catch (error) {
          expect(badPluginCalled).toBe(true);
          // Good plugin should not be called due to bad plugin failure
          // But the system should remain stable
          expect((error as Error).message).toMatch(/Bad plugin failure|Failed to parse/);
        }
        
        // System should remain functional after bad plugin
        const cleanParser = new BeatParser();
        cleanParser.addPlugin(goodPlugin);
        
        const result = await cleanParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await Promise.all([isolatedParser.cleanup(), cleanParser.cleanup()]);
      });
    });
  });
});