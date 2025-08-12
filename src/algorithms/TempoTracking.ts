/**
 * TempoTracking - Advanced tempo detection and beat tracking algorithms
 * Implements autocorrelation-based BPM detection, dynamic programming beat tracking,
 * and tempo curve extraction for variable tempo songs
 */

import type { 
  AudioData, 
  TempoTrackingOptions, 
  Tempo, 
  Beat,
  Onset 
} from '../types';
import { AudioProcessor } from '../core/AudioProcessor';
import { SignalProcessing } from '../utils/SignalProcessing';

export interface AdvancedTempoOptions {
  /** Use multi-scale autocorrelation */
  useMultiScale?: boolean;
  /** Apply tempo doubling/halving detection */
  detectTempoMultiples?: boolean;
  /** Use onset strength weighting */
  useOnsetWeighting?: boolean;
  /** Tempo smoothing factor for curves */
  smoothingFactor?: number;
}

export interface BeatTrackingOptions {
  /** Beat phase alignment method */
  phaseAlignment?: 'energy' | 'spectral' | 'combined';
  /** Use variable tempo tracking */
  variableTempo?: boolean;
  /** Tempo change tolerance */
  tempoTolerance?: number;
  /** Beat confidence threshold */
  confidenceThreshold?: number;
}

export interface TempoHypothesis {
  /** BPM value */
  bpm: number;
  /** Confidence score */
  confidence: number;
  /** Phase offset in seconds */
  phase: number;
  /** Strength score */
  strength: number;
  /** Autocorrelation peak value */
  autocorrelationPeak: number;
}

export class TempoTracking {
  private static readonly DEFAULT_OPTIONS: Required<TempoTrackingOptions> = {
    minBpm: 60,
    maxBpm: 200,
    windowSize: 10.0, // seconds
    useDynamicProgramming: true
  };
  
  private static readonly TEMPO_MULTIPLES = [0.25, 0.5, 1.0, 2.0, 3.0, 4.0];
  private static readonly COMMON_TEMPOS = [120, 128, 100, 140, 90, 110, 130, 150];

  private config: any;

  constructor(config: any = {}) {
    this.config = config;
  }

  detectTempo(audioData: AudioData, sampleRate: number, options: TempoTrackingOptions = {}): Tempo {
    return TempoTracking.detectTempo(audioData, sampleRate, options);
  }

  trackBeats(audioData: AudioData, sampleRate: number, tempo: Tempo, options: TempoTrackingOptions = {}): Beat[] {
    return TempoTracking.trackBeats(audioData, sampleRate, tempo, options);
  }

  /**
   * Helper method to convert AudioData to Float32Array
   */
  private static toFloat32Array(audioData: AudioData): Float32Array {
    if (audioData instanceof Float32Array) {
      return audioData;
    }
    return new Float32Array(audioData);
  }

  /**
   * Enhanced tempo detection with comprehensive analysis
   */
  static detectTempo(
    audioData: AudioData,
    sampleRate: number,
    options: TempoTrackingOptions = {},
    advancedOptions: AdvancedTempoOptions = {}
  ): Tempo {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const data = this.toFloat32Array(audioData);
    
    // Handle edge cases
    if (this.isAudioSilent(data, 0.001)) {
      return { bpm: 120, confidence: 0.0 };
    }
    
    if (this.isExtremelyFast(data, sampleRate)) {
      // Adjust parameters for very fast music
      opts.minBpm = Math.max(opts.minBpm, 140);
      opts.maxBpm = Math.min(opts.maxBpm, 300);
    } else if (this.isExtremelySlow(data, sampleRate)) {
      // Adjust parameters for very slow music
      opts.minBpm = Math.max(opts.minBpm, 40);
      opts.maxBpm = Math.min(opts.maxBpm, 90);
    }
    
    // Calculate enhanced onset function for tempo detection
    const onsetFunction = this.calculateOnsetFunction(data, sampleRate);
    
    // Perform enhanced autocorrelation analysis
    const tempoHypotheses = this.autocorrelationTempo(
      onsetFunction,
      sampleRate,
      opts.minBpm,
      opts.maxBpm,
      advancedOptions
    );
    
    // Select best tempo candidate with enhanced scoring
    const bestTempo = this.selectBestTempo(tempoHypotheses);
    
    return {
      bpm: bestTempo.bpm,
      confidence: bestTempo.confidence,
      timeSignature: this.estimateTimeSignature(
        bestTempo.bpm,
        onsetFunction,
        sampleRate,
        tempoHypotheses
      ),
      metadata: {
        phase: bestTempo.phase,
        alternativeTempos: tempoHypotheses.slice(0, 3).map(h => ({
          bpm: h.bpm,
          confidence: h.confidence
        }))
      }
    };
  }

  /**
   * Enhanced beat tracking with multiple algorithms and options
   */
  static trackBeats(
    onsets: Onset[],
    tempo: Tempo,
    audioDuration: number,
    options: TempoTrackingOptions = {},
    beatTrackingOptions: BeatTrackingOptions = {}
  ): Beat[] {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    
    // Handle edge cases
    if (onsets.length === 0) {
      return this.generateRegularBeats(tempo, audioDuration);
    }
    
    if (onsets.length < 3) {
      // Too few onsets for meaningful tracking
      return this.simpleTemplateBeatTracking(
        onsets,
        tempo,
        audioDuration,
        beatTrackingOptions
      );
    }
    
    let beats: Beat[];
    
    if (opts.useDynamicProgramming) {
      beats = this.dynamicProgrammingBeats(
        onsets,
        tempo,
        audioDuration,
        beatTrackingOptions
      );
    } else {
      beats = this.simpleTemplateBeatTracking(
        onsets,
        tempo,
        audioDuration,
        beatTrackingOptions
      );
    }
    
    // Post-process beats for consistency and phase alignment
    return this.postProcessBeats(beats, tempo, beatTrackingOptions);
  }
  
  /**
   * Generate regular beats when no onsets are available
   */
  private static generateRegularBeats(
    tempo: Tempo,
    audioDuration: number
  ): Beat[] {
    const beats: Beat[] = [];
    const beatInterval = 60 / tempo.bpm;
    const phase = (tempo as any).metadata?.phase || 0;
    
    for (let time = phase; time <= audioDuration; time += beatInterval) {
      beats.push({
        timestamp: time * 1000,
        confidence: tempo.confidence * 0.5, // Lower confidence for generated beats
        strength: 0.5 // Moderate strength for regular beats
      });
    }
    
    return beats;
  }
  
