/**
 * Tests for validation utilities
 */

import { validateAudioData, validateParseOptions } from '../utils/validation';
import type { AudioData } from '../types';

describe('validateAudioData', () => {
  it('should pass for valid Float32Array', () => {
    const data = new Float32Array([0.1, 0.2, 0.3]);
    expect(() => validateAudioData(data)).not.toThrow();
  });

  it('should pass for valid number array', () => {
    const data = [0.1, 0.2, 0.3];
    expect(() => validateAudioData(data)).not.toThrow();
  });

  it('should throw for null/undefined data', () => {
    expect(() => validateAudioData(null as unknown as AudioData)).toThrow(
      'Audio data is required'
    );
    expect(() => validateAudioData(undefined as unknown as AudioData)).toThrow(
      'Audio data is required'
    );
  });

  it('should throw for empty array', () => {
    expect(() => validateAudioData([])).toThrow('Audio data cannot be empty');
  });

  it('should throw for invalid data type', () => {
    expect(() => validateAudioData('invalid' as unknown as AudioData)).toThrow(
      'Audio data must be an array or typed array'
    );
  });

  it('should throw for invalid sample values', () => {
    expect(() => validateAudioData([1, 2, NaN])).toThrow(
      'Invalid audio sample at index 2: NaN'
    );
    expect(() => validateAudioData([1, 2, Infinity])).toThrow(
      'Invalid audio sample at index 2: Infinity'
    );
  });
});

describe('validateParseOptions', () => {
  it('should return defaults for undefined options', () => {
    const result = validateParseOptions();
    expect(result).toEqual({
      minConfidence: 0.5,
      windowSize: 1024,
      hopSize: 512,
      sampleRate: 44100,
      targetPictureCount: 10,
      selectionMethod: 'adaptive',
      filename: 'unknown'
    });
  });

  it('should merge with defaults for partial options', () => {
    const result = validateParseOptions({ minConfidence: 0.7 });
    expect(result).toEqual({
      minConfidence: 0.7,
      windowSize: 1024,
      hopSize: 512,
      sampleRate: 44100,
      targetPictureCount: 10,
      selectionMethod: 'adaptive',
      filename: 'unknown'
    });
  });

  it('should throw for invalid minConfidence', () => {
    expect(() => validateParseOptions({ minConfidence: -0.1 })).toThrow(
      'minConfidence must be between 0 and 1'
    );
    expect(() => validateParseOptions({ minConfidence: 1.1 })).toThrow(
      'minConfidence must be between 0 and 1'
    );
  });

  it('should throw for invalid windowSize', () => {
    expect(() => validateParseOptions({ windowSize: 0 })).toThrow(
      'windowSize must be a positive integer'
    );
    expect(() => validateParseOptions({ windowSize: -1 })).toThrow(
      'windowSize must be a positive integer'
    );
    expect(() => validateParseOptions({ windowSize: 1.5 })).toThrow(
      'windowSize must be a positive integer'
    );
  });

  it('should throw when hopSize > windowSize', () => {
    expect(() =>
      validateParseOptions({ windowSize: 512, hopSize: 1024 })
    ).toThrow('hopSize cannot be larger than windowSize');
  });
});
