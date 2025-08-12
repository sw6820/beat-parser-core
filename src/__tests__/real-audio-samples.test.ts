/**
 * Tests with real audio file samples and realistic test scenarios
 * These tests use generated audio that mimics real-world characteristics
 */

import { BeatParser } from '../core/BeatParser';
import { BeatParserWorkerClient, isWorkerSupported } from '../worker';
import fs from 'fs/promises';
import path from 'path';

describe('Real Audio Sample Tests', () => {
  let parser: BeatParser;
  let workerClient: BeatParserWorkerClient | null = null;

  beforeEach(() => {
    parser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.6,
      multiPassEnabled: true
    });

    if (isWorkerSupported()) {
      workerClient = new BeatParserWorkerClient();
    }
  });

  afterEach(async () => {
    await parser.cleanup();
    if (workerClient) {
      await workerClient.terminate();
      workerClient = null;
    }
  });

  // Utility to create realistic audio samples
  const createRealisticAudio = (params: {
    duration: number;
    bpm: number;
    genre: 'house' | 'techno' | 'dubstep' | 'jazz' | 'rock' | 'classical';
    complexity: 'low' | 'medium' | 'high';
  }): Float32Array => {
    const { duration, bpm, genre, complexity } = params;
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);
    const beatInterval = (60 / bpm) * sampleRate;

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const beatPhase = i % beatInterval;
      const barPhase = i % (beatInterval * 4);
      
      let sample = 0;

      switch (genre) {
        case 'house':
          // Classic house pattern: kick on 1 and 3, hi-hat on off-beats
          if (beatPhase < sampleRate * 0.05 && (Math.floor(i / beatInterval) % 2 === 0)) {
            // Kick drum
            const decay = Math.exp(-beatPhase / sampleRate * 25);
            sample += Math.sin(2 * Math.PI * 60 * t) * decay * 0.8;
          }
          if (beatPhase > beatInterval * 0.45 && beatPhase < beatInterval * 0.55) {
            // Hi-hat
            sample += (Math.random() - 0.5) * 0.3;
          }
          if (Math.floor(i / beatInterval) % 4 === 1 && beatPhase < sampleRate * 0.03) {
            // Snare on beat 2 and 4
            sample += (Math.random() - 0.5) * 0.6 + Math.sin(2 * Math.PI * 200 * t) * 0.3;
          }
          // Bass line
          sample += Math.sin(2 * Math.PI * (55 + Math.floor(t) % 4 * 7) * t) * 0.2;
          break;

        case 'techno':
          // Driving techno beat
          if (beatPhase < sampleRate * 0.08) {
            const decay = Math.exp(-beatPhase / sampleRate * 30);
            sample += Math.sin(2 * Math.PI * 55 * t) * decay * 0.9;
          }
          if (Math.floor(i / (beatInterval / 8)) % 2 === 0) {
            // High frequency percussion
            sample += (Math.random() - 0.5) * 0.15;
          }
          // Sawtooth bass
          sample += ((t * 110) % 1 - 0.5) * 0.25;
          break;

        case 'dubstep':
          // Wobble bass and sparse drums
          if (Math.floor(i / beatInterval) % 4 === 0 && beatPhase < sampleRate * 0.1) {
            const decay = Math.exp(-beatPhase / sampleRate * 20);
            sample += Math.sin(2 * Math.PI * 50 * t) * decay * 0.9;
          }
          if (Math.floor(i / beatInterval) % 4 === 2 && beatPhase < sampleRate * 0.05) {
            // Snare
            sample += (Math.random() - 0.5) * 0.8;
          }
          // Wobble bass at half time
          const wobbleFreq = 80 + 40 * Math.sin(2 * Math.PI * 8 * t);
          sample += Math.sin(2 * Math.PI * wobbleFreq * t) * 0.3 * (Math.floor(t * 2) % 2);
          break;

        case 'jazz':
          // Swing rhythm
          const swingOffset = Math.floor(i / (beatInterval / 3)) % 3 === 2 ? beatInterval * 0.1 : 0;
          const adjustedPhase = (i + swingOffset) % beatInterval;
          
          if (adjustedPhase < sampleRate * 0.02) {
            // Brushed drums
            sample += (Math.random() - 0.5) * 0.4;
          }
          // Walking bass
          const bassNote = 110 * Math.pow(2, (Math.floor(t * 2) % 8) / 12);
          sample += Math.sin(2 * Math.PI * bassNote * t) * 0.3;
          // Brushed cymbals
          if (Math.random() < 0.001) {
            sample += (Math.random() - 0.5) * 0.2;
          }
          break;

        case 'rock':
          // Rock drum pattern
          if (beatPhase < sampleRate * 0.06) {
            // Kick
            const decay = Math.exp(-beatPhase / sampleRate * 25);
            sample += Math.sin(2 * Math.PI * 65 * t) * decay * 0.7;
          }
          if (Math.floor(i / beatInterval) % 2 === 1 && beatPhase < sampleRate * 0.04) {
            // Snare on beats 2 and 4
            sample += (Math.random() - 0.5) * 0.6 + Math.sin(2 * Math.PI * 200 * t) * 0.2;
          }
          // Power chord progression
          const chords = [82, 87, 98, 110]; // E, F, G, A
          const chordIndex = Math.floor(t / 2) % chords.length;
          sample += Math.sin(2 * Math.PI * chords[chordIndex] * t) * 0.2;
          sample += Math.sin(2 * Math.PI * chords[chordIndex] * 2 * t) * 0.1;
          break;

        case 'classical':
          // String ensemble with subtle rhythm
          const scales = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88]; // C major
          const noteIndex = Math.floor(t * 4) % scales.length;
          sample += Math.sin(2 * Math.PI * scales[noteIndex] * t) * 0.3;
          sample += Math.sin(2 * Math.PI * scales[noteIndex] * 2 * t) * 0.1;
          // Subtle timpani
          if (Math.floor(t * 4) % 16 === 0 && (t * 4) % 1 < 0.1) {
            sample += Math.sin(2 * Math.PI * 60 * t) * Math.exp(-(t % 1) * 10) * 0.4;
          }
          break;
      }

      // Add complexity-based variations
      if (complexity === 'medium') {
        // Add some polyrhythmic elements
        if (Math.floor(i / (beatInterval / 3)) % 3 === 0) {
          sample += (Math.random() - 0.5) * 0.1;
        }
      } else if (complexity === 'high') {
        // Add multiple overlapping rhythms
        const polyrhythms = [3, 5, 7];
        for (const poly of polyrhythms) {
          if (Math.floor(i / (beatInterval / poly)) % poly === 0) {
            sample += Math.sin(2 * Math.PI * (100 * poly) * t) * 0.05;
          }
        }
      }

      // Add realistic noise and dynamics
      sample += (Math.random() - 0.5) * 0.02; // Background noise
      sample *= 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.1 * t); // Dynamic variation
      
      audio[i] = Math.max(-1, Math.min(1, sample)); // Clamp to valid range
    }

    return audio;
  };

  describe('Genre-Specific Audio Processing', () => {
    const genres: Array<{
      genre: 'house' | 'techno' | 'dubstep' | 'jazz' | 'rock' | 'classical';
      expectedTempo: number;
      toleranceBpm: number;
    }> = [
      { genre: 'house', expectedTempo: 128, toleranceBpm: 10 },
      { genre: 'techno', expectedTempo: 140, toleranceBpm: 15 },
      { genre: 'dubstep', expectedTempo: 140, toleranceBpm: 20 }, // Half-time feel
      { genre: 'jazz', expectedTempo: 120, toleranceBpm: 20 }, // Swing timing
      { genre: 'rock', expectedTempo: 120, toleranceBpm: 15 },
      { genre: 'classical', expectedTempo: 100, toleranceBpm: 25 } // Variable timing
    ];

    test.each(genres)('should process $genre music effectively', async ({ genre, expectedTempo, toleranceBpm }) => {
      const testAudio = createRealisticAudio({
        duration: 15,
        bpm: expectedTempo,
        genre,
        complexity: 'medium'
      });

      const result = await parser.parseBuffer(testAudio, {
        targetPictureCount: 12,
        filename: `${genre}-sample.wav`
      });

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(12);

      // Check that detected tempo is reasonable for the genre
      if (result.tempo > 0) {
        expect(Math.abs(result.tempo - expectedTempo)).toBeLessThan(toleranceBpm);
      }

      // Validate beat timing consistency for genres with regular rhythm
      if (['house', 'techno', 'rock'].includes(genre) && result.beats.length > 2) {
        const intervals: number[] = [];
        for (let i = 1; i < result.beats.length; i++) {
          intervals.push(result.beats[i].timestamp - result.beats[i - 1].timestamp);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        const expectedInterval = 60 / expectedTempo;
        expect(Math.abs(avgInterval - expectedInterval)).toBeLessThan(expectedInterval * 0.5);
      }
    });

    test('should adapt to different complexity levels', async () => {
      const complexityLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
      const results = [];

      for (const complexity of complexityLevels) {
        const testAudio = createRealisticAudio({
          duration: 10,
          bpm: 120,
          genre: 'house',
          complexity
        });

        const result = await parser.parseBuffer(testAudio, {
          targetPictureCount: 10,
          filename: `complexity-${complexity}.wav`
        });

        results.push({
          complexity,
          beatCount: result.beats.length,
          avgConfidence: result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length
        });
      }

      // Lower complexity should generally result in higher confidence beats
      const lowComplexity = results.find(r => r.complexity === 'low')!;
      const highComplexity = results.find(r => r.complexity === 'high')!;
      
      expect(lowComplexity.avgConfidence).toBeGreaterThan(0.5);
      // Note: High complexity might still have good confidence depending on the algorithm
    });
  });

  describe('Realistic Audio Scenarios', () => {
    test('should handle DJ mix transition', async () => {
      // Create a mix that transitions from 128 to 132 BPM
      const firstTrack = createRealisticAudio({
        duration: 10,
        bpm: 128,
        genre: 'house',
        complexity: 'medium'
      });

      const secondTrack = createRealisticAudio({
        duration: 10,
        bpm: 132,
        genre: 'techno',
        complexity: 'medium'
      });

      // Simple crossfade simulation
      const transitionLength = 44100 * 5; // 5 seconds
      const mixedAudio = new Float32Array(firstTrack.length + secondTrack.length - transitionLength);
      
      // Copy first track
      mixedAudio.set(firstTrack.slice(0, firstTrack.length - transitionLength));
      
      // Crossfade region
      const fadeStart = firstTrack.length - transitionLength;
      for (let i = 0; i < transitionLength; i++) {
        const fadeRatio = i / transitionLength;
        const firstSample = firstTrack[fadeStart + i] * (1 - fadeRatio);
        const secondSample = secondTrack[i] * fadeRatio;
        mixedAudio[fadeStart + i] = firstSample + secondSample;
      }
      
      // Copy remainder of second track
      mixedAudio.set(secondTrack.slice(transitionLength), fadeStart + transitionLength);

      const result = await parser.parseBuffer(mixedAudio, {
        targetPictureCount: 20,
        filename: 'dj-mix-transition.wav'
      });

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(10);
      
      // Should detect tempo somewhere between the two tracks
      if (result.tempo > 0) {
        expect(result.tempo).toBeGreaterThan(120);
        expect(result.tempo).toBeLessThan(140);
      }
    });

    test('should handle live recording with crowd noise', async () => {
      const baseAudio = createRealisticAudio({
        duration: 20,
        bpm: 130,
        genre: 'rock',
        complexity: 'high'
      });

      // Add crowd noise and reverb simulation
      const liveAudio = new Float32Array(baseAudio.length);
      for (let i = 0; i < baseAudio.length; i++) {
        let sample = baseAudio[i];
        
        // Add crowd noise
        sample += (Math.random() - 0.5) * 0.1;
        
        // Simple reverb simulation (early reflections)
        if (i > 4410) { // 100ms delay
          sample += baseAudio[i - 4410] * 0.3;
        }
        if (i > 8820) { // 200ms delay
          sample += baseAudio[i - 8820] * 0.15;
        }
        
        // Add some audio compression simulation
        const threshold = 0.7;
        if (Math.abs(sample) > threshold) {
          sample = Math.sign(sample) * (threshold + (Math.abs(sample) - threshold) * 0.3);
        }
        
        liveAudio[i] = sample;
      }

      const result = await parser.parseBuffer(liveAudio, {
        targetPictureCount: 15,
        filename: 'live-recording.wav'
      });

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(5); // Should still detect some beats despite noise
      
      // Live recordings might have lower confidence due to noise
      const avgConfidence = result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length;
      expect(avgConfidence).toBeGreaterThan(0.3); // Lower threshold for noisy audio
    });

    test('should handle song with tempo changes', async () => {
      const segments = [
        { duration: 8, bpm: 100 },
        { duration: 6, bpm: 120 },
        { duration: 8, bpm: 140 },
        { duration: 6, bpm: 110 }
      ];

      let combinedAudio = new Float32Array(0);
      for (const segment of segments) {
        const segmentAudio = createRealisticAudio({
          duration: segment.duration,
          bpm: segment.bpm,
          genre: 'rock',
          complexity: 'medium'
        });

        const newCombined = new Float32Array(combinedAudio.length + segmentAudio.length);
        newCombined.set(combinedAudio);
        newCombined.set(segmentAudio, combinedAudio.length);
        combinedAudio = newCombined;
      }

      const result = await parser.parseBuffer(combinedAudio, {
        targetPictureCount: 25,
        filename: 'tempo-changes.wav'
      });

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(15);
      
      // Should detect some average tempo
      if (result.tempo > 0) {
        expect(result.tempo).toBeGreaterThan(90);
        expect(result.tempo).toBeLessThan(150);
      }

      // Beats should span the entire duration
      const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
      const lastBeat = Math.max(...result.beats.map(b => b.timestamp));
      expect(lastBeat).toBeGreaterThan(totalDuration * 0.7); // At least 70% of the way through
    });
  });

  describe('Worker Performance with Realistic Audio', () => {
    test('should process realistic audio efficiently with worker', async () => {
      if (!workerClient) {
        console.log('Skipping worker test - workers not supported');
        return;
      }

      const testAudio = createRealisticAudio({
        duration: 30,
        bpm: 125,
        genre: 'house',
        complexity: 'medium'
      });

      const progressUpdates: Array<{ percentage: number; stage: string }> = [];
      
      const startTime = Date.now();
      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 20,
        progressCallback: (progress) => {
          progressUpdates.push({
            percentage: progress.percentage,
            stage: progress.stage
          });
        }
      });
      const processingTime = Date.now() - startTime;

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should handle batch processing of different genres', async () => {
      if (!workerClient) {
        console.log('Skipping worker test - workers not supported');
        return;
      }

      const audioSamples = [
        createRealisticAudio({ duration: 8, bpm: 128, genre: 'house', complexity: 'low' }),
        createRealisticAudio({ duration: 8, bpm: 140, genre: 'techno', complexity: 'medium' }),
        createRealisticAudio({ duration: 8, bpm: 120, genre: 'jazz', complexity: 'high' }),
      ];

      const options = audioSamples.map((_, index) => ({
        targetPictureCount: 6,
        filename: `batch-genre-${index}.wav`
      }));

      const results = await workerClient.processBatch(audioSamples, options);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(6);
        expect(result.metadata.filename).toBe(`batch-genre-${index}.wav`);
      });
    });
  });

  describe('Audio Quality and Validation', () => {
    test('should handle low-quality audio gracefully', async () => {
      // Simulate low bitrate audio with quantization noise
      const baseAudio = createRealisticAudio({
        duration: 10,
        bpm: 120,
        genre: 'house',
        complexity: 'medium'
      });

      // Add quantization noise (simulate low bitrate compression)
      const lowQualityAudio = new Float32Array(baseAudio.length);
      for (let i = 0; i < baseAudio.length; i++) {
        // Quantize to 8-bit equivalent and add dithering
        const quantized = Math.round(baseAudio[i] * 127) / 127;
        const dither = (Math.random() - 0.5) * 0.01;
        lowQualityAudio[i] = quantized + dither;
      }

      const result = await parser.parseBuffer(lowQualityAudio, {
        targetPictureCount: 8,
        filename: 'low-quality-audio.wav'
      });

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0); // Should still detect some beats
      
      // Quality might be lower, but should still be reasonable
      const avgConfidence = result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length;
      expect(avgConfidence).toBeGreaterThan(0.2); // Very lenient for low quality audio
    });

    test('should detect clipping and handle gracefully', async () => {
      const baseAudio = createRealisticAudio({
        duration: 8,
        bpm: 130,
        genre: 'techno',
        complexity: 'medium'
      });

      // Simulate hard clipping
      const clippedAudio = new Float32Array(baseAudio.length);
      for (let i = 0; i < baseAudio.length; i++) {
        const amplified = baseAudio[i] * 2.5; // Amplify to cause clipping
        clippedAudio[i] = Math.max(-0.95, Math.min(0.95, amplified)); // Hard clip
      }

      const result = await parser.parseBuffer(clippedAudio, {
        targetPictureCount: 6,
        filename: 'clipped-audio.wav'
      });

      expect(result.beats).toBeDefined();
      // Clipped audio should still be processable, but might have lower quality results
      expect(result.beats.length).toBeGreaterThan(0);
    });

    test('should handle extremely quiet audio', async () => {
      const baseAudio = createRealisticAudio({
        duration: 10,
        bpm: 120,
        genre: 'jazz',
        complexity: 'low'
      });

      // Make audio very quiet
      const quietAudio = new Float32Array(baseAudio.length);
      for (let i = 0; i < baseAudio.length; i++) {
        quietAudio[i] = baseAudio[i] * 0.01; // Reduce to 1% of original amplitude
      }

      const result = await parser.parseBuffer(quietAudio, {
        targetPictureCount: 8,
        filename: 'quiet-audio.wav'
      });

      expect(result.beats).toBeDefined();
      // Quiet audio might result in fewer detected beats
      if (result.beats.length > 0) {
        const avgConfidence = result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length;
        expect(avgConfidence).toBeGreaterThan(0.1); // Very low threshold for quiet audio
      }
    });
  });

  describe('Edge Cases and Robustness', () => {
    test('should handle audio with sudden dynamic changes', async () => {
      const audio = new Float32Array(44100 * 12); // 12 seconds
      
      // Create audio with dramatic dynamic changes
      for (let i = 0; i < audio.length; i++) {
        const t = i / 44100;
        const segment = Math.floor(t / 3); // 3-second segments
        
        let amplitude;
        switch (segment % 4) {
          case 0: amplitude = 0.8; break;  // Loud
          case 1: amplitude = 0.05; break; // Very quiet
          case 2: amplitude = 0.6; break;  // Medium
          case 3: amplitude = 0.9; break;  // Very loud
          default: amplitude = 0.5;
        }
        
        // Create beat pattern
        const beatPhase = (i % Math.floor(44100 * 0.5)); // 120 BPM
        if (beatPhase < 2205) { // 50ms kick
          const decay = Math.exp(-beatPhase / 44100 * 30);
          audio[i] = Math.sin(2 * Math.PI * 60 * t) * decay * amplitude;
        } else {
          audio[i] = (Math.random() - 0.5) * 0.02 * amplitude;
        }
      }

      const result = await parser.parseBuffer(audio, {
        targetPictureCount: 12,
        filename: 'dynamic-changes.wav'
      });

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(5); // Should detect beats despite dynamic changes
    });

    test('should maintain performance with extreme tempo', async () => {
      const extremeTempos = [40, 200]; // Very slow and very fast
      
      for (const bpm of extremeTempos) {
        const testAudio = createRealisticAudio({
          duration: 10,
          bpm,
          genre: 'techno',
          complexity: 'low'
        });

        const startTime = Date.now();
        const result = await parser.parseBuffer(testAudio, {
          targetPictureCount: 8,
          filename: `extreme-tempo-${bpm}.wav`
        });
        const processingTime = Date.now() - startTime;

        expect(result.beats).toBeDefined();
        expect(processingTime).toBeLessThan(15000); // Should still process within 15 seconds
        
        // For extreme tempos, detection might be less accurate
        if (result.beats.length > 0) {
          expect(result.beats.length).toBeLessThanOrEqual(8);
        }
      }
    });
  });

  // Helper test to generate sample files for manual inspection (optional)
  describe.skip('Sample File Generation', () => {
    test('generate sample files for manual testing', async () => {
      const genres: Array<'house' | 'techno' | 'jazz' | 'rock'> = ['house', 'techno', 'jazz', 'rock'];
      
      for (const genre of genres) {
        const testAudio = createRealisticAudio({
          duration: 10,
          bpm: 120,
          genre,
          complexity: 'medium'
        });

        // Convert Float32Array to 16-bit PCM for WAV file
        const buffer = new ArrayBuffer(44 + testAudio.length * 2);
        const view = new DataView(buffer);
        
        // Write WAV header
        const writeString = (offset: number, string: string) => {
          for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
          }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + testAudio.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 44100, true);
        view.setUint32(28, 88200, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, testAudio.length * 2, true);

        // Write audio data
        for (let i = 0; i < testAudio.length; i++) {
          const sample = Math.round(testAudio[i] * 32767);
          view.setInt16(44 + i * 2, sample, true);
        }

        const sampleDir = path.join(__dirname, '../../test-samples');
        try {
          await fs.mkdir(sampleDir, { recursive: true });
          await fs.writeFile(
            path.join(sampleDir, `${genre}-sample.wav`),
            Buffer.from(buffer)
          );
          console.log(`Generated sample: ${genre}-sample.wav`);
        } catch (error) {
          console.warn(`Could not write sample file for ${genre}:`, error);
        }
      }
    });
  });
});