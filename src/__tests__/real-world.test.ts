import { BeatParser } from '../core/BeatParser';
// import { BeatCandidate } from '../types';

describe('Real-world Scenarios and Edge Cases', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser();
  });
  
  afterEach(async () => {
    await parser.cleanup();
  });

  describe('Music Genre Adaptation', () => {
    const createGenreAudio = (genre: 'electronic' | 'rock' | 'jazz' | 'classical' | 'pop', duration: number = 3): Float32Array => {
      const sampleRate = 44100;
      const samples = duration * sampleRate;
      const audio = new Float32Array(samples);
      
      const genreParams = {
        electronic: { bpm: 128, bassFreq: 60, rhythmComplexity: 0.3 },
        rock: { bpm: 120, bassFreq: 80, rhythmComplexity: 0.6 },
        jazz: { bpm: 100, bassFreq: 70, rhythmComplexity: 0.9 },
        classical: { bpm: 80, bassFreq: 50, rhythmComplexity: 0.7 },
        pop: { bpm: 115, bassFreq: 65, rhythmComplexity: 0.4 }
      };
      
      const params = genreParams[genre];
      const beatInterval = (60 / params.bpm) * sampleRate;
      
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate;
        
        // Basic rhythm track
        const beatPhase = i % beatInterval;
        if (beatPhase < beatInterval * 0.1) {
          // Kick drum
          const kickT = beatPhase / sampleRate;
          audio[i] = (audio[i] || 0) + Math.sin(2 * Math.PI * (params as any).bassFreq * kickT) * Math.exp(-kickT * 30) * 0.8;
        }
        
        // Background harmonic content
        audio[i] = (audio[i] || 0) + Math.sin(2 * Math.PI * 220 * t) * 0.05; // A note
        
        // Add noise
        audio[i] = (audio[i] || 0) + (Math.random() - 0.5) * 0.02;
      }
      
      return audio;
    };

    test('should adapt to electronic music characteristics', async () => {
      const electronicAudio = createGenreAudio('electronic');
      const result = await parser.parseBuffer(electronicAudio, {
        targetPictureCount: 5
      });
      
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(5);
    });

    test('should handle different genres', async () => {
      const genres: Array<'electronic' | 'rock' | 'jazz' | 'pop'> = ['electronic', 'rock', 'jazz', 'pop'];
      
      for (const genre of genres) {
        const audio = createGenreAudio(genre);
        const result = await parser.parseBuffer(audio, {
          targetPictureCount: 3
        });
        
        expect(result.beats.length).toBeGreaterThan(0);
        expect(result.beats.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('Audio Quality and Conditions', () => {
    test('should handle low-quality audio', async () => {
      const lowQualityAudio = new Float32Array(44100 * 2); // 2 seconds
      
      // Simulate low quality with limited frequency response
      for (let i = 0; i < lowQualityAudio.length; i++) {
        const t = i / 44100;
        
        // Limited frequency range (no high frequencies)
        lowQualityAudio[i] = Math.sin(2 * Math.PI * 60 * t) * 0.6; // Bass
        
        // Add beats every second
        if (Math.floor(t) !== Math.floor((i - 1) / 44100)) {
          lowQualityAudio[i] += 0.4;
        }
      }
      
      const result = await parser.parseBuffer(lowQualityAudio);
      expect(result.beats.length).toBeGreaterThan(0);
    });

    test('should handle noisy audio', async () => {
      const noisyAudio = new Float32Array(44100 * 2); // 2 seconds
      
      for (let i = 0; i < noisyAudio.length; i++) {
        const t = i / 44100;
        
        // Clean signal
        let signal = 0;
        
        // Add beats every 0.5 seconds
        if (t % 0.5 < 0.1) {
          signal += Math.sin(2 * Math.PI * 60 * (t % 0.5)) * 0.8;
        }
        
        // Add significant noise
        signal += (Math.random() - 0.5) * 0.3;
        
        noisyAudio[i] = signal;
      }
      
      const result = await parser.parseBuffer(noisyAudio, {
        targetPictureCount: 3
      });
      
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle very short audio files', async () => {
      const shortAudio = new Float32Array(4096); // ~0.09 seconds
      
      // Add a single clear beat
      for (let i = 0; i < 500; i++) {
        shortAudio[i] = Math.sin(2 * Math.PI * 60 * i / 44100) * 0.8;
      }
      
      const result = await parser.parseBuffer(shortAudio, {
        targetPictureCount: 1
      });
      
      // Should handle gracefully
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.beats.length).toBeLessThanOrEqual(1);
    });

    test('should handle silence audio', async () => {
      const silenceAudio = new Float32Array(44100).fill(0); // 1 second of silence
      
      const result = await parser.parseBuffer(silenceAudio, {
        targetPictureCount: 3
      });
      
      // Should return a result, but with low confidence beats if any
      expect(result.beats).toBeDefined();
    });
  });

  describe('Picture Count Selection Accuracy', () => {
    test('should respect target picture count', async () => {
      const testAudio = new Float32Array(44100 * 3); // 3 seconds
      
      // Create beats at regular intervals
      for (let i = 0; i < testAudio.length; i++) {
        const t = i / 44100;
        
        if (t % 0.3 < 0.05) { // Beat every 0.3 seconds
          testAudio[i] = 0.8;
        } else {
          testAudio[i] = 0.1 * (Math.random() - 0.5);
        }
      }
      
      const targetCounts = [1, 3, 5, 8];
      
      for (const targetCount of targetCounts) {
        const result = await parser.parseBuffer(testAudio, {
          targetPictureCount: targetCount
        });
        
        expect(result.beats.length).toBeGreaterThan(0);
        expect(result.beats.length).toBeLessThanOrEqual(targetCount);
      }
    });
  });

  describe('Robustness and Reliability', () => {
    test('should produce consistent results for identical input', async () => {
      const testAudio = new Float32Array(44100 * 2); // 2 seconds
      
      // Create consistent test pattern
      for (let i = 0; i < testAudio.length; i++) {
        const t = i / 44100;
        testAudio[i] = Math.sin(2 * Math.PI * 440 * t) * 0.3;
        
        if (Math.floor(t * 2) !== Math.floor(((i - 1) / 44100) * 2)) {
          testAudio[i] += 0.7; // Beat every 0.5 seconds
        }
      }
      
      // Parse multiple times
      const results = [];
      for (let i = 0; i < 2; i++) {
        const result = await parser.parseBuffer(testAudio, {
          targetPictureCount: 3
        });
        results.push(result);
      }
      
      // Results should be similar
      expect(results[0].beats.length).toBe(results[1].beats.length);
    });

    test('should handle graceful degradation under resource constraints', async () => {
      // Simulate resource constraints by using minimal configuration
      const constrainedParser = new BeatParser({
        multiPassEnabled: false,
        genreAdaptive: false,
        enablePreprocessing: false,
        confidenceThreshold: 0.5
      });
      
      const testAudio = new Float32Array(44100 * 2);
      
      // Simple test pattern
      for (let i = 0; i < testAudio.length; i++) {
        const t = i / 44100;
        if (t % 1 < 0.1) { // Beat every second
          testAudio[i] = 0.8;
        } else {
          testAudio[i] = 0.1 * (Math.random() - 0.5);
        }
      }
      
      const result = await constrainedParser.parseBuffer(testAudio);
      
      // Should still produce usable results
      expect(result.beats.length).toBeGreaterThan(0);
      
      await constrainedParser.cleanup();
    });
  });
});