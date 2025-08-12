/**
 * OnsetDetection - Advanced onset detection algorithms
 * Implements multiple onset detection methods including Spectral Flux, 
 * Energy-based, Complex Domain, and combined approaches
 */

import type { 
  AudioData, 
  OnsetDetectionOptions, 
  Onset 
} from '../types';
import { AudioProcessor } from '../core/AudioProcessor';
import { SignalProcessing } from '../utils/SignalProcessing';

export interface SpectralFluxOptions {
  /** Use logarithmic spectral flux */
  useLogarithmic?: boolean;
  /** Apply frequency weighting */
  useFrequencyWeighting?: boolean;
  /** Number of frames for local normalization */
  normalizationWindow?: number;
}

export interface EnergyOnsetOptions {
  /** Use high-frequency emphasis */
  useHighFreqEmphasis?: boolean;
  /** Energy smoothing window size */
  smoothingWindow?: number;
  /** Use adaptive energy threshold */
  adaptiveThreshold?: boolean;
}

export interface ComplexDomainOptions {
  /** Phase deviation weight */
  phaseWeight?: number;
  /** Magnitude weight */
  magnitudeWeight?: number;
  /** Use predictive phase tracking */
  usePredictivePhase?: boolean;
}

export interface OnsetCombinationWeights {
  /** Spectral flux weight */
  spectralFlux: number;
  /** Energy onset weight */
  energy: number;
  /** Complex domain weight */
  complexDomain: number;
  /** High frequency content weight */
  highFreqContent?: number;
}

export class OnsetDetection {
  private static readonly DEFAULT_OPTIONS: Required<OnsetDetectionOptions> = {
    windowSize: 1024,
    hopSize: 512,
    method: 'combined',
    threshold: 0.3,
    minInterval: 0.05 // 50ms minimum between onsets
  };

  private static readonly DEFAULT_COMBINATION_WEIGHTS: OnsetCombinationWeights = {
    spectralFlux: 0.35,
    energy: 0.25,
    complexDomain: 0.25,
    highFreqContent: 0.15
  };

  private config: any;

  constructor(config: any = {}) {
    this.config = config;
  }