  /**
   * Post-process beats for consistency and alignment
   */
  private static postProcessBeats(
    beats: Beat[],
    tempo: Tempo,
    options: BeatTrackingOptions
  ): Beat[] {
    if (beats.length < 2) return beats;
    
    let processedBeats = [...beats];
    
    // Apply beat phase alignment if requested
    if (options.phaseAlignment && options.phaseAlignment !== 'energy') {
      processedBeats = this.alignBeatPhases(processedBeats, tempo, options.phaseAlignment);
    }
    
    // Filter out low-confidence beats if threshold is set
    if (options.confidenceThreshold) {
      processedBeats = processedBeats.filter(
        beat => beat.confidence >= options.confidenceThreshold!
      );
    }
    
    // Ensure minimum spacing between beats
    const minInterval = (60 / tempo.bpm) * 0.7; // 70% of expected interval
    processedBeats = this.enforceMinimumSpacing(processedBeats, minInterval);
    
    return processedBeats;
  }
  
  /**
   * Align beat phases using different methods
   */
  private static alignBeatPhases(
    beats: Beat[],
    tempo: Tempo,
    method: string
  ): Beat[] {
    if (beats.length < 2) return beats;
    
    const targetInterval = 60 / tempo.bpm; // seconds
    const aligned: Beat[] = [];
    
    // Keep first beat as anchor
    aligned.push(beats[0]!);
    
    for (let i = 1; i < beats.length; i++) {
      const currentBeat = beats[i]!;
      const expectedTime = aligned[0]!.timestamp / 1000 + i * targetInterval;
      
      let alignedTime: number;
      
      switch (method) {
        case 'spectral':
          // Favor expected timing for spectral alignment
          alignedTime = currentBeat.timestamp / 1000 * 0.3 + expectedTime * 0.7;
          break;
        case 'combined':
        default:
          // Balanced alignment
          alignedTime = currentBeat.timestamp / 1000 * 0.5 + expectedTime * 0.5;
          break;
      }
      
      aligned.push({
        ...currentBeat,
        timestamp: alignedTime * 1000,
        confidence: currentBeat.confidence * 0.9 // Slight confidence penalty for alignment
      });
    }
    
    return aligned;
  }
  
  /**
   * Enforce minimum spacing between beats
   */
  private static enforceMinimumSpacing(
    beats: Beat[],
    minInterval: number
  ): Beat[] {
    if (beats.length < 2) return beats;
    
    const spaced: Beat[] = [beats[0]!];
    
    for (let i = 1; i < beats.length; i++) {
      const currentBeat = beats[i]!;
      const lastBeat = spaced[spaced.length - 1]!;
      
      const interval = (currentBeat.timestamp - lastBeat.timestamp) / 1000;
      
      if (interval >= minInterval) {
        spaced.push(currentBeat);
      } else {
        // Keep the stronger beat
        if (currentBeat.strength > lastBeat.strength) {
          spaced[spaced.length - 1] = currentBeat;
        }
      }
    }
    
    return spaced;
  }

  /**
   * Extract tempo curve for variable tempo songs
   */
  static extractTempoCurve(
    audioData: AudioData,
    sampleRate: number,
    windowSize = 5.0, // seconds
    hopSize = 1.0, // seconds
    options: TempoTrackingOptions = {}
  ): Array<{ time: number; bpm: number; confidence: number }> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const data = this.toFloat32Array(audioData);
    const tempoCurve: Array<{ time: number; bpm: number; confidence: number }> = [];
    
    const windowSamples = Math.floor(windowSize * sampleRate);
    const hopSamples = Math.floor(hopSize * sampleRate);
    
    for (let start = 0; start + windowSamples < data.length; start += hopSamples) {
      const window = data.slice(start, start + windowSamples);
      const windowTempo = this.detectTempo(window, sampleRate, opts);
      
      tempoCurve.push({
        time: start / sampleRate,
        bpm: windowTempo.bpm,
        confidence: windowTempo.confidence
      });
    }
    
