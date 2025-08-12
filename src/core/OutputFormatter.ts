/**
 * OutputFormatter - Comprehensive result formatting system
 * Formats beat parsing results into various output formats with 
 * configurable precision, metadata inclusion, and structure
 */

import type { 
  Beat, 
  BeatResult,
  Tempo, 
  ParseResult, 
  OutputFormat,
  ParsedBeatsOutput 
} from '../types';

export interface FormattedBeat {
  timestamp: number;
  confidence?: number;
  strength?: number;
  metadata?: Record<string, unknown>;
}

export interface FormattedTempo {
  bpm: number;
  confidence?: number;
  timeSignature?: {
    numerator: number;
    denominator: number;
  };
}

export interface FormattedResult {
  beats: FormattedBeat[];
  tempo?: FormattedTempo;
  metadata?: {
    processingTime: number;
    samplesProcessed: number;
    parameters: Record<string, unknown>;
    analysis?: {
      totalBeatsDetected: number;
      beatsSelected: number;
      averageConfidence: number;
      averageStrength: number;
      beatDensity: number; // beats per second
      qualityScore: number;
    };
  };
  version: string;
  timestamp: string;
}

export class OutputFormatter {
  private static readonly DEFAULT_FORMAT: Required<OutputFormat> = {
    includeConfidence: true,
    includeStrength: true,
    includeMetadata: true,
    precision: 3
  };

  private static readonly VERSION = '2.0.0';

  /**
   * Main format method - formats ParseResult into the specified output format
   */
  format(
    result: ParseResult,
    selectedBeats?: BeatResult[],
    format: OutputFormat = {}
  ): ParsedBeatsOutput {
    return OutputFormatter.formatToParsedBeatsOutput(result, selectedBeats, format);
  }

  /**
   * Static format method for direct access
   */
  static format(
    result: ParseResult,
    selectedBeats?: BeatResult[],
    format: OutputFormat = {}
  ): ParsedBeatsOutput {
    return OutputFormatter.formatToParsedBeatsOutput(result, selectedBeats, format);
  }

  /**
   * Format complete parse result as ParsedBeatsOutput
   */
  static formatToParsedBeatsOutput(
    result: ParseResult,
    selectedBeats?: BeatResult[],
    format: OutputFormat = {}
  ): ParsedBeatsOutput {
    const config = { ...OutputFormatter.DEFAULT_FORMAT, ...format };
    const startTime = Date.now();
    
    const output: ParsedBeatsOutput = {
      beats: selectedBeats || OutputFormatter.convertBeatsToResults(result.beats),
      version: OutputFormatter.VERSION,
      timestamp: new Date().toISOString(),
      metadata: {
        processingTime: result.metadata.processingTime,
        samplesProcessed: result.metadata.samplesProcessed,
        parameters: result.metadata.parameters as Record<string, unknown>,
        ...OutputFormatter.generateProcessingMetadata(result, selectedBeats, config)
      }
    };

    // Add tempo if available
    if (result.tempo) {
      output.tempo = {
        bpm: OutputFormatter.roundToPrecision(result.tempo.bpm, config.precision),
        confidence: config.includeConfidence ? 
          OutputFormatter.roundToPrecision(result.tempo.confidence, config.precision) : undefined,
        timeSignature: result.tempo.timeSignature,
        metadata: result.tempo.metadata
      };
    }

    return output;
  }

  /**
   * Format complete parse result (legacy method)
   */
  static formatResult(
    result: ParseResult,
    selectedBeats?: Beat[],
    format: OutputFormat = {},
    version = '1.0.0'
  ): FormattedResult {
    const config = { ...OutputFormatter.DEFAULT_FORMAT, ...format };
    
    const formattedResult: FormattedResult = {
      beats: OutputFormatter.formatBeats(selectedBeats || result.beats, config),
      version,
      timestamp: new Date().toISOString()
    };
    
    // Add tempo if available
    if (result.tempo) {
      formattedResult.tempo = OutputFormatter.formatTempo(result.tempo, config);
    }
    
    // Add metadata if requested
    if (config.includeMetadata) {
      formattedResult.metadata = OutputFormatter.formatMetadata(
        result.metadata, 
        result.beats,
        config,
        selectedBeats
      );
    }
    
    return formattedResult;
  }

