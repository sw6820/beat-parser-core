/**
 * Performance benchmark tests for BeatParser
 * Tests processing speed, memory usage, and scalability
 */

import { BeatParser } from '../core/BeatParser';
import type { ParseResult, BeatCandidate } from '../types';

describe('BeatParser Performance Benchmarks', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.6,
      multiPassEnabled: true
    });
  });

  afterEach(async () => {
    await parser.cleanup();
  });

  // Utility functions for generating test audio
  const generateTestAudio = (duration: number, bpm: number, complexity: 'simple' | 'moderate' | 'complex' = 'moderate'): Float32Array => {
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);
    const beatInterval = (60 / bpm) * sampleRate;

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const beatPhase = i % beatInterval;
      
      if (complexity === 'simple') {
        // Simple kick drum pattern
        if (beatPhase < sampleRate * 0.05) {
          const decay = Math.exp(-beatPhase / sampleRate * 30);
          audio[i] = Math.sin(2 * Math.PI * 60 * t) * decay * 0.8;
        } else {
          audio[i] = (Math.random() - 0.5) * 0.03;
        }
      } else if (complexity === 'moderate') {
        // Add hi-hats and snare
        const kickPhase = beatPhase < sampleRate * 0.05;
        const snarePhase = (beatPhase > beatInterval * 0.4) && (beatPhase < beatInterval * 0.4 + sampleRate * 0.03);
        const hihatPhase = Math.floor(beatPhase / (beatInterval / 4)) % 2 === 0;
        
        if (kickPhase) {
          const decay = Math.exp(-beatPhase / sampleRate * 30);
          audio[i] = Math.sin(2 * Math.PI * 60 * t) * decay * 0.8;
        } else if (snarePhase) {
          const noise = (Math.random() - 0.5) * 0.6;
          const tone = Math.sin(2 * Math.PI * 200 * t) * 0.3;
          audio[i] = noise + tone;
        } else if (hihatPhase && Math.random() < 0.1) {
          audio[i] = (Math.random() - 0.5) * 0.2;
        } else {
          audio[i] = (Math.random() - 0.5) * 0.02;
        }
      } else {
        // Complex polyrhythmic pattern
        const patterns = [
          { freq: 60, interval: beatInterval, decay: 30 },
          { freq: 200, interval: beatInterval * 0.5, decay: 20 },
          { freq: 8000, interval: beatInterval * 0.25, decay: 50 }
        ];
        
        let sample = 0;
        for (const pattern of patterns) {
          const patternPhase = i % pattern.interval;
          if (patternPhase < sampleRate * 0.02) {
            const decay = Math.exp(-patternPhase / sampleRate * pattern.decay);
            sample += Math.sin(2 * Math.PI * pattern.freq * t) * decay * 0.3;
          }
        }
        audio[i] = sample + (Math.random() - 0.5) * 0.05;
      }
    }

    return audio;
  };

  const measurePerformance = async <T>(
    operation: () => Promise<T>,
    label: string
  ): Promise<{ result: T; duration: number; memory?: NodeJS.MemoryUsage }> => {
    const memBefore = process.memoryUsage();
    const startTime = process.hrtime.bigint();
    
    const result = await operation();
    
    const endTime = process.hrtime.bigint();
    const memAfter = process.memoryUsage();
    const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
    
    const memoryDelta = {
      rss: memAfter.rss - memBefore.rss,
      heapTotal: memAfter.heapTotal - memBefore.heapTotal,
      heapUsed: memAfter.heapUsed - memBefore.heapUsed,
      external: memAfter.external - memBefore.external,
      arrayBuffers: memAfter.arrayBuffers - memBefore.arrayBuffers
    };

    console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms, Heap delta: ${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    
    return {
      result,
      duration,
      memory: memoryDelta
    };
  };

  describe('Processing Speed Benchmarks', () => {
    test('short audio processing (5 seconds)', async () => {
      const testAudio = generateTestAudio(5, 120, 'moderate');
      
      const { duration, result } = await measurePerformance(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 10 }),
        'Short audio (5s)'
      );

      expect(result.beats).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(result.beats.length).toBeLessThanOrEqual(10);
    });

    test('medium audio processing (30 seconds)', async () => {
      const testAudio = generateTestAudio(30, 120, 'moderate');
      
      const { duration, result } = await measurePerformance(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 20 }),
        'Medium audio (30s)'
      );

      expect(result.beats).toBeDefined();
      expect(duration).toBeLessThan(15000); // Should complete in under 15 seconds
      expect(result.beats.length).toBeLessThanOrEqual(20);
    });

    test('long audio processing (2 minutes)', async () => {
      const testAudio = generateTestAudio(120, 120, 'moderate');
      
      const { duration, result } = await measurePerformance(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 40 }),
        'Long audio (2min)'
      );

      expect(result.beats).toBeDefined();
      expect(duration).toBeLessThan(60000); // Should complete in under 1 minute
      expect(result.beats.length).toBeLessThanOrEqual(40);
    });

    test('processing speed scales linearly with audio length', async () => {
      const durations = [5, 10, 20, 40];
      const results: Array<{ duration: number; audioLength: number; beatsPerSecond: number }> = [];

      for (const audioDuration of durations) {
        const testAudio = generateTestAudio(audioDuration, 120, 'simple');
        
        const { duration, result } = await measurePerformance(
          () => parser.parseBuffer(testAudio, { targetPictureCount: Math.floor(audioDuration / 2) }),
          `Linear scaling test (${audioDuration}s)`
        );

        const beatsPerSecond = result.beats.length / (duration / 1000);
        results.push({
          duration,
          audioLength: audioDuration,
          beatsPerSecond
        });
      }

      // Check that processing time grows roughly linearly
      for (let i = 1; i < results.length; i++) {
        const prevResult = results[i - 1];
        const currentResult = results[i];
        
        const lengthRatio = currentResult.audioLength / prevResult.audioLength;
        const timeRatio = currentResult.duration / prevResult.duration;
        
        // Time ratio should be within 50% of length ratio (allowing for some variance)
        expect(timeRatio).toBeLessThan(lengthRatio * 2);
        expect(timeRatio).toBeGreaterThan(lengthRatio * 0.5);
      }
    });
  });

  describe('Memory Usage Benchmarks', () => {
    test('memory usage remains bounded for large files', async () => {
      const testAudio = generateTestAudio(60, 120, 'moderate'); // 1 minute
      const initialMemory = process.memoryUsage();

      const { memory, result } = await measurePerformance(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 30 }),
        'Memory usage test (60s)'
      );

      expect(result.beats).toBeDefined();
      
      // Memory increase should be reasonable (less than 100MB for 60s audio)
      if (memory) {
        const heapIncreaseMB = memory.heapUsed / 1024 / 1024;
        expect(heapIncreaseMB).toBeLessThan(100);
        console.log(`Memory increase: ${heapIncreaseMB.toFixed(2)}MB`);
      }

      // Force garbage collection and verify memory is released
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
        const finalMemory = process.memoryUsage();
        const memoryRetained = finalMemory.heapUsed - initialMemory.heapUsed;
        const retainedMB = memoryRetained / 1024 / 1024;
        expect(retainedMB).toBeLessThan(10); // Should retain less than 10MB
      }
    });

    test('cleanup releases resources properly', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process multiple files
      for (let i = 0; i < 5; i++) {
        const testAudio = generateTestAudio(10, 120 + i * 10, 'moderate');
        await parser.parseBuffer(testAudio, { targetPictureCount: 10 });
      }
      
      await parser.cleanup();
      
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
        
        expect(memoryIncrease).toBeLessThan(5); // Should not retain more than 5MB
      }
    });
  });

  describe('Algorithmic Complexity Benchmarks', () => {
    test('different tempo ranges performance', async () => {
      const tempoRanges = [
        { min: 60, max: 80, label: 'Slow (60-80 BPM)' },
        { min: 100, max: 140, label: 'Moderate (100-140 BPM)' },
        { min: 160, max: 200, label: 'Fast (160-200 BPM)' }
      ];

      for (const range of tempoRanges) {
        const customParser = new BeatParser({
          minTempo: range.min,
          maxTempo: range.max
        });

        const testAudio = generateTestAudio(20, (range.min + range.max) / 2, 'moderate');
        
        const { duration, result } = await measurePerformance(
          () => customParser.parseBuffer(testAudio, { targetPictureCount: 15 }),
          range.label
        );

        expect(result.beats).toBeDefined();
        expect(duration).toBeLessThan(10000); // All should complete within 10 seconds
        
        await customParser.cleanup();
      }
    });

    test('audio complexity impact on performance', async () => {
      const complexities: Array<{ level: 'simple' | 'moderate' | 'complex'; label: string }> = [
        { level: 'simple', label: 'Simple (kick only)' },
        { level: 'moderate', label: 'Moderate (kick + snare + hihat)' },
        { level: 'complex', label: 'Complex (polyrhythmic)' }
      ];

      const results: Array<{ complexity: string; duration: number; beatsFound: number }> = [];

      for (const complexity of complexities) {
        const testAudio = generateTestAudio(15, 120, complexity.level);
        
        const { duration, result } = await measurePerformance(
          () => parser.parseBuffer(testAudio, { targetPictureCount: 20 }),
          complexity.label
        );

        results.push({
          complexity: complexity.label,
          duration,
          beatsFound: result.beats.length
        });
      }

      // Complex audio should not take dramatically longer than simple audio
      const simpleTime = results.find(r => r.complexity.includes('Simple'))?.duration || 0;
      const complexTime = results.find(r => r.complexity.includes('Complex'))?.duration || 0;
      
      if (simpleTime > 0 && complexTime > 0) {
        const complexityRatio = complexTime / simpleTime;
        expect(complexityRatio).toBeLessThan(5); // Complex should not be >5x slower
      }
    });
  });

  describe('Concurrent Processing Benchmarks', () => {
    test('multiple parser instances performance', async () => {
      const parsers = Array.from({ length: 3 }, () => new BeatParser());
      const testAudios = Array.from({ length: 3 }, (_, i) => 
        generateTestAudio(10, 120 + i * 20, 'moderate')
      );

      try {
        const { duration } = await measurePerformance(
          () => Promise.all(
            parsers.map((p, i) => p.parseBuffer(testAudios[i], { targetPictureCount: 10 }))
          ),
          'Concurrent processing (3 parsers)'
        );

        // Concurrent processing should not be dramatically slower than sequential
        expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      } finally {
        await Promise.all(parsers.map(p => p.cleanup()));
      }
    });

    test('batch processing vs individual processing', async () => {
      const batchSize = 5;
      const testAudios = Array.from({ length: batchSize }, (_, i) => 
        generateTestAudio(5, 120 + i * 10, 'simple')
      );

      // Individual processing
      const individualParser = new BeatParser();
      const { duration: individualDuration } = await measurePerformance(
        async () => {
          const results = [];
          for (const audio of testAudios) {
            results.push(await individualParser.parseBuffer(audio, { targetPictureCount: 5 }));
          }
          return results;
        },
        'Individual processing'
      );
      await individualParser.cleanup();

      // Batch processing (simulated - would use worker in real scenario)
      const batchParser = new BeatParser();
      const { duration: batchDuration } = await measurePerformance(
        () => Promise.all(
          testAudios.map(audio => batchParser.parseBuffer(audio, { targetPictureCount: 5 }))
        ),
        'Batch processing'
      );
      await batchParser.cleanup();

      // Batch should be faster or comparable
      expect(batchDuration).toBeLessThanOrEqual(individualDuration * 1.2);
    });
  });

  describe('Real-world Performance Scenarios', () => {
    test('DJ mix processing simulation', async () => {
      // Simulate a DJ mix with tempo changes and various genres
      const segments = [
        { duration: 30, bpm: 128, complexity: 'moderate' as const },
        { duration: 30, bpm: 132, complexity: 'complex' as const },
        { duration: 30, bpm: 125, complexity: 'moderate' as const },
        { duration: 30, bpm: 140, complexity: 'complex' as const }
      ];

      const results: ParseResult[] = [];
      let totalDuration = 0;

      for (const [index, segment] of segments.entries()) {
        const testAudio = generateTestAudio(segment.duration, segment.bpm, segment.complexity);
        
        const { duration, result } = await measurePerformance(
          () => parser.parseBuffer(testAudio, { 
            targetPictureCount: Math.floor(segment.duration / 2),
            filename: `mix_segment_${index + 1}`
          }),
          `DJ Mix Segment ${index + 1} (${segment.bpm} BPM)`
        );

        results.push(result);
        totalDuration += duration;
      }

      expect(results).toHaveLength(4);
      expect(totalDuration).toBeLessThan(120000); // Should complete within 2 minutes
      
      // Each segment should have detected beats
      results.forEach((result, index) => {
        expect(result.beats.length).toBeGreaterThan(0);
        expect(result.beats.length).toBeLessThanOrEqual(segments[index].duration / 2);
      });
    });

    test('podcast processing with music segments', async () => {
      // Simulate podcast with intro music, speech, and outro music
      const segments = [
        { type: 'music', duration: 10, bpm: 120 },
        { type: 'speech', duration: 60, bpm: 0 }, // Speech has no clear rhythm
        { type: 'music', duration: 10, bpm: 110 }
      ];

      for (const [index, segment] of segments.entries()) {
        let testAudio: Float32Array;
        
        if (segment.type === 'music') {
          testAudio = generateTestAudio(segment.duration, segment.bpm, 'simple');
        } else {
          // Generate speech-like audio (random walk with formants)
          testAudio = new Float32Array(segment.duration * 44100);
          let phase = 0;
          for (let i = 0; i < testAudio.length; i++) {
            phase += (Math.random() - 0.5) * 0.01;
            const formant1 = Math.sin(2 * Math.PI * 800 * i / 44100 + phase);
            const formant2 = Math.sin(2 * Math.PI * 1200 * i / 44100 + phase * 0.7);
            testAudio[i] = (formant1 + formant2 * 0.5) * 0.1 * (0.5 + Math.random() * 0.5);
          }
        }

        const { duration, result } = await measurePerformance(
          () => parser.parseBuffer(testAudio, { 
            targetPictureCount: segment.type === 'music' ? 8 : 2,
            filename: `podcast_${segment.type}_${index}`
          }),
          `Podcast ${segment.type} segment`
        );

        if (segment.type === 'music') {
          expect(result.beats.length).toBeGreaterThan(0);
        }
        // Speech might have some false positives, but should be fewer
        expect(result.beats.length).toBeLessThanOrEqual(segment.type === 'music' ? 8 : 5);
      }
    });
  });

  describe('Performance Regression Tests', () => {
    const benchmarkTargets = {
      shortAudio: { duration: 5, maxTime: 3000, bpm: 120 }, // 3 seconds max
      mediumAudio: { duration: 30, maxTime: 12000, bpm: 120 }, // 12 seconds max
      longAudio: { duration: 120, maxTime: 45000, bpm: 120 }, // 45 seconds max
      memoryUsage: { maxIncreaseMB: 50 } // 50MB max increase
    };

    test('performance meets benchmark targets', async () => {
      for (const [testName, target] of Object.entries(benchmarkTargets)) {
        if (testName === 'memoryUsage') continue;
        
        const audioTarget = target as { duration: number; maxTime: number; bpm: number };
        const testAudio = generateTestAudio(audioTarget.duration, audioTarget.bpm, 'moderate');
        
        const { duration } = await measurePerformance(
          () => parser.parseBuffer(testAudio, { 
            targetPictureCount: Math.floor(audioTarget.duration / 3) 
          }),
          `Benchmark: ${testName}`
        );

        expect(duration).toBeLessThan(audioTarget.maxTime);
        console.log(`✅ ${testName}: ${duration.toFixed(0)}ms (target: ${audioTarget.maxTime}ms)`);
      }
    });

    test('memory usage meets benchmark targets', async () => {
      const initialMemory = process.memoryUsage();
      const testAudio = generateTestAudio(60, 120, 'moderate');

      const { memory } = await measurePerformance(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 20 }),
        'Memory benchmark'
      );

      if (memory) {
        const memoryIncreaseMB = memory.heapUsed / 1024 / 1024;
        expect(memoryIncreaseMB).toBeLessThan(benchmarkTargets.memoryUsage.maxIncreaseMB);
        console.log(`✅ Memory usage: ${memoryIncreaseMB.toFixed(1)}MB (target: ${benchmarkTargets.memoryUsage.maxIncreaseMB}MB)`);
      }
    });
  });

  describe('Configuration Impact on Performance', () => {
    test('multiPass disabled vs enabled performance', async () => {
      const testAudio = generateTestAudio(20, 120, 'moderate');
      
      const singlePassParser = new BeatParser({
        multiPassEnabled: false,
        confidenceThreshold: 0.5
      });
      
      const multiPassParser = new BeatParser({
        multiPassEnabled: true,
        confidenceThreshold: 0.5
      });

      try {
        const { duration: singlePassTime } = await measurePerformance(
          () => singlePassParser.parseBuffer(testAudio, { targetPictureCount: 15 }),
          'Single pass processing'
        );

        const { duration: multiPassTime } = await measurePerformance(
          () => multiPassParser.parseBuffer(testAudio, { targetPictureCount: 15 }),
          'Multi pass processing'
        );

        // Multi-pass should be slower but not dramatically so
        expect(multiPassTime).toBeGreaterThan(singlePassTime);
        expect(multiPassTime).toBeLessThan(singlePassTime * 3); // Should not be >3x slower
      } finally {
        await singlePassParser.cleanup();
        await multiPassParser.cleanup();
      }
    });

    test('frame size impact on performance', async () => {
      const frameSizes = [1024, 2048, 4096];
      const testAudio = generateTestAudio(15, 120, 'moderate');
      const results: Array<{ frameSize: number; duration: number }> = [];

      for (const frameSize of frameSizes) {
        const customParser = new BeatParser({
          frameSize,
          hopSize: frameSize / 4
        });

        try {
          const { duration } = await measurePerformance(
            () => customParser.parseBuffer(testAudio, { targetPictureCount: 12 }),
            `Frame size ${frameSize}`
          );

          results.push({ frameSize, duration });
        } finally {
          await customParser.cleanup();
        }
      }

      // Larger frame sizes might be slightly slower due to more computation
      // but should also provide better accuracy
      results.forEach(result => {
        expect(result.duration).toBeLessThan(15000); // All should be reasonable
      });
    });
  });
});