    // Smooth tempo curve to remove noise
    return this.smoothTempoCurve(tempoCurve);
  }

  /**
   * Calculate onset function optimized for tempo detection
   */
  private static calculateOnsetFunction(
    audioData: Float32Array,
    sampleRate: number
  ): Float32Array {
    const windowSize = 1024;
    const hopSize = 256; // Smaller hop size for better temporal resolution
    
    const frames = AudioProcessor.frameAudio(audioData, windowSize, hopSize);
    const onsetFunction = new Float32Array(frames.length);
    let previousSpectrum: Float32Array | null = null;
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame) continue;
      
      const windowed = AudioProcessor.applyWindow(frame);
      const spectrum = AudioProcessor.computeSpectrum(windowed);
      
      if (previousSpectrum) {
        let flux = 0;
        // Focus on lower frequency bands for rhythm
        const maxBin = Math.floor(spectrum.length * 0.3); // Up to ~6.6kHz at 44.1kHz
        
        for (let bin = 1; bin < maxBin; bin++) {
          const specValue = spectrum[bin];
          const prevValue = previousSpectrum[bin];
          if (specValue === undefined || prevValue === undefined) continue;
          
          const diff = specValue - prevValue;
          flux += Math.max(0, diff); // Half-wave rectification
        }
        onsetFunction[i] = flux;
      } else {
        onsetFunction[i] = 0;
      }
      
      previousSpectrum = spectrum;
    }
    
    // Apply low-pass filter to smooth onset function
    return this.lowPassFilter(onsetFunction, 20, sampleRate / hopSize); // 20 Hz cutoff
  }

  /**
   * Enhanced autocorrelation-based tempo detection with multiple improvements
   */
  private static autocorrelationTempo(
    onsetFunction: Float32Array,
    sampleRate: number,
    minBpm: number,
    maxBpm: number,
    options: AdvancedTempoOptions = {}
  ): TempoHypothesis[] {
    const hopSize = 256;
    const frameRate = sampleRate / hopSize;
    const useMultiScale = options.useMultiScale ?? true;
    const detectTempoMultiples = options.detectTempoMultiples ?? true;
    const useOnsetWeighting = options.useOnsetWeighting ?? true;
    
    // Enhanced BPM range with safety margins
    const safeMinBpm = Math.max(40, minBpm * 0.8); // Allow for tempo detection errors
    const safeMaxBpm = Math.min(300, maxBpm * 1.2);
    
    const maxLag = Math.floor(frameRate * 60 / safeMinBpm);
    const minLag = Math.floor(frameRate * 60 / safeMaxBpm);
    
    // Apply onset weighting if requested
    let processedOnsetFunction = onsetFunction;
    if (useOnsetWeighting) {
      processedOnsetFunction = this.applyOnsetWeighting(onsetFunction);
    }
    
    let autocorrResults: Float32Array[];
    
    if (useMultiScale) {
      // Multi-scale autocorrelation for better tempo detection
      autocorrResults = this.calculateMultiScaleAutocorrelation(
        processedOnsetFunction,
        maxLag,
        [1, 2, 4] // Different time scales
      );
    } else {
      autocorrResults = [this.calculateAutocorrelation(processedOnsetFunction, maxLag)];
    }
    
    const hypotheses: TempoHypothesis[] = [];
    
    // Process each autocorrelation scale
    for (let scaleIdx = 0; scaleIdx < autocorrResults.length; scaleIdx++) {
      const autocorr = autocorrResults[scaleIdx]!;
      const scale = useMultiScale ? [1, 2, 4][scaleIdx]! : 1;
      
      // Find peaks with enhanced detection
      for (let lag = minLag; lag <= maxLag; lag++) {
        if (this.isAutocorrelationPeak(autocorr, lag)) {
          const bpm = (60 * frameRate) / (lag * scale);
          
          if (bpm >= minBpm && bpm <= maxBpm) {
            const confidence = this.calculateTempoConfidence(
              autocorr,
              lag,
              bpm,
              processedOnsetFunction
            );
            
            const phase = this.estimateBeatPhase(
              processedOnsetFunction,
              bpm,
              frameRate
            );
            
            hypotheses.push({
              bpm,
              confidence,
              phase,
              strength: autocorr[lag] || 0,
              autocorrelationPeak: autocorr[lag] || 0
            });
          }
        }
      }
    }
    
    // Add tempo multiple candidates if requested
    if (detectTempoMultiples && hypotheses.length > 0) {
      const multipleHypotheses = this.generateTempoMultiples(hypotheses);
      hypotheses.push(...multipleHypotheses);
    }
    
    // Sort by confidence and return top candidates
    return hypotheses
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 15); // More candidates for better selection
  }

  /**
   * Calculate autocorrelation function
   */
  private static calculateAutocorrelation(
    signal: Float32Array,
    maxLag: number
  ): Float32Array {
    const autocorr = new Float32Array(maxLag + 1);
    const n = signal.length;
    
    // Normalize signal
    let mean = 0;
    for (let i = 0; i < n; i++) {
      mean += signal[i];
    }
    mean /= n;
    
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const diff = signal[i] - mean;
      variance += diff * diff;
    }
    variance /= n;
    
    if (variance === 0) return autocorr;
    
    // Calculate autocorrelation
    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0;
      const count = n - lag;
      
      for (let i = 0; i < count; i++) {
        sum += (signal[i] - mean) * (signal[i + lag] - mean);
      }
      
      autocorr[lag] = sum / (count * variance);
    }
    
    return autocorr;
  }

  /**
   * Enhanced tempo selection with sophisticated scoring
   */
  private static selectBestTempo(
    hypotheses: TempoHypothesis[]
  ): { bpm: number; confidence: number; phase: number } {
    if (hypotheses.length === 0) {
      return { bpm: 120, confidence: 0.0, phase: 0.0 }; // Default fallback
    }
    
    // Score hypotheses based on multiple sophisticated factors
    const scoredHypotheses = hypotheses.map(hypothesis => {
      let score = hypothesis.confidence;
      const bpm = hypothesis.bpm;
      
      // Musical tempo preferences with more nuanced scoring
      if (bpm >= 110 && bpm <= 130) {
        score *= 1.3; // Strong boost for very common dance tempos
      } else if (bpm >= 90 && bpm <= 110) {
        score *= 1.2; // Boost for moderate dance tempos
      } else if (bpm >= 60 && bpm <= 80) {
        score *= 1.15; // Boost ballad tempos
      } else if (bpm >= 140 && bpm <= 160) {
        score *= 1.1; // Boost for fast dance music
      }
      
      // Check proximity to common BPMs
      const proximityBoost = this.calculateCommonTempoProximity(bpm);
      score *= (1 + proximityBoost * 0.1);
      
      // Penalize extreme tempos more gradually
      if (bpm < 50) {
        score *= 0.3; // Very slow
      } else if (bpm < 70) {
        score *= 0.7; // Quite slow
      } else if (bpm > 250) {
        score *= 0.2; // Very fast
      } else if (bpm > 200) {
        score *= 0.6; // Quite fast
      }
      
      // Prefer integer and half-integer BPMs with refined logic
      const remainder = bpm % 1;
      if (remainder < 0.05 || remainder > 0.95) {
        score *= 1.08; // Integer BPMs
      } else if (Math.abs(remainder - 0.5) < 0.05) {
        score *= 1.04; // Half-integer BPMs
      } else if (Math.abs(remainder - 0.25) < 0.05 || Math.abs(remainder - 0.75) < 0.05) {
        score *= 1.02; // Quarter BPMs
      }
      
      // Factor in autocorrelation peak strength
      score *= (0.8 + 0.2 * hypothesis.autocorrelationPeak);
      
      // Factor in beat phase alignment quality
      const phaseAlignmentQuality = this.evaluatePhaseAlignment(hypothesis);
      score *= (0.9 + 0.1 * phaseAlignmentQuality);
      
      return { ...hypothesis, score };
    });
    
    // Return highest scoring hypothesis
    const best = scoredHypotheses.reduce((prev, curr) => 
      curr.score > prev.score ? curr : prev
    );
    
    return {
      bpm: best.bpm,
      confidence: best.confidence,
      phase: best.phase
    };
  }

  /**
   * Enhanced dynamic programming beat tracking with variable tempo support
   */
  private static dynamicProgrammingBeats(
    onsets: Onset[],
    tempo: Tempo,
    audioDuration: number,
    options: BeatTrackingOptions = {}
  ): Beat[] {
    if (onsets.length === 0) return [];
    
    const variableTempo = options.variableTempo ?? false;
    const tempoTolerance = options.tempoTolerance ?? 0.1; // 10% tempo change tolerance
    const confidenceThreshold = options.confidenceThreshold ?? 0.3;
    const phaseAlignment = options.phaseAlignment ?? 'combined';
    
    const baseBeatInterval = 60 / tempo.bpm;
    let currentTempo = tempo.bpm;
    const tolerance = baseBeatInterval * 0.25; // Increased tolerance for better flexibility
    
    // Create adaptive beat template grid
    const expectedBeats: Array<{ time: number; tempo: number }> = [];
    let currentTime = 0;
    
    while (currentTime <= audioDuration) {
      expectedBeats.push({ time: currentTime, tempo: currentTempo });
      
      // Adjust tempo if variable tempo tracking is enabled
      if (variableTempo && expectedBeats.length > 4) {
        const recentTempo = this.estimateLocalTempo(
          onsets,
          currentTime,
          baseBeatInterval * 4 // 4-beat window
        );
        
        if (Math.abs(recentTempo - currentTempo) / currentTempo < tempoTolerance) {
          currentTempo = currentTempo * 0.9 + recentTempo * 0.1; // Smooth tempo change
        }
      }
      
      currentTime += 60 / currentTempo;
    }
    
    // Enhanced DP with variable tempo considerations
    const m = onsets.length;
    const n = expectedBeats.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(-Infinity));
    const backtrack = Array(m + 1).fill(null).map(() => Array(n + 1).fill(null));
    const tempoTrack = Array(m + 1).fill(null).map(() => Array(n + 1).fill(currentTempo));
    
    // Initialize base case
    for (let j = 0; j <= n; j++) {
      dp[0][j] = 0;
    }
    
    // Fill enhanced DP table
    for (let i = 1; i <= m; i++) {
      const onset = onsets[i - 1]!;
      
      for (let j = 1; j <= n; j++) {
        const expectedBeat = expectedBeats[j - 1]!;
        const timeDiff = Math.abs(onset.time - expectedBeat.time);
        
        // Option 1: Don't use this onset
        if (dp[i - 1][j] > dp[i][j]) {
          dp[i][j] = dp[i - 1][j];
          backtrack[i][j] = { from: [i - 1, j], used: false };
          tempoTrack[i][j] = tempoTrack[i - 1][j];
        }
        
        // Option 2: Use this onset for this beat position
        if (timeDiff <= tolerance && j > 0) {
          let score = this.calculateBeatScore(
            onset,
            expectedBeat,
            timeDiff,
            tolerance,
            phaseAlignment
          );
          
          // Apply confidence threshold
          if (onset.confidence < confidenceThreshold) {
            score *= 0.5;
          }
          
          // Bonus for tempo consistency
          if (j > 1 && Math.abs(expectedBeat.tempo - currentTempo) < currentTempo * 0.1) {
            score *= 1.1;
          }
          
          const newScore = dp[i - 1][j - 1] + score;
          
          if (newScore > dp[i][j]) {
            dp[i][j] = newScore;
            backtrack[i][j] = { from: [i - 1, j - 1], used: true };
            tempoTrack[i][j] = expectedBeat.tempo;
          }
        }
      }
    }
    
    // Enhanced backtracking with beat phase alignment
    const beats: Beat[] = [];
    let i = m, j = n;
    
    while (i > 0 && j > 0 && backtrack[i][j]) {
      const bt = backtrack[i][j];
      if (bt.used) {
        const onset = onsets[i - 1]!;
        const alignedTime = this.applyBeatPhaseAlignment(
          onset.time,
          expectedBeats[j - 1]!.time,
          phaseAlignment
        );
        
        beats.unshift({
          timestamp: alignedTime * 1000,
          confidence: this.calculateBeatConfidence(onset, expectedBeats[j - 1]!, tolerance),
          strength: onset.strength,
          metadata: {
            originalTime: onset.time,
            expectedTime: expectedBeats[j - 1]!.time,
            tempo: tempoTrack[i][j]
          }
        });
      }
      [i, j] = bt.from;
    }
    
    return beats;
  }

  /**
   * Enhanced template-based beat tracking with adaptive tolerance
   */
  private static simpleTemplateBeatTracking(
    onsets: Onset[],
    tempo: Tempo,
    audioDuration: number,
    options: BeatTrackingOptions = {}
  ): Beat[] {
    const beatInterval = 60 / tempo.bpm;
    const beats: Beat[] = [];
    const baseTolerance = beatInterval * 0.35; // Slightly increased tolerance
    const variableTempo = options.variableTempo ?? false;
    
    let currentTempo = tempo.bpm;
    let currentTime = 0;
    
    // Generate expected beat times with adaptive tolerance
    while (currentTime <= audioDuration) {
      let tolerance = baseTolerance;
      
      // Adjust tolerance for variable tempo
      if (variableTempo) {
        const localTempo = this.estimateLocalTempo(
          onsets,
          currentTime,
          beatInterval * 4
        );
        
        if (Math.abs(localTempo - currentTempo) > currentTempo * 0.1) {
          tolerance *= 1.5; // Increase tolerance when tempo is changing
        }
        
        // Smooth tempo adaptation
        currentTempo = currentTempo * 0.9 + localTempo * 0.1;
      }
      
      // Find best onset within tolerance
      let bestOnset: Onset | null = null;
      let minDistance = tolerance;
      let bestScore = 0;
      
      for (const onset of onsets) {
        const distance = Math.abs(onset.time - currentTime);
        if (distance < tolerance) {
          // Score based on distance, strength, and confidence
          const score = (
            (1 - distance / tolerance) * 0.5 +
            onset.strength * 0.3 +
            onset.confidence * 0.2
          );
          
          if (score > bestScore) {
            bestScore = score;
            bestOnset = onset;
            minDistance = distance;
          }
        }
      }
      
      if (bestOnset) {
        const alignedTime = this.applyBeatPhaseAlignment(
          bestOnset.time,
          currentTime,
          options.phaseAlignment || 'combined'
        );
        
        beats.push({
          timestamp: alignedTime * 1000,
          confidence: bestOnset.confidence * (1 - minDistance / tolerance),
          strength: bestOnset.strength,
          metadata: {
            originalTime: bestOnset.time,
            expectedTime: currentTime,
            distance: minDistance,
            score: bestScore
          }
        });
      } else if (beats.length > 0 && options.variableTempo) {
        // Generate interpolated beat if no onset found and using variable tempo
        beats.push({
          timestamp: currentTime * 1000,
          confidence: tempo.confidence * 0.3, // Low confidence for interpolated beats
          strength: 0.2, // Low strength
          metadata: {
            interpolated: true,
            expectedTime: currentTime
          }
        });
      }
      
      currentTime += 60 / currentTempo;
    }
    
    return beats;
  }

  /**
   * Enhanced time signature estimation using multiple analysis techniques
   */
  private static estimateTimeSignature(
    bpm: number,
    onsetFunction: Float32Array,
    sampleRate: number,
    tempoHypotheses?: TempoHypothesis[]
  ): { numerator: number; denominator: number } {
    const hopSize = 256;
    const frameRate = sampleRate / hopSize;
    const beatInterval = (60 * frameRate) / bpm;
    
    // Analyze accent patterns for time signature detection
    const accentScores = this.analyzeAccentPatterns(
      onsetFunction,
      beatInterval,
      [2, 3, 4, 6, 8] // Test these groupings
    );
    
    // Find the best accent pattern
    const bestPattern = accentScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    
    // Additional heuristics based on tempo and genre indicators
    let finalNumerator = bestPattern.numerator;
    let finalDenominator = 4;
    
    // BPM-based refinements
    if (bpm >= 160 && bpm <= 200 && bestPattern.numerator === 3) {
      // Likely waltz or compound meter
      finalNumerator = 3;
      finalDenominator = 4;
    } else if (bpm >= 60 && bpm <= 90 && bestPattern.numerator === 6) {
      // Possible 6/8 or slow compound meter
      finalNumerator = 6;
      finalDenominator = 8;
    } else if (bestPattern.score < 0.3) {
      // Low confidence, use BPM-based defaults
      if (bpm >= 150) {
        finalNumerator = 4;
      } else if (bpm < 80) {
        finalNumerator = 4;
      } else {
        finalNumerator = 4;
      }
    }
    
    // Verify against tempo multiples if available
    if (tempoHypotheses && tempoHypotheses.length > 1) {
      const hasDoubleTimeCandidate = tempoHypotheses.some(
        h => Math.abs(h.bpm - bpm * 2) < bpm * 0.1
      );
      const hasHalfTimeCandidate = tempoHypotheses.some(
        h => Math.abs(h.bpm - bpm / 2) < bpm * 0.1
      );
      
      if (hasDoubleTimeCandidate && finalNumerator === 2) {
        finalNumerator = 4; // Likely 4/4 with half-time feel
      }
      if (hasHalfTimeCandidate && finalNumerator === 8) {
        finalNumerator = 4; // Likely 4/4 with double-time detection
      }
    }
    
    return { numerator: finalNumerator, denominator: finalDenominator };
  }
  
  /**
   * Analyze accent patterns for time signature estimation
   */
  private static analyzeAccentPatterns(
    onsetFunction: Float32Array,
    beatInterval: number,
    testPatterns: number[]
  ): Array<{ numerator: number; score: number }> {
    const results: Array<{ numerator: number; score: number }> = [];
    
    for (const pattern of testPatterns) {
      const measureLength = beatInterval * pattern;
      let score = 0;
      let measureCount = 0;
      
      // Analyze each complete measure
      for (let start = 0; start + measureLength < onsetFunction.length; start += measureLength) {
        const measureOnsets = onsetFunction.slice(start, start + measureLength);
        
        // Calculate accent strength for each beat position
        const beatStrengths: number[] = [];
        for (let beat = 0; beat < pattern; beat++) {
          const beatStart = Math.floor(beat * beatInterval);
          const beatEnd = Math.floor((beat + 1) * beatInterval);
          
          if (beatEnd <= measureOnsets.length) {
            const beatSlice = measureOnsets.slice(beatStart, beatEnd);
            const maxStrength = Math.max(...beatSlice);
            beatStrengths.push(maxStrength);
          }
        }
        
        // Evaluate accent pattern
        if (beatStrengths.length === pattern) {
          score += this.evaluateAccentPattern(beatStrengths, pattern);
          measureCount++;
        }
      }
      
      if (measureCount > 0) {
        results.push({
          numerator: pattern,
          score: score / measureCount
        });
      } else {
        results.push({
          numerator: pattern,
          score: 0
        });
      }
    }
    
    return results;
  }
  
  /**
   * Evaluate how well beat strengths match expected accent pattern
   */
  private static evaluateAccentPattern(
    beatStrengths: number[],
    pattern: number
  ): number {
    if (beatStrengths.length !== pattern) return 0;
    
    // Expected accent patterns for different time signatures
    const accentPatterns: Record<number, number[]> = {
      2: [1.0, 0.6], // Strong-weak
      3: [1.0, 0.6, 0.7], // Strong-weak-medium (waltz)
      4: [1.0, 0.6, 0.8, 0.6], // Strong-weak-medium-weak
      6: [1.0, 0.5, 0.6, 0.8, 0.5, 0.6], // Compound duple
      8: [1.0, 0.5, 0.6, 0.5, 0.7, 0.5, 0.6, 0.5] // Common compound
    };
    
    const expectedPattern = accentPatterns[pattern];
    if (!expectedPattern) return 0;
    
    // Normalize beat strengths
    const maxStrength = Math.max(...beatStrengths);
    if (maxStrength === 0) return 0;
    
    const normalizedStrengths = beatStrengths.map(s => s / maxStrength);
    
    // Calculate correlation with expected pattern
    let correlation = 0;
    for (let i = 0; i < pattern; i++) {
      const expected = expectedPattern[i] || 0;
      const actual = normalizedStrengths[i] || 0;
      correlation += Math.min(expected, actual);
    }
    
    return correlation / pattern;
  }

  /**
   * Enhanced tempo curve smoothing with adaptive filtering
   */
  private static smoothTempoCurve(
    tempoCurve: Array<{ time: number; bpm: number; confidence: number }>,
    smoothingFactor: number = 0.3
  ): Array<{ time: number; bpm: number; confidence: number }> {
    if (tempoCurve.length <= 2) return tempoCurve;
    
    const smoothed = [...tempoCurve];
    
    // First pass: median filtering to remove outliers
    for (let i = 1; i < smoothed.length - 1; i++) {
      const values = [
        tempoCurve[i - 1]!.bpm,
        tempoCurve[i]!.bpm,
        tempoCurve[i + 1]!.bpm
      ].sort((a, b) => a - b);
      
      const medianBpm = values[1]!;
      
      // If current value is an outlier, replace with median
      if (Math.abs(tempoCurve[i]!.bpm - medianBpm) > medianBpm * 0.2) {
        smoothed[i] = {
          ...tempoCurve[i]!,
          bpm: medianBpm,
          confidence: tempoCurve[i]!.confidence * 0.8 // Reduce confidence for outliers
        };
      }
    }
    
    // Second pass: adaptive weighted smoothing
    const finalSmoothed = [...smoothed];
    for (let i = 1; i < smoothed.length - 1; i++) {
      const current = smoothed[i]!;
      const prev = smoothed[i - 1]!;
      const next = smoothed[i + 1]!;
      
      // Calculate adaptive window size based on confidence
      const avgConfidence = (prev.confidence + current.confidence + next.confidence) / 3;
      const dynamicSmoothingFactor = smoothingFactor * (1.0 - avgConfidence * 0.5);
      
      // Weighted average with confidence-based weighting
      const totalWeight = prev.confidence + current.confidence * 2 + next.confidence;
      const weightedBpm = (
        prev.bpm * prev.confidence +
        current.bpm * current.confidence * 2 +
        next.bpm * next.confidence
      ) / totalWeight;
      
      // Apply smoothing with adaptive factor
      finalSmoothed[i] = {
        time: current.time,
        bpm: current.bpm * (1 - dynamicSmoothingFactor) + weightedBpm * dynamicSmoothingFactor,
        confidence: Math.min(avgConfidence * 1.1, 1.0) // Slight confidence boost for smoothed values
      };
    }
    
    // Third pass: tempo consistency check
    return this.enforceTempoConsistency(finalSmoothed);
  }

  /**
   * Simple low-pass filter
   */
  private static lowPassFilter(
    signal: Float32Array,
    cutoff: number,
    sampleRate: number
  ): Float32Array {
    const rc = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);
    
    const filtered = new Float32Array(signal.length);
    filtered[0] = signal[0];
    
    for (let i = 1; i < signal.length; i++) {
      filtered[i] = filtered[i - 1] + alpha * (signal[i] - filtered[i - 1]);
    }
    
    return filtered;
  }

  /**
   * Enhanced beat consistency and stability analysis
   */
  static analyzeBeatConsistency(beats: Beat[]): {
    consistency: number;
    averageInterval: number;
    intervalVariance: number;
    tempoStability: number;
    rhythmicRegularity: number;
  } {
    if (beats.length < 2) {
      return {
        consistency: 0,
        averageInterval: 0,
        intervalVariance: 0,
        tempoStability: 0,
        rhythmicRegularity: 0
      };
    }
    
    // Calculate intervals between beats
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i].timestamp - beats[i - 1].timestamp);
    }
    
    // Basic statistics
    const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    let variance = 0;
    for (const interval of intervals) {
      const diff = interval - averageInterval;
      variance += diff * diff;
    }
    variance /= intervals.length;
    
    const standardDeviation = Math.sqrt(variance);
    const consistency = Math.max(0, 1 - standardDeviation / averageInterval);
    
    // Enhanced tempo stability analysis
    const tempoStability = this.calculateTempoStability(intervals);
    
    // Rhythmic regularity (how well beats align with expected grid)
    const rhythmicRegularity = this.calculateRhythmicRegularity(intervals, averageInterval);
    
    return {
      consistency,
      averageInterval,
      intervalVariance: variance,
      tempoStability,
      rhythmicRegularity
    };
  }
  
  // ===== NEW HELPER METHODS =====
  
  /**
   * Apply onset strength weighting
   */
  private static applyOnsetWeighting(onsetFunction: Float32Array): Float32Array {
    const weighted = new Float32Array(onsetFunction.length);
    
    // Calculate local statistics for adaptive weighting
    for (let i = 0; i < onsetFunction.length; i++) {
      const windowSize = 20;
      const start = Math.max(0, i - windowSize);
      const end = Math.min(onsetFunction.length, i + windowSize);
      
      let localMax = 0;
      for (let j = start; j < end; j++) {
        localMax = Math.max(localMax, onsetFunction[j] || 0);
      }
      
      // Weight based on local prominence
      const prominence = localMax > 0 ? (onsetFunction[i] || 0) / localMax : 0;
      weighted[i] = (onsetFunction[i] || 0) * Math.pow(prominence, 0.5);
    }
    
    return weighted;
  }
  
  /**
   * Calculate multi-scale autocorrelation
   */
  private static calculateMultiScaleAutocorrelation(
    signal: Float32Array,
    maxLag: number,
    scales: number[]
  ): Float32Array[] {
    const results: Float32Array[] = [];
    
    for (const scale of scales) {
      // Downsample signal for current scale
      const downsampled = new Float32Array(Math.floor(signal.length / scale));
      for (let i = 0; i < downsampled.length; i++) {
        let sum = 0;
        const start = i * scale;
        const end = Math.min(signal.length, start + scale);
        for (let j = start; j < end; j++) {
          sum += signal[j] || 0;
        }
        downsampled[i] = sum / (end - start);
      }
      
      // Calculate autocorrelation for this scale
      const scaledMaxLag = Math.floor(maxLag / scale);
      const autocorr = this.calculateAutocorrelation(downsampled, scaledMaxLag);
      results.push(autocorr);
    }
    
    return results;
  }
  
  /**
   * Check if lag is an autocorrelation peak
   */
  private static isAutocorrelationPeak(
    autocorr: Float32Array,
    lag: number,
    threshold: number = 0.1
  ): boolean {
    if (lag <= 1 || lag >= autocorr.length - 1) return false;
    
    const current = autocorr[lag] || 0;
    const prev = autocorr[lag - 1] || 0;
    const next = autocorr[lag + 1] || 0;
    
    return current > prev &&
           current > next &&
           current > threshold;
  }
  
  /**
   * Calculate enhanced tempo confidence
   */
  private static calculateTempoConfidence(
    autocorr: Float32Array,
    lag: number,
    bpm: number,
    onsetFunction: Float32Array
  ): number {
    const peak = autocorr[lag] || 0;
    
    // Factor in peak prominence relative to neighbors
    const windowSize = Math.max(3, Math.floor(lag * 0.1));
    let localMax = 0;
    for (let i = Math.max(0, lag - windowSize); i <= Math.min(autocorr.length - 1, lag + windowSize); i++) {
      if (i !== lag) {
        localMax = Math.max(localMax, autocorr[i] || 0);
      }
    }
    
    const prominence = localMax > 0 ? peak / localMax : 1.0;
    
    // Factor in onset function statistics
    const onsetStrength = this.calculateMean(onsetFunction);
    const onsetConsistency = this.calculateOnsetConsistency(onsetFunction);
    
    // Combine factors
    let confidence = peak * 0.4 + prominence * 0.3 + onsetStrength * 0.2 + onsetConsistency * 0.1;
    
    // Apply musical knowledge boost
    confidence *= this.getMusicalPriorBoost(bpm);
    
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Estimate beat phase from onset function
   */
  private static estimateBeatPhase(
    onsetFunction: Float32Array,
    bpm: number,
    frameRate: number
  ): number {
    const beatPeriod = (60 * frameRate) / bpm;
    const numPhases = 16; // Check 16 different phase offsets
    
    let bestPhase = 0;
    let bestScore = 0;
    
    for (let phase = 0; phase < numPhases; phase++) {
      const phaseOffset = (phase * beatPeriod) / numPhases;
      let score = 0;
      let count = 0;
      
      for (let beat = phaseOffset; beat < onsetFunction.length; beat += beatPeriod) {
        const index = Math.round(beat);
        if (index < onsetFunction.length) {
          score += onsetFunction[index] || 0;
          count++;
        }
      }
      
      if (count > 0) {
        score /= count;
        if (score > bestScore) {
          bestScore = score;
          bestPhase = phaseOffset / frameRate; // Convert to seconds
        }
      }
    }
    
    return bestPhase;
  }
  
  /**
   * Generate tempo multiple hypotheses
   */
  private static generateTempoMultiples(
    originalHypotheses: TempoHypothesis[]
  ): TempoHypothesis[] {
    const multiples: TempoHypothesis[] = [];
    
    for (const hypothesis of originalHypotheses.slice(0, 5)) { // Top 5 only
      for (const multiple of this.TEMPO_MULTIPLES) {
        if (multiple === 1.0) continue; // Skip the original
        
        const newBpm = hypothesis.bpm * multiple;
        if (newBpm >= 50 && newBpm <= 250) { // Reasonable tempo range
          const confidenceScale = multiple === 0.5 || multiple === 2.0 ? 0.8 : 0.6;
          
          multiples.push({
            bpm: newBpm,
            confidence: hypothesis.confidence * confidenceScale,
            phase: hypothesis.phase,
            strength: hypothesis.strength * confidenceScale,
            autocorrelationPeak: hypothesis.autocorrelationPeak
          });
        }
      }
    }
    
    return multiples;
  }
  
  /**
   * Calculate proximity to common tempos
   */
  private static calculateCommonTempoProximity(bpm: number): number {
    let minDistance = Infinity;
    
    for (const commonBpm of this.COMMON_TEMPOS) {
      const distance = Math.abs(bpm - commonBpm) / commonBpm;
      minDistance = Math.min(minDistance, distance);
    }
    
    // Return boost factor based on proximity (closer = higher boost)
    return Math.max(0, 1 - minDistance * 2);
  }
  
  /**
   * Evaluate phase alignment quality
   */
  private static evaluatePhaseAlignment(hypothesis: TempoHypothesis): number {
    // Simple heuristic: phases closer to beat boundaries are better
    const phaseNormalized = (hypothesis.phase % (60 / hypothesis.bpm)) / (60 / hypothesis.bpm);
    
    // Prefer phases near 0, 0.25, 0.5, 0.75 (beat boundaries)
    const beatPositions = [0, 0.25, 0.5, 0.75];
    let minDistance = 1.0;
    
    for (const pos of beatPositions) {
      const distance = Math.min(
        Math.abs(phaseNormalized - pos),
        Math.abs(phaseNormalized - pos - 1),
        Math.abs(phaseNormalized - pos + 1)
      );
      minDistance = Math.min(minDistance, distance);
    }
    
    return 1.0 - minDistance * 4; // Convert to quality score
  }
  
  /**
   * Estimate local tempo around a time point
   */
  private static estimateLocalTempo(
    onsets: Onset[],
    centerTime: number,
    windowSize: number
  ): number {
    // Find onsets within the window
    const windowOnsets = onsets.filter(
      onset => Math.abs(onset.time - centerTime) <= windowSize / 2
    );
    
    if (windowOnsets.length < 2) {
      return 120; // Default fallback
    }
    
    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < windowOnsets.length; i++) {
      intervals.push(windowOnsets[i].time - windowOnsets[i - 1].time);
    }
    
    // Find median interval (more robust than mean)
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)] || 0.5;
    
    return medianInterval > 0 ? 60 / medianInterval : 120;
  }
  
  /**
   * Calculate beat score for dynamic programming
   */
  private static calculateBeatScore(
    onset: Onset,
    expectedBeat: { time: number; tempo: number },
    timeDiff: number,
    tolerance: number,
    phaseAlignment: string
  ): number {
    // Base score from onset strength and timing accuracy
    const timingScore = (1 - timeDiff / tolerance);
    const strengthScore = onset.strength;
    const confidenceScore = onset.confidence;
    
    let baseScore = 0.5 * strengthScore + 0.3 * timingScore + 0.2 * confidenceScore;
    
    // Apply phase alignment bonus
    switch (phaseAlignment) {
      case 'energy':
        baseScore *= (1 + 0.2 * onset.strength);
        break;
      case 'spectral':
        baseScore *= (1 + 0.1 * onset.confidence);
        break;
      case 'combined':
        baseScore *= (1 + 0.1 * onset.strength + 0.1 * onset.confidence);
        break;
    }
    
    return baseScore;
  }
  
  /**
   * Apply beat phase alignment
   */
  private static applyBeatPhaseAlignment(
    onsetTime: number,
    expectedTime: number,
    alignmentMethod: string
  ): number {
    switch (alignmentMethod) {
      case 'energy':
        // Simple weighted average favoring onset energy
        return onsetTime * 0.7 + expectedTime * 0.3;
      case 'spectral':
        // Favor expected time for spectral alignment
        return onsetTime * 0.4 + expectedTime * 0.6;
      case 'combined':
      default:
        // Balanced alignment
        return onsetTime * 0.5 + expectedTime * 0.5;
    }
  }
  
  /**
   * Calculate beat confidence
   */
  private static calculateBeatConfidence(
    onset: Onset,
    expectedBeat: { time: number; tempo: number },
    tolerance: number
  ): number {
    const timeDiff = Math.abs(onset.time - expectedBeat.time);
    const timingAccuracy = Math.max(0, 1 - timeDiff / tolerance);
    
    // Combine onset confidence with timing accuracy
    return Math.min(
      onset.confidence * 0.7 + timingAccuracy * 0.3,
      1.0
    );
  }
  
  /**
   * Enforce tempo consistency in tempo curve
   */
  private static enforceTempoConsistency(
    tempoCurve: Array<{ time: number; bpm: number; confidence: number }>
  ): Array<{ time: number; bpm: number; confidence: number }> {
    const consistent = [...tempoCurve];
    const maxTempoChange = 0.15; // 15% max change between adjacent points
    
    for (let i = 1; i < consistent.length; i++) {
      const current = consistent[i]!;
      const previous = consistent[i - 1]!;
      
      const tempoChange = Math.abs(current.bpm - previous.bpm) / previous.bpm;
      
      if (tempoChange > maxTempoChange) {
        // Limit tempo change
        const maxAllowedChange = previous.bpm * maxTempoChange;
        const direction = current.bpm > previous.bpm ? 1 : -1;
        
        consistent[i] = {
          ...current,
          bpm: previous.bpm + direction * maxAllowedChange,
          confidence: current.confidence * 0.8 // Reduce confidence for corrected values
        };
      }
    }
    
    return consistent;
  }
  
  /**
   * Calculate tempo stability
   */
  private static calculateTempoStability(intervals: number[]): number {
    if (intervals.length < 3) return 1.0;
    
    // Calculate second-order differences (acceleration)
    const accelerations: number[] = [];
    for (let i = 2; i < intervals.length; i++) {
      const accel = intervals[i]! - 2 * intervals[i - 1]! + intervals[i - 2]!;
      accelerations.push(Math.abs(accel));
    }
    
    const meanAccel = accelerations.reduce((sum, val) => sum + val, 0) / accelerations.length;
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    
    // Stability inversely related to acceleration
    return Math.max(0, 1 - meanAccel / avgInterval);
  }
  
  /**
   * Calculate rhythmic regularity
   */
  private static calculateRhythmicRegularity(
    intervals: number[],
    expectedInterval: number
  ): number {
    if (intervals.length === 0) return 0;
    
    let regularityScore = 0;
    for (const interval of intervals) {
      const deviation = Math.abs(interval - expectedInterval) / expectedInterval;
      regularityScore += Math.max(0, 1 - deviation * 2);
    }
    
    return regularityScore / intervals.length;
  }
  
  // Additional helper methods
  private static calculateMean(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] || 0;
    }
    return data.length > 0 ? sum / data.length : 0;
  }
  
  private static calculateOnsetConsistency(onsetFunction: Float32Array): number {
    if (onsetFunction.length < 2) return 0;
    
    const mean = this.calculateMean(onsetFunction);
    let variance = 0;
    for (let i = 0; i < onsetFunction.length; i++) {
      const diff = (onsetFunction[i] || 0) - mean;
      variance += diff * diff;
    }
    variance /= onsetFunction.length;
    
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    return Math.max(0, 1 - cv); // Lower coefficient of variation = higher consistency
  }
  
  private static getMusicalPriorBoost(bpm: number): number {
    // Boost common musical tempos
    for (const commonBpm of this.COMMON_TEMPOS) {
      if (Math.abs(bpm - commonBpm) < 5) {
        return 1.2;
      }
    }
    return 1.0;
  }
  
  private static isAudioSilent(data: Float32Array, threshold: number): boolean {
    const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length);
    return rms < threshold;
  }
  
  private static isExtremelyFast(data: Float32Array, sampleRate: number): boolean {
    // Check for very high zero-crossing rate indicating fast music
    const zcr = SignalProcessing.zeroCrossingRate(data);
    return zcr * sampleRate > 2000; // > 2kHz zero crossings suggest very fast music
  }
  
  private static isExtremelySlow(data: Float32Array, sampleRate: number): boolean {
    // Check for very low energy variation indicating slow music
    const energyVariation = this.calculateEnergyVariation(data);
    return energyVariation < 0.1; // Low energy variation suggests slow/ambient music
  }
  
  private static calculateEnergyVariation(data: Float32Array): number {
    const windowSize = 2048;
    const hopSize = 1024;
    const energies: number[] = [];
    
    for (let i = 0; i < data.length - windowSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += (data[i + j] || 0) ** 2;
      }
      energies.push(Math.sqrt(energy / windowSize));
    }
    
    if (energies.length < 2) return 1.0;
    
    const mean = energies.reduce((sum, val) => sum + val, 0) / energies.length;
    const variance = energies.reduce((sum, val) => sum + (val - mean) ** 2, 0) / energies.length;
    
    return mean > 0 ? Math.sqrt(variance) / mean : 0;
  }
}