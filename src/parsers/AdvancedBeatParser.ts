/**
 * AdvancedBeatParser - Comprehensive beat parser implementation
 * Demonstrates the use of all core audio processing and beat detection modules
 */

import type { 
  AudioData, 
  ParseOptions, 
  ParseResult, 
  Beat,
  Tempo,
  OnsetDetectionOptions,
  TempoTrackingOptions,
  BeatSelection,
  OutputFormat
} from '../types';
import { BaseParser } from '../core/BaseParser';
import { AudioProcessor } from '../core/AudioProcessor';
import { BeatSelector } from '../core/BeatSelector';
import { OutputFormatter } from '../core/OutputFormatter';
import { OnsetDetection } from '../algorithms/OnsetDetection';
import { TempoTracking } from '../algorithms/TempoTracking';

export interface AdvancedParseOptions extends ParseOptions {
  /** Options for onset detection */
  onsetDetection?: OnsetDetectionOptions;
  /** Options for tempo tracking */
  tempoTracking?: TempoTrackingOptions;
  /** Options for beat selection */
  beatSelection?: BeatSelection;
  /** Options for output formatting */
  outputFormat?: OutputFormat;
  /** Whether to apply audio preprocessing */
  preprocessAudio?: boolean;
  /** High-pass filter cutoff frequency for preprocessing */
  highPassCutoff?: number;
}

export class AdvancedBeatParser extends BaseParser {
  private readonly defaultOptions: Required<AdvancedParseOptions> = {
    minConfidence: 0.3,
    windowSize: 1024,
    hopSize: 512,
    sampleRate: 44100,
    onsetDetection: {
      method: 'combined',
      windowSize: 1024,
      hopSize: 512,
      threshold: 0.3,
      minInterval: 0.05
    },
    tempoTracking: {
      minBpm: 60,
      maxBpm: 200,
      windowSize: 10.0,
      useDynamicProgramming: true
    },
    beatSelection: {
      strategy: 'adaptive',
      count: 16,
      energyWeight: 0.3,
      regularityWeight: 0.3,
      musicalWeight: 0.4
    },
    outputFormat: {
      includeConfidence: true,
      includeStrength: true,
      includeMetadata: true,
      precision: 3
    },
    preprocessAudio: true,
    highPassCutoff: 80.0
  };

  constructor() {
    super('AdvancedBeatParser', '1.0.0');
  }

