/**
 * Main BeatParser class - entry point for beat parsing functionality
 * Provides simple API for basic usage and advanced configuration options
 */

import fs from 'fs/promises';
import path from 'path';
import { AudioProcessor } from './AudioProcessor';
import { HybridDetector, HybridDetectorConfig } from '../algorithms/HybridDetector';
import { BeatSelector } from './BeatSelector';
import { OutputFormatter } from './OutputFormatter';
import type { 
  AudioData, 
  ParseOptions, 
  ParseResult, 
  BeatConfig,
  BeatCandidate,
  AudioFeatures
} from '../types';

export interface BeatParserConfig extends HybridDetectorConfig {
  // Audio processing options
  enablePreprocessing?: boolean;
  enableNormalization?: boolean;
  enableFiltering?: boolean;
  
  // Output options
  outputFormat?: 'json' | 'xml' | 'csv';
  includeMetadata?: boolean;
  includeConfidenceScores?: boolean;
  
  // Plugin system
  plugins?: BeatParserPlugin[];
}

export interface BeatParserPlugin {
  name: string;
  version: string;
  initialize?(config: BeatParserConfig): Promise<void> | void;
  processAudio?(audioData: Float32Array, config: BeatParserConfig): Promise<Float32Array> | Float32Array;
  processBeats?(beats: BeatCandidate[], config: BeatParserConfig): Promise<BeatCandidate[]> | BeatCandidate[];
  cleanup?(): Promise<void> | void;
}

export interface StreamingOptions extends ParseOptions {
  chunkSize?: number;
  overlap?: number;
  progressCallback?: (progress: number) => void;
}

export class BeatParser {
  private config: Required<BeatParserConfig>;
  private audioProcessor: AudioProcessor;
  private hybridDetector: HybridDetector;
  private beatSelector: BeatSelector;
  private outputFormatter: OutputFormatter;
  private plugins: BeatParserPlugin[];
  private initialized: boolean = false;

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<BeatParserConfig> = {
    sampleRate: 44100,
    hopSize: 512,
    frameSize: 2048,
    minTempo: 60,
    maxTempo: 200,
    onsetWeight: 0.4,
    tempoWeight: 0.4,
    spectralWeight: 0.2,
    multiPassEnabled: true,
    genreAdaptive: true,
    confidenceThreshold: 0.6,
    enablePreprocessing: true,
    enableNormalization: true,
    enableFiltering: false,
    outputFormat: 'json',
    includeMetadata: true,
    includeConfidenceScores: true,
    plugins: []
  };

  /**
   * Create a new BeatParser instance
   * @param config - Configuration options
   */
  constructor(config: BeatParserConfig = {}) {
    this.config = { ...BeatParser.DEFAULT_CONFIG, ...config };
    this.plugins = [...this.config.plugins];
    
    this.audioProcessor = new AudioProcessor({
      sampleRate: this.config.sampleRate,
      enableNormalization: this.config.enableNormalization,
      enableFiltering: this.config.enableFiltering
    });
    
    this.hybridDetector = new HybridDetector(this.config);
    this.beatSelector = new BeatSelector();
    this.outputFormatter = new OutputFormatter();
  }

