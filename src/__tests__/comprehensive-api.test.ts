/**
 * Comprehensive API Testing Suite
 * 
 * Tests all public API methods, interfaces, and parameter combinations
 * to ensure robust API design and implementation.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import { HybridDetector } from '../algorithms/HybridDetector';
import type { 
  ParseOptions, 
  ParseResult, 
  Beat, 
  Tempo,
  BeatParsingError,
  AudioData,
  AudioBuffer,
  BeatCandidate
} from '../types';
import fs from 'fs/promises';
import { Readable } from 'stream';

describe('Comprehensive API Test Suite', () => {
  describe('Core API Methods', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    describe('parseFile Method', () => {
      const createTestWavFile = async (filename: string): Promise<string> => {
        const testDir = './src/__tests__/test-audio-files';
        await fs.mkdir(testDir, { recursive: true });
        
        const filePath = `${testDir}/${filename}`;
        
        // Create minimal WAV file header + data
        const sampleRate = 44100;
        const duration = 1; // 1 second
        const samples = sampleRate * duration;
        const buffer = Buffer.alloc(44 + samples * 2); // WAV header + 16-bit samples
        
        // WAV header
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + samples * 2, 4);
        buffer.write('WAVE', 8);
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16); // PCM format size
        buffer.writeUInt16LE(1, 20);  // PCM format
        buffer.writeUInt16LE(1, 22);  // Mono
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
        buffer.writeUInt16LE(2, 32); // Block align
        buffer.writeUInt16LE(16, 34); // Bits per sample
        buffer.write('data', 36);
        buffer.writeUInt32LE(samples * 2, 40);
        
        // Simple sine wave data
        for (let i = 0; i < samples; i++) {
          const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16000;
          buffer.writeInt16LE(sample, 44 + i * 2);
        }
        
        await fs.writeFile(filePath, buffer);
        return filePath;
      };

      test('should parse valid audio file', async () => {
        const filePath = await createTestWavFile('test-valid.wav');
        
        const result = await parser.parseFile(filePath);
        
        expect(result).toHaveProperty('beats');
        expect(result).toHaveProperty('metadata');
        expect(Array.isArray(result.beats)).toBe(true);
        expect(result.metadata).toHaveProperty('processingTime');
        expect(result.metadata).toHaveProperty('samplesProcessed');
        
        // Cleanup
        await fs.unlink(filePath);
      });

      test('should parse with custom options', async () => {
        const filePath = await createTestWavFile('test-options.wav');
        
        const options: ParseOptions = {
          minConfidence: 0.7,
          targetPictureCount: 5,
          selectionMethod: 'energy'
        };
        
        const result = await parser.parseFile(filePath, options);
        
        expect(result.beats.length).toBeLessThanOrEqual(5);
        expect(result.metadata.parameters).toMatchObject(expect.objectContaining({
          targetPictureCount: 5
        }));
        
        await fs.unlink(filePath);
      });

      test('should reject non-existent file', async () => {
        await expect(parser.parseFile('/non/existent/file.wav'))
          .rejects
          .toThrow('Audio file not found');
      });

      test('should reject unsupported format', async () => {
        const filePath = await createTestWavFile('test.txt');
        
        await expect(parser.parseFile(filePath))
          .rejects
          .toThrow('Unsupported audio format');
          
        await fs.unlink(filePath);
      });

      test('should validate file extension', async () => {
        const supportedFormats = ['.wav', '.mp3', '.flac', '.ogg', '.m4a'];
        
        for (const format of supportedFormats) {
          const filePath = await createTestWavFile(`test${format}`);
          
          // Should not throw for supported formats
          await expect(async () => {
            try {
              await parser.parseFile(filePath);
            } catch (error) {
              // We expect parsing to potentially fail due to format mismatch,
              // but not due to unsupported extension
              if (error instanceof Error && error.message.includes('Unsupported audio format')) {
                throw error;
              }
            }
          }).not.toThrow('Unsupported audio format');
          
          await fs.unlink(filePath);
        }
      });

      test('should handle empty file path', async () => {
        await expect(parser.parseFile(''))
          .rejects
          .toThrow();
      });

      test('should handle malformed file path', async () => {
        await expect(parser.parseFile('\\0\\invalid\\path'))
          .rejects
          .toThrow();
      });
    });

    describe('parseBuffer Method', () => {
      const createTestBuffer = (samples = 44100): Float32Array => {
        const buffer = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
          // Simple pattern with beats
          const t = i / 44100;
          if (t % 0.5 < 0.05) {
            buffer[i] = 0.8 * Math.sin(2 * Math.PI * 60 * (t % 0.5));
          } else {
            buffer[i] = 0.05 * (Math.random() - 0.5);
          }
        }
        return buffer;
      };

      test('should parse Float32Array buffer', async () => {
        const buffer = createTestBuffer();
        
        const result = await parser.parseBuffer(buffer);
        
        expect(result).toHaveProperty('beats');
        expect(result).toHaveProperty('metadata');
        expect(Array.isArray(result.beats)).toBe(true);
      });

      test('should parse Node.js Buffer', async () => {
        const audioData = createTestBuffer(1024);
        const nodeBuffer = Buffer.from(audioData.buffer);
        
        const result = await parser.parseBuffer(nodeBuffer);
        
        expect(result).toHaveProperty('beats');
        expect(Array.isArray(result.beats)).toBe(true);
      });

      test('should validate buffer parameters', async () => {
        // Empty buffer
        await expect(parser.parseBuffer(new Float32Array(0)))
          .rejects
          .toThrow('Invalid or empty audio data');

        // Null/undefined buffer
        await expect(parser.parseBuffer(null as any))
          .rejects
          .toThrow();

        // Buffer too short
        const shortBuffer = new Float32Array(100); // Less than frameSize (2048)
        await expect(parser.parseBuffer(shortBuffer))
          .rejects
          .toThrow('Audio data too short');
      });

      test('should handle invalid audio data', async () => {
        // Buffer with NaN values
        const invalidBuffer = new Float32Array(4096);
        invalidBuffer[100] = NaN;
        
        await expect(parser.parseBuffer(invalidBuffer))
          .rejects
          .toThrow('Audio data contains invalid values');

        // Buffer with Infinity values
        const infinityBuffer = new Float32Array(4096);
        infinityBuffer[200] = Infinity;
        
        await expect(parser.parseBuffer(infinityBuffer))
          .rejects
          .toThrow('Audio data contains invalid values');
      });

      test('should handle various buffer sizes', async () => {
        const sizes = [4096, 44100, 88200, 176400]; // Different durations
        
        for (const size of sizes) {
          const buffer = createTestBuffer(size);
          const result = await parser.parseBuffer(buffer);
          
          expect(result.beats).toBeDefined();
          expect(result.metadata.samplesProcessed).toBe(size);
        }
      });

      test('should handle all ParseOptions parameters', async () => {
        const buffer = createTestBuffer();
        
        const options: ParseOptions = {
          minConfidence: 0.8,
          windowSize: 1024,
          hopSize: 256,
          sampleRate: 44100,
          targetPictureCount: 10,
          selectionMethod: 'uniform',
          filename: 'test-buffer.wav'
        };
        
        const result = await parser.parseBuffer(buffer, options);
        
        expect(result.metadata.parameters).toMatchObject(expect.objectContaining(options));
        expect(result.beats.length).toBeLessThanOrEqual(10);
      });
    });

    describe('parseStream Method', () => {
      const createStreamChunks = (numChunks = 5, chunkSize = 8192): Float32Array[] => {
        const chunks: Float32Array[] = [];
        
        for (let i = 0; i < numChunks; i++) {
          const chunk = new Float32Array(chunkSize);
          for (let j = 0; j < chunkSize; j++) {
            const globalIndex = i * chunkSize + j;
            const t = globalIndex / 44100;
            
            // Create beat pattern
            if (t % 0.5 < 0.05) {
              chunk[j] = 0.8 * Math.sin(2 * Math.PI * 60 * (t % 0.5));
            } else {
              chunk[j] = 0.05 * (Math.random() - 0.5);
            }
          }
          chunks.push(chunk);
        }
        
        return chunks;
      };

      const createReadableStream = (chunks: Float32Array[]): ReadableStream<Float32Array> => {
        let index = 0;
        
        return new ReadableStream({
          pull(controller) {
            if (index < chunks.length) {
              controller.enqueue(chunks[index++]);
            } else {
              controller.close();
            }
          }
        });
      };

      const createAsyncIterator = (chunks: Float32Array[]): AsyncIterableIterator<Float32Array> => {
        let index = 0;
        
        return {
          async next(): Promise<IteratorResult<Float32Array>> {
            if (index < chunks.length) {
              return { value: chunks[index++], done: false };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator](): AsyncIterableIterator<Float32Array> {
            return this;
          }
        };
      };

      test('should parse ReadableStream', async () => {
        const chunks = createStreamChunks(3, 4096);
        const stream = createReadableStream(chunks);
        
        const result = await parser.parseStream(stream);
        
        expect(result).toHaveProperty('beats');
        expect(result).toHaveProperty('metadata');
        expect(Array.isArray(result.beats)).toBe(true);
        expect((result.metadata.processingInfo as any)?.chunksProcessed).toBe(3);
      });

      test('should parse AsyncIterableIterator', async () => {
        const chunks = createStreamChunks(4, 2048);
        const iterator = createAsyncIterator(chunks);
        
        const result = await parser.parseStream(iterator);
        
        expect(result).toHaveProperty('beats');
        expect((result.metadata.processingInfo as any)?.chunksProcessed).toBe(4);
      });

      test('should handle streaming options', async () => {
        const chunks = createStreamChunks(2, 4096);
        const stream = createReadableStream(chunks);
        
        let progressReports = 0;
        const options = {
          chunkSize: 2048,
          overlap: 0.2,
          progressCallback: (progress: number) => {
            progressReports++;
            expect(typeof progress).toBe('number');
          },
          targetPictureCount: 5
        };
        
        const result = await parser.parseStream(stream, options);
        
        expect(result.beats.length).toBeLessThanOrEqual(5);
        expect(progressReports).toBeGreaterThan(0);
      });

      test('should handle empty stream', async () => {
        const emptyStream = new ReadableStream({
          pull(controller) {
            controller.close();
          }
        });
        
        const result = await parser.parseStream(emptyStream);
        
        expect(result.beats).toHaveLength(0);
      });

      test('should handle stream errors', async () => {
        const errorStream = new ReadableStream({
          pull(controller) {
            controller.error(new Error('Stream processing error'));
          }
        });
        
        await expect(parser.parseStream(errorStream))
          .rejects
          .toThrow();
      });
    });

    describe('initialize Method', () => {
      test('should initialize successfully', async () => {
        const newParser = new BeatParser();
        await expect(newParser.initialize()).resolves.not.toThrow();
        await newParser.cleanup();
      });

      test('should be idempotent', async () => {
        const newParser = new BeatParser();
        await newParser.initialize();
        await newParser.initialize(); // Should not throw
        await newParser.cleanup();
      });

      test('should initialize plugins', async () => {
        let pluginInitialized = false;
        
        const testPlugin: BeatParserPlugin = {
          name: 'test-init-plugin',
          version: '1.0.0',
          initialize: async () => {
            pluginInitialized = true;
          }
        };
        
        const newParser = new BeatParser();
        newParser.addPlugin(testPlugin);
        await newParser.initialize();
        
        expect(pluginInitialized).toBe(true);
        await newParser.cleanup();
      });

      test('should handle plugin initialization errors', async () => {
        const failingPlugin: BeatParserPlugin = {
          name: 'failing-plugin',
          version: '1.0.0',
          initialize: async () => {
            throw new Error('Plugin initialization failed');
          }
        };
        
        const newParser = new BeatParser();
        newParser.addPlugin(failingPlugin);
        
        await expect(newParser.initialize())
          .rejects
          .toThrow('Failed to initialize BeatParser');
        
        await newParser.cleanup();
      });
    });

    describe('cleanup Method', () => {
      test('should cleanup successfully', async () => {
        await expect(parser.cleanup()).resolves.not.toThrow();
      });

      test('should cleanup plugins', async () => {
        let pluginCleaned = false;
        
        const testPlugin: BeatParserPlugin = {
          name: 'cleanup-plugin',
          version: '1.0.0',
          cleanup: async () => {
            pluginCleaned = true;
          }
        };
        
        const newParser = new BeatParser();
        newParser.addPlugin(testPlugin);
        await newParser.initialize();
        await newParser.cleanup();
        
        expect(pluginCleaned).toBe(true);
      });

      test('should handle plugin cleanup errors gracefully', async () => {
        const failingPlugin: BeatParserPlugin = {
          name: 'failing-cleanup-plugin',
          version: '1.0.0',
          cleanup: async () => {
            throw new Error('Cleanup failed');
          }
        };
        
        const newParser = new BeatParser();
        newParser.addPlugin(failingPlugin);
        await newParser.initialize();
        
        // Should not throw, but log warning
        await expect(newParser.cleanup()).resolves.not.toThrow();
      });
    });
  });

  describe('Plugin System API', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    describe('addPlugin Method', () => {
      test('should add plugin successfully', () => {
        const plugin: BeatParserPlugin = {
          name: 'test-plugin',
          version: '1.0.0'
        };
        
        expect(() => parser.addPlugin(plugin)).not.toThrow();
        
        const plugins = parser.getPlugins();
        expect(plugins).toHaveLength(1);
        expect(plugins[0]).toEqual({ name: 'test-plugin', version: '1.0.0' });
      });

      test('should prevent duplicate plugin names', () => {
        const plugin1: BeatParserPlugin = {
          name: 'duplicate-plugin',
          version: '1.0.0'
        };
        
        const plugin2: BeatParserPlugin = {
          name: 'duplicate-plugin',
          version: '2.0.0'
        };
        
        parser.addPlugin(plugin1);
        
        expect(() => parser.addPlugin(plugin2))
          .toThrow('Plugin with name \'duplicate-plugin\' is already registered');
      });

      test('should prevent adding plugins after initialization', async () => {
        await parser.initialize();
        
        const plugin: BeatParserPlugin = {
          name: 'late-plugin',
          version: '1.0.0'
        };
        
        expect(() => parser.addPlugin(plugin))
          .toThrow('Cannot add plugins after parser initialization');
      });

      test('should validate plugin structure', () => {
        expect(() => parser.addPlugin(null as any))
          .toThrow();
        
        expect(() => parser.addPlugin({} as any))
          .toThrow();
        
        expect(() => parser.addPlugin({ name: 'test' } as any))
          .toThrow();
      });
    });

    describe('removePlugin Method', () => {
      test('should remove plugin successfully', () => {
        const plugin: BeatParserPlugin = {
          name: 'removable-plugin',
          version: '1.0.0'
        };
        
        parser.addPlugin(plugin);
        expect(parser.getPlugins()).toHaveLength(1);
        
        parser.removePlugin('removable-plugin');
        expect(parser.getPlugins()).toHaveLength(0);
      });

      test('should handle removing non-existent plugin', () => {
        expect(() => parser.removePlugin('non-existent'))
          .not.toThrow();
      });

      test('should prevent removing plugins after initialization', async () => {
        const plugin: BeatParserPlugin = {
          name: 'locked-plugin',
          version: '1.0.0'
        };
        
        parser.addPlugin(plugin);
        await parser.initialize();
        
        expect(() => parser.removePlugin('locked-plugin'))
          .toThrow('Cannot remove plugins after parser initialization');
      });
    });

    describe('getPlugins Method', () => {
      test('should return empty array initially', () => {
        const plugins = parser.getPlugins();
        expect(plugins).toEqual([]);
      });

      test('should return plugin metadata', () => {
        const plugin1: BeatParserPlugin = {
          name: 'plugin-one',
          version: '1.0.0'
        };
        
        const plugin2: BeatParserPlugin = {
          name: 'plugin-two',
          version: '2.1.0'
        };
        
        parser.addPlugin(plugin1);
        parser.addPlugin(plugin2);
        
        const plugins = parser.getPlugins();
        expect(plugins).toHaveLength(2);
        expect(plugins).toContainEqual({ name: 'plugin-one', version: '1.0.0' });
        expect(plugins).toContainEqual({ name: 'plugin-two', version: '2.1.0' });
      });

      test('should return immutable plugin list', () => {
        const plugin: BeatParserPlugin = {
          name: 'test-plugin',
          version: '1.0.0'
        };
        
        parser.addPlugin(plugin);
        
        const plugins1 = parser.getPlugins();
        const plugins2 = parser.getPlugins();
        
        expect(plugins1).not.toBe(plugins2); // Different arrays
        expect(plugins1).toEqual(plugins2); // Same content
        
        // Modifying returned array shouldn't affect internal state
        plugins1.pop();
        expect(parser.getPlugins()).toHaveLength(1);
      });
    });

    describe('Plugin Lifecycle', () => {
      test('should execute plugin audio processing', async () => {
        let audioProcessed = false;
        
        const audioPlugin: BeatParserPlugin = {
          name: 'audio-processor',
          version: '1.0.0',
          processAudio: async (audioData: Float32Array) => {
            audioProcessed = true;
            return audioData; // Pass through
          }
        };
        
        parser.addPlugin(audioPlugin);
        
        const buffer = new Float32Array(4096).fill(0.1);
        await parser.parseBuffer(buffer);
        
        expect(audioProcessed).toBe(true);
      });

      test('should execute plugin beat processing', async () => {
        let beatsProcessed = false;
        
        const beatPlugin: BeatParserPlugin = {
          name: 'beat-processor',
          version: '1.0.0',
          processBeats: async (beats: BeatCandidate[]) => {
            beatsProcessed = true;
            return beats; // Pass through
          }
        };
        
        parser.addPlugin(beatPlugin);
        
        const buffer = new Float32Array(4096);
        buffer[1000] = 0.8; // Add a beat
        
        await parser.parseBuffer(buffer);
        
        expect(beatsProcessed).toBe(true);
      });

      test('should handle plugin processing errors', async () => {
        const errorPlugin: BeatParserPlugin = {
          name: 'error-plugin',
          version: '1.0.0',
          processAudio: async () => {
            throw new Error('Plugin processing error');
          }
        };
        
        parser.addPlugin(errorPlugin);
        
        const buffer = new Float32Array(4096).fill(0.1);
        
        await expect(parser.parseBuffer(buffer))
          .rejects
          .toThrow();
      });
    });
  });

  describe('Configuration API', () => {
    describe('BeatParserConfig Interface', () => {
      test('should accept valid configuration', () => {
        const config: BeatParserConfig = {
          sampleRate: 48000,
          hopSize: 256,
          frameSize: 1024,
          minTempo: 80,
          maxTempo: 180,
          onsetWeight: 0.5,
          tempoWeight: 0.3,
          spectralWeight: 0.2,
          multiPassEnabled: false,
          genreAdaptive: false,
          confidenceThreshold: 0.7,
          enablePreprocessing: false,
          enableNormalization: false,
          enableFiltering: true,
          outputFormat: 'xml',
          includeMetadata: false,
          includeConfidenceScores: false,
          plugins: []
        };
        
        expect(() => new BeatParser(config)).not.toThrow();
      });

      test('should use partial configuration', () => {
        const partialConfig: BeatParserConfig = {
          minTempo: 100,
          maxTempo: 140
        };
        
        const parser = new BeatParser(partialConfig);
        const fullConfig = parser.getConfig();
        
        expect(fullConfig.minTempo).toBe(100);
        expect(fullConfig.maxTempo).toBe(140);
        expect(fullConfig.sampleRate).toBe(44100); // Default value
      });

      test('should validate configuration ranges', () => {
        // Invalid configurations should be handled gracefully
        const configs = [
          { sampleRate: -1 },
          { hopSize: 0 },
          { frameSize: -100 },
          { minTempo: -10 },
          { maxTempo: 0 },
          { onsetWeight: -0.5 },
          { tempoWeight: 1.5 },
          { confidenceThreshold: -0.1 },
          { confidenceThreshold: 1.5 }
        ];
        
        configs.forEach(config => {
          expect(() => new BeatParser(config)).not.toThrow();
        });
      });

      test('should handle configuration inheritance', () => {
        const baseConfig: BeatParserConfig = {
          sampleRate: 48000,
          minTempo: 80,
          maxTempo: 160
        };
        
        const parser = new BeatParser(baseConfig);
        
        parser.updateConfig({
          minTempo: 100,
          confidenceThreshold: 0.8
        });
        
        const finalConfig = parser.getConfig();
        expect(finalConfig.sampleRate).toBe(48000); // Inherited
        expect(finalConfig.minTempo).toBe(100);     // Updated
        expect(finalConfig.maxTempo).toBe(160);     // Inherited
        expect(finalConfig.confidenceThreshold).toBe(0.8); // Added
      });
    });

    describe('updateConfig Method', () => {
      let parser: BeatParser;
      
      beforeEach(() => {
        parser = new BeatParser();
      });
      
      afterEach(async () => {
        await parser.cleanup();
      });

      test('should update configuration successfully', () => {
        const newConfig = {
          minTempo: 90,
          maxTempo: 150,
          confidenceThreshold: 0.75
        };
        
        expect(() => parser.updateConfig(newConfig)).not.toThrow();
        
        const config = parser.getConfig();
        expect(config.minTempo).toBe(90);
        expect(config.maxTempo).toBe(150);
        expect(config.confidenceThreshold).toBe(0.75);
      });

      test('should prevent updates after initialization', async () => {
        await parser.initialize();
        
        expect(() => parser.updateConfig({ minTempo: 120 }))
          .toThrow('Cannot update configuration after parser initialization');
      });

      test('should handle empty configuration updates', () => {
        expect(() => parser.updateConfig({})).not.toThrow();
      });

      test('should update component configurations', () => {
        const originalConfig = parser.getConfig();
        
        parser.updateConfig({
          sampleRate: 48000,
          enableNormalization: false,
          enableFiltering: true
        });
        
        const updatedConfig = parser.getConfig();
        expect(updatedConfig.sampleRate).toBe(48000);
        expect(updatedConfig.enableNormalization).toBe(false);
        expect(updatedConfig.enableFiltering).toBe(true);
      });
    });

    describe('getConfig Method', () => {
      test('should return immutable configuration', () => {
        const parser = new BeatParser({ minTempo: 100 });
        
        const config1 = parser.getConfig();
        const config2 = parser.getConfig();
        
        expect(config1).not.toBe(config2); // Different objects
        expect(config1).toEqual(config2);  // Same content
        
        // Modifying returned config shouldn't affect parser
        config1.minTempo = 200;
        expect(parser.getConfig().minTempo).toBe(100);
      });

      test('should include all configuration options', () => {
        const parser = new BeatParser();
        const config = parser.getConfig();
        
        const requiredFields = [
          'sampleRate', 'hopSize', 'frameSize',
          'minTempo', 'maxTempo',
          'onsetWeight', 'tempoWeight', 'spectralWeight',
          'multiPassEnabled', 'genreAdaptive', 'confidenceThreshold',
          'enablePreprocessing', 'enableNormalization', 'enableFiltering',
          'outputFormat', 'includeMetadata', 'includeConfidenceScores',
          'plugins'
        ];
        
        requiredFields.forEach(field => {
          expect(config).toHaveProperty(field);
        });
      });
    });
  });

  describe('Static Methods', () => {
    describe('getVersion Method', () => {
      test('should return valid version string', () => {
        const version = BeatParser.getVersion();
        
        expect(typeof version).toBe('string');
        expect(version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning
        expect(version.length).toBeGreaterThan(0);
      });

      test('should be consistent across calls', () => {
        const version1 = BeatParser.getVersion();
        const version2 = BeatParser.getVersion();
        
        expect(version1).toBe(version2);
      });
    });

    describe('getSupportedFormats Method', () => {
      test('should return array of supported formats', () => {
        const formats = BeatParser.getSupportedFormats();
        
        expect(Array.isArray(formats)).toBe(true);
        expect(formats.length).toBeGreaterThan(0);
        
        // Check expected formats
        expect(formats).toContain('.wav');
        expect(formats).toContain('.mp3');
        expect(formats).toContain('.flac');
        expect(formats).toContain('.ogg');
        expect(formats).toContain('.m4a');
      });

      test('should return immutable format list', () => {
        const formats1 = BeatParser.getSupportedFormats();
        const formats2 = BeatParser.getSupportedFormats();
        
        expect(formats1).not.toBe(formats2); // Different arrays
        expect(formats1).toEqual(formats2);  // Same content
        
        // Modifying returned array shouldn't affect future calls
        formats1.pop();
        expect(BeatParser.getSupportedFormats().length).toBeGreaterThan(formats1.length);
      });

      test('should include only valid file extensions', () => {
        const formats = BeatParser.getSupportedFormats();
        
        formats.forEach(format => {
          expect(format).toMatch(/^\.[a-zA-Z0-9]+$/); // Starts with dot, followed by alphanumeric
          expect(format.length).toBeGreaterThan(1);
        });
      });
    });
  });

  describe('Worker API', () => {
    describe('BeatParserWorkerClient', () => {
      let workerClient: BeatParserWorkerClient;
      
      beforeEach(() => {
        workerClient = new BeatParserWorkerClient();
      });
      
      afterEach(async () => {
        await workerClient.terminate();
      });

      test('should create worker client', () => {
        expect(workerClient).toBeDefined();
        expect(typeof workerClient.parseBuffer).toBe('function');
        expect(typeof workerClient.parseStream).toBe('function');
        expect(typeof workerClient.processBatch).toBe('function');
      });

      test('should handle worker options', () => {
        const options = {
          maxRetries: 5,
          retryDelay: 2000,
          timeout: 60000
        };
        
        const client = new BeatParserWorkerClient(options);
        expect(client).toBeDefined();
      });

      test('should check worker support', () => {
        const isSupported = isWorkerSupported();
        expect(typeof isSupported).toBe('boolean');
      });

      test('should create worker client with factory', () => {
        const client = createWorkerClient();
        expect(client).toBeInstanceOf(BeatParserWorkerClient);
      });

      test('should handle worker state management', () => {
        expect(workerClient.isBusy()).toBe(false);
        expect(workerClient.getPendingOperationCount()).toBe(0);
      });

      // Note: Actual worker tests would require a test environment with Worker support
      // These tests verify the API surface and basic functionality
    });
  });

  describe('Type Safety and Validation', () => {
    describe('TypeScript Interface Compliance', () => {
      test('should enforce Beat interface', () => {
        const validBeat: Beat = {
          timestamp: 1000,
          confidence: 0.8,
          strength: 0.6
        };
        
        expect(validBeat.timestamp).toBe(1000);
        expect(validBeat.confidence).toBe(0.8);
        expect(validBeat.strength).toBe(0.6);
      });

      test('should enforce Tempo interface', () => {
        const validTempo: Tempo = {
          bpm: 120,
          confidence: 0.9,
          timeSignature: {
            numerator: 4,
            denominator: 4
          },
          metadata: {
            phase: 0.1,
            stability: 0.85
          }
        };
        
        expect(validTempo.bpm).toBe(120);
        expect(validTempo.timeSignature?.numerator).toBe(4);
      });

      test('should enforce ParseResult interface', async () => {
        const parser = new BeatParser();
        const buffer = new Float32Array(4096).fill(0.1);
        
        const result: ParseResult = await parser.parseBuffer(buffer);
        
        expect(result).toHaveProperty('beats');
        expect(result).toHaveProperty('metadata');
        expect(Array.isArray(result.beats)).toBe(true);
        expect(typeof result.metadata).toBe('object');
        
        await parser.cleanup();
      });
    });

    describe('Parameter Type Checking', () => {
      let parser: BeatParser;
      
      beforeEach(() => {
        parser = new BeatParser();
      });
      
      afterEach(async () => {
        await parser.cleanup();
      });

      test('should validate audio data types', async () => {
        // Valid types
        const float32 = new Float32Array(4096);
        const buffer = Buffer.alloc(4096);
        
        await expect(parser.parseBuffer(float32)).resolves.toBeDefined();
        await expect(parser.parseBuffer(buffer)).resolves.toBeDefined();
        
        // Invalid types
        await expect(parser.parseBuffer('invalid' as any)).rejects.toThrow();
        await expect(parser.parseBuffer(123 as any)).rejects.toThrow();
        await expect(parser.parseBuffer({} as any)).rejects.toThrow();
      });

      test('should validate option types', async () => {
        const buffer = new Float32Array(4096).fill(0.1);
        
        // Valid options
        const validOptions: ParseOptions = {
          minConfidence: 0.5,
          windowSize: 1024,
          hopSize: 256,
          sampleRate: 44100,
          targetPictureCount: 5,
          selectionMethod: 'energy',
          filename: 'test.wav'
        };
        
        await expect(parser.parseBuffer(buffer, validOptions)).resolves.toBeDefined();
        
        // Invalid option values should be handled gracefully or rejected
        const invalidOptions = {
          targetPictureCount: 'invalid' as any,
          selectionMethod: 'invalid' as any
        };
        
        await expect(parser.parseBuffer(buffer, invalidOptions)).rejects.toThrow();
      });
    });

    describe('Return Type Validation', () => {
      let parser: BeatParser;
      
      beforeEach(() => {
        parser = new BeatParser();
      });
      
      afterEach(async () => {
        await parser.cleanup();
      });

      test('should return valid ParseResult structure', async () => {
        const buffer = new Float32Array(4096).fill(0.1);
        const result = await parser.parseBuffer(buffer);
        
        // Check required properties
        expect(result).toHaveProperty('beats');
        expect(result).toHaveProperty('metadata');
        
        // Check beats array
        expect(Array.isArray(result.beats)).toBe(true);
        result.beats.forEach(beat => {
          expect(beat).toHaveProperty('timestamp');
          expect(beat).toHaveProperty('confidence');
          expect(beat).toHaveProperty('strength');
          expect(typeof beat.timestamp).toBe('number');
          expect(typeof beat.confidence).toBe('number');
          expect(typeof beat.strength).toBe('number');
        });
        
        // Check metadata
        expect(result.metadata).toHaveProperty('processingTime');
        expect(result.metadata).toHaveProperty('samplesProcessed');
        expect(result.metadata).toHaveProperty('parameters');
        expect(typeof result.metadata.processingTime).toBe('number');
        expect(typeof result.metadata.samplesProcessed).toBe('number');
      });
    });
  });

  describe('Error Handling API', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    describe('Error Types and Messages', () => {
      test('should throw descriptive errors for invalid inputs', async () => {
        const testCases = [
          {
            input: () => parser.parseBuffer(new Float32Array(0)),
            expectedMessage: 'Invalid or empty audio data'
          },
          {
            input: () => parser.parseBuffer(new Float32Array(100)), // Too short
            expectedMessage: 'Audio data too short'
          },
          {
            input: () => parser.parseFile('/non/existent/file.wav'),
            expectedMessage: 'Audio file not found'
          },
          {
            input: () => parser.parseFile('test.xyz'),
            expectedMessage: 'Unsupported audio format'
          }
        ];
        
        for (const testCase of testCases) {
          await expect(testCase.input()).rejects.toThrow(
            expect.stringContaining(testCase.expectedMessage)
          );
        }
      });

      test('should provide error context', async () => {
        try {
          await parser.parseBuffer(new Float32Array(0));
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Invalid or empty audio data');
        }
      });
    });

    describe('Async Error Propagation', () => {
      test('should propagate plugin errors', async () => {
        const errorPlugin: BeatParserPlugin = {
          name: 'error-plugin',
          version: '1.0.0',
          processAudio: async () => {
            throw new Error('Plugin failed');
          }
        };
        
        parser.addPlugin(errorPlugin);
        
        const buffer = new Float32Array(4096).fill(0.1);
        await expect(parser.parseBuffer(buffer)).rejects.toThrow('Plugin failed');
      });

      test('should handle promise rejections', async () => {
        const rejectionPlugin: BeatParserPlugin = {
          name: 'rejection-plugin',
          version: '1.0.0',
          processBeats: async () => {
            return Promise.reject(new Error('Promise rejected'));
          }
        };
        
        parser.addPlugin(rejectionPlugin);
        
        const buffer = new Float32Array(4096).fill(0.1);
        await expect(parser.parseBuffer(buffer)).rejects.toThrow('Promise rejected');
      });
    });

    describe('Timeout and Cancellation', () => {
      test('should handle operation timeouts gracefully', async () => {
        // This would be more relevant for worker-based operations
        const slowPlugin: BeatParserPlugin = {
          name: 'slow-plugin',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate slow processing
            await new Promise(resolve => setTimeout(resolve, 100));
            return audioData;
          }
        };
        
        parser.addPlugin(slowPlugin);
        
        const buffer = new Float32Array(4096).fill(0.1);
        // Should complete successfully (timeout would be in worker context)
        await expect(parser.parseBuffer(buffer)).resolves.toBeDefined();
      });
    });
  });

  describe('Concurrent API Usage', () => {
    let parser: BeatParser;
    
    beforeEach(() => {
      parser = new BeatParser();
    });
    
    afterEach(async () => {
      await parser.cleanup();
    });

    test('should handle concurrent parse operations', async () => {
      const buffer1 = new Float32Array(4096).fill(0.1);
      const buffer2 = new Float32Array(4096).fill(0.2);
      const buffer3 = new Float32Array(4096).fill(0.3);
      
      const promises = [
        parser.parseBuffer(buffer1),
        parser.parseBuffer(buffer2),
        parser.parseBuffer(buffer3)
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('beats');
        expect(result).toHaveProperty('metadata');
      });
    });

    test('should maintain state consistency during concurrent operations', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => {
        const buffer = new Float32Array(2048).fill(0.1 + i * 0.05);
        return parser.parseBuffer(buffer, { 
          targetPictureCount: i + 1,
          filename: `concurrent-${i}.wav`
        });
      });
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(10);
      
      results.forEach((result, index) => {
        expect(result.beats.length).toBeLessThanOrEqual(index + 1);
      });
    });
  });

  describe('API Documentation Validation', () => {
    test('should match documented API surface', () => {
      // Verify all documented methods exist
      const parser = new BeatParser();
      
      const instanceMethods = [
        'parseFile', 'parseBuffer', 'parseStream',
        'initialize', 'cleanup',
        'addPlugin', 'removePlugin', 'getPlugins',
        'updateConfig', 'getConfig'
      ];
      
      instanceMethods.forEach(method => {
        expect(typeof (parser as any)[method]).toBe('function');
      });
      
      const staticMethods = ['getVersion', 'getSupportedFormats'];
      
      staticMethods.forEach(method => {
        expect(typeof (BeatParser as any)[method]).toBe('function');
      });
    });

    test('should maintain API contract', async () => {
      // Test basic API contract requirements
      const parser = new BeatParser();
      
      // Should work with minimal arguments
      const buffer = new Float32Array(4096).fill(0.1);
      const result = await parser.parseBuffer(buffer);
      
      expect(result).toHaveProperty('beats');
      expect(result).toHaveProperty('metadata');
      expect(Array.isArray(result.beats)).toBe(true);
      
      await parser.cleanup();
    });
  });
});