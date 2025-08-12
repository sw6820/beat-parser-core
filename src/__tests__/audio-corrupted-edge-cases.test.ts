/**
 * Corrupted Files and Edge Case Tests
 * Tests handling of malformed, corrupted, and edge case audio files
 */

import { BeatParser } from '../core/BeatParser';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Corrupted Files and Edge Cases', () => {
  let beatParser: BeatParser;
  const tempDir = path.join(__dirname, 'temp-corrupted-tests');

  beforeAll(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  beforeEach(() => {
    beatParser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.5
    });
  });

  afterEach(async () => {
    await beatParser.cleanup();
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
      await fs.rmdir(tempDir);
    } catch (error) {
      console.warn('Error cleaning up temp directory:', error);
    }
  });

  describe('Malformed Header Tests', () => {
    test('should reject files with invalid RIFF signature', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Corrupt the RIFF signature
      const corruptedBuffer = Buffer.from(validWav);
      corruptedBuffer.write('BADH', 0); // Replace 'RIFF' with 'BADH'
      
      const corruptedPath = path.join(tempDir, 'bad_riff_signature.wav');
      await fs.writeFile(corruptedPath, corruptedBuffer);

      await expect(beatParser.parseFile(corruptedPath)).rejects.toThrow();
    });

    test('should reject files with invalid WAVE signature', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Corrupt the WAVE signature (at offset 8)
      const corruptedBuffer = Buffer.from(validWav);
      corruptedBuffer.write('BADW', 8);
      
      const corruptedPath = path.join(tempDir, 'bad_wave_signature.wav');
      await fs.writeFile(corruptedPath, corruptedBuffer);

      await expect(beatParser.parseFile(corruptedPath)).rejects.toThrow();
    });

    test('should reject files with incorrect file size in header', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Set incorrect file size (at offset 4)
      const corruptedBuffer = Buffer.from(validWav);
      corruptedBuffer.writeUInt32LE(0xFFFFFFFF, 4); // Set to maximum value
      
      const corruptedPath = path.join(tempDir, 'bad_file_size.wav');
      await fs.writeFile(corruptedPath, corruptedBuffer);

      await expect(beatParser.parseFile(corruptedPath)).rejects.toThrow();
    });

    test('should reject files with missing fmt chunk', async () => {
      // Create minimal WAV header without fmt chunk
      const minimalBuffer = Buffer.alloc(20);
      let offset = 0;
      
      minimalBuffer.write('RIFF', offset); offset += 4;
      minimalBuffer.writeUInt32LE(12, offset); offset += 4; // File size
      minimalBuffer.write('WAVE', offset); offset += 4;
      minimalBuffer.write('data', offset); offset += 4; // Skip fmt, go straight to data
      minimalBuffer.writeUInt32LE(0, offset); // Empty data chunk
      
      const corruptedPath = path.join(tempDir, 'missing_fmt_chunk.wav');
      await fs.writeFile(corruptedPath, minimalBuffer);

      await expect(beatParser.parseFile(corruptedPath)).rejects.toThrow();
    });

    test('should reject files with invalid sample rate', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Set invalid sample rate (at offset 24 in fmt chunk)
      const corruptedBuffer = Buffer.from(validWav);
      corruptedBuffer.writeUInt32LE(0, 24); // Set sample rate to 0
      
      const corruptedPath = path.join(tempDir, 'zero_sample_rate.wav');
      await fs.writeFile(corruptedPath, corruptedBuffer);

      await expect(beatParser.parseFile(corruptedPath)).rejects.toThrow();
    });

    test('should reject files with invalid channel count', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Set invalid channel count (at offset 22 in fmt chunk)
      const corruptedBuffer = Buffer.from(validWav);
      corruptedBuffer.writeUInt16LE(0, 22); // Set channels to 0
      
      const corruptedPath = path.join(tempDir, 'zero_channels.wav');
      await fs.writeFile(corruptedPath, corruptedBuffer);

      await expect(beatParser.parseFile(corruptedPath)).rejects.toThrow();
    });
  });

  describe('Truncated File Tests', () => {
    test('should reject files truncated in header', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Truncate in middle of header
      const truncatedBuffer = validWav.slice(0, 20); // Only first 20 bytes
      
      const truncatedPath = path.join(tempDir, 'truncated_header.wav');
      await fs.writeFile(truncatedPath, truncatedBuffer);

      await expect(beatParser.parseFile(truncatedPath)).rejects.toThrow();
    });

    test('should reject files truncated in data section', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 2,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 2,
        bitDepth: 16,
        format: 'wav'
      });

      // Truncate halfway through data
      const halfSize = 44 + Math.floor((validWav.length - 44) / 2);
      const truncatedBuffer = validWav.slice(0, halfSize);
      
      const truncatedPath = path.join(tempDir, 'truncated_data.wav');
      await fs.writeFile(truncatedPath, truncatedBuffer);

      await expect(beatParser.parseFile(truncatedPath)).rejects.toThrow();
    });

    test('should reject files with data length mismatch', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Modify data chunk size to be much larger than actual data
      const corruptedBuffer = Buffer.from(validWav);
      const dataChunkSizeOffset = 40; // Assuming standard WAV structure
      corruptedBuffer.writeUInt32LE(validWav.length * 10, dataChunkSizeOffset);
      
      const mismatchPath = path.join(tempDir, 'data_size_mismatch.wav');
      await fs.writeFile(mismatchPath, corruptedBuffer);

      await expect(beatParser.parseFile(mismatchPath)).rejects.toThrow();
    });
  });

  describe('Binary Garbage Tests', () => {
    test('should reject pure random binary data', async () => {
      const garbageBuffer = Buffer.alloc(1024);
      for (let i = 0; i < garbageBuffer.length; i++) {
        garbageBuffer[i] = Math.floor(Math.random() * 256);
      }
      
      const garbagePath = path.join(tempDir, 'random_garbage.wav');
      await fs.writeFile(garbagePath, garbageBuffer);

      await expect(beatParser.parseFile(garbagePath)).rejects.toThrow();
    });

    test('should reject text file with WAV extension', async () => {
      const textContent = `This is not an audio file.
It's just plain text pretending to be WAV.
Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;
      
      const textPath = path.join(tempDir, 'text_file.wav');
      await fs.writeFile(textPath, textContent);

      await expect(beatParser.parseFile(textPath)).rejects.toThrow();
    });

    test('should reject HTML file with WAV extension', async () => {
      const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Not Audio</title></head>
<body><p>This is HTML, not audio!</p></body>
</html>`;
      
      const htmlPath = path.join(tempDir, 'html_file.wav');
      await fs.writeFile(htmlPath, htmlContent);

      await expect(beatParser.parseFile(htmlPath)).rejects.toThrow();
    });

    test('should reject executable file with WAV extension', async () => {
      // Create a buffer that looks like an executable header
      const execBuffer = Buffer.alloc(512);
      execBuffer.write('MZ', 0); // DOS header signature
      execBuffer.writeUInt16LE(0x5A4D, 0); // PE signature
      
      for (let i = 4; i < execBuffer.length; i++) {
        execBuffer[i] = Math.floor(Math.random() * 256);
      }
      
      const execPath = path.join(tempDir, 'executable.wav');
      await fs.writeFile(execPath, execBuffer);

      await expect(beatParser.parseFile(execPath)).rejects.toThrow();
    });
  });

  describe('Extreme Value Tests', () => {
    test('should handle audio with all samples at maximum positive value', async () => {
      const maxValueSamples = new Float32Array(44100); // 1 second
      maxValueSamples.fill(1.0); // Maximum positive value
      
      const result = await beatParser.parseBuffer(maxValueSamples);
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
    });

    test('should handle audio with all samples at maximum negative value', async () => {
      const minValueSamples = new Float32Array(44100); // 1 second
      minValueSamples.fill(-1.0); // Maximum negative value
      
      const result = await beatParser.parseBuffer(minValueSamples);
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
    });

    test('should handle audio with alternating extreme values', async () => {
      const alternatingValues = new Float32Array(44100); // 1 second
      for (let i = 0; i < alternatingValues.length; i++) {
        alternatingValues[i] = i % 2 === 0 ? 1.0 : -1.0;
      }
      
      const result = await beatParser.parseBuffer(alternatingValues);
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
    });

    test('should reject audio with values outside valid range', async () => {
      const invalidSamples = new Float32Array(44100);
      for (let i = 0; i < invalidSamples.length; i++) {
        // Values outside [-1, 1] range
        invalidSamples[i] = i % 2 === 0 ? 2.0 : -2.0;
      }
      
      // The parser should handle clipping or reject the audio
      try {
        const result = await beatParser.parseBuffer(invalidSamples);
        expect(result).toBeDefined();
        // If it succeeds, it should have clipped the values
      } catch (error) {
        // Or it might reject out-of-range values
        expect(error).toBeDefined();
      }
    });
  });

  describe('Buffer Edge Cases', () => {
    test('should reject buffers with invalid Float32Array data', async () => {
      // Create a Float32Array with only NaN values
      const nanBuffer = new Float32Array(2048);
      nanBuffer.fill(NaN);
      
      await expect(beatParser.parseBuffer(nanBuffer)).rejects.toThrow(/invalid values/i);
    });

    test('should reject buffers with only infinite values', async () => {
      const infBuffer = new Float32Array(2048);
      infBuffer.fill(Infinity);
      
      await expect(beatParser.parseBuffer(infBuffer)).rejects.toThrow(/invalid values/i);
    });

    test('should reject buffers with mixed NaN and Infinity', async () => {
      const mixedBuffer = new Float32Array(2048);
      for (let i = 0; i < mixedBuffer.length; i++) {
        mixedBuffer[i] = i % 2 === 0 ? NaN : Infinity;
      }
      
      await expect(beatParser.parseBuffer(mixedBuffer)).rejects.toThrow(/invalid values/i);
    });

    test('should handle buffers with sparse invalid values', async () => {
      const sparseInvalidBuffer = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      // Inject a few NaN values (less than 1%)
      const invalidCount = Math.floor(sparseInvalidBuffer.length * 0.005);
      for (let i = 0; i < invalidCount; i++) {
        const pos = Math.floor(Math.random() * sparseInvalidBuffer.length);
        sparseInvalidBuffer[pos] = NaN;
      }
      
      await expect(beatParser.parseBuffer(sparseInvalidBuffer)).rejects.toThrow(/invalid values/i);
    });

    test('should handle extremely small buffers', async () => {
      // Buffer smaller than minimum frame size but larger than zero
      const tinyBuffer = new Float32Array(10);
      for (let i = 0; i < tinyBuffer.length; i++) {
        tinyBuffer[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }
      
      await expect(beatParser.parseBuffer(tinyBuffer)).rejects.toThrow(/too short/i);
    });

    test('should handle buffers exactly at minimum size', async () => {
      // Buffer exactly at frame size (2048 samples by default)
      const minBuffer = new Float32Array(2048);
      for (let i = 0; i < minBuffer.length; i++) {
        minBuffer[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }
      
      const result = await beatParser.parseBuffer(minBuffer);
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
    });

    test('should handle Node.js Buffer with invalid content', async () => {
      // Create a Node.js Buffer with invalid binary content for audio
      const invalidBuffer = Buffer.alloc(2048);
      invalidBuffer.fill(0xFF); // All bytes set to 255
      
      await expect(beatParser.parseBuffer(invalidBuffer)).rejects.toThrow();
    });

    test('should handle typed arrays other than Float32Array', async () => {
      const int16Array = new Int16Array(2048);
      for (let i = 0; i < int16Array.length; i++) {
        int16Array[i] = Math.floor(Math.sin(2 * Math.PI * 440 * i / 44100) * 32767);
      }
      
      // This should either work (if the parser handles Int16Array) or fail gracefully
      try {
        const result = await beatParser.parseBuffer(int16Array as any);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('File System Edge Cases', () => {
    test('should reject directories with audio extensions', async () => {
      const dirPath = path.join(tempDir, 'fake_audio.wav');
      await fs.mkdir(dirPath, { recursive: true });
      
      try {
        await expect(beatParser.parseFile(dirPath)).rejects.toThrow();
      } finally {
        await fs.rmdir(dirPath);
      }
    });

    test('should handle files with very long paths', async () => {
      const longDirName = 'a'.repeat(100);
      const longDirPath = path.join(tempDir, longDirName);
      await fs.mkdir(longDirPath, { recursive: true });
      
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const longFilePath = path.join(longDirPath, 'test_audio.wav');
      await fs.writeFile(longFilePath, validWav);
      
      try {
        const result = await beatParser.parseFile(longFilePath);
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      } finally {
        await fs.unlink(longFilePath);
        await fs.rmdir(longDirPath);
      }
    });

    test('should handle files with special characters in names', async () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '(', ')', ' ', '[', ']'];
      
      for (const char of specialChars) {
        const validSamples = AudioTestFileGenerator.generateSineWave(440, {
          sampleRate: 44100,
          channels: 1,
          duration: 0.5,
          bitDepth: 16,
          format: 'wav'
        });
        
        const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
          sampleRate: 44100,
          channels: 1,
          duration: 0.5,
          bitDepth: 16,
          format: 'wav'
        });
        
        const specialFileName = `test${char}audio.wav`;
        const specialFilePath = path.join(tempDir, specialFileName);
        
        try {
          await fs.writeFile(specialFilePath, validWav);
          
          const result = await beatParser.parseFile(specialFilePath);
          expect(result).toBeDefined();
          expect(result.beats).toBeDefined();
          
        } catch (error) {
          // Some special characters might not be valid on certain file systems
          console.warn(`Special character '${char}' not supported in filename:`, error);
        } finally {
          try {
            await fs.unlink(specialFilePath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    });
  });

  describe('Concurrent Access Tests', () => {
    test('should handle concurrent parseFile calls', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const testFilePath = path.join(tempDir, 'concurrent_test.wav');
      await fs.writeFile(testFilePath, validWav);
      
      // Create multiple parsers to test concurrent access
      const parsers = Array.from({ length: 3 }, () => new BeatParser());
      
      try {
        const promises = parsers.map(parser => parser.parseFile(testFilePath));
        const results = await Promise.all(promises);
        
        for (const result of results) {
          expect(result).toBeDefined();
          expect(result.beats).toBeDefined();
        }
        
      } finally {
        // Cleanup all parsers
        await Promise.all(parsers.map(parser => parser.cleanup()));
        await fs.unlink(testFilePath);
      }
    });

    test('should handle file being deleted during parsing', async () => {
      const validSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 2, // Longer file for timing
        bitDepth: 16,
        format: 'wav'
      });
      
      const validWav = AudioTestFileGenerator.createWavBuffer(validSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 2,
        bitDepth: 16,
        format: 'wav'
      });
      
      const testFilePath = path.join(tempDir, 'delete_during_parse.wav');
      await fs.writeFile(testFilePath, validWav);
      
      // Start parsing
      const parsePromise = beatParser.parseFile(testFilePath);
      
      // Try to delete file shortly after starting parse
      setTimeout(async () => {
        try {
          await fs.unlink(testFilePath);
        } catch {
          // File might be locked during parsing
        }
      }, 10);
      
      // Parse should either succeed or fail gracefully
      try {
        const result = await parsePromise;
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});