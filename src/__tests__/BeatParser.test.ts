/**
 * Tests for BeatParser class
 */

import { BeatParser } from '../core/BeatParser';

function createMockAudioData(length: number): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
  }
  return data;
}

describe('BeatParser', () => {
  let beatParser: BeatParser;

  beforeEach(() => {
    beatParser = new BeatParser();
  });

  afterEach(async () => {
    await beatParser.cleanup();
  });

  describe('constructor', () => {
    test('should create instance with default config', () => {
      const parser = new BeatParser();
      const config = parser.getConfig();
      
      expect(config.sampleRate).toBe(44100);
      expect(config.frameSize).toBe(2048);
      expect(config.hopSize).toBe(512);
      expect(config.minTempo).toBe(60);
      expect(config.maxTempo).toBe(200);
    });

    test('should create instance with custom config', () => {
      const customConfig = {
        sampleRate: 48000,
        minTempo: 80,
        maxTempo: 160,
        confidenceThreshold: 0.7
      };
      
      const parser = new BeatParser(customConfig);
      const config = parser.getConfig();
      
      expect(config.sampleRate).toBe(48000);
      expect(config.minTempo).toBe(80);
      expect(config.maxTempo).toBe(160);
      expect(config.confidenceThreshold).toBe(0.7);
    });
  });

  describe('parseBuffer', () => {
    test('should parse audio buffer successfully', async () => {
      const audioData = createMockAudioData(4096);
      
      // Add some beats
      for (let i = 0; i < audioData.length; i += 1000) {
        audioData[i] = 0.8;
      }

      const result = await beatParser.parseBuffer(audioData);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    test('should handle empty audio data', async () => {
      const emptyAudio = new Float32Array(0);
      
      await expect(beatParser.parseBuffer(emptyAudio)).rejects.toThrow('Invalid or empty audio data');
    });

    test('should handle invalid audio data', async () => {
      const invalidAudio = new Float32Array(1000);
      invalidAudio.fill(NaN);
      
      await expect(beatParser.parseBuffer(invalidAudio)).rejects.toThrow('invalid values');
    });

    test('should respect target picture count', async () => {
      const audioData = createMockAudioData(44100); // 1 second
      
      // Create audio with clear beats
      for (let i = 0; i < audioData.length; i++) {
        if (i % 11025 === 0) { // Beat every 0.25 seconds
          audioData[i] = 0.8;
        }
      }

      const result = await beatParser.parseBuffer(audioData, {
        targetPictureCount: 3
      });
      
      expect(result.beats.length).toBeLessThanOrEqual(3);
    });
  });

  describe('plugin system', () => {
    test('should allow adding plugins', () => {
      const testPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      };

      expect(() => beatParser.addPlugin(testPlugin)).not.toThrow();
      
      const plugins = beatParser.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0]!.name).toBe('test-plugin');
    });

    test('should prevent duplicate plugin names', () => {
      const plugin1 = { name: 'duplicate', version: '1.0.0' };
      const plugin2 = { name: 'duplicate', version: '2.0.0' };

      beatParser.addPlugin(plugin1);
      expect(() => beatParser.addPlugin(plugin2)).toThrow('already registered');
    });

    test('should allow removing plugins', () => {
      const plugin = { name: 'removable', version: '1.0.0' };
      
      beatParser.addPlugin(plugin);
      expect(beatParser.getPlugins()).toHaveLength(1);
      
      beatParser.removePlugin('removable');
      expect(beatParser.getPlugins()).toHaveLength(0);
    });
  });

  describe('configuration management', () => {
    test('should allow updating configuration', () => {
      beatParser.updateConfig({
        minTempo: 100,
        maxTempo: 150,
        confidenceThreshold: 0.8
      });

      const config = beatParser.getConfig();
      expect(config.minTempo).toBe(100);
      expect(config.maxTempo).toBe(150);
      expect(config.confidenceThreshold).toBe(0.8);
    });

    test('should prevent config updates after initialization', async () => {
      const audioData = createMockAudioData(4096);
      
      // This should initialize the parser
      await beatParser.parseBuffer(audioData);
      
      expect(() => {
        beatParser.updateConfig({ minTempo: 80 });
      }).toThrow('Cannot update configuration after parser initialization');
    });
  });

  describe('static methods', () => {
    test('should return version information', () => {
      const version = BeatParser.getVersion();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('should return supported formats', () => {
      const formats = BeatParser.getSupportedFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
      expect(formats).toContain('.wav');
      expect(formats).toContain('.mp3');
    });
  });
});
