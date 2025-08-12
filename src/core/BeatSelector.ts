/**
 * BeatSelector - Intelligent beat selection system
 * Selects N optimal beats from detected beats using various strategies:
 * - Energy-based selection
 * - Regular/grid-based selection  
 * - Musical/rhythmic selection
 * - Adaptive selection combining multiple approaches
 */

import type { 
  Beat, 
  BeatResult,
  BeatSelection,
  BeatSelectorConfig,
  Tempo 
} from '../types';

export interface BeatScore {
  beat: Beat;
  energyScore: number;
  regularityScore: number;
  musicalScore: number;
  contextScore: number;
  totalScore: number;
}

export interface SelectionResult {
  /** Selected beats */
  beats: BeatResult[];
  /** Selection quality metrics */
  quality: {
    /** Coverage across audio duration */
    coverage: number;
    /** Diversity in beat strengths */
    diversity: number;
    /** Spacing regularity */
    spacing: number;
    /** Overall quality score */
    overall: number;
  };
  /** Selection metadata */
  metadata: {
    /** Strategy used */
    strategy: string;
    /** Total candidates considered */
    totalCandidates: number;
    /** Selection criteria applied */
    criteria: Record<string, unknown>;
    /** Processing time in milliseconds */
    processingTime: number;
  };
}

export class BeatSelector {
  private static readonly DEFAULT_SELECTION: Required<BeatSelection> = {
    strategy: 'adaptive',
    count: 16,
    energyWeight: 0.3,
    regularityWeight: 0.3,
    musicalWeight: 0.4
  };

  private static readonly DEFAULT_CONFIG: Required<BeatSelectorConfig> = {
    strategy: 'adaptive',
    count: 16,
    energyWeight: 0.3,
    regularityWeight: 0.3,
    musicalWeight: 0.4,
    minSpacing: 50, // 50ms minimum spacing
    audioDuration: undefined
  };

