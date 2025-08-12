/**
 * Spectral feature extraction for audio analysis
 */

import FFT from 'fft.js';
import type { AudioFeatures } from '../types';

export class SpectralFeatures {
  /**
   * Extract spectral features from audio data
   */
  static extractFeatures(audioData: Float32Array, sampleRate: number = 44100): AudioFeatures {
    // Calculate FFT once and reuse it for multiple features
    const fft = SpectralFeatures.calculateFFT(audioData);
    const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
    
    const features: AudioFeatures = {
      spectralCentroid: SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate),
      spectralRolloff: SpectralFeatures.calculateSpectralRolloffFromMagnitude(magnitude, sampleRate),
      spectralBandwidth: SpectralFeatures.calculateSpectralBandwidthFromMagnitude(magnitude, sampleRate),
      zeroCrossingRate: SpectralFeatures.calculateZeroCrossingRate(audioData),
      rmsEnergy: SpectralFeatures.calculateRmsEnergy(audioData),
      mfcc: SpectralFeatures.calculateMfccFromMagnitude(magnitude, sampleRate)
    };

    return features;
  }

  /**
   * Calculate spectral centroid (brightness measure)
   */
  private static calculateSpectralCentroid(audioData: Float32Array, sampleRate: number): number {
    const fft = SpectralFeatures.calculateFFT(audioData);
    const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
    return SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate);
  }

  /**
   * Calculate spectral centroid from pre-computed magnitude spectrum
   */
  private static calculateSpectralCentroidFromMagnitude(magnitude: number[], sampleRate: number): number {
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < magnitude.length / 2; i++) {
      const frequency = (i * sampleRate) / magnitude.length;
      weightedSum += frequency * magnitude[i];
      magnitudeSum += magnitude[i];
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  /**
   * Calculate spectral rolloff (frequency below which 85% of energy lies)
   */
  private static calculateSpectralRolloff(audioData: Float32Array, sampleRate: number): number {
    const fft = SpectralFeatures.calculateFFT(audioData);
    const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
    return SpectralFeatures.calculateSpectralRolloffFromMagnitude(magnitude, sampleRate);
  }

  /**
   * Calculate spectral rolloff from pre-computed magnitude spectrum
   */
  private static calculateSpectralRolloffFromMagnitude(magnitude: number[], sampleRate: number): number {
    const totalEnergy = magnitude.reduce((sum, mag) => sum + mag * mag, 0);
    const threshold = totalEnergy * 0.85;
    
    let runningEnergy = 0;
    for (let i = 0; i < magnitude.length / 2; i++) {
      runningEnergy += magnitude[i] * magnitude[i];
      if (runningEnergy >= threshold) {
        return (i * sampleRate) / magnitude.length;
      }
    }
    
    return sampleRate / 2; // Nyquist frequency if threshold not reached
  }

  /**
   * Calculate spectral bandwidth
   */
  private static calculateSpectralBandwidth(audioData: Float32Array, sampleRate: number): number {
    const fft = SpectralFeatures.calculateFFT(audioData);
    const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
    return SpectralFeatures.calculateSpectralBandwidthFromMagnitude(magnitude, sampleRate);
  }

  /**
   * Calculate spectral bandwidth from pre-computed magnitude spectrum
   */
  private static calculateSpectralBandwidthFromMagnitude(magnitude: number[], sampleRate: number): number {
    const centroid = SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate);
    
    let weightedVariance = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < magnitude.length / 2; i++) {
      const frequency = (i * sampleRate) / magnitude.length;
      const deviation = frequency - centroid;
      weightedVariance += deviation * deviation * magnitude[i];
      magnitudeSum += magnitude[i];
    }
    
    return magnitudeSum > 0 ? Math.sqrt(weightedVariance / magnitudeSum) : 0;
  }

  /**
   * Calculate zero crossing rate
   */
  private static calculateZeroCrossingRate(audioData: Float32Array): number {
    let crossings = 0;
    
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i - 1] >= 0 && audioData[i] < 0) || 
          (audioData[i - 1] < 0 && audioData[i] >= 0)) {
        crossings++;
      }
    }
    
    return crossings / audioData.length;
  }

  /**
   * Calculate RMS energy
   */
  private static calculateRmsEnergy(audioData: Float32Array): number {
    const sumSquares = audioData.reduce((sum, sample) => sum + sample * sample, 0);
    return Math.sqrt(sumSquares / audioData.length);
  }

  /**
   * Calculate MFCC coefficients (simplified version)
   */
  private static calculateMfcc(audioData: Float32Array, sampleRate: number): number[] {
    const fft = SpectralFeatures.calculateFFT(audioData);
    const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
    return SpectralFeatures.calculateMfccFromMagnitude(magnitude, sampleRate);
  }

  /**
   * Calculate MFCC coefficients from pre-computed magnitude spectrum
   */
  private static calculateMfccFromMagnitude(magnitude: number[], sampleRate: number): number[] {
    // Simplified MFCC calculation - in production would use proper mel-scale filtering
    const numCoefficients = 13;
    const mfcc: number[] = [];
    
    // Simplified approach: divide spectrum into bands and calculate log energy
    const bandsPerCoeff = Math.floor(magnitude.length / 2 / numCoefficients);
    
    for (let i = 0; i < numCoefficients; i++) {
      const startBin = i * bandsPerCoeff;
      const endBin = Math.min((i + 1) * bandsPerCoeff, magnitude.length / 2);
      
      let bandEnergy = 0;
      for (let j = startBin; j < endBin; j++) {
        bandEnergy += magnitude[j] * magnitude[j];
      }
      
      mfcc.push(bandEnergy > 0 ? Math.log(bandEnergy) : -Infinity);
    }
    
    return mfcc;
  }

  /**
   * Fast FFT implementation using fft.js library
   */
  private static calculateFFT(audioData: Float32Array): { real: number; imag: number }[] {
    const N = audioData.length;
    
    // Zero-pad to next power of 2 if needed
    const paddedLength = Math.pow(2, Math.ceil(Math.log2(N)));
    const paddedData = new Float32Array(paddedLength);
    paddedData.set(audioData);
    
    // Create FFT instance
    const fft = new FFT(paddedLength);
    
    // Convert to format expected by fft.js (interleaved real/imaginary)
    const input = new Array(paddedLength * 2);
    for (let i = 0; i < paddedLength; i++) {
      input[i * 2] = paddedData[i];     // real part
      input[i * 2 + 1] = 0;             // imaginary part (0 for real input)
    }
    
    // Perform FFT
    const output = new Array(paddedLength * 2);
    fft.transform(output, input);
    
    // Convert back to our format
    const result: { real: number; imag: number }[] = [];
    for (let i = 0; i < paddedLength; i++) {
      result.push({
        real: output[i * 2],
        imag: output[i * 2 + 1]
      });
    }
    
    return result;
  }

  /**
   * Extract frame-wise features for time-series analysis
   * This method processes audio in small frames to avoid performance issues with large audio files
   */
  static extractFrameFeatures(
    audioData: Float32Array, 
    frameSize: number = 2048,
    hopSize: number = 512,
    sampleRate: number = 44100
  ): AudioFeatures[] {
    const features: AudioFeatures[] = [];
    
    // Ensure frameSize is a power of 2 for optimal FFT performance
    const optimalFrameSize = Math.pow(2, Math.ceil(Math.log2(frameSize)));
    
    console.log(`Processing ${audioData.length} samples in frames of ${optimalFrameSize} (hop size: ${hopSize})`);
    let processedFrames = 0;
    const totalFrames = Math.floor((audioData.length - optimalFrameSize) / hopSize) + 1;
    
    for (let i = 0; i <= audioData.length - optimalFrameSize; i += hopSize) {
      const frame = audioData.slice(i, i + optimalFrameSize);
      const frameFeatures = SpectralFeatures.extractFeatures(frame, sampleRate);
      features.push(frameFeatures);
      
      processedFrames++;
      if (processedFrames % 100 === 0) {
        console.log(`Processed ${processedFrames}/${totalFrames} frames (${Math.round(processedFrames / totalFrames * 100)}%)`);
      }
    }
    
    console.log(`Completed processing ${processedFrames} frames`);
    return features;
  }

  /**
   * Calculate chroma features (simplified)
   */
  static calculateChroma(audioData: Float32Array, sampleRate: number = 44100): number[] {
    // For large audio data, process in frames and average the result
    if (audioData.length > 8192) {
      return SpectralFeatures.calculateChromaFromFrames(audioData, sampleRate);
    }
    
    const fft = SpectralFeatures.calculateFFT(audioData);
    const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
    return SpectralFeatures.calculateChromaFromMagnitude(magnitude, sampleRate);
  }

  /**
   * Calculate chroma features from frames for large audio data
   */
  private static calculateChromaFromFrames(audioData: Float32Array, sampleRate: number): number[] {
    const frameSize = 4096;
    const hopSize = 2048;
    const chromaBins = 12;
    const avgChroma = new Array(chromaBins).fill(0);
    let numFrames = 0;
    
    for (let i = 0; i <= audioData.length - frameSize; i += hopSize) {
      const frame = audioData.slice(i, i + frameSize);
      const fft = SpectralFeatures.calculateFFT(frame);
      const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
      const frameChroma = SpectralFeatures.calculateChromaFromMagnitude(magnitude, sampleRate);
      
      for (let j = 0; j < chromaBins; j++) {
        avgChroma[j] += frameChroma[j];
      }
      numFrames++;
    }
    
    // Average across frames
    return numFrames > 0 ? avgChroma.map(val => val / numFrames) : avgChroma;
  }

  /**
   * Calculate chroma features from pre-computed magnitude spectrum
   */
  private static calculateChromaFromMagnitude(magnitude: number[], sampleRate: number): number[] {
    const chromaBins = 12; // 12 semitones in an octave
    const chroma = new Array(chromaBins).fill(0);
    
    for (let i = 1; i < magnitude.length / 2; i++) {
      const frequency = (i * sampleRate) / magnitude.length;
      if (frequency > 0) {
        // Convert frequency to MIDI note number, then to chroma bin
        const midiNote = 12 * Math.log2(frequency / 440) + 69;
        const chromaBin = Math.round(midiNote) % 12;
        if (chromaBin >= 0 && chromaBin < 12) {
          chroma[chromaBin] += magnitude[i];
        }
      }
    }
    
    // Normalize
    const sum = chroma.reduce((a, b) => a + b, 0);
    return sum > 0 ? chroma.map(val => val / sum) : chroma;
  }
}