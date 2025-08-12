/**
 * Cross-Platform Performance Benchmarking Tests
 * Validates performance consistency and acceptable variance across platforms
 */

import { BeatParser } from '../core/BeatParser';
import { AudioProcessor } from '../core/AudioProcessor';
import { AudioUtils } from '../utils/AudioUtils';
import { SignalProcessing } from '../utils/SignalProcessing';
import { performance } from 'perf_hooks';

describe('Cross-Platform Performance', () => {
  // Performance thresholds (in milliseconds)
  const PERFORMANCE_THRESHOLDS = {
    PARSE_SMALL_AUDIO: 1000,    // 1 second for small audio (1024 samples)
    PARSE_MEDIUM_AUDIO: 5000,   // 5 seconds for medium audio (44100 samples)
    PARSE_LARGE_AUDIO: 15000,   // 15 seconds for large audio (441000 samples)
    FEATURE_EXTRACTION: 100,    // 100ms for feature extraction
    FILTER_APPLICATION: 500,    // 500ms for filter application
    SPECTRUM_COMPUTATION: 200,  // 200ms for spectrum computation
    STANDARDIZATION: 1000,      // 1 second for audio standardization
    MEMORY_CLEANUP: 100         // 100ms for memory cleanup operations
  };

  // Variance thresholds (as percentage)
  const VARIANCE_THRESHOLDS = {
    PROCESSING_TIME: 0.3,       // 30% variance allowed
    MEMORY_USAGE: 0.5,          // 50% variance allowed
    ACCURACY: 0.01              // 1% variance in numerical results
  };

  describe('Beat Parsing Performance', () => {
    let parser: BeatParser;

    beforeEach(() => {
      parser = new BeatParser({
        sampleRate: 44100,
        windowSize: 1024,
        hopSize: 512
      });
    });

    test('should parse small audio buffers within time threshold', async () => {
      const audioData = new Float32Array(1024);
      // Generate test signal
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      }

      const startTime = performance.now();
      const result = await parser.parseBuffer(audioData);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.PARSE_SMALL_AUDIO);
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.tempo).toBeDefined();

      console.log(`Small audio parsing time: ${processingTime.toFixed(2)}ms`);
    });

    test('should parse medium audio buffers within time threshold', async () => {
      const audioData = new Float32Array(44100); // 1 second
      // Generate test signal with tempo
      const tempo = 120; // BPM
      const beatInterval = 60 / tempo; // seconds per beat
      const samplesPerBeat = Math.floor(44100 * beatInterval);

      for (let i = 0; i < audioData.length; i++) {
        const beatPhase = (i % samplesPerBeat) / samplesPerBeat;
        const amplitude = beatPhase < 0.1 ? 0.8 : 0.2; // Strong beats
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * amplitude;
      }

      const startTime = performance.now();
      const result = await parser.parseBuffer(audioData);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.PARSE_MEDIUM_AUDIO);
      expect(result.tempo).toBeCloseTo(tempo, -0.5); // Within 0.5 BPM

      console.log(`Medium audio parsing time: ${processingTime.toFixed(2)}ms`);
    });

    test('should maintain consistent performance across multiple runs', async () => {
      const audioData = new Float32Array(22050); // 0.5 seconds
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      }

      const runs = 5;
      const times: number[] = [];

      for (let run = 0; run < runs; run++) {
        const startTime = performance.now();
        await parser.parseBuffer(audioData);
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / runs;
      const maxVariance = Math.max(...times.map(time => Math.abs(time - avgTime) / avgTime));

      expect(maxVariance).toBeLessThan(VARIANCE_THRESHOLDS.PROCESSING_TIME);

      console.log(`Average parsing time: ${avgTime.toFixed(2)}ms, Max variance: ${(maxVariance * 100).toFixed(1)}%`);
    });

    test('should scale linearly with input size', async () => {
      const sizes = [1024, 2048, 4096, 8192];
      const times: number[] = [];

      for (const size of sizes) {
        const audioData = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
        }

        const startTime = performance.now();
        await parser.parseBuffer(audioData);
        const endTime = performance.now();
        
        times.push(endTime - startTime);
      }

      // Check that processing time doesn't grow exponentially
      for (let i = 1; i < times.length; i++) {
        const sizeRatio = sizes[i] / sizes[i - 1];
        const timeRatio = times[i] / times[i - 1];
        
        // Time growth should be reasonable relative to size growth
        expect(timeRatio).toBeLessThan(sizeRatio * 2);
      }

      console.log('Scaling analysis:', sizes.map((size, i) => 
        `${size} samples: ${times[i].toFixed(2)}ms`
      ).join(', '));
    });

    test('should handle memory efficiently during processing', async () => {
      const audioData = new Float32Array(44100);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      }

      const initialMemory = process.memoryUsage().heapUsed;
      
      await parser.parseBuffer(audioData);
      
      const afterProcessingMemory = process.memoryUsage().heapUsed;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const afterGCMemory = process.memoryUsage().heapUsed;
      
      const memoryGrowth = afterProcessingMemory - initialMemory;
      const persistentMemoryGrowth = afterGCMemory - initialMemory;
      
      // Processing should not cause excessive memory growth
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // 10MB limit
      
      // Most memory should be cleaned up after GC
      if (global.gc) {
        expect(persistentMemoryGrowth).toBeLessThan(memoryGrowth * 0.5);
      }

      console.log(`Memory usage - Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB, Persistent: ${(persistentMemoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Audio Processing Performance', () => {
    test('should standardize audio within time threshold', () => {
      const audioBuffer = {
        data: new Float32Array(44100), // 1 second
        sampleRate: 48000,
        channels: 1,
        duration: 44100 / 48000
      };

      // Fill with test data
      for (let i = 0; i < audioBuffer.data.length; i++) {
        audioBuffer.data[i] = Math.sin(2 * Math.PI * 440 * i / 48000) * 0.7;
      }

      const startTime = performance.now();
      const standardized = AudioProcessor.standardizeAudio(audioBuffer, 44100);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.STANDARDIZATION);
      expect(standardized.sampleRate).toBe(44100);

      console.log(`Audio standardization time: ${processingTime.toFixed(2)}ms`);
    });

    test('should extract features within time threshold', () => {
      const audioData = new Float32Array(1024);
      // Generate complex test signal
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5 +
                       Math.sin(2 * Math.PI * 880 * i / 44100) * 0.3 +
                       Math.sin(2 * Math.PI * 1760 * i / 44100) * 0.2;
      }

      const startTime = performance.now();
      const features = AudioProcessor.extractFeatures(audioData, 44100);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.FEATURE_EXTRACTION);
      expect(features.rms).toBeGreaterThan(0);
      expect(features.spectralCentroid).toBeGreaterThan(0);

      console.log(`Feature extraction time: ${processingTime.toFixed(2)}ms`);
    });

    test('should apply filters within time threshold', () => {
      const audioData = new Float32Array(4096);
      // Generate test signal
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.random() * 0.5 - 0.25; // White noise
      }

      const filterOptions = {
        type: 'lowpass' as const,
        cutoff: 1000,
        order: 4
      };

      const startTime = performance.now();
      const filtered = AudioProcessor.applyFilter(audioData, filterOptions, 44100);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.FILTER_APPLICATION);
      expect(filtered.length).toBe(audioData.length);

      console.log(`Filter application time: ${processingTime.toFixed(2)}ms`);
    });

    test('should compute spectrum within time threshold', () => {
      const audioData = new Float32Array(2048);
      // Generate test signal
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.8;
      }

      const startTime = performance.now();
      const spectrum = AudioProcessor.computeSpectrum(audioData);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SPECTRUM_COMPUTATION);
      expect(spectrum.length).toBe(audioData.length / 2);

      console.log(`Spectrum computation time: ${processingTime.toFixed(2)}ms`);
    });

    test('should maintain consistent feature extraction performance', () => {
      const audioData = new Float32Array(1024);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      }

      const runs = 10;
      const times: number[] = [];
      const results: any[] = [];

      for (let run = 0; run < runs; run++) {
        const startTime = performance.now();
        const features = AudioProcessor.extractFeatures(audioData, 44100);
        const endTime = performance.now();
        
        times.push(endTime - startTime);
        results.push(features);
      }

      // Check timing consistency
      const avgTime = times.reduce((sum, time) => sum + time, 0) / runs;
      const timeVariance = Math.max(...times.map(time => Math.abs(time - avgTime) / avgTime));

      expect(timeVariance).toBeLessThan(VARIANCE_THRESHOLDS.PROCESSING_TIME);

      // Check result consistency
      const rmsValues = results.map(r => r.rms);
      const avgRMS = rmsValues.reduce((sum, val) => sum + val, 0) / runs;
      const rmsVariance = Math.max(...rmsValues.map(val => Math.abs(val - avgRMS) / avgRMS));

      expect(rmsVariance).toBeLessThan(VARIANCE_THRESHOLDS.ACCURACY);

      console.log(`Feature extraction - Time variance: ${(timeVariance * 100).toFixed(2)}%, Result variance: ${(rmsVariance * 100).toFixed(4)}%`);
    });
  });

  describe('Signal Processing Performance', () => {
    test('should perform FFT within time threshold', () => {
      const audioData = new Float32Array(2048);
      // Generate test signal with multiple frequencies
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5 +
                       Math.sin(2 * Math.PI * 880 * i / 44100) * 0.3;
      }

      const startTime = performance.now();
      const spectrum = SignalProcessing.computeFFTMagnitude(audioData);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SPECTRUM_COMPUTATION);
      expect(spectrum.length).toBe(audioData.length / 2);

      console.log(`FFT computation time: ${processingTime.toFixed(2)}ms`);
    });

    test('should perform resampling efficiently', () => {
      const audioData = new Float32Array(44100); // 1 second at 44.1kHz
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.7;
      }

      const startTime = performance.now();
      const resampled = SignalProcessing.resample(audioData, 44100, 22050);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.STANDARDIZATION);
      expect(resampled.length).toBeCloseTo(audioData.length / 2, -2);

      console.log(`Resampling time: ${processingTime.toFixed(2)}ms`);
    });

    test('should generate window functions efficiently', () => {
      const windowSizes = [512, 1024, 2048, 4096];
      const windowTypes = ['hanning', 'hamming', 'blackman'] as const;

      for (const size of windowSizes) {
        for (const windowType of windowTypes) {
          const startTime = performance.now();
          
          let window: Float32Array;
          switch (windowType) {
            case 'hanning':
              window = SignalProcessing.hanningWindow(size);
              break;
            case 'hamming':
              window = SignalProcessing.hammingWindow(size);
              break;
            case 'blackman':
              window = SignalProcessing.blackmanWindow(size);
              break;
          }
          
          const endTime = performance.now();
          const processingTime = endTime - startTime;

          expect(processingTime).toBeLessThan(50); // 50ms for window generation
          expect(window.length).toBe(size);

          if (size === 1024 && windowType === 'hanning') {
            console.log(`${windowType} window (${size}) generation time: ${processingTime.toFixed(2)}ms`);
          }
        }
      }
    });

    test('should handle large FFT operations efficiently', () => {
      const sizes = [1024, 2048, 4096, 8192];
      const times: number[] = [];

      for (const size of sizes) {
        const audioData = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
        }

        const startTime = performance.now();
        const spectrum = SignalProcessing.computeFFTMagnitude(audioData);
        const endTime = performance.now();

        const processingTime = endTime - startTime;
        times.push(processingTime);

        expect(spectrum.length).toBe(size / 2);

        // Each size should complete within reasonable time
        expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SPECTRUM_COMPUTATION);
      }

      // FFT should scale reasonably (O(N log N))
      for (let i = 1; i < times.length; i++) {
        const sizeRatio = sizes[i] / sizes[i - 1];
        const timeRatio = times[i] / times[i - 1];
        const theoreticalRatio = sizeRatio * Math.log2(sizeRatio);

        // Actual ratio should be reasonable compared to theoretical
        expect(timeRatio).toBeLessThan(theoreticalRatio * 3);
      }

      console.log('FFT scaling:', sizes.map((size, i) => 
        `${size}: ${times[i].toFixed(2)}ms`
      ).join(', '));
    });
  });

  describe('Memory Performance', () => {
    test('should handle large audio data without excessive memory usage', () => {
      const largeSize = 441000; // 10 seconds at 44.1kHz
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create large audio data
      const audioData = new Float32Array(largeSize);
      for (let i = 0; i < largeSize; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      }

      const afterCreationMemory = process.memoryUsage().heapUsed;

      // Process the data
      const features = AudioProcessor.extractFeatures(audioData.slice(0, 1024), 44100);
      const spectrum = AudioProcessor.computeSpectrum(audioData.slice(0, 2048));

      const afterProcessingMemory = process.memoryUsage().heapUsed;

      // Clear references
      audioData.fill(0);

      if (global.gc) {
        global.gc();
      }

      const afterCleanupMemory = process.memoryUsage().heapUsed;

      const creationGrowth = afterCreationMemory - initialMemory;
      const processingGrowth = afterProcessingMemory - afterCreationMemory;
      const cleanupReduction = afterProcessingMemory - afterCleanupMemory;

      // Memory growth should be reasonable
      expect(creationGrowth).toBeLessThan(largeSize * 8); // Float32Array uses 4 bytes, allow 2x overhead
      expect(processingGrowth).toBeLessThan(largeSize * 4); // Processing overhead should be reasonable

      console.log(`Memory analysis - Creation: ${(creationGrowth / 1024 / 1024).toFixed(2)}MB, Processing: ${(processingGrowth / 1024 / 1024).toFixed(2)}MB, Cleanup: ${(cleanupReduction / 1024 / 1024).toFixed(2)}MB`);

      expect(features).toBeDefined();
      expect(spectrum).toBeDefined();
    });

    test('should clean up resources efficiently', async () => {
      const parser = new BeatParser();
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform multiple operations
      for (let i = 0; i < 5; i++) {
        const audioData = new Float32Array(22050);
        audioData.fill(Math.sin(i)); // Different data each time
        
        await parser.parseBuffer(audioData);
      }

      const afterOperationsMemory = process.memoryUsage().heapUsed;

      // Force cleanup
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100)); // Allow GC to complete
      }

      const afterCleanupMemory = process.memoryUsage().heapUsed;

      const operationGrowth = afterOperationsMemory - initialMemory;
      const persistentGrowth = afterCleanupMemory - initialMemory;

      // Most memory should be cleaned up
      if (global.gc) {
        expect(persistentGrowth).toBeLessThan(operationGrowth * 0.8);
      }

      console.log(`Resource cleanup - Operation growth: ${(operationGrowth / 1024 / 1024).toFixed(2)}MB, Persistent: ${(persistentGrowth / 1024 / 1024).toFixed(2)}MB`);
    });

    test('should handle concurrent processing without memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create multiple parsers and process concurrently
      const parsers = Array.from({ length: 5 }, () => new BeatParser());
      const audioBuffers = Array.from({ length: 5 }, (_, i) => {
        const data = new Float32Array(11025); // 0.25 seconds
        data.fill(Math.sin(i * 0.1));
        return data;
      });

      const promises = parsers.map((parser, i) => parser.parseBuffer(audioBuffers[i]));
      const results = await Promise.all(promises);

      const afterConcurrentMemory = process.memoryUsage().heapUsed;

      expect(results).toHaveLength(5);
      for (const result of results) {
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      }

      const memoryGrowth = afterConcurrentMemory - initialMemory;
      
      // Concurrent processing shouldn't cause excessive memory growth
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB limit for concurrent operations

      console.log(`Concurrent processing memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Cross-Platform Performance Comparison', () => {
    test('should maintain consistent performance characteristics', async () => {
      const testCases = [
        { name: 'Small', size: 1024, threshold: PERFORMANCE_THRESHOLDS.PARSE_SMALL_AUDIO },
        { name: 'Medium', size: 22050, threshold: PERFORMANCE_THRESHOLDS.PARSE_MEDIUM_AUDIO / 2 },
        { name: 'Large', size: 44100, threshold: PERFORMANCE_THRESHOLDS.PARSE_MEDIUM_AUDIO }
      ];

      const parser = new BeatParser();
      const results: { [key: string]: { time: number; tempo: number } } = {};

      for (const testCase of testCases) {
        const audioData = new Float32Array(testCase.size);
        // Generate consistent test signal
        for (let i = 0; i < testCase.size; i++) {
          audioData[i] = Math.sin(2 * Math.PI * 120 * i / 44100) * 0.6; // 120 BPM signal
        }

        const startTime = performance.now();
        const result = await parser.parseBuffer(audioData);
        const endTime = performance.now();

        const processingTime = endTime - startTime;

        results[testCase.name] = {
          time: processingTime,
          tempo: result.tempo
        };

        expect(processingTime).toBeLessThan(testCase.threshold);
      }

      // Log performance summary
      console.log('Cross-platform performance summary:');
      for (const [name, result] of Object.entries(results)) {
        console.log(`  ${name}: ${result.time.toFixed(2)}ms, Tempo: ${result.tempo.toFixed(1)} BPM`);
      }

      // Check that performance scales reasonably
      expect(results.Medium.time).toBeGreaterThan(results.Small.time);
      expect(results.Large.time).toBeGreaterThan(results.Medium.time);

      // But not excessively
      expect(results.Large.time / results.Small.time).toBeLessThan(50);
    });

    test('should provide predictable performance metrics', () => {
      const audioData = new Float32Array(4096);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      }

      const operations = {
        'Feature Extraction': () => AudioProcessor.extractFeatures(audioData, 44100),
        'Spectrum Computation': () => AudioProcessor.computeSpectrum(audioData),
        'RMS Calculation': () => AudioUtils.calculateRMS(audioData),
        'Peak Detection': () => AudioUtils.detectPeaks(audioData, 0.3),
        'Normalization': () => AudioUtils.normalize(audioData)
      };

      const results: { [key: string]: number[] } = {};

      // Run each operation multiple times
      for (const [name, operation] of Object.entries(operations)) {
        results[name] = [];
        
        for (let run = 0; run < 5; run++) {
          const startTime = performance.now();
          const result = operation();
          const endTime = performance.now();
          
          results[name].push(endTime - startTime);
          expect(result).toBeDefined();
        }
      }

      // Analyze consistency
      console.log('Operation performance consistency:');
      for (const [name, times] of Object.entries(results)) {
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const variance = Math.max(...times.map(time => Math.abs(time - avg) / avg));
        
        console.log(`  ${name}: ${avg.toFixed(2)}ms avg, ${(variance * 100).toFixed(1)}% variance`);
        
        expect(variance).toBeLessThan(VARIANCE_THRESHOLDS.PROCESSING_TIME);
      }
    });
  });

  describe('Performance Edge Cases', () => {
    test('should handle edge case inputs efficiently', async () => {
      const parser = new BeatParser();
      const edgeCases = [
        { name: 'Silent', data: new Float32Array(1024).fill(0) },
        { name: 'Max amplitude', data: new Float32Array(1024).fill(1.0) },
        { name: 'DC signal', data: new Float32Array(1024).fill(0.5) },
        { name: 'Alternating', data: new Float32Array(1024).fill(0).map((_, i) => i % 2 ? 1 : -1) },
        { name: 'Random noise', data: new Float32Array(1024).fill(0).map(() => Math.random() * 2 - 1) }
      ];

      for (const edgeCase of edgeCases) {
        const startTime = performance.now();
        const result = await parser.parseBuffer(edgeCase.data);
        const endTime = performance.now();

        const processingTime = endTime - startTime;

        expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.PARSE_SMALL_AUDIO);
        expect(result).toBeDefined();
        expect(Array.isArray(result.beats)).toBe(true);
        expect(typeof result.tempo).toBe('number');
        expect(result.tempo).toBeGreaterThanOrEqual(0);

        console.log(`Edge case "${edgeCase.name}": ${processingTime.toFixed(2)}ms`);
      }
    });

    test('should handle minimum and maximum buffer sizes', async () => {
      const parser = new BeatParser();
      const sizes = [1, 256, 1024, 44100, 441000]; // From 1 sample to 10 seconds

      for (const size of sizes) {
        const audioData = new Float32Array(size);
        // Fill with test signal
        for (let i = 0; i < size; i++) {
          audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
        }

        const startTime = performance.now();
        
        try {
          const result = await parser.parseBuffer(audioData);
          const endTime = performance.now();
          
          const processingTime = endTime - startTime;
          
          // Very small buffers should process very quickly
          if (size <= 1024) {
            expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.PARSE_SMALL_AUDIO);
          }
          
          expect(result).toBeDefined();
          console.log(`Size ${size}: ${processingTime.toFixed(2)}ms`);
          
        } catch (error) {
          // Some very small sizes might legitimately fail
          if (size >= 256) {
            throw error;
          } else {
            console.log(`Size ${size}: Failed (expected for very small buffers)`);
          }
        }
      }
    });

    test('should maintain performance under stress conditions', async () => {
      const parser = new BeatParser();
      const stressTestDuration = 5000; // 5 seconds
      const startTime = Date.now();
      let operationCount = 0;
      const times: number[] = [];

      while (Date.now() - startTime < stressTestDuration) {
        const audioData = new Float32Array(2048);
        // Generate random test data
        for (let i = 0; i < audioData.length; i++) {
          audioData[i] = Math.sin(2 * Math.PI * (440 + Math.random() * 100) * i / 44100) * 0.5;
        }

        const opStart = performance.now();
        await parser.parseBuffer(audioData);
        const opEnd = performance.now();

        times.push(opEnd - opStart);
        operationCount++;

        // Brief pause to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      console.log(`Stress test results: ${operationCount} operations in 5s`);
      console.log(`  Average: ${avgTime.toFixed(2)}ms, Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);

      // Performance should remain stable under stress
      expect(maxTime).toBeLessThan(avgTime * 3); // Max time shouldn't be more than 3x average
      expect(operationCount).toBeGreaterThan(10); // Should complete at least 10 operations in 5 seconds
    });
  });
});