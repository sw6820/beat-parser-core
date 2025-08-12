/**
 * Audio utility functions - Core audio data manipulation
 * Memory-efficient operations for audio processing
 */

import type { AudioData } from '../types';

export class AudioUtils {
  /**
   * Convert various audio data types to Float32Array
   */
  static toFloat32Array(audioData: AudioData): Float32Array {
    if (audioData instanceof Float32Array) {
      return audioData;
    }
    if (audioData instanceof Float64Array) {
      return new Float32Array(audioData);
    }
    if (Array.isArray(audioData)) {
      return new Float32Array(audioData);
    }
    return new Float32Array(audioData as ArrayLike<number>);
  }

  /**
   * Normalize audio data to [-1, 1] range with optional headroom
   */
  static normalize(audioData: AudioData, headroom = 0.95): Float32Array {
    const data = AudioUtils.toFloat32Array(audioData);
    
    if (data.length === 0) {
      return data;
    }
    
    // Find maximum absolute value efficiently
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]!);
      if (abs > max) {
        max = abs;
      }
    }

    if (max === 0 || max === headroom) {
      return data.slice(); // Return copy
    }

    // Normalize with headroom
    const scale = headroom / max;
    const normalized = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      normalized[i] = data[i]! * scale;
    }
    
    return normalized;
  }
  
  /**
   * Normalize audio data in-place (memory efficient)
   */
  static normalizeInPlace(audioData: Float32Array, headroom = 0.95): Float32Array {
    if (audioData.length === 0) {
      return audioData;
    }
    
    // Find maximum absolute value
    let max = 0;
    for (let i = 0; i < audioData.length; i++) {
      const abs = Math.abs(audioData[i]!);
      if (abs > max) {
        max = abs;
      }
    }

    if (max === 0 || max === headroom) {
      return audioData;
    }

    // Normalize with headroom
    const scale = headroom / max;
    for (let i = 0; i < audioData.length; i++) {
      audioData[i]! *= scale;
    }
    
    return audioData;
  }

  /**
   * Calculate RMS (Root Mean Square) energy of audio data
   */
  static calculateRMS(audioData: AudioData): number {
    const data = AudioUtils.toFloat32Array(audioData);
    
    if (data.length === 0) {
      return 0;
    }
    
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i]! * data[i]!;
    }

    return Math.sqrt(sum / data.length);
  }
  
  /**
   * Calculate peak amplitude
   */
  static calculatePeak(audioData: AudioData): number {
    const data = AudioUtils.toFloat32Array(audioData);
    
    if (data.length === 0) {
      return 0;
    }
    
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]!);
      if (abs > peak) {
        peak = abs;
      }
    }
    
    return peak;
  }
  
  /**
   * Calculate dynamic range (peak to RMS ratio) in dB
   */
  static calculateDynamicRange(audioData: AudioData): number {
    const peak = AudioUtils.calculatePeak(audioData);
    const rms = AudioUtils.calculateRMS(audioData);
    
    if (rms === 0 || peak === 0) {
      return 0;
    }
    
    return 20 * Math.log10(peak / rms);
  }
  
  /**
   * Convert amplitude to decibels
   */
  static amplitudeToDb(amplitude: number, reference = 1.0): number {
    if (amplitude <= 0) {
      return -Infinity;
    }
    return 20 * Math.log10(amplitude / reference);
  }
  
  /**
   * Convert decibels to amplitude
   */
  static dbToAmplitude(db: number, reference = 1.0): number {
    return reference * Math.pow(10, db / 20);
  }
  
  /**
   * Detect clipping in audio data
   */
  static detectClipping(audioData: AudioData, threshold = 0.95): {
    hasClipping: boolean;
    clippedSamples: number;
    clippingPercentage: number;
  } {
    const data = AudioUtils.toFloat32Array(audioData);
    let clippedSamples = 0;
    
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]!) >= threshold) {
        clippedSamples++;
      }
    }
    
    return {
      hasClipping: clippedSamples > 0,
      clippedSamples,
      clippingPercentage: data.length > 0 ? (clippedSamples / data.length) * 100 : 0
    };
  }
  
  /**
   * Apply gain to audio data
   */
  static applyGain(audioData: AudioData, gainDb: number): Float32Array {
    const data = AudioUtils.toFloat32Array(audioData);
    const gainLinear = AudioUtils.dbToAmplitude(gainDb);
    
    const result = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i]! * gainLinear;
    }
    
    return result;
  }
  
  /**
   * Mix two audio signals
   */
  static mix(
    audioData1: AudioData,
    audioData2: AudioData,
    ratio1 = 0.5,
    ratio2 = 0.5
  ): Float32Array {
    const data1 = AudioUtils.toFloat32Array(audioData1);
    const data2 = AudioUtils.toFloat32Array(audioData2);
    
    const minLength = Math.min(data1.length, data2.length);
    const mixed = new Float32Array(minLength);
    
    for (let i = 0; i < minLength; i++) {
      mixed[i] = data1[i]! * ratio1 + data2[i]! * ratio2;
    }
    
    return mixed;
  }
  
  /**
   * Concatenate audio data arrays
   */
  static concatenate(...audioDataArrays: AudioData[]): Float32Array {
    if (audioDataArrays.length === 0) {
      return new Float32Array(0);
    }
    
    const arrays = audioDataArrays.map(data => AudioUtils.toFloat32Array(data));
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    
    const result = new Float32Array(totalLength);
    let offset = 0;
    
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    
    return result;
  }
  
  /**
   * Extract a segment of audio data
   */
  static extractSegment(
    audioData: AudioData,
    startSample: number,
    endSample: number
  ): Float32Array {
    const data = AudioUtils.toFloat32Array(audioData);
    const start = Math.max(0, Math.floor(startSample));
    const end = Math.min(data.length, Math.floor(endSample));
    
    if (start >= end) {
      return new Float32Array(0);
    }
    
    return data.slice(start, end);
  }
  
  /**
   * Extract segment by time (in seconds)
   */
  static extractSegmentByTime(
    audioData: AudioData,
    startTime: number,
    endTime: number,
    sampleRate: number
  ): Float32Array {
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    
    return AudioUtils.extractSegment(audioData, startSample, endSample);
  }
  
  /**
   * Apply fade in/out to audio data
   */
  static applyFade(
    audioData: AudioData,
    fadeInDuration = 0,
    fadeOutDuration = 0,
    sampleRate = 44100
  ): Float32Array {
    const data = AudioUtils.toFloat32Array(audioData);
    const result = data.slice();
    
    const fadeInSamples = Math.floor(fadeInDuration * sampleRate);
    const fadeOutSamples = Math.floor(fadeOutDuration * sampleRate);
    
    // Apply fade in
    for (let i = 0; i < Math.min(fadeInSamples, result.length); i++) {
      const factor = i / fadeInSamples;
      result[i]! *= factor;
    }
    
    // Apply fade out
    const fadeOutStart = result.length - fadeOutSamples;
    for (let i = Math.max(0, fadeOutStart); i < result.length; i++) {
      const factor = (result.length - 1 - i) / fadeOutSamples;
      result[i]! *= factor;
    }
    
    return result;
  }
  
  /**
   * Reverse audio data
   */
  static reverse(audioData: AudioData): Float32Array {
    const data = AudioUtils.toFloat32Array(audioData);
    const reversed = new Float32Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      reversed[i] = data[data.length - 1 - i]!;
    }
    
    return reversed;
  }
  
  /**
   * Calculate audio statistics
   */
  static calculateStatistics(audioData: AudioData): {
    mean: number;
    variance: number;
    standardDeviation: number;
    min: number;
    max: number;
    range: number;
    rms: number;
    peak: number;
    dynamicRange: number;
  } {
    const data = AudioUtils.toFloat32Array(audioData);
    
    if (data.length === 0) {
      return {
        mean: 0, variance: 0, standardDeviation: 0,
        min: 0, max: 0, range: 0,
        rms: 0, peak: 0, dynamicRange: 0
      };
    }
    
    let sum = 0;
    let min = data[0]!;
    let max = data[0]!;
    let peak = Math.abs(data[0]!);
    let sumSquares = 0;
    
    for (let i = 0; i < data.length; i++) {
      const sample = data[i]!;
      const absSample = Math.abs(sample);
      
      sum += sample;
      sumSquares += sample * sample;
      
      if (sample < min) min = sample;
      if (sample > max) max = sample;
      if (absSample > peak) peak = absSample;
    }
    
    const mean = sum / data.length;
    const variance = (sumSquares / data.length) - (mean * mean);
    const standardDeviation = Math.sqrt(variance);
    const rms = Math.sqrt(sumSquares / data.length);
    const dynamicRange = rms > 0 ? 20 * Math.log10(peak / rms) : 0;
    
    return {
      mean,
      variance,
      standardDeviation,
      min,
      max,
      range: max - min,
      rms,
      peak,
      dynamicRange
    };
  }
  
  /**
   * Check if audio data is valid (no NaN or Infinity values)
   */
  static isValid(audioData: AudioData): boolean {
    const data = AudioUtils.toFloat32Array(audioData);
    
    for (let i = 0; i < data.length; i++) {
      if (!isFinite(data[i]!)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Clean invalid values from audio data
   */
  static cleanInvalidValues(audioData: AudioData, replacement = 0): Float32Array {
    const data = AudioUtils.toFloat32Array(audioData);
    const cleaned = new Float32Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      cleaned[i] = isFinite(data[i]!) ? data[i]! : replacement;
    }
    
    return cleaned;
  }
}
