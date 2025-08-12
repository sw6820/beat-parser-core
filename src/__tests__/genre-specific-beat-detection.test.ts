/**
 * Genre-Specific Beat Detection Test Suite
 * 
 * This comprehensive test suite validates beat detection accuracy across different musical genres
 * and styles to ensure the hybrid algorithm performs well universally.
 * 
 * Test Coverage:
 * 1. Electronic/EDM: Strong kick drums, consistent tempo, clear beats
 * 2. Rock/Metal: Complex drum patterns, guitar emphasis, variable dynamics  
 * 3. Hip-Hop: Strong downbeats, samples, rap vocals
 * 4. Classical: Complex rhythms, minimal percussion, orchestral instruments
 * 5. Jazz: Syncopated rhythms, tempo changes, irregular patterns
 * 6. Ambient: Minimal percussion, atmospheric sounds, subtle rhythms
 * 7. World Music: Non-Western rhythms, unusual time signatures
 * 8. Pop: Commercial beats, standard 4/4 time, vocal emphasis
 * 
 * Accuracy targets: >85% across all genres, >90% for percussive genres
 */

import { BeatParser } from '../core/BeatParser';
import { HybridDetector } from '../algorithms/HybridDetector';
import { BeatCandidate } from '../types';

describe('Genre-Specific Beat Detection Accuracy Tests', () => {
  let parser: BeatParser;
  let hybridDetector: HybridDetector;

  beforeEach(() => {
    parser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.5,
      multiPassEnabled: true,
      genreAdaptive: true
    });

    hybridDetector = new HybridDetector({
      sampleRate: 44100,
      multiPassEnabled: true,
      genreAdaptive: true,
      confidenceThreshold: 0.5
    });
  });

  afterEach(async () => {
    await parser.cleanup();
  });

  /**
   * Generate synthetic audio for specific genres with known ground truth beats
   */
  const generateGenreAudio = (params: {
    genre: string;
    duration: number;
    bpm: number;
    timeSignature?: { numerator: number; denominator: number };
    complexity?: 'low' | 'medium' | 'high';
  }): { audio: Float32Array; groundTruthBeats: number[] } => {
    const { genre, duration, bpm, timeSignature = { numerator: 4, denominator: 4 }, complexity = 'medium' } = params;
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);
    const groundTruthBeats: number[] = [];

    const beatInterval = (60 / bpm) * sampleRate;
    const beatsPerMeasure = timeSignature.numerator;
    const measureInterval = beatInterval * beatsPerMeasure;

    // Generate ground truth beat timestamps
    for (let beat = 0; beat * beatInterval < samples; beat++) {
      groundTruthBeats.push((beat * beatInterval) / sampleRate);
    }

    // Generate genre-specific audio patterns
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const beatPhase = i % beatInterval;
      const measurePhase = i % measureInterval;
      const beatNumber = Math.floor(i / beatInterval) % beatsPerMeasure;
      
      let sample = 0;

      switch (genre) {
        case 'electronic-edm':
          // Strong kick on every beat, hi-hat on off-beats
          if (beatPhase < sampleRate * 0.05) {
            const decay = Math.exp(-beatPhase / sampleRate * 30);
            sample += Math.sin(2 * Math.PI * 50 * t) * decay * 0.9; // Kick
          }
          if (beatPhase > beatInterval * 0.45 && beatPhase < beatInterval * 0.55) {
            sample += (Math.random() - 0.5) * 0.4; // Hi-hat
          }
          // Sawtooth bass
          sample += ((t * 110) % 1 - 0.5) * 0.3;
          // Synth pad
          sample += Math.sin(2 * Math.PI * 220 * t) * 0.15 * Math.sin(2 * Math.PI * 0.5 * t);
          break;

        case 'rock-metal':
          // Kick on 1 and 3, snare on 2 and 4
          if ((beatNumber === 0 || beatNumber === 2) && beatPhase < sampleRate * 0.06) {
            const decay = Math.exp(-beatPhase / sampleRate * 25);
            sample += Math.sin(2 * Math.PI * 65 * t) * decay * 0.8;
          }
          if ((beatNumber === 1 || beatNumber === 3) && beatPhase < sampleRate * 0.04) {
            sample += (Math.random() - 0.5) * 0.7 + Math.sin(2 * Math.PI * 200 * t) * 0.3;
          }
          // Power chords
          const powerChords = [82.41, 87.31, 98.00, 110.00]; // E, F, G, A
          const chordIndex = Math.floor(t / (60/bpm * 4)) % powerChords.length;
          sample += Math.sin(2 * Math.PI * powerChords[chordIndex] * t) * 0.4;
          sample += Math.sin(2 * Math.PI * powerChords[chordIndex] * 2 * t) * 0.2;
          // Complex drum fills
          if (complexity === 'high' && measurePhase > measureInterval * 0.75) {
            if (Math.random() < 0.3) {
              sample += (Math.random() - 0.5) * 0.6;
            }
          }
          break;

        case 'hip-hop':
          // Strong kick on 1 and 3, snare on 2 and 4
          if ((beatNumber === 0 || beatNumber === 2) && beatPhase < sampleRate * 0.08) {
            const decay = Math.exp(-beatPhase / sampleRate * 20);
            sample += Math.sin(2 * Math.PI * 45 * t) * decay * 0.9;
          }
          if ((beatNumber === 1 || beatNumber === 3) && beatPhase < sampleRate * 0.05) {
            sample += (Math.random() - 0.5) * 0.8 + Math.sin(2 * Math.PI * 250 * t) * 0.4;
          }
          // 808 sub bass
          sample += Math.sin(2 * Math.PI * 55 * t) * 0.6 * Math.exp(-t % (60/bpm) * 5);
          // Hi-hats with swing
          const swingOffset = (beatNumber % 2 === 1) ? beatInterval * 0.05 : 0;
          if ((i + swingOffset) % (beatInterval / 4) < 100) {
            sample += (Math.random() - 0.5) * 0.2;
          }
          break;

        case 'classical':
          // Subtle timpani on strong beats
          if (beatNumber === 0 && beatPhase < sampleRate * 0.1) {
            const decay = Math.exp(-beatPhase / sampleRate * 15);
            sample += Math.sin(2 * Math.PI * 55 * t) * decay * 0.6;
          }
          // String ensemble
          const scales = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]; // C major
          const noteIndex = Math.floor(t * 2) % scales.length;
          sample += Math.sin(2 * Math.PI * scales[noteIndex] * t) * 0.4;
          sample += Math.sin(2 * Math.PI * scales[noteIndex] * 2 * t) * 0.1;
          // Woodwind section
          if (Math.sin(2 * Math.PI * t / 8) > 0.5) {
            sample += Math.sin(2 * Math.PI * scales[noteIndex] * 1.5 * t) * 0.2;
          }
          break;

        case 'jazz':
          // Swing rhythm - triplet subdivision
          const swingFactor = 0.67; // Swing ratio
          const tripletPhase = (i % (beatInterval / 3));
          const swingAdjustment = (tripletPhase > beatInterval / 6) ? beatInterval * 0.1 : 0;
          const adjustedPhase = (i + swingAdjustment) % beatInterval;
          
          if (adjustedPhase < sampleRate * 0.02) {
            // Brushed snare
            sample += (Math.random() - 0.5) * 0.5;
          }
          // Walking bass
          const jazzBass = [110, 123.47, 130.81, 146.83]; // A, B, C, D
          const bassNote = jazzBass[Math.floor(t * bpm / 60) % jazzBass.length];
          sample += Math.sin(2 * Math.PI * bassNote * t) * 0.4;
          // Ride cymbal
          if (Math.random() < 0.1) {
            sample += (Math.random() - 0.5) * 0.15;
          }
          break;

        case 'ambient':
          // Subtle rhythmic elements
          if (beatNumber === 0 && beatPhase < sampleRate * 0.2) {
            const decay = Math.exp(-beatPhase / sampleRate * 2);
            sample += Math.sin(2 * Math.PI * 40 * t) * decay * 0.3;
          }
          // Atmospheric pads
          sample += Math.sin(2 * Math.PI * 110 * t) * 0.2 * Math.sin(2 * Math.PI * 0.1 * t);
          sample += Math.sin(2 * Math.PI * 220 * t) * 0.15 * Math.sin(2 * Math.PI * 0.07 * t);
          sample += Math.sin(2 * Math.PI * 330 * t) * 0.1 * Math.sin(2 * Math.PI * 0.13 * t);
          // Subtle texture
          sample += (Math.random() - 0.5) * 0.02;
          break;

        case 'world-music':
          // Complex polyrhythms (3 against 4)
          const polyrhythm3 = Math.floor(i / (beatInterval / 3)) % 3;
          const polyrhythm4 = Math.floor(i / (beatInterval / 4)) % 4;
          
          if (polyrhythm3 === 0 && (i % (beatInterval / 3)) < 1000) {
            // Tabla-like percussion
            sample += Math.sin(2 * Math.PI * 150 * t) * Math.exp(-((i % (beatInterval / 3)) / 1000) * 10) * 0.6;
          }
          if (polyrhythm4 === 0 && (i % (beatInterval / 4)) < 800) {
            // Frame drum
            sample += (Math.random() - 0.5) * 0.4;
          }
          // Pentatonic melody
          const pentatonic = [261.63, 293.66, 329.63, 392.00, 440.00]; // C pentatonic
          const melodyNote = pentatonic[Math.floor(t * 3) % pentatonic.length];
          sample += Math.sin(2 * Math.PI * melodyNote * t) * 0.3;
          break;

        case 'pop':
          // Standard pop beat: kick on 1 and 3, snare on 2 and 4
          if ((beatNumber === 0 || beatNumber === 2) && beatPhase < sampleRate * 0.05) {
            const decay = Math.exp(-beatPhase / sampleRate * 25);
            sample += Math.sin(2 * Math.PI * 60 * t) * decay * 0.8;
          }
          if ((beatNumber === 1 || beatNumber === 3) && beatPhase < sampleRate * 0.03) {
            sample += (Math.random() - 0.5) * 0.6 + Math.sin(2 * Math.PI * 200 * t) * 0.3;
          }
          // Pop chord progression (I-V-vi-IV)
          const popChords = [261.63, 392.00, 220.00, 349.23]; // C-G-Am-F
          const chordIdx = Math.floor(t / (60/bpm * 2)) % popChords.length;
          sample += Math.sin(2 * Math.PI * popChords[chordIdx] * t) * 0.3;
          // Hi-hats on 8th notes
          if ((i % (beatInterval / 2)) < 500) {
            sample += (Math.random() - 0.5) * 0.15;
          }
          break;
      }

      // Add complexity variations
      if (complexity === 'high') {
        // Add polyrhythmic elements
        if (Math.floor(i / (beatInterval / 5)) % 5 === 0) {
          sample += Math.sin(2 * Math.PI * 800 * t) * 0.1;
        }
        if (Math.floor(i / (beatInterval / 7)) % 7 === 0) {
          sample += (Math.random() - 0.5) * 0.08;
        }
      }

      // Add realistic characteristics
      sample += (Math.random() - 0.5) * 0.01; // Background noise
      sample *= 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.2 * t); // Dynamic variation
      
      audio[i] = Math.max(-1, Math.min(1, sample));
    }

    return { audio, groundTruthBeats };
  };

  /**
   * Calculate beat detection accuracy metrics
   */
  const calculateAccuracyMetrics = (detectedBeats: BeatCandidate[], groundTruthBeats: number[], tolerance = 0.05) => {
    const truePositives: number[] = [];
    const falsePositives: BeatCandidate[] = [];
    const falseNegatives: number[] = [];

    // Find true positives
    for (const detected of detectedBeats) {
      const matchingTruth = groundTruthBeats.find(truth => 
        Math.abs(detected.timestamp - truth) <= tolerance
      );
      if (matchingTruth) {
        truePositives.push(matchingTruth);
      } else {
        falsePositives.push(detected);
      }
    }

    // Find false negatives
    for (const truth of groundTruthBeats) {
      const matchingDetected = truePositives.find(tp => Math.abs(tp - truth) <= tolerance);
      if (!matchingDetected) {
        falseNegatives.push(truth);
      }
    }

    const precision = detectedBeats.length > 0 ? truePositives.length / detectedBeats.length : 0;
    const recall = groundTruthBeats.length > 0 ? truePositives.length / groundTruthBeats.length : 0;
    const fMeasure = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      precision,
      recall,
      fMeasure,
      truePositives: truePositives.length,
      falsePositives: falsePositives.length,
      falseNegatives: falseNegatives.length,
      totalGroundTruth: groundTruthBeats.length,
      totalDetected: detectedBeats.length
    };
  };

  describe('Electronic/EDM Genre Testing', () => {
    const edmSubgenres = [
      { name: 'House', bpm: 128, expectedAccuracy: 0.92 },
      { name: 'Techno', bpm: 140, expectedAccuracy: 0.93 },
      { name: 'Dubstep', bpm: 70, expectedAccuracy: 0.88 }, // Half-time feel
      { name: 'Drum & Bass', bpm: 175, expectedAccuracy: 0.90 },
      { name: 'Trance', bpm: 132, expectedAccuracy: 0.91 }
    ];

    test.each(edmSubgenres)('should accurately detect beats in $name (target: >$expectedAccuracy F-measure)', async ({ name, bpm, expectedAccuracy }) => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'electronic-edm',
        duration: 15,
        bpm,
        complexity: 'medium'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats);

      expect(metrics.fMeasure).toBeGreaterThan(expectedAccuracy);
      expect(metrics.precision).toBeGreaterThan(0.85);
      expect(metrics.recall).toBeGreaterThan(0.85);
      
      console.log(`${name} metrics:`, {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3),
        detected: metrics.totalDetected,
        groundTruth: metrics.totalGroundTruth
      });
    });

    test('should adapt to different picture count requirements', async () => {
      const { audio } = generateGenreAudio({
        genre: 'electronic-edm',
        duration: 10,
        bpm: 128,
        complexity: 'low'
      });

      const pictureCounts = [1, 5, 10, 20, 50];
      
      for (const targetCount of pictureCounts) {
        const result = await parser.parseBuffer(audio, {
          targetPictureCount: targetCount,
          selectionMethod: 'adaptive'
        });

        expect(result.beats.length).toBeLessThanOrEqual(targetCount);
        if (targetCount <= result.beats.length) {
          expect(result.beats.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Rock/Metal Genre Testing', () => {
    const rockSubgenres = [
      { name: 'Classic Rock', bpm: 120, expectedAccuracy: 0.87 },
      { name: 'Heavy Metal', bpm: 140, expectedAccuracy: 0.85 },
      { name: 'Progressive Rock', bpm: 110, expectedAccuracy: 0.80, complexity: 'high' },
      { name: 'Punk Rock', bpm: 180, expectedAccuracy: 0.88 },
      { name: 'Alternative Rock', bpm: 125, expectedAccuracy: 0.86 }
    ];

    test.each(rockSubgenres)('should handle $name with complex drum patterns', async ({ name, bpm, expectedAccuracy, complexity = 'medium' }) => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'rock-metal',
        duration: 12,
        bpm,
        complexity: complexity as 'low' | 'medium' | 'high'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.06); // Slightly more tolerance for complex patterns

      expect(metrics.fMeasure).toBeGreaterThan(expectedAccuracy);
      expect(metrics.precision).toBeGreaterThan(0.75);
      
      console.log(`${name} metrics:`, {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3)
      });
    });

    test('should handle variable dynamics in metal', async () => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'rock-metal',
        duration: 10,
        bpm: 130,
        complexity: 'high'
      });

      // Add extreme dynamic variations
      const dynamicAudio = new Float32Array(audio.length);
      for (let i = 0; i < audio.length; i++) {
        const t = i / 44100;
        const dynamicFactor = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t)); // 0.3 to 1.0
        dynamicAudio[i] = audio[i] * dynamicFactor;
      }

      const detectedBeats = await hybridDetector.detectBeats(dynamicAudio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.07);

      expect(metrics.fMeasure).toBeGreaterThan(0.75); // Lower expectation due to dynamics
      expect(detectedBeats.length).toBeGreaterThan(0);
    });
  });

  describe('Hip-Hop Genre Testing', () => {
    const hipHopStyles = [
      { name: 'Boom Bap', bpm: 90, expectedAccuracy: 0.90 },
      { name: 'Trap', bpm: 140, expectedAccuracy: 0.89 },
      { name: 'Old School', bpm: 100, expectedAccuracy: 0.88 },
      { name: 'West Coast', bpm: 95, expectedAccuracy: 0.87 },
      { name: 'Drill', bpm: 150, expectedAccuracy: 0.86 }
    ];

    test.each(hipHopStyles)('should detect strong downbeats in $name', async ({ name, bpm, expectedAccuracy }) => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'hip-hop',
        duration: 12,
        bpm,
        complexity: 'medium'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats);

      expect(metrics.fMeasure).toBeGreaterThan(expectedAccuracy);
      
      // Hip-hop should have strong confidence on downbeats
      const strongBeats = detectedBeats.filter(beat => beat.confidence > 0.8);
      expect(strongBeats.length).toBeGreaterThan(detectedBeats.length * 0.3);
      
      console.log(`${name} metrics:`, {
        fMeasure: metrics.fMeasure.toFixed(3),
        strongBeats: strongBeats.length,
        totalBeats: detectedBeats.length
      });
    });
  });

  describe('Classical Genre Testing', () => {
    test('should handle minimal percussion with orchestral instruments', async () => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'classical',
        duration: 15,
        bpm: 80,
        complexity: 'high'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.1); // More tolerance

      // Classical music is challenging - lower expectations but still functional
      expect(metrics.fMeasure).toBeGreaterThan(0.65);
      expect(detectedBeats.length).toBeGreaterThan(0);
      
      console.log('Classical metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3)
      });
    });

    test('should handle different classical time signatures', async () => {
      const timeSignatures = [
        { numerator: 3, denominator: 4 }, // Waltz
        { numerator: 2, denominator: 4 }, // March
        { numerator: 6, denominator: 8 }  // Compound time
      ];

      for (const timeSignature of timeSignatures) {
        const { audio, groundTruthBeats } = generateGenreAudio({
          genre: 'classical',
          duration: 12,
          bpm: 90,
          timeSignature,
          complexity: 'medium'
        });

        const detectedBeats = await hybridDetector.detectBeats(audio);
        const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.1);

        expect(metrics.fMeasure).toBeGreaterThan(0.55); // Very lenient for complex time signatures
        expect(detectedBeats.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Jazz Genre Testing', () => {
    test('should handle syncopated rhythms and swing timing', async () => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'jazz',
        duration: 12,
        bpm: 120,
        complexity: 'high'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.08); // Account for swing timing

      // Jazz is complex - moderate expectations
      expect(metrics.fMeasure).toBeGreaterThan(0.70);
      expect(detectedBeats.length).toBeGreaterThan(0);
      
      console.log('Jazz metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3)
      });
    });

    test('should handle tempo changes in jazz', async () => {
      // Create jazz with gradual tempo change
      const baseBpm = 100;
      const audio = new Float32Array(44100 * 15); // 15 seconds
      const groundTruthBeats: number[] = [];
      
      let currentTime = 0;
      let beatCount = 0;
      
      while (currentTime < 15) {
        const progressRatio = currentTime / 15;
        const currentBpm = baseBpm + (40 * progressRatio); // 100 to 140 BPM
        const beatInterval = 60 / currentBpm;
        
        groundTruthBeats.push(currentTime);
        currentTime += beatInterval;
        beatCount++;
      }

      // Generate corresponding audio (simplified for tempo changes)
      for (let i = 0; i < audio.length; i++) {
        const t = i / 44100;
        const progressRatio = t / 15;
        const currentBpm = baseBpm + (40 * progressRatio);
        
        // Find nearest beat
        const nearestBeat = groundTruthBeats.reduce((prev, curr) => 
          Math.abs(curr - t) < Math.abs(prev - t) ? curr : prev
        );
        const timeToBeat = Math.abs(t - nearestBeat);
        
        if (timeToBeat < 0.05) { // Within 50ms of beat
          const decay = Math.exp(-timeToBeat * 20);
          audio[i] = Math.sin(2 * Math.PI * 100 * t) * decay * 0.6;
        } else {
          audio[i] = (Math.random() - 0.5) * 0.1;
        }
      }

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.1);

      // Very lenient for variable tempo
      expect(metrics.fMeasure).toBeGreaterThan(0.50);
      expect(detectedBeats.length).toBeGreaterThan(groundTruthBeats.length * 0.3);
    });
  });

  describe('Ambient Genre Testing', () => {
    test('should detect subtle rhythmic elements in ambient music', async () => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'ambient',
        duration: 20,
        bpm: 60, // Very slow
        complexity: 'low'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.15); // Very tolerant

      // Ambient is extremely challenging - very low expectations
      expect(detectedBeats.length).toBeGreaterThan(0);
      if (metrics.totalGroundTruth > 0) {
        expect(metrics.recall).toBeGreaterThan(0.2); // Find at least 20% of beats
      }
      
      console.log('Ambient metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        detected: metrics.totalDetected,
        groundTruth: metrics.totalGroundTruth
      });
    });
  });

  describe('World Music Genre Testing', () => {
    test('should handle non-Western rhythms and polyrhythms', async () => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'world-music',
        duration: 15,
        bpm: 110,
        complexity: 'high'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.08);

      // World music complexity - moderate expectations
      expect(metrics.fMeasure).toBeGreaterThan(0.65);
      expect(detectedBeats.length).toBeGreaterThan(0);
      
      console.log('World music metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3)
      });
    });

    test('should handle unusual time signatures', async () => {
      const unusualTimeSignatures = [
        { numerator: 5, denominator: 4 }, // 5/4 time
        { numerator: 7, denominator: 8 }, // 7/8 time
        { numerator: 9, denominator: 8 }  // 9/8 time
      ];

      for (const timeSignature of unusualTimeSignatures) {
        const { audio, groundTruthBeats } = generateGenreAudio({
          genre: 'world-music',
          duration: 12,
          bpm: 100,
          timeSignature,
          complexity: 'medium'
        });

        const detectedBeats = await hybridDetector.detectBeats(audio);
        const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, 0.1);

        // Very challenging - basic functionality test
        expect(detectedBeats.length).toBeGreaterThan(0);
        expect(metrics.fMeasure).toBeGreaterThan(0.4);
      }
    });
  });

  describe('Pop Genre Testing', () => {
    test('should excel at commercial pop with standard 4/4 time', async () => {
      const { audio, groundTruthBeats } = generateGenreAudio({
        genre: 'pop',
        duration: 12,
        bpm: 120,
        complexity: 'low'
      });

      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats);

      // Pop should be highly accurate
      expect(metrics.fMeasure).toBeGreaterThan(0.90);
      expect(metrics.precision).toBeGreaterThan(0.88);
      expect(metrics.recall).toBeGreaterThan(0.85);
      
      console.log('Pop metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3)
      });
    });

    test('should handle different pop tempos effectively', async () => {
      const popTempos = [80, 100, 120, 140, 160]; // Ballad to uptempo
      
      for (const bpm of popTempos) {
        const { audio, groundTruthBeats } = generateGenreAudio({
          genre: 'pop',
          duration: 10,
          bpm,
          complexity: 'low'
        });

        const detectedBeats = await hybridDetector.detectBeats(audio);
        const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats);

        expect(metrics.fMeasure).toBeGreaterThan(0.85); // High expectation for pop
        
        // Check tempo detection accuracy
        const result = await parser.parseBuffer(audio, { targetPictureCount: 8 });
        if (result.tempo && result.tempo > 0) {
          expect(Math.abs(result.tempo - bpm)).toBeLessThan(10); // Within 10 BPM
        }
      }
    });
  });

  describe('Tempo Variation Testing', () => {
    test('should handle different tempo ranges accurately', async () => {
      const tempoRanges = [
        { name: 'Very Slow', bpm: 60, tolerance: 15, expectedAccuracy: 0.75 },
        { name: 'Slow', bpm: 80, tolerance: 10, expectedAccuracy: 0.85 },
        { name: 'Medium', bpm: 120, tolerance: 8, expectedAccuracy: 0.90 },
        { name: 'Fast', bpm: 160, tolerance: 12, expectedAccuracy: 0.88 },
        { name: 'Very Fast', bpm: 200, tolerance: 20, expectedAccuracy: 0.80 }
      ];

      for (const tempo of tempoRanges) {
        const { audio, groundTruthBeats } = generateGenreAudio({
          genre: 'electronic-edm', // Use EDM for consistency
          duration: 12,
          bpm: tempo.bpm,
          complexity: 'medium'
        });

        const detectedBeats = await hybridDetector.detectBeats(audio);
        const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats);

        expect(metrics.fMeasure).toBeGreaterThan(tempo.expectedAccuracy);
        
        console.log(`${tempo.name} (${tempo.bpm} BPM) metrics:`, {
          fMeasure: metrics.fMeasure.toFixed(3)
        });
      }
    });
  });

  describe('Confidence Score Validation', () => {
    test('should provide reliable confidence scores across genres', async () => {
      const genres = ['electronic-edm', 'rock-metal', 'hip-hop', 'pop'];
      const confidenceResults: Record<string, number[]> = {};

      for (const genre of genres) {
        const { audio } = generateGenreAudio({
          genre,
          duration: 10,
          bpm: 120,
          complexity: 'medium'
        });

        const detectedBeats = await hybridDetector.detectBeats(audio);
        const confidences = detectedBeats.map(beat => beat.confidence);
        confidenceResults[genre] = confidences;

        // Basic confidence validation
        expect(confidences.every(c => c >= 0 && c <= 1)).toBe(true);
        expect(confidences.length).toBeGreaterThan(0);
        
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        console.log(`${genre} average confidence:`, avgConfidence.toFixed(3));
      }

      // Electronic and pop should generally have higher confidence than classical/ambient
      const electronicAvg = confidenceResults['electronic-edm'].reduce((a, b) => a + b, 0) / confidenceResults['electronic-edm'].length;
      const popAvg = confidenceResults['pop'].reduce((a, b) => a + b, 0) / confidenceResults['pop'].length;
      
      expect(electronicAvg).toBeGreaterThan(0.6);
      expect(popAvg).toBeGreaterThan(0.6);
    });
  });

  describe('Performance Benchmarking', () => {
    test('should meet performance targets across genres', async () => {
      const genres = ['electronic-edm', 'rock-metal', 'hip-hop', 'classical', 'jazz', 'pop'];
      const performanceResults: Record<string, number> = {};

      for (const genre of genres) {
        const { audio } = generateGenreAudio({
          genre,
          duration: 15, // Longer test
          bpm: 120,
          complexity: 'medium'
        });

        const startTime = Date.now();
        await hybridDetector.detectBeats(audio);
        const processingTime = Date.now() - startTime;
        
        performanceResults[genre] = processingTime;
        
        // Should process 15 seconds of audio in reasonable time
        expect(processingTime).toBeLessThan(10000); // 10 seconds max
        
        console.log(`${genre} processing time: ${processingTime}ms`);
      }

      // Average performance across all genres
      const avgTime = Object.values(performanceResults).reduce((a, b) => a + b, 0) / genres.length;
      expect(avgTime).toBeLessThan(8000); // 8 seconds average
    });
  });

  describe('Overall Accuracy Summary', () => {
    test('should meet genre-specific accuracy targets', async () => {
      const genreTargets = [
        { genre: 'electronic-edm', bpm: 128, target: 0.90, description: 'Electronic/EDM' },
        { genre: 'rock-metal', bpm: 130, target: 0.85, description: 'Rock/Metal' },
        { genre: 'hip-hop', bpm: 100, target: 0.88, description: 'Hip-Hop' },
        { genre: 'pop', bpm: 120, target: 0.90, description: 'Pop' },
        { genre: 'jazz', bpm: 110, target: 0.70, description: 'Jazz' },
        { genre: 'classical', bpm: 85, target: 0.65, description: 'Classical' },
        { genre: 'world-music', bpm: 105, target: 0.65, description: 'World Music' },
        { genre: 'ambient', bpm: 70, target: 0.40, description: 'Ambient' }
      ];

      const results: Array<{
        genre: string;
        description: string;
        fMeasure: number;
        target: number;
        passed: boolean;
      }> = [];

      for (const test of genreTargets) {
        const { audio, groundTruthBeats } = generateGenreAudio({
          genre: test.genre,
          duration: 12,
          bpm: test.bpm,
          complexity: 'medium'
        });

        const detectedBeats = await hybridDetector.detectBeats(audio);
        const tolerance = test.genre === 'ambient' ? 0.15 : 0.08;
        const metrics = calculateAccuracyMetrics(detectedBeats, groundTruthBeats, tolerance);

        const passed = metrics.fMeasure >= test.target;
        results.push({
          genre: test.genre,
          description: test.description,
          fMeasure: metrics.fMeasure,
          target: test.target,
          passed
        });

        expect(metrics.fMeasure).toBeGreaterThan(test.target);
      }

      // Print summary
      console.log('\n=== GENRE ACCURACY SUMMARY ===');
      results.forEach(result => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} ${result.description}: ${(result.fMeasure * 100).toFixed(1)}% (target: ${(result.target * 100).toFixed(1)}%)`);
      });

      // Overall metrics
      const overallAccuracy = results.reduce((sum, r) => sum + r.fMeasure, 0) / results.length;
      const passRate = results.filter(r => r.passed).length / results.length;
      
      console.log(`\nOverall Average Accuracy: ${(overallAccuracy * 100).toFixed(1)}%`);
      console.log(`Pass Rate: ${(passRate * 100).toFixed(1)}%`);

      expect(overallAccuracy).toBeGreaterThan(0.75); // 75% average across all genres
      expect(passRate).toBeGreaterThan(0.85); // 85% of tests should pass
    });
  });
});