  /**
   * Initialize the parser and all plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Initialize plugins
      for (const plugin of this.plugins) {
        if (plugin.initialize) {
          await plugin.initialize(this.config);
        }
      }
      
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize BeatParser: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse audio file from filesystem
   * @param filePath - Path to audio file
   * @param options - Parsing options
   * @returns Promise resolving to parse results
   */
  async parseFile(filePath: string, options: ParseOptions = {}): Promise<ParseResult> {
    if (!await this.fileExists(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const extension = path.extname(filePath).toLowerCase();
    const supportedFormats = ['.wav', '.mp3', '.flac', '.ogg', '.m4a'];
    
    if (!supportedFormats.includes(extension)) {
      throw new Error(`Unsupported audio format: ${extension}. Supported formats: ${supportedFormats.join(', ')}`);
    }

    try {
      await this.initialize();
      
      // Load and process audio file
      const audioBuffer = await this.audioProcessor.loadFile(filePath);
      
      return await this.parseBuffer(audioBuffer, {
        ...options,
        filename: path.basename(filePath)
      });
    } catch (error) {
      throw new Error(`Failed to parse file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse audio data from buffer
   * @param audioData - Audio data as Float32Array or Buffer
   * @param options - Parsing options
   * @returns Promise resolving to parse results
   */
  async parseBuffer(audioData: Float32Array | Buffer, options: ParseOptions = {}): Promise<ParseResult> {
    const startTime = Date.now();
    try {
      await this.initialize();
      
      // Convert buffer to Float32Array if needed
      let processedAudio: Float32Array;
      if (audioData instanceof Buffer) {
        processedAudio = await this.audioProcessor.processBuffer(audioData);
      } else {
        processedAudio = audioData;
      }

      // Validate audio data
      this.validateAudioData(processedAudio);

      // Apply preprocessing if enabled
      if (this.config.enablePreprocessing) {
        processedAudio = await this.preprocessAudio(processedAudio);
      }

      // Apply plugin audio processing
      processedAudio = await this.applyAudioPlugins(processedAudio);

      // Detect beats using hybrid approach
      let beats = await this.hybridDetector.detectBeats(processedAudio);

      // Apply plugin beat processing
      beats = await this.applyBeatPlugins(beats);

      // Select final beats based on options
      const selectedBeats = await this.beatSelector.selectBeats(beats, {
        targetCount: options.targetPictureCount,
        selectionMethod: options.selectionMethod || 'adaptive',
        qualityThreshold: this.config.confidenceThreshold
      });

      // Create ParseResult
      const result: ParseResult = {
        beats: selectedBeats,
        tempo: undefined, // TODO: Extract tempo from hybrid detector
        metadata: {
          processingTime: Date.now() - startTime,
          samplesProcessed: processedAudio.length,
          parameters: options,
          audioLength: processedAudio.length / this.config.sampleRate,
          sampleRate: this.config.sampleRate,
          algorithmsUsed: ['hybrid'],
          pluginsUsed: this.plugins.map(p => ({ name: p.name, version: p.version }))
        }
      };

      return result;
    } catch (error) {
      throw new Error(`Failed to parse audio buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse audio stream (for real-time processing)
   * @param audioStream - Stream of audio data
   * @param options - Streaming options
   * @returns Promise resolving to parse results
   */
  async parseStream(
    audioStream: ReadableStream<Float32Array> | AsyncIterableIterator<Float32Array>,
    options: StreamingOptions = {}
  ): Promise<ParseResult> {
    const startTime = Date.now();
    try {
      await this.initialize();
      
      const chunkSize = options.chunkSize || this.config.sampleRate; // 1 second chunks
      const overlap = options.overlap || 0.1; // 10% overlap
      const overlapSamples = Math.floor(chunkSize * overlap);
      
      const allBeats: BeatCandidate[] = [];
      const audioChunks: Float32Array[] = [];
      let processedSamples = 0;
      let timeOffset = 0;
      let previousChunk: Float32Array | null = null;

      // Process stream chunks
      const reader = 'getReader' in audioStream 
        ? audioStream.getReader() 
        : audioStream;

      if ('getReader' in reader) {
        // ReadableStream
        while (true) {
          const { done, value } = await (reader as ReadableStreamDefaultReader<Float32Array>).read();
          if (done) break;
          
          const chunk = await this.processStreamChunk(
            value, 
            previousChunk, 
            overlapSamples, 
            timeOffset
          );
          
          allBeats.push(...chunk.beats);
          audioChunks.push(chunk.audio);
          
          processedSamples += value.length;
          timeOffset = processedSamples / this.config.sampleRate;
          previousChunk = value;
          
          // Report progress
          if (options.progressCallback) {
            options.progressCallback(processedSamples);
          }
        }
      } else {
        // AsyncIterableIterator
        for await (const chunk of reader as AsyncIterableIterator<Float32Array>) {
          const processedChunk = await this.processStreamChunk(
            chunk,
            previousChunk,
            overlapSamples,
            timeOffset
          );
          
          allBeats.push(...processedChunk.beats);
          audioChunks.push(processedChunk.audio);
          
          processedSamples += chunk.length;
          timeOffset = processedSamples / this.config.sampleRate;
          previousChunk = chunk;
          
          if (options.progressCallback) {
            options.progressCallback(processedSamples);
          }
        }
      }

      // Combine all audio for final processing
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedAudio = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        combinedAudio.set(chunk, offset);
        offset += chunk.length;
      }

      // Remove duplicate beats from overlapping regions
      const dedupedBeats = this.removeDuplicateBeats(allBeats);
      
      // Apply plugin beat processing
      const processedBeats = await this.applyBeatPlugins(dedupedBeats);

      // Select and format final results
      const selectedBeats = await this.beatSelector.selectBeats(processedBeats, {
        targetCount: options.targetPictureCount,
        selectionMethod: options.selectionMethod || 'adaptive',
        qualityThreshold: this.config.confidenceThreshold
      });

      // Create ParseResult
      const result: ParseResult = {
        beats: selectedBeats,
        tempo: undefined, // TODO: Extract tempo from hybrid detector
        metadata: {
          processingTime: Date.now() - startTime,
          samplesProcessed: combinedAudio.length,
          parameters: options,
          audioLength: combinedAudio.length / this.config.sampleRate,
          sampleRate: this.config.sampleRate,
          algorithmsUsed: ['hybrid', 'streaming'],
          pluginsUsed: this.plugins.map(p => ({ name: p.name, version: p.version })),
          chunksProcessed: audioChunks.length
        }
      };

      return result;
    } catch (error) {
      throw new Error(`Failed to parse audio stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a plugin to the parser
   * @param plugin - Plugin to add
   */
  addPlugin(plugin: BeatParserPlugin): void {
    if (this.initialized) {
      throw new Error('Cannot add plugins after parser initialization. Add plugins before calling any parse methods.');
    }
    
    // Check for duplicate plugin names
    if (this.plugins.some(p => p.name === plugin.name)) {
      throw new Error(`Plugin with name '${plugin.name}' is already registered`);
    }
    
    this.plugins.push(plugin);
    this.config.plugins.push(plugin);
  }

  /**
   * Remove a plugin by name
   * @param pluginName - Name of plugin to remove
   */
  removePlugin(pluginName: string): void {
    if (this.initialized) {
      throw new Error('Cannot remove plugins after parser initialization');
    }
    
    this.plugins = this.plugins.filter(p => p.name !== pluginName);
    this.config.plugins = this.config.plugins.filter(p => p.name !== pluginName);
  }

  /**
   * Get list of registered plugins
   */
  getPlugins(): Array<{ name: string; version: string }> {
    return this.plugins.map(p => ({ name: p.name, version: p.version }));
  }

  /**
   * Update configuration
   * @param newConfig - New configuration options
   */
  updateConfig(newConfig: Partial<BeatParserConfig>): void {
    if (this.initialized) {
      throw new Error('Cannot update configuration after parser initialization');
    }
    
    this.config = { ...this.config, ...newConfig };
    
    // Update component configurations
    this.hybridDetector = new HybridDetector(this.config);
    this.audioProcessor = new AudioProcessor({
      sampleRate: this.config.sampleRate,
      enableNormalization: this.config.enableNormalization,
      enableFiltering: this.config.enableFiltering
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<BeatParserConfig> {
    return { ...this.config };
  }

  /**
   * Get version information
   */
  static getVersion(): string {
    return '1.0.0';
  }

  /**
   * Get supported audio formats
   */
  static getSupportedFormats(): string[] {
    return ['.wav', '.mp3', '.flac', '.ogg', '.m4a'];
  }

  /**
   * Cleanup resources and plugins
   */
  async cleanup(): Promise<void> {
    try {
      // Cleanup plugins
      for (const plugin of this.plugins) {
        if (plugin.cleanup) {
          await plugin.cleanup();
        }
      }
      
      this.initialized = false;
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }

  // Private methods

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private validateAudioData(audioData: Float32Array): void {
    if (!audioData || audioData.length === 0) {
      throw new Error('Invalid or empty audio data provided');
    }
    
    if (audioData.length < this.config.frameSize) {
      throw new Error(`Audio data too short. Minimum length: ${this.config.frameSize} samples`);
    }
    
    // Check for NaN or infinite values
    for (let i = 0; i < Math.min(audioData.length, 1000); i++) {
      if (!isFinite(audioData[i])) {
        throw new Error('Audio data contains invalid values (NaN or Infinity)');
      }
    }
  }

  private async preprocessAudio(audioData: Float32Array): Promise<Float32Array> {
    // Apply basic preprocessing
    let processed = audioData;
    
    if (this.config.enableNormalization) {
      processed = await this.audioProcessor.normalize(processed);
    }
    
    if (this.config.enableFiltering) {
      processed = await this.audioProcessor.applyFilters(processed);
    }
    
    return processed;
  }

  private async applyAudioPlugins(audioData: Float32Array): Promise<Float32Array> {
    let processed = audioData;
    
    for (const plugin of this.plugins) {
      if (plugin.processAudio) {
        processed = await plugin.processAudio(processed, this.config);
      }
    }
    
    return processed;
  }

  private async applyBeatPlugins(beats: BeatCandidate[]): Promise<BeatCandidate[]> {
    let processed = beats;
    
    for (const plugin of this.plugins) {
      if (plugin.processBeats) {
        processed = await plugin.processBeats(processed, this.config);
      }
    }
    
    return processed;
  }

  private async processStreamChunk(
    chunk: Float32Array,
    previousChunk: Float32Array | null,
    overlapSamples: number,
    timeOffset: number
  ): Promise<{ beats: BeatCandidate[]; audio: Float32Array }> {
    let processAudio = chunk;
    
    // Add overlap from previous chunk if available
    if (previousChunk && overlapSamples > 0) {
      const overlapStart = Math.max(0, previousChunk.length - overlapSamples);
      const overlap = previousChunk.slice(overlapStart);
      
      const combined = new Float32Array(overlap.length + chunk.length);
      combined.set(overlap);
      combined.set(chunk, overlap.length);
      
      processAudio = combined;
    }
    
    // Process chunk
    const processedAudio = await this.preprocessAudio(processAudio);
    const pluginProcessed = await this.applyAudioPlugins(processedAudio);
    
    // Detect beats
    const rawBeats = await this.hybridDetector.detectBeats(pluginProcessed);
    
    // Adjust timestamps for time offset
    const adjustedBeats = rawBeats.map(beat => ({
      ...beat,
      timestamp: beat.timestamp + timeOffset
    }));
    
    return {
      beats: adjustedBeats,
      audio: chunk // Return original chunk for combining
    };
  }

  private removeDuplicateBeats(beats: BeatCandidate[]): BeatCandidate[] {
    const sortedBeats = beats.sort((a, b) => a.timestamp - b.timestamp);
    const deduped: BeatCandidate[] = [];
    const minInterval = 0.05; // 50ms minimum interval
    
    for (const beat of sortedBeats) {
      if (deduped.length === 0 || 
          beat.timestamp - deduped[deduped.length - 1].timestamp >= minInterval) {
        deduped.push(beat);
      } else {
        // Keep the beat with higher confidence
        const lastBeat = deduped[deduped.length - 1];
        if (beat.confidence > lastBeat.confidence) {
          deduped[deduped.length - 1] = beat;
        }
      }
    }
    
    return deduped;
  }
}
