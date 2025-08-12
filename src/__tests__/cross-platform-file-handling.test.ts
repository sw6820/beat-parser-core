/**
 * Cross-Platform File Handling Compatibility Tests
 * Validates consistent file operations across Node.js and browser environments
 */

import { AudioProcessor } from '../core/AudioProcessor';
import path from 'path';
import fs from 'fs';
import { performance } from 'perf_hooks';

describe('Cross-Platform File Handling', () => {
  const testAudioDir = path.join(__dirname, 'test-audio-files');

  describe('Environment-Specific File Capabilities', () => {
    test('should detect Node.js file system capabilities', () => {
      // In Node.js environment, fs module should be available
      expect(typeof fs.readFileSync).toBe('function');
      expect(typeof fs.writeFileSync).toBe('function');
      expect(typeof fs.existsSync).toBe('function');
      expect(typeof fs.statSync).toBe('function');
      expect(typeof fs.mkdirSync).toBe('function');

      // Path module should be available
      expect(typeof path.join).toBe('function');
      expect(typeof path.resolve).toBe('function');
      expect(typeof path.dirname).toBe('function');
      expect(typeof path.basename).toBe('function');
      expect(typeof path.extname).toBe('function');
    });

    test('should not detect browser File API in Node.js', () => {
      // Browser-specific APIs should not be available
      expect(typeof File).toBe('undefined');
      expect(typeof FileReader).toBe('undefined');
      expect(typeof Blob).toBe('undefined');
      expect(typeof FileList).toBe('undefined');
      expect(typeof DataTransfer).toBe('undefined');
    });

    test('should handle path separators correctly', () => {
      const testPath = path.join('folder', 'subfolder', 'file.txt');
      
      // Should use platform-appropriate separator
      expect(testPath).toContain(path.sep);
      
      // Should handle both forward and back slashes
      const normalizedPath = path.normalize('folder/subfolder\\file.txt');
      expect(normalizedPath).toBeDefined();
      expect(typeof normalizedPath).toBe('string');
    });

    test('should resolve paths correctly across platforms', () => {
      const relativePath = './test-file.txt';
      const absolutePath = path.resolve(relativePath);
      
      expect(path.isAbsolute(absolutePath)).toBe(true);
      expect(path.isAbsolute(relativePath)).toBe(false);
      
      // Should handle parent directory references
      const parentPath = path.resolve('../test-file.txt');
      expect(path.isAbsolute(parentPath)).toBe(true);
    });

    test('should handle file extensions consistently', () => {
      const testFiles = [
        'audio.mp3',
        'audio.wav',
        'audio.flac',
        'audio.ogg',
        'audio.m4a',
        'audio.aac',
        'audio.webm',
        'AUDIO.MP3', // Test case sensitivity
        'audio.file.mp3', // Multiple dots
        'audio' // No extension
      ];

      for (const filename of testFiles) {
        const ext = path.extname(filename);
        const basename = path.basename(filename, ext);
        const fullPath = path.join('/test/dir', filename);
        
        expect(typeof ext).toBe('string');
        expect(typeof basename).toBe('string');
        expect(path.basename(fullPath)).toBe(filename);
        expect(path.dirname(fullPath)).toBe('/test/dir');
      }
    });
  });

  describe('Buffer and Data Type Handling', () => {
    test('should handle Node.js Buffer consistently', () => {
      const testData = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
      const buffer = Buffer.from(testData);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(4);
      expect(buffer[0]).toBe(0x52);
      
      // Convert to ArrayBuffer
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(arrayBuffer.byteLength).toBe(4);
      
      // Convert to Uint8Array
      const uint8Array = new Uint8Array(arrayBuffer);
      expect(uint8Array).toBeInstanceOf(Uint8Array);
      expect(uint8Array.length).toBe(4);
      expect(uint8Array[0]).toBe(0x52);
    });

    test('should handle ArrayBuffer to Buffer conversion', () => {
      const arrayBuffer = new ArrayBuffer(4);
      const view = new Uint8Array(arrayBuffer);
      view[0] = 0x52;
      view[1] = 0x49;
      view[2] = 0x46;
      view[3] = 0x46;
      
      // Convert ArrayBuffer to Buffer
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(4);
      expect(buffer[0]).toBe(0x52);
    });

    test('should handle Uint8Array to Buffer conversion', () => {
      const uint8Array = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      
      // Convert Uint8Array to Buffer
      const buffer = Buffer.from(uint8Array);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(4);
      expect(buffer[0]).toBe(0x52);
      
      // Should also work with buffer property
      const arrayBuffer = uint8Array.buffer;
      const buffer2 = Buffer.from(arrayBuffer);
      expect(buffer2).toBeInstanceOf(Buffer);
      expect(buffer2.length).toBe(4);
    });

    test('should handle large buffer operations efficiently', () => {
      const largeSize = 1024 * 1024; // 1MB
      const largeBuffer = Buffer.alloc(largeSize, 0x42);
      
      const start = performance.now();
      const arrayBuffer = largeBuffer.buffer.slice(largeBuffer.byteOffset, largeBuffer.byteOffset + largeBuffer.byteLength);
      const end = performance.now();
      
      expect(arrayBuffer.byteLength).toBe(largeSize);
      expect(end - start).toBeLessThan(100); // Should be fast
      
      // Verify data integrity
      const view = new Uint8Array(arrayBuffer);
      expect(view[0]).toBe(0x42);
      expect(view[largeSize - 1]).toBe(0x42);
    });
  });

  describe('File System Operations', () => {
    test('should handle file existence checks', () => {
      // Check for a file that should exist (this test file itself)
      const thisTestFile = __filename;
      expect(fs.existsSync(thisTestFile)).toBe(true);
      
      // Check for a file that shouldn't exist
      const nonExistentFile = path.join(__dirname, 'definitely-does-not-exist.xyz');
      expect(fs.existsSync(nonExistentFile)).toBe(false);
      
      // Check for directory
      expect(fs.existsSync(__dirname)).toBe(true);
    });

    test('should handle file stats consistently', () => {
      const thisTestFile = __filename;
      const stats = fs.statSync(thisTestFile);
      
      expect(stats).toBeDefined();
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.mtime).toBeInstanceOf(Date);
      expect(stats.birthtime).toBeInstanceOf(Date);
    });

    test('should handle directory operations', () => {
      const tempDir = path.join(__dirname, 'temp-test-dir');
      
      try {
        // Create directory if it doesn't exist
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        expect(fs.existsSync(tempDir)).toBe(true);
        
        const stats = fs.statSync(tempDir);
        expect(stats.isDirectory()).toBe(true);
        expect(stats.isFile()).toBe(false);
        
        // Clean up
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (error) {
        // Clean up on error
        if (fs.existsSync(tempDir)) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
        }
        throw error;
      }
    });

    test('should handle file permissions and access', () => {
      const thisTestFile = __filename;
      
      // Test file access
      expect(() => fs.accessSync(thisTestFile, fs.constants.F_OK)).not.toThrow();
      expect(() => fs.accessSync(thisTestFile, fs.constants.R_OK)).not.toThrow();
      
      // Test non-existent file
      const nonExistentFile = path.join(__dirname, 'does-not-exist.txt');
      expect(() => fs.accessSync(nonExistentFile, fs.constants.F_OK)).toThrow();
    });

    test('should handle temporary file creation', () => {
      const tempFile = path.join(__dirname, `temp-${Date.now()}.txt`);
      const testContent = 'Test content for cross-platform compatibility';
      
      try {
        // Write temporary file
        fs.writeFileSync(tempFile, testContent, 'utf8');
        expect(fs.existsSync(tempFile)).toBe(true);
        
        // Read it back
        const readContent = fs.readFileSync(tempFile, 'utf8');
        expect(readContent).toBe(testContent);
        
        // Check stats
        const stats = fs.statSync(tempFile);
        expect(stats.size).toBe(Buffer.byteLength(testContent, 'utf8'));
        
      } finally {
        // Clean up
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });

  describe('Audio File Loading Compatibility', () => {
    const createTestWAVFile = (filename: string, samples: number[] = [0.1, -0.2, 0.3, -0.4]): string => {
      const filePath = path.join(__dirname, filename);
      
      // Create minimal WAV file
      const buffer = Buffer.alloc(44 + samples.length * 2);
      let offset = 0;
      
      // RIFF header
      buffer.write('RIFF', offset); offset += 4;
      buffer.writeUInt32LE(36 + samples.length * 2, offset); offset += 4;
      buffer.write('WAVE', offset); offset += 4;
      
      // fmt chunk
      buffer.write('fmt ', offset); offset += 4;
      buffer.writeUInt32LE(16, offset); offset += 4; // Chunk size
      buffer.writeUInt16LE(1, offset); offset += 2; // PCM
      buffer.writeUInt16LE(1, offset); offset += 2; // Mono
      buffer.writeUInt32LE(44100, offset); offset += 4; // Sample rate
      buffer.writeUInt32LE(88200, offset); offset += 4; // Byte rate
      buffer.writeUInt16LE(2, offset); offset += 2; // Block align
      buffer.writeUInt16LE(16, offset); offset += 2; // 16-bit
      
      // data chunk
      buffer.write('data', offset); offset += 4;
      buffer.writeUInt32LE(samples.length * 2, offset); offset += 4;
      
      // Sample data
      for (const sample of samples) {
        buffer.writeInt16LE(Math.floor(sample * 32767), offset);
        offset += 2;
      }
      
      fs.writeFileSync(filePath, buffer);
      return filePath;
    };

    test('should load audio files from file paths', async () => {
      const testFile = createTestWAVFile('test-audio.wav');
      
      try {
        const audioBuffer = await AudioProcessor.loadAudio(testFile);
        
        expect(audioBuffer).toBeDefined();
        expect(audioBuffer.data).toBeInstanceOf(Float32Array);
        expect(audioBuffer.sampleRate).toBe(44100);
        expect(audioBuffer.channels).toBe(1);
        expect(audioBuffer.data.length).toBe(4);
        
      } finally {
        // Clean up
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });

    test('should handle audio file loading errors consistently', async () => {
      // Non-existent file
      const nonExistentFile = path.join(__dirname, 'does-not-exist.wav');
      await expect(AudioProcessor.loadAudio(nonExistentFile))
        .rejects
        .toThrow(/not found/i);
      
      // Directory instead of file
      await expect(AudioProcessor.loadAudio(__dirname))
        .rejects
        .toThrow(/not a file/i);
      
      // Empty file
      const emptyFile = path.join(__dirname, 'empty-test.wav');
      try {
        fs.writeFileSync(emptyFile, Buffer.alloc(0));
        await expect(AudioProcessor.loadAudio(emptyFile))
          .rejects
          .toThrow(/empty/i);
      } finally {
        if (fs.existsSync(emptyFile)) {
          fs.unlinkSync(emptyFile);
        }
      }
    });

    test('should validate audio file formats', async () => {
      const invalidExtensions = ['txt', 'jpg', 'pdf', 'exe'];
      
      for (const ext of invalidExtensions) {
        const testFile = path.join(__dirname, `test.${ext}`);
        
        try {
          fs.writeFileSync(testFile, 'dummy content');
          
          await expect(AudioProcessor.loadAudio(testFile))
            .rejects
            .toThrow(/unsupported.*format/i);
            
        } finally {
          if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
          }
        }
      }
    });

    test('should handle various audio file sizes', async () => {
      const sizes = [
        { name: 'tiny', samples: [0.1] },
        { name: 'small', samples: new Array(100).fill(0).map((_, i) => Math.sin(i * 0.1)) },
        { name: 'medium', samples: new Array(1000).fill(0).map((_, i) => Math.sin(i * 0.01)) }
      ];
      
      for (const size of sizes) {
        const testFile = createTestWAVFile(`test-${size.name}.wav`, size.samples);
        
        try {
          const startTime = performance.now();
          const audioBuffer = await AudioProcessor.loadAudio(testFile);
          const endTime = performance.now();
          
          expect(audioBuffer.data.length).toBe(size.samples.length);
          expect(endTime - startTime).toBeLessThan(5000); // Should load within 5 seconds
          
        } finally {
          if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
          }
        }
      }
    });

    test('should handle concurrent file loading', async () => {
      const testFiles = [
        createTestWAVFile('test-concurrent-1.wav', [0.1, -0.1]),
        createTestWAVFile('test-concurrent-2.wav', [0.2, -0.2]),
        createTestWAVFile('test-concurrent-3.wav', [0.3, -0.3])
      ];
      
      try {
        const loadPromises = testFiles.map(file => AudioProcessor.loadAudio(file));
        const results = await Promise.all(loadPromises);
        
        expect(results).toHaveLength(3);
        for (const result of results) {
          expect(result).toBeDefined();
          expect(result.data).toBeInstanceOf(Float32Array);
          expect(result.data.length).toBe(2);
        }
        
      } finally {
        // Clean up all test files
        for (const file of testFiles) {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        }
      }
    });
  });

  describe('Buffer-Based File Operations', () => {
    test('should handle file buffers from fs.readFileSync', () => {
      const thisTestFile = __filename;
      const fileBuffer = fs.readFileSync(thisTestFile);
      
      expect(fileBuffer).toBeInstanceOf(Buffer);
      expect(fileBuffer.length).toBeGreaterThan(0);
      
      // Convert to ArrayBuffer
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(arrayBuffer.byteLength).toBe(fileBuffer.length);
    });

    test('should handle binary file operations', () => {
      const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
      const buffer = Buffer.from(binaryData);
      const tempFile = path.join(__dirname, 'temp-binary.bin');
      
      try {
        // Write binary data
        fs.writeFileSync(tempFile, buffer);
        
        // Read it back
        const readBuffer = fs.readFileSync(tempFile);
        expect(readBuffer).toEqual(buffer);
        
        // Verify binary content
        expect(readBuffer[0]).toBe(0x89);
        expect(readBuffer[1]).toBe(0x50);
        expect(readBuffer[2]).toBe(0x4E);
        expect(readBuffer[3]).toBe(0x47);
        
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    test('should handle large file streaming', async () => {
      const largeSize = 1024 * 1024; // 1MB
      const chunkSize = 64 * 1024; // 64KB chunks
      const tempFile = path.join(__dirname, 'temp-large.bin');
      
      try {
        // Create large file
        const largeBuffer = Buffer.alloc(largeSize, 0x42);
        fs.writeFileSync(tempFile, largeBuffer);
        
        // Read in chunks
        const fd = fs.openSync(tempFile, 'r');
        let totalRead = 0;
        const chunks: Buffer[] = [];
        
        try {
          while (totalRead < largeSize) {
            const remainingSize = Math.min(chunkSize, largeSize - totalRead);
            const chunk = Buffer.alloc(remainingSize);
            const bytesRead = fs.readSync(fd, chunk, 0, remainingSize, totalRead);
            
            expect(bytesRead).toBe(remainingSize);
            chunks.push(chunk);
            totalRead += bytesRead;
          }
          
          expect(totalRead).toBe(largeSize);
          expect(chunks.length).toBe(Math.ceil(largeSize / chunkSize));
          
          // Verify chunk content
          for (const chunk of chunks) {
            for (const byte of chunk) {
              expect(byte).toBe(0x42);
            }
          }
          
        } finally {
          fs.closeSync(fd);
        }
        
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });

  describe('Cross-Platform Path Handling', () => {
    test('should handle absolute vs relative paths', () => {
      const relativePath = path.join('test', 'file.txt');
      const absolutePath = path.resolve(relativePath);
      
      expect(path.isAbsolute(relativePath)).toBe(false);
      expect(path.isAbsolute(absolutePath)).toBe(true);
      
      // Converting relative to absolute should be consistent
      const resolved = path.resolve(__dirname, relativePath);
      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved).toContain('test');
      expect(resolved).toContain('file.txt');
    });

    test('should handle path normalization', () => {
      const unnormalizedPaths = [
        'folder/../file.txt',
        './folder/./file.txt',
        'folder//file.txt',
        'folder/subfolder/../file.txt'
      ];
      
      for (const unnormalized of unnormalizedPaths) {
        const normalized = path.normalize(unnormalized);
        expect(normalized).toBeDefined();
        expect(typeof normalized).toBe('string');
        
        // Should not contain unnecessary path components
        expect(normalized).not.toContain('../');
        expect(normalized).not.toContain('./');
        expect(normalized).not.toContain('//');
      }
    });

    test('should handle special characters in paths', () => {
      const specialPaths = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.with.dots.txt',
        'file(with)parentheses.txt'
      ];
      
      for (const specialPath of specialPaths) {
        const fullPath = path.join(__dirname, specialPath);
        const basename = path.basename(fullPath);
        const dirname = path.dirname(fullPath);
        
        expect(basename).toBe(specialPath);
        expect(dirname).toBe(__dirname);
      }
    });

    test('should handle Unicode characters in paths', () => {
      const unicodePaths = [
        'файл.txt', // Cyrillic
        '文件.txt', // Chinese
        'ファイル.txt', // Japanese
        'αρχείο.txt', // Greek
        'dosya.txt' // Turkish
      ];
      
      for (const unicodePath of unicodePaths) {
        const fullPath = path.join(__dirname, unicodePath);
        const basename = path.basename(fullPath);
        
        expect(basename).toBe(unicodePath);
        expect(typeof fullPath).toBe('string');
        expect(fullPath.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling Consistency', () => {
    test('should handle file system errors consistently', () => {
      // Permission denied (simulated by accessing system directory)
      const restrictedPath = process.platform === 'win32' ? 'C:\\System Volume Information' : '/root/.ssh';
      
      // These operations should throw but not crash the process
      expect(() => {
        try {
          fs.readdirSync(restrictedPath);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as any).code).toBeDefined();
          throw error;
        }
      }).toThrow();
    });

    test('should provide meaningful error messages', () => {
      const nonExistentFile = path.join(__dirname, 'absolutely-does-not-exist.wav');
      
      try {
        fs.readFileSync(nonExistentFile);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('ENOENT');
        expect((error as any).code).toBe('ENOENT');
        expect((error as any).path).toBe(nonExistentFile);
      }
    });

    test('should handle async file operation errors', async () => {
      const nonExistentFile = path.join(__dirname, 'does-not-exist.txt');
      
      await expect(
        new Promise((resolve, reject) => {
          fs.readFile(nonExistentFile, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        })
      ).rejects.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should handle memory efficiently with large buffers', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const largeSize = 10 * 1024 * 1024; // 10MB
      
      // Create large buffer
      const largeBuffer = Buffer.alloc(largeSize, 0xFF);
      expect(largeBuffer.length).toBe(largeSize);
      
      const afterAllocationMemory = process.memoryUsage().heapUsed;
      expect(afterAllocationMemory).toBeGreaterThan(initialMemory);
      
      // Clear reference and force GC if available
      // Note: In production, don't rely on manual GC
      const bufferCleared = largeBuffer.fill(0);
      expect(bufferCleared).toBe(largeBuffer);
      
      if (global.gc) {
        global.gc();
        const afterGCMemory = process.memoryUsage().heapUsed;
        // Memory usage might have changed, but shouldn't crash
        expect(typeof afterGCMemory).toBe('number');
      }
    });

    test('should handle buffer slicing without memory leaks', () => {
      const originalBuffer = Buffer.alloc(1000, 0xAA);
      const slices: Buffer[] = [];
      
      // Create many slices
      for (let i = 0; i < 100; i++) {
        const slice = originalBuffer.slice(i, i + 10);
        slices.push(slice);
        expect(slice.length).toBe(10);
        expect(slice[0]).toBe(0xAA);
      }
      
      expect(slices.length).toBe(100);
      
      // All slices should still be valid
      for (const slice of slices) {
        expect(slice[0]).toBe(0xAA);
      }
    });
  });
});