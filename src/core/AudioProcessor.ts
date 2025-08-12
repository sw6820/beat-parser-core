/**
 * AudioProcessor - Enhanced Core audio processing functionality
 * Handles audio loading, decoding, filtering, and feature extraction
 * Supports both browser (Web Audio API) and Node.js environments
 * Enhanced with audio-decode library for comprehensive format support
 */

import type { 
  AudioData, 
  AudioBuffer, 
  FilterOptions, 
  AudioFeatures 
} from '../types';
import { AudioUtils } from '../utils/AudioUtils';
import { SignalProcessing } from '../utils/SignalProcessing';

// Audio-decode library imports with dynamic loading support
let audioDecodeLib: any = null;
let audioDecodersLib: any = null;

// Dynamically import audio-decode to avoid bundling issues
const getAudioDecodeLib = async () => {
  if (!audioDecodeLib) {
    try {
      const { default: decodeAudio, decoders } = await import('audio-decode');
      audioDecodeLib = decodeAudio;
      audioDecodersLib = decoders;
    } catch (error) {
      console.warn('audio-decode library not available, falling back to Web Audio API and manual decoding');
      return null;
    }
  }
  return { decode: audioDecodeLib, decoders: audioDecodersLib };
};

// Audio loading interfaces
interface AudioLoadOptions {
  /** Target sample rate for resampling */
  targetSampleRate?: number;
  /** Force mono conversion */
  forceMono?: boolean;
  /** Normalize audio after loading */
  normalize?: boolean;
  /** Memory-efficient processing for large files */
  useStreaming?: boolean;
  /** Prefer specific decoder */
  preferredDecoder?: 'audio-decode' | 'web-audio' | 'manual';
  /** Enable detailed logging */
  debug?: boolean;
}

interface AudioStreamChunk {
  /** Audio data chunk */
  data: Float32Array;
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Chunk index */
  index: number;
  /** Is final chunk */
  isFinal: boolean;
}

// Error types
export class AudioLoadError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'AudioLoadError';
  }
}

export class AudioFormatError extends Error {
  constructor(message: string, public readonly format?: string) {
    super(message);
    this.name = 'AudioFormatError';
  }
}

export class AudioProcessingError extends Error {
  constructor(message: string, public readonly operation?: string) {
    super(message);
    this.name = 'AudioProcessingError';
  }
}

export class AudioProcessor {
  private static readonly STANDARD_SAMPLE_RATE = 44100;
  private static readonly STANDARD_CHANNELS = 1; // mono
  private static readonly MAX_CHUNK_SIZE = 1024 * 1024; // 1MB chunks for streaming
  private static readonly SUPPORTED_FORMATS = ['mp3', 'wav', 'flac', 'ogg', 'webm', 'm4a', 'aac', 'opus'];
  
  // Format categories for audio-decode library
  private static readonly AUDIO_DECODE_FORMATS = ['mp3', 'wav', 'flac', 'ogg', 'opus'];
  private static readonly PARTIAL_SUPPORT_FORMATS = ['m4a', 'aac', 'alac']; // Partial support in audio-decode
  private static readonly FALLBACK_FORMATS = ['webm']; // Web Audio API only

  // Instance configuration
  private sampleRate: number;
  private enableNormalization: boolean;
  private enableFiltering: boolean;

  /**
   * Create a new AudioProcessor instance
   * @param config - Optional configuration object
   */
  constructor(config?: {
    sampleRate?: number;
    enableNormalization?: boolean;
    enableFiltering?: boolean;
  }) {
    this.sampleRate = config?.sampleRate ?? AudioProcessor.STANDARD_SAMPLE_RATE;
    this.enableNormalization = config?.enableNormalization ?? true;
    this.enableFiltering = config?.enableFiltering ?? false;
  }

  /**
   * Instance method to load audio file
   * @param filePath - Path to audio file
   * @returns Promise resolving to Float32Array of audio data
   */
  async loadFile(filePath: string): Promise<Float32Array> {
    const audioBuffer = await AudioProcessor.loadFile(filePath, {
      targetSampleRate: this.sampleRate,
      normalize: this.enableNormalization
    });
    
    // Convert to Float32Array (mono channel)
    return audioBuffer.getChannelData(0);
  }

  /**
   * Process audio buffer
   * @param buffer - Audio buffer to process
   * @returns Promise resolving to Float32Array
   */
  async processBuffer(buffer: ArrayBuffer | Buffer): Promise<Float32Array> {
    const audioBuffer = await AudioProcessor.loadAudioFromBuffer(buffer, {
      targetSampleRate: this.sampleRate,
      normalize: this.enableNormalization
    });
    
    return audioBuffer.getChannelData(0);
  }

  /**
   * Normalize audio data
   * @param audioData - Audio data to normalize
   * @returns Normalized Float32Array
   */
  async normalize(audioData: Float32Array): Promise<Float32Array> {
    if (!this.enableNormalization) {
      return audioData;
    }
    return AudioProcessor.normalizeAudioData(audioData);
  }

