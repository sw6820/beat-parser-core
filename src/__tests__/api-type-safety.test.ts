/**
 * API Type Safety Test Suite
 * 
 * Tests TypeScript interface compliance, generic type parameters,
 * union type handling, and runtime type validation.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import type { 
  Beat, 
  Tempo, 
  ParseOptions, 
  ParseResult, 
  BeatParsingError,
  AudioData,
  AudioBuffer,
  BeatCandidate,
  BeatResult,
  AdvancedParseOptions,
  OnsetDetectionOptions,
  TempoTrackingOptions,
  StreamingOptions,
  AlgorithmConfig,
  Parser,
  WorkerProgressCallback,
  WorkerClientOptions,
  WorkerParseOptions
} from '../types';

describe('API Type Safety', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser();
  });
  
  afterEach(async () => {
    await parser.cleanup();
  });

  describe('Interface Compliance', () => {
    describe('Beat Interface', () => {
      test('should enforce required properties', () => {
        const validBeat: Beat = {
          timestamp: 1000,
          confidence: 0.8,
          strength: 0.6
        };
        
        expect(validBeat.timestamp).toBe(1000);
        expect(validBeat.confidence).toBe(0.8);
        expect(validBeat.strength).toBe(0.6);
      });

      test('should support optional metadata', () => {
        const beatWithMetadata: Beat = {
          timestamp: 1500,
          confidence: 0.9,
          strength: 0.7,
          metadata: {
            algorithmVersion: '1.2.0',
            detectionMethod: 'hybrid',
            customProperty: 'test'
          }
        };
        
        expect(beatWithMetadata.metadata).toBeDefined();
        expect(beatWithMetadata.metadata?.algorithmVersion).toBe('1.2.0');
      });

      test('should validate property types at runtime', async () => {
        const buffer = new Float32Array(4096).fill(0.1);
        const result = await parser.parseBuffer(buffer);
        
        result.beats.forEach(beat => {
          expect(typeof beat.timestamp).toBe('number');
          expect(typeof beat.confidence).toBe('number');
          expect(typeof beat.strength).toBe('number');
          expect(beat.timestamp).toBeGreaterThanOrEqual(0);
          expect(beat.confidence).toBeGreaterThanOrEqual(0);
          expect(beat.confidence).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('Tempo Interface', () => {
      test('should enforce required properties', () => {
        const validTempo: Tempo = {
          bpm: 120,
          confidence: 0.85
        };
        
        expect(validTempo.bpm).toBe(120);
        expect(validTempo.confidence).toBe(0.85);
      });

      test('should support optional timeSignature', () => {
        const tempoWithTimeSignature: Tempo = {
          bpm: 140,
          confidence: 0.9,
          timeSignature: {
            numerator: 4,
            denominator: 4
          }
        };
        
        expect(tempoWithTimeSignature.timeSignature).toBeDefined();
        expect(tempoWithTimeSignature.timeSignature?.numerator).toBe(4);
        expect(tempoWithTimeSignature.timeSignature?.denominator).toBe(4);
      });

      test('should support complex metadata', () => {
        const complexTempo: Tempo = {
          bpm: 128,
          confidence: 0.92,
          metadata: {
            phase: 0.15,
            stability: 0.88,
            alternativeTempos: [
              { bpm: 64, confidence: 0.3 },
              { bpm: 256, confidence: 0.2 }
            ],
            customAnalysis: {
              algorithm: 'autocorrelation',
              windowSize: 1024
            }
          }
        };
        
        expect(complexTempo.metadata?.phase).toBe(0.15);
        expect(complexTempo.metadata?.alternativeTempos).toHaveLength(2);
      });
    });

    describe('ParseOptions Interface', () => {
      test('should accept all optional properties', () => {
        const fullOptions: ParseOptions = {
          minConfidence: 0.7,
          windowSize: 1024,
          hopSize: 256,
          sampleRate: 44100,
          targetPictureCount: 10,
          selectionMethod: 'energy',
          filename: 'test-audio.wav'
        };
        
        expect(fullOptions.minConfidence).toBe(0.7);
        expect(fullOptions.selectionMethod).toBe('energy');
      });

      test('should support partial options', async () => {
        const partialOptions: ParseOptions = {
          targetPictureCount: 5
        };
        
        const buffer = new Float32Array(4096).fill(0.1);
        const result = await parser.parseBuffer(buffer, partialOptions);
        
        expect(result.beats.length).toBeLessThanOrEqual(5);
      });

      test('should enforce union type constraints', () => {
        const validSelectionMethods: ParseOptions['selectionMethod'][] = [
          'uniform', 'adaptive', 'energy', 'regular'
        ];
        
        validSelectionMethods.forEach(method => {
          const options: ParseOptions = {
            selectionMethod: method
          };
          expect(options.selectionMethod).toBe(method);
        });
      });
    });

    describe('ParseResult Interface', () => {
      test('should return properly typed results', async () => {
        const buffer = new Float32Array(4096).fill(0.1);
        const result: ParseResult = await parser.parseBuffer(buffer);
        
        // Required properties
        expect(Array.isArray(result.beats)).toBe(true);
        expect(typeof result.metadata).toBe('object');
        expect(typeof result.metadata.processingTime).toBe('number');
        expect(typeof result.metadata.samplesProcessed).toBe('number');
        expect(typeof result.metadata.parameters).toBe('object');
      });

      test('should include optional tempo information', async () => {
        const buffer = new Float32Array(44100).fill(0.1); // Longer buffer for tempo detection
        // Add some rhythmic pattern
        for (let i = 0; i < buffer.length; i += 22050) { // Every 0.5 seconds
          buffer[i] = 0.8;
        }
        
        const result = await parser.parseBuffer(buffer);
        
        if (result.tempo) {
          expect(typeof result.tempo.bpm).toBe('number');
          expect(typeof result.tempo.confidence).toBe('number');
          expect(result.tempo.bpm).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Generic Type Parameters', () => {
    describe('AudioData Type Union', () => {
      test('should accept Float32Array', async () => {
        const audioData: AudioData = new Float32Array(4096).fill(0.1);
        const result = await parser.parseBuffer(audioData);
        expect(result).toBeDefined();
      });

      test('should accept Float64Array', async () => {
        const audioData: AudioData = new Float64Array(4096).fill(0.1);
        const result = await parser.parseBuffer(audioData as any);
        expect(result).toBeDefined();
      });

      test('should accept number array', async () => {
        const audioData: AudioData = new Array(4096).fill(0.1);
        const result = await parser.parseBuffer(audioData as any);
        expect(result).toBeDefined();
      });
    });

    describe('Plugin Generic Types', () => {
      test('should properly type plugin methods', () => {
        const typedPlugin: BeatParserPlugin = {
          name: 'typed-plugin',
          version: '1.0.0',
          initialize: async (config: BeatParserConfig): Promise<void> => {
            expect(config).toBeDefined();
            expect(typeof config.sampleRate).toBe('number');
          },
          processAudio: async (audioData: Float32Array, config: BeatParserConfig): Promise<Float32Array> => {
            expect(audioData).toBeInstanceOf(Float32Array);
            expect(config).toBeDefined();
            return audioData;
          },
          processBeats: async (beats: BeatCandidate[], config: BeatParserConfig): Promise<BeatCandidate[]> => {
            expect(Array.isArray(beats)).toBe(true);
            expect(config).toBeDefined();
            return beats;
          },
          cleanup: async (): Promise<void> => {
            // Cleanup logic
          }
        };
        
        expect(() => parser.addPlugin(typedPlugin)).not.toThrow();
      });
    });
  });

  describe('Union Type Handling', () => {
    describe('Selection Method Union', () => {
      test('should accept valid selection methods', async () => {
        const buffer = new Float32Array(4096).fill(0.1);
        
        const validMethods: Array<ParseOptions['selectionMethod']> = [
          'uniform', 'adaptive', 'energy', 'regular'
        ];
        
        for (const method of validMethods) {
          if (method) {
            const options: ParseOptions = { selectionMethod: method };
            const result = await parser.parseBuffer(buffer, options);
            expect(result).toBeDefined();
          }
        }
      });

      test('should handle undefined selection method', async () => {
        const buffer = new Float32Array(4096).fill(0.1);
        
        const options: ParseOptions = {
          selectionMethod: undefined
        };
        
        const result = await parser.parseBuffer(buffer, options);
        expect(result).toBeDefined();
      });
    });

    describe('Output Format Union', () => {
      test('should accept valid output formats', () => {
        const validFormats: Array<BeatParserConfig['outputFormat']> = [
          'json', 'xml', 'csv'
        ];
        
        validFormats.forEach(format => {
          if (format) {
            const config: BeatParserConfig = { outputFormat: format };
            expect(() => new BeatParser(config)).not.toThrow();
          }
        });
      });
    });
  });

  describe('Advanced Type Interfaces', () => {
    describe('AdvancedParseOptions', () => {
      test('should extend base ParseOptions', () => {
        const advancedOptions: AdvancedParseOptions = {
          // Base options
          minConfidence: 0.8,
          targetPictureCount: 15,
          
          // Advanced options
          enableAdvancedAnalysis: true,
          includeAnalysisDetails: true,
          onsetOptions: {
            method: 'spectral_flux',
            threshold: 0.1,
            spectralFlux: {
              useLogarithmic: true,
              useFrequencyWeighting: false
            },
            energy: {
              useHighFreqEmphasis: true,
              adaptiveThreshold: true
            }
          },
          tempoOptions: {
            minBpm: 80,
            maxBpm: 180,
            useMultiScale: true,
            detectTempoMultiples: true
          }
        };
        
        expect(advancedOptions.minConfidence).toBe(0.8);
        expect(advancedOptions.enableAdvancedAnalysis).toBe(true);
        expect(advancedOptions.onsetOptions?.method).toBe('spectral_flux');
      });
    });

    describe('OnsetDetectionOptions', () => {
      test('should support all onset detection methods', () => {
        const methods: Array<OnsetDetectionOptions['method']> = [
          'spectral_flux', 'energy', 'complex_domain', 'combined'
        ];
        
        methods.forEach(method => {
          if (method) {
            const options: OnsetDetectionOptions = { method };
            expect(options.method).toBe(method);
          }
        });
      });
    });

    describe('StreamingOptions', () => {
      test('should extend ParseOptions with streaming-specific properties', () => {
        let progressCallCount = 0;
        
        const streamOptions: StreamingOptions = {
          // Base options
          targetPictureCount: 8,
          
          // Streaming options
          chunkSize: 8192,
          overlap: 0.1,
          progressCallback: (progress: number) => {
            progressCallCount++;
            expect(typeof progress).toBe('number');
          }
        };
        
        expect(streamOptions.chunkSize).toBe(8192);
        expect(streamOptions.overlap).toBe(0.1);
        expect(typeof streamOptions.progressCallback).toBe('function');
        
        // Test callback
        if (streamOptions.progressCallback) {
          streamOptions.progressCallback(0.5);
          expect(progressCallCount).toBe(1);
        }
      });
    });
  });

  describe('Worker Type Safety', () => {
    describe('WorkerClientOptions', () => {
      test('should properly type worker options', () => {
        const options: WorkerClientOptions = {
          workerUrl: './custom-worker.js',
          maxRetries: 5,
          retryDelay: 2000,
          timeout: 10000
        };
        
        expect(options.maxRetries).toBe(5);
        expect(typeof options.workerUrl).toBe('string');
      });
    });

    describe('WorkerProgressCallback', () => {
      test('should enforce callback signature', () => {
        let callbackInvoked = false;
        
        const progressCallback: WorkerProgressCallback = (progress) => {
          callbackInvoked = true;
          expect(typeof progress.current).toBe('number');
          expect(typeof progress.total).toBe('number');
          expect(typeof progress.stage).toBe('string');
          expect(typeof progress.percentage).toBe('number');
        };
        
        // Test callback
        progressCallback({
          current: 50,
          total: 100,
          stage: 'processing',
          percentage: 50
        });
        
        expect(callbackInvoked).toBe(true);
      });
    });

    describe('WorkerParseOptions', () => {
      test('should extend ParseOptions with worker-specific properties', () => {
        const workerOptions: WorkerParseOptions = {
          // Base options
          targetPictureCount: 12,
          minConfidence: 0.75,
          
          // Worker-specific
          progressCallback: (progress) => {
            expect(progress.percentage).toBeGreaterThanOrEqual(0);
            expect(progress.percentage).toBeLessThanOrEqual(100);
          }
        };
        
        expect(workerOptions.targetPictureCount).toBe(12);
        expect(typeof workerOptions.progressCallback).toBe('function');
      });
    });
  });

  describe('Algorithm Configuration Types', () => {
    describe('AlgorithmConfig', () => {
      test('should enforce algorithm configuration structure', () => {
        const algorithmConfig: AlgorithmConfig = {
          name: 'hybrid-detector',
          version: '2.1.0',
          parameters: {
            onsetWeight: 0.4,
            tempoWeight: 0.4,
            spectralWeight: 0.2,
            enableAdaptive: true
          },
          enabled: true,
          weight: 1.0
        };
        
        expect(algorithmConfig.name).toBe('hybrid-detector');
        expect(algorithmConfig.parameters.onsetWeight).toBe(0.4);
        expect(algorithmConfig.enabled).toBe(true);
      });
    });
  });

  describe('Runtime Type Validation', () => {
    test('should validate return type structure at runtime', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      const result = await parser.parseBuffer(buffer);
      
      // Structural validation
      expect(result).toHaveProperty('beats');
      expect(result).toHaveProperty('metadata');
      
      // Type validation
      expect(Array.isArray(result.beats)).toBe(true);
      expect(typeof result.metadata).toBe('object');
      expect(result.metadata).not.toBeNull();
      
      // Deep type validation
      result.beats.forEach(beat => {
        expect(beat).toHaveProperty('timestamp');
        expect(beat).toHaveProperty('confidence');
        expect(beat).toHaveProperty('strength');
        
        expect(typeof beat.timestamp).toBe('number');
        expect(typeof beat.confidence).toBe('number');
        expect(typeof beat.strength).toBe('number');
      });
    });

    test('should validate configuration types at runtime', () => {
      const config = parser.getConfig();
      
      const numericFields = [
        'sampleRate', 'hopSize', 'frameSize', 'minTempo', 'maxTempo',
        'onsetWeight', 'tempoWeight', 'spectralWeight', 'confidenceThreshold'
      ];
      
      const booleanFields = [
        'multiPassEnabled', 'genreAdaptive', 'enablePreprocessing',
        'enableNormalization', 'enableFiltering', 'includeMetadata',
        'includeConfidenceScores'
      ];
      
      numericFields.forEach(field => {
        expect(typeof config[field as keyof typeof config]).toBe('number');
      });
      
      booleanFields.forEach(field => {
        expect(typeof config[field as keyof typeof config]).toBe('boolean');
      });
      
      expect(typeof config.outputFormat).toBe('string');
      expect(Array.isArray(config.plugins)).toBe(true);
    });

    test('should validate plugin interface compliance', async () => {
      const validatedPlugin: BeatParserPlugin = {
        name: 'validation-test',
        version: '1.0.0',
        initialize: async (config) => {
          expect(typeof config).toBe('object');
          expect(typeof config.sampleRate).toBe('number');
        },
        processAudio: async (audioData) => {
          expect(audioData).toBeInstanceOf(Float32Array);
          return audioData;
        },
        processBeats: async (beats) => {
          expect(Array.isArray(beats)).toBe(true);
          beats.forEach(beat => {
            expect(typeof beat.timestamp).toBe('number');
            expect(typeof beat.confidence).toBe('number');
          });
          return beats;
        }
      };
      
      parser.addPlugin(validatedPlugin);
      
      const buffer = new Float32Array(4096).fill(0.1);
      const result = await parser.parseBuffer(buffer);
      
      expect(result).toBeDefined();
    });
  });

  describe('Type Inference', () => {
    test('should properly infer return types', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      
      // TypeScript should infer ParseResult type
      const result = await parser.parseBuffer(buffer);
      
      // These operations should be type-safe
      const beatCount = result.beats.length;
      const firstBeat = result.beats[0];
      const processingTime = result.metadata.processingTime;
      
      expect(typeof beatCount).toBe('number');
      expect(typeof processingTime).toBe('number');
      
      if (firstBeat) {
        expect(typeof firstBeat.timestamp).toBe('number');
      }
    });

    test('should infer plugin method types correctly', () => {
      const inferenceTestPlugin: BeatParserPlugin = {
        name: 'inference-test',
        version: '1.0.0',
        processAudio: async (audioData) => {
          // TypeScript should infer audioData as Float32Array
          const length = audioData.length;
          const sample = audioData[0];
          
          expect(typeof length).toBe('number');
          expect(typeof sample).toBe('number');
          
          return audioData;
        },
        processBeats: async (beats) => {
          // TypeScript should infer beats as BeatCandidate[]
          if (beats.length > 0) {
            const firstBeat = beats[0];
            const timestamp = firstBeat.timestamp;
            
            expect(typeof timestamp).toBe('number');
          }
          
          return beats;
        }
      };
      
      expect(() => parser.addPlugin(inferenceTestPlugin)).not.toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain interface stability', () => {
      // Test that interfaces haven't changed breaking ways
      const beat: Beat = {
        timestamp: 1000,
        confidence: 0.8,
        strength: 0.6
      };
      
      const parseOptions: ParseOptions = {
        targetPictureCount: 5
      };
      
      const config: BeatParserConfig = {
        sampleRate: 44100
      };
      
      // These should compile and work
      expect(beat.timestamp).toBe(1000);
      expect(parseOptions.targetPictureCount).toBe(5);
      expect(config.sampleRate).toBe(44100);
    });
  });

  describe('Edge Case Type Handling', () => {
    test('should handle optional chaining safely', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      const result = await parser.parseBuffer(buffer);
      
      // Optional chaining should be safe
      const tempoBpm = result.tempo?.bpm;
      const timeSignature = result.tempo?.timeSignature?.numerator;
      const metadata = result.tempo?.metadata?.phase;
      
      // These should not throw even if undefined
      expect(typeof tempoBpm === 'number' || tempoBpm === undefined).toBe(true);
      expect(typeof timeSignature === 'number' || timeSignature === undefined).toBe(true);
      expect(typeof metadata === 'number' || metadata === undefined).toBe(true);
    });

    test('should handle complex metadata types', async () => {
      const buffer = new Float32Array(4096).fill(0.1);
      const result = await parser.parseBuffer(buffer);
      
      // Metadata should handle unknown types safely
      const additionalData = result.metadata['customField'];
      expect(additionalData === undefined || typeof additionalData === 'object').toBe(true);
      
      // Parameters should be accessible
      expect(result.metadata.parameters).toBeDefined();
      expect(typeof result.metadata.parameters).toBe('object');
    });
  });
});