  /**
   * Format beats array
   */
  static formatBeats(
    beats: Beat[],
    config: Required<OutputFormat>
  ): FormattedBeat[] {
    return beats.map(beat => OutputFormatter.formatSingleBeat(beat, config));
  }

  /**
   * Format single beat
   */
  static formatSingleBeat(
    beat: Beat,
    config: Required<OutputFormat>
  ): FormattedBeat {
    const formatted: FormattedBeat = {
      timestamp: OutputFormatter.roundToPrecision(beat.timestamp, config.precision)
    };
    
    if (config.includeConfidence) {
      formatted.confidence = OutputFormatter.roundToPrecision(beat.confidence, config.precision);
    }
    
    if (config.includeStrength) {
      formatted.strength = OutputFormatter.roundToPrecision(beat.strength, config.precision);
    }
    
    if (beat.metadata && Object.keys(beat.metadata).length > 0) {
      formatted.metadata = beat.metadata;
    }
    
    return formatted;
  }

  /**
   * Format tempo information
   */
  static formatTempo(
    tempo: Tempo,
    config: Required<OutputFormat>
  ): FormattedTempo {
    const formatted: FormattedTempo = {
      bpm: OutputFormatter.roundToPrecision(tempo.bpm, config.precision)
    };
    
    if (config.includeConfidence) {
      formatted.confidence = OutputFormatter.roundToPrecision(tempo.confidence, config.precision);
    }
    
    if (tempo.timeSignature) {
      formatted.timeSignature = tempo.timeSignature;
    }
    
    return formatted;
  }

  /**
   * Format metadata with analysis results
   */
  static formatMetadata(
    originalMetadata: ParseResult['metadata'],
    allBeats: Beat[],
    config: Required<OutputFormat>,
    selectedBeats?: Beat[]
  ): FormattedResult['metadata'] {
    const metadata: FormattedResult['metadata'] = {
      processingTime: originalMetadata.processingTime,
      samplesProcessed: originalMetadata.samplesProcessed,
      parameters: originalMetadata.parameters as Record<string, unknown>
    };
    
    // Add analysis if we have beat data
    if (allBeats.length > 0) {
      const analysis = OutputFormatter.analyzeBeats(allBeats, selectedBeats, config);
      metadata.analysis = analysis;
    }
    
    return metadata;
  }

  /**
   * Analyze beat data for metadata
   */
  private static analyzeBeats(
    allBeats: Beat[],
    selectedBeats: Beat[] | undefined,
    config: Required<OutputFormat>
  ): NonNullable<FormattedResult['metadata']>['analysis'] {
    const beatsToAnalyze = selectedBeats || allBeats;
    
    // Calculate statistics
    const totalConfidence = beatsToAnalyze.reduce((sum, b) => sum + b.confidence, 0);
    const totalStrength = beatsToAnalyze.reduce((sum, b) => sum + b.strength, 0);
    const averageConfidence = beatsToAnalyze.length > 0 ? totalConfidence / beatsToAnalyze.length : 0;
    const averageStrength = beatsToAnalyze.length > 0 ? totalStrength / beatsToAnalyze.length : 0;
    
    // Calculate beat density (beats per second)
    let beatDensity = 0;
    if (beatsToAnalyze.length > 1) {
      const sortedBeats = [...beatsToAnalyze].sort((a, b) => a.timestamp - b.timestamp);
      const duration = (sortedBeats[sortedBeats.length - 1].timestamp - sortedBeats[0].timestamp) / 1000;
      beatDensity = duration > 0 ? beatsToAnalyze.length / duration : 0;
    }
    
    // Calculate quality score
    const qualityScore = OutputFormatter.calculateQualityScore(beatsToAnalyze);
    
    return {
      totalBeatsDetected: allBeats.length,
      beatsSelected: beatsToAnalyze.length,
      averageConfidence: OutputFormatter.roundToPrecision(averageConfidence, config.precision),
      averageStrength: OutputFormatter.roundToPrecision(averageStrength, config.precision),
      beatDensity: OutputFormatter.roundToPrecision(beatDensity, config.precision),
      qualityScore: OutputFormatter.roundToPrecision(qualityScore, config.precision)
    };
  }

