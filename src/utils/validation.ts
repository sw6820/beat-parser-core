/**
 * Validation utilities for input data and options
 */

import type { AudioData, ParseOptions } from '../types';

/**
 * Validate audio data input
 */
export function validateAudioData(audioData: AudioData): void {
  if (!audioData) {
    throw new Error('Audio data is required');
  }

  if (
    !Array.isArray(audioData) &&
    !(audioData instanceof Float32Array) &&
    !(audioData instanceof Float64Array)
  ) {
    throw new Error('Audio data must be an array or typed array');
  }

  if (audioData.length === 0) {
    throw new Error('Audio data cannot be empty');
  }

  // Check for valid numeric values
  for (let i = 0; i < audioData.length; i++) {
    const sample = audioData[i];
    if (typeof sample !== 'number' || !isFinite(sample)) {
      throw new Error(`Invalid audio sample at index ${i}: ${sample}`);
    }
  }
}

/**
 * Validate and provide defaults for parse options
 */
export function validateParseOptions(
  options?: ParseOptions
): Required<ParseOptions> {
  const defaults: Required<ParseOptions> = {
    minConfidence: 0.5,
    windowSize: 1024,
    hopSize: 512,
    sampleRate: 44100,
    targetPictureCount: 10,
    selectionMethod: 'adaptive',
    filename: 'unknown'
  };

  if (!options) {
    return defaults;
  }

  const result = { ...defaults, ...options };

  // Validate minConfidence
  if (result.minConfidence < 0 || result.minConfidence > 1) {
    throw new Error('minConfidence must be between 0 and 1');
  }

  // Validate windowSize
  if (!Number.isInteger(result.windowSize) || result.windowSize <= 0) {
    throw new Error('windowSize must be a positive integer');
  }

  // Validate hopSize
  if (!Number.isInteger(result.hopSize) || result.hopSize <= 0) {
    throw new Error('hopSize must be a positive integer');
  }

  // Validate sampleRate
  if (!Number.isInteger(result.sampleRate) || result.sampleRate <= 0) {
    throw new Error('sampleRate must be a positive integer');
  }

  // Validate relationships
  if (result.hopSize > result.windowSize) {
    throw new Error('hopSize cannot be larger than windowSize');
  }

  return result;
}
