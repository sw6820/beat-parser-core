import { OnsetDetection } from './OnsetDetection';
import { TempoTracking } from './TempoTracking';
import { SpectralFeatures } from './SpectralFeatures';
import { BeatConfig, BeatCandidate, AudioFeatures } from '../types';

export interface HybridDetectorConfig extends BeatConfig {
  onsetWeight?: number;
  tempoWeight?: number;
  spectralWeight?: number;
  multiPassEnabled?: boolean;
  genreAdaptive?: boolean;
  confidenceThreshold?: number;
}

export interface GenreProfile {
  name: string;
  tempoRange: [number, number];
  onsetSensitivity: number;
  spectralEmphasis: number;
  rhythmComplexity: number;
}

export class HybridDetector {
  private onsetDetector: OnsetDetection;
  private config: Required<HybridDetectorConfig>;

  // Genre profiles for adaptive processing
  private static readonly GENRE_PROFILES: GenreProfile[] = [
    {
      name: 'electronic',
      tempoRange: [120, 140],
      onsetSensitivity: 0.8,
      spectralEmphasis: 0.9,
      rhythmComplexity: 0.7
    },
    {
      name: 'rock',
      tempoRange: [110, 130],
      onsetSensitivity: 0.9,
      spectralEmphasis: 0.6,
      rhythmComplexity: 0.8
    },
    {
      name: 'jazz',
      tempoRange: [80, 120],
      onsetSensitivity: 0.7,
      spectralEmphasis: 0.5,
      rhythmComplexity: 0.9
    },
    {
      name: 'classical',
      tempoRange: [60, 120],
      onsetSensitivity: 0.6,
      spectralEmphasis: 0.4,
      rhythmComplexity: 0.8
    },
    {
      name: 'pop',
      tempoRange: [100, 130],
      onsetSensitivity: 0.8,
      spectralEmphasis: 0.7,
      rhythmComplexity: 0.6
    }
  ];

  constructor(config: HybridDetectorConfig = {}) {
    this.config = {
      sampleRate: 44100,
      hopSize: 512,
      frameSize: 2048,
      minTempo: 60,
      maxTempo: 200,
      onsetWeight: 0.4,
      tempoWeight: 0.4,
      spectralWeight: 0.2,
      multiPassEnabled: true,
      genreAdaptive: true,
      confidenceThreshold: 0.6,
      ...config
    };

    this.onsetDetector = new OnsetDetection({
      sampleRate: this.config.sampleRate,
      hopSize: this.config.hopSize,
      frameSize: this.config.frameSize
    });
  }