  /**
   * Calculate overall quality score for beat selection
   */
  private static calculateQualityScore(beats: Beat[]): number {
    if (beats.length === 0) return 0;
    
    let score = 0;
    let factors = 0;
    
    // Factor 1: Average confidence
    const avgConfidence = beats.reduce((sum, b) => sum + b.confidence, 0) / beats.length;
    score += avgConfidence * 0.3;
    factors++;
    
    // Factor 2: Consistency of spacing (for timing regularity)
    if (beats.length > 2) {
      const sortedBeats = [...beats].sort((a, b) => a.timestamp - b.timestamp);
      const intervals: number[] = [];
      
      for (let i = 1; i < sortedBeats.length; i++) {
        intervals.push(sortedBeats[i].timestamp - sortedBeats[i - 1].timestamp);
      }
      
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      let variance = 0;
      
      for (const interval of intervals) {
        const diff = interval - avgInterval;
        variance += diff * diff;
      }
      
      variance /= intervals.length;
      const stdDev = Math.sqrt(variance);
      const consistency = avgInterval > 0 ? Math.max(0, 1 - stdDev / avgInterval) : 0;
      
      score += consistency * 0.4;
      factors++;
    }
    
    // Factor 3: Strength distribution (prefer varied but generally strong beats)
    const strengths = beats.map(b => b.strength);
    const maxStrength = Math.max(...strengths);
    const minStrength = Math.min(...strengths);
    const avgStrength = strengths.reduce((sum, val) => sum + val, 0) / strengths.length;
    
    // Normalize average strength
    const strengthScore = maxStrength > 0 ? avgStrength / maxStrength : 0;
    
    // Bonus for having some variation (not all beats the same strength)
    const variation = maxStrength > 0 ? (maxStrength - minStrength) / maxStrength : 0;
    const variationBonus = Math.min(0.2, variation * 0.5);
    
    score += (strengthScore + variationBonus) * 0.3;
    factors++;
    
    return factors > 0 ? score / factors : 0;
  }

  /**
   * Export to JSON string with formatting
   */
  static toJSON(
    result: FormattedResult,
    pretty = false
  ): string {
    if (pretty) {
      return JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result);
  }

  /**
   * Export to CSV format
   */
  static toCSV(
    beats: FormattedBeat[],
    includeHeaders = true
  ): string {
    if (beats.length === 0) {
      return includeHeaders ? 'timestamp,confidence,strength\n' : '';
    }
    
    let csv = '';
    
    // Add headers
    if (includeHeaders) {
      const headers = ['timestamp'];
      if (beats[0].confidence !== undefined) headers.push('confidence');
      if (beats[0].strength !== undefined) headers.push('strength');
      csv += headers.join(',') + '\n';
    }
    
    // Add data rows
    for (const beat of beats) {
      const row = [beat.timestamp.toString()];
      if (beat.confidence !== undefined) row.push(beat.confidence.toString());
      if (beat.strength !== undefined) row.push(beat.strength.toString());
      csv += row.join(',') + '\n';
    }
    
    return csv;
  }

  /**
   * Export to MIDI-style format (time in ticks)
   */
  static toMIDITicks(
    beats: FormattedBeat[],
    ticksPerQuarterNote = 480,
    bpm = 120
  ): Array<{ tick: number; velocity: number }> {
    const msPerTick = (60000 / bpm / ticksPerQuarterNote);
    
    return beats.map(beat => ({
      tick: Math.round(beat.timestamp / msPerTick),
      velocity: Math.round((beat.strength || 0.5) * 127) // Convert to MIDI velocity
    }));
  }

