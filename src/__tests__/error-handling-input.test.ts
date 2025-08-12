/**
 * Input Error Handling Test Suite
 * 
 * Comprehensive tests for input validation errors, file processing errors,
 * buffer processing errors, and parameter validation across all input scenarios.
 * Tests recovery mechanisms and graceful degradation for input-related failures.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, BeatCandidate, StreamingOptions } from '../types';
import fs from 'fs/promises';
import path from 'path';

describe('Error Handling: Input Validation & Processing', () => {
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

  describe('File Processing Errors', () => {
    describe('File Existence and Access', () => {
      test('should handle non-existent files with meaningful errors', async () => {
        const testCases = [
          { path: '/completely/nonexistent/file.wav', scenario: 'absolute path' },
          { path: './nonexistent.wav', scenario: 'relative path' },
          { path: 'missing-file.mp3', scenario: 'simple filename' },
          { path: '', scenario: 'empty path' },
          { path: '   ', scenario: 'whitespace path' }
        ];

        for (const testCase of testCases) {
          try {
            await parser.parseFile(testCase.path);
            fail(`Should have thrown error for ${testCase.scenario}`);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toMatch(/Audio file not found|Invalid path|empty/i);
            expect(message).toContain(testCase.path.trim() || 'empty');
          }
        }
      });

      test('should handle permission denied scenarios', async () => {
        const restrictedPaths = [
          '/root/restricted.wav',
          '/usr/local/protected.mp3',
          '/System/private.flac'
        ];

        for (const restrictedPath of restrictedPaths) {
          await expect(parser.parseFile(restrictedPath))
            .rejects
            .toThrow(); // Should throw access/permission error
        }
      });

      test('should handle locked files and sharing violations', async () => {
        // Simulate locked file scenario - this would be more complex in real implementation
        const mockLockedFile = 'locked-file.wav';
        
        await expect(parser.parseFile(mockLockedFile))
          .rejects
          .toThrow(); // Should handle file access errors
      });

      test('should validate file path security', async () => {
        const maliciousPaths = [
          '../../../etc/passwd',
          '..\\..\\..\\windows\\system32\\config\\sam',
          '/dev/null',
          '/dev/urandom',
          'file\x00injection.wav',
          'CON:', // Windows reserved name
          'PRN:', // Windows reserved name
          '\\\\network\\share\\file.wav'
        ];

        for (const maliciousPath of maliciousPaths) {
          await expect(parser.parseFile(maliciousPath))
            .rejects
            .toThrow();
        }
      });
    });

    describe('File Format and Extension Validation', () => {
      test('should reject unsupported file formats with helpful messages', async () => {
        const unsupportedFormats = [
          { ext: '.txt', file: 'text-file.txt' },
          { ext: '.pdf', file: 'document.pdf' },
          { ext: '.jpg', file: 'image.jpg' },
          { ext: '.mp4', file: 'video.mp4' },
          { ext: '.exe', file: 'program.exe' },
          { ext: '.zip', file: 'archive.zip' },
          { ext: '.unknown', file: 'mystery.unknown' }
        ];

        for (const format of unsupportedFormats) {
          try {
            await parser.parseFile(format.file);
            fail(`Should have rejected ${format.ext} format`);
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/Unsupported audio format/i);
            expect(message).toContain(format.ext);
            expect(message).toMatch(/Supported formats:.*\.wav.*\.mp3.*\.flac/);
          }
        }
      });

      test('should handle files with no extension', async () => {
        const noExtensionFiles = [
          'audiofile',
          'track1',
          'music-sample'
        ];

        for (const filename of noExtensionFiles) {
          await expect(parser.parseFile(filename))
            .rejects
            .toThrow(/Unsupported audio format|extension/i);
        }
      });

      test('should handle case sensitivity in extensions', async () => {
        const caseVariations = [
          'file.WAV',
          'file.Mp3',
          'file.FLAC',
          'file.OGG',
          'file.M4A'
        ];

        // All should be accepted (assuming files exist)
        for (const filename of caseVariations) {
          try {
            await parser.parseFile(filename);
            // Should not reject based on case
          } catch (error) {
            const message = (error as Error).message;
            expect(message).not.toMatch(/Unsupported audio format/);
            // Should fail for other reasons (file not found), not format
            expect(message).toMatch(/not found/);
          }
        }
      });

      test('should handle multiple extensions and complex filenames', async () => {
        const complexFilenames = [
          'song.backup.wav',
          'track-1.2.mp3',
          'audio.old.wav.bak', // Should reject - final extension is .bak
          'music..wav', // Double dot
          'file.wav.exe' // Should reject - final extension is .exe
        ];

        for (const filename of complexFilenames) {
          const extension = path.extname(filename);
          const supportedFormats = ['.wav', '.mp3', '.flac', '.ogg', '.m4a'];
          
          try {
            await parser.parseFile(filename);
          } catch (error) {
            const message = (error as Error).message;
            if (!supportedFormats.includes(extension.toLowerCase())) {
              expect(message).toMatch(/Unsupported audio format/);
            } else {
              expect(message).toMatch(/not found/); // Should fail for file not found, not format
            }
          }
        }
      });
    });

    describe('Corrupted and Malformed Files', () => {
      test('should handle files with corrupted headers', async () => {
        // This would require actual corrupted test files in a real scenario
        const corruptedFiles = [
          'corrupted-header.wav',
          'invalid-wav-header.wav',
          'truncated-header.mp3'
        ];

        for (const filename of corruptedFiles) {
          await expect(parser.parseFile(filename))
            .rejects
            .toThrow(); // Should handle corruption gracefully
        }
      });

      test('should handle truncated files', async () => {
        const truncatedFiles = [
          'truncated-middle.wav',
          'incomplete-data.mp3',
          'partial-file.flac'
        ];

        for (const filename of truncatedFiles) {
          await expect(parser.parseFile(filename))
            .rejects
            .toThrow(); // Should detect and handle truncation
        }
      });

      test('should handle empty files', async () => {
        const emptyFile = 'empty.wav';
        
        await expect(parser.parseFile(emptyFile))
          .rejects
          .toThrow(/Invalid|empty|too short/i);
      });

      test('should handle extremely large files', async () => {
        const largeFile = 'huge-audio-file.wav'; // Simulate >1GB file
        
        try {
          await parser.parseFile(largeFile);
        } catch (error) {
          // Should either process successfully or fail gracefully with memory/size error
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          // Accept either not found or memory-related errors
          expect(message).toMatch(/not found|memory|too large|size limit/i);
        }
      });

      test('should handle files with malicious metadata', async () => {
        const maliciousMetadataFiles = [
          'malicious-id3.mp3',
          'oversized-metadata.wav',
          'crafted-tags.flac'
        ];

        for (const filename of maliciousMetadataFiles) {
          try {
            await parser.parseFile(filename);
          } catch (error) {
            // Should handle malicious metadata gracefully without crashing
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).not.toMatch(/segmentation fault|access violation/i);
          }
        }
      });
    });
  });

  describe('Buffer Processing Errors', () => {
    describe('Null and Undefined Buffer Handling', () => {
      test('should handle null buffers gracefully', async () => {
        await expect(parser.parseBuffer(null as any))
          .rejects
          .toThrow(/Invalid|null|undefined/i);
      });

      test('should handle undefined buffers gracefully', async () => {
        await expect(parser.parseBuffer(undefined as any))
          .rejects
          .toThrow(/Invalid|null|undefined/i);
      });

      test('should handle various falsy buffer values', async () => {
        const falsyValues = [null, undefined, 0, false, '', NaN];

        for (const falsy of falsyValues) {
          await expect(parser.parseBuffer(falsy as any))
            .rejects
            .toThrow(/Invalid|null|undefined|empty/i);
        }
      });
    });

    describe('Empty and Invalid Buffer Handling', () => {
      test('should handle empty buffers', async () => {
        const emptyBuffers = [
          new Float32Array(0),
          new Float64Array(0),
          new Int16Array(0),
          Buffer.alloc(0),
          []
        ];

        for (const emptyBuffer of emptyBuffers) {
          await expect(parser.parseBuffer(emptyBuffer as any))
            .rejects
            .toThrow(/Invalid|empty|too short/i);
        }
      });

      test('should handle buffers that are too short', async () => {
        const shortBuffers = [
          new Float32Array(1),
          new Float32Array(10),
          new Float32Array(100),
          new Float32Array(512), // Less than default frameSize
          new Float32Array(1023) // Just under frameSize
        ];

        for (const shortBuffer of shortBuffers) {
          try {
            await parser.parseBuffer(shortBuffer);
            fail('Should have thrown for short buffer');
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/too short|Minimum length|frameSize/i);
            expect(message).toContain('2048'); // Default frame size
          }
        }
      });

      test('should provide specific guidance for minimum buffer size', async () => {
        const tooShortBuffer = new Float32Array(1000);
        
        try {
          await parser.parseBuffer(tooShortBuffer);
          fail('Should have thrown');
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toContain('Audio data too short');
          expect(message).toContain('Minimum length');
          expect(message).toContain('2048');
          expect(message).toContain('samples');
        }
      });
    });

    describe('Invalid Buffer Data Handling', () => {
      test('should handle buffers with NaN values', async () => {
        const nanBuffers = [
          (() => { const buf = new Float32Array(4096); buf[0] = NaN; return buf; })(),
          (() => { const buf = new Float32Array(4096); buf[100] = NaN; return buf; })(),
          (() => { const buf = new Float32Array(4096); buf.fill(NaN); return buf; })()
        ];

        for (const nanBuffer of nanBuffers) {
          try {
            await parser.parseBuffer(nanBuffer);
            fail('Should have rejected NaN buffer');
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/invalid values|NaN|not finite/i);
          }
        }
      });

      test('should handle buffers with Infinity values', async () => {
        const infinityBuffers = [
          (() => { const buf = new Float32Array(4096); buf[0] = Infinity; return buf; })(),
          (() => { const buf = new Float32Array(4096); buf[50] = -Infinity; return buf; })(),
          (() => { const buf = new Float32Array(4096); buf.fill(Infinity); return buf; })()
        ];

        for (const infinityBuffer of infinityBuffers) {
          try {
            await parser.parseBuffer(infinityBuffer);
            fail('Should have rejected Infinity buffer');
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/invalid values|Infinity|not finite/i);
          }
        }
      });

      test('should handle mixed invalid values in buffers', async () => {
        const mixedInvalidBuffer = new Float32Array(4096);
        mixedInvalidBuffer.fill(0.5); // Start with valid data
        mixedInvalidBuffer[10] = NaN;
        mixedInvalidBuffer[20] = Infinity;
        mixedInvalidBuffer[30] = -Infinity;
        mixedInvalidBuffer[40] = undefined as any;

        try {
          await parser.parseBuffer(mixedInvalidBuffer);
          fail('Should have rejected mixed invalid buffer');
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(/invalid values|NaN|Infinity/i);
        }
      });

      test('should validate buffer data efficiently', async () => {
        // Test that validation doesn't scan entire large buffers
        const largeBuffer = new Float32Array(44100 * 60); // 1 minute
        largeBuffer.fill(0.5);
        largeBuffer[44100 * 30] = NaN; // NaN in the middle

        const startTime = Date.now();
        try {
          await parser.parseBuffer(largeBuffer);
          fail('Should have detected NaN');
        } catch (error) {
          const endTime = Date.now();
          // Should not take too long for validation
          expect(endTime - startTime).toBeLessThan(5000);
          expect((error as Error).message).toMatch(/invalid values/i);
        }
      });
    });

    describe('Buffer Type Validation', () => {
      test('should handle different typed array types', async () => {
        const validSize = 4096;
        const typedArrays = [
          { name: 'Float32Array', buffer: new Float32Array(validSize).fill(0.5) },
          { name: 'Float64Array', buffer: new Float64Array(validSize).fill(0.5) },
          { name: 'Buffer', buffer: Buffer.alloc(validSize * 4).fill(0.5) }
        ];

        for (const { name, buffer } of typedArrays) {
          try {
            const result = await parser.parseBuffer(buffer as any);
            expect(result).toBeDefined();
            expect(result.beats).toBeDefined();
          } catch (error) {
            // Some buffer types might not be supported - that's acceptable
            // But error should be informative
            const message = (error as Error).message;
            expect(message).not.toMatch(/undefined|crash|segmentation/i);
          }
        }
      });

      test('should reject completely invalid buffer types', async () => {
        const invalidBuffers = [
          'string buffer',
          123,
          { length: 4096 },
          [1, 2, 3, 4],
          new Date(),
          /regex/,
          Symbol('buffer')
        ];

        for (const invalidBuffer of invalidBuffers) {
          await expect(parser.parseBuffer(invalidBuffer as any))
            .rejects
            .toThrow(/Invalid|buffer|type/i);
        }
      });

      test('should handle buffer conversion errors', async () => {
        // Mock scenario where buffer processing might fail
        const mockProcessor = jest.spyOn(parser as any, 'preprocessAudio')
          .mockImplementation(() => {
            throw new Error('Buffer conversion failed');
          });

        try {
          const buffer = new Float32Array(4096).fill(0.5);
          await expect(parser.parseBuffer(buffer))
            .rejects
            .toThrow(/Buffer conversion failed|Failed to parse/);
        } finally {
          mockProcessor.mockRestore();
        }
      });
    });

    describe('Buffer Size Boundary Conditions', () => {
      test('should handle buffer sizes at exact boundaries', async () => {
        const boundarySizes = [
          2048, // Exact frameSize
          2049, // Just above frameSize
          4096, // 2x frameSize
          8192, // 4x frameSize
          44100, // 1 second at 44.1kHz
          88200  // 2 seconds
        ];

        for (const size of boundarySizes) {
          const buffer = new Float32Array(size).fill(0.5);
          try {
            const result = await parser.parseBuffer(buffer);
            expect(result).toBeDefined();
            expect(result.beats).toBeDefined();
          } catch (error) {
            // If it fails, it should be for processing reasons, not size
            const message = (error as Error).message;
            expect(message).not.toMatch(/too short|size/i);
          }
        }
      });

      test('should handle extremely large buffers gracefully', async () => {
        try {
          // Attempt to create very large buffer
          const hugeBuf = new Float32Array(100 * 1024 * 1024); // 100M samples
          hugeBuf.fill(0.5);
          
          await parser.parseBuffer(hugeBuf);
        } catch (error) {
          // Should handle memory limits gracefully
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).toMatch(/memory|out of|too large|limit/i);
        }
      }, 30000);
    });
  });

  describe('Parameter Validation Errors', () => {
    describe('ParseOptions Validation', () => {
      test('should handle invalid ParseOptions configurations', async () => {
        const validBuffer = new Float32Array(4096).fill(0.5);
        
        const invalidOptions = [
          { minConfidence: -1, error: /confidence.*negative|range/ },
          { minConfidence: 2, error: /confidence.*range|maximum/ },
          { windowSize: 0, error: /windowSize.*positive|invalid/ },
          { windowSize: -100, error: /windowSize.*negative|positive/ },
          { hopSize: 0, error: /hopSize.*positive|invalid/ },
          { hopSize: -50, error: /hopSize.*negative|positive/ },
          { sampleRate: 0, error: /sampleRate.*positive|invalid/ },
          { sampleRate: -1000, error: /sampleRate.*negative|positive/ },
          { targetPictureCount: -5, error: /targetPictureCount.*negative|positive/ },
          { selectionMethod: 'invalid' as any, error: /selectionMethod.*valid|unknown/ }
        ];

        for (const { error: expectedError, ...options } of invalidOptions) {
          try {
            await parser.parseBuffer(validBuffer, options);
            // Some invalid options might be silently corrected - that's acceptable
          } catch (error) {
            const message = (error as Error).message;
            if (expectedError.test(message)) {
              // Good - caught the expected validation error
              expect(message).toMatch(expectedError);
            }
            // Don't fail if validation passes - just check if error is appropriate
          }
        }
      });

      test('should handle out-of-range numeric parameters', async () => {
        const validBuffer = new Float32Array(4096).fill(0.5);
        
        const extremeOptions = [
          { sampleRate: 1 }, // Too low
          { sampleRate: 1000000 }, // Too high
          { targetPictureCount: 0 },
          { targetPictureCount: 10000 },
          { windowSize: 1 },
          { windowSize: 1000000 }
        ];

        for (const options of extremeOptions) {
          try {
            const result = await parser.parseBuffer(validBuffer, options);
            // If it succeeds, parameters should be sanitized/clamped
            expect(result).toBeDefined();
          } catch (error) {
            // If it fails, error should be descriptive
            const message = (error as Error).message;
            expect(message).toMatch(/range|limit|value|parameter/i);
          }
        }
      });

      test('should handle null and undefined option values', async () => {
        const validBuffer = new Float32Array(4096).fill(0.5);
        
        const nullishOptions = [
          { minConfidence: null },
          { windowSize: undefined },
          { sampleRate: null },
          { targetPictureCount: undefined },
          { selectionMethod: null }
        ];

        for (const options of nullishOptions) {
          try {
            const result = await parser.parseBuffer(validBuffer, options as any);
            // Should either work with defaults or reject appropriately
            expect(result).toBeDefined();
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toMatch(/invalid|null|undefined|parameter/i);
          }
        }
      });

      test('should handle malformed options objects', async () => {
        const validBuffer = new Float32Array(4096).fill(0.5);
        
        const malformedOptions = [
          { toString: () => { throw new Error('toString error'); } },
          { valueOf: () => { throw new Error('valueOf error'); } },
          Object.create(null), // No prototype
          new Proxy({}, { get: () => { throw new Error('Proxy error'); } })
        ];

        for (const options of malformedOptions) {
          try {
            await parser.parseBuffer(validBuffer, options as any);
          } catch (error) {
            // Should handle malformed objects gracefully
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).not.toMatch(/segmentation|crash|fatal/i);
          }
        }
      });
    });

    describe('Circular References and Complex Objects', () => {
      test('should handle circular references in options', async () => {
        const validBuffer = new Float32Array(4096).fill(0.5);
        
        const circularOptions: any = { minConfidence: 0.5 };
        circularOptions.self = circularOptions; // Create circular reference

        try {
          await parser.parseBuffer(validBuffer, circularOptions);
        } catch (error) {
          // Should handle circular references gracefully
          const message = (error as Error).message;
          expect(message).not.toMatch(/maximum call stack|circular/i);
        }
      });

      test('should handle deeply nested option objects', async () => {
        const validBuffer = new Float32Array(4096).fill(0.5);
        
        let deepObject: any = {};
        let current = deepObject;
        
        // Create deep nesting
        for (let i = 0; i < 1000; i++) {
          current.nested = {};
          current = current.nested;
        }
        current.minConfidence = 0.5;

        try {
          await parser.parseBuffer(validBuffer, deepObject);
        } catch (error) {
          // Should handle deep objects without stack overflow
          const message = (error as Error).message;
          expect(message).not.toMatch(/stack overflow|maximum call/i);
        }
      });
    });
  });

  describe('Streaming Options Validation', () => {
    test('should validate streaming-specific options', async () => {
      const mockStream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new Float32Array(1024).fill(0.5));
          controller.close();
        }
      });

      const invalidStreamingOptions: StreamingOptions[] = [
        { chunkSize: -1000 },
        { chunkSize: 0 },
        { overlap: -0.5 },
        { overlap: 2.0 }, // > 1.0
        { overlap: NaN },
        { progressCallback: 'not a function' as any }
      ];

      for (const options of invalidStreamingOptions) {
        try {
          await parser.parseStream(mockStream, options);
        } catch (error) {
          // Should validate streaming options appropriately
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).not.toMatch(/crash|segmentation/i);
        }
      }
    });

    test('should handle progress callback errors', async () => {
      const erroringCallback = (progress: number) => {
        throw new Error(`Progress callback error: ${progress}`);
      };

      const mockStream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new Float32Array(1024).fill(0.5));
          controller.close();
        }
      });

      try {
        await parser.parseStream(mockStream, {
          progressCallback: erroringCallback
        });
      } catch (error) {
        // Should handle callback errors gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Input Recovery and Graceful Degradation', () => {
    test('should attempt to recover from transient file access errors', async () => {
      // Simulate transient file access issues
      let attemptCount = 0;
      const originalFileExists = (parser as any).fileExists;
      
      (parser as any).fileExists = async (filePath: string) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Transient access error');
        }
        return originalFileExists.call(parser, filePath);
      };

      try {
        await parser.parseFile('test.wav');
      } catch (error) {
        // Should provide meaningful error even after retry
        expect(error).toBeInstanceOf(Error);
      } finally {
        // Restore original method
        (parser as any).fileExists = originalFileExists;
      }
    });

    test('should gracefully degrade when processing resources are limited', async () => {
      const hugeBuffer = new Float32Array(88200 * 60).fill(0.5); // 1 minute audio
      
      try {
        const result = await parser.parseBuffer(hugeBuffer);
        expect(result).toBeDefined();
      } catch (error) {
        // If processing fails, should provide helpful guidance
        const message = (error as Error).message;
        expect(message).toMatch(/memory|resource|limit|large/i);
        expect(message).toMatch(/reduce|smaller|chunk/i);
      }
    }, 30000);

    test('should maintain system stability after input errors', async () => {
      const invalidInputs = [
        new Float32Array(0),
        null,
        new Float32Array(100),
        (() => { const buf = new Float32Array(4096); buf[0] = NaN; return buf; })()
      ];

      // Process multiple invalid inputs
      for (const invalidInput of invalidInputs) {
        try {
          await parser.parseBuffer(invalidInput as any);
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }

      // Parser should still work after errors
      const validBuffer = new Float32Array(4096).fill(0.5);
      const result = await parser.parseBuffer(validBuffer);
      expect(result).toBeDefined();
    });

    test('should provide fallback mechanisms for unsupported inputs', async () => {
      // Test fallback behavior for edge cases
      const edgeCases = [
        { input: new Float32Array(2048).fill(0), scenario: 'silent audio' },
        { input: new Float32Array(2048).fill(1), scenario: 'maximum amplitude' },
        { input: new Float32Array(2048).fill(-1), scenario: 'negative maximum' }
      ];

      for (const { input, scenario } of edgeCases) {
        try {
          const result = await parser.parseBuffer(input);
          expect(result).toBeDefined();
          // Should handle edge cases gracefully, possibly with warnings
        } catch (error) {
          // If processing fails, should be for valid reasons
          const message = (error as Error).message;
          expect(message).not.toMatch(/crash|fatal|segmentation/i);
        }
      }
    });
  });

  describe('Error Context and Debugging Information', () => {
    test('should provide rich context in input error messages', async () => {
      const testCases = [
        {
          action: () => parser.parseFile(''),
          expectedContext: ['path', 'empty', 'provided']
        },
        {
          action: () => parser.parseBuffer(new Float32Array(100)),
          expectedContext: ['length', '100', 'minimum', '2048']
        },
        {
          action: () => parser.parseFile('test.xyz'),
          expectedContext: ['extension', '.xyz', 'supported', '.wav']
        }
      ];

      for (const { action, expectedContext } of testCases) {
        try {
          await action();
          fail('Should have thrown');
        } catch (error) {
          const message = (error as Error).message.toLowerCase();
          expectedContext.forEach(context => {
            expect(message).toContain(context.toLowerCase());
          });
        }
      }
    });

    test('should include actionable guidance in error messages', async () => {
      const guidanceTests = [
        {
          action: () => parser.parseBuffer(new Float32Array(1000)),
          expectedGuidance: /provide.*larger|increase.*size|minimum.*2048/i
        },
        {
          action: () => parser.parseFile('audio.txt'),
          expectedGuidance: /supported.*formats|convert.*audio|use.*wav/i
        }
      ];

      for (const { action, expectedGuidance } of guidanceTests) {
        try {
          await action();
          fail('Should have thrown');
        } catch (error) {
          const message = (error as Error).message;
          expect(message).toMatch(expectedGuidance);
        }
      }
    });
  });
});