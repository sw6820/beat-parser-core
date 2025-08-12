/**
 * Memory Usage and Streaming Tests
 * Tests memory efficiency, large file handling, and streaming audio processing
 */

import { BeatParser, StreamingOptions } from '../core/BeatParser';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';

interface MemoryProfile {
  initial: NodeJS.MemoryUsage;
  peak: NodeJS.MemoryUsage;
  final: NodeJS.MemoryUsage;
  maxHeapUsed: number;
  maxRSS: number;
  gcCount: number;
}

describe('Memory Usage and Streaming Tests', () => {
  let beatParser: BeatParser;
  const tempDir = path.join(__dirname, 'temp-memory-tests');

  beforeAll(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  beforeEach(() => {
    beatParser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512
    });
  });

  afterEach(async () => {
    await beatParser.cleanup();
    
    // Force garbage collection between tests
    if (global.gc) {
      global.gc();
    }
  });

  afterAll(async () => {
    // Cleanup temp files
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

  function profileMemory<T>(operation: () => Promise<T>): Promise<{ result: T; profile: MemoryProfile }> {
    return new Promise(async (resolve, reject) => {
      const profile: Partial<MemoryProfile> = {};
      let gcCount = 0;

      // Override global.gc to count calls if available
      const originalGc = global.gc;
      if (originalGc) {
        global.gc = () => {
          gcCount++;
          return originalGc();
        };
      }

      try {
        // Force initial GC
        if (global.gc) global.gc();
        
        profile.initial = process.memoryUsage();
        profile.maxHeapUsed = profile.initial.heapUsed;
        profile.maxRSS = profile.initial.rss;

        // Monitor memory during operation
        const memoryMonitor = setInterval(() => {
          const current = process.memoryUsage();
          if (current.heapUsed > profile.maxHeapUsed!) {
            profile.maxHeapUsed = current.heapUsed;
          }
          if (current.rss > profile.maxRSS!) {
            profile.maxRSS = current.rss;
          }
        }, 100);

        const result = await operation();

        clearInterval(memoryMonitor);
        
        // Record peak after operation
        const peakMemory = process.memoryUsage();
        if (peakMemory.heapUsed > profile.maxHeapUsed!) {
          profile.maxHeapUsed = peakMemory.heapUsed;
        }
        if (peakMemory.rss > profile.maxRSS!) {
          profile.maxRSS = peakMemory.rss;
        }
        profile.peak = peakMemory;

        // Force GC and measure final
        if (global.gc) global.gc();
        profile.final = process.memoryUsage();
        profile.gcCount = gcCount;

        resolve({
          result,
          profile: profile as MemoryProfile
        });

      } catch (error) {
        reject(error);
      } finally {
        // Restore original GC
        if (originalGc) {
          global.gc = originalGc;
        }
      }
    });
  }

  async function createLargeAudioFile(
    duration: number,
    fileName: string,
    audioType: 'sine' | 'beats' | 'noise' = 'sine'
  ): Promise<string> {
    let samples: Float32Array;
    
    switch (audioType) {
      case 'beats':
        samples = AudioTestFileGenerator.generateBeatsPattern(120, {
          sampleRate: 44100,
          channels: 1,
          duration,
          bitDepth: 16,
          format: 'wav'
        });
        break;
      case 'noise':
        samples = AudioTestFileGenerator.generateWhiteNoise({
          sampleRate: 44100,
          channels: 1,
          duration,
          bitDepth: 16,
          format: 'wav'
        });
        break;
      default:
        samples = AudioTestFileGenerator.generateSineWave(440, {
          sampleRate: 44100,
          channels: 1,
          duration,
          bitDepth: 16,
          format: 'wav'
        });
    }

    const wavBuffer = AudioTestFileGenerator.createWavBuffer(samples, {
      sampleRate: 44100,
      channels: 1,
      duration,
      bitDepth: 16,
      format: 'wav'
    });

    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, wavBuffer);
    
    return filePath;
  }

  describe('Memory Efficiency Tests', () => {
    test('should handle small files with minimal memory usage', async () => {
      const filePath = await createLargeAudioFile(1, 'small_1s.wav');
      const fileStats = await fs.stat(filePath);

      const { result, profile } = await profileMemory(async () => {
        return await beatParser.parseFile(filePath);
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();

      const heapIncrease = profile.final.heapUsed - profile.initial.heapUsed;
      const peakHeapUsage = profile.maxHeapUsed - profile.initial.heapUsed;
      
      console.log(`Small file memory profile:`);
      console.log(`File size: ${(fileStats.size / 1024).toFixed(2)}KB`);
      console.log(`Heap increase: ${(heapIncrease / 1024).toFixed(2)}KB`);
      console.log(`Peak heap usage: ${(peakHeapUsage / 1024).toFixed(2)}KB`);
      console.log(`Memory efficiency: ${(peakHeapUsage / fileStats.size).toFixed(2)}x file size`);

      // Small files should have reasonable memory usage
      expect(peakHeapUsage).toBeLessThan(fileStats.size * 20); // Less than 20x file size
      expect(Math.abs(heapIncrease)).toBeLessThan(5 * 1024 * 1024); // Less than 5MB net increase
    }, 30000);

    test('should handle medium files efficiently', async () => {
      const filePath = await createLargeAudioFile(10, 'medium_10s.wav', 'beats');
      const fileStats = await fs.stat(filePath);

      const { result, profile } = await profileMemory(async () => {
        return await beatParser.parseFile(filePath);
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();

      const heapIncrease = profile.final.heapUsed - profile.initial.heapUsed;
      const peakHeapUsage = profile.maxHeapUsed - profile.initial.heapUsed;
      
      console.log(`Medium file memory profile:`);
      console.log(`File size: ${(fileStats.size / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Heap increase: ${(heapIncrease / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Peak heap usage: ${(peakHeapUsage / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Memory efficiency: ${(peakHeapUsage / fileStats.size).toFixed(2)}x file size`);

      // Medium files should still be efficient
      expect(peakHeapUsage).toBeLessThan(fileStats.size * 15); // Less than 15x file size
      expect(Math.abs(heapIncrease)).toBeLessThan(20 * 1024 * 1024); // Less than 20MB net increase
    }, 60000);

    test('should handle large files without excessive memory usage', async () => {
      const filePath = await createLargeAudioFile(30, 'large_30s.wav', 'beats');
      const fileStats = await fs.stat(filePath);

      const { result, profile } = await profileMemory(async () => {
        return await beatParser.parseFile(filePath);
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();

      const heapIncrease = profile.final.heapUsed - profile.initial.heapUsed;
      const peakHeapUsage = profile.maxHeapUsed - profile.initial.heapUsed;
      
      console.log(`Large file memory profile:`);
      console.log(`File size: ${(fileStats.size / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Heap increase: ${(heapIncrease / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Peak heap usage: ${(peakHeapUsage / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Memory efficiency: ${(peakHeapUsage / fileStats.size).toFixed(2)}x file size`);

      // Large files should have controlled memory usage
      expect(peakHeapUsage).toBeLessThan(fileStats.size * 10); // Less than 10x file size
      expect(peakHeapUsage).toBeLessThan(200 * 1024 * 1024); // Less than 200MB peak
      expect(Math.abs(heapIncrease)).toBeLessThan(50 * 1024 * 1024); // Less than 50MB net increase
    }, 120000);

    test('should clean up memory properly after processing', async () => {
      const filePath = await createLargeAudioFile(5, 'cleanup_test.wav');
      
      // Process file multiple times and check memory cleanup
      const initialMemory = process.memoryUsage();
      
      for (let i = 0; i < 3; i++) {
        const parser = new BeatParser();
        
        const result = await parser.parseFile(filePath);
        expect(result).toBeDefined();
        
        await parser.cleanup();
        
        // Force garbage collection
        if (global.gc) global.gc();
      }
      
      // Allow some time for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      if (global.gc) global.gc();
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory cleanup test: ${(memoryIncrease / (1024 * 1024)).toFixed(2)}MB increase after 3 iterations`);
      
      // Memory increase should be minimal
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024); // Less than 20MB increase
    }, 60000);
  });

  describe('Large Buffer Processing', () => {
    test('should handle very large Float32Array buffers', async () => {
      // Create a large buffer (60 seconds at 44.1kHz = ~2.6M samples)
      const largeDuration = 60;
      const sampleCount = 44100 * largeDuration;
      
      console.log(`Creating large buffer: ${sampleCount.toLocaleString()} samples (${(sampleCount * 4 / (1024 * 1024)).toFixed(2)}MB)`);
      
      const { result: largeBuffer, profile: creationProfile } = await profileMemory(async () => {
        return AudioTestFileGenerator.generateBeatsPattern(120, {
          sampleRate: 44100,
          channels: 1,
          duration: largeDuration,
          bitDepth: 16,
          format: 'wav'
        });
      });

      console.log(`Buffer creation memory: ${(creationProfile.maxHeapUsed / (1024 * 1024)).toFixed(2)}MB peak`);

      const { result: parseResult, profile: parseProfile } = await profileMemory(async () => {
        return await beatParser.parseBuffer(largeBuffer);
      });

      expect(parseResult).toBeDefined();
      expect(parseResult.beats).toBeDefined();

      const totalPeakMemory = Math.max(creationProfile.maxHeapUsed, parseProfile.maxHeapUsed);
      console.log(`Large buffer processing:`);
      console.log(`Buffer size: ${(largeBuffer.length * 4 / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Peak memory: ${(totalPeakMemory / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Beats detected: ${parseResult.beats.length}`);

      // Should process successfully without excessive memory
      expect(totalPeakMemory).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
    }, 180000);

    test('should handle multiple large buffers sequentially', async () => {
      const bufferDuration = 20; // 20 seconds each
      const bufferCount = 3;
      
      const initialMemory = process.memoryUsage();
      const results: any[] = [];
      
      for (let i = 0; i < bufferCount; i++) {
        console.log(`Processing buffer ${i + 1}/${bufferCount}`);
        
        const { result, profile } = await profileMemory(async () => {
          const buffer = AudioTestFileGenerator.generateSineWave(440 + i * 100, {
            sampleRate: 44100,
            channels: 1,
            duration: bufferDuration,
            bitDepth: 16,
            format: 'wav'
          });
          
          return await beatParser.parseBuffer(buffer);
        });
        
        expect(result).toBeDefined();
        results.push(result);
        
        console.log(`Buffer ${i + 1} peak memory: ${(profile.maxHeapUsed / (1024 * 1024)).toFixed(2)}MB`);
        
        // Force cleanup between iterations
        if (global.gc) global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Sequential processing total memory increase: ${(totalMemoryIncrease / (1024 * 1024)).toFixed(2)}MB`);
      
      // Memory increase should be controlled
      expect(totalMemoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB total
      
      // All results should be valid
      expect(results.length).toBe(bufferCount);
      results.forEach(result => {
        expect(result.beats).toBeDefined();
      });
    }, 240000);
  });

  describe('Streaming Audio Processing', () => {
    async function* createAudioStream(
      duration: number,
      chunkDurationSeconds: number = 1
    ): AsyncIterableIterator<Float32Array> {
      const sampleRate = 44100;
      const chunkSize = Math.floor(sampleRate * chunkDurationSeconds);
      const totalChunks = Math.ceil(duration / chunkDurationSeconds);
      
      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = i * chunkDurationSeconds;
        const actualChunkDuration = Math.min(chunkDurationSeconds, duration - chunkStart);
        const actualChunkSize = Math.floor(sampleRate * actualChunkDuration);
        
        // Generate chunk with beat pattern
        const chunk = new Float32Array(actualChunkSize);
        for (let j = 0; j < actualChunkSize; j++) {
          const time = (chunkStart + j / sampleRate);
          
          // Beat every 0.5 seconds
          const beatInterval = 0.5;
          const beatPhase = (time % beatInterval) / beatInterval;
          
          if (beatPhase < 0.1) {
            // Beat pulse
            chunk[j] = Math.sin(2 * Math.PI * 60 * time) * 0.8;
          } else {
            // Background tone
            chunk[j] = Math.sin(2 * Math.PI * 440 * time) * 0.1;
          }
        }
        
        yield chunk;
        
        // Small delay to simulate real-time streaming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    test('should handle audio streaming with reasonable memory usage', async () => {
      const streamDuration = 10; // 10 seconds
      const chunkDuration = 1; // 1-second chunks
      
      const audioStream = createAudioStream(streamDuration, chunkDuration);
      
      const streamingOptions: StreamingOptions = {
        chunkSize: 44100, // 1 second at 44.1kHz
        overlap: 0.1, // 10% overlap
        progressCallback: (samples) => {
          const seconds = samples / 44100;
          console.log(`Streaming progress: ${seconds.toFixed(1)}s`);
        }
      };

      const { result, profile } = await profileMemory(async () => {
        return await beatParser.parseStream(audioStream, streamingOptions);
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);

      const peakMemoryMB = profile.maxHeapUsed / (1024 * 1024);
      console.log(`Streaming processing:`);
      console.log(`Duration: ${streamDuration}s`);
      console.log(`Peak memory: ${peakMemoryMB.toFixed(2)}MB`);
      console.log(`Beats detected: ${result.beats.length}`);
      console.log(`Final heap increase: ${((profile.final.heapUsed - profile.initial.heapUsed) / (1024 * 1024)).toFixed(2)}MB`);

      // Streaming should use less memory than loading entire file
      const estimatedFileSize = streamDuration * 44100 * 2; // 16-bit samples
      const memoryEfficiency = profile.maxHeapUsed / estimatedFileSize;
      
      expect(peakMemoryMB).toBeLessThan(100); // Less than 100MB for 10-second stream
      expect(memoryEfficiency).toBeLessThan(5); // Less than 5x estimated file size
    }, 60000);

    test('should handle ReadableStream interface', async () => {
      // Create ReadableStream from async iterator
      const streamDuration = 5;
      const audioIterator = createAudioStream(streamDuration, 0.5);
      
      // Convert to ReadableStream
      const readableStream = new ReadableStream<Float32Array>({
        async start(controller) {
          try {
            for await (const chunk of audioIterator) {
              controller.enqueue(chunk);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        }
      });

      const result = await beatParser.parseStream(readableStream, {
        chunkSize: 22050, // 0.5 seconds
        overlap: 0.2
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.processingInfo?.chunksProcessed).toBeGreaterThan(0);
      
      console.log(`ReadableStream processing: ${result.beats.length} beats, ${result.metadata.processingInfo?.chunksProcessed} chunks`);
    }, 45000);

    test('should handle streaming with different chunk sizes efficiently', async () => {
      const chunkSizes = [0.25, 0.5, 1, 2]; // seconds
      const streamDuration = 8; // seconds
      
      const results: Array<{ chunkSize: number; result: any; profile: MemoryProfile }> = [];
      
      for (const chunkSize of chunkSizes) {
        console.log(`Testing chunk size: ${chunkSize}s`);
        
        const audioStream = createAudioStream(streamDuration, chunkSize);
        
        const { result, profile } = await profileMemory(async () => {
          return await beatParser.parseStream(audioStream, {
            chunkSize: Math.floor(44100 * chunkSize),
            overlap: 0.1
          });
        });

        expect(result).toBeDefined();
        results.push({ chunkSize, result, profile });
        
        const peakMemoryMB = profile.maxHeapUsed / (1024 * 1024);
        console.log(`Chunk size ${chunkSize}s: ${peakMemoryMB.toFixed(2)}MB peak, ${result.beats.length} beats`);
      }
      
      // Smaller chunks should generally use less peak memory
      results.forEach(({ chunkSize, result, profile }) => {
        const peakMemoryMB = profile.maxHeapUsed / (1024 * 1024);
        
        // All chunk sizes should process successfully
        expect(result.beats).toBeDefined();
        
        // Memory usage should be reasonable for all chunk sizes
        expect(peakMemoryMB).toBeLessThan(80); // Less than 80MB for any chunk size
      });
    }, 120000);

    test('should handle streaming progress callbacks', async () => {
      const streamDuration = 6;
      const audioStream = createAudioStream(streamDuration, 1);
      
      const progressEvents: number[] = [];
      let lastProgress = 0;
      
      const result = await beatParser.parseStream(audioStream, {
        chunkSize: 44100, // 1 second
        progressCallback: (samples) => {
          const seconds = samples / 44100;
          progressEvents.push(seconds);
          
          // Progress should be monotonically increasing
          expect(seconds).toBeGreaterThan(lastProgress);
          lastProgress = seconds;
        }
      });

      expect(result).toBeDefined();
      expect(progressEvents.length).toBeGreaterThan(0);
      
      // Should have received multiple progress updates
      expect(progressEvents.length).toBeGreaterThanOrEqual(streamDuration - 1);
      
      // Final progress should be close to total duration
      const finalProgress = progressEvents[progressEvents.length - 1]!;
      expect(finalProgress).toBeGreaterThan(streamDuration * 0.8); // At least 80% of duration
      
      console.log(`Progress events: ${progressEvents.length}, final: ${finalProgress.toFixed(2)}s`);
    }, 45000);
  });

  describe('Memory Leak Detection', () => {
    test('should not leak memory with repeated file parsing', async () => {
      const filePath = await createLargeAudioFile(3, 'leak_test.wav', 'beats');
      
      // Get baseline memory
      if (global.gc) global.gc();
      const baselineMemory = process.memoryUsage();
      
      const memorySnapshots: NodeJS.MemoryUsage[] = [baselineMemory];
      const iterations = 10;
      
      // Parse the same file multiple times
      for (let i = 0; i < iterations; i++) {
        const parser = new BeatParser();
        
        const result = await parser.parseFile(filePath);
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        
        await parser.cleanup();
        
        // Force garbage collection and record memory
        if (global.gc) global.gc();
        await new Promise(resolve => setTimeout(resolve, 50)); // Allow GC to complete
        
        const currentMemory = process.memoryUsage();
        memorySnapshots.push(currentMemory);
      }
      
      // Analyze memory trend
      const heapUsages = memorySnapshots.map(snapshot => snapshot.heapUsed);
      const initialHeap = heapUsages[0]!;
      const finalHeap = heapUsages[heapUsages.length - 1]!;
      const maxHeap = Math.max(...heapUsages);
      
      const totalIncrease = finalHeap - initialHeap;
      const peakIncrease = maxHeap - initialHeap;
      
      console.log(`Memory leak test (${iterations} iterations):`);
      console.log(`Initial heap: ${(initialHeap / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Final heap: ${(finalHeap / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Total increase: ${(totalIncrease / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Peak increase: ${(peakIncrease / (1024 * 1024)).toFixed(2)}MB`);
      
      // Memory increase should be minimal
      expect(totalIncrease).toBeLessThan(20 * 1024 * 1024); // Less than 20MB total increase
      expect(peakIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB peak increase
      
      // Check for consistent growth (leak indicator)
      const growth = heapUsages.slice(1).map((heap, i) => heap - heapUsages[i]!);
      const averageGrowth = growth.reduce((sum, g) => sum + g, 0) / growth.length;
      
      console.log(`Average per-iteration growth: ${(averageGrowth / 1024).toFixed(2)}KB`);
      
      // Average growth per iteration should be minimal
      expect(averageGrowth).toBeLessThan(2 * 1024 * 1024); // Less than 2MB per iteration
    }, 180000);

    test('should not leak memory with repeated buffer parsing', async () => {
      // Create test buffer once
      const testBuffer = AudioTestFileGenerator.generateBeatsPattern(120, {
        sampleRate: 44100,
        channels: 1,
        duration: 2,
        bitDepth: 16,
        format: 'wav'
      });
      
      // Get baseline memory
      if (global.gc) global.gc();
      const baselineMemory = process.memoryUsage();
      
      const iterations = 15;
      const memorySnapshots: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const result = await beatParser.parseBuffer(testBuffer);
        expect(result).toBeDefined();
        
        // Record memory usage
        const currentMemory = process.memoryUsage();
        memorySnapshots.push(currentMemory.heapUsed);
        
        // Periodic cleanup
        if (i % 5 === 4 && global.gc) {
          global.gc();
        }
      }
      
      // Final cleanup and measurement
      if (global.gc) global.gc();
      const finalMemory = process.memoryUsage();
      
      const totalIncrease = finalMemory.heapUsed - baselineMemory.heapUsed;
      const maxHeapUsed = Math.max(...memorySnapshots);
      const peakIncrease = maxHeapUsed - baselineMemory.heapUsed;
      
      console.log(`Buffer parsing memory test (${iterations} iterations):`);
      console.log(`Total increase: ${(totalIncrease / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Peak increase: ${(peakIncrease / (1024 * 1024)).toFixed(2)}MB`);
      
      // Memory usage should be stable
      expect(totalIncrease).toBeLessThan(15 * 1024 * 1024); // Less than 15MB total
      expect(peakIncrease).toBeLessThan(30 * 1024 * 1024); // Less than 30MB peak
    }, 120000);
  });

  describe('Edge Case Memory Scenarios', () => {
    test('should handle rapid successive small file processing', async () => {
      // Create multiple small files
      const smallFiles: string[] = [];
      for (let i = 0; i < 5; i++) {
        const filePath = await createLargeAudioFile(0.5, `rapid_${i}.wav`);
        smallFiles.push(filePath);
      }
      
      const { results, profile } = await profileMemory(async () => {
        const results = [];
        
        // Process all files rapidly without cleanup between
        for (const file of smallFiles) {
          const result = await beatParser.parseFile(file);
          results.push(result);
        }
        
        return results;
      });
      
      expect(results.length).toBe(smallFiles.length);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      });
      
      const peakMemoryMB = profile.maxHeapUsed / (1024 * 1024);
      console.log(`Rapid processing peak memory: ${peakMemoryMB.toFixed(2)}MB for ${smallFiles.length} files`);
      
      // Should handle multiple small files efficiently
      expect(peakMemoryMB).toBeLessThan(50); // Less than 50MB for 5 small files
    }, 60000);

    test('should handle interleaved file and buffer processing', async () => {
      const filePath = await createLargeAudioFile(2, 'interleaved_test.wav');
      
      const testBuffer = AudioTestFileGenerator.generateSineWave(880, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });
      
      const { results, profile } = await profileMemory(async () => {
        const results = [];
        
        // Alternate between file and buffer processing
        for (let i = 0; i < 6; i++) {
          if (i % 2 === 0) {
            const result = await beatParser.parseFile(filePath);
            results.push({ type: 'file', result });
          } else {
            const result = await beatParser.parseBuffer(testBuffer);
            results.push({ type: 'buffer', result });
          }
        }
        
        return results;
      });
      
      expect(results.length).toBe(6);
      results.forEach(({ result }) => {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      });
      
      const peakMemoryMB = profile.maxHeapUsed / (1024 * 1024);
      console.log(`Interleaved processing peak memory: ${peakMemoryMB.toFixed(2)}MB`);
      
      // Should handle mixed processing types efficiently
      expect(peakMemoryMB).toBeLessThan(80); // Less than 80MB peak
    }, 60000);
  });
});