  /**
   * Export beats as audio click track timestamps
   */
  static toClickTrack(
    beats: FormattedBeat[],
    sampleRate = 44100
  ): number[] {
    return beats.map(beat => Math.round(beat.timestamp * sampleRate / 1000));
  }

  /**
   * Create summary statistics
   */
  static createSummary(result: FormattedResult): {
    beatCount: number;
    duration: number; // in seconds
    averageBPM: number;
    confidence: {
      min: number;
      max: number;
      average: number;
    };
    strength: {
      min: number;
      max: number;
      average: number;
    };
  } {
    const beats = result.beats;
    
    if (beats.length === 0) {
      return {
        beatCount: 0,
        duration: 0,
        averageBPM: 0,
        confidence: { min: 0, max: 0, average: 0 },
        strength: { min: 0, max: 0, average: 0 }
      };
    }
    
    // Calculate duration
    const timestamps = beats.map(b => b.timestamp);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const duration = (maxTime - minTime) / 1000; // Convert to seconds
    
    // Calculate average BPM from beat intervals
    let averageBPM = 0;
    if (beats.length > 1 && duration > 0) {
      averageBPM = (beats.length - 1) / duration * 60; // beats per minute
    } else if (result.tempo) {
      averageBPM = result.tempo.bpm;
    }
    
    // Calculate confidence stats
    const confidences = beats
      .map(b => b.confidence)
      .filter((c): c is number => c !== undefined);
    
    const confidence = confidences.length > 0 ? {
      min: Math.min(...confidences),
      max: Math.max(...confidences),
      average: confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    } : { min: 0, max: 0, average: 0 };
    
    // Calculate strength stats
    const strengths = beats
      .map(b => b.strength)
      .filter((s): s is number => s !== undefined);
    
    const strength = strengths.length > 0 ? {
      min: Math.min(...strengths),
      max: Math.max(...strengths),
      average: strengths.reduce((sum, s) => sum + s, 0) / strengths.length
    } : { min: 0, max: 0, average: 0 };
    
    return {
      beatCount: beats.length,
      duration,
      averageBPM,
      confidence,
      strength
    };
  }

  /**
   * Validate formatted result structure
   */
  static validateResult(result: unknown): result is FormattedResult {
    if (!result || typeof result !== 'object') return false;
    
    const r = result as Record<string, unknown>;
    
    // Check required fields
    if (!Array.isArray(r.beats)) return false;
    if (typeof r.version !== 'string') return false;
    if (typeof r.timestamp !== 'string') return false;
    
    // Validate beats array
    for (const beat of r.beats) {
      if (!OutputFormatter.validateBeat(beat)) return false;
    }
    
    // Validate tempo if present
    if (r.tempo !== undefined && !OutputFormatter.validateTempo(r.tempo)) {
      return false;
    }
    
    return true;
  }

  /**
   * Validate single beat structure
   */
  private static validateBeat(beat: unknown): beat is FormattedBeat {
    if (!beat || typeof beat !== 'object') return false;
    
    const b = beat as Record<string, unknown>;
    
    // Check required timestamp
    if (typeof b.timestamp !== 'number' || !isFinite(b.timestamp)) {
      return false;
    }
    
    // Check optional fields
    if (b.confidence !== undefined && 
        (typeof b.confidence !== 'number' || !isFinite(b.confidence))) {
      return false;
    }
    
    if (b.strength !== undefined && 
        (typeof b.strength !== 'number' || !isFinite(b.strength))) {
      return false;
    }
    
    return true;
  }

  /**
   * Validate tempo structure
   */
  private static validateTempo(tempo: unknown): tempo is FormattedTempo {
    if (!tempo || typeof tempo !== 'object') return false;
    
    const t = tempo as Record<string, unknown>;
    
    // Check required BPM
    if (typeof t.bpm !== 'number' || !isFinite(t.bpm) || t.bpm <= 0) {
      return false;
    }
    
    // Check optional confidence
    if (t.confidence !== undefined && 
        (typeof t.confidence !== 'number' || !isFinite(t.confidence))) {
      return false;
    }
    
    return true;
  }

