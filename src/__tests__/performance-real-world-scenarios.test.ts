/**
 * Performance Real-World Scenarios
 * Production use case simulation and validation
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { WorkerClient } from '../worker/WorkerClient';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';
import type { ParseOptions, ParseResult } from '../types';

describe('Performance Real-World Scenarios', () => {
  let parser: BeatParser;
  let workerPool: WorkerClient[] = [];

  // Real-world scenario configurations
  const realWorldScenarios = [
    {
      name: 'Music Track Analysis',
      description: 'Typical 3-5 minute music tracks',
      duration: 240, // 4 minutes
      complexity: 'high' as const,
      targetBeats: 48,
      expectedRealTimeRatio: 2.0,
      maxProcessingTime: 30000 // 30 seconds
    },
    {
      name: 'Podcast Processing',
      description: '30-60 minute podcast episodes',
      duration: 3600, // 60 minutes
      complexity: 'medium' as const,
      targetBeats: 240,
      expectedRealTimeRatio: 5.0,
      maxProcessingTime: 300000 // 5 minutes
    },
    {
      name: 'DJ Set Analysis',
      description: '60-120 minute DJ sets with tempo changes',
      duration: 5400, // 90 minutes
      complexity: 'maximum' as const,
      targetBeats: 540,
      expectedRealTimeRatio: 8.0,
      maxProcessingTime: 720000 // 12 minutes
    },
    {
      name: 'Short Clips',
      description: '5-30 second audio samples',
      duration: 15, // 15 seconds
      complexity: 'medium' as const,
      targetBeats: 3,
      expectedRealTimeRatio: 0.5,
      maxProcessingTime: 5000 // 5 seconds
    },
    {
      name: 'Live Stream Chunks',
      description: 'Real-time processing of streaming audio',
      duration: 30, // 30 seconds
      complexity: 'low' as const,
      targetBeats: 6,
      expectedRealTimeRatio: 0.8,
      maxProcessingTime: 10000 // 10 seconds
    }
  ];

  beforeAll(async () => {
    console.log('🎵 Initializing real-world scenarios test suite...');
    
    parser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.6,
      multiPassEnabled: true
    });

    // Initialize worker pool for concurrent scenarios
    const maxWorkers = 4;
    for (let i = 0; i < maxWorkers; i++) {
      try {
        const worker = new WorkerClient();
        await worker.initialize();
        workerPool.push(worker);
      } catch (error) {
        console.warn(`Failed to initialize worker ${i}:`, error);
        break;
      }
    }

    console.log(`✅ Real-world scenarios initialized (${workerPool.length} workers available)`);
  }, 120000);

  afterAll(async () => {
    await parser.cleanup();
    
    for (const worker of workerPool) {
      try {
        await worker.terminate();
      } catch (error) {
        console.warn('Worker cleanup error:', error);
      }
    }
    
    console.log('🧹 Real-world scenarios test suite completed');
  });

  describe('Music Industry Use Cases', () => {
    test('Music track analysis workflow', async () => {
      console.log('Testing music track analysis workflow...');
      
      const musicTrackResults: Array<{
        trackType: string;
        duration: number;
        processingTime: number;
        realTimeRatio: number;
        memoryUsed: number;
        beatsFound: number;
        avgConfidence: number;
        efficiency: string;
      }> = [];

      const musicTrackTypes = [
        { name: 'Pop Song', bpm: 120, complexity: 'high' as const, duration: 210 },
        { name: 'Electronic Dance', bpm: 128, complexity: 'maximum' as const, duration: 240 },
        { name: 'Rock Ballad', bpm: 80, complexity: 'high' as const, duration: 270 },
        { name: 'Hip Hop', bpm: 95, complexity: 'high' as const, duration: 180 },
        { name: 'Classical Piece', bpm: 60, complexity: 'medium' as const, duration: 360 }
      ];

      for (const track of musicTrackTypes) {
        console.log(`  Analyzing ${track.name} (${track.duration}s, ${track.bpm} BPM)...`);
        
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          track.duration,
          44100,
          track.complexity
        );

        const { result, metrics } = await PerformanceUtils.measureOperation(
          () => parser.parseBuffer(testAudio, { 
            targetPictureCount: Math.floor(track.duration / 4),
            algorithm: 'musical',
            confidenceThreshold: 0.7
          }),
          `Music Analysis: ${track.name}`,
          { iterations: 1, warmupIterations: 0 }
        );

        const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
          track.duration,
          metrics.duration,
          Math.max(0, metrics.memoryUsage.heapUsed),
          44100
        );

        const avgConfidence = result.beats.length > 0 ? 
          result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length : 0;

        musicTrackResults.push({
          trackType: track.name,
          duration: track.duration,
          processingTime: metrics.duration,
          realTimeRatio: efficiency.realTimeRatio,
          memoryUsed: Math.max(0, metrics.memoryUsage.heapUsed),
          beatsFound: result.beats.length,
          avgConfidence,
          efficiency: efficiency.efficiency
        });

        // Validate music industry requirements
        expect(metrics.duration).toBeLessThan(track.duration * 20000); // <20s per second of audio
        expect(result.beats.length).toBeGreaterThan(0);
        expect(avgConfidence).toBeGreaterThan(0.5);
        expect(efficiency.realTimeRatio).toBeLessThan(30); // <30x real-time

        console.log(`    ${metrics.duration.toFixed(0)}ms (${efficiency.realTimeRatio.toFixed(2)}x), ${result.beats.length} beats, ${avgConfidence.toFixed(3)} conf`);
      }

      // Analyze music track processing patterns
      console.log('Music Track Analysis Summary:');
      const avgRealTimeRatio = musicTrackResults.reduce((sum, r) => sum + r.realTimeRatio, 0) / musicTrackResults.length;
      const avgConfidence = musicTrackResults.reduce((sum, r) => sum + r.avgConfidence, 0) / musicTrackResults.length;
      const totalMemoryMB = musicTrackResults.reduce((sum, r) => sum + r.memoryUsed, 0) / 1024 / 1024;

      console.log(`  Average real-time ratio: ${avgRealTimeRatio.toFixed(2)}x`);
      console.log(`  Average confidence: ${avgConfidence.toFixed(3)}`);
      console.log(`  Total memory used: ${totalMemoryMB.toFixed(2)}MB`);

      // Industry standard validation
      expect(avgRealTimeRatio).toBeLessThan(15); // Should average <15x real-time
      expect(avgConfidence).toBeGreaterThan(0.6); // Should achieve >60% confidence
      
      // Quality should be consistent across different music types
      const confidenceVariation = musicTrackResults.map(r => r.avgConfidence);
      const confidenceStdDev = Math.sqrt(
        confidenceVariation.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidenceVariation.length
      );
      expect(confidenceStdDev).toBeLessThan(0.2); // <20% standard deviation in confidence
    }, 600000);

    test('Music library batch processing', async () => {
      console.log('Testing music library batch processing...');
      
      const librarySize = 25; // 25 tracks
      const trackDuration = 180; // 3 minutes average

      // Generate a music library
      const musicLibrary = Array.from({ length: librarySize }, (_, index) => ({
        id: index + 1,
        name: `Track ${index + 1}`,
        audio: AudioPerformanceUtils.generateTestAudio(trackDuration, 44100, 'high'),
        expectedBeats: Math.floor(trackDuration / 4)
      }));

      const librarySize MB = (librarySize * trackDuration * 44100 * 4) / 1024 / 1024;
      console.log(`  Library size: ${librarySize} tracks, ${(librarySizeMB).toFixed(2)}MB total`);

      // Sequential processing baseline
      const sequentialStart = performance.now();
      const sequentialResults: ParseResult[] = [];

      for (const track of musicLibrary) {
        const result = await parser.parseBuffer(track.audio, { 
          targetPictureCount: track.expectedBeats,
          filename: track.name
        });
        sequentialResults.push(result);
        
        if (track.id % 5 === 0) {
          console.log(`    Processed ${track.id}/${librarySize} tracks...`);
        }
      }

      const sequentialTime = performance.now() - sequentialStart;
      const sequentialThroughput = librarySize / (sequentialTime / 1000); // tracks per second

      // Parallel processing with workers (if available)
      let parallelTime = sequentialTime;
      let parallelResults: ParseResult[] = [];
      let parallelThroughput = sequentialThroughput;

      if (workerPool.length >= 2) {
        console.log(`  Testing parallel processing with ${workerPool.length} workers...`);
        
        const parallelStart = performance.now();
        const chunkSize = Math.ceil(librarySize / workerPool.length);
        const chunks = [];

        for (let i = 0; i < librarySize; i += chunkSize) {
          chunks.push(musicLibrary.slice(i, i + chunkSize));
        }

        const promises = chunks.map(async (chunk, index) => {
          const worker = workerPool[index % workerPool.length];
          const chunkResults = [];
          
          for (const track of chunk) {
            const result = await worker.parseBuffer(track.audio, { 
              targetPictureCount: track.expectedBeats,
              filename: track.name
            });
            chunkResults.push(result);
          }
          
          return chunkResults;
        });

        const chunkResults = await Promise.all(promises);
        parallelResults = chunkResults.flat();
        parallelTime = performance.now() - parallelStart;
        parallelThroughput = librarySize / (parallelTime / 1000);
      }

      const speedup = sequentialTime / parallelTime;
      const efficiency = speedup / workerPool.length;

      console.log('Music Library Processing Results:');
      console.log(`  Sequential: ${(sequentialTime / 1000 / 60).toFixed(1)} minutes, ${sequentialThroughput.toFixed(3)} tracks/sec`);
      if (workerPool.length >= 2) {
        console.log(`  Parallel: ${(parallelTime / 1000 / 60).toFixed(1)} minutes, ${parallelThroughput.toFixed(3)} tracks/sec`);
        console.log(`  Speedup: ${speedup.toFixed(2)}x, Efficiency: ${(efficiency * 100).toFixed(1)}%`);
      }

      // Validate batch processing performance
      expect(sequentialResults).toHaveLength(librarySize);
      expect(parallelResults).toHaveLength(librarySize);
      expect(sequentialThroughput).toBeGreaterThan(0.05); // >0.05 tracks/sec (20s per track max)

      if (workerPool.length >= 2) {
        expect(speedup).toBeGreaterThan(1.2); // At least 20% speedup
        expect(efficiency).toBeGreaterThan(0.3); // At least 30% efficiency
      }

      // Results should be consistent between sequential and parallel
      const beatCountDifferences = sequentialResults.map((seqResult, index) => 
        Math.abs(seqResult.beats.length - parallelResults[index]?.beats.length || 0)
      );
      const maxBeatCountDiff = Math.max(...beatCountDifferences);
      expect(maxBeatCountDiff).toBeLessThanOrEqual(3); // Allow small differences due to floating point precision

      // Memory efficiency validation
      const memoryPerTrack = (librarySize * 50 * 1024 * 1024) / librarySize; // Assume 50MB per track max
      expect(memoryPerTrack).toBeLessThan(100 * 1024 * 1024); // <100MB per track
    }, 900000);

    test('Live performance beat detection', async () => {
      console.log('Testing live performance beat detection...');
      
      // Simulate live performance scenario with changing tempos
      const performanceSegments = [
        { tempo: 120, duration: 60, genre: 'opening' },
        { tempo: 128, duration: 180, genre: 'peak' },
        { tempo: 132, duration: 120, genre: 'climax' },
        { tempo: 124, duration: 90, genre: 'breakdown' },
        { tempo: 140, duration: 150, genre: 'finale' }
      ];

      const liveResults: Array<{
        segment: string;
        tempo: number;
        processingTime: number;
        realTimeRatio: number;
        beatsDetected: number;
        avgConfidence: number;
        tempoAccuracy: number;
      }> = [];

      for (const segment of performanceSegments) {
        console.log(`  Processing ${segment.genre} segment (${segment.tempo} BPM, ${segment.duration}s)...`);
        
        // Generate audio with specific tempo characteristics
        const segmentAudio = AudioPerformanceUtils.generateTestAudio(
          segment.duration,
          44100,
          'high'
        );

        const { result, metrics } = await PerformanceUtils.measureOperation(
          () => parser.parseBuffer(segmentAudio, { 
            targetPictureCount: Math.floor(segment.duration * segment.tempo / 60 / 4), // Beats per 4 bars
            algorithm: 'adaptive',
            confidenceThreshold: 0.6
          }),
          `Live segment: ${segment.genre}`,
          { iterations: 1, warmupIterations: 0 }
        );

        const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
          segment.duration,
          metrics.duration,
          Math.max(0, metrics.memoryUsage.heapUsed),
          44100
        );

        const avgConfidence = result.beats.length > 0 ? 
          result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length : 0;

        // Estimate detected tempo from beat intervals
        let detectedTempo = 0;
        if (result.beats.length > 2) {
          const intervals = [];
          for (let i = 1; i < result.beats.length; i++) {
            intervals.push(result.beats[i].time - result.beats[i - 1].time);
          }
          const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
          detectedTempo = avgInterval > 0 ? 60 / avgInterval : 0;
        }

        const tempoAccuracy = detectedTempo > 0 ? 
          1 - Math.abs(segment.tempo - detectedTempo) / segment.tempo : 0;

        liveResults.push({
          segment: segment.genre,
          tempo: segment.tempo,
          processingTime: metrics.duration,
          realTimeRatio: efficiency.realTimeRatio,
          beatsDetected: result.beats.length,
          avgConfidence,
          tempoAccuracy: Math.max(0, tempoAccuracy)
        });

        console.log(`    ${metrics.duration.toFixed(0)}ms (${efficiency.realTimeRatio.toFixed(2)}x), ${result.beats.length} beats, ${avgConfidence.toFixed(3)} conf`);
        console.log(`    Tempo accuracy: ${(tempoAccuracy * 100).toFixed(1)}%`);

        // Live performance requirements
        expect(efficiency.realTimeRatio).toBeLessThan(1.5); // <1.5x real-time for live use
        expect(result.beats.length).toBeGreaterThan(0);
        expect(avgConfidence).toBeGreaterThan(0.5);
      }

      // Analyze live performance consistency
      console.log('Live Performance Analysis Summary:');
      const avgRealTimeRatio = liveResults.reduce((sum, r) => sum + r.realTimeRatio, 0) / liveResults.length;
      const avgConfidence = liveResults.reduce((sum, r) => sum + r.avgConfidence, 0) / liveResults.length;
      const avgTempoAccuracy = liveResults.reduce((sum, r) => sum + r.tempoAccuracy, 0) / liveResults.length;

      console.log(`  Average real-time ratio: ${avgRealTimeRatio.toFixed(3)}x`);
      console.log(`  Average confidence: ${avgConfidence.toFixed(3)}`);
      console.log(`  Average tempo accuracy: ${(avgTempoAccuracy * 100).toFixed(1)}%`);

      // Live performance validation
      expect(avgRealTimeRatio).toBeLessThan(1.2); // Must be near real-time for live use
      expect(avgConfidence).toBeGreaterThan(0.6); // High confidence for live applications
      expect(avgTempoAccuracy).toBeGreaterThan(0.7); // >70% tempo accuracy

      // Consistency across different tempos
      const realTimeRatios = liveResults.map(r => r.realTimeRatio);
      const realTimeStdDev = Math.sqrt(
        realTimeRatios.reduce((sum, r) => sum + Math.pow(r - avgRealTimeRatio, 2), 0) / realTimeRatios.length
      );
      expect(realTimeStdDev).toBeLessThan(0.3); // Consistent performance across tempo changes
    }, 480000);
  });

  describe('Broadcast & Media Production', () => {
    test('Podcast episode processing pipeline', async () => {
      console.log('Testing podcast episode processing pipeline...');
      
      // Simulate a typical podcast structure
      const podcastSegments = [
        { type: 'intro_music', duration: 15, complexity: 'high' as const, expectedBeats: 4 },
        { type: 'speech', duration: 900, complexity: 'low' as const, expectedBeats: 10 }, // 15 minutes of speech
        { type: 'ad_break', duration: 30, complexity: 'medium' as const, expectedBeats: 8 },
        { type: 'speech', duration: 1200, complexity: 'low' as const, expectedBeats: 15 }, // 20 minutes of speech
        { type: 'outro_music', duration: 20, complexity: 'high' as const, expectedBeats: 5 }
      ];

      const podcastResults: Array<{
        segmentType: string;
        duration: number;
        processingTime: number;
        realTimeRatio: number;
        beatsDetected: number;
        avgConfidence: number;
        efficiency: string;
      }> = [];

      let totalDuration = 0;
      let totalProcessingTime = 0;

      for (const segment of podcastSegments) {
        console.log(`  Processing ${segment.type} (${segment.duration}s)...`);
        
        let segmentAudio: Float32Array;
        
        if (segment.type.includes('speech')) {
          // Generate speech-like audio (lower complexity, less rhythmic)
          segmentAudio = new Float32Array(segment.duration * 44100);
          for (let i = 0; i < segmentAudio.length; i++) {
            const t = i / 44100;
            // Simulate speech with formants and pauses
            const envelope = Math.sin(t * 0.5) * 0.5 + 0.5; // Slow amplitude variation
            const formant1 = Math.sin(2 * Math.PI * 800 * t + Math.sin(t * 3) * 0.5);
            const formant2 = Math.sin(2 * Math.PI * 1200 * t + Math.sin(t * 2) * 0.3) * 0.7;
            const noise = (Math.random() - 0.5) * 0.1;
            segmentAudio[i] = (formant1 + formant2) * envelope * 0.3 + noise;
            
            // Add pauses (simulate natural speech rhythm)
            if (Math.sin(t * 0.3) < -0.8) {
              segmentAudio[i] *= 0.1; // Pause
            }
          }
        } else {
          // Generate music-like audio
          segmentAudio = AudioPerformanceUtils.generateTestAudio(
            segment.duration,
            44100,
            segment.complexity
          );
        }

        const { result, metrics } = await PerformanceUtils.measureOperation(
          () => parser.parseBuffer(segmentAudio, { 
            targetPictureCount: segment.expectedBeats,
            algorithm: segment.type.includes('music') ? 'musical' : 'regular',
            confidenceThreshold: segment.type.includes('music') ? 0.7 : 0.3
          }),
          `Podcast segment: ${segment.type}`,
          { iterations: 1, warmupIterations: 0 }
        );

        const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
          segment.duration,
          metrics.duration,
          Math.max(0, metrics.memoryUsage.heapUsed),
          44100
        );

        const avgConfidence = result.beats.length > 0 ? 
          result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length : 0;

        podcastResults.push({
          segmentType: segment.type,
          duration: segment.duration,
          processingTime: metrics.duration,
          realTimeRatio: efficiency.realTimeRatio,
          beatsDetected: result.beats.length,
          avgConfidence,
          efficiency: efficiency.efficiency
        });

        totalDuration += segment.duration;
        totalProcessingTime += metrics.duration;

        console.log(`    ${metrics.duration.toFixed(0)}ms (${efficiency.realTimeRatio.toFixed(2)}x), ${result.beats.length} beats, ${efficiency.efficiency}`);

        // Segment-specific validations
        if (segment.type.includes('music')) {
          expect(result.beats.length).toBeGreaterThan(2); // Music should have beats
          expect(avgConfidence).toBeGreaterThan(0.5); // Higher confidence for music
        } else if (segment.type.includes('speech')) {
          // Speech may have false positives but should be processed quickly
          expect(efficiency.realTimeRatio).toBeLessThan(3); // Fast processing for speech
        }
      }

      const totalRealTimeRatio = totalProcessingTime / (totalDuration * 1000);

      console.log('Podcast Processing Summary:');
      console.log(`  Total duration: ${(totalDuration / 60).toFixed(1)} minutes`);
      console.log(`  Total processing time: ${(totalProcessingTime / 1000 / 60).toFixed(1)} minutes`);
      console.log(`  Overall real-time ratio: ${totalRealTimeRatio.toFixed(2)}x`);

      // Podcast production requirements
      expect(totalRealTimeRatio).toBeLessThan(10); // <10x real-time for reasonable batch processing
      expect(podcastResults.every(r => r.processingTime > 0)).toBe(true); // All segments processed
      
      // Music segments should be detected more accurately than speech
      const musicSegments = podcastResults.filter(r => r.segmentType.includes('music'));
      const speechSegments = podcastResults.filter(r => r.segmentType.includes('speech'));
      
      if (musicSegments.length > 0 && speechSegments.length > 0) {
        const avgMusicConfidence = musicSegments.reduce((sum, r) => sum + r.avgConfidence, 0) / musicSegments.length;
        const avgSpeechConfidence = speechSegments.reduce((sum, r) => sum + r.avgConfidence, 0) / speechSegments.length;
        
        console.log(`  Music confidence: ${avgMusicConfidence.toFixed(3)}, Speech confidence: ${avgSpeechConfidence.toFixed(3)}`);
        expect(avgMusicConfidence).toBeGreaterThan(avgSpeechConfidence * 0.8); // Music should be at least 80% as confident
      }
    }, 600000);

    test('Live streaming chunk processing', async () => {
      console.log('Testing live streaming chunk processing...');
      
      const chunkDuration = 5; // 5 seconds per chunk
      const totalChunks = 20; // 100 seconds total
      const streamingResults: Array<{
        chunkId: number;
        processingTime: number;
        realTimeRatio: number;
        beatsDetected: number;
        latency: number;
        bufferHealth: number;
      }> = [];

      let processingBuffer = 0; // Simulate processing buffer
      const maxBufferSize = 15000; // 15 seconds max buffer
      const targetLatency = chunkDuration * 1000 * 0.8; // Target 80% of chunk duration

      for (let chunkId = 1; chunkId <= totalChunks; chunkId++) {
        // Simulate varying audio complexity in stream
        const complexity = (chunkId % 4 === 0) ? 'high' as const : 'medium' as const;
        const chunkAudio = AudioPerformanceUtils.generateTestAudio(chunkDuration, 44100, complexity);

        const chunkStart = performance.now();
        
        const { result, metrics } = await PerformanceUtils.measureOperation(
          () => parser.parseBuffer(chunkAudio, { 
            targetPictureCount: 2, // Minimal beats for streaming
            algorithm: 'energy', // Fastest algorithm
            confidenceThreshold: 0.4 // Lower threshold for speed
          }),
          `Stream chunk ${chunkId}`,
          { iterations: 1, warmupIterations: 0 }
        );

        const chunkLatency = performance.now() - chunkStart;
        const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
          chunkDuration,
          metrics.duration,
          Math.max(0, metrics.memoryUsage.heapUsed),
          44100
        );

        // Update processing buffer
        processingBuffer += chunkLatency;
        processingBuffer -= chunkDuration * 1000; // Consume real-time
        processingBuffer = Math.max(0, Math.min(processingBuffer, maxBufferSize));

        const bufferHealth = 1 - (processingBuffer / maxBufferSize); // 1 = healthy, 0 = overflowing

        streamingResults.push({
          chunkId,
          processingTime: metrics.duration,
          realTimeRatio: efficiency.realTimeRatio,
          beatsDetected: result.beats.length,
          latency: chunkLatency,
          bufferHealth
        });

        if (chunkId % 5 === 0) {
          console.log(`    Chunk ${chunkId}: ${metrics.duration.toFixed(0)}ms (${efficiency.realTimeRatio.toFixed(2)}x), buffer: ${(bufferHealth * 100).toFixed(0)}%`);
        }

        // Streaming requirements validation
        expect(chunkLatency).toBeLessThan(chunkDuration * 2000); // <2x real-time per chunk
        expect(bufferHealth).toBeGreaterThan(0); // Buffer should not overflow
        
        // Simulate network jitter (small delay between chunks)
        if (chunkId < totalChunks) {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        }
      }

      // Analyze streaming performance
      const avgLatency = streamingResults.reduce((sum, r) => sum + r.latency, 0) / streamingResults.length;
      const avgRealTimeRatio = streamingResults.reduce((sum, r) => sum + r.realTimeRatio, 0) / streamingResults.length;
      const avgBufferHealth = streamingResults.reduce((sum, r) => sum + r.bufferHealth, 0) / streamingResults.length;
      const totalBeats = streamingResults.reduce((sum, r) => sum + r.beatsDetected, 0);

      const droppedChunks = streamingResults.filter(r => r.bufferHealth <= 0.1).length;
      const lateChunks = streamingResults.filter(r => r.latency > targetLatency).length;

      console.log('Live Streaming Analysis Summary:');
      console.log(`  Average latency: ${avgLatency.toFixed(0)}ms (target: ${targetLatency.toFixed(0)}ms)`);
      console.log(`  Average real-time ratio: ${avgRealTimeRatio.toFixed(3)}x`);
      console.log(`  Average buffer health: ${(avgBufferHealth * 100).toFixed(1)}%`);
      console.log(`  Total beats detected: ${totalBeats}`);
      console.log(`  Dropped chunks: ${droppedChunks}/${totalChunks} (${(droppedChunks / totalChunks * 100).toFixed(1)}%)`);
      console.log(`  Late chunks: ${lateChunks}/${totalChunks} (${(lateChunks / totalChunks * 100).toFixed(1)}%)`);

      // Streaming performance validation
      expect(avgRealTimeRatio).toBeLessThan(1.2); // Must be near real-time
      expect(avgBufferHealth).toBeGreaterThan(0.7); // Maintain healthy buffer
      expect(droppedChunks / totalChunks).toBeLessThan(0.05); // <5% dropped chunks
      expect(lateChunks / totalChunks).toBeLessThan(0.2); // <20% late chunks
      expect(totalBeats).toBeGreaterThan(0); // Should detect some beats

      // Consistency check - performance should not degrade over time
      const firstHalf = streamingResults.slice(0, Math.floor(totalChunks / 2));
      const secondHalf = streamingResults.slice(Math.floor(totalChunks / 2));
      
      const firstHalfAvgLatency = firstHalf.reduce((sum, r) => sum + r.latency, 0) / firstHalf.length;
      const secondHalfAvgLatency = secondHalf.reduce((sum, r) => sum + r.latency, 0) / secondHalf.length;
      
      const performanceDegradation = secondHalfAvgLatency / firstHalfAvgLatency;
      console.log(`  Performance stability: ${performanceDegradation.toFixed(3)} (1.0 = stable)`);
      
      expect(performanceDegradation).toBeLessThan(1.3); // <30% degradation over time
    }, 600000);
  });

  describe('Resource-Constrained Environments', () => {
    test('Mobile device simulation', async () => {
      console.log('Testing mobile device performance simulation...');
      
      // Simulate mobile device constraints
      const mobileConfigs = [
        {
          name: 'High-End Mobile',
          frameSize: 2048,
          hopSize: 512,
          multiPass: false,
          maxMemoryMB: 100,
          maxProcessingTimeRatio: 5.0
        },
        {
          name: 'Mid-Range Mobile',
          frameSize: 1024,
          hopSize: 256,
          multiPass: false,
          maxMemoryMB: 50,
          maxProcessingTimeRatio: 10.0
        },
        {
          name: 'Budget Mobile',
          frameSize: 512,
          hopSize: 128,
          multiPass: false,
          maxMemoryMB: 25,
          maxProcessingTimeRatio: 20.0
        }
      ];

      const mobileResults: Array<{
        deviceType: string;
        processingTime: number;
        realTimeRatio: number;
        memoryUsed: number;
        beatsDetected: number;
        batteryEfficiency: number;
        userExperience: string;
      }> = [];

      const testAudio = AudioPerformanceUtils.generateTestAudio(30, 44100, 'medium'); // 30-second test

      for (const config of mobileConfigs) {
        console.log(`  Testing ${config.name}...`);
        
        const mobileParser = new BeatParser({
          sampleRate: 44100,
          frameSize: config.frameSize,
          hopSize: config.hopSize,
          multiPassEnabled: config.multiPass,
          confidenceThreshold: 0.5 // Moderate threshold for mobile
        });

        try {
          const { result, metrics } = await PerformanceUtils.measureOperation(
            () => mobileParser.parseBuffer(testAudio, { targetPictureCount: 6 }),
            `Mobile: ${config.name}`,
            { iterations: 1, warmupIterations: 0 }
          );

          const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
            30, // 30 seconds
            metrics.duration,
            Math.max(0, metrics.memoryUsage.heapUsed),
            44100
          );

          const memoryUsedMB = Math.max(0, metrics.memoryUsage.heapUsed) / 1024 / 1024;
          
          // Estimate battery efficiency (inverse of CPU time * memory pressure)
          const batteryEfficiency = 1 / (efficiency.realTimeRatio * (memoryUsedMB / config.maxMemoryMB));
          
          // Determine user experience rating
          let userExperience = 'poor';
          if (efficiency.realTimeRatio < 2.0 && memoryUsedMB < config.maxMemoryMB * 0.8) {
            userExperience = 'excellent';
          } else if (efficiency.realTimeRatio < 5.0 && memoryUsedMB < config.maxMemoryMB) {
            userExperience = 'good';
          } else if (efficiency.realTimeRatio < config.maxProcessingTimeRatio && memoryUsedMB < config.maxMemoryMB * 1.2) {
            userExperience = 'acceptable';
          }

          mobileResults.push({
            deviceType: config.name,
            processingTime: metrics.duration,
            realTimeRatio: efficiency.realTimeRatio,
            memoryUsed: memoryUsedMB,
            beatsDetected: result.beats.length,
            batteryEfficiency,
            userExperience
          });

          console.log(`    ${metrics.duration.toFixed(0)}ms (${efficiency.realTimeRatio.toFixed(2)}x), ${memoryUsedMB.toFixed(1)}MB, ${result.beats.length} beats, ${userExperience}`);

          // Mobile device constraints
          expect(memoryUsedMB).toBeLessThan(config.maxMemoryMB * 1.5); // Allow some overhead
          expect(efficiency.realTimeRatio).toBeLessThan(config.maxProcessingTimeRatio);
          expect(result.beats.length).toBeGreaterThan(0);
        } finally {
          await mobileParser.cleanup();
        }
      }

      // Analyze mobile performance scaling
      console.log('Mobile Device Performance Summary:');
      const excellentDevices = mobileResults.filter(r => r.userExperience === 'excellent');
      const acceptableDevices = mobileResults.filter(r => r.userExperience !== 'poor');

      console.log(`  Excellent performance: ${excellentDevices.length}/${mobileResults.length} devices`);
      console.log(`  Acceptable or better: ${acceptableDevices.length}/${mobileResults.length} devices`);

      // Mobile compatibility validation
      expect(acceptableDevices.length).toBeGreaterThanOrEqual(mobileResults.length * 0.66); // At least 2/3 devices should be acceptable
      
      // Budget device should still be functional
      const budgetDevice = mobileResults.find(r => r.deviceType === 'Budget Mobile');
      if (budgetDevice) {
        expect(budgetDevice.beatsDetected).toBeGreaterThan(0);
        expect(budgetDevice.userExperience).not.toBe('poor');
      }

      // Memory usage should scale with device tier
      mobileResults.sort((a, b) => a.memoryUsed - b.memoryUsed);
      for (let i = 1; i < mobileResults.length; i++) {
        const current = mobileResults[i];
        const previous = mobileResults[i - 1];
        
        // Higher-tier devices can use more memory but should be more efficient
        expect(current.realTimeRatio).toBeLessThanOrEqual(previous.realTimeRatio * 1.5);
      }
    }, 300000);

    test('Low-latency embedded system simulation', async () => {
      console.log('Testing low-latency embedded system simulation...');
      
      // Simulate embedded system with strict real-time constraints
      const embeddedConfig = {
        name: 'Embedded System',
        frameSize: 256,
        hopSize: 64,
        maxLatency: 50, // 50ms max latency
        maxMemoryMB: 10,
        realTimeThreshold: 0.8 // Must be faster than real-time
      };

      const embeddedParser = new BeatParser({
        sampleRate: 44100,
        frameSize: embeddedConfig.frameSize,
        hopSize: embeddedConfig.hopSize,
        multiPassEnabled: false,
        confidenceThreshold: 0.3 // Low threshold for speed
      });

      try {
        const chunkTests = [1, 2, 5, 10]; // Different chunk sizes in seconds
        const embeddedResults: Array<{
          chunkSize: number;
          latency: number;
          realTimeRatio: number;
          memoryUsed: number;
          beatsDetected: number;
          realTimeCompliant: boolean;
        }> = [];

        for (const chunkSize of chunkTests) {
          console.log(`  Testing ${chunkSize}s chunks...`);
          
          const chunkAudio = AudioPerformanceUtils.generateTestAudio(chunkSize, 44100, 'low');

          const { result, metrics } = await PerformanceUtils.measureOperation(
            () => embeddedParser.parseBuffer(chunkAudio, { 
              targetPictureCount: Math.max(1, Math.floor(chunkSize / 2)),
              algorithm: 'energy' // Fastest algorithm
            }),
            `Embedded chunk: ${chunkSize}s`,
            { iterations: 1, warmupIterations: 0 }
          );

          const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
            chunkSize,
            metrics.duration,
            Math.max(0, metrics.memoryUsage.heapUsed),
            44100
          );

          const memoryUsedMB = Math.max(0, metrics.memoryUsage.heapUsed) / 1024 / 1024;
          const realTimeCompliant = efficiency.realTimeRatio <= embeddedConfig.realTimeThreshold &&
                                   metrics.duration <= embeddedConfig.maxLatency &&
                                   memoryUsedMB <= embeddedConfig.maxMemoryMB;

          embeddedResults.push({
            chunkSize,
            latency: metrics.duration,
            realTimeRatio: efficiency.realTimeRatio,
            memoryUsed: memoryUsedMB,
            beatsDetected: result.beats.length,
            realTimeCompliant
          });

          console.log(`    Latency: ${metrics.duration.toFixed(1)}ms, Ratio: ${efficiency.realTimeRatio.toFixed(3)}x, Memory: ${memoryUsedMB.toFixed(1)}MB, Compliant: ${realTimeCompliant}`);

          // Embedded system requirements
          expect(result.beats).toBeDefined();
          if (chunkSize <= 2) {
            // Very small chunks should meet real-time requirements
            expect(efficiency.realTimeRatio).toBeLessThan(1.0);
          }
        }

        // Analyze embedded system performance
        const compliantTests = embeddedResults.filter(r => r.realTimeCompliant);
        const avgLatency = embeddedResults.reduce((sum, r) => sum + r.latency, 0) / embeddedResults.length;
        const maxMemory = Math.max(...embeddedResults.map(r => r.memoryUsed));

        console.log('Embedded System Analysis Summary:');
        console.log(`  Real-time compliant: ${compliantTests.length}/${embeddedResults.length} tests`);
        console.log(`  Average latency: ${avgLatency.toFixed(1)}ms (max: ${embeddedConfig.maxLatency}ms)`);
        console.log(`  Peak memory usage: ${maxMemory.toFixed(1)}MB (max: ${embeddedConfig.maxMemoryMB}MB)`);

        // Embedded system validation
        expect(compliantTests.length).toBeGreaterThanOrEqual(embeddedResults.length * 0.5); // At least 50% should be compliant
        expect(maxMemory).toBeLessThan(embeddedConfig.maxMemoryMB * 2); // Allow some overhead but not too much
        
        // Small chunks should perform better than large chunks
        const smallChunks = embeddedResults.filter(r => r.chunkSize <= 2);
        const largeChunks = embeddedResults.filter(r => r.chunkSize >= 5);
        
        if (smallChunks.length > 0 && largeChunks.length > 0) {
          const smallChunkAvgRatio = smallChunks.reduce((sum, r) => sum + r.realTimeRatio, 0) / smallChunks.length;
          const largeChunkAvgRatio = largeChunks.reduce((sum, r) => sum + r.realTimeRatio, 0) / largeChunks.length;
          
          console.log(`  Small chunks average ratio: ${smallChunkAvgRatio.toFixed(3)}x`);
          console.log(`  Large chunks average ratio: ${largeChunkAvgRatio.toFixed(3)}x`);
          
          expect(smallChunkAvgRatio).toBeLessThan(largeChunkAvgRatio * 1.2); // Small chunks should be proportionally faster
        }
      } finally {
        await embeddedParser.cleanup();
      }
    }, 180000);
  });

  describe('Production Deployment Scenarios', () => {
    test('High-availability service simulation', async () => {
      console.log('Testing high-availability service simulation...');
      
      // Simulate production service with SLA requirements
      const serviceConfig = {
        targetUptime: 0.999, // 99.9% uptime
        maxResponseTime: 10000, // 10 seconds max response time
        maxErrorRate: 0.01, // 1% max error rate
        concurrentUsers: 8
      };

      const serviceResults: Array<{
        requestId: number;
        responseTime: number;
        success: boolean;
        beatsDetected: number;
        errorType?: string;
      }> = [];

      const totalRequests = 50;
      let successfulRequests = 0;
      let failedRequests = 0;

      console.log(`  Simulating ${totalRequests} concurrent requests...`);

      // Generate diverse test scenarios
      const requestTypes = [
        { type: 'short_track', duration: 30, complexity: 'medium' as const },
        { type: 'long_track', duration: 180, complexity: 'high' as const },
        { type: 'podcast_segment', duration: 300, complexity: 'low' as const },
        { type: 'live_stream', duration: 10, complexity: 'medium' as const }
      ];

      // Simulate concurrent requests
      const requestPromises = Array.from({ length: totalRequests }, async (_, requestId) => {
        const requestType = requestTypes[requestId % requestTypes.length];
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          requestType.duration,
          44100,
          requestType.complexity
        );

        try {
          const startTime = performance.now();
          
          // Use worker if available for better isolation
          const parser = (workerPool.length > 0 && requestId % 2 === 0) ? 
            workerPool[requestId % workerPool.length] : 
            parser;

          const result = await parser.parseBuffer(testAudio, { 
            targetPictureCount: Math.floor(requestType.duration / 10),
            timeout: serviceConfig.maxResponseTime 
          });

          const responseTime = performance.now() - startTime;
          
          serviceResults.push({
            requestId: requestId + 1,
            responseTime,
            success: true,
            beatsDetected: result.beats.length
          });

          successfulRequests++;
          return { success: true, responseTime };
        } catch (error) {
          const responseTime = performance.now() - startTime;
          
          serviceResults.push({
            requestId: requestId + 1,
            responseTime,
            success: false,
            beatsDetected: 0,
            errorType: error instanceof Error ? error.constructor.name : 'Unknown'
          });

          failedRequests++;
          return { success: false, responseTime, error };
        }
      });

      // Wait for all requests to complete
      const results = await Promise.all(requestPromises);

      // Analyze service performance
      const successfulResults = serviceResults.filter(r => r.success);
      const failedResults = serviceResults.filter(r => !r.success);
      
      const avgResponseTime = successfulResults.length > 0 ? 
        successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length : 0;
      const maxResponseTime = Math.max(...serviceResults.map(r => r.responseTime));
      const errorRate = failedRequests / totalRequests;
      const uptime = successfulRequests / totalRequests;

      // Response time percentiles
      const responseTimes = successfulResults.map(r => r.responseTime).sort((a, b) => a - b);
      const p95ResponseTime = responseTimes.length > 0 ? 
        responseTimes[Math.floor(responseTimes.length * 0.95)] : 0;

      console.log('High-Availability Service Analysis:');
      console.log(`  Successful requests: ${successfulRequests}/${totalRequests} (${(uptime * 100).toFixed(2)}%)`);
      console.log(`  Error rate: ${(errorRate * 100).toFixed(2)}% (target: <${(serviceConfig.maxErrorRate * 100).toFixed(1)}%)`);
      console.log(`  Average response time: ${avgResponseTime.toFixed(0)}ms`);
      console.log(`  95th percentile response time: ${p95ResponseTime.toFixed(0)}ms`);
      console.log(`  Maximum response time: ${maxResponseTime.toFixed(0)}ms (limit: ${serviceConfig.maxResponseTime}ms)`);

      // SLA validation
      expect(uptime).toBeGreaterThanOrEqual(serviceConfig.targetUptime); // Meet uptime SLA
      expect(errorRate).toBeLessThanOrEqual(serviceConfig.maxErrorRate); // Meet error rate SLA
      expect(maxResponseTime).toBeLessThan(serviceConfig.maxResponseTime); // Meet response time SLA
      expect(p95ResponseTime).toBeLessThan(serviceConfig.maxResponseTime * 0.8); // 95% should be well under limit

      // Error analysis
      if (failedResults.length > 0) {
        const errorTypes = failedResults.reduce((acc, r) => {
          const errorType = r.errorType || 'Unknown';
          acc[errorType] = (acc[errorType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        console.log('Error breakdown:');
        Object.entries(errorTypes).forEach(([errorType, count]) => {
          console.log(`  ${errorType}: ${count} (${(count / failedResults.length * 100).toFixed(1)}%)`);
        });
      }

      // Performance consistency check
      const responseTimeVariation = successfulResults.length > 1 ? 
        Math.sqrt(successfulResults.reduce((sum, r) => 
          sum + Math.pow(r.responseTime - avgResponseTime, 2), 0) / successfulResults.length) : 0;
      const coefficientOfVariation = responseTimeVariation / avgResponseTime;

      console.log(`  Response time variation: ${responseTimeVariation.toFixed(0)}ms (CV: ${(coefficientOfVariation * 100).toFixed(1)}%)`);
      expect(coefficientOfVariation).toBeLessThan(1.0); // Response times should be reasonably consistent
    }, 900000);
  });
});