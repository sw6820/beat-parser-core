/**
 * Basic API Validation Test Suite
 * 
 * Tests only the basic API surface that works without relying on 
 * the problematic BeatParser implementation details.
 * Focus on type definitions, interfaces, and static methods.
 */

import { BeatParser } from '../core/BeatParser';
import { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import type { 
  Beat, 
  Tempo, 
  ParseOptions, 
  ParseResult, 
  AudioData
} from '../types';

describe('Basic API Validation', () => {
  describe('Static API Methods', () => {
    test('should export BeatParser class with static methods', () => {
      expect(BeatParser).toBeDefined();
      expect(typeof BeatParser).toBe('function');
      expect(typeof BeatParser.getVersion).toBe('function');
      expect(typeof BeatParser.getSupportedFormats).toBe('function');
    });

    test('should return valid version string', () => {
      const version = BeatParser.getVersion();
      
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning
      expect(version.length).toBeGreaterThan(0);
    });

    test('should return supported formats array', () => {
      const formats = BeatParser.getSupportedFormats();
      
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
      
      // Expected formats
      expect(formats).toContain('.wav');
      expect(formats).toContain('.mp3');
      expect(formats).toContain('.flac');
      expect(formats).toContain('.ogg');
      expect(formats).toContain('.m4a');
      
      // All formats should be valid extensions
      formats.forEach(format => {
        expect(format).toMatch(/^\.[a-zA-Z0-9]+$/);
      });
    });

    test('should return consistent values across calls', () => {
      const version1 = BeatParser.getVersion();
      const version2 = BeatParser.getVersion();
      expect(version1).toBe(version2);
      
      const formats1 = BeatParser.getSupportedFormats();
      const formats2 = BeatParser.getSupportedFormats();
      expect(formats1).toEqual(formats2);
    });
  });

  describe('Worker API Validation', () => {
    test('should export worker client classes and utilities', () => {
      expect(BeatParserWorkerClient).toBeDefined();
      expect(typeof BeatParserWorkerClient).toBe('function');
      
      expect(createWorkerClient).toBeDefined();
      expect(typeof createWorkerClient).toBe('function');
      
      expect(isWorkerSupported).toBeDefined();
      expect(typeof isWorkerSupported).toBe('function');
    });

    test('should create worker client instance', () => {
      const client = new BeatParserWorkerClient();
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(BeatParserWorkerClient);
    });

    test('should create worker client with factory function', () => {
      const client = createWorkerClient();
      expect(client).toBeInstanceOf(BeatParserWorkerClient);
    });

    test('should check worker support', () => {
      const isSupported = isWorkerSupported();
      expect(typeof isSupported).toBe('boolean');
    });

    test('should have worker client methods', () => {
      const client = new BeatParserWorkerClient();
      
      const expectedMethods = [
        'parseBuffer', 'parseStream', 'processBatch',
        'cancelOperation', 'terminate',
        'getPendingOperationCount', 'isBusy'
      ];
      
      expectedMethods.forEach(method => {
        expect(typeof (client as any)[method]).toBe('function');
      });
    });

    test('should handle worker state', () => {
      const client = new BeatParserWorkerClient();
      
      expect(client.isBusy()).toBe(false);
      expect(client.getPendingOperationCount()).toBe(0);
    });

    test('should accept worker options', () => {
      const options = {
        maxRetries: 5,
        timeout: 10000,
        retryDelay: 2000
      };
      
      const client = new BeatParserWorkerClient(options);
      expect(client).toBeDefined();
    });
  });

  describe('Type Interface Validation', () => {
    test('should define Beat interface correctly', () => {
      const beat: Beat = {
        timestamp: 1000,
        confidence: 0.8,
        strength: 0.6
      };
      
      expect(beat.timestamp).toBe(1000);
      expect(beat.confidence).toBe(0.8);
      expect(beat.strength).toBe(0.6);
      
      // Optional metadata
      beat.metadata = { source: 'test' };
      expect(beat.metadata.source).toBe('test');
    });

    test('should define Tempo interface correctly', () => {
      const tempo: Tempo = {
        bpm: 120,
        confidence: 0.85
      };
      
      expect(tempo.bpm).toBe(120);
      expect(tempo.confidence).toBe(0.85);
      
      // Optional time signature
      tempo.timeSignature = {
        numerator: 4,
        denominator: 4
      };
      
      expect(tempo.timeSignature.numerator).toBe(4);
    });

    test('should define ParseOptions interface correctly', () => {
      const options: ParseOptions = {
        minConfidence: 0.7,
        windowSize: 1024,
        hopSize: 256,
        sampleRate: 44100,
        targetPictureCount: 10,
        selectionMethod: 'energy',
        filename: 'test.wav'
      };
      
      expect(options.minConfidence).toBe(0.7);
      expect(options.selectionMethod).toBe('energy');
      expect(options.targetPictureCount).toBe(10);
    });

    test('should support partial ParseOptions', () => {
      const partialOptions: ParseOptions = {
        targetPictureCount: 5
      };
      
      expect(partialOptions.targetPictureCount).toBe(5);
      expect(partialOptions.minConfidence).toBeUndefined();
    });

    test('should enforce union type constraints for selectionMethod', () => {
      const validMethods: Array<ParseOptions['selectionMethod']> = [
        'uniform', 'adaptive', 'energy', 'regular', undefined
      ];
      
      validMethods.forEach(method => {
        const options: ParseOptions = { selectionMethod: method };
        expect(options.selectionMethod).toBe(method);
      });
    });

    test('should validate AudioData type union', () => {
      // Test that AudioData can accept different array types
      const float32Array: AudioData = new Float32Array(100);
      const float64Array: AudioData = new Float64Array(100);  
      const numberArray: AudioData = new Array(100).fill(0);
      
      expect(float32Array).toBeInstanceOf(Float32Array);
      expect(float64Array).toBeInstanceOf(Float64Array);
      expect(Array.isArray(numberArray)).toBe(true);
    });
  });

  describe('Parser Constructor Validation', () => {
    test('should create parser with empty configuration', () => {
      expect(() => new BeatParser()).not.toThrow();
    });

    test('should create parser with partial configuration', () => {
      const config = {
        sampleRate: 48000,
        minTempo: 80
      };
      
      expect(() => new BeatParser(config)).not.toThrow();
    });

    test('should handle null/undefined configuration gracefully', () => {
      expect(() => new BeatParser(undefined)).not.toThrow();
      expect(() => new BeatParser(null as any)).not.toThrow();
    });
  });

  describe('Method Existence Validation', () => {
    test('should have all expected instance methods', () => {
      const parser = new BeatParser();
      
      const expectedMethods = [
        'parseFile', 'parseBuffer', 'parseStream',
        'initialize', 'cleanup',
        'addPlugin', 'removePlugin', 'getPlugins',
        'updateConfig', 'getConfig'
      ];
      
      expectedMethods.forEach(method => {
        expect(typeof (parser as any)[method]).toBe('function');
      });
    });
  });

  describe('Basic Configuration Validation', () => {
    test('should provide getConfig method', () => {
      const parser = new BeatParser({ sampleRate: 48000 });
      
      expect(typeof parser.getConfig).toBe('function');
      
      const config = parser.getConfig();
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(config.sampleRate).toBe(48000);
    });

    test('should return immutable configuration', () => {
      const parser = new BeatParser();
      
      const config1 = parser.getConfig();
      const config2 = parser.getConfig();
      
      // Should be different objects
      expect(config1).not.toBe(config2);
      
      // Should have same content
      expect(config1).toEqual(config2);
      
      // Modifying returned config shouldn't affect parser
      const originalSampleRate = config1.sampleRate;
      config1.sampleRate = 99999;
      
      expect(parser.getConfig().sampleRate).toBe(originalSampleRate);
    });
  });

  describe('Plugin Interface Validation', () => {
    test('should validate basic plugin structure', () => {
      const parser = new BeatParser();
      
      const validPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      };
      
      expect(() => parser.addPlugin(validPlugin)).not.toThrow();
      
      // Invalid plugins should be rejected
      expect(() => parser.addPlugin({} as any)).toThrow();
      expect(() => parser.addPlugin({ name: 'test' } as any)).toThrow();
      expect(() => parser.addPlugin({ version: '1.0.0' } as any)).toThrow();
    });

    test('should provide plugin list functionality', () => {
      const parser = new BeatParser();
      
      expect(typeof parser.getPlugins).toBe('function');
      
      const initialPlugins = parser.getPlugins();
      expect(Array.isArray(initialPlugins)).toBe(true);
      expect(initialPlugins).toHaveLength(0);
      
      const plugin = {
        name: 'list-test',
        version: '2.0.0'
      };
      
      parser.addPlugin(plugin);
      
      const updatedPlugins = parser.getPlugins();
      expect(updatedPlugins).toHaveLength(1);
      expect(updatedPlugins[0]).toEqual({ name: 'list-test', version: '2.0.0' });
    });

    test('should handle plugin removal', () => {
      const parser = new BeatParser();
      
      const plugin = {
        name: 'remove-test',
        version: '1.0.0'
      };
      
      parser.addPlugin(plugin);
      expect(parser.getPlugins()).toHaveLength(1);
      
      parser.removePlugin('remove-test');
      expect(parser.getPlugins()).toHaveLength(0);
      
      // Removing non-existent plugin should be safe
      expect(() => parser.removePlugin('non-existent')).not.toThrow();
    });
  });

  describe('Error Handling Validation', () => {
    test('should handle invalid plugin parameters', () => {
      const parser = new BeatParser();
      
      expect(() => parser.addPlugin(null as any)).toThrow();
      expect(() => parser.addPlugin(undefined as any)).toThrow();
      expect(() => parser.removePlugin(null as any)).toThrow();
      expect(() => parser.removePlugin(undefined as any)).toThrow();
    });

    test('should prevent duplicate plugins', () => {
      const parser = new BeatParser();
      
      const plugin = {
        name: 'duplicate-test',
        version: '1.0.0'
      };
      
      parser.addPlugin(plugin);
      
      expect(() => parser.addPlugin(plugin))
        .toThrow(/already registered/);
    });
  });

  describe('API Contract Consistency', () => {
    test('should maintain consistent API surface across instances', () => {
      const parser1 = new BeatParser();
      const parser2 = new BeatParser({ sampleRate: 48000 });
      
      const methods = [
        'parseFile', 'parseBuffer', 'parseStream',
        'initialize', 'cleanup',
        'addPlugin', 'removePlugin', 'getPlugins',
        'updateConfig', 'getConfig'
      ];
      
      methods.forEach(method => {
        expect(typeof (parser1 as any)[method]).toBe('function');
        expect(typeof (parser2 as any)[method]).toBe('function');
      });
    });

    test('should provide consistent static methods', () => {
      const version = BeatParser.getVersion();
      const formats = BeatParser.getSupportedFormats();
      
      expect(typeof version).toBe('string');
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Management Interface', () => {
    test('should provide cleanup functionality', () => {
      const parser = new BeatParser();
      
      expect(typeof parser.cleanup).toBe('function');
    });

    test('should handle multiple cleanup calls safely', async () => {
      const parser = new BeatParser();
      
      // Multiple cleanup calls should not throw
      await expect(parser.cleanup()).resolves.not.toThrow();
      await expect(parser.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Lifecycle State Management', () => {
    test('should provide initialization method', () => {
      const parser = new BeatParser();
      
      expect(typeof parser.initialize).toBe('function');
    });

    test('should handle initialization lifecycle', async () => {
      const parser = new BeatParser();
      
      // Should be able to call initialize
      await expect(parser.initialize()).resolves.not.toThrow();
      
      // Should be able to call initialize multiple times (idempotent)
      await expect(parser.initialize()).resolves.not.toThrow();
      
      await parser.cleanup();
    });
  });
});