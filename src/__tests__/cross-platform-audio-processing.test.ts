/**
 * Cross-Platform Audio Processing Compatibility Tests
 * Validates consistent audio processing behavior across Node.js and browser environments
 */

import { AudioProcessor } from '../core/AudioProcessor';
import { AudioUtils } from '../utils/AudioUtils';
import { SignalProcessing } from '../utils/SignalProcessing';
import type { AudioBuffer, AudioFeatures, FilterOptions } from '../types';

describe('Cross-Platform Audio Processing', () => {
  describe('Audio Loading Compatibility', () => {
    test('should detect environment capabilities correctly', () => {
      // In Node.js environment
      const hasWebAudioAPI = typeof AudioContext !== 'undefined' || 
                           typeof (globalThis as any).webkitAudioContext !== 'undefined';
      const hasNodeFS = (() => {
        try {
          require.resolve('fs');
          return true;
        } catch {
          return false;
        }
      })();

      expect(hasWebAudioAPI).toBe(false); // Not available in Node.js
      expect(hasNodeFS).toBe(true); // Available in Node.js
      expect(typeof Buffer).toBe('function'); // Node.js Buffer available
    });

    test('should handle empty audio buffers consistently', async () => {
      const emptyArrayBuffer = new ArrayBuffer(0);
      const emptyUint8Array = new Uint8Array(0);
      
      // All empty buffer types should throw consistent errors
      await expect(AudioProcessor.loadAudio(emptyArrayBuffer))
        .rejects
        .toThrow(/empty/i);
      
      await expect(AudioProcessor.loadAudio(emptyUint8Array))
        .rejects
        .toThrow(/empty/i);
    });

    test('should handle invalid audio data consistently', async () => {
      // Invalid audio data (too small to be valid)
      const tooSmall = new ArrayBuffer(10);
      const invalidHeader = new ArrayBuffer(100);
      
      await expect(AudioProcessor.loadAudio(tooSmall))
        .rejects
        .toThrow();
      
      await expect(AudioProcessor.loadAudio(invalidHeader))
        .rejects
        .toThrow();
    });

    test('should handle buffer type conversion consistently', async () => {
      const testData = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"
      const buffer = testData.buffer;
      const nodeBuffer = Buffer.from(testData);

      // All should fail with similar errors (invalid WAV data)
      await expect(AudioProcessor.loadAudio(buffer))
        .rejects
        .toThrow();
      
      await expect(AudioProcessor.loadAudio(testData))
        .rejects
        .toThrow();
      
      await expect(AudioProcessor.loadAudio(nodeBuffer))
        .rejects
        .toThrow();
    });

    test('should create valid WAV headers for testing', () => {
      // Create a minimal valid WAV file buffer for testing
      const createMinimalWAV = (samples: number[], sampleRate = 44100): ArrayBuffer => {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        const textEncoder = new TextEncoder();
        
        // WAV header
        const riff = textEncoder.encode('RIFF');
        const wave = textEncoder.encode('WAVE');
        const fmt = textEncoder.encode('fmt ');
        const data = textEncoder.encode('data');
        
        let offset = 0;
        
        // RIFF header
        view.setUint32(offset, 0x52494646, false); offset += 4; // "RIFF"
        view.setUint32(offset, 36 + samples.length * 2, true); offset += 4; // File size - 8
        view.setUint32(offset, 0x57415645, false); offset += 4; // "WAVE"
        
        // fmt chunk
        view.setUint32(offset, 0x666d7420, false); offset += 4; // "fmt "
        view.setUint32(offset, 16, true); offset += 4; // Chunk size
        view.setUint16(offset, 1, true); offset += 2; // Audio format (PCM)
        view.setUint16(offset, 1, true); offset += 2; // Channels
        view.setUint32(offset, sampleRate, true); offset += 4; // Sample rate
        view.setUint32(offset, sampleRate * 2, true); offset += 4; // Byte rate
        view.setUint16(offset, 2, true); offset += 2; // Block align
        view.setUint16(offset, 16, true); offset += 2; // Bits per sample
        
        // data chunk
        view.setUint32(offset, 0x64617461, false); offset += 4; // "data"
        view.setUint32(offset, samples.length * 2, true); offset += 4; // Data size
        
        // Sample data
        for (let i = 0; i < samples.length; i++) {
          view.setInt16(offset, Math.floor(samples[i] * 32767), true);
          offset += 2;
        }
        
        return buffer;
      };

      // Test WAV creation
      const samples = [0.1, -0.2, 0.3, -0.4];
      const wavBuffer = createMinimalWAV(samples);
      
      expect(wavBuffer.byteLength).toBe(44 + samples.length * 2);
      
      // Verify WAV header
      const view = new DataView(wavBuffer);
      expect(view.getUint32(0, false)).toBe(0x52494646); // "RIFF"
      expect(view.getUint32(8, false)).toBe(0x57415645); // "WAVE"
    });

    test('should process minimal WAV files consistently', async () => {
      // Create a minimal valid WAV file
      const createMinimalWAV = (samples: number[]): ArrayBuffer => {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        
        let offset = 0;
        
        // RIFF header
        view.setUint32(offset, 0x52494646, false); offset += 4; // "RIFF"
        view.setUint32(offset, 36 + samples.length * 2, true); offset += 4;
        view.setUint32(offset, 0x57415645, false); offset += 4; // "WAVE"
        
        // fmt chunk  
        view.setUint32(offset, 0x666d7420, false); offset += 4; // "fmt "
        view.setUint32(offset, 16, true); offset += 4;
        view.setUint16(offset, 1, true); offset += 2; // PCM
        view.setUint16(offset, 1, true); offset += 2; // Mono
        view.setUint32(offset, 44100, true); offset += 4; // Sample rate
        view.setUint32(offset, 88200, true); offset += 4; // Byte rate
        view.setUint16(offset, 2, true); offset += 2; // Block align
        view.setUint16(offset, 16, true); offset += 2; // 16-bit
        
        // data chunk
        view.setUint32(offset, 0x64617461, false); offset += 4; // "data"
        view.setUint32(offset, samples.length * 2, true); offset += 4;
        
        // Sample data
        for (const sample of samples) {
          view.setInt16(offset, Math.floor(sample * 32767), true);
          offset += 2;
        }
        
        return buffer;
      };

      const samples = [0.1, -0.2, 0.3, -0.4, 0.5];
      const wavBuffer = createMinimalWAV(samples);
      
      const audioBuffer = await AudioProcessor.loadAudio(wavBuffer);
      
      expect(audioBuffer).toBeDefined();
      expect(audioBuffer.data).toBeInstanceOf(Float32Array);
      expect(audioBuffer.data.length).toBe(samples.length);
      expect(audioBuffer.sampleRate).toBe(44100);
      expect(audioBuffer.channels).toBe(1);
      expect(audioBuffer.duration).toBeCloseTo(samples.length / 44100, 6);
    });
  });

  describe('Audio Standardization Consistency', () => {
    test('should standardize audio consistently across platforms', () => {
      const audioBuffer: AudioBuffer = {
        data: new Float32Array([0.1, -0.2, 0.3, -0.4]),
        sampleRate: 48000,
        channels: 1,
        duration: 4 / 48000
      };

      const standardized = AudioProcessor.standardizeAudio(audioBuffer, 44100);

      expect(standardized.sampleRate).toBe(44100);
      expect(standardized.channels).toBe(1);
      expect(standardized.data).toBeInstanceOf(Float32Array);
      expect(standardized.data.length).toBeGreaterThan(0);
      expect(standardized.duration).toBeCloseTo(standardized.data.length / 44100, 6);
    });

    test('should handle various sample rates consistently', () => {
      const testSampleRates = [8000, 16000, 22050, 44100, 48000, 96000];
      const testData = new Float32Array([0.1, -0.2, 0.3, -0.4]);

      for (const inputRate of testSampleRates) {
        const audioBuffer: AudioBuffer = {
          data: testData,
          sampleRate: inputRate,
          channels: 1,
          duration: testData.length / inputRate
        };

        const standardized = AudioProcessor.standardizeAudio(audioBuffer, 44100);

        expect(standardized.sampleRate).toBe(44100);
        expect(standardized.channels).toBe(1);
        expect(standardized.data).toBeInstanceOf(Float32Array);
        expect(standardized.data.length).toBeGreaterThan(0);
      }
    });

    test('should preserve audio quality during standardization', () => {
      // Test that standardization doesn't introduce artifacts
      const frequency = 440; // A4 note
      const sampleRate = 48000;
      const duration = 0.1; // 100ms
      const samples = Math.floor(sampleRate * duration);
      
      const testData = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        testData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
      }

      const audioBuffer: AudioBuffer = {
        data: testData,
        sampleRate: sampleRate,
        channels: 1,
        duration: duration
      };

      const standardized = AudioProcessor.standardizeAudio(audioBuffer, 44100);

      // Check that the signal still has reasonable amplitude
      const rms = AudioUtils.calculateRMS(standardized.data);
      expect(rms).toBeGreaterThan(0.1);
      expect(rms).toBeLessThan(1.0);

      // Check that the signal doesn't have obvious artifacts (no DC component)
      const mean = standardized.data.reduce((sum, val) => sum + val, 0) / standardized.data.length;
      expect(Math.abs(mean)).toBeLessThan(0.01);
    });
  });

  describe('Feature Extraction Consistency', () => {
    test('should extract features consistently across platforms', () => {
      // Generate test signal - sine wave at 440Hz
      const sampleRate = 44100;
      const frequency = 440;
      const duration = 0.1; // 100ms
      const samples = Math.floor(sampleRate * duration);
      
      const audioData = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        audioData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
      }

      const features = AudioProcessor.extractFeatures(audioData, sampleRate);

      expect(features).toHaveProperty('rms');
      expect(features).toHaveProperty('spectralCentroid');
      expect(features).toHaveProperty('zcr');
      expect(features).toHaveProperty('spectralRolloff');

      // Validate feature values
      expect(features.rms).toBeGreaterThan(0);
      expect(features.rms).toBeLessThan(1);
      expect(features.spectralCentroid).toBeGreaterThan(0);
      expect(features.zcr).toBeGreaterThan(0);
      expect(features.spectralRolloff).toBeGreaterThan(0);

      // For a sine wave, spectral centroid should be close to the frequency
      expect(features.spectralCentroid).toBeGreaterThan(frequency * 0.5);
      expect(features.spectralCentroid).toBeLessThan(frequency * 2);
    });

    test('should extract frame features consistently', () => {
      const audioData = new Float32Array(4096);
      // Fill with test signal
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }

      const frameFeatures = AudioProcessor.extractFrameFeatures(audioData, 44100, 1024, 512);

      expect(Array.isArray(frameFeatures)).toBe(true);
      expect(frameFeatures.length).toBeGreaterThan(0);

      for (const features of frameFeatures) {
        expect(features).toHaveProperty('rms');
        expect(features).toHaveProperty('spectralCentroid');
        expect(features).toHaveProperty('zcr');
        expect(features).toHaveProperty('spectralRolloff');

        expect(features.rms).toBeGreaterThan(0);
        expect(features.spectralCentroid).toBeGreaterThan(0);
      }
    });

    test('should handle edge cases consistently', () => {
      // Test with zero signal
      const zeroData = new Float32Array(1024).fill(0);
      const zeroFeatures = AudioProcessor.extractFeatures(zeroData, 44100);

      expect(zeroFeatures.rms).toBe(0);
      expect(zeroFeatures.zcr).toBe(0);
      expect(zeroFeatures.spectralCentroid).toBe(0);

      // Test with DC signal
      const dcData = new Float32Array(1024).fill(0.5);
      const dcFeatures = AudioProcessor.extractFeatures(dcData, 44100);

      expect(dcFeatures.rms).toBeCloseTo(0.5, 3);
      expect(dcFeatures.zcr).toBe(0);

      // Test with impulse
      const impulseData = new Float32Array(1024).fill(0);
      impulseData[0] = 1.0;
      const impulseFeatures = AudioProcessor.extractFeatures(impulseData, 44100);

      expect(impulseFeatures.rms).toBeGreaterThan(0);
      expect(impulseFeatures.spectralCentroid).toBeGreaterThan(0);
    });
  });

  describe('Audio Filtering Compatibility', () => {
    test('should apply filters consistently', () => {
      const audioData = new Float32Array(1024);
      // Generate white noise for filtering test
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = (Math.random() - 0.5) * 2;
      }

      const filterOptions: FilterOptions = {
        type: 'lowpass',
        cutoff: 1000,
        order: 2
      };

      const filtered = AudioProcessor.applyFilter(audioData, filterOptions, 44100);

      expect(filtered).toBeInstanceOf(Float32Array);
      expect(filtered.length).toBe(audioData.length);
      
      // Filtered signal should have lower energy at high frequencies
      const originalRMS = AudioUtils.calculateRMS(audioData);
      const filteredRMS = AudioUtils.calculateRMS(filtered);
      
      expect(filteredRMS).toBeGreaterThan(0);
      expect(filteredRMS).toBeLessThanOrEqual(originalRMS);
    });

    test('should validate filter parameters consistently', () => {
      const audioData = new Float32Array(1024).fill(0.5);

      // Invalid cutoff frequency
      expect(() => {
        AudioProcessor.applyFilter(audioData, {
          type: 'lowpass',
          cutoff: -100,
          order: 2
        }, 44100);
      }).toThrow();

      // Cutoff too high
      expect(() => {
        AudioProcessor.applyFilter(audioData, {
          type: 'lowpass',
          cutoff: 30000, // > sampleRate/2
          order: 2
        }, 44100);
      }).toThrow();

      // Missing bandwidth for bandpass
      expect(() => {
        AudioProcessor.applyFilter(audioData, {
          type: 'bandpass',
          cutoff: 1000,
          order: 2
        }, 44100);
      }).toThrow();
    });

    test('should handle different filter types consistently', () => {
      const audioData = new Float32Array(1024);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) + 
                       Math.sin(2 * Math.PI * 2000 * i / 44100);
      }

      // Low-pass filter
      const lowpass = AudioProcessor.applyFilter(audioData, {
        type: 'lowpass',
        cutoff: 1000,
        order: 2
      }, 44100);

      // High-pass filter
      const highpass = AudioProcessor.applyFilter(audioData, {
        type: 'highpass',
        cutoff: 1000,
        order: 2
      }, 44100);

      // Band-pass filter
      const bandpass = AudioProcessor.applyFilter(audioData, {
        type: 'bandpass',
        cutoff: 1000,
        bandwidth: 500,
        order: 2
      }, 44100);

      expect(lowpass).toBeInstanceOf(Float32Array);
      expect(highpass).toBeInstanceOf(Float32Array);
      expect(bandpass).toBeInstanceOf(Float32Array);

      expect(lowpass.length).toBe(audioData.length);
      expect(highpass.length).toBe(audioData.length);
      expect(bandpass.length).toBe(audioData.length);
    });
  });

  describe('Audio Framing Consistency', () => {
    test('should frame audio consistently', () => {
      const audioData = new Float32Array(2048);
      audioData.fill(0.5);

      const frames = AudioProcessor.frameAudio(audioData, 1024, 512);

      expect(Array.isArray(frames)).toBe(true);
      expect(frames.length).toBe(3); // (2048 - 1024) / 512 + 1

      for (const frame of frames) {
        expect(frame).toBeInstanceOf(Float32Array);
        expect(frame.length).toBe(1024);
      }
    });

    test('should validate framing parameters', () => {
      const audioData = new Float32Array(1024);

      // Invalid window size
      expect(() => {
        AudioProcessor.frameAudio(audioData, 0, 512);
      }).toThrow();

      // Invalid hop size
      expect(() => {
        AudioProcessor.frameAudio(audioData, 1024, 0);
      }).toThrow();

      // Window size too large
      expect(() => {
        AudioProcessor.frameAudio(audioData, 2048, 512);
      }).toThrow();
    });

    test('should handle edge cases in framing', () => {
      const audioData = new Float32Array(1000);
      audioData.fill(0.5);

      // Exact multiple
      const frames1 = AudioProcessor.frameAudio(audioData, 100, 100);
      expect(frames1.length).toBe(10);

      // With overlap
      const frames2 = AudioProcessor.frameAudio(audioData, 200, 100);
      expect(frames2.length).toBe(9); // (1000 - 200) / 100 + 1

      // With padding
      const frames3 = AudioProcessor.frameAudio(audioData, 200, 100, true);
      expect(frames3.length).toBe(10); // Includes padded last frame
    });
  });

  describe('Windowing Function Consistency', () => {
    test('should apply window functions consistently', () => {
      const frame = new Float32Array(1024).fill(1.0);

      const hanning = AudioProcessor.applyWindow(frame, 'hanning');
      const hamming = AudioProcessor.applyWindow(frame, 'hamming');
      const blackman = AudioProcessor.applyWindow(frame, 'blackman');
      const rectangular = AudioProcessor.applyWindow(frame, 'rectangular');

      expect(hanning).toBeInstanceOf(Float32Array);
      expect(hamming).toBeInstanceOf(Float32Array);
      expect(blackman).toBeInstanceOf(Float32Array);
      expect(rectangular).toBeInstanceOf(Float32Array);

      expect(hanning.length).toBe(1024);
      expect(hamming.length).toBe(1024);
      expect(blackman.length).toBe(1024);
      expect(rectangular.length).toBe(1024);

      // Rectangular window should be unchanged
      expect(Array.from(rectangular)).toEqual(Array.from(frame));

      // Other windows should taper to zero at edges
      expect(hanning[0]).toBeCloseTo(0, 3);
      expect(hanning[1023]).toBeCloseTo(0, 3);
      expect(hamming[0]).toBeCloseTo(0, 1);
      expect(hamming[1023]).toBeCloseTo(0, 1);
    });

    test('should handle invalid window types', () => {
      const frame = new Float32Array(1024).fill(1.0);

      expect(() => {
        AudioProcessor.applyWindow(frame, 'invalid' as any);
      }).toThrow();
    });
  });

  describe('Spectrum Computation Consistency', () => {
    test('should compute spectrum consistently', () => {
      const frame = new Float32Array(1024);
      // Generate test signal
      for (let i = 0; i < frame.length; i++) {
        frame[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }

      const spectrum = AudioProcessor.computeSpectrum(frame);

      expect(spectrum).toBeInstanceOf(Float32Array);
      expect(spectrum.length).toBe(frame.length / 2);

      // Spectrum values should be non-negative
      for (const value of spectrum) {
        expect(value).toBeGreaterThanOrEqual(0);
      }

      // Should have peak near 440Hz bin
      const binSize = 44100 / frame.length;
      const expectedBin = Math.round(440 / binSize);
      const peakBin = Array.from(spectrum).indexOf(Math.max(...spectrum));
      
      expect(Math.abs(peakBin - expectedBin)).toBeLessThan(5); // Within 5 bins
    });

    test('should compute power spectrum consistently', () => {
      const frame = new Float32Array(1024);
      for (let i = 0; i < frame.length; i++) {
        frame[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }

      const powerSpectrum = AudioProcessor.computePowerSpectrum(frame);

      expect(powerSpectrum).toBeInstanceOf(Float32Array);
      expect(powerSpectrum.length).toBe(frame.length / 2);

      // Power spectrum values should be non-negative
      for (const value of powerSpectrum) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });

    test('should handle empty spectrum computation', () => {
      const emptyFrame = new Float32Array(1024).fill(0);
      const spectrum = AudioProcessor.computeSpectrum(emptyFrame);

      expect(spectrum).toBeInstanceOf(Float32Array);
      expect(spectrum.length).toBe(emptyFrame.length / 2);

      // All values should be zero or near zero
      for (const value of spectrum) {
        expect(value).toBeLessThan(1e-10);
      }
    });
  });

  describe('MFCC Computation Consistency', () => {
    test('should compute MFCC consistently', () => {
      const frame = new Float32Array(1024);
      // Generate test signal
      for (let i = 0; i < frame.length; i++) {
        frame[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }

      const mfcc = AudioProcessor.computeMFCC(frame, 44100);

      expect(mfcc).toBeInstanceOf(Float32Array);
      expect(mfcc.length).toBe(13); // Default number of coefficients

      // MFCC values should be finite
      for (const value of mfcc) {
        expect(isFinite(value)).toBe(true);
      }
    });

    test('should handle MFCC parameters consistently', () => {
      const frame = new Float32Array(1024);
      frame.fill(1.0);

      const mfcc12 = AudioProcessor.computeMFCC(frame, 44100, 12, 24);
      const mfcc20 = AudioProcessor.computeMFCC(frame, 44100, 20, 40);

      expect(mfcc12.length).toBe(12);
      expect(mfcc20.length).toBe(20);
    });
  });

  describe('Audio Information Consistency', () => {
    test('should provide consistent audio information', () => {
      const audioBuffer: AudioBuffer = {
        data: new Float32Array(44100), // 1 second
        sampleRate: 44100,
        channels: 1,
        duration: 1.0
      };

      const info = AudioProcessor.getAudioInfo(audioBuffer);

      expect(info.duration).toBe(1.0);
      expect(info.sampleRate).toBe(44100);
      expect(info.channels).toBe(1);
      expect(info.samples).toBe(44100);
      expect(info.bitDepth).toBe(32);
      expect(info.size).toBe(44100 * 4); // 4 bytes per float32
    });

    test('should validate audio buffers consistently', () => {
      const validBuffer: AudioBuffer = {
        data: new Float32Array([0.1, -0.2, 0.3]),
        sampleRate: 44100,
        channels: 1,
        duration: 3 / 44100
      };

      const invalidBuffer: AudioBuffer = {
        data: new Float32Array([NaN, Infinity, 0.1]),
        sampleRate: 44100,
        channels: 1,
        duration: 3 / 44100
      };

      const emptyBuffer: AudioBuffer = {
        data: new Float32Array(0),
        sampleRate: 44100,
        channels: 1,
        duration: 0
      };

      expect(AudioProcessor.validateAudioBuffer(validBuffer)).toBe(true);
      expect(AudioProcessor.validateAudioBuffer(invalidBuffer)).toBe(false);
      expect(AudioProcessor.validateAudioBuffer(emptyBuffer)).toBe(false);
    });
  });
});