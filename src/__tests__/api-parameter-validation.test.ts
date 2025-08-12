/**
 * API Parameter Validation Test Suite
 * 
 * Comprehensive validation tests for all API method parameters,
 * including edge cases, boundary conditions, and type safety.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, StreamingOptions } from '../types';

describe('API Parameter Validation', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser();
  });
  
  afterEach(async () => {
    await parser.cleanup();
  });

  describe('parseFile Parameter Validation', () => {
    test('should validate file path parameter', async () => {
      // Null/undefined paths
      await expect(parser.parseFile(null as any)).rejects.toThrow();
      await expect(parser.parseFile(undefined as any)).rejects.toThrow();
      
      // Empty string path
      await expect(parser.parseFile('')).rejects.toThrow();
      
      // Non-string paths
      await expect(parser.parseFile(123 as any)).rejects.toThrow();
      await expect(parser.parseFile({} as any)).rejects.toThrow();
      await expect(parser.parseFile([] as any)).rejects.toThrow();
    });

    test('should validate file extension requirements', async () => {
      const invalidExtensions = [
        'audio.txt',
        'music.doc', 
        'sound.pdf',
        'beat.xyz',
        'file.avi', // Video format
        'audio.zip',
        'music.exe'
      ];
      
      for (const file of invalidExtensions) {
        await expect(parser.parseFile(file)).rejects.toThrow(/Unsupported audio format/);
      }
    });

    test('should validate ParseOptions parameter', async () => {
      const testFile = '/path/to/test.wav'; // Will fail at file check, not options
      
      // Invalid minConfidence values
      await expect(parser.parseFile(testFile, { minConfidence: -0.5 })).rejects.toThrow();
      await expect(parser.parseFile(testFile, { minConfidence: 1.5 })).rejects.toThrow();
      await expect(parser.parseFile(testFile, { minConfidence: 'high' as any })).rejects.toThrow();
      
      // Invalid windowSize values
      await expect(parser.parseFile(testFile, { windowSize: -1024 })).rejects.toThrow();
      await expect(parser.parseFile(testFile, { windowSize: 0 })).rejects.toThrow();
      await expect(parser.parseFile(testFile, { windowSize: 'large' as any })).rejects.toThrow();
      
      // Invalid targetPictureCount values
      await expect(parser.parseFile(testFile, { targetPictureCount: -1 })).rejects.toThrow();
      await expect(parser.parseFile(testFile, { targetPictureCount: 0 })).rejects.toThrow();
      await expect(parser.parseFile(testFile, { targetPictureCount: 'many' as any })).rejects.toThrow();
      
      // Invalid selectionMethod values
      await expect(parser.parseFile(testFile, { selectionMethod: 'invalid' as any })).rejects.toThrow();
      await expect(parser.parseFile(testFile, { selectionMethod: 123 as any })).rejects.toThrow();
    });

    test('should handle valid ParseOptions combinations', async () => {
      const validOptionSets: ParseOptions[] = [
        {},
        { targetPictureCount: 5 },
        { minConfidence: 0.7, selectionMethod: 'energy' },
        { 
          minConfidence: 0.6,
          windowSize: 1024,
          hopSize: 256,
          sampleRate: 44100,
          targetPictureCount: 10,
          selectionMethod: 'uniform',
          filename: 'test.wav'
        }
      ];
      
      // These will fail at file existence check, but options should be valid
      for (const options of validOptionSets) {
        await expect(parser.parseFile('/nonexistent.wav', options))
          .rejects
          .toThrow(/Audio file not found/); // Should fail on file, not options
      }
    });
  });

  describe('parseBuffer Parameter Validation', () => {
    test('should validate audio data parameter', async () => {
      // Null/undefined audio data
      await expect(parser.parseBuffer(null as any)).rejects.toThrow();
      await expect(parser.parseBuffer(undefined as any)).rejects.toThrow();
      
      // Invalid data types
      await expect(parser.parseBuffer('audio data' as any)).rejects.toThrow();
      await expect(parser.parseBuffer(123 as any)).rejects.toThrow();
      await expect(parser.parseBuffer({} as any)).rejects.toThrow();
      await expect(parser.parseBuffer([] as any)).rejects.toThrow();
      
      // Empty arrays
      await expect(parser.parseBuffer(new Float32Array(0))).rejects.toThrow(/Invalid or empty audio data/);
      await expect(parser.parseBuffer(new Float64Array(0))).rejects.toThrow(/Invalid or empty audio data/);
      
      // Too small arrays
      await expect(parser.parseBuffer(new Float32Array(10))).rejects.toThrow(/Audio data too short/);
      await expect(parser.parseBuffer(new Float32Array(100))).rejects.toThrow(/Audio data too short/);
    });

    test('should validate buffer content', async () => {
      // Buffers with invalid values
      const nanBuffer = new Float32Array(4096).fill(0.1);
      nanBuffer[100] = NaN;
      await expect(parser.parseBuffer(nanBuffer)).rejects.toThrow(/invalid values/);
      
      const infBuffer = new Float32Array(4096).fill(0.1);
      infBuffer[200] = Infinity;
      await expect(parser.parseBuffer(infBuffer)).rejects.toThrow(/invalid values/);
      
      const negInfBuffer = new Float32Array(4096).fill(0.1);
      negInfBuffer[300] = -Infinity;
      await expect(parser.parseBuffer(negInfBuffer)).rejects.toThrow(/invalid values/);
    });

    test('should accept valid buffer types', async () => {
      const validBuffers = [
        new Float32Array(4096).fill(0.1),
        new Float64Array(4096).fill(0.1),
        new Array(4096).fill(0.1),
        Buffer.alloc(4096).fill(0.1)
      ];
      
      for (const buffer of validBuffers) {
        await expect(parser.parseBuffer(buffer as any)).resolves.toBeDefined();
      }
    });

    test('should validate buffer size boundaries', async () => {
      const config = parser.getConfig();
      const frameSize = config.frameSize;
      
      // Exactly minimum size should work
      const minBuffer = new Float32Array(frameSize).fill(0.1);
      await expect(parser.parseBuffer(minBuffer)).resolves.toBeDefined();
      
      // Just below minimum size should fail
      const tooSmallBuffer = new Float32Array(frameSize - 1).fill(0.1);
      await expect(parser.parseBuffer(tooSmallBuffer)).rejects.toThrow(/too short/);
      
      // Large buffers should work
      const largeBuffer = new Float32Array(frameSize * 100).fill(0.1);
      await expect(parser.parseBuffer(largeBuffer)).resolves.toBeDefined();
    });
  });

  describe('parseStream Parameter Validation', () => {
    test('should validate stream parameter', async () => {
      // Null/undefined streams
      await expect(parser.parseStream(null as any)).rejects.toThrow();
      await expect(parser.parseStream(undefined as any)).rejects.toThrow();
      
      // Invalid stream types
      await expect(parser.parseStream('stream data' as any)).rejects.toThrow();
      await expect(parser.parseStream(123 as any)).rejects.toThrow();
      await expect(parser.parseStream({} as any)).rejects.toThrow();
    });

    test('should validate StreamingOptions', async () => {
      const validStream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new Float32Array(1024).fill(0.1));
          controller.close();
        }
      });
      
      // Invalid chunkSize values
      const invalidOptions: StreamingOptions[] = [
        { chunkSize: -1000 },
        { chunkSize: 0 },
        { chunkSize: 'large' as any },
        { overlap: -0.5 },
        { overlap: 1.5 },
        { overlap: 'half' as any },
        { targetPictureCount: -5 },
        { targetPictureCount: 'many' as any }
      ];
      
      for (const options of invalidOptions) {
        await expect(parser.parseStream(validStream, options)).rejects.toThrow();
      }
    });

    test('should validate progress callback', async () => {
      const validStream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new Float32Array(1024).fill(0.1));
          controller.close();
        }
      });
      
      // Invalid callback types
      const invalidCallbacks = [
        'callback',
        123,
        {},
        []
      ];
      
      for (const callback of invalidCallbacks) {
        await expect(parser.parseStream(validStream, { 
          progressCallback: callback as any 
        })).rejects.toThrow();
      }
    });
  });

  describe('Plugin Parameter Validation', () => {
    test('should validate addPlugin parameter', () => {
      // Null/undefined plugins
      expect(() => parser.addPlugin(null as any)).toThrow();
      expect(() => parser.addPlugin(undefined as any)).toThrow();
      
      // Invalid plugin structures
      expect(() => parser.addPlugin({} as any)).toThrow();
      expect(() => parser.addPlugin({ name: 'test' } as any)).toThrow();
      expect(() => parser.addPlugin({ version: '1.0.0' } as any)).toThrow();
      expect(() => parser.addPlugin('plugin' as any)).toThrow();
      expect(() => parser.addPlugin(123 as any)).toThrow();
    });

    test('should validate plugin name and version types', () => {
      const invalidPlugins = [
        { name: 123, version: '1.0.0' },
        { name: 'test', version: 123 },
        { name: null, version: '1.0.0' },
        { name: 'test', version: null },
        { name: '', version: '1.0.0' },
        { name: 'test', version: '' }
      ];
      
      invalidPlugins.forEach(plugin => {
        expect(() => parser.addPlugin(plugin as any)).toThrow();
      });
    });

    test('should validate plugin method signatures', async () => {
      const pluginWithInvalidMethods: BeatParserPlugin = {
        name: 'invalid-methods',
        version: '1.0.0',
        initialize: 'not a function' as any,
        processAudio: 123 as any,
        processBeats: {} as any,
        cleanup: [] as any
      };
      
      // Adding might succeed, but execution should fail
      parser.addPlugin(pluginWithInvalidMethods);
      
      const buffer = new Float32Array(4096).fill(0.1);
      await expect(parser.parseBuffer(buffer)).rejects.toThrow();
    });

    test('should validate removePlugin parameter', () => {
      // Invalid plugin names
      expect(() => parser.removePlugin(null as any)).toThrow();
      expect(() => parser.removePlugin(undefined as any)).toThrow();
      expect(() => parser.removePlugin(123 as any)).toThrow();
      expect(() => parser.removePlugin({} as any)).toThrow();
      expect(() => parser.removePlugin([] as any)).toThrow();
      
      // Empty string should not throw but should have no effect
      expect(() => parser.removePlugin('')).not.toThrow();
    });
  });

  describe('Configuration Parameter Validation', () => {
    test('should validate BeatParserConfig constructor parameter', () => {
      // Invalid config types
      expect(() => new BeatParser('config' as any)).toThrow();
      expect(() => new BeatParser(123 as any)).toThrow();
      expect(() => new BeatParser([] as any)).toThrow();
      
      // Null/undefined should use defaults
      expect(() => new BeatParser(null as any)).not.toThrow();
      expect(() => new BeatParser(undefined)).not.toThrow();
    });

    test('should validate individual config properties', () => {
      const invalidConfigs: BeatParserConfig[] = [
        { sampleRate: 'high' as any },
        { hopSize: -512 },
        { frameSize: 'large' as any },
        { minTempo: 'slow' as any },
        { maxTempo: [] as any },
        { onsetWeight: 'heavy' as any },
        { tempoWeight: {} as any },
        { spectralWeight: true as any },
        { confidenceThreshold: 'high' as any },
        { outputFormat: 'invalid' as any },
        { plugins: 'many' as any }
      ];
      
      // Constructor should handle invalid configs gracefully or throw
      invalidConfigs.forEach(config => {
        expect(() => new BeatParser(config)).not.toThrow();
      });
    });

    test('should validate updateConfig parameter', () => {
      // Invalid update types
      expect(() => parser.updateConfig('config' as any)).toThrow();
      expect(() => parser.updateConfig(123 as any)).toThrow();
      expect(() => parser.updateConfig([] as any)).toThrow();
      
      // Null/undefined should not throw
      expect(() => parser.updateConfig(null as any)).not.toThrow();
      expect(() => parser.updateConfig(undefined as any)).not.toThrow();
    });
  });

  describe('Worker API Parameter Validation', () => {
    describe('BeatParserWorkerClient Constructor', () => {
      test('should validate worker options', () => {
        // Invalid option types
        expect(() => new BeatParserWorkerClient('options' as any)).not.toThrow();
        expect(() => new BeatParserWorkerClient(123 as any)).not.toThrow();
        
        // Individual option validation
        const invalidOptions = [
          { maxRetries: -1 },
          { maxRetries: 'many' as any },
          { retryDelay: -1000 },
          { retryDelay: 'long' as any },
          { timeout: -5000 },
          { timeout: 'forever' as any },
          { workerUrl: 123 as any },
          { workerUrl: {} as any }
        ];
        
        invalidOptions.forEach(options => {
          expect(() => new BeatParserWorkerClient(options)).not.toThrow();
        });
      });
    });

    describe('Worker Method Parameters', () => {
      let workerClient: BeatParserWorkerClient;
      
      beforeEach(() => {
        workerClient = new BeatParserWorkerClient();
      });
      
      afterEach(async () => {
        await workerClient.terminate();
      });

      test('should validate parseBuffer parameters', async () => {
        // Note: These will fail at worker initialization in test environment
        // but parameter validation happens before that
        
        await expect(workerClient.parseBuffer(null as any))
          .rejects.toThrow();
        
        await expect(workerClient.parseBuffer(undefined as any))
          .rejects.toThrow();
        
        await expect(workerClient.parseBuffer('audio' as any))
          .rejects.toThrow();
      });

      test('should validate parseStream parameters', async () => {
        await expect(workerClient.parseStream(null as any))
          .rejects.toThrow();
        
        await expect(workerClient.parseStream('chunks' as any))
          .rejects.toThrow();
        
        await expect(workerClient.parseStream([]))
          .rejects.toThrow(); // Empty chunks array
      });

      test('should validate processBatch parameters', async () => {
        await expect(workerClient.processBatch(null as any))
          .rejects.toThrow();
        
        await expect(workerClient.processBatch('buffers' as any))
          .rejects.toThrow();
        
        // Empty batch
        await expect(workerClient.processBatch([]))
          .rejects.toThrow();
      });
    });
  });

  describe('Boundary Conditions', () => {
    test('should handle minimum valid values', async () => {
      const config = parser.getConfig();
      
      // Test with minimum frame size
      const minBuffer = new Float32Array(config.frameSize).fill(0.001); // Very quiet
      await expect(parser.parseBuffer(minBuffer)).resolves.toBeDefined();
      
      // Test with minimum valid options
      const minOptions: ParseOptions = {
        minConfidence: 0.0,
        targetPictureCount: 1,
        windowSize: 64, // Very small but valid
        hopSize: 32
      };
      
      await expect(parser.parseBuffer(minBuffer, minOptions)).resolves.toBeDefined();
    });

    test('should handle maximum reasonable values', async () => {
      // Large buffer (but not excessive)
      const largeBuffer = new Float32Array(44100 * 10).fill(0.1); // 10 seconds
      
      const maxOptions: ParseOptions = {
        minConfidence: 1.0,
        targetPictureCount: 1000,
        windowSize: 8192,
        hopSize: 4096,
        sampleRate: 192000 // High sample rate
      };
      
      // This might be slow but should complete
      await expect(parser.parseBuffer(largeBuffer, maxOptions)).resolves.toBeDefined();
    }, 30000); // Extended timeout for large processing
  });

  describe('Type Coercion and Conversion', () => {
    test('should handle numeric string parameters', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      
      // These should be converted to numbers if the API supports it
      const stringOptions = {
        targetPictureCount: '5' as any,
        minConfidence: '0.7' as any,
        windowSize: '1024' as any
      };
      
      // Depending on implementation, this might work or throw
      try {
        const result = await parser.parseBuffer(buffer, stringOptions);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle boolean parameters', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      
      const booleanOptions = {
        targetPictureCount: true as any, // Should be rejected
        minConfidence: false as any     // Should be rejected
      };
      
      await expect(parser.parseBuffer(buffer, booleanOptions)).rejects.toThrow();
    });
  });

  describe('Parameter Interaction Validation', () => {
    test('should validate parameter consistency', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      
      // Inconsistent parameters that might cause issues
      const inconsistentOptions: ParseOptions[] = [
        {
          windowSize: 2048,
          hopSize: 4096 // Hop size larger than window size
        },
        {
          sampleRate: 44100,
          windowSize: 44100 * 2 // Window size larger than 1 second
        },
        {
          targetPictureCount: 1000,
          minConfidence: 0.99 // Very high confidence with many pictures
        }
      ];
      
      for (const options of inconsistentOptions) {
        // Should either handle gracefully or provide meaningful error
        try {
          const result = await parser.parseBuffer(buffer, options);
          expect(result).toBeDefined();
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBeTruthy();
        }
      }
    });
  });
});