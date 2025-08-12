/**
 * Audio Test File Generator
 * Creates various types of audio files for comprehensive testing
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface AudioGenerationOptions {
  sampleRate: number;
  channels: number;
  duration: number;
  bitDepth: 16 | 24 | 32;
  format: 'wav' | 'raw';
}

export class AudioTestFileGenerator {
  private static readonly TEST_AUDIO_DIR = path.join(__dirname, '../test-audio-files');

  /**
   * Ensure test audio directory exists
   */
  static async ensureTestDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.TEST_AUDIO_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Generate pure sine wave audio
   */
  static generateSineWave(
    frequency: number,
    options: AudioGenerationOptions
  ): Float32Array {
    const { sampleRate, channels, duration } = options;
    const totalSamples = Math.floor(sampleRate * duration * channels);
    const samples = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      const sampleIndex = Math.floor(i / channels);
      const time = sampleIndex / sampleRate;
      samples[i] = Math.sin(2 * Math.PI * frequency * time);
    }

    return samples;
  }

  /**
   * Generate white noise
   */
  static generateWhiteNoise(options: AudioGenerationOptions): Float32Array {
    const { sampleRate, channels, duration } = options;
    const totalSamples = Math.floor(sampleRate * duration * channels);
    const samples = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      samples[i] = (Math.random() * 2) - 1;
    }

    return samples;
  }

  /**
   * Generate pink noise
   */
  static generatePinkNoise(options: AudioGenerationOptions): Float32Array {
    const { sampleRate, channels, duration } = options;
    const totalSamples = Math.floor(sampleRate * duration * channels);
    const samples = new Float32Array(totalSamples);

    // Simple pink noise filter approximation
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < totalSamples; i++) {
      const white = (Math.random() * 2) - 1;
      
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      
      samples[i] = pink * 0.11; // Scale down
    }

    return samples;
  }

  /**
   * Generate silence
   */
  static generateSilence(options: AudioGenerationOptions): Float32Array {
    const { sampleRate, channels, duration } = options;
    const totalSamples = Math.floor(sampleRate * duration * channels);
    return new Float32Array(totalSamples); // Already filled with zeros
  }

  /**
   * Generate beats pattern with clear beats
   */
  static generateBeatsPattern(
    beatsPerMinute: number,
    options: AudioGenerationOptions
  ): Float32Array {
    const { sampleRate, channels, duration } = options;
    const totalSamples = Math.floor(sampleRate * duration * channels);
    const samples = new Float32Array(totalSamples);
    
    const beatInterval = (60 / beatsPerMinute) * sampleRate; // samples between beats
    const beatDuration = sampleRate * 0.1; // 100ms beat duration
    
    for (let i = 0; i < totalSamples; i++) {
      const sampleIndex = Math.floor(i / channels);
      const beatPosition = sampleIndex % beatInterval;
      
      if (beatPosition < beatDuration) {
        // Create a beat using a combination of frequencies
        const time = sampleIndex / sampleRate;
        const beatStrength = Math.max(0, 1 - (beatPosition / beatDuration));
        samples[i] = Math.sin(2 * Math.PI * 60 * time) * 0.8 * beatStrength + // Kick
                    Math.sin(2 * Math.PI * 1000 * time) * 0.3 * beatStrength; // Click
      } else {
        // Background tone
        const time = sampleIndex / sampleRate;
        samples[i] = Math.sin(2 * Math.PI * 440 * time) * 0.1;
      }
    }

    return samples;
  }

  /**
   * Generate clipped audio (distortion)
   */
  static generateClippedAudio(options: AudioGenerationOptions): Float32Array {
    const samples = this.generateSineWave(440, options);
    
    // Apply extreme amplification and clipping
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.max(-1, Math.min(1, samples[i] * 5));
    }
    
    return samples;
  }

  /**
   * Generate audio with NaN and infinite values
   */
  static generateInvalidAudio(options: AudioGenerationOptions): Float32Array {
    const samples = this.generateSineWave(440, options);
    
    // Inject invalid values at random positions
    const invalidPositions = Math.floor(samples.length * 0.01); // 1% invalid
    for (let i = 0; i < invalidPositions; i++) {
      const pos = Math.floor(Math.random() * samples.length);
      samples[pos] = Math.random() > 0.5 ? NaN : Infinity;
    }
    
    return samples;
  }

  /**
   * Generate very quiet audio (near silence)
   */
  static generateQuietAudio(options: AudioGenerationOptions): Float32Array {
    const samples = this.generateSineWave(440, options);
    
    // Scale to very low amplitude
    for (let i = 0; i < samples.length; i++) {
      samples[i] *= 0.001; // -60dB
    }
    
    return samples;
  }

  /**
   * Convert Float32Array to WAV buffer
   */
  static createWavBuffer(samples: Float32Array, options: AudioGenerationOptions): Buffer {
    const { sampleRate, channels, bitDepth } = options;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const dataSize = samples.length * bytesPerSample;
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);
    let offset = 0;

    // WAV Header
    buffer.write('RIFF', offset); offset += 4;
    buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
    buffer.write('WAVE', offset); offset += 4;

    // fmt chunk
    buffer.write('fmt ', offset); offset += 4;
    buffer.writeUInt32LE(16, offset); offset += 4; // chunk size
    buffer.writeUInt16LE(1, offset); offset += 2;  // format (PCM)
    buffer.writeUInt16LE(channels, offset); offset += 2;
    buffer.writeUInt32LE(sampleRate, offset); offset += 4;
    buffer.writeUInt32LE(sampleRate * blockAlign, offset); offset += 4; // byte rate
    buffer.writeUInt16LE(blockAlign, offset); offset += 2;
    buffer.writeUInt16LE(bitDepth, offset); offset += 2;

    // data chunk
    buffer.write('data', offset); offset += 4;
    buffer.writeUInt32LE(dataSize, offset); offset += 4;

    // Convert Float32 samples to integer format
    const maxValue = Math.pow(2, bitDepth - 1) - 1;
    for (let i = 0; i < samples.length; i++) {
      let sample = Math.max(-1, Math.min(1, samples[i]));
      let intSample = Math.round(sample * maxValue);
      
      if (bitDepth === 16) {
        buffer.writeInt16LE(intSample, offset);
        offset += 2;
      } else if (bitDepth === 24) {
        // 24-bit is stored as 3 bytes, little-endian
        buffer.writeIntLE(intSample, offset, 3);
        offset += 3;
      } else if (bitDepth === 32) {
        buffer.writeInt32LE(intSample, offset);
        offset += 4;
      }
    }

    return buffer;
  }

  /**
   * Generate and save a complete set of test files
   */
  static async generateTestFiles(): Promise<string[]> {
    await this.ensureTestDirectory();
    
    const generatedFiles: string[] = [];
    const baseOptions: AudioGenerationOptions = {
      sampleRate: 44100,
      channels: 1,
      duration: 2, // 2 seconds
      bitDepth: 16,
      format: 'wav'
    };

    const testCases = [
      // Basic formats at different sample rates
      { name: 'sine_440hz_44khz_16bit_mono', generator: () => this.generateSineWave(440, baseOptions) },
      { name: 'sine_440hz_48khz_16bit_mono', generator: () => this.generateSineWave(440, { ...baseOptions, sampleRate: 48000 }) },
      { name: 'sine_440hz_22khz_16bit_mono', generator: () => this.generateSineWave(440, { ...baseOptions, sampleRate: 22050 }) },
      { name: 'sine_440hz_8khz_16bit_mono', generator: () => this.generateSineWave(440, { ...baseOptions, sampleRate: 8000 }) },
      
      // Different bit depths
      { name: 'sine_440hz_44khz_24bit_mono', generator: () => this.generateSineWave(440, { ...baseOptions, bitDepth: 24 }) },
      { name: 'sine_440hz_44khz_32bit_mono', generator: () => this.generateSineWave(440, { ...baseOptions, bitDepth: 32 }) },
      
      // Stereo
      { name: 'sine_440hz_44khz_16bit_stereo', generator: () => this.generateSineWave(440, { ...baseOptions, channels: 2 }) },
      
      // Different durations
      { name: 'sine_440hz_short_0.1s', generator: () => this.generateSineWave(440, { ...baseOptions, duration: 0.1 }) },
      { name: 'sine_440hz_long_30s', generator: () => this.generateSineWave(440, { ...baseOptions, duration: 30 }) },
      
      // Edge case content
      { name: 'silence_2s', generator: () => this.generateSilence(baseOptions) },
      { name: 'white_noise_2s', generator: () => this.generateWhiteNoise(baseOptions) },
      { name: 'pink_noise_2s', generator: () => this.generatePinkNoise(baseOptions) },
      { name: 'beats_120bpm_2s', generator: () => this.generateBeatsPattern(120, baseOptions) },
      { name: 'beats_60bpm_2s', generator: () => this.generateBeatsPattern(60, baseOptions) },
      { name: 'beats_200bpm_2s', generator: () => this.generateBeatsPattern(200, baseOptions) },
      { name: 'clipped_audio_2s', generator: () => this.generateClippedAudio(baseOptions) },
      { name: 'quiet_audio_2s', generator: () => this.generateQuietAudio(baseOptions) },
      { name: 'invalid_audio_2s', generator: () => this.generateInvalidAudio(baseOptions) },
      
      // Very short files
      { name: 'very_short_1sample', generator: () => new Float32Array([0.5]) },
      { name: 'very_short_10samples', generator: () => this.generateSineWave(440, { ...baseOptions, duration: 10/44100 }) },
    ];

    for (const testCase of testCases) {
      try {
        const samples = testCase.generator();
        const wavBuffer = this.createWavBuffer(samples, baseOptions);
        const filePath = path.join(this.TEST_AUDIO_DIR, `${testCase.name}.wav`);
        
        await fs.writeFile(filePath, wavBuffer);
        generatedFiles.push(filePath);
        console.log(`Generated: ${testCase.name}.wav`);
      } catch (error) {
        console.warn(`Failed to generate ${testCase.name}:`, error);
      }
    }

    // Generate corrupted files
    const corruptedFiles = await this.generateCorruptedFiles();
    generatedFiles.push(...corruptedFiles);

    return generatedFiles;
  }

  /**
   * Generate corrupted and malformed files for testing
   */
  static async generateCorruptedFiles(): Promise<string[]> {
    const corruptedFiles: string[] = [];
    
    // Create a valid WAV first
    const validSamples = this.generateSineWave(440, {
      sampleRate: 44100,
      channels: 1,
      duration: 1,
      bitDepth: 16,
      format: 'wav'
    });
    const validWav = this.createWavBuffer(validSamples, {
      sampleRate: 44100,
      channels: 1,
      duration: 1,
      bitDepth: 16,
      format: 'wav'
    });

    // Truncated file
    const truncatedPath = path.join(this.TEST_AUDIO_DIR, 'truncated.wav');
    await fs.writeFile(truncatedPath, validWav.slice(0, validWav.length / 2));
    corruptedFiles.push(truncatedPath);

    // Invalid header
    const invalidHeaderBuffer = Buffer.from(validWav);
    invalidHeaderBuffer.write('BADH', 0); // Replace RIFF with BADH
    const invalidHeaderPath = path.join(this.TEST_AUDIO_DIR, 'invalid_header.wav');
    await fs.writeFile(invalidHeaderPath, invalidHeaderBuffer);
    corruptedFiles.push(invalidHeaderPath);

    // Empty file
    const emptyPath = path.join(this.TEST_AUDIO_DIR, 'empty.wav');
    await fs.writeFile(emptyPath, Buffer.alloc(0));
    corruptedFiles.push(emptyPath);

    // Binary garbage
    const garbageBuffer = Buffer.alloc(1024);
    for (let i = 0; i < garbageBuffer.length; i++) {
      garbageBuffer[i] = Math.floor(Math.random() * 256);
    }
    const garbagePath = path.join(this.TEST_AUDIO_DIR, 'garbage.wav');
    await fs.writeFile(garbagePath, garbageBuffer);
    corruptedFiles.push(garbagePath);

    // Wrong extension
    const wrongExtPath = path.join(this.TEST_AUDIO_DIR, 'audio.mp3');
    await fs.writeFile(wrongExtPath, validWav); // WAV data with MP3 extension
    corruptedFiles.push(wrongExtPath);

    console.log('Generated corrupted test files');
    return corruptedFiles;
  }

  /**
   * Clean up generated test files
   */
  static async cleanupTestFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.TEST_AUDIO_DIR);
      for (const file of files) {
        await fs.unlink(path.join(this.TEST_AUDIO_DIR, file));
      }
      await fs.rmdir(this.TEST_AUDIO_DIR);
      console.log('Cleaned up test files');
    } catch (error) {
      console.warn('Error cleaning up test files:', error);
    }
  }
}