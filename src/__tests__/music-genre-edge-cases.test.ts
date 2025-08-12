/**
 * Music Genre Edge Cases and Real-World Scenarios Test Suite
 * 
 * This test suite covers challenging real-world scenarios that commonly cause
 * beat detection algorithms to fail, including:
 * 
 * - Genre transitions and mashups
 * - Polyrhythmic and complex time signatures
 * - Live performance variations
 * - Audio quality issues
 * - Cross-cultural musical elements
 * - Extreme tempo and dynamic ranges
 */

import { BeatParser } from '../core/BeatParser';
import { HybridDetector } from '../algorithms/HybridDetector';
import { BeatCandidate } from '../types';

describe('Music Genre Edge Cases and Real-World Scenarios', () => {
  let parser: BeatParser;
  let hybridDetector: HybridDetector;

  beforeEach(() => {
    parser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.4, // Lower threshold for challenging content
      multiPassEnabled: true,
      genreAdaptive: true
    });

    hybridDetector = new HybridDetector({
      sampleRate: 44100,
      multiPassEnabled: true,
      genreAdaptive: true,
      confidenceThreshold: 0.4
    });
  });

  afterEach(async () => {
    await parser.cleanup();
  });

  /**
   * Generate complex polyrhythmic audio with multiple overlapping patterns
   */
  const generatePolyrhythmicAudio = (params: {
    duration: number;
    primaryBpm: number;
    rhythmRatios: number[]; // e.g., [3, 4, 5] for 3:4:5 polyrhythm
    complexity: number; // 0-1, affects pattern density
  }): Float32Array => {
    const { duration, primaryBpm, rhythmRatios, complexity } = params;
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);
    
    const primaryInterval = (60 / primaryBpm) * sampleRate;
    
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      
      // Generate each polyrhythm
      rhythmRatios.forEach((ratio, index) => {
        const rhythmInterval = primaryInterval * ratio;
        const rhythmPhase = i % rhythmInterval;
        const amplitude = 0.8 / rhythmRatios.length; // Normalize amplitude
        
        if (rhythmPhase < sampleRate * 0.05) { // 50ms beat
          const frequency = 60 + (index * 20); // Different frequencies for each rhythm
          const decay = Math.exp(-rhythmPhase / sampleRate * 25);
          sample += Math.sin(2 * Math.PI * frequency * t) * decay * amplitude * complexity;
        }
      });
      
      // Add background texture
      sample += Math.sin(2 * Math.PI * 220 * t) * 0.1 * Math.sin(2 * Math.PI * 0.3 * t);
      sample += (Math.random() - 0.5) * 0.02;
      
      audio[i] = Math.max(-1, Math.min(1, sample));
    }
    
    return audio;
  };

  /**
   * Generate genre transition audio (mashup/crossfade)
   */
  const generateGenreTransition = (params: {
    duration: number;
    genre1: { type: string; bpm: number };
    genre2: { type: string; bpm: number };
    transitionPoint: number; // 0-1, where transition occurs
    transitionStyle: 'crossfade' | 'cut' | 'beatmatch';
  }): Float32Array => {
    const { duration, genre1, genre2, transitionPoint, transitionStyle } = params;
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);
    const transitionSample = Math.floor(transitionPoint * samples);
    
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      
      const isInTransition = transitionStyle === 'crossfade' && 
        i >= transitionSample - sampleRate * 2 && i <= transitionSample + sampleRate * 2;
      
      if (i < transitionSample || isInTransition) {
        // Generate first genre
        const beatInterval1 = (60 / genre1.bpm) * sampleRate;
        const beatPhase1 = i % beatInterval1;
        
        if (beatPhase1 < sampleRate * 0.05) {
          const decay = Math.exp(-beatPhase1 / sampleRate * 25);
          
          if (genre1.type === 'electronic') {
            sample += Math.sin(2 * Math.PI * 50 * t) * decay * 0.8;
          } else if (genre1.type === 'rock') {
            sample += Math.sin(2 * Math.PI * 65 * t) * decay * 0.7;
          }
        }
        
        // Add genre-specific characteristics
        if (genre1.type === 'electronic') {
          sample += ((t * 110) % 1 - 0.5) * 0.2; // Sawtooth bass
        } else if (genre1.type === 'rock') {
          sample += Math.sin(2 * Math.PI * 82.41 * t) * 0.3; // Power chord
        }
      }
      
      if (i >= transitionSample || isInTransition) {
        // Generate second genre
        const beatInterval2 = (60 / genre2.bpm) * sampleRate;
        let adjustedI = i;
        
        if (transitionStyle === 'beatmatch') {
          // Adjust timing to match beats
          const beatRatio = genre2.bpm / genre1.bpm;
          adjustedI = transitionSample + (i - transitionSample) * beatRatio;
        }
        
        const beatPhase2 = adjustedI % beatInterval2;
        let sample2 = 0;
        
        if (beatPhase2 < sampleRate * 0.05) {
          const decay = Math.exp(-beatPhase2 / sampleRate * 25);
          
          if (genre2.type === 'hip-hop') {
            sample2 += Math.sin(2 * Math.PI * 45 * t) * decay * 0.9;
          } else if (genre2.type === 'techno') {
            sample2 += Math.sin(2 * Math.PI * 55 * t) * decay * 0.8;
          }
        }
        
        // Add genre-specific characteristics
        if (genre2.type === 'hip-hop') {
          sample2 += Math.sin(2 * Math.PI * 55 * t) * 0.4; // 808 bass
        } else if (genre2.type === 'techno') {
          sample2 += ((t * 110) % 1 - 0.5) * 0.3; // Sawtooth
        }
        
        if (isInTransition) {
          // Crossfade between genres
          const fadeProgress = (i - (transitionSample - sampleRate * 2)) / (sampleRate * 4);
          const fadeIn = Math.min(1, Math.max(0, fadeProgress));
          const fadeOut = 1 - fadeIn;
          sample = sample * fadeOut + sample2 * fadeIn;
        } else {
          sample = sample2;
        }
      }
      
      audio[i] = Math.max(-1, Math.min(1, sample));
    }
    
    return audio;
  };

  /**
   * Generate live performance audio with realistic variations
   */
  const generateLivePerformance = (params: {
    duration: number;
    baseBpm: number;
    genre: string;
    performanceIssues: {
      timing: number; // 0-1, amount of timing variation
      dynamics: number; // 0-1, amount of dynamic variation
      dropout: number; // 0-1, probability of instrument dropouts
      crowdNoise: number; // 0-1, amount of crowd noise
    };
  }): Float32Array => {
    const { duration, baseBpm, genre, performanceIssues } = params;
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);
    
    let currentBpm = baseBpm;
    let lastBeatTime = 0;
    
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      
      // Apply timing variations
      if (performanceIssues.timing > 0) {
        const timingError = (Math.random() - 0.5) * performanceIssues.timing * 0.1;
        currentBpm = baseBpm * (1 + timingError);
      }
      
      const beatInterval = (60 / currentBpm) * sampleRate;
      const beatPhase = i % beatInterval;
      
      // Generate beats with possible dropouts
      const shouldPlayBeat = Math.random() > performanceIssues.dropout * 0.3;
      
      if (shouldPlayBeat && beatPhase < sampleRate * 0.06) {
        const decay = Math.exp(-beatPhase / sampleRate * 20);
        
        // Apply dynamic variations
        let amplitude = 0.8;
        if (performanceIssues.dynamics > 0) {
          amplitude *= (0.5 + Math.random() * 0.5 * performanceIssues.dynamics + 0.5);
        }
        
        switch (genre) {
          case 'rock':
            sample += Math.sin(2 * Math.PI * 65 * t) * decay * amplitude;
            break;
          case 'jazz':
            sample += (Math.random() - 0.5) * decay * amplitude * 0.8;
            break;
          case 'electronic':
            sample += Math.sin(2 * Math.PI * 50 * t) * decay * amplitude;
            break;
        }
      }
      
      // Add crowd noise
      if (performanceIssues.crowdNoise > 0) {
        const crowdLevel = performanceIssues.crowdNoise * 0.2;
        sample += (Math.random() - 0.5) * crowdLevel;
        
        // Occasional crowd cheers
        if (Math.random() < 0.001) {
          sample += (Math.random() - 0.5) * crowdLevel * 3;
        }
      }
      
      // Add venue reverb
      if (i > 8820) { // 200ms delay
        sample += audio[i - 8820] * 0.2;
      }
      
      audio[i] = Math.max(-1, Math.min(1, sample));
    }
    
    return audio;
  };

  describe('Polyrhythmic and Complex Time Signatures', () => {
    test('should handle 3:4 polyrhythms', async () => {
      const audio = generatePolyrhythmicAudio({
        duration: 12,
        primaryBpm: 120,
        rhythmRatios: [3, 4],
        complexity: 0.8
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect beats from both rhythmic layers
      expect(detectedBeats.length).toBeGreaterThan(15);
      
      // Check for reasonable confidence despite complexity
      const avgConfidence = detectedBeats.reduce((sum, beat) => sum + beat.confidence, 0) / detectedBeats.length;
      expect(avgConfidence).toBeGreaterThan(0.3);
      
      console.log('3:4 polyrhythm results:', {
        beats: detectedBeats.length,
        avgConfidence: avgConfidence.toFixed(3)
      });
    });

    test('should handle complex 3:4:5 polyrhythms', async () => {
      const audio = generatePolyrhythmicAudio({
        duration: 15,
        primaryBpm: 100,
        rhythmRatios: [3, 4, 5],
        complexity: 0.9
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Very challenging - should still detect some beats
      expect(detectedBeats.length).toBeGreaterThan(8);
      expect(detectedBeats.some(beat => beat.confidence > 0.5)).toBe(true);
      
      console.log('3:4:5 polyrhythm results:', {
        beats: detectedBeats.length,
        highConfidenceBeats: detectedBeats.filter(b => b.confidence > 0.5).length
      });
    });

    test('should detect beats in unusual time signatures', async () => {
      const timeSignatures = [
        { numerator: 5, denominator: 4, expectedBeats: 12 }, // 5/4 time
        { numerator: 7, denominator: 8, expectedBeats: 14 }, // 7/8 time
        { numerator: 9, denominator: 8, expectedBeats: 18 }  // 9/8 time
      ];

      for (const timeSignature of timeSignatures) {
        // Generate audio with specific time signature
        const sampleRate = 44100;
        const duration = 8;
        const bpm = 120;
        const audio = new Float32Array(duration * sampleRate);
        const beatsPerMeasure = timeSignature.numerator;
        const beatInterval = (60 / bpm) * sampleRate;

        // Generate precisely timed beats according to time signature
        for (let i = 0; i < audio.length; i++) {
          const t = i / sampleRate;
          const beatNumber = Math.floor(i / beatInterval) % beatsPerMeasure;
          const beatPhase = i % beatInterval;
          
          if (beatPhase < sampleRate * 0.04) {
            const isDownbeat = beatNumber === 0;
            const amplitude = isDownbeat ? 0.9 : 0.6;
            const decay = Math.exp(-beatPhase / sampleRate * 30);
            audio[i] = Math.sin(2 * Math.PI * (isDownbeat ? 60 : 80) * t) * decay * amplitude;
          } else {
            audio[i] = (Math.random() - 0.5) * 0.05;
          }
        }

        const detectedBeats = await hybridDetector.detectBeats(audio);
        
        // Should detect a reasonable number of beats
        expect(detectedBeats.length).toBeGreaterThan(timeSignature.expectedBeats * 0.4);
        console.log(`${timeSignature.numerator}/${timeSignature.denominator} time signature:`, {
          detected: detectedBeats.length,
          expected: timeSignature.expectedBeats
        });
      }
    });
  });

  describe('Genre Transitions and Mashups', () => {
    test('should handle electronic to hip-hop crossfade', async () => {
      const audio = generateGenreTransition({
        duration: 16,
        genre1: { type: 'electronic', bpm: 128 },
        genre2: { type: 'hip-hop', bpm: 95 },
        transitionPoint: 0.6,
        transitionStyle: 'crossfade'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect beats throughout the transition
      expect(detectedBeats.length).toBeGreaterThan(20);
      
      // Analyze beat distribution across time
      const firstHalf = detectedBeats.filter(beat => beat.timestamp < 8);
      const secondHalf = detectedBeats.filter(beat => beat.timestamp >= 8);
      
      expect(firstHalf.length).toBeGreaterThan(5);
      expect(secondHalf.length).toBeGreaterThan(5);
      
      console.log('Electronic to Hip-Hop crossfade:', {
        totalBeats: detectedBeats.length,
        firstHalf: firstHalf.length,
        secondHalf: secondHalf.length
      });
    });

    test('should handle abrupt genre cuts', async () => {
      const audio = generateGenreTransition({
        duration: 12,
        genre1: { type: 'rock', bpm: 120 },
        genre2: { type: 'techno', bpm: 140 },
        transitionPoint: 0.5,
        transitionStyle: 'cut'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should adapt to the tempo change
      expect(detectedBeats.length).toBeGreaterThan(15);
      
      // Check for beats around the transition point
      const transitionRegion = detectedBeats.filter(
        beat => beat.timestamp >= 5 && beat.timestamp <= 7
      );
      expect(transitionRegion.length).toBeGreaterThan(2); // Should still detect beats during transition
    });

    test('should handle beatmatched DJ transitions', async () => {
      const audio = generateGenreTransition({
        duration: 20,
        genre1: { type: 'electronic', bpm: 128 },
        genre2: { type: 'techno', bpm: 128 }, // Same BPM for beatmatching
        transitionPoint: 0.5,
        transitionStyle: 'beatmatch'
      });

      const result = await parser.parseBuffer(audio, { targetPictureCount: 16 });
      
      // Should maintain consistent tempo detection
      expect(result.beats.length).toBeGreaterThan(10);
      if (result.tempo && result.tempo > 0) {
        expect(Math.abs(result.tempo - 128)).toBeLessThan(10); // Within 10 BPM
      }
      
      console.log('Beatmatched transition results:', {
        beats: result.beats.length,
        detectedTempo: result.tempo
      });
    });
  });

  describe('Live Performance Variations', () => {
    test('should handle slight timing variations in live rock performance', async () => {
      const audio = generateLivePerformance({
        duration: 15,
        baseBpm: 125,
        genre: 'rock',
        performanceIssues: {
          timing: 0.3,   // 30% timing variation
          dynamics: 0.4, // 40% dynamic variation
          dropout: 0.1,  // 10% dropout chance
          crowdNoise: 0.2 // 20% crowd noise
        }
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should still detect most beats despite variations
      expect(detectedBeats.length).toBeGreaterThan(12);
      
      // Some beats should have good confidence
      const goodConfidenceBeats = detectedBeats.filter(beat => beat.confidence > 0.6);
      expect(goodConfidenceBeats.length).toBeGreaterThan(5);
      
      console.log('Live rock performance:', {
        totalBeats: detectedBeats.length,
        goodConfidence: goodConfidenceBeats.length,
        avgConfidence: (detectedBeats.reduce((sum, beat) => sum + beat.confidence, 0) / detectedBeats.length).toFixed(3)
      });
    });

    test('should handle jazz performance with significant timing liberty', async () => {
      const audio = generateLivePerformance({
        duration: 12,
        baseBpm: 110,
        genre: 'jazz',
        performanceIssues: {
          timing: 0.6,   // High timing variation
          dynamics: 0.5, // High dynamic variation
          dropout: 0.2,  // Some instrument dropouts
          crowdNoise: 0.1 // Light crowd noise
        }
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Jazz is challenging - lower expectations
      expect(detectedBeats.length).toBeGreaterThan(6);
      
      // Should still find some confident beats
      const confidenceAboveThreshold = detectedBeats.filter(beat => beat.confidence > 0.4);
      expect(confidenceAboveThreshold.length).toBeGreaterThan(3);
      
      console.log('Live jazz performance:', {
        totalBeats: detectedBeats.length,
        aboveThreshold: confidenceAboveThreshold.length
      });
    });

    test('should handle electronic performance with technical issues', async () => {
      const audio = generateLivePerformance({
        duration: 10,
        baseBpm: 130,
        genre: 'electronic',
        performanceIssues: {
          timing: 0.2,   // Some timing issues
          dynamics: 0.6, // Technical volume issues
          dropout: 0.3,  // Equipment dropouts
          crowdNoise: 0.4 // Loud crowd
        }
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Electronic should be more resilient
      expect(detectedBeats.length).toBeGreaterThan(8);
      
      const avgConfidence = detectedBeats.reduce((sum, beat) => sum + beat.confidence, 0) / detectedBeats.length;
      expect(avgConfidence).toBeGreaterThan(0.3);
    });
  });

  describe('Audio Quality and Technical Issues', () => {
    test('should handle severely compressed audio', async () => {
      // Generate base audio
      const sampleRate = 44100;
      const duration = 8;
      const bpm = 120;
      const baseAudio = new Float32Array(duration * sampleRate);
      
      for (let i = 0; i < baseAudio.length; i++) {
        const t = i / sampleRate;
        const beatInterval = (60 / bpm) * sampleRate;
        const beatPhase = i % beatInterval;
        
        if (beatPhase < sampleRate * 0.05) {
          const decay = Math.exp(-beatPhase / sampleRate * 25);
          baseAudio[i] = Math.sin(2 * Math.PI * 60 * t) * decay * 0.8;
        } else {
          baseAudio[i] = Math.sin(2 * Math.PI * 220 * t) * 0.3;
        }
      }

      // Apply severe compression artifacts
      const compressedAudio = new Float32Array(baseAudio.length);
      for (let i = 0; i < baseAudio.length; i++) {
        let sample = baseAudio[i];
        
        // Hard limiter at low threshold
        const threshold = 0.3;
        if (Math.abs(sample) > threshold) {
          sample = Math.sign(sample) * threshold;
        }
        
        // Add quantization noise (simulate low bitrate)
        const quantized = Math.round(sample * 64) / 64; // 6-bit quantization
        const dither = (Math.random() - 0.5) * 0.02;
        
        compressedAudio[i] = quantized + dither;
      }

      const detectedBeats = await hybridDetector.detectBeats(compressedAudio);
      
      // Should still detect some beats despite severe compression
      expect(detectedBeats.length).toBeGreaterThan(4);
      
      console.log('Severely compressed audio:', {
        beats: detectedBeats.length
      });
    });

    test('should handle audio with clipping distortion', async () => {
      const duration = 6;
      const sampleRate = 44100;
      const audio = new Float32Array(duration * sampleRate);
      
      // Generate loud audio with clipping
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatPhase = i % Math.floor(sampleRate * 0.5); // 120 BPM
        
        if (beatPhase < sampleRate * 0.05) {
          const decay = Math.exp(-beatPhase / sampleRate * 20);
          // Intentionally loud to cause clipping
          let sample = Math.sin(2 * Math.PI * 60 * t) * decay * 2.5;
          audio[i] = Math.max(-0.98, Math.min(0.98, sample)); // Hard clip
        } else {
          audio[i] = (Math.random() - 0.5) * 0.1;
        }
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Clipping should not prevent basic beat detection
      expect(detectedBeats.length).toBeGreaterThan(3);
      
      console.log('Clipped audio results:', {
        beats: detectedBeats.length
      });
    });

    test('should handle audio with significant background noise', async () => {
      const duration = 8;
      const sampleRate = 44100;
      const audio = new Float32Array(duration * sampleRate);
      
      // Generate beats with high noise floor
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatPhase = i % Math.floor(sampleRate * 0.5); // 120 BPM
        
        let sample = (Math.random() - 0.5) * 0.6; // High noise level
        
        if (beatPhase < sampleRate * 0.04) {
          const decay = Math.exp(-beatPhase / sampleRate * 30);
          sample += Math.sin(2 * Math.PI * 70 * t) * decay * 0.7; // Beat signal
        }
        
        audio[i] = sample;
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect some beats despite high noise
      expect(detectedBeats.length).toBeGreaterThan(2);
      
      console.log('High noise audio:', {
        beats: detectedBeats.length,
        avgConfidence: detectedBeats.length > 0 ? 
          (detectedBeats.reduce((sum, beat) => sum + beat.confidence, 0) / detectedBeats.length).toFixed(3) : 'N/A'
      });
    });
  });

  describe('Cross-Cultural and World Music Elements', () => {
    test('should handle Middle Eastern makam scales and rhythms', async () => {
      const duration = 10;
      const sampleRate = 44100;
      const audio = new Float32Array(duration * sampleRate);
      const bpm = 90;
      
      // Generate Middle Eastern-style rhythm (Samazen pattern)
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatInterval = (60 / bpm) * sampleRate;
        const pattern = Math.floor((i / beatInterval) * 8) % 8; // 8-beat pattern
        const patternPhase = (i / beatInterval * 8) % 1;
        
        let sample = 0;
        
        // Samazen rhythm: DUM - tek DUM - tek DUM tek
        const drumPattern = [1, 0, 0.3, 0, 1, 0, 0.3, 0.3];
        const amplitude = drumPattern[pattern] || 0;
        
        if (amplitude > 0 && patternPhase < 0.3) {
          const decay = Math.exp(-patternPhase * beatInterval / sampleRate * 25);
          const frequency = amplitude === 1 ? 50 : 200; // DUM vs tek
          sample = Math.sin(2 * Math.PI * frequency * t) * decay * amplitude;
        }
        
        // Add makam scale melody
        const makamNotes = [264, 297, 316, 352, 396, 422, 475, 528]; // Hijaz makam approximation
        const noteIndex = Math.floor(t * 2) % makamNotes.length;
        sample += Math.sin(2 * Math.PI * makamNotes[noteIndex] * t) * 0.2;
        
        audio[i] = sample;
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect the complex rhythm pattern
      expect(detectedBeats.length).toBeGreaterThan(6);
      
      console.log('Middle Eastern makam rhythm:', {
        beats: detectedBeats.length
      });
    });

    test('should handle African polyrhythmic patterns', async () => {
      const duration = 12;
      const sampleRate = 44100;
      const audio = new Float32Array(duration * sampleRate);
      const baseBpm = 100;
      
      // Generate African 6/8 against 4/4 polyrhythm
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        let sample = 0;
        
        // 4/4 pattern (djembe bass)
        const fourFourInterval = (60 / baseBpm) * sampleRate;
        const fourFourPhase = i % fourFourInterval;
        if (fourFourPhase < sampleRate * 0.04) {
          const decay = Math.exp(-fourFourPhase / sampleRate * 20);
          sample += Math.sin(2 * Math.PI * 55 * t) * decay * 0.8;
        }
        
        // 6/8 pattern (high percussion)
        const sixEightInterval = (60 / baseBpm * 1.5) * sampleRate; // 3/2 ratio
        const sixEightPattern = Math.floor((i / (sixEightInterval / 6)) % 6);
        const sixEightPhase = (i / (sixEightInterval / 6)) % 1;
        
        if ([0, 3].includes(sixEightPattern) && sixEightPhase < 0.2) {
          const decay = Math.exp(-sixEightPhase * sixEightInterval / 6 / sampleRate * 30);
          sample += (Math.random() - 0.5) * decay * 0.5;
        }
        
        // Add talking drum
        if (Math.random() < 0.05) {
          sample += Math.sin(2 * Math.PI * 150 * t) * 0.3;
        }
        
        audio[i] = sample;
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect polyrhythmic elements
      expect(detectedBeats.length).toBeGreaterThan(8);
      
      console.log('African polyrhythmic patterns:', {
        beats: detectedBeats.length
      });
    });

    test('should handle Indian classical tala patterns', async () => {
      const duration = 15;
      const sampleRate = 44100;
      const audio = new Float32Array(duration * sampleRate);
      const bpm = 80;
      
      // Generate Teentaal (16-beat cycle) pattern
      // X 2 0 3 | X 2 0 3 | X 2 0 3 | X 2 0 3
      const teentalPattern = [
        1, 0.5, 0, 0.7, 1, 0.5, 0, 0.7,
        1, 0.5, 0, 0.7, 1, 0.5, 0, 0.7
      ];
      
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatInterval = (60 / bpm) * sampleRate;
        const cyclePosition = Math.floor((i / beatInterval) * 16) % 16;
        const beatPhase = ((i / beatInterval) * 16) % 1;
        
        let sample = 0;
        
        const amplitude = teentalPattern[cyclePosition];
        if (amplitude > 0 && beatPhase < 0.3) {
          const decay = Math.exp(-beatPhase * beatInterval / 16 / sampleRate * 20);
          
          if (amplitude === 1) {
            // Sam (strong beat)
            sample = Math.sin(2 * Math.PI * 60 * t) * decay * 0.9;
          } else {
            // Tali/Khali (medium/weak beats)
            sample = (Math.random() - 0.5) * decay * amplitude;
          }
        }
        
        // Add tanpura drone
        sample += Math.sin(2 * Math.PI * 146.83 * t) * 0.1; // D note
        sample += Math.sin(2 * Math.PI * 220 * t) * 0.08;    // A note
        
        audio[i] = sample;
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect the tala structure
      expect(detectedBeats.length).toBeGreaterThan(5);
      
      console.log('Indian classical tala pattern:', {
        beats: detectedBeats.length
      });
    });
  });

  describe('Extreme Cases and Stress Testing', () => {
    test('should handle extremely slow tempo (20 BPM)', async () => {
      const duration = 20; // Need longer duration for slow tempo
      const sampleRate = 44100;
      const bpm = 20;
      const audio = new Float32Array(duration * sampleRate);
      
      const beatInterval = (60 / bpm) * sampleRate; // 3 seconds between beats
      
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatPhase = i % beatInterval;
        
        if (beatPhase < sampleRate * 0.2) { // 200ms beat
          const decay = Math.exp(-beatPhase / sampleRate * 5); // Slower decay
          audio[i] = Math.sin(2 * Math.PI * 40 * t) * decay * 0.8;
        } else {
          audio[i] = Math.sin(2 * Math.PI * 110 * t) * 0.05; // Quiet background
        }
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect some of the very slow beats
      expect(detectedBeats.length).toBeGreaterThan(2);
      
      console.log('Extremely slow tempo (20 BPM):', {
        beats: detectedBeats.length,
        expectedBeats: Math.floor(duration / (60 / bpm))
      });
    });

    test('should handle extremely fast tempo (300 BPM)', async () => {
      const duration = 6;
      const sampleRate = 44100;
      const bpm = 300;
      const audio = new Float32Array(duration * sampleRate);
      
      const beatInterval = (60 / bpm) * sampleRate; // 0.2 seconds between beats
      
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatPhase = i % beatInterval;
        
        if (beatPhase < sampleRate * 0.02) { // 20ms beat
          const decay = Math.exp(-beatPhase / sampleRate * 50); // Fast decay
          audio[i] = Math.sin(2 * Math.PI * 80 * t) * decay * 0.7;
        } else {
          audio[i] = (Math.random() - 0.5) * 0.05;
        }
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect many of the fast beats
      expect(detectedBeats.length).toBeGreaterThan(15);
      
      console.log('Extremely fast tempo (300 BPM):', {
        beats: detectedBeats.length,
        expectedBeats: Math.floor(duration / (60 / bpm))
      });
    });

    test('should handle minimal audio (single instrument)', async () => {
      const duration = 8;
      const sampleRate = 44100;
      const audio = new Float32Array(duration * sampleRate);
      
      // Just a single sine wave with occasional beats
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatPhase = i % Math.floor(sampleRate * 0.6); // 100 BPM
        
        // Minimal percussion
        if (beatPhase < 1000) {
          audio[i] = Math.sin(2 * Math.PI * 60 * t) * Math.exp(-beatPhase / 1000 * 20) * 0.3;
        } else {
          // Almost silence
          audio[i] = Math.sin(2 * Math.PI * 220 * t) * 0.01;
        }
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      
      // Should detect some beats even in minimal audio
      expect(detectedBeats.length).toBeGreaterThan(3);
      
      console.log('Minimal audio:', {
        beats: detectedBeats.length
      });
    });
  });

  describe('Performance Under Stress', () => {
    test('should maintain performance with very long audio', async () => {
      const duration = 60; // 1 minute
      const sampleRate = 44100;
      const bpm = 125;
      const audio = new Float32Array(duration * sampleRate);
      
      // Generate long audio with consistent beats
      for (let i = 0; i < audio.length; i++) {
        const t = i / sampleRate;
        const beatPhase = i % Math.floor((60 / bpm) * sampleRate);
        
        if (beatPhase < 2000) {
          const decay = Math.exp(-beatPhase / sampleRate * 25);
          audio[i] = Math.sin(2 * Math.PI * 60 * t) * decay * 0.7;
        } else {
          audio[i] = Math.sin(2 * Math.PI * 220 * t) * 0.2;
        }
      }

      const startTime = Date.now();
      const detectedBeats = await hybridDetector.detectBeats(audio);
      const processingTime = Date.now() - startTime;
      
      // Should process long audio efficiently
      expect(processingTime).toBeLessThan(30000); // < 30 seconds
      expect(detectedBeats.length).toBeGreaterThan(50); // Should find many beats
      
      console.log('Long audio performance:', {
        duration: `${duration}s`,
        processingTime: `${processingTime}ms`,
        beats: detectedBeats.length,
        efficiency: `${(duration * 1000 / processingTime).toFixed(1)}x realtime`
      });
    });
  });
});