/**
 * API Interface Validation Test Suite
 * 
 * Tests the API interfaces and type definitions without relying on 
 * implementation details that may not be fully implemented.
 * Focus on validating that the API surface and contracts are correct.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin, StreamingOptions } from '../core/BeatParser';
import { 
  BeatParserWorkerClient, 
  createWorkerClient, 
  isWorkerSupported,
  WorkerProgressCallback,
  WorkerClientOptions,
  WorkerParseOptions
} from '../worker/WorkerClient';
import type { 
  Beat, 
  Tempo, 
  ParseOptions, 
  ParseResult, 
  BeatParsingError,
  AudioData,
  AudioBuffer,
  BeatCandidate
} from '../types';

describe('API Interface Validation', () => {
  describe('Core Class Existence and Structure', () => {
    test('should export BeatParser class', () => {
      expect(BeatParser).toBeDefined();
      expect(typeof BeatParser).toBe('function');
    });

    test('should export worker client', () => {
      expect(BeatParserWorkerClient).toBeDefined();
      expect(typeof BeatParserWorkerClient).toBe('function');
    });

    test('should export utility functions', () => {
      expect(createWorkerClient).toBeDefined();
      expect(typeof createWorkerClient).toBe('function');
      
      expect(isWorkerSupported).toBeDefined();
      expect(typeof isWorkerSupported).toBe('function');
    });
  });

  describe('BeatParser API Surface', () => {
    test('should have correct static methods', () => {
      expect(typeof BeatParser.getVersion).toBe('function');
      expect(typeof BeatParser.getSupportedFormats).toBe('function');
    });

    test('should create instance with correct methods', () => {
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

    test('should return valid version string', () => {
      const version = BeatParser.getVersion();
      
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning pattern
      expect(version.length).toBeGreaterThan(0);
    });

    test('should return supported formats list', () => {
      const formats = BeatParser.getSupportedFormats();
      
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
      
      // Check expected formats
      expect(formats).toContain('.wav');
      expect(formats).toContain('.mp3');
      
      // All formats should be valid file extensions
      formats.forEach(format => {
        expect(format).toMatch(/^\.[a-zA-Z0-9]+$/);
      });
    });
  });

  describe('Configuration Interface', () => {
    test('should accept empty configuration', () => {
      expect(() => new BeatParser()).not.toThrow();
    });

    test('should accept partial configuration', () => {
      const config: Partial<BeatParserConfig> = {
        sampleRate: 48000,
        minTempo: 80,
        maxTempo: 180
      };
      
      expect(() => new BeatParser(config)).not.toThrow();
    });

    test('should return configuration object', () => {
      const parser = new BeatParser({ sampleRate: 48000 });
      const config = parser.getConfig();
      
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(config.sampleRate).toBe(48000);
    });

    test('should return immutable configuration', () => {
      const parser = new BeatParser();
      const config1 = parser.getConfig();
      const config2 = parser.getConfig();
      
      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2);  // Same content
      
      // Modifying returned config shouldn't affect parser
      config1.sampleRate = 99999;
      expect(parser.getConfig().sampleRate).not.toBe(99999);
    });
  });

  describe('Plugin Interface', () => {
    test('should accept valid plugin', () => {
      const parser = new BeatParser();
      
      const validPlugin: BeatParserPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      };
      
      expect(() => parser.addPlugin(validPlugin)).not.toThrow();
    });

    test('should return plugin list', () => {
      const parser = new BeatParser();
      
      const plugin: BeatParserPlugin = {
        name: 'list-test',
        version: '2.0.0'
      };
      
      parser.addPlugin(plugin);
      const plugins = parser.getPlugins();
      
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins).toHaveLength(1);
      expect(plugins[0]).toEqual({ name: 'list-test', version: '2.0.0' });
    });

    test('should validate plugin structure', () => {
      const parser = new BeatParser();
      
      // Invalid plugins should be rejected
      expect(() => parser.addPlugin({} as any)).toThrow();
      expect(() => parser.addPlugin({ name: 'test' } as any)).toThrow();
      expect(() => parser.addPlugin({ version: '1.0.0' } as any)).toThrow();
    });

    test('should prevent duplicate plugins', () => {
      const parser = new BeatParser();
      
      const plugin: BeatParserPlugin = {
        name: 'duplicate-test',
        version: '1.0.0'
      };
      
      parser.addPlugin(plugin);
      
      expect(() => parser.addPlugin(plugin))
        .toThrow(/already registered/);
    });

    test('should remove plugins', () => {
      const parser = new BeatParser();
      
      const plugin: BeatParserPlugin = {
        name: 'remove-test',
        version: '1.0.0'
      };
      
      parser.addPlugin(plugin);
      expect(parser.getPlugins()).toHaveLength(1);
      
      parser.removePlugin('remove-test');
      expect(parser.getPlugins()).toHaveLength(0);
    });
  });

  describe('Worker API Interface', () => {
    test('should create worker client', () => {
      const client = new BeatParserWorkerClient();
      expect(client).toBeDefined();
    });

    test('should create worker client with options', () => {
      const options: WorkerClientOptions = {
        maxRetries: 5,
        timeout: 10000,
        retryDelay: 2000
      };
      
      const client = new BeatParserWorkerClient(options);
      expect(client).toBeDefined();
    });

    test('should have worker utility functions', () => {
      const client = createWorkerClient();
      expect(client).toBeInstanceOf(BeatParserWorkerClient);
      
      const isSupported = isWorkerSupported();
      expect(typeof isSupported).toBe('boolean');
    });

    test('should have correct worker methods', () => {
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
    });

    test('should support Beat with metadata', () => {
      const beatWithMetadata: Beat = {
        timestamp: 1500,
        confidence: 0.9,
        strength: 0.7,
        metadata: {
          source: 'hybrid',
          quality: 'high'
        }
      };
      
      expect(beatWithMetadata.metadata).toBeDefined();
      expect(beatWithMetadata.metadata?.source).toBe('hybrid');
    });

    test('should define Tempo interface correctly', () => {
      const tempo: Tempo = {
        bpm: 120,
        confidence: 0.85
      };
      
      expect(tempo.bpm).toBe(120);
      expect(tempo.confidence).toBe(0.85);
    });

    test('should support Tempo with time signature', () => {
      const tempoWithTimeSignature: Tempo = {
        bpm: 140,
        confidence: 0.9,
        timeSignature: {
          numerator: 4,
          denominator: 4
        }
      };
      
      expect(tempoWithTimeSignature.timeSignature?.numerator).toBe(4);
      expect(tempoWithTimeSignature.timeSignature?.denominator).toBe(4);
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
      expect(options.filename).toBe('test.wav');
    });

    test('should support partial ParseOptions', () => {
      const partialOptions: ParseOptions = {
        targetPictureCount: 5
      };
      
      expect(partialOptions.targetPictureCount).toBe(5);
    });

    test('should validate union types', () => {
      const validSelectionMethods: Array<ParseOptions['selectionMethod']> = [
        'uniform', 'adaptive', 'energy', 'regular', undefined
      ];
      
      validSelectionMethods.forEach(method => {
        const options: ParseOptions = { selectionMethod: method };
        expect(options.selectionMethod).toBe(method);
      });
    });
  });

  describe('Error Handling Interface', () => {
    test('should handle invalid configurations gracefully', () => {
      // Invalid configurations should not crash constructor
      expect(() => new BeatParser(null as any)).not.toThrow();
      expect(() => new BeatParser(undefined)).not.toThrow();
    });

    test('should validate method parameters', () => {
      const parser = new BeatParser();
      
      // These should be rejected at the TypeScript level or runtime
      expect(() => parser.addPlugin(null as any)).toThrow();
      expect(() => parser.removePlugin(null as any)).toThrow();
    });
  });

  describe('Streaming Interface', () => {
    test('should define StreamingOptions correctly', () => {
      let progressCalled = false;
      
      const options: StreamingOptions = {
        chunkSize: 8192,
        overlap: 0.1,
        targetPictureCount: 8,
        progressCallback: (progress: number) => {
          progressCalled = true;
          expect(typeof progress).toBe('number');
        }
      };
      
      expect(options.chunkSize).toBe(8192);
      expect(typeof options.progressCallback).toBe('function');
      
      if (options.progressCallback) {
        options.progressCallback(0.5);
        expect(progressCalled).toBe(true);
      }
    });
  });

  describe('Worker Type Interface', () => {
    test('should define WorkerProgressCallback correctly', () => {
      let callbackInvoked = false;
      
      const callback: WorkerProgressCallback = (progress) => {
        callbackInvoked = true;
        expect(typeof progress.current).toBe('number');
        expect(typeof progress.total).toBe('number');
        expect(typeof progress.stage).toBe('string');
        expect(typeof progress.percentage).toBe('number');
      };
      
      callback({
        current: 50,
        total: 100,
        stage: 'processing',
        percentage: 50
      });
      
      expect(callbackInvoked).toBe(true);
    });

    test('should define WorkerParseOptions correctly', () => {
      const options: WorkerParseOptions = {
        targetPictureCount: 12,
        minConfidence: 0.75,
        progressCallback: (progress) => {
          expect(progress.percentage).toBeGreaterThanOrEqual(0);
          expect(progress.percentage).toBeLessThanOrEqual(100);
        }
      };
      
      expect(options.targetPictureCount).toBe(12);
      expect(typeof options.progressCallback).toBe('function');
    });
  });

  describe('API Contract Validation', () => {
    test('should maintain stable API surface', () => {
      // Test that critical API elements exist and have correct types
      expect(BeatParser).toBeDefined();
      expect(BeatParser.getVersion).toBeDefined();
      expect(BeatParser.getSupportedFormats).toBeDefined();
      
      const parser = new BeatParser();
      expect(parser.parseFile).toBeDefined();
      expect(parser.parseBuffer).toBeDefined();
      expect(parser.parseStream).toBeDefined();
    });

    test('should provide consistent return values', () => {
      // Static methods should return consistent values
      const version1 = BeatParser.getVersion();
      const version2 = BeatParser.getVersion();
      expect(version1).toBe(version2);
      
      const formats1 = BeatParser.getSupportedFormats();
      const formats2 = BeatParser.getSupportedFormats();
      expect(formats1).toEqual(formats2);
    });

    test('should handle edge cases consistently', () => {
      const parser = new BeatParser();
      
      // Empty plugin name should be handled consistently
      expect(() => parser.removePlugin('')).not.toThrow();
      
      // Non-existent plugin removal should be safe
      expect(() => parser.removePlugin('non-existent')).not.toThrow();
    });
  });

  describe('Memory Management Interface', () => {
    test('should provide cleanup method', () => {
      const parser = new BeatParser();
      expect(typeof parser.cleanup).toBe('function');
    });

    test('should handle multiple cleanup calls', async () => {
      const parser = new BeatParser();
      
      // Multiple cleanup calls should be safe
      await expect(parser.cleanup()).resolves.not.toThrow();
      await expect(parser.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Configuration Lifecycle', () => {
    test('should prevent configuration changes after initialization', async () => {
      const parser = new BeatParser();
      
      // Should allow updates before initialization
      expect(() => parser.updateConfig({ sampleRate: 48000 })).not.toThrow();
      
      // Initialize
      await parser.initialize();
      
      // Should prevent updates after initialization
      expect(() => parser.updateConfig({ sampleRate: 96000 }))
        .toThrow(/Cannot update configuration after parser initialization/);
        
      await parser.cleanup();
    });

    test('should prevent plugin changes after initialization', async () => {
      const parser = new BeatParser();
      
      const plugin: BeatParserPlugin = {
        name: 'test-lifecycle',
        version: '1.0.0'
      };
      
      // Should allow plugin changes before initialization
      expect(() => parser.addPlugin(plugin)).not.toThrow();
      
      // Initialize
      await parser.initialize();
      
      // Should prevent plugin changes after initialization
      const anotherPlugin: BeatParserPlugin = {
        name: 'late-plugin',
        version: '1.0.0'
      };
      
      expect(() => parser.addPlugin(anotherPlugin))
        .toThrow(/Cannot add plugins after parser initialization/);
        
      expect(() => parser.removePlugin('test-lifecycle'))
        .toThrow(/Cannot remove plugins after parser initialization/);
        
      await parser.cleanup();
    });
  });
});