  /**
   * Convert Beat objects to BeatResult objects
   */
  private static convertBeatsToResults(beats: Beat[]): BeatResult[] {
    return beats.map(beat => ({
      timestamp: beat.timestamp,
      confidence: beat.confidence,
      strength: beat.strength,
      metadata: beat.metadata
    }));
  }

  /**
   * Generate comprehensive processing metadata
   */
  private static generateProcessingMetadata(
    result: ParseResult,
    selectedBeats?: BeatResult[],
    config?: Required<OutputFormat>
  ): Partial<ParsedBeatsOutput['metadata']> {
    const allBeats = result.beats;
    const outputBeats = selectedBeats || OutputFormatter.convertBeatsToResults(allBeats);
    
    const metadata: Partial<ParsedBeatsOutput['metadata']> = {};

    // Beat analysis statistics
    if (outputBeats.length > 0) {
      const totalConfidence = outputBeats.reduce((sum, b) => sum + b.confidence, 0);
      const totalStrength = outputBeats.reduce((sum, b) => sum + b.strength, 0);
      const averageConfidence = totalConfidence / outputBeats.length;
      const averageStrength = totalStrength / outputBeats.length;
      
      // Calculate beat density
      let beatDensity = 0;
      if (outputBeats.length > 1) {
        const sortedBeats = [...outputBeats].sort((a, b) => a.timestamp - b.timestamp);
        const duration = (sortedBeats[sortedBeats.length - 1].timestamp - sortedBeats[0].timestamp) / 1000;
        beatDensity = duration > 0 ? outputBeats.length / duration : 0;
      }

      const qualityScore = OutputFormatter.calculateAdvancedQualityScore(outputBeats);

      metadata.analysis = {
        totalBeatsDetected: allBeats.length,
        beatsSelected: outputBeats.length,
        averageConfidence: config ? OutputFormatter.roundToPrecision(averageConfidence, config.precision) : averageConfidence,
        averageStrength: config ? OutputFormatter.roundToPrecision(averageStrength, config.precision) : averageStrength,
        beatDensity: config ? OutputFormatter.roundToPrecision(beatDensity, config.precision) : beatDensity,
        qualityScore: config ? OutputFormatter.roundToPrecision(qualityScore, config.precision) : qualityScore
      };
    }

    // Performance metrics
    metadata.performance = {
      memoryUsage: OutputFormatter.getMemoryUsage(),
      efficiency: OutputFormatter.calculateProcessingEfficiency(result.metadata.processingTime, allBeats.length)
    };

    // Algorithm versions
    metadata.algorithmVersions = {
      beatSelector: '2.0.0',
      outputFormatter: OutputFormatter.VERSION
    };

    return metadata;
  }

  /**
   * Calculate advanced quality score considering multiple factors
   */
  private static calculateAdvancedQualityScore(beats: BeatResult[]): number {
    if (beats.length === 0) return 0;
    
    let score = 0;
    let factors = 0;
    
    // Factor 1: Average confidence (weighted 30%)
    const avgConfidence = beats.reduce((sum, b) => sum + b.confidence, 0) / beats.length;
    score += avgConfidence * 0.3;
    factors++;
    
    // Factor 2: Beat type distribution (weighted 20%)
    const typeDistribution = OutputFormatter.analyzeBeatTypeDistribution(beats);
    score += typeDistribution * 0.2;
    factors++;
    
    // Factor 3: Timing consistency (weighted 25%)
    if (beats.length > 2) {
      const timingConsistency = OutputFormatter.calculateTimingConsistency(beats);
      score += timingConsistency * 0.25;
      factors++;
    }
    
    // Factor 4: Strength quality (weighted 25%)
    const strengthQuality = OutputFormatter.calculateStrengthQuality(beats);
    score += strengthQuality * 0.25;
    factors++;
    
    return factors > 0 ? score / factors : 0;
  }

