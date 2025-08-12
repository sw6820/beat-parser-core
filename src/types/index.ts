/**
 * Type definitions for the beat parser library
 * 
 * This file contains all TypeScript interfaces and types used throughout
 * the beat parser library, including both basic and advanced analysis features.
 */

export interface Beat {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Confidence level (0-1) */
  confidence: number;
  /** Beat strength/amplitude */
  strength: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface Tempo {
  /** Beats per minute */
  bpm: number;
  /** Confidence level (0-1) */
  confidence: number;
  /** Time signature */
  timeSignature?: TimeSignature;
  /** Optional metadata for advanced tempo information */
  metadata?: {
    /** Beat phase offset in seconds */
    phase?: number;
    /** Alternative tempo candidates */
    alternativeTempos?: Array<{ bpm: number; confidence: number }>;
    /** Tempo stability score */
    stability?: number;
    /** Additional metadata fields */
    [key: string]: unknown;
  };
}

export interface TimeSignature {
  /** Number of beats per measure */
  numerator: number;
  /** Note value that gets the beat */
  denominator: number;
}

export interface ParseOptions {
  /** Minimum confidence threshold for beat detection */
  minConfidence?: number;
  /** Window size for analysis in samples */
  windowSize?: number;
  /** Hop size for analysis in samples */
  hopSize?: number;
  /** Sample rate of the audio */
  sampleRate?: number;
  /** Target number of pictures/beats to select */
  targetPictureCount?: number;
  /** Selection method for beats */
  selectionMethod?: 'uniform' | 'adaptive' | 'energy' | 'regular';
  /** Optional filename for metadata */
  filename?: string;
}

export interface ParseResult {
  /** Detected beats */
  beats: Beat[];
  /** Detected tempo */
  tempo?: Tempo;
  /** Processing metadata */
  metadata: {
    /** Processing time in milliseconds */
    processingTime: number;
    /** Number of samples processed */
    samplesProcessed: number;
    /** Analysis parameters used */
    parameters: ParseOptions;
    /** Additional metadata fields */
    [key: string]: unknown;
  };
}

// Error handling interfaces
export interface BeatParsingError extends Error {
  /** Error code */
  code: string;
  /** Error category */
  category: 'input' | 'processing' | 'output' | 'system';
  /** Additional context */
  context?: Record<string, unknown>;
}

// Configuration interfaces
export interface AdvancedParseOptions extends ParseOptions {
  /** Onset detection options */
  onsetOptions?: OnsetDetectionOptions & {
    spectralFlux?: SpectralFluxOptions;
    energy?: EnergyOnsetOptions;
    complexDomain?: ComplexDomainOptions;
    combinationWeights?: OnsetCombinationWeights;
  };
  /** Tempo tracking options */
  tempoOptions?: TempoTrackingOptions & AdvancedTempoOptions;
  /** Beat tracking options */
  beatTrackingOptions?: BeatTrackingOptions;
  /** Enable advanced analysis features */
  enableAdvancedAnalysis?: boolean;
  /** Return detailed analysis results */
  includeAnalysisDetails?: boolean;
}

// Utility type for algorithm configuration
export interface AlgorithmConfig {
  /** Algorithm name */
  name: string;
  /** Algorithm version */
  version: string;
  /** Configuration parameters */
  parameters: Record<string, unknown>;
  /** Whether algorithm is enabled */
  enabled: boolean;
  /** Algorithm weight in combined results */
  weight?: number;
}

export type AudioData = Float32Array | Float64Array | number[];

export interface AudioBuffer {
  /** Audio data samples */
  data: Float32Array;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Duration in seconds */
  duration: number;
}

export interface FilterOptions {
  /** Filter type */
  type: 'lowpass' | 'highpass' | 'bandpass';
  /** Cutoff frequency in Hz */
  cutoff: number;
  /** Bandwidth for bandpass filter in Hz */
  bandwidth?: number;
  /** Filter order */
  order?: number;
}

export interface AudioFeatures {
  /** RMS energy */
  rms: number;
  /** Spectral centroid in Hz */
  spectralCentroid: number;
  /** Zero crossing rate */
  zcr: number;
  /** Spectral rolloff */
  spectralRolloff: number;
  /** Zero crossing rate (alias for zcr) */
  zeroCrossingRate?: number;
  /** Dynamic range in dB */
  dynamicRange?: number;
  /** MFCC coefficients */
  mfcc?: number[];
  /** Chroma features */
  chroma?: number[];
  /** Audio duration in seconds */
  duration?: number;
}

export interface OnsetDetectionOptions {
  /** Window size for FFT */
  windowSize?: number;
  /** Hop size for analysis */
  hopSize?: number;
  /** Onset detection method */
  method?: 'spectral_flux' | 'energy' | 'complex_domain' | 'combined';
  /** Threshold for peak picking */
  threshold?: number;
  /** Minimum time between onsets in seconds */
  minInterval?: number;
}

// Enhanced onset detection interfaces
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

export interface EnhancedOnset extends Onset {
  /** Onset detection method used */
  method?: string;
  /** Local prominence score */
  prominence?: number;
  /** Spectral centroid at onset time */
  spectralCentroid?: number;
  /** Additional onset metadata */
  metadata?: {
    /** Original detection time before refinement */
    originalTime?: number;
    /** Detection method confidence */
    methodConfidence?: number;
    /** Phase information */
    phase?: number;
    [key: string]: unknown;
  };
}

export interface Onset {
  /** Time in seconds */
  time: number;
  /** Strength of the onset */
  strength: number;
  /** Confidence score */
  confidence: number;
}

export interface TempoTrackingOptions {
  /** Minimum BPM to consider */
  minBpm?: number;
  /** Maximum BPM to consider */
  maxBpm?: number;
  /** Window size for tempo analysis in seconds */
  windowSize?: number;
  /** Use dynamic programming for beat tracking */
  useDynamicProgramming?: boolean;
}

// Enhanced tempo tracking interfaces
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

export interface TempoCurvePoint {
  /** Time in seconds */
  time: number;
  /** BPM at this time */
  bpm: number;
  /** Confidence at this time */
  confidence: number;
}

export interface BeatConsistencyAnalysis {
  /** Overall consistency score (0-1) */
  consistency: number;
  /** Average interval between beats in ms */
  averageInterval: number;
  /** Variance in beat intervals */
  intervalVariance: number;
  /** Tempo stability score (0-1) */
  tempoStability: number;
  /** Rhythmic regularity score (0-1) */
  rhythmicRegularity: number;
}

// Beat result interface for structured beat information
export interface BeatResult {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Confidence level (0-1) */
  confidence: number;
  /** Beat strength/amplitude */
  strength: number;
  /** Beat type classification */
  type?: 'downbeat' | 'beat' | 'offbeat' | 'syncopated';
  /** Optional metadata */
  metadata?: {
    /** Original onset time before alignment */
    originalTime?: number;
    /** Expected time from tempo grid */
    expectedTime?: number;
    /** Timing deviation from expected */
    timingDeviation?: number;
    /** Beat phase within measure */
    beatPhase?: number;
    /** Measure number */
    measureNumber?: number;
    /** Beat number within measure */
    beatNumber?: number;
    /** Detection score */
    detectionScore?: number;
    /** Whether beat was interpolated */
    interpolated?: boolean;
    [key: string]: unknown;
  };
}

// Configuration interface for BeatSelector
export interface BeatSelectorConfig {
  /** Selection strategy */
  strategy: 'energy' | 'regular' | 'musical' | 'adaptive';
  /** Number of beats to select */
  count: number;
  /** Weight for energy-based selection (0-1) */
  energyWeight: number;
  /** Weight for regularity-based selection (0-1) */
  regularityWeight: number;
  /** Weight for musical context (0-1) */
  musicalWeight: number;
  /** Minimum spacing between selected beats in ms */
  minSpacing?: number;
  /** Audio duration for regular selection */
  audioDuration?: number;
}

// Legacy interface for backward compatibility
export interface BeatSelection {
  /** Selection strategy */
  strategy?: 'energy' | 'regular' | 'musical' | 'adaptive';
  /** Number of beats to select */
  count: number;
  /** Weight for energy-based selection */
  energyWeight?: number;
  /** Weight for regularity-based selection */
  regularityWeight?: number;
  /** Weight for musical context */
  musicalWeight?: number;
}

// Output format configuration
export interface OutputFormat {
  /** Include confidence scores */
  includeConfidence?: boolean;
  /** Include beat strengths */
  includeStrength?: boolean;
  /** Include metadata */
  includeMetadata?: boolean;
  /** Output precision for timestamps */
  precision?: number;
}

// Parsed beats output with comprehensive metadata
export interface ParsedBeatsOutput {
  /** Formatted beat results */
  beats: BeatResult[];
  /** Tempo information */
  tempo?: {
    /** BPM value */
    bpm: number;
    /** Confidence score (0-1) */
    confidence: number;
    /** Time signature */
    timeSignature?: {
      numerator: number;
      denominator: number;
    };
    /** Additional tempo metadata */
    metadata?: {
      /** Beat phase offset in seconds */
      phase?: number;
      /** Alternative tempo candidates */
      alternativeTempos?: Array<{ bpm: number; confidence: number }>;
      /** Tempo stability score */
      stability?: number;
      [key: string]: unknown;
    };
  };
  /** Processing metadata and performance metrics */
  metadata: {
    /** Processing time in milliseconds */
    processingTime: number;
    /** Number of samples processed */
    samplesProcessed: number;
    /** Analysis parameters used */
    parameters: Record<string, unknown>;
    /** Beat analysis statistics */
    analysis?: {
      /** Total beats detected before selection */
      totalBeatsDetected: number;
      /** Number of beats selected */
      beatsSelected: number;
      /** Average confidence of selected beats */
      averageConfidence: number;
      /** Average strength of selected beats */
      averageStrength: number;
      /** Beat density (beats per second) */
      beatDensity: number;
      /** Overall quality score (0-1) */
      qualityScore: number;
    };
    /** Performance metrics */
    performance?: {
      /** Memory usage in bytes */
      memoryUsage?: number;
      /** CPU time in milliseconds */
      cpuTime?: number;
      /** Algorithm efficiency score */
      efficiency?: number;
    };
    /** Algorithm versions */
    algorithmVersions?: Record<string, string>;
    /** Quality metrics */
    qualityMetrics?: Record<string, number>;
    /** Warnings or notes */
    warnings?: string[];
    [key: string]: unknown;
  };
  /** Output format version */
  version: string;
  /** Generation timestamp */
  timestamp: string;
}

export interface Parser {
  /** Parse audio data to extract beats */
  parse(audioData: AudioData, options?: ParseOptions): Promise<ParseResult>;
  /** Get parser name */
  getName(): string;
  /** Get parser version */
  getVersion(): string;
}

// Advanced analysis interfaces
export interface SpectralAnalysis {
  /** Spectral centroid in Hz */
  spectralCentroid: number;
  /** Spectral rolloff in Hz */
  spectralRolloff: number;
  /** Spectral flux value */
  spectralFlux: number;
  /** Spectral bandwidth */
  spectralBandwidth?: number;
  /** Spectral flatness */
  spectralFlatness?: number;
}

export interface RhythmicFeatures {
  /** Beat strength histogram */
  beatStrengthHistogram?: number[];
  /** Rhythmic pattern regularity */
  rhythmicRegularity: number;
  /** Syncopation index */
  syncopationIndex?: number;
  /** Groove template similarity */
  grooveTemplateMatch?: number;
}

export interface AdvancedBeatInfo extends Beat {
  /** Enhanced metadata */
  metadata?: {
    /** Original onset time before alignment */
    originalTime?: number;
    /** Expected time from tempo grid */
    expectedTime?: number;
    /** Timing deviation from expected */
    timingDeviation?: number;
    /** Beat phase within measure */
    beatPhase?: number;
    /** Measure number */
    measureNumber?: number;
    /** Beat number within measure */
    beatNumber?: number;
    /** Tempo at this beat */
    localTempo?: number;
    /** Detection score */
    detectionScore?: number;
    /** Whether beat was interpolated */
    interpolated?: boolean;
    [key: string]: unknown;
  };
}

export interface AudioAnalysisResult {
  /** Detected onsets */
  onsets: EnhancedOnset[];
  /** Detected tempo information */
  tempo: Tempo;
  /** Tracked beats */
  beats: AdvancedBeatInfo[];
  /** Tempo curve for variable tempo music */
  tempoCurve?: TempoCurvePoint[];
  /** Beat consistency analysis */
  consistency?: BeatConsistencyAnalysis;
  /** Spectral analysis */
  spectral?: SpectralAnalysis;
  /** Rhythmic features */
  rhythmic?: RhythmicFeatures;
  /** Processing metadata */
  metadata: {
    /** Total processing time */
    processingTimeMs: number;
    /** Algorithm versions used */
    algorithmVersions?: Record<string, string>;
    /** Quality metrics */
    qualityMetrics?: Record<string, number>;
    /** Warnings or notes */
    warnings?: string[];
    [key: string]: unknown;
  };
}

// Additional types for the beat parser implementation
export interface BeatCandidate {
  /** Timestamp in seconds */
  timestamp: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source algorithm that detected this beat */
  source: 'onset' | 'tempo' | 'spectral' | 'hybrid';
  /** Beat strength/amplitude */
  strength: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface BeatConfig {
  /** Sample rate for audio processing */
  sampleRate?: number;
  /** Hop size in samples */
  hopSize?: number;
  /** Frame size in samples */
  frameSize?: number;
  /** Minimum tempo in BPM */
  minTempo?: number;
  /** Maximum tempo in BPM */
  maxTempo?: number;
}

export interface StreamingOptions {
  /** Size of each processing chunk */
  chunkSize?: number;
  /** Overlap between chunks (0-1) */
  overlap?: number;
  /** Target number of pictures for streaming processing */
  targetPictureCount?: number;
  /** Progress callback for streaming updates */
  progressCallback?: (progress: number) => void;
}
