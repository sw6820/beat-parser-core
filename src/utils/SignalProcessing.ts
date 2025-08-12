/**
 * SignalProcessing - Digital Signal Processing utilities
 * Advanced DSP operations including filtering, FFT, resampling, and spectral analysis
 */

// Note: AudioData and AudioUtils imports removed as they are not used in this file

// Complex number representation for FFT
interface Complex {
  real: number;
  imag: number;
}

export class SignalProcessingError extends Error {
  constructor(message: string, public readonly operation?: string) {
    super(message);
    this.name = 'SignalProcessingError';
  }
}

export class SignalProcessing {
  // Constants for DSP operations
  private static readonly PI = Math.PI;
  private static readonly TWO_PI = 2 * Math.PI;
  private static readonly EPSILON = 1e-10;

  /**
   * High-quality resampling using linear interpolation
   * For production, consider using libsamplerate or similar
   */
  static resample(
    data: Float32Array,
    fromRate: number,
    toRate: number,
    antiAliasing = true
  ): Float32Array {
    if (fromRate === toRate) return data.slice();
    if (fromRate <= 0 || toRate <= 0) {
      throw new SignalProcessingError('Sample rates must be positive');
    }

    const ratio = fromRate / toRate;
    const newLength = Math.floor(data.length / ratio);
    const resampled = new Float32Array(newLength);

    // Apply anti-aliasing filter when downsampling
    let filteredData = data;
    if (antiAliasing && toRate < fromRate) {
      const cutoffFreq = toRate / 2;
      filteredData = SignalProcessing.lowPassFilter(data, cutoffFreq, fromRate, 4);
    }

    // Linear interpolation resampling
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, filteredData.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      resampled[i] = filteredData[srcIndexFloor]! * (1 - fraction) +
                    filteredData[srcIndexCeil]! * fraction;
    }