  /**
   * Select optimal beats using specified strategy - Enhanced version
   */
  static selectBeatsEnhanced(
    allBeats: Beat[],
    config: Partial<BeatSelectorConfig>,
    tempo?: Tempo
  ): SelectionResult {
    const startTime = Date.now();
    const fullConfig = { ...BeatSelector.DEFAULT_CONFIG, ...config };
    
    if (allBeats.length === 0) {
      return {
        beats: [],
        quality: { coverage: 0, diversity: 0, spacing: 0, overall: 0 },
        metadata: {
          strategy: fullConfig.strategy,
          totalCandidates: 0,
          criteria: fullConfig,
          processingTime: Date.now() - startTime
        }
      };
    }
    
    // Convert beats to BeatResults and select
    const selectedBeats = BeatSelector.selectBeatsInternal(allBeats, fullConfig, tempo);
    const beatResults = BeatSelector.convertToBeatResults(selectedBeats, tempo);
    
    // Analyze selection quality
    const quality = BeatSelector.analyzeSelection(selectedBeats, allBeats, fullConfig.audioDuration);
    
    return {
      beats: beatResults,
      quality: {
        coverage: quality.coverage,
        diversity: quality.diversity,
        spacing: quality.spacing,
        overall: quality.quality
      },
      metadata: {
        strategy: fullConfig.strategy,
        totalCandidates: allBeats.length,
        criteria: fullConfig,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Select optimal beats using specified strategy - Instance method
   */
  selectBeats(
    allBeats: Beat[],
    selection: BeatSelection,
    tempo?: Tempo,
    audioDuration?: number
  ): Beat[] {
    if (allBeats.length === 0) return [];
    
    const config = { ...BeatSelector.DEFAULT_SELECTION, ...selection };
    
    // If requesting more beats than available, return all
    if (config.count >= allBeats.length) {
      return [...allBeats].sort((a, b) => a.timestamp - b.timestamp);
    }
    
    return BeatSelector.selectBeatsInternal(allBeats, config, tempo, audioDuration);
  }

  /**
   * Select optimal beats using specified strategy - Static method for backward compatibility
   */
  static selectBeats(
    allBeats: Beat[],
    selection: BeatSelection,
    tempo?: Tempo,
    audioDuration?: number
  ): Beat[] {
    if (allBeats.length === 0) return [];
    
    const config = { ...BeatSelector.DEFAULT_SELECTION, ...selection };
    
    // If requesting more beats than available, return all
    if (config.count >= allBeats.length) {
      return [...allBeats].sort((a, b) => a.timestamp - b.timestamp);
    }
    
    return BeatSelector.selectBeatsInternal(allBeats, config, tempo, audioDuration);
  }

  /**
   * Internal beat selection logic
   */
  private static selectBeatsInternal(
    allBeats: Beat[],
    config: Required<BeatSelection> | Required<BeatSelectorConfig>,
    tempo?: Tempo,
    audioDuration?: number
  ): Beat[] {
    const duration = audioDuration || ('audioDuration' in config ? config.audioDuration : undefined);
    
    switch (config.strategy) {
      case 'energy':
        return BeatSelector.energyBasedSelection(allBeats, config);
      case 'regular':
        return BeatSelector.regularSelection(allBeats, config, duration);
      case 'musical':
        return BeatSelector.musicalSelection(allBeats, config, tempo);
      case 'adaptive':
        return BeatSelector.adaptiveSelection(allBeats, config, tempo, duration);
      default:
        throw new Error(`Unknown beat selection strategy: ${config.strategy}`);
    }
  }

  /**
   * Energy-based selection: Choose beats with highest energy/strength
   */
  private static energyBasedSelection(
    beats: Beat[],
    config: Required<BeatSelection>
  ): Beat[] {
    // Sort by strength (descending) and select top N
    const sortedBeats = [...beats]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, config.count);
    
    // Re-sort by timestamp for proper ordering
    return sortedBeats.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Regular selection: Distribute beats evenly across time
   */
  private static regularSelection(
    beats: Beat[],
    config: Required<BeatSelection>,
    audioDuration?: number
  ): Beat[] {
    if (!audioDuration || audioDuration <= 0) {
      // Fallback to equal distribution based on beat range
      const firstBeat = Math.min(...beats.map(b => b.timestamp));
      const lastBeat = Math.max(...beats.map(b => b.timestamp));
      audioDuration = lastBeat - firstBeat;
    }
    
    const selectedBeats: Beat[] = [];
    const interval = audioDuration * 1000 / config.count; // Convert to milliseconds
    
    for (let i = 0; i < config.count; i++) {
      const targetTime = i * interval;
      const closestBeat = BeatSelector.findClosestBeat(beats, targetTime);
      
      if (closestBeat && !selectedBeats.some(b => b.timestamp === closestBeat.timestamp)) {
        selectedBeats.push(closestBeat);
      }
    }
    
    return selectedBeats.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Musical selection: Choose beats based on musical/rhythmic importance
   */
  private static musicalSelection(
    beats: Beat[],
    config: Required<BeatSelection>,
    tempo?: Tempo
  ): Beat[] {
    const scoredBeats = BeatSelector.scoreBeatsMusically(beats, tempo);
    
    // Select top N beats by musical score
    const selectedBeats = scoredBeats
      .sort((a, b) => b.musicalScore - a.musicalScore)
      .slice(0, config.count)
      .map(sb => sb.beat);
    
    return selectedBeats.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Adaptive selection: Combine multiple approaches with dynamic programming
   */
  private static adaptiveSelection(
    beats: Beat[],
    config: Required<BeatSelection>,
    tempo?: Tempo,
    audioDuration?: number
  ): Beat[] {
    // Score all beats across multiple dimensions
    const scoredBeats = BeatSelector.scoreBeatsComprehensively(beats, tempo, audioDuration);
    
    // Apply weights to combine scores
    for (const scored of scoredBeats) {
      scored.totalScore = 
        scored.energyScore * config.energyWeight +
        scored.regularityScore * config.regularityWeight +
        scored.musicalScore * config.musicalWeight +
        scored.contextScore * 0.1; // Small context bonus
    }
    
    // Use dynamic programming for optimal selection considering spacing
    const selectedBeats = BeatSelector.dynamicProgrammingSelection(scoredBeats, config.count);
    
    return selectedBeats.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Score beats across all dimensions for comprehensive evaluation
   */
  private static scoreBeatsComprehensively(
    beats: Beat[],
    tempo?: Tempo,
    audioDuration?: number
  ): BeatScore[] {
    const scoredBeats: BeatScore[] = [];
    
    // Calculate normalization factors
    const maxStrength = Math.max(...beats.map(b => b.strength));
    const maxConfidence = Math.max(...beats.map(b => b.confidence));
    
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      
      const energyScore = BeatSelector.calculateEnergyScore(beat, maxStrength, maxConfidence);
      const regularityScore = BeatSelector.calculateRegularityScore(beat, beats, audioDuration);
      const musicalScore = BeatSelector.calculateMusicalScore(beat, beats, tempo);
      const contextScore = BeatSelector.calculateContextScore(beat, beats, i);
      
      scoredBeats.push({
        beat,
        energyScore,
        regularityScore,
        musicalScore,
        contextScore,
        totalScore: 0 // Will be calculated later with weights
      });
    }
    
    return scoredBeats;
  }

  /**
   * Calculate energy-based score for a beat
   */
  private static calculateEnergyScore(
    beat: Beat,
    maxStrength: number,
    maxConfidence: number
  ): number {
    const strengthScore = maxStrength > 0 ? beat.strength / maxStrength : 0;
    const confidenceScore = maxConfidence > 0 ? beat.confidence / maxConfidence : 0;
    
    return (strengthScore + confidenceScore) / 2;
  }

  /**
   * Calculate regularity score based on temporal distribution
   */
  private static calculateRegularityScore(
    beat: Beat,
    allBeats: Beat[],
    audioDuration?: number
  ): number {
    if (!audioDuration) return 0.5; // Neutral score
    
    const beatTime = beat.timestamp / 1000; // Convert to seconds
    const normalizedTime = beatTime / audioDuration;
    
    // Prefer beats that create even temporal distribution
    const idealSpacing = 1.0 / allBeats.length;
    const position = allBeats.findIndex(b => b === beat) / allBeats.length;
    const spacingError = Math.abs(position - normalizedTime);
    
    return Math.max(0, 1 - spacingError * 2);
  }

  /**
   * Calculate musical importance score
   */
  private static calculateMusicalScore(
    beat: Beat,
    allBeats: Beat[],
    tempo?: Tempo
  ): number {
    let score = 0.5; // Base score
    
    if (tempo) {
      const beatInterval = 60000 / tempo.bpm; // milliseconds
      const beatTime = beat.timestamp;
      
      // Score based on alignment with expected beat grid
      const nearestBeat = Math.round(beatTime / beatInterval) * beatInterval;
      const alignment = 1 - Math.abs(beatTime - nearestBeat) / (beatInterval / 2);
      score += alignment * 0.3;
      
      // Bonus for downbeats (every 4th beat in 4/4 time)
      const beatNumber = Math.round(beatTime / beatInterval);
      if (tempo.timeSignature && tempo.timeSignature.numerator === 4) {
        if (beatNumber % 4 === 0) {
          score += 0.2; // Downbeat bonus
        } else if (beatNumber % 2 === 0) {
          score += 0.1; // Backbeat bonus
        }
      }
    }
    
    // Consider local prominence
    const localProminence = BeatSelector.calculateLocalProminence(beat, allBeats);
    score += localProminence * 0.2;
    
    return Math.min(1.0, score);
  }

  /**
   * Calculate contextual score based on surrounding beats
   */
  private static calculateContextScore(
    beat: Beat,
    allBeats: Beat[],
    index: number
  ): number {
    let score = 0.5;
    
    // Bonus for beats with strong neighbors
    const windowSize = 3;
    const start = Math.max(0, index - windowSize);
    const end = Math.min(allBeats.length, index + windowSize + 1);
    
    let neighborStrength = 0;
    let neighborCount = 0;
    
    for (let i = start; i < end; i++) {
      if (i !== index) {
        neighborStrength += allBeats[i].strength;
        neighborCount++;
      }
    }
    
    if (neighborCount > 0) {
      const avgNeighborStrength = neighborStrength / neighborCount;
      if (avgNeighborStrength > beat.strength) {
        score += 0.2; // Bonus for being in a strong region
      }
    }
    
    // Penalize isolated beats
    const isolation = BeatSelector.calculateIsolation(beat, allBeats);
    score -= isolation * 0.3;
    
    return Math.max(0, Math.min(1.0, score));
  }

  /**
   * Calculate local prominence of a beat
   */
  private static calculateLocalProminence(
    beat: Beat,
    allBeats: Beat[]
  ): number {
    const windowMs = 1000; // 1 second window
    const localBeats = allBeats.filter(b => 
      Math.abs(b.timestamp - beat.timestamp) <= windowMs
    );
    
    if (localBeats.length <= 1) return 1.0;
    
    const maxLocalStrength = Math.max(...localBeats.map(b => b.strength));
    return maxLocalStrength > 0 ? beat.strength / maxLocalStrength : 0;
  }

  /**
   * Calculate beat isolation (higher = more isolated)
   */
  private static calculateIsolation(
    beat: Beat,
    allBeats: Beat[]
  ): number {
    const windowMs = 500; // 500ms window
    const nearbyBeats = allBeats.filter(b => 
      b !== beat && Math.abs(b.timestamp - beat.timestamp) <= windowMs
    );
    
    // More nearby beats = less isolation
    const maxNearby = 5;
    return Math.max(0, 1 - nearbyBeats.length / maxNearby);
  }

  /**
   * Score beats for musical importance
   */
  private static scoreBeatsMusically(
    beats: Beat[],
    tempo?: Tempo
  ): Array<{ beat: Beat; musicalScore: number }> {
    return beats.map(beat => ({
      beat,
      musicalScore: BeatSelector.calculateMusicalScore(beat, beats, tempo)
    }));
  }

  /**
   * Dynamic programming selection for optimal beat distribution
   */
  private static dynamicProgrammingSelection(
    scoredBeats: BeatScore[],
    count: number
  ): Beat[] {
    if (scoredBeats.length <= count) {
      return scoredBeats.map(sb => sb.beat);
    }
    
    // Sort by timestamp for DP
    const sorted = [...scoredBeats].sort((a, b) => 
      a.beat.timestamp - b.beat.timestamp
    );
    
    const n = sorted.length;
    const minSpacing = BeatSelector.calculateMinimumSpacing(sorted);
    
    // DP table: dp[i][j] = max score using first i beats and selecting j beats
    const dp = Array(n + 1).fill(null).map(() => Array(count + 1).fill(-Infinity));
    const backtrack = Array(n + 1).fill(null).map(() => Array(count + 1).fill(null));
    
    // Base cases
    for (let i = 0; i <= n; i++) {
      dp[i][0] = 0;
    }
    
    // Fill DP table
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= Math.min(i, count); j++) {
        const currentBeat = sorted[i - 1];
        
        // Option 1: Don't select current beat
        if (dp[i - 1][j] > dp[i][j]) {
          dp[i][j] = dp[i - 1][j];
          backtrack[i][j] = { from: [i - 1, j], selected: false };
        }
        
        // Option 2: Select current beat (if spacing allows)
        for (let k = i - 2; k >= 0; k--) {
          const prevBeat = sorted[k];
          const spacing = currentBeat.beat.timestamp - prevBeat.beat.timestamp;
          
          if (spacing >= minSpacing && dp[k][j - 1] !== -Infinity) {
            const newScore = dp[k][j - 1] + currentBeat.totalScore;
            
            if (newScore > dp[i][j]) {
              dp[i][j] = newScore;
              backtrack[i][j] = { from: [k, j - 1], selected: true };
            }
            break; // Only consider the most recent valid previous beat
          }
        }
      }
    }
    
    // Backtrack to find solution
    const selected: Beat[] = [];
    let i = n, j = count;
    
    while (i > 0 && j > 0 && backtrack[i][j]) {
      const bt = backtrack[i][j];
      if (bt.selected) {
        selected.unshift(sorted[i - 1].beat);
        j--;
      }
      i = bt.from[0];
      j = bt.from[1];
    }
    
    // If we couldn't select enough beats with DP, fall back to top scores
    if (selected.length < count) {
      const remaining = count - selected.length;
      const unused = scoredBeats
        .filter(sb => !selected.includes(sb.beat))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, remaining)
        .map(sb => sb.beat);
      
      selected.push(...unused);
    }
    
    return selected;
  }

  /**
   * Calculate minimum spacing between selected beats
   */
  private static calculateMinimumSpacing(scoredBeats: BeatScore[]): number {
    if (scoredBeats.length <= 1) return 0;
    
    // Calculate average interval and use a fraction as minimum spacing
    const intervals: number[] = [];
    for (let i = 1; i < scoredBeats.length; i++) {
      const interval = scoredBeats[i].beat.timestamp - scoredBeats[i - 1].beat.timestamp;
      intervals.push(interval);
    }
    
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    return avgInterval * 0.3; // Minimum 30% of average interval
  }

  /**
   * Find the beat closest to target time
   */
  private static findClosestBeat(beats: Beat[], targetTime: number): Beat | null {
    if (beats.length === 0) return null;
    
    let closest = beats[0];
    if (!closest) return null;
    
    let minDistance = Math.abs(closest.timestamp - targetTime);
    
    for (let i = 1; i < beats.length; i++) {
      const beat = beats[i];
      if (!beat) continue;
      
      const distance = Math.abs(beat.timestamp - targetTime);
      if (distance < minDistance) {
        minDistance = distance;
        closest = beat;
      }
    }
    
    return closest;
  }

  /**
   * Analyze beat selection quality
   */
  static analyzeSelection(
    selectedBeats: Beat[],
    allBeats: Beat[],
    audioDuration?: number
  ): {
    coverage: number; // How well beats cover the audio duration
    diversity: number; // Variety in beat strengths
    spacing: number; // How evenly spaced beats are
    quality: number; // Overall quality score
  } {
    if (selectedBeats.length === 0) {
      return { coverage: 0, diversity: 0, spacing: 0, quality: 0 };
    }
    
    // Coverage analysis
    let coverage = 1.0;
    if (audioDuration && audioDuration > 0) {
      const firstBeat = Math.min(...selectedBeats.map(b => b.timestamp));
      const lastBeat = Math.max(...selectedBeats.map(b => b.timestamp));
      const spanCovered = (lastBeat - firstBeat) / 1000; // Convert to seconds
      coverage = Math.min(1.0, spanCovered / audioDuration);
    }
    
    // Diversity analysis
    const strengths = selectedBeats.map(b => b.strength);
    const minStrength = Math.min(...strengths);
    const maxStrength = Math.max(...strengths);
    const diversity = maxStrength > 0 ? 1 - (maxStrength - minStrength) / maxStrength : 0;
    
    // Spacing analysis
    let spacing = 1.0;
    if (selectedBeats.length > 1) {
      const sortedBeats = [...selectedBeats].sort((a, b) => a.timestamp - b.timestamp);
      const intervals = [];
      
      for (let i = 1; i < sortedBeats.length; i++) {
        intervals.push(sortedBeats[i].timestamp - sortedBeats[i - 1].timestamp);
      }
      
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const variance = intervals.reduce((sum, val) => {
        const diff = val - avgInterval;
        return sum + diff * diff;
      }, 0) / intervals.length;
      
      const stdDev = Math.sqrt(variance);
      spacing = avgInterval > 0 ? Math.max(0, 1 - stdDev / avgInterval) : 0;
    }
    
    // Overall quality
    const quality = (coverage + diversity + spacing) / 3;
    
    return { coverage, diversity, spacing, quality };
  }

  /**
   * Convert Beat objects to BeatResult objects with enhanced metadata
   */
  private static convertToBeatResults(
    beats: Beat[],
    tempo?: Tempo
  ): BeatResult[] {
    return beats.map((beat, index) => {
      const result: BeatResult = {
        timestamp: beat.timestamp,
        confidence: beat.confidence,
        strength: beat.strength,
        type: BeatSelector.classifyBeatType(beat, beats, index, tempo),
        metadata: {
          detectionScore: beat.strength * beat.confidence,
          ...beat.metadata
        }
      };

      // Add tempo-based metadata if available
      if (tempo) {
        const beatInterval = 60000 / tempo.bpm; // milliseconds
        const beatNumber = Math.round(beat.timestamp / beatInterval);
        
        result.metadata!.expectedTime = beatNumber * beatInterval;
        result.metadata!.timingDeviation = beat.timestamp - result.metadata!.expectedTime;
        result.metadata!.beatNumber = (beatNumber % (tempo.timeSignature?.numerator || 4)) + 1;
        result.metadata!.measureNumber = Math.floor(beatNumber / (tempo.timeSignature?.numerator || 4)) + 1;
        result.metadata!.beatPhase = (beat.timestamp % beatInterval) / beatInterval;
      }

      return result;
    });
  }

  /**
   * Classify beat type based on context and tempo
   */
  private static classifyBeatType(
    beat: Beat,
    allBeats: Beat[],
    index: number,
    tempo?: Tempo
  ): BeatResult['type'] {
    if (!tempo) return undefined;

    const beatInterval = 60000 / tempo.bpm;
    const beatNumber = Math.round(beat.timestamp / beatInterval);
    const numerator = tempo.timeSignature?.numerator || 4;

    // Classify based on position in measure
    const beatInMeasure = beatNumber % numerator;
    
    if (beatInMeasure === 0) {
      return 'downbeat';
    } else if (numerator === 4 && beatInMeasure === 2) {
      return 'beat'; // Strong beat in 4/4
    } else if (beatInMeasure % 2 === 0) {
      return 'beat';
    } else {
      // Check if it's syncopated (strong beat on weak position)
      const expectedStrength = BeatSelector.getExpectedStrengthForPosition(beatInMeasure, numerator);
      if (beat.strength > expectedStrength * 1.5) {
        return 'syncopated';
      }
      return 'offbeat';
    }
  }

  /**
   * Get expected strength for beat position in measure
   */
  private static getExpectedStrengthForPosition(
    beatInMeasure: number,
    numerator: number
  ): number {
    if (beatInMeasure === 0) return 1.0; // Downbeat strongest
    if (numerator === 4 && beatInMeasure === 2) return 0.8; // Backbeat strong
    if (beatInMeasure % 2 === 0) return 0.6; // On-beats medium
    return 0.4; // Off-beats weakest
  }

  /**
   * Handle edge case where N > detected beats
   */
  static handleInsufficientBeats(
    availableBeats: Beat[],
    requestedCount: number,
    audioDuration?: number,
    tempo?: Tempo
  ): BeatResult[] {
    if (availableBeats.length >= requestedCount) {
      return BeatSelector.convertToBeatResults(availableBeats.slice(0, requestedCount), tempo);
    }

    // If we don't have enough beats, we can either:
    // 1. Return all available beats
    // 2. Interpolate additional beats based on tempo
    // 3. Generate synthetic beats at regular intervals
    
    const result = [...availableBeats];
    const needed = requestedCount - availableBeats.length;
    
    if (tempo && audioDuration && needed > 0) {
      // Generate synthetic beats based on tempo
      const beatInterval = 60000 / tempo.bpm;
      const syntheticBeats = BeatSelector.generateSyntheticBeats(
        availableBeats,
        needed,
        beatInterval,
        audioDuration
      );
      result.push(...syntheticBeats);
    }
    
    return BeatSelector.convertToBeatResults(
      result.sort((a, b) => a.timestamp - b.timestamp).slice(0, requestedCount),
      tempo
    );
  }

  /**
   * Generate synthetic beats to fill gaps
   */
  private static generateSyntheticBeats(
    existingBeats: Beat[],
    count: number,
    beatInterval: number,
    audioDuration: number
  ): Beat[] {
    const synthetic: Beat[] = [];
    const maxTime = audioDuration * 1000; // Convert to milliseconds
    const avgStrength = existingBeats.length > 0 
      ? existingBeats.reduce((sum, b) => sum + b.strength, 0) / existingBeats.length 
      : 0.5;
    const avgConfidence = existingBeats.length > 0 
      ? existingBeats.reduce((sum, b) => sum + b.confidence, 0) / existingBeats.length 
      : 0.6;

    // Find gaps in the beat grid where we can place synthetic beats
    const expectedBeats = Math.floor(maxTime / beatInterval);
    const taken = new Set(existingBeats.map(b => Math.round(b.timestamp / beatInterval)));
    
    for (let i = 0; i < expectedBeats && synthetic.length < count; i++) {
      if (!taken.has(i)) {
        synthetic.push({
          timestamp: i * beatInterval,
          strength: avgStrength * 0.7, // Slightly lower strength for synthetic
          confidence: avgConfidence * 0.5, // Lower confidence for synthetic
          metadata: {
            interpolated: true,
            synthetic: true
          }
        });
      }
    }

    return synthetic.slice(0, count);
  }

  /**
   * Get selection statistics for analysis
   */
  static getSelectionStatistics(
    result: SelectionResult
  ): {
    totalSelected: number;
    averageConfidence: number;
    averageStrength: number;
    temporalSpread: number;
    qualityScore: number;
  } {
    const beats = result.beats;
    
    if (beats.length === 0) {
      return {
        totalSelected: 0,
        averageConfidence: 0,
        averageStrength: 0,
        temporalSpread: 0,
        qualityScore: 0
      };
    }

    const avgConfidence = beats.reduce((sum, b) => sum + b.confidence, 0) / beats.length;
    const avgStrength = beats.reduce((sum, b) => sum + b.strength, 0) / beats.length;
    
    const timestamps = beats.map(b => b.timestamp);
    const temporalSpread = Math.max(...timestamps) - Math.min(...timestamps);
    
    return {
      totalSelected: beats.length,
      averageConfidence: avgConfidence,
      averageStrength: avgStrength,
      temporalSpread,
      qualityScore: result.quality.overall
    };
  }

  /**
   * Validate selection configuration
   */
  static validateConfig(config: Partial<BeatSelectorConfig>): string[] {
    const errors: string[] = [];
    
    if (config.count !== undefined) {
      if (!Number.isInteger(config.count) || config.count < 1) {
        errors.push('count must be a positive integer');
      }
    }
    
    const weights = ['energyWeight', 'regularityWeight', 'musicalWeight'] as const;
    for (const weight of weights) {
      if (config[weight] !== undefined) {
        if (typeof config[weight] !== 'number' || 
            config[weight]! < 0 || config[weight]! > 1) {
          errors.push(`${weight} must be a number between 0 and 1`);
        }
      }
    }
    
    if (config.minSpacing !== undefined) {
      if (typeof config.minSpacing !== 'number' || config.minSpacing < 0) {
        errors.push('minSpacing must be a non-negative number');
      }
    }
    
    if (config.audioDuration !== undefined) {
      if (typeof config.audioDuration !== 'number' || config.audioDuration <= 0) {
        errors.push('audioDuration must be a positive number');
      }
    }
    
    const validStrategies = ['energy', 'regular', 'musical', 'adaptive'];
    if (config.strategy && !validStrategies.includes(config.strategy)) {
      errors.push(`strategy must be one of: ${validStrategies.join(', ')}`);
    }
    
    return errors;
  }

  /**
   * Get available selection strategies with descriptions
   */
  static getAvailableStrategies(): Record<string, string> {
    return {
      energy: 'Select beats with highest energy/strength values',
      regular: 'Distribute beats evenly across time duration',
      musical: 'Select beats based on musical/rhythmic importance',
      adaptive: 'Combine multiple approaches using weighted scoring and dynamic programming'
    };
  }
}