  detectOnsets(audioData: AudioData, sampleRate: number, options: OnsetDetectionOptions = {}): Onset[] {
    return OnsetDetection.detectOnsets(audioData, sampleRate, options);
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
   * Detect onsets in audio data using specified method
   */
  static detectOnsets(
    audioData: AudioData, 
    sampleRate: number,
    options: OnsetDetectionOptions = {}
  ): Onset[] {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    
    switch (opts.method) {
      case 'spectral_flux':
        return this.spectralFluxOnsets(audioData, sampleRate, opts);
      case 'energy':
        return this.energyOnsets(audioData, sampleRate, opts);
      case 'complex_domain':
        return this.complexDomainOnsets(audioData, sampleRate, opts);
      case 'combined':
        return this.combinedOnsets(audioData, sampleRate, opts);
      default:
        throw new Error(`Unknown onset detection method: ${opts.method}`);
    }
  }

  /**
   * Enhanced Spectral Flux onset detection with edge case handling
   */
  private static spectralFluxOnsets(
    audioData: AudioData,
    sampleRate: number,
    options: Required<OnsetDetectionOptions>
  ): Onset[] {
    const data = this.toFloat32Array(audioData);
    
    // Handle edge cases
    if (this.isAudioSilent(data)) {
      return [];
    }
    
    const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
    const onsetFunction = this.calculateSpectralFlux(frames, {
      useLogarithmic: true,
      useFrequencyWeighting: true,
      normalizationWindow: 7
    });
    
    return this.pickPeaks(
      onsetFunction,
      sampleRate,
      options.hopSize,
      options.threshold,
      options.minInterval
    );
  }

  /**
   * Enhanced Energy-based onset detection with edge case handling
   */
  private static energyOnsets(
    audioData: AudioData,
    sampleRate: number,
    options: Required<OnsetDetectionOptions>
  ): Onset[] {
    const data = this.toFloat32Array(audioData);
    
    // Handle edge cases
    if (this.isAudioSilent(data)) {
      return [];
    }
    
    const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
    const onsetFunction = this.calculateEnergyDifference(frames, {
      useHighFreqEmphasis: true,
      smoothingWindow: 5,
      adaptiveThreshold: true
    });
    
    return this.pickPeaks(
      onsetFunction,
      sampleRate,
      options.hopSize,
      options.threshold,
      options.minInterval
    );
  }

  /**
   * Enhanced Complex Domain onset detection with edge case handling
   */
  private static complexDomainOnsets(
    audioData: AudioData,
    sampleRate: number,
    options: Required<OnsetDetectionOptions>
  ): Onset[] {
    const data = this.toFloat32Array(audioData);
    
    // Handle edge cases
    if (this.isAudioSilent(data)) {
      return [];
    }
    
    const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
    const onsetFunction = this.calculateComplexDomain(
      frames,
      {
        phaseWeight: 0.6,
        magnitudeWeight: 0.4,
        usePredictivePhase: true
      },
      options.hopSize,
      options.windowSize
    );
    
    return this.pickPeaks(
      onsetFunction,
      sampleRate,
      options.hopSize,
      options.threshold,
      options.minInterval
    );
  }

  /**
   * Enhanced combined onset detection with improved accuracy and confidence weighting
   */
  private static combinedOnsets(
    audioData: AudioData,
    sampleRate: number,
    options: Required<OnsetDetectionOptions>
  ): Onset[] {
    const data = this.toFloat32Array(audioData);
    
    // Handle edge cases
    if (this.isAudioSilent(data, 0.001)) {
      return []; // No onsets in silent audio
    }
    
    if (this.isAudioNoise(data, sampleRate)) {
      // Use more conservative settings for noisy audio
      options.threshold *= 1.5;
      options.minInterval *= 1.2;
    }
    
    const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
    
    // Calculate different onset functions with enhanced options
    const spectralFlux = this.calculateSpectralFlux(frames, {
      useLogarithmic: true,
      useFrequencyWeighting: true,
      normalizationWindow: 7
    });
    
    const energyDiff = this.calculateEnergyDifference(frames, {
      useHighFreqEmphasis: true,
      smoothingWindow: 5,
      adaptiveThreshold: true
    });
    
    const complexDomain = this.calculateComplexDomain(
      frames,
      {
        phaseWeight: 0.6,
        magnitudeWeight: 0.4,
        usePredictivePhase: true
      },
      options.hopSize,
      options.windowSize
    );
    
    // Combine onset functions with enhanced weighting
    const combined = this.combineOnsetFunctions([
      { function: spectralFlux, weight: this.DEFAULT_COMBINATION_WEIGHTS.spectralFlux, name: 'spectral_flux' },
      { function: energyDiff, weight: this.DEFAULT_COMBINATION_WEIGHTS.energy, name: 'energy' },
      { function: complexDomain, weight: this.DEFAULT_COMBINATION_WEIGHTS.complexDomain, name: 'complex_domain' }
    ], this.DEFAULT_COMBINATION_WEIGHTS);
    
    return this.pickPeaks(
      combined,
      sampleRate,
      options.hopSize,
      options.threshold,
      options.minInterval
    );
  }

  /**
   * Enhanced Spectral Flux onset function with multiple improvements
   */
  private static calculateSpectralFlux(
    frames: Float32Array[],
    options: SpectralFluxOptions = {}
  ): Float32Array {
    const onsetFunction = new Float32Array(frames.length);
    let previousSpectrum: Float32Array | null = null;
    
    const useLogarithmic = options.useLogarithmic ?? true;
    const useFrequencyWeighting = options.useFrequencyWeighting ?? true;
    const normalizationWindow = options.normalizationWindow ?? 7;
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame) continue;
      
      const windowed = AudioProcessor.applyWindow(frame);
      let spectrum = AudioProcessor.computeSpectrum(windowed);
      
      // Apply logarithmic compression to reduce dynamic range
      if (useLogarithmic) {
        spectrum = spectrum.map(val => Math.log(1 + val));
      }
      
      if (previousSpectrum) {
        let flux = 0;
        const maxBin = Math.min(spectrum.length, Math.floor(spectrum.length * 0.8)); // Focus on lower frequencies
        
        for (let bin = 1; bin < maxBin; bin++) {
          const currentVal = spectrum[bin] || 0;
          const prevVal = previousSpectrum[bin] || 0;
          const diff = currentVal - prevVal;
          
          // Enhanced half-wave rectification with frequency weighting
          if (diff > 0) {
            let weight = 1.0;
            if (useFrequencyWeighting) {
              // Apply perceptual frequency weighting (emphasize mid frequencies)
              const freqRatio = bin / maxBin;
              if (freqRatio < 0.1) {
                weight = 0.5; // Reduce very low frequencies
              } else if (freqRatio > 0.1 && freqRatio < 0.5) {
                weight = 1.0; // Keep mid frequencies
              } else {
                weight = 0.7; // Slightly reduce high frequencies
              }
            }
            flux += diff * diff * weight; // Use squared difference for better sensitivity
          }
        }
        
        onsetFunction[i] = Math.sqrt(flux); // Take square root to normalize
      } else {
        onsetFunction[i] = 0;
      }
      
      previousSpectrum = spectrum;
    }
    