    return resampled;
  }

  /**
   * High-order low-pass Butterworth filter
   */
  static lowPassFilter(
    data: Float32Array,
    cutoff: number,
    sampleRate: number,
    order = 2
  ): Float32Array {
    if (cutoff >= sampleRate / 2) {
      throw new SignalProcessingError(`Cutoff frequency ${cutoff} must be less than Nyquist frequency ${sampleRate / 2}`);
    }

    // Normalize cutoff frequency
    const nyquist = sampleRate / 2;
    const normalizedCutoff = cutoff / nyquist;
    
    // Create Butterworth coefficients
    const { a, b } = SignalProcessing.butterworth(normalizedCutoff, order, 'low');
    
    // Apply IIR filter
    return SignalProcessing.applyIIRFilter(data, a, b);
  }

  /**
   * High-order high-pass Butterworth filter
   */
  static highPassFilter(
    data: Float32Array,
    cutoff: number,
    sampleRate: number,
    order = 2
  ): Float32Array {
    if (cutoff >= sampleRate / 2) {
      throw new SignalProcessingError(`Cutoff frequency ${cutoff} must be less than Nyquist frequency ${sampleRate / 2}`);
    }

    const nyquist = sampleRate / 2;
    const normalizedCutoff = cutoff / nyquist;
    
    const { a, b } = SignalProcessing.butterworth(normalizedCutoff, order, 'high');
    
    return SignalProcessing.applyIIRFilter(data, a, b);
  }

  /**
   * Band-pass filter using cascaded high-pass and low-pass
   */
  static bandPassFilter(
    data: Float32Array,
    centerFreq: number,
    bandwidth: number,
    sampleRate: number,
    order = 2
  ): Float32Array {
    const lowFreq = Math.max(10, centerFreq - bandwidth / 2);
    const highFreq = Math.min(sampleRate / 2 - 10, centerFreq + bandwidth / 2);
    
    if (lowFreq >= highFreq) {
      throw new SignalProcessingError('Invalid band-pass parameters: low frequency >= high frequency');
    }

    // Apply high-pass then low-pass
    const highPassed = SignalProcessing.highPassFilter(data, lowFreq, sampleRate, order);
    return SignalProcessing.lowPassFilter(highPassed, highFreq, sampleRate, order);
  }

  /**
   * Notch filter for removing specific frequencies
   */
  static notchFilter(
    data: Float32Array,
    freq: number,
    sampleRate: number,
    q = 10
  ): Float32Array {
    const w = SignalProcessing.TWO_PI * freq / sampleRate;
    const cosW = Math.cos(w);
    const sinW = Math.sin(w);
    const alpha = sinW / (2 * q);

    // Notch filter coefficients
    const b0 = 1;
    const b1 = -2 * cosW;
    const b2 = 1;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW;
    const a2 = 1 - alpha;

    const b = [b0 / a0, b1 / a0, b2 / a0];
    const a = [1, a1 / a0, a2 / a0];

    return SignalProcessing.applyIIRFilter(data, a, b);
  }

  /**
   * Efficient FFT implementation (Cooley-Tukey algorithm)
   */
  static computeFFT(data: Float32Array): Complex[] {
    const N = data.length;
    
    // Pad to next power of 2 if necessary
    const paddedLength = this.nextPowerOf2(N);
    const paddedData = new Float32Array(paddedLength);
    paddedData.set(data);

    // Convert to complex array
    const complexData: Complex[] = [];
    for (let i = 0; i < paddedLength; i++) {
      complexData.push({ real: paddedData[i]!, imag: 0 });
    }

    this.fftRecursive(complexData);
    
    // Return only the meaningful part
    return complexData.slice(0, Math.floor(N / 2) + 1);
  }

  /**
   * Compute FFT magnitude spectrum
   */
  static computeFFTMagnitude(data: Float32Array): Float32Array {
    const fftResult = this.computeFFT(data);
    const magnitude = new Float32Array(fftResult.length);
    
    for (let i = 0; i < fftResult.length; i++) {
      const { real, imag } = fftResult[i]!;
      magnitude[i] = Math.sqrt(real * real + imag * imag);
    }
    
    return magnitude;
  }

  /**
   * Compute power spectral density
   */
  static computePSD(data: Float32Array, sampleRate: number): {
    frequencies: Float32Array;
    psd: Float32Array;
  } {
    const fftResult = this.computeFFT(data);
    const N = data.length;
    const psd = new Float32Array(fftResult.length);
    const frequencies = new Float32Array(fftResult.length);
    
    const freqResolution = sampleRate / N;
    
    for (let i = 0; i < fftResult.length; i++) {
      const { real, imag } = fftResult[i]!;
      const magnitude = real * real + imag * imag;
      psd[i] = magnitude / (sampleRate * N);
      frequencies[i] = i * freqResolution;
    }
    
    return { frequencies, psd };
  }

  /**
   * Mel-frequency cepstral coefficients (MFCC) computation
   */
  static computeMFCC(
    data: Float32Array,
    sampleRate: number,
    numCoeffs = 13,
    numFilters = 26
  ): Float32Array {
    // Apply pre-emphasis filter
    const preEmphasized = this.preEmphasis(data);
    
    // Compute power spectrum
    const powerSpectrum = this.computeFFTMagnitude(preEmphasized);
    
    // Apply mel filter bank
    const melFiltered = this.melFilterBank(powerSpectrum, sampleRate, numFilters);
    
    // Apply log and DCT
    const logMel = melFiltered.map(x => Math.log(Math.max(x, this.EPSILON)));
    return this.dct(new Float32Array(logMel), numCoeffs);
  }

  /**
   * Window functions
   */
  static hanningWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos(this.TWO_PI * i / (size - 1)));
    }
    return window;
  }

  static hammingWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.54 - 0.46 * Math.cos(this.TWO_PI * i / (size - 1));
    }
    return window;
  }

  static blackmanWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const n = i / (size - 1);
      window[i] = 0.42 - 0.5 * Math.cos(this.TWO_PI * n) + 0.08 * Math.cos(4 * this.PI * n);
    }
    return window;
  }

  static rectangularWindow(size: number): Float32Array {
    return new Float32Array(size).fill(1.0);
  }

  static kaisserWindow(size: number, beta = 8.6): Float32Array {
    const window = new Float32Array(size);
    const i0Beta = this.besseli0(beta);
    
    for (let i = 0; i < size; i++) {
      const n = i - (size - 1) / 2;
      const arg = beta * Math.sqrt(1 - (2 * n / (size - 1)) ** 2);
      window[i] = this.besseli0(arg) / i0Beta;
    }
    
    return window;
  }

  /**
   * Autocorrelation function
   */
  static autocorrelation(data: Float32Array, maxLag?: number): Float32Array {
    const N = data.length;
    const maxLagActual = maxLag || N - 1;
    const result = new Float32Array(maxLagActual + 1);

    for (let lag = 0; lag <= maxLagActual; lag++) {
      let sum = 0;
      for (let i = 0; i < N - lag; i++) {
        sum += data[i]! * data[i + lag]!;
      }
      result[lag] = sum / (N - lag);
    }

    return result;
  }

  /**
   * Cross-correlation function
   */
  static crossCorrelation(x: Float32Array, y: Float32Array): Float32Array {
    const N = Math.max(x.length, y.length);
    const result = new Float32Array(2 * N - 1);
    const offset = N - 1;

    for (let lag = -(N - 1); lag <= N - 1; lag++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const xi = i < x.length ? x[i] : 0;
        const yi = i + lag >= 0 && i + lag < y.length ? y[i + lag] : 0;
        sum += xi! * yi!;
      }
      result[lag + offset] = sum;
    }

    return result;
  }

  /**
   * Zero-crossing rate calculation
   */
  static zeroCrossingRate(data: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i - 1]! >= 0) !== (data[i]! >= 0)) {
        crossings++;
      }
    }
    return crossings / (data.length - 1);
  }

  /**
   * Spectral centroid calculation
   */
  static spectralCentroid(spectrum: Float32Array, sampleRate: number): number {
    let weightedSum = 0;
    let magnitudeSum = 0;
    const freqResolution = sampleRate / (2 * (spectrum.length - 1));

    for (let i = 0; i < spectrum.length; i++) {
      const frequency = i * freqResolution;
      weightedSum += frequency * spectrum[i]!;
      magnitudeSum += spectrum[i]!;
    }

    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  /**
   * Spectral rolloff calculation
   */
  static spectralRolloff(spectrum: Float32Array, sampleRate: number, threshold = 0.85): number {
    const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
    const thresholdEnergy = totalEnergy * threshold;
    const freqResolution = sampleRate / (2 * (spectrum.length - 1));

    let cumulativeEnergy = 0;
    for (let i = 0; i < spectrum.length; i++) {
      cumulativeEnergy += spectrum[i]!;
      if (cumulativeEnergy >= thresholdEnergy) {
        return i * freqResolution;
      }
    }

    return (spectrum.length - 1) * freqResolution;
  }

  /**
   * Spectral flux calculation
   */
  static spectralFlux(spectrum1: Float32Array, spectrum2: Float32Array): number {
    const minLength = Math.min(spectrum1.length, spectrum2.length);
    let flux = 0;

    for (let i = 0; i < minLength; i++) {
      const diff = spectrum2[i]! - spectrum1[i]!;
      if (diff > 0) {
        flux += diff * diff;
      }
    }

    return Math.sqrt(flux);
  }

  // Private helper methods

  /**
   * Generate Butterworth filter coefficients
   */
  private static butterworth(
    cutoff: number,
    order: number,
    type: 'low' | 'high'
  ): { a: number[]; b: number[] } {
    // This is a simplified Butterworth implementation
    // For production use, consider a more sophisticated filter design library
    
    if (order === 1) {
      const c = Math.tan(this.PI * cutoff / 2);
      const a1 = (c - 1) / (c + 1);
      const b0 = c / (c + 1);
      const b1 = b0;

      if (type === 'low') {
        return { a: [1, a1], b: [b0, b1] };
      } else {
        return { a: [1, a1], b: [b0, -b1] };
      }
    } else if (order === 2) {
      const c = 1 / Math.tan(this.PI * cutoff / 2);
      const c2 = c * c;
      const sqrt2c = Math.sqrt(2) * c;
      const a0 = 1 + sqrt2c + c2;
      
      if (type === 'low') {
        return {
          a: [1, (2 - 2 * c2) / a0, (1 - sqrt2c + c2) / a0],
          b: [1 / a0, 2 / a0, 1 / a0]
        };
      } else {
        return {
          a: [1, (2 - 2 * c2) / a0, (1 - sqrt2c + c2) / a0],
          b: [c2 / a0, -2 * c2 / a0, c2 / a0]
        };
      }
    } else {
      // Simplified higher-order filter (cascade of 2nd order sections)
      throw new SignalProcessingError(`Order ${order} Butterworth filter not implemented. Use order 1 or 2.`);
    }
  }

  /**
   * Apply IIR filter using Direct Form II
   */
  private static applyIIRFilter(
    data: Float32Array,
    a: number[],
    b: number[]
  ): Float32Array {
    const result = new Float32Array(data.length);
    const order = Math.max(a.length, b.length) - 1;
    const w = new Array(order + 1).fill(0); // delay line

    for (let n = 0; n < data.length; n++) {
      // Shift delay line
      for (let i = order; i > 0; i--) {
        w[i] = w[i - 1];
      }

      // Input with feedback
      w[0] = data[n]!;
      for (let i = 1; i <= order && i < a.length; i++) {
        w[0] -= a[i]! * w[i]!;
      }

      // Output with feedforward
      result[n] = 0;
      for (let i = 0; i <= order && i < b.length; i++) {
        result[n]! += b[i]! * w[i]!;
      }
    }

    return result;
  }

  /**
   * Recursive FFT implementation (Cooley-Tukey)
   */
  private static fftRecursive(x: Complex[]): void {
    const N = x.length;
    if (N <= 1) return;

    // Divide
    const even: Complex[] = [];
    const odd: Complex[] = [];
    for (let i = 0; i < N; i++) {
      if (i % 2 === 0) {
        even.push(x[i]!);
      } else {
        odd.push(x[i]!);
      }
    }

    // Conquer
    this.fftRecursive(even);
    this.fftRecursive(odd);

    // Combine
    for (let k = 0; k < N / 2; k++) {
      const t = this.complexMul(
        { real: Math.cos(-this.TWO_PI * k / N), imag: Math.sin(-this.TWO_PI * k / N) },
        odd[k]!
      );
      x[k] = this.complexAdd(even[k]!, t);
      x[k + N / 2] = this.complexSub(even[k]!, t);
    }
  }

  /**
   * Complex number operations
   */
  private static complexAdd(a: Complex, b: Complex): Complex {
    return { real: a.real + b.real, imag: a.imag + b.imag };
  }

  private static complexSub(a: Complex, b: Complex): Complex {
    return { real: a.real - b.real, imag: a.imag - b.imag };
  }

  private static complexMul(a: Complex, b: Complex): Complex {
    return {
      real: a.real * b.real - a.imag * b.imag,
      imag: a.real * b.imag + a.imag * b.real
    };
  }

  /**
   * Utility functions
   */
  private static nextPowerOf2(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }

  private static preEmphasis(data: Float32Array, alpha = 0.97): Float32Array {
    const result = new Float32Array(data.length);
    result[0] = data[0]!;
    
    for (let i = 1; i < data.length; i++) {
      result[i] = data[i]! - alpha * data[i - 1]!;
    }
    
    return result;
  }

  private static melFilterBank(
    powerSpectrum: Float32Array,
    sampleRate: number,
    numFilters: number
  ): number[] {
    const nfft = (powerSpectrum.length - 1) * 2;
    const lowFreqMel = this.hzToMel(0);
    const highFreqMel = this.hzToMel(sampleRate / 2);
    const melPoints = new Array(numFilters + 2);
    
    // Create mel-spaced frequencies
    for (let i = 0; i < numFilters + 2; i++) {
      melPoints[i] = lowFreqMel + (highFreqMel - lowFreqMel) * i / (numFilters + 1);
    }
    
    // Convert back to Hz and then to FFT bin numbers
    const hzPoints = melPoints.map(mel => this.melToHz(mel));
    const binPoints = hzPoints.map(hz => Math.floor((nfft + 1) * hz / sampleRate));
    
    const filterBank = new Array(numFilters).fill(0);
    
    for (let m = 0; m < numFilters; m++) {
      const leftBin = binPoints[m];
      const centerBin = binPoints[m + 1];
      const rightBin = binPoints[m + 2];
      
      for (let k = leftBin!; k < rightBin!; k++) {
        if (k < powerSpectrum.length) {
          let weight = 0;
          if (k >= leftBin! && k <= centerBin!) {
            weight = (k - leftBin!) / (centerBin! - leftBin!);
          } else if (k >= centerBin! && k <= rightBin!) {
            weight = (rightBin! - k) / (rightBin! - centerBin!);
          }
          filterBank[m]! += powerSpectrum[k]! * weight;
        }
      }
    }
    
    return filterBank;
  }

  private static hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
  }

  private static melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  private static dct(input: Float32Array, numCoeffs: number): Float32Array {
    const N = input.length;
    const result = new Float32Array(numCoeffs);
    
    for (let k = 0; k < numCoeffs; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += input[n]! * Math.cos(this.PI * k * (n + 0.5) / N);
      }
      result[k] = sum * Math.sqrt(2 / N);
      if (k === 0) {
        result[k]! *= Math.sqrt(0.5);
      }
    }
    
    return result;
  }

  private static besseli0(x: number): number {
    // Modified Bessel function of the first kind, order 0
    // Approximation for Kaiser window
    let result = 1;
    let term = 1;
    
    for (let i = 1; i < 20; i++) {
      term *= (x / 2) * (x / 2) / (i * i);
      result += term;
      if (term < 1e-10) break;
    }
    
    return result;
  }
}