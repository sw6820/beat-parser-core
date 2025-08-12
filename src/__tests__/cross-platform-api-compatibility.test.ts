/**
 * Cross-Platform API Compatibility Tests
 * Validates consistent API behavior across Node.js and browser environments
 */

import { BeatParser } from '../core/BeatParser';
import { AudioProcessor } from '../core/AudioProcessor';
import { AudioUtils } from '../utils/AudioUtils';
import { SignalProcessing } from '../utils/SignalProcessing';
import { isWorkerSupported, createWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, BeatParserConfig } from '../types';

describe('Cross-Platform API Compatibility', () => {
  describe('Core API Consistency', () => {
    let parser: BeatParser;

    beforeEach(() => {
      parser = new BeatParser();
    });

    test('should maintain consistent constructor interface across platforms', () => {
      // Test default constructor
      const defaultParser = new BeatParser();
      expect(defaultParser).toBeInstanceOf(BeatParser);

      // Test constructor with config
      const configParser = new BeatParser({
        sampleRate: 44100,
        windowSize: 1024,
        hopSize: 512
      });
      expect(configParser).toBeInstanceOf(BeatParser);
    });

    test('should provide consistent method signatures', () => {
      // Core methods should exist and be functions
      expect(typeof parser.parseBuffer).toBe('function');
      expect(typeof parser.parseStream).toBe('function');
      expect(typeof parser.configure).toBe('function');
      expect(typeof parser.getConfig).toBe('function');

      // Method arity (number of parameters) should be consistent
      expect(parser.parseBuffer.length).toBe(2); // audioData, options
      expect(parser.parseStream.length).toBe(2); // chunks, options
      expect(parser.configure.length).toBe(1); // config
    });

    test('should return consistent data structures', async () => {
      const audioData = new Float32Array(1024).fill(0.5);
      
      const result = await parser.parseBuffer(audioData);
      
      // Result structure should be consistent across platforms
      expect(result).toHaveProperty('beats');
      expect(result).toHaveProperty('tempo');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('metadata');
      
      expect(Array.isArray(result.beats)).toBe(true);
      expect(typeof result.tempo).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.metadata).toBe('object');
    });

    test('should handle options consistently', async () => {
      const audioData = new Float32Array(1024).fill(0.5);
      
      const options: ParseOptions = {
        algorithm: 'hybrid',
        sensitivity: 0.5,
        minTempo: 60,
        maxTempo: 180
      };

      const result = await parser.parseBuffer(audioData, options);
      
      // Should process options without throwing
      expect(result).toBeDefined();
      expect(result.metadata.algorithm).toBe('hybrid');
    });

    test('should maintain consistent error handling', async () => {
      // Empty data should throw consistently
      await expect(parser.parseBuffer(new Float32Array(0)))
        .rejects
        .toThrow();

      // Invalid options should throw consistently
      await expect(parser.parseBuffer(new Float32Array(1024), { 
        minTempo: -1 
      } as ParseOptions))
        .rejects
        .toThrow();

      // Null/undefined data should throw consistently
      await expect(parser.parseBuffer(null as any))
        .rejects
        .toThrow();
    });
  });

  describe('AudioProcessor API Consistency', () => {
    test('should provide consistent static method interfaces', () => {
      // Check static method existence
      expect(typeof AudioProcessor.loadAudio).toBe('function');
      expect(typeof AudioProcessor.standardizeAudio).toBe('function');
      expect(typeof AudioProcessor.applyFilter).toBe('function');
      expect(typeof AudioProcessor.extractFeatures).toBe('function');
      expect(typeof AudioProcessor.frameAudio).toBe('function');

      // Check method arities
      expect(AudioProcessor.loadAudio.length).toBe(2);
      expect(AudioProcessor.standardizeAudio.length).toBe(2);
      expect(AudioProcessor.applyFilter.length).toBe(3);
      expect(AudioProcessor.extractFeatures.length).toBe(3);
    });

    test('should handle buffer types consistently', async () => {
      const testData = new Uint8Array([0, 1, 2, 3, 4, 5]);
      const arrayBuffer = testData.buffer;

      // Should accept ArrayBuffer
      await expect(AudioProcessor.loadAudio(arrayBuffer))
        .rejects
        .toThrow(); // Expected to fail due to invalid audio data

      // Should accept Uint8Array
      await expect(AudioProcessor.loadAudio(testData))
        .rejects
        .toThrow(); // Expected to fail due to invalid audio data

      // Error messages should be consistent
      let arrayBufferError: Error | null = null;
      let uint8ArrayError: Error | null = null;

      try {
        await AudioProcessor.loadAudio(arrayBuffer);
      } catch (e) {
        arrayBufferError = e as Error;
      }

      try {
        await AudioProcessor.loadAudio(testData);
      } catch (e) {
        uint8ArrayError = e as Error;
      }

      expect(arrayBufferError).toBeInstanceOf(Error);
      expect(uint8ArrayError).toBeInstanceOf(Error);
      // Error types should be consistent
      expect(arrayBufferError?.name).toBe(uint8ArrayError?.name);
    });

    test('should standardize audio consistently', () => {
      const audioBuffer = {
        data: new Float32Array([0.1, -0.2, 0.3, -0.4]),
        sampleRate: 48000,
        channels: 1,
        duration: 4 / 48000
      };

      const standardized = AudioProcessor.standardizeAudio(audioBuffer, 44100);

      expect(standardized).toHaveProperty('data');
      expect(standardized).toHaveProperty('sampleRate');
      expect(standardized).toHaveProperty('channels');
      expect(standardized).toHaveProperty('duration');

      expect(standardized.sampleRate).toBe(44100);
      expect(standardized.channels).toBe(1);
      expect(standardized.data).toBeInstanceOf(Float32Array);
    });

    test('should extract features consistently', () => {
      const audioData = new Float32Array(1024);
      // Generate test sine wave
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }

      const features = AudioProcessor.extractFeatures(audioData, 44100);

      expect(features).toHaveProperty('rms');
      expect(features).toHaveProperty('spectralCentroid');
      expect(features).toHaveProperty('zcr');
      expect(features).toHaveProperty('spectralRolloff');

      expect(typeof features.rms).toBe('number');
      expect(typeof features.spectralCentroid).toBe('number');
      expect(typeof features.zcr).toBe('number');
      expect(typeof features.spectralRolloff).toBe('number');

      expect(features.rms).toBeGreaterThan(0);
      expect(features.spectralCentroid).toBeGreaterThan(0);
      expect(features.zcr).toBeGreaterThanOrEqual(0);
      expect(features.spectralRolloff).toBeGreaterThan(0);
    });

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
  });

  describe('AudioUtils API Consistency', () => {
    test('should provide consistent utility functions', () => {
      expect(typeof AudioUtils.toFloat32Array).toBe('function');
      expect(typeof AudioUtils.normalize).toBe('function');
      expect(typeof AudioUtils.calculateRMS).toBe('function');
      expect(typeof AudioUtils.detectPeaks).toBe('function');
    });

    test('should convert data types consistently', () => {
      const inputData = [0.1, -0.2, 0.3, -0.4];
      
      const float32Result = AudioUtils.toFloat32Array(inputData);
      const arrayResult = AudioUtils.toFloat32Array(new Array(...inputData));
      const typedArrayResult = AudioUtils.toFloat32Array(new Float32Array(inputData));

      expect(float32Result).toBeInstanceOf(Float32Array);
      expect(arrayResult).toBeInstanceOf(Float32Array);
      expect(typedArrayResult).toBeInstanceOf(Float32Array);

      expect(Array.from(float32Result)).toEqual(inputData);
      expect(Array.from(arrayResult)).toEqual(inputData);
      expect(Array.from(typedArrayResult)).toEqual(inputData);
    });

    test('should normalize consistently', () => {
      const audioData = new Float32Array([0.1, -0.2, 0.3, -0.4]);
      const normalized = AudioUtils.normalize(audioData);

      expect(normalized).toBeInstanceOf(Float32Array);
      expect(normalized.length).toBe(audioData.length);
      
      const max = Math.max(...Array.from(normalized).map(Math.abs));
      expect(max).toBeCloseTo(1.0, 5);
    });

    test('should calculate RMS consistently', () => {
      const audioData = new Float32Array([0.1, -0.2, 0.3, -0.4]);
      const rms = AudioUtils.calculateRMS(audioData);

      expect(typeof rms).toBe('number');
      expect(rms).toBeGreaterThan(0);
      expect(rms).toBeLessThanOrEqual(1);

      // Verify calculation
      const expectedRms = Math.sqrt(audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length);
      expect(rms).toBeCloseTo(expectedRms, 5);
    });

    test('should detect peaks consistently', () => {
      const audioData = new Float32Array(100);
      // Create data with clear peaks
      audioData[10] = 0.8;
      audioData[30] = -0.7;
      audioData[50] = 0.9;
      audioData[70] = -0.6;

      const peaks = AudioUtils.detectPeaks(audioData, 0.5);

      expect(Array.isArray(peaks)).toBe(true);
      expect(peaks.length).toBeGreaterThan(0);
      
      for (const peak of peaks) {
        expect(typeof peak.index).toBe('number');
        expect(typeof peak.value).toBe('number');
        expect(peak.index).toBeGreaterThanOrEqual(0);
        expect(peak.index).toBeLessThan(audioData.length);
      }
    });
  });

  describe('SignalProcessing API Consistency', () => {
    test('should provide consistent FFT operations', () => {
      const audioData = new Float32Array(1024);
      // Generate test signal
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }

      const spectrum = SignalProcessing.computeFFTMagnitude(audioData);

      expect(spectrum).toBeInstanceOf(Float32Array);
      expect(spectrum.length).toBe(audioData.length / 2);
      
      // Spectrum values should be non-negative
      for (const value of spectrum) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });

    test('should provide consistent filtering operations', () => {
      const audioData = new Float32Array(1024);
      audioData.fill(0.5);

      const filtered = SignalProcessing.lowPassFilter(audioData, 1000, 44100);

      expect(filtered).toBeInstanceOf(Float32Array);
      expect(filtered.length).toBe(audioData.length);
    });

    test('should provide consistent resampling', () => {
      const audioData = new Float32Array(1024);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
      }

      const resampled = SignalProcessing.resample(audioData, 44100, 22050);

      expect(resampled).toBeInstanceOf(Float32Array);
      expect(resampled.length).toBe(Math.floor(audioData.length / 2));
    });

    test('should provide consistent window functions', () => {
      const length = 1024;
      
      const hanningWindow = SignalProcessing.hanningWindow(length);
      const hammingWindow = SignalProcessing.hammingWindow(length);
      const blackmanWindow = SignalProcessing.blackmanWindow(length);

      expect(hanningWindow).toBeInstanceOf(Float32Array);
      expect(hammingWindow).toBeInstanceOf(Float32Array);
      expect(blackmanWindow).toBeInstanceOf(Float32Array);

      expect(hanningWindow.length).toBe(length);
      expect(hammingWindow.length).toBe(length);
      expect(blackmanWindow.length).toBe(length);

      // Window functions should start and end near zero
      expect(hanningWindow[0]).toBeCloseTo(0, 3);
      expect(hanningWindow[length - 1]).toBeCloseTo(0, 3);
    });
  });

  describe('Worker API Consistency', () => {
    test('should consistently detect worker support', () => {
      const isSupported = isWorkerSupported();
      
      // In Node.js test environment, worker support should be false
      expect(typeof isSupported).toBe('boolean');
      expect(isSupported).toBe(false);
    });

    test('should consistently create worker clients', () => {
      const client = createWorkerClient();
      
      expect(client).toBeDefined();
      expect(typeof client.initialize).toBe('function');
      expect(typeof client.parseBuffer).toBe('function');
      expect(typeof client.parseStream).toBe('function');
      expect(typeof client.terminate).toBe('function');
    });

    test('should handle worker unavailability gracefully', async () => {
      const client = createWorkerClient();
      
      // Worker initialization should fail gracefully in Node.js
      await expect(client.initialize())
        .rejects
        .toThrow();
    });
  });

  describe('Type System Consistency', () => {
    test('should maintain consistent type definitions', () => {
      // These tests verify that TypeScript types are consistent
      // The actual runtime behavior is tested in other tests
      
      const config: BeatParserConfig = {
        sampleRate: 44100,
        windowSize: 1024,
        hopSize: 512
      };

      const options: ParseOptions = {
        algorithm: 'hybrid',
        sensitivity: 0.5,
        minTempo: 60,
        maxTempo: 180
      };

      // These should not cause TypeScript compilation errors
      expect(typeof config.sampleRate).toBe('number');
      expect(typeof options.algorithm).toBe('string');
    });

    test('should handle optional parameters consistently', async () => {
      const parser = new BeatParser();
      const audioData = new Float32Array(1024).fill(0.5);

      // All these should work without throwing
      await parser.parseBuffer(audioData);
      await parser.parseBuffer(audioData, {});
      await parser.parseBuffer(audioData, { algorithm: 'hybrid' });
    });
  });

  describe('Error Message Consistency', () => {
    test('should provide consistent error messages across platforms', async () => {
      const parser = new BeatParser();

      // Test empty data error
      let emptyDataError: Error | null = null;
      try {
        await parser.parseBuffer(new Float32Array(0));
      } catch (e) {
        emptyDataError = e as Error;
      }

      expect(emptyDataError).toBeInstanceOf(Error);
      expect(emptyDataError?.message).toContain('empty');

      // Test null data error
      let nullDataError: Error | null = null;
      try {
        await parser.parseBuffer(null as any);
      } catch (e) {
        nullDataError = e as Error;
      }

      expect(nullDataError).toBeInstanceOf(Error);
      expect(nullDataError?.message).toBeDefined();
    });

    test('should provide helpful error context', async () => {
      try {
        await AudioProcessor.loadAudio(new ArrayBuffer(0));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message.toLowerCase();
        expect(errorMessage).toMatch(/empty|audio|buffer/);
      }
    });
  });

  describe('Performance Consistency', () => {
    test('should maintain consistent performance characteristics', async () => {
      const parser = new BeatParser();
      const audioData = new Float32Array(44100); // 1 second at 44.1kHz
      audioData.fill(0.5);

      const start = performance.now();
      await parser.parseBuffer(audioData);
      const end = performance.now();

      const processingTime = end - start;
      
      // Should complete within reasonable time (10 seconds max)
      expect(processingTime).toBeLessThan(10000);
      
      // Should be deterministic (multiple runs should be similar)
      const start2 = performance.now();
      await parser.parseBuffer(audioData);
      const end2 = performance.now();

      const processingTime2 = end2 - start2;
      
      // Performance should be within 50% variance
      const variance = Math.abs(processingTime - processingTime2) / Math.min(processingTime, processingTime2);
      expect(variance).toBeLessThan(0.5);
    });
  });
});