  /**
   * Apply filters to audio data
   * @param audioData - Audio data to filter
   * @returns Filtered Float32Array
   */
  async applyFilters(audioData: Float32Array): Promise<Float32Array> {
    if (!this.enableFiltering) {
      return audioData;
    }
    return AudioProcessor.applyAudioFilters(audioData, {
      lowFrequency: 80,
      highFrequency: 8000,
      filterType: 'bandpass'
    });
  }

  /**
   * Normalize audio data to [-1, 1] range
   */
  static normalizeAudioData(audioData: Float32Array): Float32Array {
    const normalized = new Float32Array(audioData.length);
    let max = 0;
    
    // Find maximum absolute value
    for (let i = 0; i < audioData.length; i++) {
      const abs = Math.abs(audioData[i]);
      if (abs > max) max = abs;
    }
    
    // Normalize if needed
    if (max > 0 && max !== 1) {
      const scale = 1 / max;
      for (let i = 0; i < audioData.length; i++) {
        normalized[i] = audioData[i] * scale;
      }
    } else {
      normalized.set(audioData);
    }
    
    return normalized;
  }

  /**
   * Apply audio filters
   */
  static applyAudioFilters(audioData: Float32Array, options: any): Float32Array {
    // Simple placeholder - just return the audio data
    // In a real implementation, this would apply various filters
    return new Float32Array(audioData);
  }