  /**
   * Advanced beat parsing with full audio processing pipeline
   */
  async parse(
    audioData: AudioData,
    options: AdvancedParseOptions = {}
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const { data, options: validatedOptions } = this.validateAndPrepareData(
      audioData,
      options
    );

    // Merge with advanced options
    const opts = { ...this.defaultOptions, ...validatedOptions, ...options };

    try {
      // Step 1: Preprocess audio if requested
      let processedAudio = data;
      if (opts.preprocessAudio) {
        processedAudio = this.preprocessAudio(data, opts);
      }

      // Step 2: Detect onsets
      const onsets = OnsetDetection.detectOnsets(
        processedAudio,
        opts.sampleRate,
        opts.onsetDetection
      );

      // Step 3: Post-process onsets to refine timing
      const refinedOnsets = OnsetDetection.postProcessOnsets(
        onsets,
        processedAudio,
        opts.sampleRate
      );

      // Step 4: Detect tempo
      const tempo = TempoTracking.detectTempo(
        processedAudio,
        opts.sampleRate,
        opts.tempoTracking
      );

      // Step 5: Track beats using dynamic programming
      const audioDuration = processedAudio.length / opts.sampleRate;
      const allBeats = TempoTracking.trackBeats(
        refinedOnsets,
        tempo,
        audioDuration,
        opts.tempoTracking
      );

      // Step 6: Select optimal beats
      const selectedBeats = BeatSelector.selectBeats(
        allBeats,
        opts.beatSelection,
        tempo,
        audioDuration
      );

      // Step 7: Create base result
      const metadata = this.createMetadata(startTime, data.length, opts);
      const baseResult: ParseResult = {
        beats: selectedBeats,
        tempo,
        metadata
      };

      // Step 8: Format output (optional - can be done separately)
      if (opts.outputFormat) {
        const formattedResult = OutputFormatter.formatResult(
          baseResult,
          selectedBeats,
          opts.outputFormat,
          this.getVersion()
        );

        // Add formatted result to metadata for reference
        baseResult.metadata = {
          ...baseResult.metadata,
          formattedResult
        };
      }

      return baseResult;

    } catch (error) {
      // Return empty result with error information
      const metadata = this.createMetadata(startTime, data.length, opts);
      return {
        beats: [],
        metadata: {
          ...metadata,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Parse audio with specific beat count requirement
   */
  async parseWithBeatCount(
    audioData: AudioData,
    beatCount: number,
    options: Omit<AdvancedParseOptions, 'beatSelection'> = {}
  ): Promise<ParseResult> {
    const beatSelection: BeatSelection = {
      strategy: 'adaptive',
      count: beatCount,
      energyWeight: 0.3,
      regularityWeight: 0.3,
      musicalWeight: 0.4
    };

    return this.parse(audioData, { ...options, beatSelection });
  }

  /**
   * Parse audio optimized for specific genre characteristics
   */
  async parseForGenre(
    audioData: AudioData,
    genre: 'electronic' | 'rock' | 'jazz' | 'classical' | 'hip-hop',
    options: AdvancedParseOptions = {}
  ): Promise<ParseResult> {
    const genreOptions = this.getGenreOptimizedOptions(genre);
    const mergedOptions = this.mergeOptions(genreOptions, options);
    
    return this.parse(audioData, mergedOptions);
  }

  /**
   * Analyze audio without beat selection (returns all detected beats)
   */
  async analyzeBeats(
    audioData: AudioData,
    options: Omit<AdvancedParseOptions, 'beatSelection'> = {}
  ): Promise<{
    allBeats: Beat[];
    tempo: Tempo;
    onsetCount: number;
    analysis: {
      beatDensity: number;
      averageConfidence: number;
      tempoStability: number;
    };
  }> {
    const analysisOptions: AdvancedParseOptions = {
      ...options,
      beatSelection: { strategy: 'energy', count: 1000 } // Get all beats
    };

    const result = await this.parse(audioData, analysisOptions);
    
    // Calculate additional analysis metrics
    const beatDensity = result.beats.length > 0 ? 
      result.beats.length / (result.beats[result.beats.length - 1].timestamp / 1000) : 0;
    
    const averageConfidence = result.beats.length > 0 ?
      result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length : 0;

    // Analyze tempo stability
    const tempoStability = result.tempo ? 
      TempoTracking.analyzeBeatConsistency(result.beats).consistency : 0;

    return {
      allBeats: result.beats,
      tempo: result.tempo || { bpm: 0, confidence: 0 },
      onsetCount: result.beats.length,
      analysis: {
        beatDensity,
        averageConfidence,
        tempoStability
      }
    };
  }

  /**
   * Preprocess audio data
   */
  private preprocessAudio(
    audioData: Float32Array,
    options: Required<AdvancedParseOptions>
  ): Float32Array {
    let processed = audioData;

    // Apply high-pass filter to remove low-frequency noise
    if (options.highPassCutoff > 0) {
      processed = AudioProcessor.applyFilter(
        processed,
        { type: 'highpass', cutoff: options.highPassCutoff },
        options.sampleRate
      );
    }

    // Normalize audio
    const maxAmplitude = Math.max(...Array.from(processed).map(Math.abs));
    if (maxAmplitude > 0 && maxAmplitude !== 1) {
      processed = processed.map(sample => sample / maxAmplitude) as Float32Array;
    }

    return processed;
  }

  /**
   * Get genre-optimized options
   */
  private getGenreOptimizedOptions(
    genre: 'electronic' | 'rock' | 'jazz' | 'classical' | 'hip-hop'
  ): Partial<AdvancedParseOptions> {
    switch (genre) {
      case 'electronic':
        return {
          onsetDetection: {
            method: 'energy',
            threshold: 0.25,
            minInterval: 0.03
          },
          tempoTracking: {
            minBpm: 100,
            maxBpm: 180,
            useDynamicProgramming: true
          },
          beatSelection: {
            strategy: 'regular',
            count: 16,
            energyWeight: 0.5,
            regularityWeight: 0.4,
            musicalWeight: 0.1
          }
        };

      case 'rock':
        return {
          onsetDetection: {
            method: 'spectral_flux',
            threshold: 0.35,
            minInterval: 0.04
          },
          tempoTracking: {
            minBpm: 80,
            maxBpm: 160,
            useDynamicProgramming: true
          },
          beatSelection: {
            strategy: 'musical',
            count: 16,
            energyWeight: 0.4,
            regularityWeight: 0.3,
            musicalWeight: 0.3
          }
        };

      case 'jazz':
        return {
          onsetDetection: {
            method: 'combined',
            threshold: 0.4,
            minInterval: 0.06
          },
          tempoTracking: {
            minBpm: 60,
            maxBpm: 200,
            useDynamicProgramming: false // Less rigid for swing rhythms
          },
          beatSelection: {
            strategy: 'adaptive',
            count: 12,
            energyWeight: 0.2,
            regularityWeight: 0.2,
            musicalWeight: 0.6
          }
        };

      case 'classical':
        return {
          onsetDetection: {
            method: 'complex_domain',
            threshold: 0.5,
            minInterval: 0.08
          },
          tempoTracking: {
            minBpm: 40,
            maxBpm: 180,
            windowSize: 15.0, // Longer window for tempo changes
            useDynamicProgramming: true
          },
          beatSelection: {
            strategy: 'musical',
            count: 8,
            energyWeight: 0.1,
            regularityWeight: 0.3,
            musicalWeight: 0.6
          }
        };

      case 'hip-hop':
        return {
          onsetDetection: {
            method: 'energy',
            threshold: 0.3,
            minInterval: 0.04
          },
          tempoTracking: {
            minBpm: 70,
            maxBpm: 140,
            useDynamicProgramming: true
          },
          beatSelection: {
            strategy: 'regular',
            count: 16,
            energyWeight: 0.4,
            regularityWeight: 0.5,
            musicalWeight: 0.1
          },
          highPassCutoff: 60.0 // Lower cutoff to preserve kick drums
        };

      default:
        return {};
    }
  }

  /**
   * Merge options with proper precedence
   */
  private mergeOptions(
    baseOptions: Partial<AdvancedParseOptions>,
    userOptions: AdvancedParseOptions
  ): AdvancedParseOptions {
    return {
      ...baseOptions,
      ...userOptions,
      onsetDetection: {
        ...baseOptions.onsetDetection,
        ...userOptions.onsetDetection
      },
      tempoTracking: {
        ...baseOptions.tempoTracking,
        ...userOptions.tempoTracking
      },
      beatSelection: {
        ...baseOptions.beatSelection,
        ...userOptions.beatSelection
      },
      outputFormat: {
        ...baseOptions.outputFormat,
        ...userOptions.outputFormat
      }
    };
  }
}