    // Apply local normalization to improve onset detection in varying dynamics
    if (normalizationWindow > 1) {
      return this.applyLocalNormalization(onsetFunction, normalizationWindow);
    }
    
    return onsetFunction;
  }

  /**
   * Enhanced Energy Difference onset function with multiple improvements
   */
  private static calculateEnergyDifference(
    frames: Float32Array[],
    options: EnergyOnsetOptions = {}
  ): Float32Array {
    const onsetFunction = new Float32Array(frames.length);
    const useHighFreqEmphasis = options.useHighFreqEmphasis ?? true;
    const smoothingWindow = options.smoothingWindow ?? 5;
    const adaptiveThreshold = options.adaptiveThreshold ?? true;
    
    // Calculate energies for all frames first
    const energies = new Float32Array(frames.length);
    const highFreqEnergies = new Float32Array(frames.length);
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame) continue;
      
      energies[i] = this.calculateFrameEnergy(frame);
      
      if (useHighFreqEmphasis) {
        // Calculate high-frequency energy for better transient detection
        const windowed = AudioProcessor.applyWindow(frame);
        const spectrum = AudioProcessor.computeSpectrum(windowed);
        const startBin = Math.floor(spectrum.length * 0.3); // Above ~6.6kHz at 44.1kHz
        let hfEnergy = 0;
        for (let bin = startBin; bin < spectrum.length; bin++) {
          hfEnergy += spectrum[bin] * spectrum[bin];
        }
        highFreqEnergies[i] = Math.sqrt(hfEnergy);
      }
    }
    
    // Apply smoothing to energies
    const smoothedEnergies = this.applySmoothingFilter(energies, smoothingWindow);
    const smoothedHFEnergies = useHighFreqEmphasis ? 
      this.applySmoothingFilter(highFreqEnergies, smoothingWindow) : highFreqEnergies;
    
    // Calculate onset function
    for (let i = 1; i < frames.length; i++) {
      const currentEnergy = smoothedEnergies[i] || 0;
      const prevEnergy = smoothedEnergies[i - 1] || 0;
      const energyDiff = currentEnergy - prevEnergy;
      
      let onsetValue = 0;
      
      if (energyDiff > 0) {
        // Normalized energy difference
        onsetValue = energyDiff / (prevEnergy + 1e-6);
        
        // Add high-frequency component
        if (useHighFreqEmphasis) {
          const hfDiff = smoothedHFEnergies[i] - smoothedHFEnergies[i - 1];
          if (hfDiff > 0) {
            onsetValue += 0.5 * hfDiff / (smoothedHFEnergies[i - 1] + 1e-6);
          }
        }
        
        // Apply adaptive threshold based on local energy statistics
        if (adaptiveThreshold) {
          const localMean = this.calculateLocalMean(smoothedEnergies, i, 10);
          const localStd = this.calculateLocalStandardDeviation(smoothedEnergies, i, 10, localMean);
          const threshold = localMean + 0.5 * localStd;
          
          if (currentEnergy > threshold) {
            onsetValue *= 1.5; // Boost values above adaptive threshold
          } else {
            onsetValue *= 0.5; // Reduce values below threshold
          }
        }
      }
      
      onsetFunction[i] = onsetValue;
    }
    
    return onsetFunction;
  }

  /**
   * Enhanced Complex Domain onset function with improved phase tracking
   */
  private static calculateComplexDomain(
    frames: Float32Array[],
    options: ComplexDomainOptions = {},
    hopSize = 512,
    windowSize = 1024
  ): Float32Array {
    const onsetFunction = new Float32Array(frames.length);
    const phaseWeight = options.phaseWeight ?? 0.5;
    const magnitudeWeight = options.magnitudeWeight ?? 0.5;
    const usePredictivePhase = options.usePredictivePhase ?? true;
    
    let previousMagnitude: Float32Array | null = null;
    let previousPhase: Float32Array | null = null;
    let previousPreviousPhase: Float32Array | null = null; // For predictive phase tracking
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame) continue;
      
      const windowed = AudioProcessor.applyWindow(frame);
      const { magnitude, phase } = this.computeComplexSpectrum(windowed);
      
      if (previousMagnitude && previousPhase) {
        let complexDiff = 0;
        const maxBin = Math.min(magnitude.length, Math.floor(magnitude.length * 0.8));
        
        for (let bin = 1; bin < maxBin; bin++) {
          let expectedPhase: number;
          
          if (usePredictivePhase && previousPreviousPhase && i >= 2) {
            // Use second-order phase prediction for better accuracy
            const phase1 = previousPhase[bin] || 0;
            const phase0 = previousPreviousPhase[bin] || 0;
            const phaseDelta = this.wrapPhase(phase1 - phase0);
            expectedPhase = phase1 + phaseDelta;
          } else {
            // First-order phase prediction
            expectedPhase = (previousPhase[bin] || 0) + (bin * Math.PI * hopSize) / windowSize;
          }
          
          const actualPhase = phase[bin] || 0;
          const phaseDiff = this.wrapPhase(actualPhase - expectedPhase);
          const magnitudeDiff = (magnitude[bin] || 0) - (previousMagnitude[bin] || 0);
          
          // Enhanced complex domain measure with frequency weighting
          const freqWeight = this.getFrequencyWeight(bin, maxBin);
          const currentMag = magnitude[bin] || 0;
          
          // Phase deviation component
          const phaseComponent = currentMag * Math.abs(phaseDiff) * phaseWeight;
          
          // Magnitude increase component
          const magComponent = Math.max(0, magnitudeDiff) * magnitudeWeight;
          
          complexDiff += (phaseComponent + magComponent) * freqWeight;
        }
        
        onsetFunction[i] = complexDiff;
      } else {
        onsetFunction[i] = 0;
      }
      
      // Update history
      if (previousPhase) {
        previousPreviousPhase = previousPhase;
      }
      previousMagnitude = magnitude;
      previousPhase = phase;
    }
    
    return onsetFunction;
  }

  /**
   * Compute complex spectrum (magnitude and phase)
   */
  private static computeComplexSpectrum(frame: Float32Array): {
    magnitude: Float32Array;
    phase: Float32Array;
  } {
    const N = frame.length;
    const magnitude = new Float32Array(N / 2);
    const phase = new Float32Array(N / 2);
    
    for (let k = 0; k < N / 2; k++) {
      let real = 0;
      let imag = 0;
      
      for (let n = 0; n < N; n++) {
        const angle = -2 * Math.PI * k * n / N;
        real += frame[n] * Math.cos(angle);
        imag += frame[n] * Math.sin(angle);
      }
      
      magnitude[k] = Math.sqrt(real * real + imag * imag);
      phase[k] = Math.atan2(imag, real);
    }
    
    return { magnitude, phase };
  }

  /**
   * Wrap phase to [-π, π] range
   */
  private static wrapPhase(phase: number): number {
    while (phase > Math.PI) phase -= 2 * Math.PI;
    while (phase < -Math.PI) phase += 2 * Math.PI;
    return phase;
  }

  /**
   * Calculate frame energy
   */
  private static calculateFrameEnergy(frame: Float32Array): number {
    let energy = 0;
    for (let i = 0; i < frame.length; i++) {
      energy += frame[i] * frame[i];
    }
    return energy;
  }

  /**
   * Enhanced onset function combination with confidence-based weighting
   */
  private static combineOnsetFunctions(
    functions: Array<{ function: Float32Array; weight: number; name?: string }>,
    weights?: OnsetCombinationWeights
  ): Float32Array {
    if (functions.length === 0) {
      throw new Error('No onset functions provided');
    }
    
    const length = functions[0]?.function.length || 0;
    const combined = new Float32Array(length);
    const confidenceWeights = new Float32Array(length);
    
    // Calculate dynamic confidence weights for each function
    const processedFunctions = functions.map(({ function: func, weight, name }) => {
      const normalized = this.normalizeOnsetFunction(func);
      const reliability = this.calculateFunctionReliability(normalized);
      const dynamicConfidence = this.calculateDynamicConfidence(normalized);
      
      return {
        function: normalized,
        weight,
        reliability,
        dynamicConfidence,
        name: name || 'unknown'
      };
    });
    
    // Combine with adaptive weighting
    for (let i = 0; i < length; i++) {
      let weightedSum = 0;
      let totalWeight = 0;
      
      for (const { function: func, weight, reliability, dynamicConfidence } of processedFunctions) {
        const adaptiveWeight = weight * reliability * dynamicConfidence[i];
        weightedSum += (func[i] || 0) * adaptiveWeight;
        totalWeight += adaptiveWeight;
      }
      
      combined[i] = totalWeight > 0 ? weightedSum / totalWeight : 0;
    }
    
    // Apply high-frequency content detection if available
    if (functions.length >= 3) {
      const hfcFunction = this.calculateHighFrequencyContent(
        functions.map(f => f.function)
      );
      
      const hfcWeight = weights?.highFreqContent ?? 0.1;
      if (hfcWeight > 0) {
        const normalizedHFC = this.normalizeOnsetFunction(hfcFunction);
        for (let i = 0; i < length; i++) {
          combined[i] = combined[i] * (1 - hfcWeight) + normalizedHFC[i] * hfcWeight;
        }
      }
    }
    
    return combined;
  }

  /**
   * Normalize onset function to [0, 1] range
   */
  private static normalizeOnsetFunction(onsetFunction: Float32Array): Float32Array {
    const max = Math.max(...onsetFunction);
    if (max === 0) return onsetFunction;
    
    const normalized = new Float32Array(onsetFunction.length);
    for (let i = 0; i < onsetFunction.length; i++) {
      normalized[i] = onsetFunction[i] / max;
    }
    return normalized;
  }

  /**
   * Peak picking from onset function
   */
  private static pickPeaks(
    onsetFunction: Float32Array,
    sampleRate: number,
    hopSize: number,
    threshold: number,
    minInterval: number
  ): Onset[] {
    const onsets: Onset[] = [];
    const minFrameInterval = Math.floor(minInterval * sampleRate / hopSize);
    
    // Apply adaptive threshold
    const adaptiveThreshold = this.calculateAdaptiveThreshold(onsetFunction, threshold);
    
    let lastOnsetFrame = -minFrameInterval;
    
    for (let i = 1; i < onsetFunction.length - 1; i++) {
      const current = onsetFunction[i];
      const previous = onsetFunction[i - 1];
      const next = onsetFunction[i + 1];
      const threshold = adaptiveThreshold[i];
      
      if (current === undefined || previous === undefined || next === undefined || threshold === undefined) {
        continue;
      }
      
      // Peak detection: local maximum above threshold
      if (current > previous && 
          current > next && 
          current > threshold &&
          i - lastOnsetFrame >= minFrameInterval) {
        
        const time = (i * hopSize) / sampleRate;
        const strength = current;
        const confidence = Math.min(current / Math.max(...onsetFunction), 1.0);
        
        onsets.push({
          time,
          strength,
          confidence
        });
        
        lastOnsetFrame = i;
      }
    }
    
    return onsets;
  }

  /**
   * Enhanced adaptive threshold calculation with multiple strategies
   */
  private static calculateAdaptiveThreshold(
    onsetFunction: Float32Array,
    baseThreshold: number,
    strategy: 'statistical' | 'percentile' | 'hybrid' = 'hybrid'
  ): Float32Array {
    const threshold = new Float32Array(onsetFunction.length);
    const windowSize = Math.max(20, Math.floor(onsetFunction.length * 0.05)); // Adaptive window size
    
    for (let i = 0; i < onsetFunction.length; i++) {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(onsetFunction.length, i + windowSize);
      const windowData = onsetFunction.slice(start, end);
      
      let adaptiveThreshold = baseThreshold;
      
      switch (strategy) {
        case 'statistical': {
          const mean = this.calculateMean(windowData);
          const std = this.calculateStandardDeviation(windowData, mean);
          adaptiveThreshold = Math.max(baseThreshold, mean + 1.5 * std);
          break;
        }
        
        case 'percentile': {
          const sortedData = Array.from(windowData).sort((a, b) => a - b);
          const p75 = sortedData[Math.floor(sortedData.length * 0.75)] || 0;
          const p25 = sortedData[Math.floor(sortedData.length * 0.25)] || 0;
          const iqr = p75 - p25;
          adaptiveThreshold = Math.max(baseThreshold, p75 + 1.5 * iqr);
          break;
        }
        
        case 'hybrid': {
          // Combine statistical and percentile methods
          const mean = this.calculateMean(windowData);
          const std = this.calculateStandardDeviation(windowData, mean);
          const sortedData = Array.from(windowData).sort((a, b) => a - b);
          const median = sortedData[Math.floor(sortedData.length * 0.5)] || 0;
          
          // Use the more conservative (higher) threshold
          const statThreshold = mean + 1.2 * std;
          const percThreshold = median + 2.0 * std;
          adaptiveThreshold = Math.max(baseThreshold, statThreshold, percThreshold);
          
          // Apply dynamic scaling based on local activity
          const localActivity = std / (mean + 1e-6);
          if (localActivity > 1.0) {
            adaptiveThreshold *= 0.8; // More sensitive in active regions
          } else if (localActivity < 0.3) {
            adaptiveThreshold *= 1.2; // Less sensitive in quiet regions
          }
          break;
        }
      }
      
      threshold[i] = adaptiveThreshold;
    }
    
    // Smooth the threshold to avoid abrupt changes
    return this.applySmoothingFilter(threshold, 3);
  }

  /**
   * Post-process onsets to remove duplicates and refine timing
   */
  static postProcessOnsets(
    onsets: Onset[],
    audioData: AudioData,
    sampleRate: number
  ): Onset[] {
    if (onsets.length === 0) return onsets;
    
    // Sort by time
    const sortedOnsets = [...onsets].sort((a, b) => a.time - b.time);
    
    // Remove weak onsets that are too close to stronger ones
    const filtered: Onset[] = [];
    const minInterval = 0.05; // 50ms
    
    for (let i = 0; i < sortedOnsets.length; i++) {
      const current = sortedOnsets[i];
      let keepOnset = true;
      
      // Check against already accepted onsets
      for (const accepted of filtered) {
        if (Math.abs(current.time - accepted.time) < minInterval) {
          // Keep the stronger onset
          if (current.strength <= accepted.strength) {
            keepOnset = false;
            break;
          } else {
            // Remove the weaker accepted onset
            const index = filtered.indexOf(accepted);
            if (index > -1) {
              filtered.splice(index, 1);
            }
          }
        }
      }
      
      if (keepOnset) {
        filtered.push(current);
      }
    }
    
    // Refine timing using energy peak
    return filtered.map(onset => this.refineOnsetTiming(onset, audioData, sampleRate));
  }

  /**
   * Enhanced onset timing refinement using multiple criteria
   */
  private static refineOnsetTiming(
    onset: Onset,
    audioData: AudioData,
    sampleRate: number
  ): Onset {
    const data = this.toFloat32Array(audioData);
    const sampleIndex = Math.floor(onset.time * sampleRate);
    const windowSize = 512; // Larger window for better accuracy
    const halfWindow = Math.floor(windowSize / 2);
    
    const start = Math.max(0, sampleIndex - halfWindow);
    const end = Math.min(data.length, sampleIndex + halfWindow);
    
    let bestScore = -Infinity;
    let bestIndex = sampleIndex;
    
    // Multi-criteria onset refinement
    for (let i = start; i < end; i += 16) { // Smaller steps for precision
      const windowEnd = Math.min(i + windowSize, data.length);
      if (windowEnd - i < windowSize / 2) continue; // Skip if window too small
      
      const windowData = data.slice(i, windowEnd);
      
      // Calculate multiple onset indicators
      const energy = this.calculateFrameEnergy(windowData);
      const spectralCentroid = this.calculateSpectralCentroidForWindow(windowData, sampleRate);
      const zcr = this.calculateZeroCrossingRate(windowData);
      
      // Compute a composite onset score
      const energyScore = energy;
      const spectralScore = spectralCentroid / 1000; // Normalize to reasonable range
      const zcrScore = zcr * 100; // Scale for comparison
      
      // Weight the different indicators
      const compositeScore = 0.6 * energyScore + 0.3 * spectralScore + 0.1 * zcrScore;
      
      if (compositeScore > bestScore) {
        bestScore = compositeScore;
        bestIndex = i;
      }
    }
    
    // Micro-adjustment using zero-crossing alignment
    const microAdjustment = this.findZeroCrossingAlignment(data, bestIndex, 64);
    
    return {
      ...onset,
      time: (bestIndex + microAdjustment) / sampleRate,
      confidence: Math.min(onset.confidence * 1.1, 1.0) // Slight confidence boost for refined onsets
    };
  }

  // ===== NEW HELPER METHODS =====
  
  /**
   * Apply local normalization to onset function
   */
  private static applyLocalNormalization(
    onsetFunction: Float32Array,
    windowSize: number
  ): Float32Array {
    const normalized = new Float32Array(onsetFunction.length);
    const halfWindow = Math.floor(windowSize / 2);
    
    for (let i = 0; i < onsetFunction.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(onsetFunction.length, i + halfWindow + 1);
      
      const windowData = onsetFunction.slice(start, end);
      const localMax = Math.max(...windowData);
      const localMean = this.calculateMean(windowData);
      
      // Normalize using local statistics
      if (localMax > localMean * 1.5) {
        normalized[i] = onsetFunction[i] / (localMax + 1e-6);
      } else {
        normalized[i] = onsetFunction[i] / (localMean + 1e-6);
      }
    }
    
    return normalized;
  }
  
  /**
   * Apply smoothing filter to reduce noise
   */
  private static applySmoothingFilter(
    signal: Float32Array,
    windowSize: number
  ): Float32Array {
    if (windowSize <= 1) return signal;
    
    const smoothed = new Float32Array(signal.length);
    const halfWindow = Math.floor(windowSize / 2);
    
    for (let i = 0; i < signal.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(signal.length, i + halfWindow + 1);
      
      let sum = 0;
      let count = 0;
      for (let j = start; j < end; j++) {
        sum += signal[j] || 0;
        count++;
      }
      
      smoothed[i] = count > 0 ? sum / count : 0;
    }
    
    return smoothed;
  }
  
  /**
   * Calculate local mean around a point
   */
  private static calculateLocalMean(
    data: Float32Array,
    center: number,
    windowSize: number
  ): number {
    const start = Math.max(0, center - Math.floor(windowSize / 2));
    const end = Math.min(data.length, center + Math.floor(windowSize / 2) + 1);
    
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      sum += data[i] || 0;
      count++;
    }
    
    return count > 0 ? sum / count : 0;
  }
  
  /**
   * Calculate local standard deviation
   */
  private static calculateLocalStandardDeviation(
    data: Float32Array,
    center: number,
    windowSize: number,
    mean?: number
  ): number {
    const localMean = mean ?? this.calculateLocalMean(data, center, windowSize);
    const start = Math.max(0, center - Math.floor(windowSize / 2));
    const end = Math.min(data.length, center + Math.floor(windowSize / 2) + 1);
    
    let sumSquares = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      const diff = (data[i] || 0) - localMean;
      sumSquares += diff * diff;
      count++;
    }
    
    return count > 0 ? Math.sqrt(sumSquares / count) : 0;
  }
  
  /**
   * Calculate mean of array
   */
  private static calculateMean(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] || 0;
    }
    return data.length > 0 ? sum / data.length : 0;
  }
  
  /**
   * Calculate standard deviation
   */
  private static calculateStandardDeviation(
    data: Float32Array,
    mean?: number
  ): number {
    const actualMean = mean ?? this.calculateMean(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const diff = (data[i] || 0) - actualMean;
      sumSquares += diff * diff;
    }
    return data.length > 0 ? Math.sqrt(sumSquares / data.length) : 0;
  }
  
  /**
   * Calculate function reliability score
   */
  private static calculateFunctionReliability(onsetFunction: Float32Array): number {
    // Calculate signal-to-noise ratio as reliability metric
    const mean = this.calculateMean(onsetFunction);
    const std = this.calculateStandardDeviation(onsetFunction, mean);
    
    if (std === 0) return 0.5; // Default reliability for flat signals
    
    const snr = mean / std;
    return Math.min(Math.max(snr / 10, 0.1), 1.0); // Normalize to [0.1, 1.0]
  }
  
  /**
   * Calculate dynamic confidence weights
   */
  private static calculateDynamicConfidence(onsetFunction: Float32Array): Float32Array {
    const confidence = new Float32Array(onsetFunction.length);
    const windowSize = 10;
    
    for (let i = 0; i < onsetFunction.length; i++) {
      const localMean = this.calculateLocalMean(onsetFunction, i, windowSize);
      const localStd = this.calculateLocalStandardDeviation(onsetFunction, i, windowSize, localMean);
      
      // Higher confidence for values that stand out from local background
      const significance = localStd > 0 ? Math.abs(onsetFunction[i] - localMean) / localStd : 0;
      confidence[i] = Math.min(significance / 3.0, 1.0); // Normalize
    }
    
    return confidence;
  }
  
  /**
   * Calculate high-frequency content for additional onset detection
   */
  private static calculateHighFrequencyContent(functions: Float32Array[]): Float32Array {
    if (functions.length === 0) return new Float32Array();
    
    const length = functions[0]?.length || 0;
    const hfc = new Float32Array(length);
    
    // Use variance across different onset functions as HFC indicator
    for (let i = 0; i < length; i++) {
      const values = functions.map(f => f[i] || 0);
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      let variance = 0;
      for (const val of values) {
        variance += (val - mean) * (val - mean);
      }
      hfc[i] = Math.sqrt(variance / values.length);
    }
    
    return hfc;
  }
  
  /**
   * Get frequency weighting for spectral bins
   */
  private static getFrequencyWeight(bin: number, maxBin: number): number {
    const freqRatio = bin / maxBin;
    
    // Perceptual weighting: emphasize mid frequencies, de-emphasize extremes
    if (freqRatio < 0.05) return 0.3; // Very low frequencies
    if (freqRatio < 0.15) return 0.8; // Low frequencies
    if (freqRatio < 0.6) return 1.0;  // Mid frequencies
    if (freqRatio < 0.8) return 0.7;  // High frequencies
    return 0.4; // Very high frequencies
  }
  
  /**
   * Check if audio is predominantly silent
   */
  private static isAudioSilent(data: Float32Array, threshold = 0.001): boolean {
    const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length);
    return rms < threshold;
  }
  
  /**
   * Check if audio contains mostly noise
   */
  private static isAudioNoise(data: Float32Array, sampleRate: number): boolean {
    // Simple noise detection: check if zero-crossing rate is very high
    const zcr = SignalProcessing.zeroCrossingRate(data);
    const normalizedZCR = zcr * sampleRate;
    
    // If ZCR is above 3000 Hz, likely noise
    return normalizedZCR > 3000;
  }
  
  /**
   * Calculate spectral centroid for a window
   */
  private static calculateSpectralCentroidForWindow(
    windowData: Float32Array,
    sampleRate: number
  ): number {
    const windowed = AudioProcessor.applyWindow(windowData);
    const spectrum = AudioProcessor.computeSpectrum(windowed);
    return SignalProcessing.spectralCentroid(spectrum, sampleRate);
  }
  
  /**
   * Calculate zero crossing rate for a window
   */
  private static calculateZeroCrossingRate(data: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i - 1]! >= 0) !== (data[i]! >= 0)) {
        crossings++;
      }
    }
    return crossings / (data.length - 1);
  }
  
  /**
   * Find zero crossing alignment for precise timing
   */
  private static findZeroCrossingAlignment(
    data: Float32Array,
    center: number,
    searchRadius: number
  ): number {
    const start = Math.max(0, center - searchRadius);
    const end = Math.min(data.length - 1, center + searchRadius);
    
    let bestOffset = 0;
    let minDistance = Infinity;
    
    for (let i = start; i < end; i++) {
      if ((data[i]! >= 0) !== (data[i + 1]! >= 0)) {
        // Found a zero crossing
        const distance = Math.abs(i - center);
        if (distance < minDistance) {
          minDistance = distance;
          bestOffset = i - center;
        }
      }
    }
    
    return bestOffset;
  }
}