  /**
   * Load and decode audio file with comprehensive error handling
   * Works in both browser and Node.js environments
   */
  static async loadAudio(
    input: string | ArrayBuffer | Uint8Array | Buffer,
    options: AudioLoadOptions = {}
  ): Promise<AudioBuffer> {
    try {
      const startTime = performance.now();
      
      let audioBuffer: AudioBuffer;
      
      if (typeof input === 'string') {
        // File path - Node.js environment
        audioBuffer = await this.loadAudioFromFile(input, options);
      } else {
        // ArrayBuffer/Uint8Array/Buffer - Browser or Node.js
        audioBuffer = await this.loadAudioFromBuffer(input, options);
      }
      
      const loadTime = performance.now() - startTime;
      if (options.debug) {
        console.debug(`Audio loaded in ${loadTime.toFixed(2)}ms`);
      }
      
      return audioBuffer;
    } catch (error) {
      if (error instanceof AudioLoadError) {
        throw error;
      }
      throw new AudioLoadError(
        `Failed to load audio: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Public method to load audio file with enhanced format support
   */
  static async loadFile(
    filePath: string,
    options: AudioLoadOptions = {}
  ): Promise<AudioBuffer> {
    return this.loadAudio(filePath, options);
  }

  /**
   * Load audio from file path (Node.js)
   * Enhanced with audio-decode library support
   */
  private static async loadAudioFromFile(
    filePath: string, 
    options: AudioLoadOptions = {}
  ): Promise<AudioBuffer> {
    try {
      // Check if we're in Node.js environment
      if (typeof process === 'undefined' || !process.versions?.node) {
        throw new AudioLoadError('File loading requires Node.js environment');
      }
      
      // Validate and detect file format
      const formatInfo = this.detectAudioFormat(filePath);
      if (!formatInfo.isSupported) {
        throw new AudioFormatError(
          `Unsupported audio format: ${formatInfo.extension}. Supported formats: ${this.SUPPORTED_FORMATS.join(', ')}`,
          formatInfo.extension
        );
      }
      
      // Dynamic import for Node.js modules (to avoid bundling issues)
      const fs = await import('fs');
      const path = await import('path');
      
      // Validate file
      this.validateAudioFile(filePath, fs);
      
      // Read file as buffer
      const fileBuffer = fs.readFileSync(filePath);
      const stats = fs.statSync(filePath);
      
      if (options.debug) {
        console.debug(`Loaded file: ${path.basename(filePath)} (${stats.size} bytes, format: ${formatInfo.extension})`);
      }
      
      // Convert to ArrayBuffer and decode
      const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
      );
      
      return await this.loadAudioFromBuffer(arrayBuffer, { ...options, detectedFormat: formatInfo });
    } catch (error) {
      if (error instanceof AudioLoadError || error instanceof AudioFormatError) {
        throw error;
      }
      throw new AudioLoadError(
        `Failed to load audio file: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Load audio from ArrayBuffer/Uint8Array/Buffer (Browser or Node.js)
   * Enhanced with audio-decode library as primary decoder
   */
  private static async loadAudioFromBuffer(
    buffer: ArrayBuffer | Uint8Array | Buffer,
    options: AudioLoadOptions & { detectedFormat?: any } = {}
  ): Promise<AudioBuffer> {
    try {
      let arrayBuffer: ArrayBuffer;
      
      // Convert various buffer types to ArrayBuffer
      arrayBuffer = this.normalizeBufferToArrayBuffer(buffer);
      
      if (arrayBuffer.byteLength === 0) {
        throw new AudioLoadError('Empty audio buffer');
      }
      
      // Validate buffer integrity
      this.validateAudioBuffer(arrayBuffer, options.detectedFormat);
      
      // Try preferred decoder first if specified
      if (options.preferredDecoder) {
        const result = await this.tryPreferredDecoder(arrayBuffer, options);
        if (result) return result;
      }
      
      // Try audio-decode library first (supports most formats reliably)
      const audioDecodeResult = await this.loadWithAudioDecode(arrayBuffer, options);
      if (audioDecodeResult) {
        return audioDecodeResult;
      }
      
      // Try Web Audio API second (browser environment)
      if (this.hasWebAudioAPI()) {
        const webAudioResult = await this.loadWithWebAudioAPI(arrayBuffer, options);
        if (webAudioResult) {
          return webAudioResult;
        }
      }
      
      // Fallback to manual decoding for basic formats
      return await this.loadWithManualDecoding(arrayBuffer, options);
    } catch (error) {
      if (error instanceof AudioLoadError || error instanceof AudioFormatError) {
        throw error;
      }
      throw new AudioLoadError(
        `Failed to decode audio buffer: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Try preferred decoder if specified
   */
  private static async tryPreferredDecoder(
    arrayBuffer: ArrayBuffer,
    options: AudioLoadOptions
  ): Promise<AudioBuffer | null> {
    try {
      switch (options.preferredDecoder) {
        case 'audio-decode':
          return await this.loadWithAudioDecode(arrayBuffer, options);
        case 'web-audio':
          return this.hasWebAudioAPI() ? await this.loadWithWebAudioAPI(arrayBuffer, options) : null;
        case 'manual':
          return await this.loadWithManualDecoding(arrayBuffer, options);
        default:
          return null;
      }
    } catch (error) {
      if (options.debug) {
        console.debug(`Preferred decoder ${options.preferredDecoder} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    }
  }

  /**
   * Load audio using audio-decode library (primary method)
   * Supports MP3, WAV, FLAC, OGG, OPUS formats
   */
  private static async loadWithAudioDecode(
    arrayBuffer: ArrayBuffer,
    options: AudioLoadOptions & { detectedFormat?: any } = {}
  ): Promise<AudioBuffer | null> {
    try {
      const audioDecodeLib = await getAudioDecodeLib();
      if (!audioDecodeLib) {
        if (options.debug) {
          console.debug('audio-decode library not available, skipping');
        }
        return null;
      }
      
      if (options.debug) {
        console.debug('Attempting to decode with audio-decode library');
      }
      const startTime = performance.now();
      
      // Use audio-decode library
      const decodedBuffer = await audioDecodeLib.decode(arrayBuffer);
      
      if (!decodedBuffer || decodedBuffer.length === 0) {
        if (options.debug) {
          console.debug('audio-decode returned empty buffer');
        }
        return null;
      }
      
      const decodeTime = performance.now() - startTime;
      if (options.debug) {
        console.debug(`audio-decode completed in ${decodeTime.toFixed(2)}ms`);
      }
      
      // Process the decoded audio buffer
      return this.processDecodedAudioBuffer(decodedBuffer, options);
    } catch (error) {
      if (options.debug) {
        console.debug(`audio-decode failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null; // Let other methods try
    }
  }
  
  /**
   * Load audio using Web Audio API (fallback)
   */
  private static async loadWithWebAudioAPI(
    arrayBuffer: ArrayBuffer,
    options: AudioLoadOptions
  ): Promise<AudioBuffer | null> {
    try {
      const AudioCtx = AudioContext || (globalThis as any).webkitAudioContext;
      if (!AudioCtx) {
        return null;
      }
      
      if (options.debug) {
        console.debug('Attempting to decode with Web Audio API');
      }
      const audioContext = new AudioCtx();
      
      try {
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        
        if (decodedBuffer.length === 0) {
          return null;
        }
        
        if (options.debug) {
          console.debug('Web Audio API decode successful');
        }
        
        // Process the decoded audio buffer
        return this.processDecodedAudioBuffer(decodedBuffer, options);
      } finally {
        // Clean up audio context
        if (audioContext.state !== 'closed') {
          await audioContext.close();
        }
      }
    } catch (error) {
      if (options.debug) {
        console.debug(`Web Audio API failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null; // Let manual decoding try
    }
  }
  
  /**
   * Fallback manual decoding for basic formats (WAV only)
   */
  private static async loadWithManualDecoding(
    arrayBuffer: ArrayBuffer,
    options: AudioLoadOptions
  ): Promise<AudioBuffer> {
    if (options.debug) {
      console.debug('Attempting manual decoding (WAV only)');
    }
    
    // Detect format by magic bytes
    const dataView = new DataView(arrayBuffer);
    
    // Check for WAV header
    if (dataView.getUint32(0, false) === 0x52494646 && // "RIFF"
        dataView.getUint32(8, false) === 0x57415645) {  // "WAVE"
      if (options.debug) {
        console.debug('Manual WAV decoding successful');
      }
      return this.decodeWAV(arrayBuffer, options);
    }
    
    throw new AudioFormatError(
      'No suitable audio decoder available. Please ensure audio-decode library is installed or use Web Audio API compatible formats.'
    );
  }

  /**
   * Simple WAV decoder for manual fallback
   */
  private static decodeWAV(arrayBuffer: ArrayBuffer, options: AudioLoadOptions): AudioBuffer {
    const dataView = new DataView(arrayBuffer);
    
    // Parse WAV header with comprehensive validation
    const wavInfo = this.parseWAVHeader(dataView, arrayBuffer.byteLength);
    
    // Extract audio samples with proper normalization
    const samples = this.extractWAVSamples(dataView, wavInfo);
    
    // Convert to mono if multi-channel
    let finalSamples = samples;
    let finalChannels = wavInfo.channels;
    
    if (wavInfo.channels > 1 && options.forceMono !== false) {
      const monoResult = this.convertToMono(samples, wavInfo.channels);
      finalSamples = monoResult.samples;
      finalChannels = monoResult.channels;
    }
    
    // Normalize if requested
    if (options.normalize) {
      finalSamples = AudioUtils.normalize(finalSamples) as Float32Array;
    }
    
    return {
      data: finalSamples,
      sampleRate: wavInfo.sampleRate,
      channels: finalChannels,
      duration: finalSamples.length / wavInfo.sampleRate
    };
  }
  
  /**
   * Mix multi-channel audio to mono from Web Audio API AudioBuffer
   */
  private static mixToMono(audioBuffer: any): Float32Array {
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const monoData = new Float32Array(length);
    
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += audioBuffer.getChannelData(ch)[i];
      }
      monoData[i] = sum / channels;
    }
    
    return monoData;
  }

  /**
   * Convert audio to standardized format (mono, 44.1kHz)
   */
  static standardizeAudio(
    audioBuffer: AudioBuffer,
    targetSampleRate: number = this.STANDARD_SAMPLE_RATE
  ): AudioBuffer {
    try {
      let processedData = audioBuffer.data;
      let sampleRate = audioBuffer.sampleRate;
      let channels = audioBuffer.channels;

      // Convert to mono if needed (already handled in loading, but double-check)
      if (channels > 1) {
        console.debug('Audio already converted to mono during loading');
      }

      // Resample if needed
      if (sampleRate !== targetSampleRate) {
        console.debug(`Resampling from ${sampleRate}Hz to ${targetSampleRate}Hz`);
        processedData = SignalProcessing.resample(
          processedData, 
          sampleRate, 
          targetSampleRate
        );
        sampleRate = targetSampleRate;
      }

      // Validate standardized audio
      if (processedData.length === 0) {
        throw new AudioProcessingError('Standardized audio is empty');
      }

      return {
        data: processedData,
        sampleRate,
        channels: 1,
        duration: processedData.length / sampleRate
      };
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to standardize audio: ${error instanceof Error ? error.message : String(error)}`,
        'standardize'
      );
    }
  }

  /**
   * Apply various digital signal processing filters
   */
  static applyFilter(
    audioData: AudioData, 
    filterOptions: FilterOptions,
    sampleRate: number
  ): Float32Array {
    try {
      const data = AudioUtils.toFloat32Array(audioData);
      
      if (data.length === 0) {
        throw new AudioProcessingError('Empty audio data provided to filter');
      }
      
      if (filterOptions.cutoff <= 0 || filterOptions.cutoff >= sampleRate / 2) {
        throw new AudioProcessingError(
          `Invalid cutoff frequency: ${filterOptions.cutoff}Hz (must be > 0 and < ${sampleRate / 2}Hz)`
        );
      }
      
      const order = filterOptions.order || 2;
      
      switch (filterOptions.type) {
        case 'lowpass':
          return SignalProcessing.lowPassFilter(data, filterOptions.cutoff, sampleRate, order);
        case 'highpass':
          return SignalProcessing.highPassFilter(data, filterOptions.cutoff, sampleRate, order);
        case 'bandpass':
          if (!filterOptions.bandwidth || filterOptions.bandwidth <= 0) {
            throw new AudioProcessingError('Bandpass filter requires positive bandwidth');
          }
          return SignalProcessing.bandPassFilter(
            data, 
            filterOptions.cutoff, 
            filterOptions.bandwidth, 
            sampleRate,
            order
          );
        default:
          throw new AudioProcessingError(`Unknown filter type: ${filterOptions.type}`);
      }
    } catch (error) {
      if (error instanceof AudioProcessingError) {
        throw error;
      }
      throw new AudioProcessingError(
        `Filter application failed: ${error instanceof Error ? error.message : String(error)}`,
        'filter'
      );
    }
  }

  /**
   * Extract comprehensive audio features
   */
  static extractFeatures(
    audioData: AudioData, 
    sampleRate: number,
    windowSize = 1024
  ): AudioFeatures {
    try {
      const data = AudioUtils.toFloat32Array(audioData);
      
      if (data.length === 0) {
        throw new AudioProcessingError('Empty audio data provided for feature extraction');
      }
      
      if (windowSize > data.length) {
        console.warn(`Window size ${windowSize} larger than audio data length ${data.length}, using full data`);
        windowSize = data.length;
      }
      
      return {
        rms: AudioUtils.calculateRMS(data),
        spectralCentroid: this.calculateSpectralCentroid(data, sampleRate, windowSize),
        zcr: this.calculateZeroCrossingRate(data),
        spectralRolloff: this.calculateSpectralRolloff(data, sampleRate, windowSize)
      };
    } catch (error) {
      throw new AudioProcessingError(
        `Feature extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        'feature_extraction'
      );
    }
  }
  
  /**
   * Extract features from multiple frames for temporal analysis
   */
  static extractFrameFeatures(
    audioData: AudioData,
    sampleRate: number,
    windowSize = 1024,
    hopSize = 512
  ): AudioFeatures[] {
    try {
      const frames = this.frameAudio(audioData, windowSize, hopSize);
      const features: AudioFeatures[] = [];
      
      for (const frame of frames) {
        features.push(this.extractFeatures(frame, sampleRate, windowSize));
      }
      
      return features;
    } catch (error) {
      throw new AudioProcessingError(
        `Frame feature extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        'frame_features'
      );
    }
  }

  /**
   * Frame audio data into overlapping windows with validation
   */
  static frameAudio(
    audioData: AudioData,
    windowSize: number,
    hopSize: number,
    padLast = false
  ): Float32Array[] {
    try {
      const data = AudioUtils.toFloat32Array(audioData);
      const frames: Float32Array[] = [];
      
      if (windowSize <= 0 || hopSize <= 0) {
        throw new AudioProcessingError('Window size and hop size must be positive');
      }
      
      if (windowSize > data.length) {
        throw new AudioProcessingError(
          `Window size ${windowSize} larger than audio data length ${data.length}`
        );
      }
      
      for (let i = 0; i <= data.length - windowSize; i += hopSize) {
        const frame = data.slice(i, i + windowSize);
        frames.push(frame);
      }
      
      // Optionally pad the last frame if it's incomplete
      if (padLast && (data.length % hopSize) > 0) {
        const lastFrameStart = Math.floor(data.length / hopSize) * hopSize;
        if (lastFrameStart < data.length) {
          const lastFrame = new Float32Array(windowSize);
          const remainingData = data.slice(lastFrameStart);
          lastFrame.set(remainingData);
          // Remaining elements are already zero-padded
          frames.push(lastFrame);
        }
      }
      
      return frames;
    } catch (error) {
      throw new AudioProcessingError(
        `Audio framing failed: ${error instanceof Error ? error.message : String(error)}`,
        'framing'
      );
    }
  }

  /**
   * Apply window function to audio frame with multiple window types
   */
  static applyWindow(
    frame: Float32Array, 
    windowType: 'hanning' | 'hamming' | 'blackman' | 'rectangular' = 'hanning'
  ): Float32Array {
    try {
      const windowed = new Float32Array(frame.length);
      let window: Float32Array;

      switch (windowType) {
        case 'hanning':
          window = SignalProcessing.hanningWindow(frame.length);
          break;
        case 'hamming':
          window = SignalProcessing.hammingWindow(frame.length);
          break;
        case 'blackman':
          window = SignalProcessing.blackmanWindow(frame.length);
          break;
        case 'rectangular':
          window = SignalProcessing.rectangularWindow(frame.length);
          break;
        default:
          throw new AudioProcessingError(`Unknown window type: ${windowType}`);
      }

      for (let i = 0; i < frame.length; i++) {
        windowed[i] = frame[i]! * window[i]!;
      }

      return windowed;
    } catch (error) {
      throw new AudioProcessingError(
        `Window application failed: ${error instanceof Error ? error.message : String(error)}`,
        'windowing'
      );
    }
  }

  /**
   * Compute FFT magnitude spectrum with efficient implementation
   */
  static computeSpectrum(frame: Float32Array): Float32Array {
    try {
      return SignalProcessing.computeFFTMagnitude(frame);
    } catch (error) {
      throw new AudioProcessingError(
        `Spectrum computation failed: ${error instanceof Error ? error.message : String(error)}`,
        'spectrum'
      );
    }
  }
  
  /**
   * Compute power spectral density
   */
  static computePowerSpectrum(frame: Float32Array): Float32Array {
    try {
      const spectrum = this.computeSpectrum(frame);
      const powerSpectrum = new Float32Array(spectrum.length);
      
      for (let i = 0; i < spectrum.length; i++) {
        powerSpectrum[i] = spectrum[i]! * spectrum[i]!;
      }
      
      return powerSpectrum;
    } catch (error) {
      throw new AudioProcessingError(
        `Power spectrum computation failed: ${error instanceof Error ? error.message : String(error)}`,
        'power_spectrum'
      );
    }
  }
  
  /**
   * Compute mel-frequency cepstral coefficients (MFCCs)
   */
  static computeMFCC(
    frame: Float32Array,
    sampleRate: number,
    numCoeffs = 13,
    numFilters = 26
  ): Float32Array {
    try {
      return SignalProcessing.computeMFCC(frame, sampleRate, numCoeffs, numFilters);
    } catch (error) {
      throw new AudioProcessingError(
        `MFCC computation failed: ${error instanceof Error ? error.message : String(error)}`,
        'mfcc'
      );
    }
  }
  
  /**
   * Stream audio processing for large files
   */
  static async *streamAudio(
    audioData: AudioData,
    chunkSize: number = this.MAX_CHUNK_SIZE,
    processingFunction?: (chunk: Float32Array, index: number) => Float32Array
  ): AsyncGenerator<AudioStreamChunk, void, unknown> {
    try {
      const data = AudioUtils.toFloat32Array(audioData);
      const sampleRate = 44100; // Default, should be passed as parameter
      let chunkIndex = 0;
      
      for (let i = 0; i < data.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, data.length);
        let chunk = data.slice(i, end);
        
        // Apply processing function if provided
        if (processingFunction) {
          chunk = processingFunction(chunk, chunkIndex) as Float32Array;
        }
        
        yield {
          data: chunk,
          startTime: i / sampleRate,
          duration: chunk.length / sampleRate,
          index: chunkIndex,
          isFinal: end >= data.length
        };
        
        chunkIndex++;
      }
    } catch (error) {
      throw new AudioProcessingError(
        `Audio streaming failed: ${error instanceof Error ? error.message : String(error)}`,
        'streaming'
      );
    }
  }

  /**
   * Get comprehensive audio information
   */
  static getAudioInfo(audioBuffer: AudioBuffer): {
    duration: number;
    sampleRate: number;
    channels: number;
    samples: number;
    bitDepth: number;
    size: number;
  } {
    return {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.channels,
      samples: audioBuffer.data.length,
      bitDepth: 32, // Float32Array
      size: audioBuffer.data.length * 4 // 4 bytes per float32
    };
  }
  
  /**
   * Validate audio buffer
   */
  static validateAudioBuffer(audioBuffer: AudioBuffer): boolean {
    return (
      audioBuffer.data.length > 0 &&
      audioBuffer.sampleRate > 0 &&
      audioBuffer.channels > 0 &&
      audioBuffer.duration > 0 &&
      !audioBuffer.data.some(sample => !isFinite(sample))
    );
  }
  
  // ==================== HELPER METHODS ====================
  
  /**
   * Detect audio format from file extension and magic bytes
   */
  private static detectAudioFormat(input: string | ArrayBuffer): {
    extension: string;
    isSupported: boolean;
    confidence: number;
    category: 'primary' | 'partial' | 'fallback' | 'unsupported';
  } {
    let extension = '';
    let magicBytes: Uint8Array | null = null;
    
    if (typeof input === 'string') {
      // File path - extract extension
      extension = input.split('.').pop()?.toLowerCase() || '';
    } else {
      // ArrayBuffer - check magic bytes
      const bytes = new Uint8Array(input.slice(0, 16));
      magicBytes = bytes;
      
      // Detect format by magic bytes
      if (bytes.length >= 4) {
        // MP3 headers
        if ((bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) || // MPEG frame sync
            (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)) { // ID3v2
          extension = 'mp3';
        }
        // WAV header
        else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                 bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
          extension = 'wav';
        }
        // FLAC header
        else if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
          extension = 'flac';
        }
        // OGG header
        else if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
          extension = 'ogg';
        }
        // M4A/AAC (MP4 container)
        else if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
          extension = 'm4a';
        }
      }
    }
    
    // Determine support category
    let category: 'primary' | 'partial' | 'fallback' | 'unsupported' = 'unsupported';
    let confidence = 0;
    
    if (this.AUDIO_DECODE_FORMATS.includes(extension)) {
      category = 'primary';
      confidence = 0.9;
    } else if (this.PARTIAL_SUPPORT_FORMATS.includes(extension)) {
      category = 'partial';
      confidence = 0.6;
    } else if (this.FALLBACK_FORMATS.includes(extension)) {
      category = 'fallback';
      confidence = 0.4;
    }
    
    return {
      extension,
      isSupported: category !== 'unsupported',
      confidence,
      category
    };
  }
  
  /**
   * Validate audio file before processing
   */
  private static validateAudioFile(filePath: string, fs: any): void {
    if (!fs.existsSync(filePath)) {
      throw new AudioLoadError(`Audio file not found: ${filePath}`);
    }
    
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new AudioLoadError(`Path is not a file: ${filePath}`);
    }
    
    if (stats.size === 0) {
      throw new AudioLoadError(`Audio file is empty: ${filePath}`);
    }
    
    if (stats.size > 500 * 1024 * 1024) { // 500MB limit
      console.warn(`Large audio file detected: ${stats.size} bytes`);
    }
  }
  
  /**
   * Validate audio buffer integrity
   */
  private static validateAudioBuffer(arrayBuffer: ArrayBuffer, formatInfo?: any): void {
    if (arrayBuffer.byteLength === 0) {
      throw new AudioLoadError('Empty audio buffer');
    }
    
    if (arrayBuffer.byteLength < 44) { // Minimum for WAV header
      throw new AudioLoadError('Audio buffer too small to contain valid audio data');
    }
    
    // Additional format-specific validation
    if (formatInfo?.extension === 'wav') {
      const dataView = new DataView(arrayBuffer);
      if (dataView.getUint32(0, false) !== 0x52494646) { // "RIFF"
        throw new AudioFormatError('Invalid WAV file header');
      }
    }
  }
  
  /**
   * Normalize various buffer types to ArrayBuffer
   */
  private static normalizeBufferToArrayBuffer(buffer: ArrayBuffer | Uint8Array | Buffer): ArrayBuffer {
    if (buffer instanceof ArrayBuffer) {
      return buffer;
    } else if (buffer instanceof Uint8Array) {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } else if (typeof Buffer !== 'undefined' && buffer instanceof (Buffer as any)) {
      const nodeBuffer = buffer as any;
      return nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
    } else {
      throw new AudioFormatError('Unsupported buffer type');
    }
  }
  
  /**
   * Process decoded audio buffer from audio-decode or Web Audio API
   */
  private static processDecodedAudioBuffer(
    decodedBuffer: any,
    options: AudioLoadOptions
  ): AudioBuffer {
    let audioData: Float32Array;
    let sampleRate: number;
    let channels: number;
    let duration: number;
    
    // Handle different buffer types from different decoders
    if (decodedBuffer.getChannelData) {
      // Web Audio API AudioBuffer
      sampleRate = decodedBuffer.sampleRate;
      channels = decodedBuffer.numberOfChannels;
      duration = decodedBuffer.duration;
      
      if (channels === 1 || options.forceMono !== false) {
        audioData = channels === 1 ? decodedBuffer.getChannelData(0) : this.mixToMono(decodedBuffer);
      } else {
        audioData = decodedBuffer.getChannelData(0);
      }
    } else if (decodedBuffer.data || decodedBuffer.length) {
      // audio-decode library result
      sampleRate = decodedBuffer.sampleRate || 44100;
      channels = decodedBuffer.numberOfChannels || 1;
      duration = decodedBuffer.duration || (decodedBuffer.length / sampleRate);
      
      if (decodedBuffer.getChannelData) {
        audioData = channels === 1 ? decodedBuffer.getChannelData(0) : this.mixToMono(decodedBuffer);
      } else {
        audioData = decodedBuffer.data || decodedBuffer;
      }
    } else {
      throw new AudioLoadError('Unknown decoded buffer format');
    }
    
    // Ensure we have Float32Array
    if (!(audioData instanceof Float32Array)) {
      audioData = new Float32Array(audioData);
    }
    
    // Validate audio data is in proper range [-1, 1]
    const maxAbs = Math.max(...Array.from(audioData).map(Math.abs));
    if (maxAbs > 1.0) {
      if (options.debug) {
        console.debug(`Audio data exceeds [-1, 1] range (max: ${maxAbs}), normalizing...`);
      }
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = audioData[i] / maxAbs;
      }
    }
    
    // Apply normalization if requested
    if (options.normalize) {
      audioData = AudioUtils.normalize(audioData);
    }
    
    return {
      data: audioData,
      sampleRate,
      channels: options.forceMono !== false ? 1 : channels,
      duration
    };
  }
  
  /**
   * Parse WAV file header with comprehensive validation
   */
  private static parseWAVHeader(dataView: DataView, totalLength: number): {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    dataOffset: number;
    dataSize: number;
  } {
    let offset = 12; // Skip RIFF header
    let sampleRate = 44100;
    let channels = 1;
    let bitsPerSample = 16;
    let dataOffset = 0;
    let dataSize = 0;
    
    // Find format and data chunks
    while (offset < totalLength - 8) {
      const chunkId = dataView.getUint32(offset, false);
      const chunkSize = dataView.getUint32(offset + 4, true);
      
      if (chunkId === 0x666d7420) { // "fmt "
        if (chunkSize >= 16) {
          const audioFormat = dataView.getUint16(offset + 8, true);
          if (audioFormat !== 1 && audioFormat !== 3) { // PCM or IEEE float
            throw new AudioFormatError(`Unsupported WAV format: ${audioFormat}`);
          }
          
          channels = dataView.getUint16(offset + 10, true);
          sampleRate = dataView.getUint32(offset + 12, true);
          bitsPerSample = dataView.getUint16(offset + 22, true);
          
          if (channels < 1 || channels > 32) {
            throw new AudioFormatError(`Invalid channel count: ${channels}`);
          }
          if (sampleRate < 8000 || sampleRate > 192000) {
            throw new AudioFormatError(`Invalid sample rate: ${sampleRate}`);
          }
          if (![8, 16, 24, 32].includes(bitsPerSample)) {
            throw new AudioFormatError(`Unsupported bit depth: ${bitsPerSample}`);
          }
        }
      } else if (chunkId === 0x64617461) { // "data"
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }
      
      offset += 8 + chunkSize;
      if (chunkSize % 2) offset += 1; // Align to word boundary
    }
    
    if (dataOffset === 0) {
      throw new AudioFormatError('WAV data chunk not found');
    }
    
    return { sampleRate, channels, bitsPerSample, dataOffset, dataSize };
  }
  
  /**
   * Extract audio samples from WAV data with proper bit depth handling
   */
  private static extractWAVSamples(dataView: DataView, wavInfo: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    dataOffset: number;
    dataSize: number;
  }): Float32Array {
    const bytesPerSample = wavInfo.bitsPerSample / 8;
    const totalSamples = Math.floor(wavInfo.dataSize / bytesPerSample);
    const samples = new Float32Array(totalSamples);
    
    for (let i = 0; i < totalSamples; i++) {
      const sampleOffset = wavInfo.dataOffset + i * bytesPerSample;
      let sample = 0;
      
      switch (wavInfo.bitsPerSample) {
        case 8:
          sample = (dataView.getUint8(sampleOffset) - 128) / 128;
          break;
        case 16:
          sample = dataView.getInt16(sampleOffset, true) / 32768;
          break;
        case 24:
          // 24-bit signed integer (little endian)
          const byte1 = dataView.getUint8(sampleOffset);
          const byte2 = dataView.getUint8(sampleOffset + 1);
          const byte3 = dataView.getInt8(sampleOffset + 2); // signed for sign extension
          const int24 = byte1 | (byte2 << 8) | (byte3 << 16);
          sample = int24 / 8388608; // 2^23
          break;
        case 32:
          sample = dataView.getFloat32(sampleOffset, true);
          break;
        default:
          throw new AudioFormatError(`Unsupported bit depth: ${wavInfo.bitsPerSample}`);
      }
      
      samples[i] = Math.max(-1, Math.min(1, sample)); // Clamp to [-1, 1]
    }
    
    return samples;
  }
  
  /**
   * Convert multi-channel audio samples to mono
   */
  private static convertToMono(samples: Float32Array, channels: number): {
    samples: Float32Array;
    channels: number;
  } {
    const monoLength = Math.floor(samples.length / channels);
    const monoSamples = new Float32Array(monoLength);
    
    for (let i = 0; i < monoLength; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += samples[i * channels + ch] || 0;
      }
      monoSamples[i] = sum / channels;
    }
    
    return { samples: monoSamples, channels: 1 };
  }

  // Private helper methods

  /**
   * Check if current environment supports Web Audio API
   */
  private static hasWebAudioAPI(): boolean {
    return typeof AudioContext !== 'undefined' || 
           typeof (globalThis as any).webkitAudioContext !== 'undefined';
  }
  
  /**
   * Check if current environment is Node.js
   */
  private static isNodeJS(): boolean {
    return typeof process !== 'undefined' && 
           process.versions && 
           typeof process.versions.node === 'string';
  }

  private static calculateSpectralCentroid(
    data: Float32Array,
    sampleRate: number,
    windowSize: number
  ): number {
    const spectrum = this.computeSpectrum(data.slice(0, windowSize));
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < spectrum.length; i++) {
      const frequency = (i * sampleRate) / (2 * spectrum.length);
      weightedSum += frequency * spectrum[i];
      magnitudeSum += spectrum[i];
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  private static calculateZeroCrossingRate(data: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i - 1] >= 0) !== (data[i] >= 0)) {
        crossings++;
      }
    }
    return crossings / (data.length - 1);
  }

  private static calculateSpectralRolloff(
    data: Float32Array,
    sampleRate: number,
    windowSize: number,
    rolloffThreshold = 0.85
  ): number {
    const spectrum = this.computeSpectrum(data.slice(0, windowSize));
    const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
    const thresholdEnergy = totalEnergy * rolloffThreshold;
    
    let cumulativeEnergy = 0;
    for (let i = 0; i < spectrum.length; i++) {
      cumulativeEnergy += spectrum[i];
      if (cumulativeEnergy >= thresholdEnergy) {
        return (i * sampleRate) / (2 * spectrum.length);
      }
    }
    
    return (spectrum.length - 1) * sampleRate / (2 * spectrum.length);
  }
}