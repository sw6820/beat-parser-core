/**
 * Comprehensive integration tests bringing together all components
 * Tests the complete pipeline from audio input to final output
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient, isWorkerSupported } from '../worker';
import { HybridDetector } from '../algorithms/HybridDetector';
import type { ParseResult } from '../types';

describe('Comprehensive Integration Tests', () => {
  describe('Full Pipeline Integration', () => {
    let parser: BeatParser;

    beforeEach(() => {
      parser = new BeatParser({
        sampleRate: 44100,
        confidenceThreshold: 0.6,
        multiPassEnabled: true,
        includeMetadata: true,
        includeConfidenceScores: true
      });
    });

    afterEach(async () => {
      await parser.cleanup();
    });

    test('complete pipeline with all components', async () => {
      // Create realistic test audio
      const testAudio = new Float32Array(44100 * 10); // 10 seconds
      const bpm = 128;
      const beatInterval = (60 / bpm) * 44100;

      for (let i = 0; i < testAudio.length; i++) {
        const t = i / 44100;
        const beatPhase = i % beatInterval;

        if (beatPhase < 2205) { // 50ms kick
          const decay = Math.exp(-beatPhase / 44100 * 25);
          testAudio[i] = Math.sin(2 * Math.PI * 60 * t) * decay * 0.8;
        } else if (beatPhase > beatInterval * 0.45 && beatPhase < beatInterval * 0.55) {
          // Hi-hat
          testAudio[i] = (Math.random() - 0.5) * 0.2;
        } else {
          testAudio[i] = (Math.random() - 0.5) * 0.01;
        }
      }

      const result = await parser.parseBuffer(testAudio, {
        targetPictureCount: 15,
        filename: 'comprehensive-test.wav',
        selectionMethod: 'adaptive'
      });

      // Validate complete result structure
      expect(result).toHaveProperty('beats');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('tempo');
      expect(result).toHaveProperty('timeSignature');
      expect(result).toHaveProperty('metadata');

      // Validate beats
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(15);

      result.beats.forEach((beat, index) => {
        expect(beat).toHaveProperty('timestamp');
        expect(beat).toHaveProperty('confidence');
        expect(typeof beat.timestamp).toBe('number');
        expect(typeof beat.confidence).toBe('number');
        expect(beat.timestamp).toBeGreaterThanOrEqual(0);
        expect(beat.timestamp).toBeLessThanOrEqual(10);
        expect(beat.confidence).toBeGreaterThanOrEqual(0);
        expect(beat.confidence).toBeLessThanOrEqual(1);

        // Beats should be chronologically ordered
        if (index > 0) {
          expect(beat.timestamp).toBeGreaterThanOrEqual(result.beats[index - 1]!.timestamp);
        }
      });

      // Validate tempo detection
      expect(typeof result.tempo).toBe('number');
      if (result.tempo) {
        expect(result.tempo).toBeGreaterThan(0);
        expect(Math.abs(result.tempo - bpm)).toBeLessThan(20); // Within 20 BPM
      }

      // Validate metadata
      expect(result.metadata).toHaveProperty('filename', 'comprehensive-test.wav');
      expect(result.metadata).toHaveProperty('processingInfo');
      expect(result.metadata.processingInfo).toHaveProperty('audioLength', 10);
      expect(result.metadata.processingInfo).toHaveProperty('sampleRate', 44100);
      expect(result.metadata.processingInfo).toHaveProperty('algorithmsUsed');
      expect((result.metadata.processingInfo as any).algorithmsUsed).toContain('hybrid');
    });

    test('plugin system integration', async () => {
      // Create test plugins
      const audioEnhancerPlugin: BeatParserPlugin = {
        name: 'audio-enhancer',
        version: '1.0.0',
        initialize: jest.fn(),
        processAudio: jest.fn((audio) => {
          // Apply simple gain
          const processed = new Float32Array(audio.length);
          for (let i = 0; i < audio.length; i++) {
            processed[i] = audio[i]! * 1.2;
          }
          return processed;
        }),
        cleanup: jest.fn()
      };

      const beatFilterPlugin: BeatParserPlugin = {
        name: 'beat-filter',
        version: '1.0.0',
        initialize: jest.fn(),
        processBeats: jest.fn((beats) => {
          // Filter out low-confidence beats
          return beats.filter(beat => beat.confidence > 0.7);
        }),
        cleanup: jest.fn()
      };

      parser.addPlugin(audioEnhancerPlugin);
      parser.addPlugin(beatFilterPlugin);

      const plugins = parser.getPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins.find(p => p.name === 'audio-enhancer')).toBeDefined();
      expect(plugins.find(p => p.name === 'beat-filter')).toBeDefined();

      const testAudio = new Float32Array(4096);
      for (let i = 0; i < testAudio.length; i++) {
        testAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.1;
      }

      const result = await parser.parseBuffer(testAudio, {
        targetPictureCount: 5
      });

      // Verify plugin methods were called
      expect(audioEnhancerPlugin.initialize).toHaveBeenCalled();
      expect(audioEnhancerPlugin.processAudio).toHaveBeenCalled();
      expect(beatFilterPlugin.initialize).toHaveBeenCalled();
      expect(beatFilterPlugin.processBeats).toHaveBeenCalled();

      // Verify plugin effects
      const processedAudio = (audioEnhancerPlugin.processAudio as jest.Mock).mock.results[0]!.value;
      expect(processedAudio[0]).toBe(testAudio[0]! * 1.2);

      expect(result.beats).toBeDefined();
      expect((result.metadata.processingInfo as any).pluginsUsed).toHaveLength(2);
    });

    test('configuration inheritance and updates', async () => {
      const initialConfig = parser.getConfig();
      expect(initialConfig.sampleRate).toBe(44100);
      expect(initialConfig.confidenceThreshold).toBe(0.6);

      // Test configuration update before initialization
      parser.updateConfig({
        minTempo: 100,
        maxTempo: 160,
        confidenceThreshold: 0.8
      });

      const updatedConfig = parser.getConfig();
      expect(updatedConfig.minTempo).toBe(100);
      expect(updatedConfig.maxTempo).toBe(160);
      expect(updatedConfig.confidenceThreshold).toBe(0.8);
      expect(updatedConfig.sampleRate).toBe(44100); // Should retain original

      const testAudio = new Float32Array(4096).fill(0.1);
      await parser.parseBuffer(testAudio);

      // Should throw after initialization
      expect(() => {
        parser.updateConfig({ minTempo: 80 });
      }).toThrow();
    });

    test('error handling and recovery', async () => {
      // Test various error conditions
      await expect(parser.parseBuffer(new Float32Array(0))).rejects.toThrow('Invalid or empty audio data');

      const tooShort = new Float32Array(100);
      await expect(parser.parseBuffer(tooShort)).rejects.toThrow('Audio data too short');

      const invalidAudio = new Float32Array(4096);
      invalidAudio.fill(NaN);
      await expect(parser.parseBuffer(invalidAudio)).rejects.toThrow('Audio data contains invalid values');

      // Parser should still work after errors
      const validAudio = new Float32Array(4096).fill(0.1);
      const result = await parser.parseBuffer(validAudio);
      expect(result).toBeDefined();
    });
  });

  describe('Algorithm Integration', () => {
    test('HybridDetector standalone vs integrated', async () => {
      const testAudio = new Float32Array(44100 * 5);
      for (let i = 0; i < testAudio.length; i++) {
        if (i % 22050 === 0) { // Beat every 0.5 seconds
          testAudio[i] = 0.8;
        } else {
          testAudio[i] = (Math.random() - 0.5) * 0.05;
        }
      }

      // Test standalone detector
      const detector = new HybridDetector({
        sampleRate: 44100,
        minTempo: 60,
        maxTempo: 200
      });

      const standaloneBeats = await detector.detectBeats(testAudio);

      // Test integrated detector
      const parser = new BeatParser({
        sampleRate: 44100,
        minTempo: 60,
        maxTempo: 200
      });

      try {
        const integratedResult = await parser.parseBuffer(testAudio);

        // Both should detect similar beats
        expect(standaloneBeats.length).toBeGreaterThan(0);
        expect(integratedResult.beats.length).toBeGreaterThan(0);

        // Integrated version might have fewer beats due to selection
        expect(integratedResult.beats.length).toBeLessThanOrEqual(standaloneBeats.length);

        // Check that beats are similar in timing
        if (standaloneBeats.length > 0 && integratedResult.beats.length > 0) {
          const firstStandalone = standaloneBeats[0]!.timestamp;
          const firstIntegrated = integratedResult.beats[0]!.timestamp;
          expect(Math.abs(firstStandalone - firstIntegrated)).toBeLessThan(0.1);
        }
      } finally {
        await parser.cleanup();
      }
    });

    test('algorithm configuration impact', async () => {
      const testAudio = new Float32Array(44100 * 8);
      for (let i = 0; i < testAudio.length; i++) {
        const t = i / 44100;
        if (Math.floor(t * 2) % 2 === 0 && (t * 2) % 1 < 0.05) {
          testAudio[i] = 0.7; // Beat every 0.5 seconds
        } else {
          testAudio[i] = Math.sin(2 * Math.PI * 220 * t) * 0.1;
        }
      }

      const configs = [
        { onsetWeight: 0.8, tempoWeight: 0.1, spectralWeight: 0.1, label: 'onset-focused' },
        { onsetWeight: 0.1, tempoWeight: 0.8, spectralWeight: 0.1, label: 'tempo-focused' },
        { onsetWeight: 0.3, tempoWeight: 0.3, spectralWeight: 0.4, label: 'spectral-focused' },
        { onsetWeight: 0.33, tempoWeight: 0.33, spectralWeight: 0.34, label: 'balanced' }
      ];

      const results = [];
      for (const config of configs) {
        const parser = new BeatParser({
          sampleRate: 44100,
          ...config
        });

        try {
          const result = await parser.parseBuffer(testAudio, {
            targetPictureCount: 10
          });

          results.push({
            label: config.label,
            beatCount: result.beats.length,
            avgConfidence: result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length,
            tempo: result.tempo
          });
        } finally {
          await parser.cleanup();
        }
      }

      // All configurations should detect reasonable number of beats
      results.forEach(result => {
        expect(result.beatCount).toBeGreaterThan(0);
        expect(result.avgConfidence).toBeGreaterThan(0.3);
        expect(result.tempo).toBeGreaterThan(0);
      });

      console.log('Algorithm configuration results:', results);
    });
  });

  describe('Worker Integration', () => {
    let workerClient: BeatParserWorkerClient | null = null;

    beforeEach(() => {
      if (isWorkerSupported()) {
        workerClient = new BeatParserWorkerClient({
          timeout: 30000
        });
      }
    });

    afterEach(async () => {
      if (workerClient) {
        await workerClient.terminate();
        workerClient = null;
      }
    });

    test('worker vs main thread comparison', async () => {
      if (!workerClient) {
        console.log('Skipping worker test - workers not supported');
        return;
      }

      const testAudio = new Float32Array(44100 * 6);
      for (let i = 0; i < testAudio.length; i++) {
        if (i % 11025 === 0) { // 4 beats per second
          testAudio[i] = 0.9;
        } else {
          testAudio[i] = Math.sin(2 * Math.PI * 300 * i / 44100) * 0.1;
        }
      }

      // Main thread processing
      const mainParser = new BeatParser({
        sampleRate: 44100,
        confidenceThreshold: 0.6
      });

      try {
        const mainResult = await mainParser.parseBuffer(testAudio, {
          targetPictureCount: 12,
          filename: 'main-thread.wav'
        });

        // Worker processing
        const workerResult = await workerClient.parseBuffer(testAudio, {
          targetPictureCount: 12,
          filename: 'worker-thread.wav'
        }, {
          sampleRate: 44100,
          confidenceThreshold: 0.6
        });

        // Results should be comparable
        expect(mainResult.beats).toBeDefined();
        expect(workerResult.beats).toBeDefined();
        expect(mainResult.beats.length).toBeGreaterThan(0);
        expect(workerResult.beats.length).toBeGreaterThan(0);

        // Timing should be similar (within 100ms tolerance)
        const mainTimestamps = mainResult.beats.map(b => b.timestamp).sort();
        const workerTimestamps = workerResult.beats.map(b => b.timestamp).sort();

        if (mainTimestamps.length > 0 && workerTimestamps.length > 0) {
          expect(Math.abs(mainTimestamps[0]! - workerTimestamps[0]!)).toBeLessThan(0.1);
        }
      } finally {
        await mainParser.cleanup();
      }
    });

    test('worker progress tracking and cancellation', async () => {
      if (!workerClient) {
        console.log('Skipping worker test - workers not supported');
        return;
      }

      const largeAudio = new Float32Array(44100 * 20); // 20 seconds
      for (let i = 0; i < largeAudio.length; i++) {
        largeAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.1;
      }

      const progressUpdates: Array<{ percentage: number; stage: string }> = [];
      
      // Start processing
      const promise = workerClient.parseBuffer(largeAudio, {
        targetPictureCount: 30,
        progressCallback: (progress) => {
          progressUpdates.push({
            percentage: progress.percentage,
            stage: progress.stage
          });
          
          // Cancel after first progress update
          if (progressUpdates.length === 1) {
            workerClient!.cancelOperation();
          }
        }
      });

      // Should be cancelled
      await expect(promise).rejects.toThrow('Operation cancelled');
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].percentage).toBeGreaterThanOrEqual(0);
    });

    test('worker batch processing efficiency', async () => {
      if (!workerClient) {
        console.log('Skipping worker test - workers not supported');
        return;
      }

      const audioSamples = Array.from({ length: 4 }, (_, index) => {
        const audio = new Float32Array(44100 * 3); // 3 seconds each
        for (let i = 0; i < audio.length; i++) {
          if (i % (11025 * (index + 1)) === 0) { // Different beat patterns
            audio[i] = 0.8;
          } else {
            audio[i] = Math.sin(2 * Math.PI * (200 + index * 50) * i / 44100) * 0.1;
          }
        }
        return audio;
      });

      const options = audioSamples.map((_, index) => ({
        targetPictureCount: 5,
        filename: `batch-${index}.wav`
      }));

      const startTime = Date.now();
      const results = await workerClient.processBatch(audioSamples, options);
      const batchTime = Date.now() - startTime;

      expect(results).toHaveLength(4);
      results.forEach((result, index) => {
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(5);
        expect(result.metadata.filename).toBe(`batch-${index}.wav`);
      });

      console.log(`Batch processing time: ${batchTime}ms for 4 samples`);
      expect(batchTime).toBeLessThan(60000); // Should complete within 1 minute
    });
  });

  describe('Cross-Component Validation', () => {
    test('output format consistency across components', async () => {
      const testAudio = new Float32Array(44100 * 4);
      for (let i = 0; i < testAudio.length; i++) {
        if (i % 22050 === 0) {
          testAudio[i] = 0.8;
        } else {
          testAudio[i] = (Math.random() - 0.5) * 0.03;
        }
      }

      const outputFormats: Array<'json' | 'xml' | 'csv'> = ['json', 'xml', 'csv'];
      const results = [];

      for (const format of outputFormats) {
        const parser = new BeatParser({
          outputFormat: format,
          includeMetadata: true,
          includeConfidenceScores: true
        });

        try {
          const result = await parser.parseBuffer(testAudio, {
            targetPictureCount: 6,
            filename: `test.${format}`
          });

          results.push({ format, result });

          // All formats should have the same core data
          expect(result.beats).toBeDefined();
          expect(result.confidence).toBeDefined();
          expect(result.tempo).toBeDefined();
          expect(result.metadata).toBeDefined();
          expect(result.metadata.filename).toBe(`test.${format}`);
        } finally {
          await parser.cleanup();
        }
      }

      // Cross-validate that all formats produced equivalent results
      if (results.length > 1) {
        const reference = results[0].result;
        results.slice(1).forEach(({ format, result }) => {
          expect(result.beats.length).toBe(reference.beats.length);
          expect(Math.abs(result.tempo - reference.tempo)).toBeLessThan(1);
          expect(Math.abs(result.confidence - reference.confidence)).toBeLessThan(0.1);
        });
      }
    });

    test('configuration propagation through pipeline', async () => {
      const customConfig: BeatParserConfig = {
        sampleRate: 48000,
        hopSize: 256,
        frameSize: 1024,
        minTempo: 80,
        maxTempo: 160,
        onsetWeight: 0.5,
        tempoWeight: 0.3,
        spectralWeight: 0.2,
        confidenceThreshold: 0.7,
        multiPassEnabled: false,
        genreAdaptive: false
      };

      const parser = new BeatParser(customConfig);
      
      try {
        const retrievedConfig = parser.getConfig();
        
        // Verify all custom configurations are applied
        expect(retrievedConfig.sampleRate).toBe(48000);
        expect(retrievedConfig.hopSize).toBe(256);
        expect(retrievedConfig.frameSize).toBe(1024);
        expect(retrievedConfig.minTempo).toBe(80);
        expect(retrievedConfig.maxTempo).toBe(160);
        expect(retrievedConfig.onsetWeight).toBe(0.5);
        expect(retrievedConfig.tempoWeight).toBe(0.3);
        expect(retrievedConfig.spectralWeight).toBe(0.2);
        expect(retrievedConfig.confidenceThreshold).toBe(0.7);
        expect(retrievedConfig.multiPassEnabled).toBe(false);
        expect(retrievedConfig.genreAdaptive).toBe(false);

        // Test that configuration affects processing
        const testAudio = new Float32Array(48000 * 3); // 3 seconds at 48kHz
        for (let i = 0; i < testAudio.length; i++) {
          if (i % 24000 === 0) { // 2 beats per second
            testAudio[i] = 0.8;
          } else {
            testAudio[i] = Math.sin(2 * Math.PI * 400 * i / 48000) * 0.1;
          }
        }

        const result = await parser.parseBuffer(testAudio, {
          targetPictureCount: 8
        });

        expect(result.beats).toBeDefined();
        expect((result.metadata.processingInfo as any).sampleRate).toBe(48000);
      } finally {
        await parser.cleanup();
      }
    });

    test('memory management across components', async () => {
      const initialMemory = process.memoryUsage();
      const parsers: BeatParser[] = [];

      try {
        // Create multiple parsers with different configurations
        for (let i = 0; i < 5; i++) {
          const parser = new BeatParser({
            sampleRate: 44100,
            frameSize: 2048 + i * 512,
            confidenceThreshold: 0.5 + i * 0.1
          });

          const testAudio = new Float32Array(44100 * 2); // 2 seconds
          for (let j = 0; j < testAudio.length; j++) {
            testAudio[j] = Math.sin(2 * Math.PI * 440 * j / 44100) * 0.1;
          }

          await parser.parseBuffer(testAudio, { targetPictureCount: 5 });
          parsers.push(parser);
        }

        const peakMemory = process.memoryUsage();
        const memoryIncrease = peakMemory.heapUsed - initialMemory.heapUsed;

        // Clean up all parsers
        await Promise.all(parsers.map(p => p.cleanup()));
        parsers.length = 0;

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const finalMemory = process.memoryUsage();
        const memoryRetained = finalMemory.heapUsed - initialMemory.heapUsed;

        console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        console.log(`Memory retained: ${(memoryRetained / 1024 / 1024).toFixed(2)}MB`);

        // Memory increase should be reasonable
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB

        // Memory retention should be minimal after cleanup
        if (global.gc) {
          expect(memoryRetained).toBeLessThan(10 * 1024 * 1024); // Less than 10MB retained
        }
      } finally {
        // Ensure cleanup even if test fails
        await Promise.all(parsers.map(p => p.cleanup()));
      }
    });
  });

  describe('Production Readiness', () => {
    test('library exports and API surface', () => {
      // Test all expected exports are available
      expect(BeatParser).toBeDefined();
      expect(typeof BeatParser).toBe('function');
      expect(typeof BeatParser.getVersion).toBe('function');
      expect(typeof BeatParser.getSupportedFormats).toBe('function');

      expect(HybridDetector).toBeDefined();
      expect(typeof HybridDetector).toBe('function');

      if (isWorkerSupported()) {
        expect(BeatParserWorkerClient).toBeDefined();
        expect(typeof BeatParserWorkerClient).toBe('function');
      }

      // Test version information
      const version = BeatParser.getVersion();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);

      // Test supported formats
      const formats = BeatParser.getSupportedFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
      formats.forEach(format => {
        expect(typeof format).toBe('string');
        expect(format.startsWith('.')).toBe(true);
      });
    });

    test('graceful degradation and error recovery', async () => {
      const parser = new BeatParser();
      let successCount = 0;
      let errorCount = 0;

      const testCases = [
        new Float32Array(4096).fill(0.1), // Valid
        new Float32Array(0), // Empty
        new Float32Array(100), // Too short
        new Float32Array(4096).fill(NaN), // Invalid values
        new Float32Array(4096).fill(0.5), // Valid
      ];

      for (const testAudio of testCases) {
        try {
          await parser.parseBuffer(testAudio, { targetPictureCount: 5 });
          successCount++;
        } catch (error) {
          errorCount++;
          expect(error).toBeInstanceOf(Error);
        }
      }

      expect(successCount).toBe(2); // Two valid cases
      expect(errorCount).toBe(3); // Three invalid cases

      // Parser should still be functional after errors
      const finalTest = new Float32Array(4096).fill(0.2);
      const result = await parser.parseBuffer(finalTest);
      expect(result).toBeDefined();

      await parser.cleanup();
    });

    test('concurrent usage safety', async () => {
      const concurrentOperations = 5;
      const parsers = Array.from({ length: concurrentOperations }, () => new BeatParser());
      const testAudios = parsers.map((_, index) => {
        const audio = new Float32Array(44100 * 2);
        for (let i = 0; i < audio.length; i++) {
          if (i % (22050 / (index + 1)) === 0) {
            audio[i] = 0.8;
          } else {
            audio[i] = Math.sin(2 * Math.PI * (300 + index * 50) * i / 44100) * 0.1;
          }
        }
        return audio;
      });

      try {
        const startTime = Date.now();
        const results = await Promise.all(
          parsers.map((parser, index) =>
            parser.parseBuffer(testAudios[index], {
              targetPictureCount: 6,
              filename: `concurrent-${index}.wav`
            })
          )
        );
        const totalTime = Date.now() - startTime;

        expect(results).toHaveLength(concurrentOperations);
        results.forEach((result, index) => {
          expect(result.beats).toBeDefined();
          expect(result.metadata.filename).toBe(`concurrent-${index}.wav`);
        });

        console.log(`Concurrent processing time: ${totalTime}ms for ${concurrentOperations} parsers`);
        expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      } finally {
        await Promise.all(parsers.map(p => p.cleanup()));
      }
    });

    test('performance consistency across runs', async () => {
      const testAudio = new Float32Array(44100 * 5);
      for (let i = 0; i < testAudio.length; i++) {
        if (i % 11025 === 0) {
          testAudio[i] = 0.8;
        } else {
          testAudio[i] = Math.sin(2 * Math.PI * 220 * i / 44100) * 0.1;
        }
      }

      const runTimes: number[] = [];
      const runResults: ParseResult[] = [];

      for (let run = 0; run < 3; run++) {
        const parser = new BeatParser();
        
        try {
          const startTime = Date.now();
          const result = await parser.parseBuffer(testAudio, {
            targetPictureCount: 10
          });
          const runTime = Date.now() - startTime;

          runTimes.push(runTime);
          runResults.push(result);
        } finally {
          await parser.cleanup();
        }
      }

      // Performance should be consistent (within 2x variation)
      const minTime = Math.min(...runTimes);
      const maxTime = Math.max(...runTimes);
      expect(maxTime / minTime).toBeLessThan(2);

      // Results should be consistent
      const referenceResult = runResults[0]!;
      runResults.slice(1).forEach(result => {
        expect(result.beats.length).toBe(referenceResult.beats.length);
        if (result.tempo && referenceResult.tempo) {
          expect(Math.abs(result.tempo - referenceResult.tempo)).toBeLessThan(5);
        }
      });

      console.log(`Run times: ${runTimes.map(t => `${t}ms`).join(', ')}`);
    });
  });
});