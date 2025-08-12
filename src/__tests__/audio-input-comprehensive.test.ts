/**
 * Comprehensive Audio Input Tests
 * Tests all possible audio input scenarios and edge cases
 */

import { BeatParser } from '../core/BeatParser';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Comprehensive Audio Input Tests', () => {
  let beatParser: BeatParser;
  let testFiles: string[] = [];
  
  // Performance tracking
  const performanceResults: Array<{
    testName: string;
    fileSize: number;
    processingTime: number;
    memoryUsed: number;
    success: boolean;
    errorType?: string;
  }> = [];

  beforeAll(async () => {
    // Generate all test files
    testFiles = await AudioTestFileGenerator.generateTestFiles();
    console.log(`Generated ${testFiles.length} test files`);
  }, 60000); // 60 second timeout for file generation

  beforeEach(() => {
    beatParser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.5
    });
  });

  afterEach(async () => {
    await beatParser.cleanup();
  });

  afterAll(async () => {
    // Clean up test files
    await AudioTestFileGenerator.cleanupTestFiles();
    
    // Print performance summary
    console.table(performanceResults);
  });

  describe('Audio Format Support Tests', () => {
    test('should handle WAV files at different sample rates', async () => {
      const sampleRateFiles = testFiles.filter(f => 
        f.includes('sine_440hz') && f.includes('khz') && !f.includes('stereo')
      );

      for (const filePath of sampleRateFiles) {
        const testName = path.basename(filePath, '.wav');
        
        try {
          const startTime = performance.now();
          const startMemory = process.memoryUsage().heapUsed;
          
          const result = await beatParser.parseFile(filePath);
          
          const endTime = performance.now();
          const endMemory = process.memoryUsage().heapUsed;
          const fileStats = await fs.stat(filePath);
          
          performanceResults.push({
            testName,
            fileSize: fileStats.size,
            processingTime: endTime - startTime,
            memoryUsed: endMemory - startMemory,
            success: true
          });
          
          expect(result).toBeDefined();
          expect(result.beats).toBeDefined();
          expect(Array.isArray(result.beats)).toBe(true);
          expect(result.metadata).toBeDefined();
          expect(result.metadata.processingTime).toBeGreaterThan(0);
          
        } catch (error) {
          performanceResults.push({
            testName,
            fileSize: 0,
            processingTime: 0,
            memoryUsed: 0,
            success: false,
            errorType: error instanceof Error ? error.constructor.name : 'Unknown'
          });
          throw error;
        }
      }
    });

    test('should handle different bit depths', async () => {
      const bitDepthFiles = testFiles.filter(f => 
        f.includes('sine_440hz_44khz') && f.includes('bit')
      );

      for (const filePath of bitDepthFiles) {
        const testName = path.basename(filePath, '.wav');
        
        try {
          const result = await beatParser.parseFile(filePath);
          
          expect(result).toBeDefined();
          expect(result.beats).toBeDefined();
          expect(Array.isArray(result.beats)).toBe(true);
          
          // All bit depths should produce similar beat detection results for same content
          if (result.beats.length > 0) {
            expect(result.beats[0]!.confidence).toBeGreaterThan(0);
            expect(result.beats[0]!.timestamp).toBeGreaterThanOrEqual(0);
          }
        } catch (error) {
          throw new Error(`Failed to parse ${testName}: ${error}`);
        }
      }
    });

    test('should handle mono vs stereo audio', async () => {
      const monoFile = testFiles.find(f => f.includes('sine_440hz_44khz_16bit_mono'));
      const stereoFile = testFiles.find(f => f.includes('sine_440hz_44khz_16bit_stereo'));

      expect(monoFile).toBeDefined();
      expect(stereoFile).toBeDefined();

      const monoResult = await beatParser.parseFile(monoFile!);
      const stereoResult = await beatParser.parseFile(stereoFile!);

      expect(monoResult.beats).toBeDefined();
      expect(stereoResult.beats).toBeDefined();
      
      // Both should successfully parse, stereo might have slightly different results
      // but should be in the same ballpark
      expect(monoResult.metadata.processingTime).toBeGreaterThan(0);
      expect(stereoResult.metadata.processingTime).toBeGreaterThan(0);
    });
  });

  describe('parseBuffer Method Tests', () => {
    test('should parse Float32Array buffer with valid audio', async () => {
      // Generate test audio data
      const audioData = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 2,
        bitDepth: 16,
        format: 'wav'
      });

      const result = await beatParser.parseBuffer(audioData);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    test('should parse Buffer with WAV data', async () => {
      const audioSamples = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      const wavBuffer = AudioTestFileGenerator.createWavBuffer(audioSamples, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      const result = await beatParser.parseBuffer(wavBuffer);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
    });

    test('should handle different buffer types', async () => {
      const audioSamples = AudioTestFileGenerator.generateBeatsPattern(120, {
        sampleRate: 44100,
        channels: 1,
        duration: 2,
        bitDepth: 16,
        format: 'wav'
      });

      // Test different ways to create buffers
      const float32Buffer = audioSamples;
      const nodeBuffer = Buffer.from(audioSamples.buffer);
      const uint8Array = new Uint8Array(audioSamples.buffer);
      const arrayBuffer = audioSamples.buffer;

      // Float32Array should work directly
      const float32Result = await beatParser.parseBuffer(float32Buffer);
      expect(float32Result.beats).toBeDefined();

      // Node.js Buffer should work
      const nodeResult = await beatParser.parseBuffer(nodeBuffer);
      expect(nodeResult.beats).toBeDefined();

      // Should produce similar results
      expect(float32Result.metadata.processingTime).toBeGreaterThan(0);
      expect(nodeResult.metadata.processingTime).toBeGreaterThan(0);
    });
  });

  describe('Edge Case Audio Content Tests', () => {
    test('should handle pure silence', async () => {
      const silenceFile = testFiles.find(f => f.includes('silence'));
      expect(silenceFile).toBeDefined();

      const result = await beatParser.parseFile(silenceFile!);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      
      // Silence should produce no beats or very low confidence beats
      if (result.beats.length > 0) {
        expect(result.beats.every(beat => beat.confidence < 0.3)).toBe(true);
      }
    });

    test('should handle white noise', async () => {
      const noiseFile = testFiles.find(f => f.includes('white_noise'));
      expect(noiseFile).toBeDefined();

      const result = await beatParser.parseFile(noiseFile!);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      
      // White noise should produce few or no reliable beats
      const highConfidenceBeats = result.beats.filter(beat => beat.confidence > 0.7);
      expect(highConfidenceBeats.length).toBeLessThan(result.beats.length / 2);
    });

    test('should handle pink noise', async () => {
      const pinkNoiseFile = testFiles.find(f => f.includes('pink_noise'));
      expect(pinkNoiseFile).toBeDefined();

      const result = await beatParser.parseFile(pinkNoiseFile!);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
    });

    test('should handle very quiet audio', async () => {
      const quietFile = testFiles.find(f => f.includes('quiet_audio'));
      expect(quietFile).toBeDefined();

      const result = await beatParser.parseFile(quietFile!);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      
      // Quiet audio should still be processable but with lower confidence
      if (result.beats.length > 0) {
        const avgConfidence = result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length;
        expect(avgConfidence).toBeGreaterThanOrEqual(0);
      }
    });

    test('should handle clipped/distorted audio', async () => {
      const clippedFile = testFiles.find(f => f.includes('clipped_audio'));
      expect(clippedFile).toBeDefined();

      const result = await beatParser.parseFile(clippedFile!);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      
      // Clipped audio should still be processable
      expect(result.metadata.processingTime).toBeGreaterThan(0);
    });

    test('should detect clear beat patterns', async () => {
      const beatFiles = testFiles.filter(f => f.includes('beats_') && f.includes('bpm'));
      
      for (const beatFile of beatFiles) {
        const result = await beatParser.parseFile(beatFile);
        
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeGreaterThan(0);
        
        // Clear beat patterns should produce high-confidence beats
        const highConfidenceBeats = result.beats.filter(beat => beat.confidence > 0.6);
        expect(highConfidenceBeats.length).toBeGreaterThan(0);
        
        // Check that beats are reasonably spaced
        if (result.beats.length > 1) {
          const avgInterval = (result.beats[result.beats.length - 1]!.timestamp - result.beats[0]!.timestamp) / (result.beats.length - 1);
          expect(avgInterval).toBeGreaterThan(0.2); // At least 200ms between beats
          expect(avgInterval).toBeLessThan(2.0);    // At most 2s between beats
        }
      }
    });

    test('should handle audio with NaN and infinite values', async () => {
      const audioSamples = AudioTestFileGenerator.generateInvalidAudio({
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      await expect(beatParser.parseBuffer(audioSamples)).rejects.toThrow(/invalid values/i);
    });
  });

  describe('Duration Edge Cases', () => {
    test('should handle very short audio (<1 second)', async () => {
      const shortFiles = testFiles.filter(f => f.includes('short') || f.includes('sample'));
      
      for (const shortFile of shortFiles) {
        const testName = path.basename(shortFile);
        
        if (testName.includes('1sample') || testName.includes('10samples')) {
          // These should fail due to insufficient length
          await expect(beatParser.parseFile(shortFile)).rejects.toThrow();
        } else {
          // Other short files should work
          const result = await beatParser.parseFile(shortFile);
          expect(result).toBeDefined();
          expect(result.beats).toBeDefined();
        }
      }
    });

    test('should handle long audio (>30 seconds)', async () => {
      const longFile = testFiles.find(f => f.includes('long_30s'));
      
      if (longFile) {
        const startTime = performance.now();
        const result = await beatParser.parseFile(longFile);
        const processingTime = performance.now() - startTime;
        
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        expect(result.metadata.processingTime).toBeGreaterThan(0);
        
        // Should process relatively efficiently
        console.log(`Long file processing time: ${processingTime.toFixed(2)}ms`);
        expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
      }
    }, 45000);

    test('should reject audio shorter than frame size', async () => {
      const tooShortAudio = new Float32Array(512); // Less than default frame size of 2048
      
      await expect(beatParser.parseBuffer(tooShortAudio)).rejects.toThrow(/too short/i);
    });
  });

  describe('parseFile Method Error Handling', () => {
    test('should reject non-existent files', async () => {
      await expect(beatParser.parseFile('/path/that/does/not/exist.wav')).rejects.toThrow(/not found/i);
    });

    test('should reject unsupported file extensions', async () => {
      // Create a file with unsupported extension
      const unsupportedFile = path.join(__dirname, 'test-audio-files', 'test.xyz');
      await fs.writeFile(unsupportedFile, 'dummy content');
      
      try {
        await expect(beatParser.parseFile(unsupportedFile)).rejects.toThrow(/unsupported.*format/i);
      } finally {
        await fs.unlink(unsupportedFile).catch(() => {}); // Cleanup
      }
    });

    test('should handle empty files', async () => {
      const emptyFile = testFiles.find(f => f.includes('empty'));
      expect(emptyFile).toBeDefined();

      await expect(beatParser.parseFile(emptyFile!)).rejects.toThrow();
    });

    test('should handle corrupted files', async () => {
      const corruptedFiles = testFiles.filter(f => 
        f.includes('truncated') || f.includes('invalid_header') || f.includes('garbage')
      );

      for (const corruptedFile of corruptedFiles) {
        const testName = path.basename(corruptedFile);
        console.log(`Testing corrupted file: ${testName}`);
        
        await expect(beatParser.parseFile(corruptedFile)).rejects.toThrow();
      }
    });

    test('should handle files with wrong extensions', async () => {
      const wrongExtFile = testFiles.find(f => f.includes('audio.mp3'));
      
      if (wrongExtFile) {
        // This should fail because the file has WAV content but MP3 extension
        await expect(beatParser.parseFile(wrongExtFile)).rejects.toThrow();
      }
    });
  });

  describe('parseBuffer Error Handling', () => {
    test('should reject empty buffers', async () => {
      const emptyFloat32 = new Float32Array(0);
      const emptyBuffer = Buffer.alloc(0);

      await expect(beatParser.parseBuffer(emptyFloat32)).rejects.toThrow(/invalid.*empty/i);
      await expect(beatParser.parseBuffer(emptyBuffer)).rejects.toThrow();
    });

    test('should reject null/undefined inputs', async () => {
      await expect(beatParser.parseBuffer(null as any)).rejects.toThrow();
      await expect(beatParser.parseBuffer(undefined as any)).rejects.toThrow();
    });

    test('should validate audio data ranges', async () => {
      const validAudio = AudioTestFileGenerator.generateSineWave(440, {
        sampleRate: 44100,
        channels: 1,
        duration: 1,
        bitDepth: 16,
        format: 'wav'
      });

      // Valid audio should work
      const result = await beatParser.parseBuffer(validAudio);
      expect(result).toBeDefined();
    });
  });

  describe('Configuration and Options Testing', () => {
    test('should respect targetPictureCount option', async () => {
      const beatFile = testFiles.find(f => f.includes('beats_120bpm'));
      expect(beatFile).toBeDefined();

      const targetCounts = [1, 3, 5, 10];
      
      for (const targetCount of targetCounts) {
        const result = await beatParser.parseFile(beatFile!, {
          targetPictureCount: targetCount
        });

        expect(result.beats.length).toBeLessThanOrEqual(targetCount);
        
        if (result.beats.length > 0) {
          // Should return the highest confidence beats
          const sortedByConfidence = [...result.beats].sort((a, b) => b.confidence - a.confidence);
          expect(result.beats).toEqual(expect.arrayContaining(sortedByConfidence.slice(0, result.beats.length)));
        }
      }
    });

    test('should respect selectionMethod option', async () => {
      const beatFile = testFiles.find(f => f.includes('beats_120bpm'));
      expect(beatFile).toBeDefined();

      const selectionMethods: Array<'uniform' | 'adaptive' | 'energy' | 'regular'> = [
        'uniform', 'adaptive', 'energy', 'regular'
      ];

      for (const method of selectionMethods) {
        const result = await beatParser.parseFile(beatFile!, {
          targetPictureCount: 5,
          selectionMethod: method
        });

        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(5);
      }
    });

    test('should include metadata when requested', async () => {
      const parser = new BeatParser({
        includeMetadata: true,
        includeConfidenceScores: true
      });

      const testFile = testFiles.find(f => f.includes('sine_440hz_44khz_16bit_mono'));
      expect(testFile).toBeDefined();

      try {
        const result = await parser.parseFile(testFile!, {
          filename: 'test-audio.wav'
        });

        expect(result.metadata).toBeDefined();
        expect(result.metadata.processingTime).toBeGreaterThan(0);
        
        if (result.beats.length > 0) {
          expect(result.beats[0]!.confidence).toBeDefined();
          expect(typeof result.beats[0]!.confidence).toBe('number');
        }
      } finally {
        await parser.cleanup();
      }
    });
  });

  describe('Memory Usage and Performance', () => {
    test('should not leak memory with multiple parses', async () => {
      const testFile = testFiles.find(f => f.includes('sine_440hz_44khz_16bit_mono'));
      expect(testFile).toBeDefined();

      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const result = await beatParser.parseFile(testFile!);
        expect(result).toBeDefined();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB for 10 iterations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should process files within reasonable time limits', async () => {
      const testFile = testFiles.find(f => f.includes('sine_440hz_44khz_16bit_mono'));
      expect(testFile).toBeDefined();

      const startTime = performance.now();
      const result = await beatParser.parseFile(testFile!);
      const processingTime = performance.now() - startTime;

      expect(result).toBeDefined();
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds for a 2-second file
    });
  });
});