  /**
   * Detect beats using hybrid approach combining multiple algorithms
   */
  async detectBeats(audioData: Float32Array): Promise<BeatCandidate[]> {
    if (!audioData || audioData.length === 0) {
      throw new Error('Invalid audio data provided');
    }

    try {
      // Extract audio features for genre detection and adaptive processing
      const features = await this.extractAudioFeatures(audioData);
      
      // Detect genre and adapt parameters if enabled
      const genreProfile = this.config.genreAdaptive 
        ? this.detectGenre(features)
        : null;

      // Adapt configuration based on detected genre
      const adaptedConfig = genreProfile 
        ? this.adaptConfigForGenre(genreProfile)
        : this.config;

      // Run detection algorithms in parallel
      const [onsetBeats, tempoBeats, spectralBeats] = await Promise.all([
        this.runOnsetDetection(audioData, adaptedConfig),
        this.runTempoTracking(audioData, adaptedConfig),
        this.runSpectralAnalysis(audioData, adaptedConfig)
      ]);

      // Combine results using weighted fusion
      let combinedBeats = this.combineDetectionResults(
        onsetBeats, 
        tempoBeats, 
        spectralBeats, 
        adaptedConfig
      );

      // Multi-pass refinement if enabled
      if (this.config.multiPassEnabled) {
        combinedBeats = await this.multiPassRefinement(audioData, combinedBeats, adaptedConfig);
      }

      // Calculate confidence scores
      combinedBeats = this.calculateConfidenceScores(combinedBeats, features);

      // Filter by confidence threshold
      const filteredBeats = combinedBeats.filter(
        beat => beat.confidence >= this.config.confidenceThreshold
      );

      return this.sortAndValidateBeats(filteredBeats);

    } catch (error) {
      throw new Error(`Hybrid beat detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract comprehensive audio features for analysis
   * Uses frame-wise processing for large audio files to avoid performance issues
   */
  private async extractAudioFeatures(audioData: Float32Array): Promise<AudioFeatures> {
    // For large audio files, use frame-wise processing and take the mean
    let spectralData: AudioFeatures;
    
    if (audioData.length > 8192) {
      // Process in frames and average the results
      const frameFeatures = SpectralFeatures.extractFrameFeatures(
        audioData, 
        this.config.frameSize, 
        this.config.hopSize, 
        this.config.sampleRate
      );
      
      // Average the features across all frames
      spectralData = this.averageFrameFeatures(frameFeatures);
    } else {
      spectralData = SpectralFeatures.extractFeatures(audioData, this.config.sampleRate);
    }
    
    // Calculate additional features
    const rms = this.calculateRMS(audioData);
    const zcr = this.calculateZeroCrossingRate(audioData);
    const dynamicRange = this.calculateDynamicRange(audioData);
    
    return {
      spectralCentroid: spectralData.spectralCentroid,
      spectralRolloff: spectralData.spectralRolloff,
      mfcc: spectralData.mfcc,
      chroma: spectralData.chroma || [],
      rms,
      zeroCrossingRate: zcr,
      zcr: zcr,
      dynamicRange,
      duration: audioData.length / this.config.sampleRate
    };
  }

  /**
   * Detect music genre based on audio features
   */
  private detectGenre(features: AudioFeatures): GenreProfile {
    let bestMatch = HybridDetector.GENRE_PROFILES[0];
    let bestScore = 0;

    for (const profile of HybridDetector.GENRE_PROFILES) {
      const score = this.calculateGenreScore(features, profile);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = profile;
      }
    }

    return bestMatch;
  }

  /**
   * Calculate how well audio features match a genre profile
   */
  private calculateGenreScore(features: AudioFeatures, profile: GenreProfile): number {
    let score = 0;
    
    // Spectral characteristics
    const spectralScore = 1 - Math.abs(features.spectralCentroid - 0.5);
    score += spectralScore * 0.3;

    // Dynamic range
    const dynamicScore = Math.min(features.dynamicRange / 40, 1); // Normalize to 40dB max
    score += dynamicScore * profile.rhythmComplexity * 0.3;

    // RMS energy
    const energyScore = Math.min(features.rms * 10, 1); // Normalize
    score += energyScore * 0.2;

    // Zero crossing rate (indicates percussive content)
    const zcrScore = Math.min(features.zeroCrossingRate, 1);
    score += zcrScore * profile.onsetSensitivity * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Adapt configuration parameters based on detected genre
   */
  private adaptConfigForGenre(profile: GenreProfile): Required<HybridDetectorConfig> {
    return {
      ...this.config,
      minTempo: profile.tempoRange[0],
      maxTempo: profile.tempoRange[1],
      onsetWeight: this.config.onsetWeight * profile.onsetSensitivity,
      spectralWeight: this.config.spectralWeight * profile.spectralEmphasis,
      confidenceThreshold: this.config.confidenceThreshold * (1 - profile.rhythmComplexity * 0.2)
    };
  }

  /**
   * Run onset detection with adapted parameters
   */
  private async runOnsetDetection(
    audioData: Float32Array, 
    config: Required<HybridDetectorConfig>
  ): Promise<BeatCandidate[]> {
    const onsets = this.onsetDetector.detectOnsets(audioData, this.config.sampleRate);
    
    return onsets.map(onset => ({
      timestamp: onset.time,
      confidence: onset.strength,
      source: 'onset' as const,
      strength: onset.strength,
      metadata: {
        detectionMethod: 'onset'
      }
    }));
  }

  /**
   * Run tempo tracking with adapted parameters
   */
  private async runTempoTracking(
    audioData: Float32Array, 
    config: Required<HybridDetectorConfig>
  ): Promise<BeatCandidate[]> {
    const tempoData = TempoTracking.detectTempo(
      audioData,
      this.config.sampleRate,
      {
        minBpm: config.minTempo,
        maxBpm: config.maxTempo,
        windowSize: 10.0,
        useDynamicProgramming: true
      }
    );
    
    // Convert tempo tracking results to beat candidates
    const beats: BeatCandidate[] = [];
    const beatInterval = 60 / tempoData.bpm;
    
    for (let time = 0; time < audioData.length / this.config.sampleRate; time += beatInterval) {
      beats.push({
        timestamp: time,
        confidence: tempoData.confidence,
        source: 'tempo' as const,
        strength: tempoData.confidence,
        metadata: {
          bpm: tempoData.bpm,
          phase: (time % beatInterval) / beatInterval
        }
      });
    }

    return beats;
  }

  /**
   * Run spectral analysis for beat detection
   */
  private async runSpectralAnalysis(
    audioData: Float32Array, 
    config: Required<HybridDetectorConfig>
  ): Promise<BeatCandidate[]> {
    // Don't extract features for the entire audio data - we'll process frames instead
    const beats: BeatCandidate[] = [];

    // Use spectral flux for beat detection
    const frameSize = this.config.frameSize;
    const hopSize = this.config.hopSize;
    const numFrames = Math.floor((audioData.length - frameSize) / hopSize) + 1;

    for (let i = 1; i < numFrames; i++) {
      const time = (i * hopSize) / this.config.sampleRate;
      
      // Calculate spectral flux between consecutive frames
      const flux = this.calculateSpectralFlux(audioData, i, frameSize, hopSize);
      
      if (flux > 0.1) { // Threshold for spectral change
        beats.push({
          timestamp: time,
          confidence: Math.min(flux, 1),
          source: 'spectral' as const,
          strength: flux,
          metadata: {
            spectralFlux: flux
          }
        });
      }
    }

    return beats;
  }

  /**
   * Combine results from different detection methods using weighted fusion
   */
  private combineDetectionResults(
    onsetBeats: BeatCandidate[],
    tempoBeats: BeatCandidate[],
    spectralBeats: BeatCandidate[],
    config: Required<HybridDetectorConfig>
  ): BeatCandidate[] {
    const combinedBeats: BeatCandidate[] = [];
    const timeWindow = 0.05; // 50ms window for beat grouping

    // Collect all beats with their weights
    const allBeats = [
      ...onsetBeats.map(b => ({ ...b, weight: config.onsetWeight })),
      ...tempoBeats.map(b => ({ ...b, weight: config.tempoWeight })),
      ...spectralBeats.map(b => ({ ...b, weight: config.spectralWeight }))
    ];

    // Sort by timestamp
    allBeats.sort((a, b) => a.timestamp - b.timestamp);

    // Group nearby beats and combine their confidences
    let i = 0;
    while (i < allBeats.length) {
      const currentBeat = allBeats[i];
      const group = [currentBeat];
      
      // Find all beats within the time window
      let j = i + 1;
      while (j < allBeats.length && allBeats[j].timestamp - currentBeat.timestamp <= timeWindow) {
        group.push(allBeats[j]);
        j++;
      }

      // Combine the group into a single beat
      const combinedBeat = this.combineNearbyBeats(group);
      combinedBeats.push(combinedBeat);

      i = j;
    }

    return combinedBeats;
  }

  /**
   * Combine nearby beats into a single beat with weighted confidence
   */
  private combineNearbyBeats(beats: Array<BeatCandidate & { weight: number }>): BeatCandidate {
    if (beats.length === 1) {
      const { weight, ...beat } = beats[0];
      return beat;
    }

    // Calculate weighted average timestamp
    const totalWeight = beats.reduce((sum, b) => sum + b.weight * b.confidence, 0);
    const weightedTimestamp = beats.reduce(
      (sum, b) => sum + b.timestamp * b.weight * b.confidence, 0
    ) / totalWeight;

    // Calculate combined confidence
    const combinedConfidence = totalWeight / beats.length;

    // Find the strongest source
    const strongestBeat = beats.reduce((max, b) => 
      b.confidence * b.weight > max.confidence * max.weight ? b : max
    );

    return {
      timestamp: weightedTimestamp,
      confidence: Math.min(combinedConfidence, 1),
      source: 'hybrid' as const,
      strength: combinedConfidence,
      metadata: {
        sources: beats.map(b => b.source),
        originalConfidences: beats.map(b => b.confidence),
        weights: beats.map(b => b.weight),
        dominantSource: strongestBeat.source
      }
    };
  }

  /**
   * Multi-pass refinement for improved accuracy
   */
  private async multiPassRefinement(
    audioData: Float32Array,
    beats: BeatCandidate[],
    config: Required<HybridDetectorConfig>
  ): Promise<BeatCandidate[]> {
    // Pass 1: Remove outliers based on inter-beat intervals
    let refinedBeats = this.removeIntervalOutliers(beats);

    // Pass 2: Enhance beats near strong spectral events
    refinedBeats = await this.enhanceSpectralBeats(audioData, refinedBeats);

    // Pass 3: Apply temporal smoothing
    refinedBeats = this.applyTemporalSmoothing(refinedBeats);

    return refinedBeats;
  }

  /**
   * Remove beats that have unusual inter-beat intervals
   */
  private removeIntervalOutliers(beats: BeatCandidate[]): BeatCandidate[] {
    if (beats.length < 3) return beats;

    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i].timestamp - beats[i - 1].timestamp);
    }

    // Calculate median interval
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    const threshold = median * 0.5; // Allow 50% deviation

    return beats.filter((beat, i) => {
      if (i === 0 || i === beats.length - 1) return true;

      const prevInterval = beat.timestamp - beats[i - 1].timestamp;
      const nextInterval = beats[i + 1].timestamp - beat.timestamp;

      return Math.abs(prevInterval - median) <= threshold ||
             Math.abs(nextInterval - median) <= threshold;
    });
  }

  /**
   * Enhance beats that coincide with strong spectral events
   */
  private async enhanceSpectralBeats(
    audioData: Float32Array,
    beats: BeatCandidate[]
  ): Promise<BeatCandidate[]> {
    const enhancedBeats = [...beats];

    for (let i = 0; i < enhancedBeats.length; i++) {
      const beat = enhancedBeats[i];
      const sampleIndex = Math.floor(beat.timestamp * this.config.sampleRate);
      
      // Calculate spectral energy around the beat
      const windowSize = Math.floor(this.config.sampleRate * 0.02); // 20ms window
      const startIndex = Math.max(0, sampleIndex - windowSize / 2);
      const endIndex = Math.min(audioData.length, sampleIndex + windowSize / 2);
      
      let energy = 0;
      for (let j = startIndex; j < endIndex; j++) {
        energy += audioData[j] * audioData[j];
      }
      energy /= (endIndex - startIndex);

      // Enhance confidence for beats with high spectral energy
      const energyBoost = Math.min(energy * 5, 0.3); // Max 0.3 boost
      enhancedBeats[i] = {
        ...beat,
        confidence: Math.min(beat.confidence + energyBoost, 1),
        strength: Math.min(beat.strength + energyBoost, 1)
      };
    }

    return enhancedBeats;
  }

  /**
   * Apply temporal smoothing to beat confidences
   */
  private applyTemporalSmoothing(beats: BeatCandidate[]): BeatCandidate[] {
    if (beats.length < 3) return beats;

    const smoothedBeats = [...beats];
    const windowSize = 3;

    for (let i = 1; i < beats.length - 1; i++) {
      let sumConfidence = 0;
      let count = 0;

      for (let j = Math.max(0, i - windowSize); j <= Math.min(beats.length - 1, i + windowSize); j++) {
        sumConfidence += beats[j].confidence;
        count++;
      }

      const avgConfidence = sumConfidence / count;
      const smoothingFactor = 0.3;

      smoothedBeats[i] = {
        ...beats[i],
        confidence: beats[i].confidence * (1 - smoothingFactor) + avgConfidence * smoothingFactor
      };
    }

    return smoothedBeats;
  }

  /**
   * Calculate confidence scores based on multiple factors
   */
  private calculateConfidenceScores(
    beats: BeatCandidate[],
    features: AudioFeatures
  ): BeatCandidate[] {
    return beats.map(beat => {
      let confidence = beat.confidence;

      // Boost confidence for consistent tempo
      if (beat.source === 'tempo' || beat.source === 'hybrid') {
        confidence *= 1.1;
      }

      // Boost confidence for strong onsets
      if (beat.source === 'onset' && beat.strength > 0.8) {
        confidence *= 1.2;
      }

      // Adjust for audio characteristics
      if (features.dynamicRange > 20) { // High dynamic range
        confidence *= 1.1;
      }

      if (features.rms < 0.01) { // Very quiet audio
        confidence *= 0.8;
      }

      return {
        ...beat,
        confidence: Math.min(confidence, 1)
      };
    });
  }

  /**
   * Sort beats by timestamp and validate consistency
   */
  private sortAndValidateBeats(beats: BeatCandidate[]): BeatCandidate[] {
    // Sort by timestamp
    const sortedBeats = beats.sort((a, b) => a.timestamp - b.timestamp);

    // Remove duplicates (beats too close together)
    const minInterval = 0.02; // 20ms minimum between beats
    const uniqueBeats: BeatCandidate[] = [];

    for (const beat of sortedBeats) {
      if (uniqueBeats.length === 0 || 
          beat.timestamp - uniqueBeats[uniqueBeats.length - 1].timestamp >= minInterval) {
        uniqueBeats.push(beat);
      }
    }

    return uniqueBeats;
  }

  // Utility methods

  private calculateRMS(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  private calculateZeroCrossingRate(audioData: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / audioData.length;
  }

  private calculateDynamicRange(audioData: Float32Array): number {
    let max = 0;
    let min = 0;
    for (let i = 0; i < audioData.length; i++) {
      max = Math.max(max, Math.abs(audioData[i]));
      min = Math.min(min, Math.abs(audioData[i]));
    }
    return 20 * Math.log10(max / (min || 1e-10));
  }

  private calculateSpectralFlux(
    audioData: Float32Array, 
    frameIndex: number, 
    frameSize: number, 
    hopSize: number
  ): number {
    const startIndex = frameIndex * hopSize;
    const prevStartIndex = (frameIndex - 1) * hopSize;

    if (prevStartIndex < 0 || startIndex + frameSize > audioData.length) {
      return 0;
    }

    // Simple spectral flux calculation (sum of positive differences)
    let flux = 0;
    const binSize = frameSize / 2;

    for (let i = 0; i < binSize; i++) {
      const current = Math.abs(audioData[startIndex + i]);
      const previous = Math.abs(audioData[prevStartIndex + i]);
      flux += Math.max(0, current - previous);
    }

    return flux / binSize;
  }

  /**
   * Average multiple frame features into a single feature set
   */
  private averageFrameFeatures(frameFeatures: AudioFeatures[]): AudioFeatures {
    if (frameFeatures.length === 0) {
      throw new Error('Cannot average empty frame features array');
    }

    if (frameFeatures.length === 1) {
      return frameFeatures[0];
    }

    const numFrames = frameFeatures.length;
    const averaged: AudioFeatures = {
      spectralCentroid: 0,
      spectralRolloff: 0,
      zeroCrossingRate: 0,
      rms: 0,
      zcr: 0,
      mfcc: new Array(frameFeatures[0].mfcc.length).fill(0)
    };

    // Sum all features
    for (const frame of frameFeatures) {
      averaged.spectralCentroid += frame.spectralCentroid;
      averaged.spectralRolloff += frame.spectralRolloff;
      averaged.zeroCrossingRate += frame.zeroCrossingRate;
      averaged.rms += frame.rms;
      averaged.zcr += frame.zcr;
      
      for (let i = 0; i < frame.mfcc.length; i++) {
        averaged.mfcc[i] += frame.mfcc[i];
      }
    }

    // Average by dividing by frame count
    averaged.spectralCentroid /= numFrames;
    averaged.spectralRolloff /= numFrames;
    averaged.zeroCrossingRate /= numFrames;
    averaged.rms /= numFrames;
    averaged.zcr /= numFrames;
    
    for (let i = 0; i < averaged.mfcc.length; i++) {
      averaged.mfcc[i] /= numFrames;
    }

    return averaged;
  }
}