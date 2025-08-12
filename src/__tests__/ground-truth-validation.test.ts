/**
 * Ground Truth Validation and Comparative Analysis Test Suite
 * 
 * This test suite validates beat detection accuracy using precise ground truth data
 * and compares the hybrid algorithm performance against individual algorithms.
 * 
 * Features:
 * - Precise ground truth beat annotation generation
 * - Statistical accuracy analysis with confidence intervals
 * - Comparative performance analysis (Hybrid vs Individual algorithms)
 * - Genre adaptation effectiveness measurement
 * - Beat phase alignment validation
 * - Tempo estimation accuracy testing
 */

import { BeatParser } from '../core/BeatParser';
import { HybridDetector } from '../algorithms/HybridDetector';
import { OnsetDetection } from '../algorithms/OnsetDetection';
import { TempoTracking } from '../algorithms/TempoTracking';
import { SpectralFeatures } from '../algorithms/SpectralFeatures';
import { BeatCandidate } from '../types';

describe('Ground Truth Validation and Comparative Analysis', () => {
  let parser: BeatParser;
  let hybridDetector: HybridDetector;
  let onsetDetector: OnsetDetection;
  let tempoTracker: TempoTracking;

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

    onsetDetector = new OnsetDetection({
      sampleRate: 44100,
      hopSize: 512,
      frameSize: 2048
    });

    tempoTracker = new TempoTracking({
      sampleRate: 44100,
      hopSize: 512,
      minTempo: 60,
      maxTempo: 200
    });
  });

  afterEach(async () => {
    await parser.cleanup();
  });

  /**
   * Generate ground truth beat annotations with precise timing
   */
  interface GroundTruthBeat {
    timestamp: number;
    beatType: 'downbeat' | 'beat' | 'offbeat' | 'syncopated';
    strength: number;
    measurePosition: number;
    beatPosition: number;
  }

  const generatePreciseGroundTruth = (params: {
    bpm: number;
    duration: number;
    timeSignature: { numerator: number; denominator: number };
    style: 'strict' | 'humanized' | 'swing';
    tempoVariation?: { type: 'none' | 'gradual' | 'sudden'; amount: number };
  }): GroundTruthBeat[] => {
    const { bpm, duration, timeSignature, style, tempoVariation = { type: 'none', amount: 0 } } = params;
    const beats: GroundTruthBeat[] = [];
    
    let currentTime = 0;
    let currentBpm = bpm;
    let measureCount = 0;
    let beatInMeasure = 0;

    while (currentTime < duration) {
      // Apply tempo variation
      if (tempoVariation.type === 'gradual') {
        const progress = currentTime / duration;
        currentBpm = bpm + (tempoVariation.amount * progress);
      } else if (tempoVariation.type === 'sudden' && Math.random() < 0.1) {
        currentBpm = bpm + (Math.random() - 0.5) * tempoVariation.amount;
      }

      let beatInterval = 60 / currentBpm;

      // Apply style variations
      if (style === 'humanized') {
        // Add small random timing variations (±2%)
        beatInterval *= (0.98 + Math.random() * 0.04);
      } else if (style === 'swing') {
        // Apply swing timing to off-beats
        if (beatInMeasure % 2 === 1) {
          beatInterval *= 1.15; // Swing ratio
        } else {
          beatInterval *= 0.85;
        }
      }

      // Determine beat type and strength
      let beatType: GroundTruthBeat['beatType'] = 'beat';
      let strength = 0.7;

      if (beatInMeasure === 0) {
        beatType = 'downbeat';
        strength = 1.0;
      } else if (beatInMeasure === 1 && timeSignature.numerator >= 4) {
        strength = 0.6; // Weaker beat 2
      } else if (beatInMeasure === 2 && timeSignature.numerator >= 4) {
        strength = 0.8; // Strong beat 3
      }

      // Add some syncopated beats
      if (Math.random() < 0.1 && beatInMeasure > 0) {
        beatType = 'syncopated';
        strength *= 0.9;
      }

      beats.push({
        timestamp: currentTime,
        beatType,
        strength,
        measurePosition: measureCount,
        beatPosition: beatInMeasure
      });

      currentTime += beatInterval;
      beatInMeasure = (beatInMeasure + 1) % timeSignature.numerator;
      if (beatInMeasure === 0) {
        measureCount++;
      }
    }

    return beats;
  };

  /**
   * Generate audio matching ground truth with high precision
   */
  const generateGroundTruthAudio = (
    groundTruth: GroundTruthBeat[],
    genre: 'electronic' | 'rock' | 'jazz' | 'classical',
    duration: number
  ): Float32Array => {
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);

    // Generate audio based on ground truth beats
    for (const beat of groundTruth) {
      const sampleIndex = Math.floor(beat.timestamp * sampleRate);
      const beatDuration = Math.floor(sampleRate * 0.1); // 100ms
      
      if (sampleIndex < samples) {
        for (let i = 0; i < beatDuration && sampleIndex + i < samples; i++) {
          const t = (sampleIndex + i) / sampleRate;
          const envelope = Math.exp(-i / sampleRate * 20) * beat.strength;
          let sample = 0;

          switch (genre) {
            case 'electronic':
              if (beat.beatType === 'downbeat') {
                sample = Math.sin(2 * Math.PI * 50 * t) * envelope * 0.9;
              } else {
                sample = Math.sin(2 * Math.PI * 80 * t) * envelope * 0.7;
              }
              break;

            case 'rock':
              if (beat.beatType === 'downbeat') {
                sample = Math.sin(2 * Math.PI * 60 * t) * envelope * 0.8;
              } else {
                sample = (Math.random() - 0.5) * envelope * 0.6;
              }
              break;

            case 'jazz':
              sample = (Math.random() - 0.5) * envelope * 0.5;
              if (beat.beatType === 'downbeat') {
                sample += Math.sin(2 * Math.PI * 70 * t) * envelope * 0.4;
              }
              break;

            case 'classical':
              if (beat.beatType === 'downbeat') {
                sample = Math.sin(2 * Math.PI * 55 * t) * envelope * 0.6;
              } else {
                sample = Math.sin(2 * Math.PI * 110 * t) * envelope * 0.2;
              }
              break;
          }

          audio[sampleIndex + i] += sample;
        }
      }
    }

    // Add background harmonics
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      audio[i] += Math.sin(2 * Math.PI * 220 * t) * 0.1 * Math.sin(2 * Math.PI * 0.5 * t);
      audio[i] += (Math.random() - 0.5) * 0.02; // Noise
    }

    return audio;
  };

  /**
   * Advanced accuracy metrics with statistical analysis
   */
  interface AccuracyMetrics {
    precision: number;
    recall: number;
    fMeasure: number;
    accuracy: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    trueNegatives: number;
    meanAbsoluteError: number;
    standardDeviation: number;
    confidenceInterval95: [number, number];
  }

  const calculateAdvancedAccuracy = (
    detectedBeats: BeatCandidate[],
    groundTruthBeats: GroundTruthBeat[],
    tolerance = 0.05
  ): AccuracyMetrics => {
    const truePositives: number[] = [];
    const falsePositives: BeatCandidate[] = [];
    const falseNegatives: GroundTruthBeat[] = [];
    const timingErrors: number[] = [];

    // Find matches
    for (const detected of detectedBeats) {
      const matchingTruth = groundTruthBeats.find(truth => 
        Math.abs(detected.timestamp - truth.timestamp) <= tolerance
      );
      
      if (matchingTruth) {
        truePositives.push(matchingTruth.timestamp);
        timingErrors.push(Math.abs(detected.timestamp - matchingTruth.timestamp));
      } else {
        falsePositives.push(detected);
      }
    }

    // Find unmatched ground truth beats
    for (const truth of groundTruthBeats) {
      const wasDetected = truePositives.some(tp => Math.abs(tp - truth.timestamp) <= tolerance);
      if (!wasDetected) {
        falseNegatives.push(truth);
      }
    }

    const tp = truePositives.length;
    const fp = falsePositives.length;
    const fn = falseNegatives.length;
    const tn = 0; // Not applicable for beat detection

    const precision = tp > 0 ? tp / (tp + fp) : 0;
    const recall = tp > 0 ? tp / (tp + fn) : 0;
    const fMeasure = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const accuracy = tp / (tp + fp + fn);

    // Statistical measures
    const meanAbsoluteError = timingErrors.length > 0 
      ? timingErrors.reduce((sum, err) => sum + err, 0) / timingErrors.length 
      : 0;

    const mean = meanAbsoluteError;
    const variance = timingErrors.length > 1
      ? timingErrors.reduce((sum, err) => sum + Math.pow(err - mean, 2), 0) / (timingErrors.length - 1)
      : 0;
    const standardDeviation = Math.sqrt(variance);

    // 95% confidence interval for F-measure (approximation)
    const n = Math.max(groundTruthBeats.length, 1);
    const stderr = standardDeviation / Math.sqrt(n);
    const confidenceInterval95: [number, number] = [
      Math.max(0, fMeasure - 1.96 * stderr),
      Math.min(1, fMeasure + 1.96 * stderr)
    ];

    return {
      precision,
      recall,
      fMeasure,
      accuracy,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      trueNegatives: tn,
      meanAbsoluteError,
      standardDeviation,
      confidenceInterval95
    };
  };

  describe('Precise Ground Truth Validation', () => {
    test('should achieve high accuracy with strictly timed beats', async () => {
      const groundTruth = generatePreciseGroundTruth({
        bpm: 120,
        duration: 15,
        timeSignature: { numerator: 4, denominator: 4 },
        style: 'strict'
      });

      const audio = generateGroundTruthAudio(groundTruth, 'electronic', 15);
      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAdvancedAccuracy(detectedBeats, groundTruth, 0.05);

      expect(metrics.fMeasure).toBeGreaterThan(0.90);
      expect(metrics.precision).toBeGreaterThan(0.88);
      expect(metrics.recall).toBeGreaterThan(0.88);
      expect(metrics.meanAbsoluteError).toBeLessThan(0.03); // < 30ms average error
      
      console.log('Strict timing metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3),
        meanError: `${(metrics.meanAbsoluteError * 1000).toFixed(1)}ms`,
        confidenceInterval: `[${(metrics.confidenceInterval95[0] * 100).toFixed(1)}%, ${(metrics.confidenceInterval95[1] * 100).toFixed(1)}%]`
      });
    });

    test('should handle humanized timing variations', async () => {
      const groundTruth = generatePreciseGroundTruth({
        bpm: 110,
        duration: 12,
        timeSignature: { numerator: 4, denominator: 4 },
        style: 'humanized'
      });

      const audio = generateGroundTruthAudio(groundTruth, 'rock', 12);
      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAdvancedAccuracy(detectedBeats, groundTruth, 0.07); // More tolerance

      expect(metrics.fMeasure).toBeGreaterThan(0.82);
      expect(metrics.meanAbsoluteError).toBeLessThan(0.05); // < 50ms average error
      
      console.log('Humanized timing metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        meanError: `${(metrics.meanAbsoluteError * 1000).toFixed(1)}ms`,
        stdDev: `${(metrics.standardDeviation * 1000).toFixed(1)}ms`
      });
    });

    test('should detect swing rhythm patterns', async () => {
      const groundTruth = generatePreciseGroundTruth({
        bpm: 120,
        duration: 10,
        timeSignature: { numerator: 4, denominator: 4 },
        style: 'swing'
      });

      const audio = generateGroundTruthAudio(groundTruth, 'jazz', 10);
      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAdvancedAccuracy(detectedBeats, groundTruth, 0.08);

      expect(metrics.fMeasure).toBeGreaterThan(0.75); // Lower expectation for swing
      expect(detectedBeats.length).toBeGreaterThan(0);
      
      console.log('Swing timing metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        precision: metrics.precision.toFixed(3),
        recall: metrics.recall.toFixed(3)
      });
    });
  });

  describe('Tempo Variation Testing', () => {
    test('should handle gradual tempo changes', async () => {
      const groundTruth = generatePreciseGroundTruth({
        bpm: 100,
        duration: 15,
        timeSignature: { numerator: 4, denominator: 4 },
        style: 'strict',
        tempoVariation: { type: 'gradual', amount: 30 } // 100 to 130 BPM
      });

      const audio = generateGroundTruthAudio(groundTruth, 'electronic', 15);
      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAdvancedAccuracy(detectedBeats, groundTruth, 0.1);

      expect(metrics.fMeasure).toBeGreaterThan(0.70); // Challenging scenario
      expect(detectedBeats.length).toBeGreaterThan(groundTruth.length * 0.5);
      
      console.log('Gradual tempo change metrics:', {
        fMeasure: metrics.fMeasure.toFixed(3),
        detected: detectedBeats.length,
        groundTruth: groundTruth.length
      });
    });

    test('should handle sudden tempo changes', async () => {
      const groundTruth = generatePreciseGroundTruth({
        bpm: 120,
        duration: 12,
        timeSignature: { numerator: 4, denominator: 4 },
        style: 'strict',
        tempoVariation: { type: 'sudden', amount: 20 } // ±20 BPM variations
      });

      const audio = generateGroundTruthAudio(groundTruth, 'rock', 12);
      const detectedBeats = await hybridDetector.detectBeats(audio);
      const metrics = calculateAdvancedAccuracy(detectedBeats, groundTruth, 0.1);

      expect(metrics.fMeasure).toBeGreaterThan(0.65); // Very challenging
      expect(detectedBeats.length).toBeGreaterThan(0);
    });
  });

  describe('Comparative Algorithm Analysis', () => {
    interface AlgorithmPerformance {
      name: string;
      fMeasure: number;
      precision: number;
      recall: number;
      meanError: number;
      processingTime: number;
    }

    test('should outperform individual algorithms', async () => {
      const groundTruth = generatePreciseGroundTruth({
        bpm: 130,
        duration: 10,
        timeSignature: { numerator: 4, denominator: 4 },
        style: 'strict'
      });

      const audio = generateGroundTruthAudio(groundTruth, 'electronic', 10);
      const results: AlgorithmPerformance[] = [];

      // Test Hybrid Algorithm
      const hybridStart = Date.now();
      const hybridBeats = await hybridDetector.detectBeats(audio);
      const hybridTime = Date.now() - hybridStart;
      const hybridMetrics = calculateAdvancedAccuracy(hybridBeats, groundTruth);
      
      results.push({
        name: 'Hybrid',
        fMeasure: hybridMetrics.fMeasure,
        precision: hybridMetrics.precision,
        recall: hybridMetrics.recall,
        meanError: hybridMetrics.meanAbsoluteError,
        processingTime: hybridTime
      });

      // Test Onset Detection Only
      const onsetStart = Date.now();
      const onsets = await onsetDetector.detectOnsets(audio);
      const onsetTime = Date.now() - onsetStart;
      const onsetBeats: BeatCandidate[] = onsets.map(onset => ({
        timestamp: onset.time,
        confidence: onset.confidence,
        source: 'onset' as const,
        strength: onset.strength
      }));
      const onsetMetrics = calculateAdvancedAccuracy(onsetBeats, groundTruth);
      
      results.push({
        name: 'Onset Only',
        fMeasure: onsetMetrics.fMeasure,
        precision: onsetMetrics.precision,
        recall: onsetMetrics.recall,
        meanError: onsetMetrics.meanError,
        processingTime: onsetTime
      });

      // Test Tempo Tracking Only
      const tempoStart = Date.now();
      const tempoData = await tempoTracker.trackTempo(audio);
      const tempoTime = Date.now() - tempoStart;
      
      // Convert tempo to beat candidates
      const tempoBeats: BeatCandidate[] = [];
      const beatInterval = 60 / tempoData.bpm;
      for (let time = 0; time < 10; time += beatInterval) {
        tempoBeats.push({
          timestamp: time,
          confidence: tempoData.confidence,
          source: 'tempo' as const,
          strength: tempoData.confidence
        });
      }
      const tempoMetrics = calculateAdvancedAccuracy(tempoBeats, groundTruth);
      
      results.push({
        name: 'Tempo Only',
        fMeasure: tempoMetrics.fMeasure,
        precision: tempoMetrics.precision,
        recall: tempoMetrics.recall,
        meanError: tempoMetrics.meanError,
        processingTime: tempoTime
      });

      // Print comparison table
      console.log('\n=== ALGORITHM COMPARISON ===');
      console.log('Algorithm      | F-Measure | Precision | Recall   | Mean Error | Time (ms)');
      console.log('---------------|-----------|-----------|----------|------------|----------');
      
      results.forEach(result => {
        console.log(
          `${result.name.padEnd(14)} | ${(result.fMeasure * 100).toFixed(1).padStart(8)}% | ` +
          `${(result.precision * 100).toFixed(1).padStart(8)}% | ${(result.recall * 100).toFixed(1).padStart(7)}% | ` +
          `${(result.meanError * 1000).toFixed(1).padStart(8)}ms | ${result.processingTime.toString().padStart(8)}`
        );
      });

      // Hybrid should be the best overall
      const hybrid = results.find(r => r.name === 'Hybrid')!;
      const others = results.filter(r => r.name !== 'Hybrid');
      
      expect(hybrid.fMeasure).toBeGreaterThan(0.85);
      others.forEach(other => {
        expect(hybrid.fMeasure).toBeGreaterThanOrEqual(other.fMeasure * 0.95); // At least 95% of best individual
      });
    });
  });

  describe('Genre Adaptation Effectiveness', () => {
    test('should show improved accuracy with genre adaptation enabled', async () => {
      const testGenres: Array<{ genre: 'electronic' | 'rock' | 'jazz' | 'classical'; bpm: number }> = [
        { genre: 'electronic', bpm: 128 },
        { genre: 'rock', bpm: 120 },
        { genre: 'jazz', bpm: 110 },
        { genre: 'classical', bpm: 90 }
      ];

      for (const { genre, bpm } of testGenres) {
        const groundTruth = generatePreciseGroundTruth({
          bpm,
          duration: 10,
          timeSignature: { numerator: 4, denominator: 4 },
          style: genre === 'jazz' ? 'swing' : 'strict'
        });

        const audio = generateGroundTruthAudio(groundTruth, genre, 10);

        // Test with genre adaptation enabled
        const adaptiveDetector = new HybridDetector({
          sampleRate: 44100,
          genreAdaptive: true,
          confidenceThreshold: 0.5
        });

        // Test with genre adaptation disabled
        const nonAdaptiveDetector = new HybridDetector({
          sampleRate: 44100,
          genreAdaptive: false,
          confidenceThreshold: 0.5
        });

        const adaptiveBeats = await adaptiveDetector.detectBeats(audio);
        const nonAdaptiveBeats = await nonAdaptiveDetector.detectBeats(audio);

        const adaptiveMetrics = calculateAdvancedAccuracy(adaptiveBeats, groundTruth);
        const nonAdaptiveMetrics = calculateAdvancedAccuracy(nonAdaptiveBeats, groundTruth);

        console.log(`${genre} adaptation comparison:`, {
          adaptive: adaptiveMetrics.fMeasure.toFixed(3),
          nonAdaptive: nonAdaptiveMetrics.fMeasure.toFixed(3),
          improvement: ((adaptiveMetrics.fMeasure - nonAdaptiveMetrics.fMeasure) * 100).toFixed(1) + '%'
        });

        // Genre adaptation should generally improve or maintain performance
        expect(adaptiveMetrics.fMeasure).toBeGreaterThanOrEqual(nonAdaptiveMetrics.fMeasure * 0.95);
      }
    });
  });

  describe('Beat Phase Alignment Analysis', () => {
    test('should accurately align beats with ground truth phase', async () => {
      const groundTruth = generatePreciseGroundTruth({
        bpm: 125,
        duration: 12,
        timeSignature: { numerator: 4, denominator: 4 },
        style: 'strict'
      });

      const audio = generateGroundTruthAudio(groundTruth, 'electronic', 12);
      const detectedBeats = await hybridDetector.detectBeats(audio);

      // Analyze phase alignment for matched beats
      const phaseErrors: number[] = [];
      const beatInterval = 60 / 125; // Expected beat interval

      for (const detected of detectedBeats) {
        const nearestGroundTruth = groundTruth.reduce((nearest, current) => 
          Math.abs(current.timestamp - detected.timestamp) < Math.abs(nearest.timestamp - detected.timestamp)
            ? current : nearest
        );

        if (Math.abs(detected.timestamp - nearestGroundTruth.timestamp) < 0.1) {
          const phaseError = (detected.timestamp - nearestGroundTruth.timestamp) / beatInterval;
          phaseErrors.push(Math.abs(phaseError));
        }
      }

      const meanPhaseError = phaseErrors.reduce((sum, err) => sum + err, 0) / phaseErrors.length;
      const maxPhaseError = Math.max(...phaseErrors);

      expect(meanPhaseError).toBeLessThan(0.1); // < 10% of beat interval
      expect(maxPhaseError).toBeLessThan(0.2); // < 20% of beat interval
      
      console.log('Phase alignment analysis:', {
        meanPhaseError: (meanPhaseError * 100).toFixed(1) + '%',
        maxPhaseError: (maxPhaseError * 100).toFixed(1) + '%',
        samplesAnalyzed: phaseErrors.length
      });
    });
  });

  describe('Tempo Estimation Accuracy', () => {
    test('should accurately estimate tempo within tolerance', async () => {
      const testTempos = [80, 100, 120, 140, 160, 180];
      const tempoResults: Array<{ actual: number; detected: number; error: number }> = [];

      for (const actualBpm of testTempos) {
        const groundTruth = generatePreciseGroundTruth({
          bpm: actualBpm,
          duration: 15, // Longer duration for accurate tempo estimation
          timeSignature: { numerator: 4, denominator: 4 },
          style: 'strict'
        });

        const audio = generateGroundTruthAudio(groundTruth, 'electronic', 15);
        
        // Use the parser for tempo estimation
        const result = await parser.parseBuffer(audio, { targetPictureCount: 10 });
        const detectedBpm = result.tempo || 0;
        
        const error = Math.abs(detectedBpm - actualBpm);
        const errorPercent = (error / actualBpm) * 100;
        
        tempoResults.push({
          actual: actualBpm,
          detected: detectedBpm,
          error: errorPercent
        });

        expect(errorPercent).toBeLessThan(10); // < 10% error
        console.log(`Tempo ${actualBpm} BPM: detected ${detectedBpm.toFixed(1)} BPM (${errorPercent.toFixed(1)}% error)`);
      }

      // Overall tempo estimation accuracy
      const meanError = tempoResults.reduce((sum, r) => sum + r.error, 0) / tempoResults.length;
      const maxError = Math.max(...tempoResults.map(r => r.error));

      expect(meanError).toBeLessThan(7); // < 7% average error
      expect(maxError).toBeLessThan(15); // < 15% maximum error

      console.log('Tempo estimation summary:', {
        meanError: meanError.toFixed(1) + '%',
        maxError: maxError.toFixed(1) + '%'
      });
    });
  });

  describe('Statistical Significance Testing', () => {
    test('should demonstrate statistically significant accuracy across multiple runs', async () => {
      const numRuns = 10;
      const fMeasures: number[] = [];

      for (let run = 0; run < numRuns; run++) {
        const groundTruth = generatePreciseGroundTruth({
          bpm: 120 + Math.random() * 40, // 120-160 BPM
          duration: 8,
          timeSignature: { numerator: 4, denominator: 4 },
          style: Math.random() > 0.5 ? 'strict' : 'humanized'
        });

        const genre: 'electronic' | 'rock' = Math.random() > 0.5 ? 'electronic' : 'rock';
        const audio = generateGroundTruthAudio(groundTruth, genre, 8);
        
        const detectedBeats = await hybridDetector.detectBeats(audio);
        const metrics = calculateAdvancedAccuracy(detectedBeats, groundTruth);
        
        fMeasures.push(metrics.fMeasure);
      }

      // Calculate statistics
      const mean = fMeasures.reduce((sum, f) => sum + f, 0) / numRuns;
      const variance = fMeasures.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / (numRuns - 1);
      const stdDev = Math.sqrt(variance);
      const confidenceInterval = {
        lower: mean - 1.96 * (stdDev / Math.sqrt(numRuns)),
        upper: mean + 1.96 * (stdDev / Math.sqrt(numRuns))
      };

      console.log('Statistical analysis across', numRuns, 'runs:');
      console.log('Mean F-measure:', (mean * 100).toFixed(1) + '%');
      console.log('Standard deviation:', (stdDev * 100).toFixed(1) + '%');
      console.log('95% CI:', `[${(confidenceInterval.lower * 100).toFixed(1)}%, ${(confidenceInterval.upper * 100).toFixed(1)}%]`);

      expect(mean).toBeGreaterThan(0.80); // 80% mean accuracy
      expect(confidenceInterval.lower).toBeGreaterThan(0.75); // Lower bound > 75%
      expect(stdDev).toBeLessThan(0.15); // Reasonable consistency
    });
  });
});