  /**
   * Analyze beat type distribution for quality scoring
   */
  private static analyzeBeatTypeDistribution(beats: BeatResult[]): number {
    if (beats.length === 0) return 0;
    
    const typeCounts = beats.reduce((acc, beat) => {
      const type = beat.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const totalBeats = beats.length;
    let distributionScore = 0.5; // Base score
    
    // Bonus for having downbeats (strong rhythmic foundation)
    if (typeCounts.downbeat) {
      distributionScore += Math.min(0.3, (typeCounts.downbeat / totalBeats) * 1.5);
    }
    
    // Small bonus for beat type diversity
    const uniqueTypes = Object.keys(typeCounts).length;
    if (uniqueTypes > 1) {
      distributionScore += Math.min(0.2, uniqueTypes * 0.05);
    }
    
    return Math.min(1.0, distributionScore);
  }

  /**
   * Calculate timing consistency score
   */
  private static calculateTimingConsistency(beats: BeatResult[]): number {
    if (beats.length < 3) return 1.0;
    
    const sortedBeats = [...beats].sort((a, b) => a.timestamp - b.timestamp);
    const intervals: number[] = [];
    
    for (let i = 1; i < sortedBeats.length; i++) {
      intervals.push(sortedBeats[i].timestamp - sortedBeats[i - 1].timestamp);
    }
    
    if (intervals.length === 0) return 1.0;
    
    // Calculate coefficient of variation (std dev / mean)
    const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => {
      const diff = val - mean;
      return sum + diff * diff;
    }, 0) / intervals.length;
    
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
    
    // Lower coefficient of variation = higher consistency
    return Math.max(0, 1 - coefficientOfVariation);
  }

  /**
   * Calculate strength quality score
   */
  private static calculateStrengthQuality(beats: BeatResult[]): number {
    if (beats.length === 0) return 0;
    
    const strengths = beats.map(b => b.strength);
    const avgStrength = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
    const maxStrength = Math.max(...strengths);
    const minStrength = Math.min(...strengths);
    
    // Normalize average strength (higher is better)
    const normalizedAvg = maxStrength > 0 ? avgStrength / maxStrength : 0;
    
    // Calculate dynamic range (some variation is good)
    const dynamicRange = maxStrength > 0 ? (maxStrength - minStrength) / maxStrength : 0;
    const rangeBonus = Math.min(0.3, dynamicRange * 0.5);
    
    return Math.min(1.0, normalizedAvg * 0.7 + rangeBonus);
  }

  /**
   * Get current memory usage (simplified)
   */
  private static getMemoryUsage(): number | undefined {
    // In a real implementation, this would measure actual memory usage
    // For now, return undefined to indicate not available
    return undefined;
  }

  /**
   * Calculate processing efficiency score
   */
  private static calculateProcessingEfficiency(processingTime: number, beatsProcessed: number): number {
    if (processingTime <= 0 || beatsProcessed <= 0) return 0;
    
    // Efficiency = beats processed per millisecond
    const beatsPerMs = beatsProcessed / processingTime;
    
    // Normalize to a 0-1 score (assuming 1 beat per ms is perfect efficiency)
    return Math.min(1.0, beatsPerMs);
  }

  /**
   * Export to structured JSON with multiple format options
   */
  static toStructuredJSON(
    output: ParsedBeatsOutput,
    format: 'compact' | 'pretty' | 'minimal' = 'pretty'
  ): string {
    switch (format) {
      case 'compact':
        return JSON.stringify(output);
      case 'pretty':
        return JSON.stringify(output, null, 2);
      case 'minimal':
        return JSON.stringify(OutputFormatter.createMinimalOutput(output));
      default:
        return JSON.stringify(output, null, 2);
    }
  }

  /**
   * Create minimal output with only essential information
   */
  private static createMinimalOutput(output: ParsedBeatsOutput): any {
    return {
      beats: output.beats.map(beat => ({
        t: beat.timestamp,
        c: beat.confidence,
        s: beat.strength
      })),
      tempo: output.tempo ? {
        bpm: output.tempo.bpm,
        conf: output.tempo.confidence
      } : undefined,
      meta: {
        count: output.beats.length,
        time: output.metadata.processingTime
      }
    };
  }

  /**
   * Export to XML format
   */
  static toXML(output: ParsedBeatsOutput): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<beatAnalysis version="' + output.version + '" timestamp="' + output.timestamp + '">\n';
    
    // Beats
    xml += '  <beats>\n';
    for (const beat of output.beats) {
      xml += '    <beat timestamp="' + beat.timestamp + 
             '" confidence="' + beat.confidence + 
             '" strength="' + beat.strength + '"';
      if (beat.type) {
        xml += ' type="' + beat.type + '"';
      }
      xml += '/>\n';
    }
    xml += '  </beats>\n';
    
    // Tempo
    if (output.tempo) {
      xml += '  <tempo bpm="' + output.tempo.bpm + 
             '" confidence="' + (output.tempo.confidence || 0) + '"';
      if (output.tempo.timeSignature) {
        xml += ' timeSignature="' + output.tempo.timeSignature.numerator + 
               '/' + output.tempo.timeSignature.denominator + '"';
      }
      xml += '/>\n';
    }
    
    // Metadata
    xml += '  <metadata processingTime="' + output.metadata.processingTime + '"';
    if (output.metadata.analysis) {
      xml += ' totalBeats="' + output.metadata.analysis.totalBeatsDetected + '"';
      xml += ' selectedBeats="' + output.metadata.analysis.beatsSelected + '"';
    }
    xml += '/>\n';
    
    xml += '</beatAnalysis>';
    return xml;
  }

