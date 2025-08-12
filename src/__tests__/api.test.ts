import { BeatParser } from '../core/BeatParser';
import { HybridDetector } from '../algorithms/HybridDetector';
import fs from 'fs/promises';
import path from 'path';

describe('API and Public Interface Tests', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser();
  });
  
  afterEach(async () => {
    await parser.cleanup();
  });

  describe('Public API Interface', () => {
    test('should expose correct static methods', () => {
      expect(typeof BeatParser.getVersion).toBe('function');
      expect(typeof BeatParser.getSupportedFormats).toBe('function');
      
      const version = BeatParser.getVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      
      const formats = BeatParser.getSupportedFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
    });

    test('should expose correct instance methods', () => {
      expect(typeof parser.parseFile).toBe('function');
      expect(typeof parser.parseBuffer).toBe('function');
      expect(typeof parser.parseStream).toBe('function');
      expect(typeof parser.addPlugin).toBe('function');
      expect(typeof parser.removePlugin).toBe('function');
      expect(typeof parser.getPlugins).toBe('function');
      expect(typeof parser.updateConfig).toBe('function');
      expect(typeof parser.getConfig).toBe('function');
      expect(typeof parser.cleanup).toBe('function');
    });

    test('should have intuitive default configuration', () => {
      const config = parser.getConfig();
      
      // Audio processing defaults
      expect(config.sampleRate).toBe(44100);
      expect(config.frameSize).toBe(2048);
      expect(config.hopSize).toBe(512);
      
      // Tempo detection defaults
      expect(config.minTempo).toBe(60);
      expect(config.maxTempo).toBe(200);
      
      // Algorithm weights
      expect(config.onsetWeight).toBe(0.4);
      expect(config.tempoWeight).toBe(0.4);
      expect(config.spectralWeight).toBe(0.2);
      
      // Advanced features enabled by default
      expect(config.multiPassEnabled).toBe(true);
      expect(config.genreAdaptive).toBe(true);
      expect(config.enablePreprocessing).toBe(true);
      
      // Output defaults
      expect(config.outputFormat).toBe('json');
      expect(config.includeMetadata).toBe(true);
      expect(config.includeConfidenceScores).toBe(true);
    });
  });

  describe('Simple Usage Patterns', () => {
    const createSimpleTestAudio = (): Float32Array => {
      const duration = 2; // 2 seconds
      const sampleRate = 44100;
      const audio = new Float32Array(duration * sampleRate);
      
      // Create simple beat pattern
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        
        // Beat every 0.5 seconds (120 BPM)
        if (t % 0.5 < 0.05) {
          audio[i] = 0.8 * Math.sin(2 * Math.PI * 60 * (t % 0.5));
        } else {
          audio[i] = 0.05 * (Math.random() - 0.5);
        }
      }
      
      return audio;
    };

    test('should work with minimal configuration', async () => {
      const audio = createSimpleTestAudio();
      
      // Most basic usage
      const result = await parser.parseBuffer(audio);
      
      expect(result).toHaveProperty('beats');
      expect(result).toHaveProperty('metadata');
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.beats.length).toBeGreaterThan(0);
    });

    test('should work with target picture count', async () => {
      const audio = createSimpleTestAudio();
      
      const result = await parser.parseBuffer(audio, {
        targetPictureCount: 3
      });
      
      expect(result.beats.length).toBeLessThanOrEqual(3);
      expect(result.beats.length).toBeGreaterThan(0);
    });

    test('should work with custom configuration', async () => {
      const customParser = new BeatParser({
        minTempo: 100,
        maxTempo: 140,
        confidenceThreshold: 0.7,
        genreAdaptive: false
      });
      
      const audio = createSimpleTestAudio();
      const result = await customParser.parseBuffer(audio);
      
      expect(result.beats).toBeDefined();
      
      await customParser.cleanup();
    });
  });

  describe('Advanced Usage Patterns', () => {
    test('should support method chaining for configuration', () => {
      const customParser = new BeatParser();
      
      // Configuration should be chainable conceptually
      customParser.updateConfig({ minTempo: 80 });
      customParser.updateConfig({ maxTempo: 160 });
      
      const config = customParser.getConfig();
      expect(config.minTempo).toBe(80);
      expect(config.maxTempo).toBe(160);
    });

    test('should support plugin-based extensibility', async () => {
      const testPlugin = {
        name: 'test-enhancer',
        version: '1.0.0',
        processBeats: (beats: any[]) => {
          // Enhance beat confidence
          return beats.map(beat => ({
            ...beat,
            confidence: Math.min(beat.confidence * 1.1, 1)
          }));
        }
      };
      
      parser.addPlugin(testPlugin);
      
      const plugins = parser.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('test-enhancer');
      
      const audio = new Float32Array(4096).fill(0.1);
      audio[1000] = 0.8; // Add a beat
      
      const result = await parser.parseBuffer(audio);
      expect(result.beats).toBeDefined();
    });
  });

  describe('Output Format Validation', () => {
    const createBeatTestAudio = (): Float32Array => {
      const audio = new Float32Array(44100); // 1 second
      
      // Add clear beats
      audio[0] = 0.9;     // Beat at 0.0s
      audio[22050] = 0.9; // Beat at 0.5s
      
      // Add some background
      for (let i = 1; i < audio.length; i++) {
        if (i !== 22050) {
          audio[i] = 0.05 * Math.random();
        }
      }
      
      return audio;
    };

    test('should produce valid JSON format', async () => {
      const parser = new BeatParser({ outputFormat: 'json' });
      const audio = createBeatTestAudio();
      
      const result = await parser.parseBuffer(audio);
      
      // Should be JSON serializable
      expect(() => JSON.stringify(result)).not.toThrow();
      
      // Should have required structure
      expect(result).toHaveProperty('beats');
      expect(result).toHaveProperty('metadata');
      
      // Beats should have required fields
      result.beats.forEach(beat => {
        expect(beat).toHaveProperty('timestamp');
        expect(beat).toHaveProperty('confidence');
        expect(typeof beat.timestamp).toBe('number');
        expect(typeof beat.confidence).toBe('number');
      });
      
      await parser.cleanup();
    });

    test('should include metadata when requested', async () => {
      const parser = new BeatParser({ 
        includeMetadata: true,
        includeConfidenceScores: true
      });
      
      const audio = createBeatTestAudio();
      const result = await parser.parseBuffer(audio, {
        filename: 'test-audio.wav'
      });
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('processingInfo');
      expect(result.metadata.processingInfo).toHaveProperty('audioLength');
      expect(result.metadata.processingInfo).toHaveProperty('sampleRate');
      expect(result.metadata.processingInfo).toHaveProperty('algorithmsUsed');
      
      // Should include filename if provided
      if (result.metadata.filename) {
        expect(result.metadata.filename).toBe('test-audio.wav');
      }
      
      await parser.cleanup();
    });

    test('should exclude metadata when not requested', async () => {
      const parser = new BeatParser({ 
        includeMetadata: false,
        includeConfidenceScores: false
      });
      
      const audio = createBeatTestAudio();
      const result = await parser.parseBuffer(audio);
      
      // Should still have basic structure but minimal metadata
      expect(result).toHaveProperty('beats');
      
      await parser.cleanup();
    });
  });

  describe('Error Handling and Validation', () => {
    test('should validate input parameters', async () => {
      // Invalid target picture count
      const audio = new Float32Array(4096).fill(0.1);
      
      await expect(parser.parseBuffer(audio, { 
        targetPictureCount: -1 
      })).rejects.toThrow();
      
      await expect(parser.parseBuffer(audio, { 
        targetPictureCount: 0 
      })).rejects.toThrow();
    });

    test('should provide helpful error messages', async () => {
      try {
        await parser.parseBuffer(new Float32Array(0));
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid or empty audio data');
      }
      
      try {
        await parser.parseFile('/non/existent/file.wav');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Audio file not found');
      }
    });

    test('should handle configuration errors gracefully', () => {
      expect(() => {
        new BeatParser({ 
          minTempo: 200, 
          maxTempo: 100  // Invalid: min > max
        });
      }).not.toThrow(); // Constructor shouldn't validate, but parsing should handle gracefully
    });
  });

  describe('Performance Characteristics', () => {
    test('should process audio efficiently', async () => {
      const largeAudio = new Float32Array(44100 * 5); // 5 seconds
      
      // Fill with realistic content
      for (let i = 0; i < largeAudio.length; i++) {
        largeAudio[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / 44100) + 
                        0.05 * (Math.random() - 0.5);
        
        // Add beats every second
        if (i % 44100 === 0) {
          largeAudio[i] = 0.8;
        }
      }
      
      const startTime = performance.now();
      const result = await parser.parseBuffer(largeAudio, {
        targetPictureCount: 10
      });
      const endTime = performance.now();
      
      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeLessThanOrEqual(10);
      
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should handle memory efficiently', async () => {
      const initialMemory = process.memoryUsage();
      
      // Process multiple audio files
      const audio = new Float32Array(44100).fill(0.1); // 1 second
      
      for (let i = 0; i < 10; i++) {
        const result = await parser.parseBuffer(audio);
        expect(result.beats).toBeDefined();
      }
      
      await parser.cleanup();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Integration with Components', () => {
    test('should integrate with HybridDetector correctly', () => {
      // Verify that parser uses HybridDetector internally
      const config = parser.getConfig();
      
      // HybridDetector configuration should be reflected
      expect(config.onsetWeight).toBeDefined();
      expect(config.tempoWeight).toBeDefined();
      expect(config.spectralWeight).toBeDefined();
      expect(config.multiPassEnabled).toBeDefined();
      expect(config.genreAdaptive).toBeDefined();
    });

    test('should respect algorithm weights configuration', async () => {
      const onsetOnlyParser = new BeatParser({
        onsetWeight: 1.0,
        tempoWeight: 0.0,
        spectralWeight: 0.0
      });
      
      const tempoOnlyParser = new BeatParser({
        onsetWeight: 0.0,
        tempoWeight: 1.0,
        spectralWeight: 0.0
      });
      
      const audio = new Float32Array(44100 * 2).fill(0.05);
      // Add strong onset at 1 second
      audio[44100] = 0.9;
      
      const onsetResult = await onsetOnlyParser.parseBuffer(audio);
      const tempoResult = await tempoOnlyParser.parseBuffer(audio);
      
      expect(onsetResult.beats).toBeDefined();
      expect(tempoResult.beats).toBeDefined();
      
      await onsetOnlyParser.cleanup();
      await tempoOnlyParser.cleanup();
    });
  });

  describe('Backwards Compatibility and Stability', () => {
    test('should maintain stable API', () => {
      // Critical methods should exist and have correct signatures
      expect(parser.parseBuffer).toBeDefined();
      expect(parser.parseBuffer.length).toBeGreaterThanOrEqual(1); // At least one parameter
      
      expect(parser.parseFile).toBeDefined();
      expect(parser.parseFile.length).toBeGreaterThanOrEqual(1);
      
      expect(parser.parseStream).toBeDefined();
      expect(parser.parseStream.length).toBeGreaterThanOrEqual(1);
    });

    test('should handle optional parameters correctly', async () => {
      const audio = new Float32Array(4096).fill(0.1);
      
      // Should work without options
      const result1 = await parser.parseBuffer(audio);
      expect(result1).toBeDefined();
      
      // Should work with empty options
      const result2 = await parser.parseBuffer(audio, {});
      expect(result2).toBeDefined();
      
      // Should work with partial options
      const result3 = await parser.parseBuffer(audio, {
        targetPictureCount: 5
      });
      expect(result3).toBeDefined();
    });
  });
});