  /**
   * Export to YAML format
   */
  static toYAML(output: ParsedBeatsOutput): string {
    let yaml = `version: "${output.version}"\n`;
    yaml += `timestamp: "${output.timestamp}"\n`;
    yaml += 'beats:\n';
    
    for (const beat of output.beats) {
      yaml += `  - timestamp: ${beat.timestamp}\n`;
      yaml += `    confidence: ${beat.confidence}\n`;
      yaml += `    strength: ${beat.strength}\n`;
      if (beat.type) {
        yaml += `    type: "${beat.type}"\n`;
      }
    }
    
    if (output.tempo) {
      yaml += 'tempo:\n';
      yaml += `  bpm: ${output.tempo.bpm}\n`;
      if (output.tempo.confidence !== undefined) {
        yaml += `  confidence: ${output.tempo.confidence}\n`;
      }
      if (output.tempo.timeSignature) {
        yaml += `  timeSignature: "${output.tempo.timeSignature.numerator}/${output.tempo.timeSignature.denominator}"\n`;
      }
    }
    
    yaml += 'metadata:\n';
    yaml += `  processingTime: ${output.metadata.processingTime}\n`;
    yaml += `  samplesProcessed: ${output.metadata.samplesProcessed}\n`;
    
    return yaml;
  }

  /**
   * Validate output structure
   */
  static validateOutput(output: unknown): output is ParsedBeatsOutput {
    if (!output || typeof output !== 'object') return false;
    
    const o = output as Record<string, unknown>;
    
    // Check required fields
    if (!Array.isArray(o.beats)) return false;
    if (typeof o.version !== 'string') return false;
    if (typeof o.timestamp !== 'string') return false;
    if (!o.metadata || typeof o.metadata !== 'object') return false;
    
    // Validate beats array
    for (const beat of o.beats) {
      if (!OutputFormatter.validateBeatResult(beat)) return false;
    }
    
    return true;
  }

  /**
   * Validate BeatResult structure
   */
  private static validateBeatResult(beat: unknown): beat is BeatResult {
    if (!beat || typeof beat !== 'object') return false;
    
    const b = beat as Record<string, unknown>;
    
    // Check required fields
    if (typeof b.timestamp !== 'number' || !isFinite(b.timestamp)) return false;
    if (typeof b.confidence !== 'number' || !isFinite(b.confidence)) return false;
    if (typeof b.strength !== 'number' || !isFinite(b.strength)) return false;
    
    // Check optional fields
    if (b.type !== undefined && typeof b.type !== 'string') return false;
    
    return true;
  }

  /**
   * Round number to specified precision
   */
  private static roundToPrecision(value: number, precision: number): number {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }
}