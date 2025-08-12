/*!
 * beat-parser-core v1.0.0
 * TypeScript library for parsing musical beats and rhythmic patterns
 * https://github.com/username/beat-parser#readme
 * 
 * Copyright (c) 2025 
 * Released under the MIT license
 */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fs = require('fs/promises');
var path = require('path');
var FFT = require('fft.js');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
class AudioUtils {
    static toFloat32Array(audioData) {
        if (audioData instanceof Float32Array) {
            return audioData;
        }
        if (audioData instanceof Float64Array) {
            return new Float32Array(audioData);
        }
        if (Array.isArray(audioData)) {
            return new Float32Array(audioData);
        }
        return new Float32Array(audioData);
    }
    static normalize(audioData, headroom = 0.95) {
        const data = AudioUtils.toFloat32Array(audioData);
        if (data.length === 0) {
            return data;
        }
        let max = 0;
        for (let i = 0; i < data.length; i++) {
            const abs = Math.abs(data[i]);
            if (abs > max) {
                max = abs;
            }
        }
        if (max === 0 || max === headroom) {
            return data.slice();
        }
        const scale = headroom / max;
        const normalized = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            normalized[i] = data[i] * scale;
        }
        return normalized;
    }
    static normalizeInPlace(audioData, headroom = 0.95) {
        if (audioData.length === 0) {
            return audioData;
        }
        let max = 0;
        for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > max) {
                max = abs;
            }
        }
        if (max === 0 || max === headroom) {
            return audioData;
        }
        const scale = headroom / max;
        for (let i = 0; i < audioData.length; i++) {
            audioData[i] *= scale;
        }
        return audioData;
    }
    static calculateRMS(audioData) {
        const data = AudioUtils.toFloat32Array(audioData);
        if (data.length === 0) {
            return 0;
        }
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }
    static calculatePeak(audioData) {
        const data = AudioUtils.toFloat32Array(audioData);
        if (data.length === 0) {
            return 0;
        }
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
            const abs = Math.abs(data[i]);
            if (abs > peak) {
                peak = abs;
            }
        }
        return peak;
    }
    static calculateDynamicRange(audioData) {
        const peak = AudioUtils.calculatePeak(audioData);
        const rms = AudioUtils.calculateRMS(audioData);
        if (rms === 0 || peak === 0) {
            return 0;
        }
        return 20 * Math.log10(peak / rms);
    }
    static amplitudeToDb(amplitude, reference = 1.0) {
        if (amplitude <= 0) {
            return -Infinity;
        }
        return 20 * Math.log10(amplitude / reference);
    }
    static dbToAmplitude(db, reference = 1.0) {
        return reference * Math.pow(10, db / 20);
    }
    static detectClipping(audioData, threshold = 0.95) {
        const data = AudioUtils.toFloat32Array(audioData);
        let clippedSamples = 0;
        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) >= threshold) {
                clippedSamples++;
            }
        }
        return {
            hasClipping: clippedSamples > 0,
            clippedSamples,
            clippingPercentage: data.length > 0 ? (clippedSamples / data.length) * 100 : 0
        };
    }
    static applyGain(audioData, gainDb) {
        const data = AudioUtils.toFloat32Array(audioData);
        const gainLinear = AudioUtils.dbToAmplitude(gainDb);
        const result = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] * gainLinear;
        }
        return result;
    }
    static mix(audioData1, audioData2, ratio1 = 0.5, ratio2 = 0.5) {
        const data1 = AudioUtils.toFloat32Array(audioData1);
        const data2 = AudioUtils.toFloat32Array(audioData2);
        const minLength = Math.min(data1.length, data2.length);
        const mixed = new Float32Array(minLength);
        for (let i = 0; i < minLength; i++) {
            mixed[i] = data1[i] * ratio1 + data2[i] * ratio2;
        }
        return mixed;
    }
    static concatenate(...audioDataArrays) {
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
    static extractSegment(audioData, startSample, endSample) {
        const data = AudioUtils.toFloat32Array(audioData);
        const start = Math.max(0, Math.floor(startSample));
        const end = Math.min(data.length, Math.floor(endSample));
        if (start >= end) {
            return new Float32Array(0);
        }
        return data.slice(start, end);
    }
    static extractSegmentByTime(audioData, startTime, endTime, sampleRate) {
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor(endTime * sampleRate);
        return AudioUtils.extractSegment(audioData, startSample, endSample);
    }
    static applyFade(audioData, fadeInDuration = 0, fadeOutDuration = 0, sampleRate = 44100) {
        const data = AudioUtils.toFloat32Array(audioData);
        const result = data.slice();
        const fadeInSamples = Math.floor(fadeInDuration * sampleRate);
        const fadeOutSamples = Math.floor(fadeOutDuration * sampleRate);
        for (let i = 0; i < Math.min(fadeInSamples, result.length); i++) {
            const factor = i / fadeInSamples;
            result[i] *= factor;
        }
        const fadeOutStart = result.length - fadeOutSamples;
        for (let i = Math.max(0, fadeOutStart); i < result.length; i++) {
            const factor = (result.length - 1 - i) / fadeOutSamples;
            result[i] *= factor;
        }
        return result;
    }
    static reverse(audioData) {
        const data = AudioUtils.toFloat32Array(audioData);
        const reversed = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            reversed[i] = data[data.length - 1 - i];
        }
        return reversed;
    }
    static calculateStatistics(audioData) {
        const data = AudioUtils.toFloat32Array(audioData);
        if (data.length === 0) {
            return {
                mean: 0, variance: 0, standardDeviation: 0,
                min: 0, max: 0, range: 0,
                rms: 0, peak: 0, dynamicRange: 0
            };
        }
        let sum = 0;
        let min = data[0];
        let max = data[0];
        let peak = Math.abs(data[0]);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
            const sample = data[i];
            const absSample = Math.abs(sample);
            sum += sample;
            sumSquares += sample * sample;
            if (sample < min)
                min = sample;
            if (sample > max)
                max = sample;
            if (absSample > peak)
                peak = absSample;
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
    static isValid(audioData) {
        const data = AudioUtils.toFloat32Array(audioData);
        for (let i = 0; i < data.length; i++) {
            if (!isFinite(data[i])) {
                return false;
            }
        }
        return true;
    }
    static cleanInvalidValues(audioData, replacement = 0) {
        const data = AudioUtils.toFloat32Array(audioData);
        const cleaned = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            cleaned[i] = isFinite(data[i]) ? data[i] : replacement;
        }
        return cleaned;
    }
}

class SignalProcessingError extends Error {
    constructor(message, operation) {
        super(message);
        Object.defineProperty(this, "operation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: operation
        });
        this.name = 'SignalProcessingError';
    }
}
class SignalProcessing {
    static resample(data, fromRate, toRate, antiAliasing = true) {
        if (fromRate === toRate)
            return data.slice();
        if (fromRate <= 0 || toRate <= 0) {
            throw new SignalProcessingError('Sample rates must be positive');
        }
        const ratio = fromRate / toRate;
        const newLength = Math.floor(data.length / ratio);
        const resampled = new Float32Array(newLength);
        let filteredData = data;
        if (antiAliasing && toRate < fromRate) {
            const cutoffFreq = toRate / 2;
            filteredData = SignalProcessing.lowPassFilter(data, cutoffFreq, fromRate, 4);
        }
        for (let i = 0; i < newLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, filteredData.length - 1);
            const fraction = srcIndex - srcIndexFloor;
            resampled[i] = filteredData[srcIndexFloor] * (1 - fraction) +
                filteredData[srcIndexCeil] * fraction;
        }
        return resampled;
    }
    static lowPassFilter(data, cutoff, sampleRate, order = 2) {
        if (cutoff >= sampleRate / 2) {
            throw new SignalProcessingError(`Cutoff frequency ${cutoff} must be less than Nyquist frequency ${sampleRate / 2}`);
        }
        const nyquist = sampleRate / 2;
        const normalizedCutoff = cutoff / nyquist;
        const { a, b } = SignalProcessing.butterworth(normalizedCutoff, order, 'low');
        return SignalProcessing.applyIIRFilter(data, a, b);
    }
    static highPassFilter(data, cutoff, sampleRate, order = 2) {
        if (cutoff >= sampleRate / 2) {
            throw new SignalProcessingError(`Cutoff frequency ${cutoff} must be less than Nyquist frequency ${sampleRate / 2}`);
        }
        const nyquist = sampleRate / 2;
        const normalizedCutoff = cutoff / nyquist;
        const { a, b } = SignalProcessing.butterworth(normalizedCutoff, order, 'high');
        return SignalProcessing.applyIIRFilter(data, a, b);
    }
    static bandPassFilter(data, centerFreq, bandwidth, sampleRate, order = 2) {
        const lowFreq = Math.max(10, centerFreq - bandwidth / 2);
        const highFreq = Math.min(sampleRate / 2 - 10, centerFreq + bandwidth / 2);
        if (lowFreq >= highFreq) {
            throw new SignalProcessingError('Invalid band-pass parameters: low frequency >= high frequency');
        }
        const highPassed = SignalProcessing.highPassFilter(data, lowFreq, sampleRate, order);
        return SignalProcessing.lowPassFilter(highPassed, highFreq, sampleRate, order);
    }
    static notchFilter(data, freq, sampleRate, q = 10) {
        const w = SignalProcessing.TWO_PI * freq / sampleRate;
        const cosW = Math.cos(w);
        const sinW = Math.sin(w);
        const alpha = sinW / (2 * q);
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
    static computeFFT(data) {
        const N = data.length;
        const paddedLength = this.nextPowerOf2(N);
        const paddedData = new Float32Array(paddedLength);
        paddedData.set(data);
        const complexData = [];
        for (let i = 0; i < paddedLength; i++) {
            complexData.push({ real: paddedData[i], imag: 0 });
        }
        this.fftRecursive(complexData);
        return complexData.slice(0, Math.floor(N / 2) + 1);
    }
    static computeFFTMagnitude(data) {
        const fftResult = this.computeFFT(data);
        const magnitude = new Float32Array(fftResult.length);
        for (let i = 0; i < fftResult.length; i++) {
            const { real, imag } = fftResult[i];
            magnitude[i] = Math.sqrt(real * real + imag * imag);
        }
        return magnitude;
    }
    static computePSD(data, sampleRate) {
        const fftResult = this.computeFFT(data);
        const N = data.length;
        const psd = new Float32Array(fftResult.length);
        const frequencies = new Float32Array(fftResult.length);
        const freqResolution = sampleRate / N;
        for (let i = 0; i < fftResult.length; i++) {
            const { real, imag } = fftResult[i];
            const magnitude = real * real + imag * imag;
            psd[i] = magnitude / (sampleRate * N);
            frequencies[i] = i * freqResolution;
        }
        return { frequencies, psd };
    }
    static computeMFCC(data, sampleRate, numCoeffs = 13, numFilters = 26) {
        const preEmphasized = this.preEmphasis(data);
        const powerSpectrum = this.computeFFTMagnitude(preEmphasized);
        const melFiltered = this.melFilterBank(powerSpectrum, sampleRate, numFilters);
        const logMel = melFiltered.map(x => Math.log(Math.max(x, this.EPSILON)));
        return this.dct(new Float32Array(logMel), numCoeffs);
    }
    static hanningWindow(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.5 * (1 - Math.cos(this.TWO_PI * i / (size - 1)));
        }
        return window;
    }
    static hammingWindow(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.54 - 0.46 * Math.cos(this.TWO_PI * i / (size - 1));
        }
        return window;
    }
    static blackmanWindow(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            const n = i / (size - 1);
            window[i] = 0.42 - 0.5 * Math.cos(this.TWO_PI * n) + 0.08 * Math.cos(4 * this.PI * n);
        }
        return window;
    }
    static rectangularWindow(size) {
        return new Float32Array(size).fill(1.0);
    }
    static kaisserWindow(size, beta = 8.6) {
        const window = new Float32Array(size);
        const i0Beta = this.besseli0(beta);
        for (let i = 0; i < size; i++) {
            const n = i - (size - 1) / 2;
            const arg = beta * Math.sqrt(1 - (2 * n / (size - 1)) ** 2);
            window[i] = this.besseli0(arg) / i0Beta;
        }
        return window;
    }
    static autocorrelation(data, maxLag) {
        const N = data.length;
        const maxLagActual = maxLag || N - 1;
        const result = new Float32Array(maxLagActual + 1);
        for (let lag = 0; lag <= maxLagActual; lag++) {
            let sum = 0;
            for (let i = 0; i < N - lag; i++) {
                sum += data[i] * data[i + lag];
            }
            result[lag] = sum / (N - lag);
        }
        return result;
    }
    static crossCorrelation(x, y) {
        const N = Math.max(x.length, y.length);
        const result = new Float32Array(2 * N - 1);
        const offset = N - 1;
        for (let lag = -(N - 1); lag <= N - 1; lag++) {
            let sum = 0;
            for (let i = 0; i < N; i++) {
                const xi = i < x.length ? x[i] : 0;
                const yi = i + lag >= 0 && i + lag < y.length ? y[i + lag] : 0;
                sum += xi * yi;
            }
            result[lag + offset] = sum;
        }
        return result;
    }
    static zeroCrossingRate(data) {
        let crossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i - 1] >= 0) !== (data[i] >= 0)) {
                crossings++;
            }
        }
        return crossings / (data.length - 1);
    }
    static spectralCentroid(spectrum, sampleRate) {
        let weightedSum = 0;
        let magnitudeSum = 0;
        const freqResolution = sampleRate / (2 * (spectrum.length - 1));
        for (let i = 0; i < spectrum.length; i++) {
            const frequency = i * freqResolution;
            weightedSum += frequency * spectrum[i];
            magnitudeSum += spectrum[i];
        }
        return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    }
    static spectralRolloff(spectrum, sampleRate, threshold = 0.85) {
        const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
        const thresholdEnergy = totalEnergy * threshold;
        const freqResolution = sampleRate / (2 * (spectrum.length - 1));
        let cumulativeEnergy = 0;
        for (let i = 0; i < spectrum.length; i++) {
            cumulativeEnergy += spectrum[i];
            if (cumulativeEnergy >= thresholdEnergy) {
                return i * freqResolution;
            }
        }
        return (spectrum.length - 1) * freqResolution;
    }
    static spectralFlux(spectrum1, spectrum2) {
        const minLength = Math.min(spectrum1.length, spectrum2.length);
        let flux = 0;
        for (let i = 0; i < minLength; i++) {
            const diff = spectrum2[i] - spectrum1[i];
            if (diff > 0) {
                flux += diff * diff;
            }
        }
        return Math.sqrt(flux);
    }
    static butterworth(cutoff, order, type) {
        if (order === 1) {
            const c = Math.tan(this.PI * cutoff / 2);
            const a1 = (c - 1) / (c + 1);
            const b0 = c / (c + 1);
            const b1 = b0;
            if (type === 'low') {
                return { a: [1, a1], b: [b0, b1] };
            }
            else {
                return { a: [1, a1], b: [b0, -b1] };
            }
        }
        else if (order === 2) {
            const c = 1 / Math.tan(this.PI * cutoff / 2);
            const c2 = c * c;
            const sqrt2c = Math.sqrt(2) * c;
            const a0 = 1 + sqrt2c + c2;
            if (type === 'low') {
                return {
                    a: [1, (2 - 2 * c2) / a0, (1 - sqrt2c + c2) / a0],
                    b: [1 / a0, 2 / a0, 1 / a0]
                };
            }
            else {
                return {
                    a: [1, (2 - 2 * c2) / a0, (1 - sqrt2c + c2) / a0],
                    b: [c2 / a0, -2 * c2 / a0, c2 / a0]
                };
            }
        }
        else {
            throw new SignalProcessingError(`Order ${order} Butterworth filter not implemented. Use order 1 or 2.`);
        }
    }
    static applyIIRFilter(data, a, b) {
        const result = new Float32Array(data.length);
        const order = Math.max(a.length, b.length) - 1;
        const w = new Array(order + 1).fill(0);
        for (let n = 0; n < data.length; n++) {
            for (let i = order; i > 0; i--) {
                w[i] = w[i - 1];
            }
            w[0] = data[n];
            for (let i = 1; i <= order && i < a.length; i++) {
                w[0] -= a[i] * w[i];
            }
            result[n] = 0;
            for (let i = 0; i <= order && i < b.length; i++) {
                result[n] += b[i] * w[i];
            }
        }
        return result;
    }
    static fftRecursive(x) {
        const N = x.length;
        if (N <= 1)
            return;
        const even = [];
        const odd = [];
        for (let i = 0; i < N; i++) {
            if (i % 2 === 0) {
                even.push(x[i]);
            }
            else {
                odd.push(x[i]);
            }
        }
        this.fftRecursive(even);
        this.fftRecursive(odd);
        for (let k = 0; k < N / 2; k++) {
            const t = this.complexMul({ real: Math.cos(-this.TWO_PI * k / N), imag: Math.sin(-this.TWO_PI * k / N) }, odd[k]);
            x[k] = this.complexAdd(even[k], t);
            x[k + N / 2] = this.complexSub(even[k], t);
        }
    }
    static complexAdd(a, b) {
        return { real: a.real + b.real, imag: a.imag + b.imag };
    }
    static complexSub(a, b) {
        return { real: a.real - b.real, imag: a.imag - b.imag };
    }
    static complexMul(a, b) {
        return {
            real: a.real * b.real - a.imag * b.imag,
            imag: a.real * b.imag + a.imag * b.real
        };
    }
    static nextPowerOf2(n) {
        return Math.pow(2, Math.ceil(Math.log2(n)));
    }
    static preEmphasis(data, alpha = 0.97) {
        const result = new Float32Array(data.length);
        result[0] = data[0];
        for (let i = 1; i < data.length; i++) {
            result[i] = data[i] - alpha * data[i - 1];
        }
        return result;
    }
    static melFilterBank(powerSpectrum, sampleRate, numFilters) {
        const nfft = (powerSpectrum.length - 1) * 2;
        const lowFreqMel = this.hzToMel(0);
        const highFreqMel = this.hzToMel(sampleRate / 2);
        const melPoints = new Array(numFilters + 2);
        for (let i = 0; i < numFilters + 2; i++) {
            melPoints[i] = lowFreqMel + (highFreqMel - lowFreqMel) * i / (numFilters + 1);
        }
        const hzPoints = melPoints.map(mel => this.melToHz(mel));
        const binPoints = hzPoints.map(hz => Math.floor((nfft + 1) * hz / sampleRate));
        const filterBank = new Array(numFilters).fill(0);
        for (let m = 0; m < numFilters; m++) {
            const leftBin = binPoints[m];
            const centerBin = binPoints[m + 1];
            const rightBin = binPoints[m + 2];
            for (let k = leftBin; k < rightBin; k++) {
                if (k < powerSpectrum.length) {
                    let weight = 0;
                    if (k >= leftBin && k <= centerBin) {
                        weight = (k - leftBin) / (centerBin - leftBin);
                    }
                    else if (k >= centerBin && k <= rightBin) {
                        weight = (rightBin - k) / (rightBin - centerBin);
                    }
                    filterBank[m] += powerSpectrum[k] * weight;
                }
            }
        }
        return filterBank;
    }
    static hzToMel(hz) {
        return 2595 * Math.log10(1 + hz / 700);
    }
    static melToHz(mel) {
        return 700 * (Math.pow(10, mel / 2595) - 1);
    }
    static dct(input, numCoeffs) {
        const N = input.length;
        const result = new Float32Array(numCoeffs);
        for (let k = 0; k < numCoeffs; k++) {
            let sum = 0;
            for (let n = 0; n < N; n++) {
                sum += input[n] * Math.cos(this.PI * k * (n + 0.5) / N);
            }
            result[k] = sum * Math.sqrt(2 / N);
            if (k === 0) {
                result[k] *= Math.sqrt(0.5);
            }
        }
        return result;
    }
    static besseli0(x) {
        let result = 1;
        let term = 1;
        for (let i = 1; i < 20; i++) {
            term *= (x / 2) * (x / 2) / (i * i);
            result += term;
            if (term < 1e-10)
                break;
        }
        return result;
    }
}
Object.defineProperty(SignalProcessing, "PI", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: Math.PI
});
Object.defineProperty(SignalProcessing, "TWO_PI", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 2 * Math.PI
});
Object.defineProperty(SignalProcessing, "EPSILON", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 1e-10
});

let audioDecodeLib = null;
let audioDecodersLib = null;
const getAudioDecodeLib = async () => {
    if (!audioDecodeLib) {
        try {
            const { default: decodeAudio, decoders } = await import('audio-decode');
            audioDecodeLib = decodeAudio;
            audioDecodersLib = decoders;
        }
        catch (error) {
            console.warn('audio-decode library not available, falling back to Web Audio API and manual decoding');
            return null;
        }
    }
    return { decode: audioDecodeLib, decoders: audioDecodersLib };
};
class AudioLoadError extends Error {
    constructor(message, cause) {
        super(message);
        Object.defineProperty(this, "cause", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cause
        });
        this.name = 'AudioLoadError';
    }
}
class AudioFormatError extends Error {
    constructor(message, format) {
        super(message);
        Object.defineProperty(this, "format", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: format
        });
        this.name = 'AudioFormatError';
    }
}
class AudioProcessingError extends Error {
    constructor(message, operation) {
        super(message);
        Object.defineProperty(this, "operation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: operation
        });
        this.name = 'AudioProcessingError';
    }
}
class AudioProcessor {
    constructor(config) {
        Object.defineProperty(this, "sampleRate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "enableNormalization", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "enableFiltering", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.sampleRate = config?.sampleRate ?? AudioProcessor.STANDARD_SAMPLE_RATE;
        this.enableNormalization = config?.enableNormalization ?? true;
        this.enableFiltering = config?.enableFiltering ?? false;
    }
    async loadFile(filePath) {
        const audioBuffer = await AudioProcessor.loadFile(filePath, {
            targetSampleRate: this.sampleRate,
            normalize: this.enableNormalization
        });
        return audioBuffer.getChannelData(0);
    }
    async processBuffer(buffer) {
        const audioBuffer = await AudioProcessor.loadAudioFromBuffer(buffer, {
            targetSampleRate: this.sampleRate,
            normalize: this.enableNormalization
        });
        return audioBuffer.getChannelData(0);
    }
    async normalize(audioData) {
        if (!this.enableNormalization) {
            return audioData;
        }
        return AudioProcessor.normalizeAudioData(audioData);
    }
    async applyFilters(audioData) {
        if (!this.enableFiltering) {
            return audioData;
        }
        return AudioProcessor.applyAudioFilters(audioData, {
            lowFrequency: 80,
            highFrequency: 8000,
            filterType: 'bandpass'
        });
    }
    static normalizeAudioData(audioData) {
        const normalized = new Float32Array(audioData.length);
        let max = 0;
        for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > max)
                max = abs;
        }
        if (max > 0 && max !== 1) {
            const scale = 1 / max;
            for (let i = 0; i < audioData.length; i++) {
                normalized[i] = audioData[i] * scale;
            }
        }
        else {
            normalized.set(audioData);
        }
        return normalized;
    }
    static applyAudioFilters(audioData, options) {
        return new Float32Array(audioData);
    }
    static async loadAudio(input, options = {}) {
        try {
            const startTime = performance.now();
            let audioBuffer;
            if (typeof input === 'string') {
                audioBuffer = await this.loadAudioFromFile(input, options);
            }
            else {
                audioBuffer = await this.loadAudioFromBuffer(input, options);
            }
            const loadTime = performance.now() - startTime;
            if (options.debug) {
                console.debug(`Audio loaded in ${loadTime.toFixed(2)}ms`);
            }
            return audioBuffer;
        }
        catch (error) {
            if (error instanceof AudioLoadError) {
                throw error;
            }
            throw new AudioLoadError(`Failed to load audio: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
        }
    }
    static async loadFile(filePath, options = {}) {
        return this.loadAudio(filePath, options);
    }
    static async loadAudioFromFile(filePath, options = {}) {
        try {
            if (typeof process === 'undefined' || !process.versions?.node) {
                throw new AudioLoadError('File loading requires Node.js environment');
            }
            const formatInfo = this.detectAudioFormat(filePath);
            if (!formatInfo.isSupported) {
                throw new AudioFormatError(`Unsupported audio format: ${formatInfo.extension}. Supported formats: ${this.SUPPORTED_FORMATS.join(', ')}`, formatInfo.extension);
            }
            const fs = await import('fs');
            const path = await import('path');
            this.validateAudioFile(filePath, fs);
            const fileBuffer = fs.readFileSync(filePath);
            const stats = fs.statSync(filePath);
            if (options.debug) {
                console.debug(`Loaded file: ${path.basename(filePath)} (${stats.size} bytes, format: ${formatInfo.extension})`);
            }
            const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
            return await this.loadAudioFromBuffer(arrayBuffer, { ...options, detectedFormat: formatInfo });
        }
        catch (error) {
            if (error instanceof AudioLoadError || error instanceof AudioFormatError) {
                throw error;
            }
            throw new AudioLoadError(`Failed to load audio file: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
        }
    }
    static async loadAudioFromBuffer(buffer, options = {}) {
        try {
            let arrayBuffer;
            arrayBuffer = this.normalizeBufferToArrayBuffer(buffer);
            if (arrayBuffer.byteLength === 0) {
                throw new AudioLoadError('Empty audio buffer');
            }
            this.validateAudioBuffer(arrayBuffer, options.detectedFormat);
            if (options.preferredDecoder) {
                const result = await this.tryPreferredDecoder(arrayBuffer, options);
                if (result)
                    return result;
            }
            const audioDecodeResult = await this.loadWithAudioDecode(arrayBuffer, options);
            if (audioDecodeResult) {
                return audioDecodeResult;
            }
            if (this.hasWebAudioAPI()) {
                const webAudioResult = await this.loadWithWebAudioAPI(arrayBuffer, options);
                if (webAudioResult) {
                    return webAudioResult;
                }
            }
            return await this.loadWithManualDecoding(arrayBuffer, options);
        }
        catch (error) {
            if (error instanceof AudioLoadError || error instanceof AudioFormatError) {
                throw error;
            }
            throw new AudioLoadError(`Failed to decode audio buffer: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
        }
    }
    static async tryPreferredDecoder(arrayBuffer, options) {
        try {
            switch (options.preferredDecoder) {
                case 'audio-decode':
                    return await this.loadWithAudioDecode(arrayBuffer, options);
                case 'web-audio':
                    return this.hasWebAudioAPI() ? await this.loadWithWebAudioAPI(arrayBuffer, options) : null;
                case 'manual':
                    return await this.loadWithManualDecoding(arrayBuffer, options);
                default:
                    return null;
            }
        }
        catch (error) {
            if (options.debug) {
                console.debug(`Preferred decoder ${options.preferredDecoder} failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            return null;
        }
    }
    static async loadWithAudioDecode(arrayBuffer, options = {}) {
        try {
            const audioDecodeLib = await getAudioDecodeLib();
            if (!audioDecodeLib) {
                if (options.debug) {
                    console.debug('audio-decode library not available, skipping');
                }
                return null;
            }
            if (options.debug) {
                console.debug('Attempting to decode with audio-decode library');
            }
            const startTime = performance.now();
            const decodedBuffer = await audioDecodeLib.decode(arrayBuffer);
            if (!decodedBuffer || decodedBuffer.length === 0) {
                if (options.debug) {
                    console.debug('audio-decode returned empty buffer');
                }
                return null;
            }
            const decodeTime = performance.now() - startTime;
            if (options.debug) {
                console.debug(`audio-decode completed in ${decodeTime.toFixed(2)}ms`);
            }
            return this.processDecodedAudioBuffer(decodedBuffer, options);
        }
        catch (error) {
            if (options.debug) {
                console.debug(`audio-decode failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            return null;
        }
    }
    static async loadWithWebAudioAPI(arrayBuffer, options) {
        try {
            const AudioCtx = AudioContext || globalThis.webkitAudioContext;
            if (!AudioCtx) {
                return null;
            }
            if (options.debug) {
                console.debug('Attempting to decode with Web Audio API');
            }
            const audioContext = new AudioCtx();
            try {
                const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                if (decodedBuffer.length === 0) {
                    return null;
                }
                if (options.debug) {
                    console.debug('Web Audio API decode successful');
                }
                return this.processDecodedAudioBuffer(decodedBuffer, options);
            }
            finally {
                if (audioContext.state !== 'closed') {
                    await audioContext.close();
                }
            }
        }
        catch (error) {
            if (options.debug) {
                console.debug(`Web Audio API failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            return null;
        }
    }
    static async loadWithManualDecoding(arrayBuffer, options) {
        if (options.debug) {
            console.debug('Attempting manual decoding (WAV only)');
        }
        const dataView = new DataView(arrayBuffer);
        if (dataView.getUint32(0, false) === 0x52494646 &&
            dataView.getUint32(8, false) === 0x57415645) {
            if (options.debug) {
                console.debug('Manual WAV decoding successful');
            }
            return this.decodeWAV(arrayBuffer, options);
        }
        throw new AudioFormatError('No suitable audio decoder available. Please ensure audio-decode library is installed or use Web Audio API compatible formats.');
    }
    static decodeWAV(arrayBuffer, options) {
        const dataView = new DataView(arrayBuffer);
        const wavInfo = this.parseWAVHeader(dataView, arrayBuffer.byteLength);
        const samples = this.extractWAVSamples(dataView, wavInfo);
        let finalSamples = samples;
        let finalChannels = wavInfo.channels;
        if (wavInfo.channels > 1 && options.forceMono !== false) {
            const monoResult = this.convertToMono(samples, wavInfo.channels);
            finalSamples = monoResult.samples;
            finalChannels = monoResult.channels;
        }
        if (options.normalize) {
            finalSamples = AudioUtils.normalize(finalSamples);
        }
        return {
            data: finalSamples,
            sampleRate: wavInfo.sampleRate,
            channels: finalChannels,
            duration: finalSamples.length / wavInfo.sampleRate
        };
    }
    static mixToMono(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const monoData = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            let sum = 0;
            for (let ch = 0; ch < channels; ch++) {
                sum += audioBuffer.getChannelData(ch)[i];
            }
            monoData[i] = sum / channels;
        }
        return monoData;
    }
    static standardizeAudio(audioBuffer, targetSampleRate = this.STANDARD_SAMPLE_RATE) {
        try {
            let processedData = audioBuffer.data;
            let sampleRate = audioBuffer.sampleRate;
            let channels = audioBuffer.channels;
            if (channels > 1) {
                console.debug('Audio already converted to mono during loading');
            }
            if (sampleRate !== targetSampleRate) {
                console.debug(`Resampling from ${sampleRate}Hz to ${targetSampleRate}Hz`);
                processedData = SignalProcessing.resample(processedData, sampleRate, targetSampleRate);
                sampleRate = targetSampleRate;
            }
            if (processedData.length === 0) {
                throw new AudioProcessingError('Standardized audio is empty');
            }
            return {
                data: processedData,
                sampleRate,
                channels: 1,
                duration: processedData.length / sampleRate
            };
        }
        catch (error) {
            throw new AudioProcessingError(`Failed to standardize audio: ${error instanceof Error ? error.message : String(error)}`, 'standardize');
        }
    }
    static applyFilter(audioData, filterOptions, sampleRate) {
        try {
            const data = AudioUtils.toFloat32Array(audioData);
            if (data.length === 0) {
                throw new AudioProcessingError('Empty audio data provided to filter');
            }
            if (filterOptions.cutoff <= 0 || filterOptions.cutoff >= sampleRate / 2) {
                throw new AudioProcessingError(`Invalid cutoff frequency: ${filterOptions.cutoff}Hz (must be > 0 and < ${sampleRate / 2}Hz)`);
            }
            const order = filterOptions.order || 2;
            switch (filterOptions.type) {
                case 'lowpass':
                    return SignalProcessing.lowPassFilter(data, filterOptions.cutoff, sampleRate, order);
                case 'highpass':
                    return SignalProcessing.highPassFilter(data, filterOptions.cutoff, sampleRate, order);
                case 'bandpass':
                    if (!filterOptions.bandwidth || filterOptions.bandwidth <= 0) {
                        throw new AudioProcessingError('Bandpass filter requires positive bandwidth');
                    }
                    return SignalProcessing.bandPassFilter(data, filterOptions.cutoff, filterOptions.bandwidth, sampleRate, order);
                default:
                    throw new AudioProcessingError(`Unknown filter type: ${filterOptions.type}`);
            }
        }
        catch (error) {
            if (error instanceof AudioProcessingError) {
                throw error;
            }
            throw new AudioProcessingError(`Filter application failed: ${error instanceof Error ? error.message : String(error)}`, 'filter');
        }
    }
    static extractFeatures(audioData, sampleRate, windowSize = 1024) {
        try {
            const data = AudioUtils.toFloat32Array(audioData);
            if (data.length === 0) {
                throw new AudioProcessingError('Empty audio data provided for feature extraction');
            }
            if (windowSize > data.length) {
                console.warn(`Window size ${windowSize} larger than audio data length ${data.length}, using full data`);
                windowSize = data.length;
            }
            return {
                rms: AudioUtils.calculateRMS(data),
                spectralCentroid: this.calculateSpectralCentroid(data, sampleRate, windowSize),
                zcr: this.calculateZeroCrossingRate(data),
                spectralRolloff: this.calculateSpectralRolloff(data, sampleRate, windowSize)
            };
        }
        catch (error) {
            throw new AudioProcessingError(`Feature extraction failed: ${error instanceof Error ? error.message : String(error)}`, 'feature_extraction');
        }
    }
    static extractFrameFeatures(audioData, sampleRate, windowSize = 1024, hopSize = 512) {
        try {
            const frames = this.frameAudio(audioData, windowSize, hopSize);
            const features = [];
            for (const frame of frames) {
                features.push(this.extractFeatures(frame, sampleRate, windowSize));
            }
            return features;
        }
        catch (error) {
            throw new AudioProcessingError(`Frame feature extraction failed: ${error instanceof Error ? error.message : String(error)}`, 'frame_features');
        }
    }
    static frameAudio(audioData, windowSize, hopSize, padLast = false) {
        try {
            const data = AudioUtils.toFloat32Array(audioData);
            const frames = [];
            if (windowSize <= 0 || hopSize <= 0) {
                throw new AudioProcessingError('Window size and hop size must be positive');
            }
            if (windowSize > data.length) {
                throw new AudioProcessingError(`Window size ${windowSize} larger than audio data length ${data.length}`);
            }
            for (let i = 0; i <= data.length - windowSize; i += hopSize) {
                const frame = data.slice(i, i + windowSize);
                frames.push(frame);
            }
            if (padLast && (data.length % hopSize) > 0) {
                const lastFrameStart = Math.floor(data.length / hopSize) * hopSize;
                if (lastFrameStart < data.length) {
                    const lastFrame = new Float32Array(windowSize);
                    const remainingData = data.slice(lastFrameStart);
                    lastFrame.set(remainingData);
                    frames.push(lastFrame);
                }
            }
            return frames;
        }
        catch (error) {
            throw new AudioProcessingError(`Audio framing failed: ${error instanceof Error ? error.message : String(error)}`, 'framing');
        }
    }
    static applyWindow(frame, windowType = 'hanning') {
        try {
            const windowed = new Float32Array(frame.length);
            let window;
            switch (windowType) {
                case 'hanning':
                    window = SignalProcessing.hanningWindow(frame.length);
                    break;
                case 'hamming':
                    window = SignalProcessing.hammingWindow(frame.length);
                    break;
                case 'blackman':
                    window = SignalProcessing.blackmanWindow(frame.length);
                    break;
                case 'rectangular':
                    window = SignalProcessing.rectangularWindow(frame.length);
                    break;
                default:
                    throw new AudioProcessingError(`Unknown window type: ${windowType}`);
            }
            for (let i = 0; i < frame.length; i++) {
                windowed[i] = frame[i] * window[i];
            }
            return windowed;
        }
        catch (error) {
            throw new AudioProcessingError(`Window application failed: ${error instanceof Error ? error.message : String(error)}`, 'windowing');
        }
    }
    static computeSpectrum(frame) {
        try {
            return SignalProcessing.computeFFTMagnitude(frame);
        }
        catch (error) {
            throw new AudioProcessingError(`Spectrum computation failed: ${error instanceof Error ? error.message : String(error)}`, 'spectrum');
        }
    }
    static computePowerSpectrum(frame) {
        try {
            const spectrum = this.computeSpectrum(frame);
            const powerSpectrum = new Float32Array(spectrum.length);
            for (let i = 0; i < spectrum.length; i++) {
                powerSpectrum[i] = spectrum[i] * spectrum[i];
            }
            return powerSpectrum;
        }
        catch (error) {
            throw new AudioProcessingError(`Power spectrum computation failed: ${error instanceof Error ? error.message : String(error)}`, 'power_spectrum');
        }
    }
    static computeMFCC(frame, sampleRate, numCoeffs = 13, numFilters = 26) {
        try {
            return SignalProcessing.computeMFCC(frame, sampleRate, numCoeffs, numFilters);
        }
        catch (error) {
            throw new AudioProcessingError(`MFCC computation failed: ${error instanceof Error ? error.message : String(error)}`, 'mfcc');
        }
    }
    static async *streamAudio(audioData, chunkSize = this.MAX_CHUNK_SIZE, processingFunction) {
        try {
            const data = AudioUtils.toFloat32Array(audioData);
            const sampleRate = 44100;
            let chunkIndex = 0;
            for (let i = 0; i < data.length; i += chunkSize) {
                const end = Math.min(i + chunkSize, data.length);
                let chunk = data.slice(i, end);
                if (processingFunction) {
                    chunk = processingFunction(chunk, chunkIndex);
                }
                yield {
                    data: chunk,
                    startTime: i / sampleRate,
                    duration: chunk.length / sampleRate,
                    index: chunkIndex,
                    isFinal: end >= data.length
                };
                chunkIndex++;
            }
        }
        catch (error) {
            throw new AudioProcessingError(`Audio streaming failed: ${error instanceof Error ? error.message : String(error)}`, 'streaming');
        }
    }
    static getAudioInfo(audioBuffer) {
        return {
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.channels,
            samples: audioBuffer.data.length,
            bitDepth: 32,
            size: audioBuffer.data.length * 4
        };
    }
    static validateAudioBuffer(audioBuffer) {
        return (audioBuffer.data.length > 0 &&
            audioBuffer.sampleRate > 0 &&
            audioBuffer.channels > 0 &&
            audioBuffer.duration > 0 &&
            !audioBuffer.data.some(sample => !isFinite(sample)));
    }
    static detectAudioFormat(input) {
        let extension = '';
        if (typeof input === 'string') {
            extension = input.split('.').pop()?.toLowerCase() || '';
        }
        else {
            const bytes = new Uint8Array(input.slice(0, 16));
            if (bytes.length >= 4) {
                if ((bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) ||
                    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)) {
                    extension = 'mp3';
                }
                else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
                    extension = 'wav';
                }
                else if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
                    extension = 'flac';
                }
                else if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
                    extension = 'ogg';
                }
                else if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
                    extension = 'm4a';
                }
            }
        }
        let category = 'unsupported';
        let confidence = 0;
        if (this.AUDIO_DECODE_FORMATS.includes(extension)) {
            category = 'primary';
            confidence = 0.9;
        }
        else if (this.PARTIAL_SUPPORT_FORMATS.includes(extension)) {
            category = 'partial';
            confidence = 0.6;
        }
        else if (this.FALLBACK_FORMATS.includes(extension)) {
            category = 'fallback';
            confidence = 0.4;
        }
        return {
            extension,
            isSupported: category !== 'unsupported',
            confidence,
            category
        };
    }
    static validateAudioFile(filePath, fs) {
        if (!fs.existsSync(filePath)) {
            throw new AudioLoadError(`Audio file not found: ${filePath}`);
        }
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            throw new AudioLoadError(`Path is not a file: ${filePath}`);
        }
        if (stats.size === 0) {
            throw new AudioLoadError(`Audio file is empty: ${filePath}`);
        }
        if (stats.size > 500 * 1024 * 1024) {
            console.warn(`Large audio file detected: ${stats.size} bytes`);
        }
    }
    static validateAudioBuffer(arrayBuffer, formatInfo) {
        if (arrayBuffer.byteLength === 0) {
            throw new AudioLoadError('Empty audio buffer');
        }
        if (arrayBuffer.byteLength < 44) {
            throw new AudioLoadError('Audio buffer too small to contain valid audio data');
        }
        if (formatInfo?.extension === 'wav') {
            const dataView = new DataView(arrayBuffer);
            if (dataView.getUint32(0, false) !== 0x52494646) {
                throw new AudioFormatError('Invalid WAV file header');
            }
        }
    }
    static normalizeBufferToArrayBuffer(buffer) {
        if (buffer instanceof ArrayBuffer) {
            return buffer;
        }
        else if (buffer instanceof Uint8Array) {
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }
        else if (typeof Buffer !== 'undefined' && buffer instanceof Buffer) {
            const nodeBuffer = buffer;
            return nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
        }
        else {
            throw new AudioFormatError('Unsupported buffer type');
        }
    }
    static processDecodedAudioBuffer(decodedBuffer, options) {
        let audioData;
        let sampleRate;
        let channels;
        let duration;
        if (decodedBuffer.getChannelData) {
            sampleRate = decodedBuffer.sampleRate;
            channels = decodedBuffer.numberOfChannels;
            duration = decodedBuffer.duration;
            if (channels === 1 || options.forceMono !== false) {
                audioData = channels === 1 ? decodedBuffer.getChannelData(0) : this.mixToMono(decodedBuffer);
            }
            else {
                audioData = decodedBuffer.getChannelData(0);
            }
        }
        else if (decodedBuffer.data || decodedBuffer.length) {
            sampleRate = decodedBuffer.sampleRate || 44100;
            channels = decodedBuffer.numberOfChannels || 1;
            duration = decodedBuffer.duration || (decodedBuffer.length / sampleRate);
            if (decodedBuffer.getChannelData) {
                audioData = channels === 1 ? decodedBuffer.getChannelData(0) : this.mixToMono(decodedBuffer);
            }
            else {
                audioData = decodedBuffer.data || decodedBuffer;
            }
        }
        else {
            throw new AudioLoadError('Unknown decoded buffer format');
        }
        if (!(audioData instanceof Float32Array)) {
            audioData = new Float32Array(audioData);
        }
        const maxAbs = Math.max(...Array.from(audioData).map(Math.abs));
        if (maxAbs > 1.0) {
            if (options.debug) {
                console.debug(`Audio data exceeds [-1, 1] range (max: ${maxAbs}), normalizing...`);
            }
            for (let i = 0; i < audioData.length; i++) {
                audioData[i] = audioData[i] / maxAbs;
            }
        }
        if (options.normalize) {
            audioData = AudioUtils.normalize(audioData);
        }
        return {
            data: audioData,
            sampleRate,
            channels: options.forceMono !== false ? 1 : channels,
            duration
        };
    }
    static parseWAVHeader(dataView, totalLength) {
        let offset = 12;
        let sampleRate = 44100;
        let channels = 1;
        let bitsPerSample = 16;
        let dataOffset = 0;
        let dataSize = 0;
        while (offset < totalLength - 8) {
            const chunkId = dataView.getUint32(offset, false);
            const chunkSize = dataView.getUint32(offset + 4, true);
            if (chunkId === 0x666d7420) {
                if (chunkSize >= 16) {
                    const audioFormat = dataView.getUint16(offset + 8, true);
                    if (audioFormat !== 1 && audioFormat !== 3) {
                        throw new AudioFormatError(`Unsupported WAV format: ${audioFormat}`);
                    }
                    channels = dataView.getUint16(offset + 10, true);
                    sampleRate = dataView.getUint32(offset + 12, true);
                    bitsPerSample = dataView.getUint16(offset + 22, true);
                    if (channels < 1 || channels > 32) {
                        throw new AudioFormatError(`Invalid channel count: ${channels}`);
                    }
                    if (sampleRate < 8000 || sampleRate > 192000) {
                        throw new AudioFormatError(`Invalid sample rate: ${sampleRate}`);
                    }
                    if (![8, 16, 24, 32].includes(bitsPerSample)) {
                        throw new AudioFormatError(`Unsupported bit depth: ${bitsPerSample}`);
                    }
                }
            }
            else if (chunkId === 0x64617461) {
                dataOffset = offset + 8;
                dataSize = chunkSize;
                break;
            }
            offset += 8 + chunkSize;
            if (chunkSize % 2)
                offset += 1;
        }
        if (dataOffset === 0) {
            throw new AudioFormatError('WAV data chunk not found');
        }
        return { sampleRate, channels, bitsPerSample, dataOffset, dataSize };
    }
    static extractWAVSamples(dataView, wavInfo) {
        const bytesPerSample = wavInfo.bitsPerSample / 8;
        const totalSamples = Math.floor(wavInfo.dataSize / bytesPerSample);
        const samples = new Float32Array(totalSamples);
        for (let i = 0; i < totalSamples; i++) {
            const sampleOffset = wavInfo.dataOffset + i * bytesPerSample;
            let sample = 0;
            switch (wavInfo.bitsPerSample) {
                case 8:
                    sample = (dataView.getUint8(sampleOffset) - 128) / 128;
                    break;
                case 16:
                    sample = dataView.getInt16(sampleOffset, true) / 32768;
                    break;
                case 24:
                    const byte1 = dataView.getUint8(sampleOffset);
                    const byte2 = dataView.getUint8(sampleOffset + 1);
                    const byte3 = dataView.getInt8(sampleOffset + 2);
                    const int24 = byte1 | (byte2 << 8) | (byte3 << 16);
                    sample = int24 / 8388608;
                    break;
                case 32:
                    sample = dataView.getFloat32(sampleOffset, true);
                    break;
                default:
                    throw new AudioFormatError(`Unsupported bit depth: ${wavInfo.bitsPerSample}`);
            }
            samples[i] = Math.max(-1, Math.min(1, sample));
        }
        return samples;
    }
    static convertToMono(samples, channels) {
        const monoLength = Math.floor(samples.length / channels);
        const monoSamples = new Float32Array(monoLength);
        for (let i = 0; i < monoLength; i++) {
            let sum = 0;
            for (let ch = 0; ch < channels; ch++) {
                sum += samples[i * channels + ch] || 0;
            }
            monoSamples[i] = sum / channels;
        }
        return { samples: monoSamples, channels: 1 };
    }
    static hasWebAudioAPI() {
        return typeof AudioContext !== 'undefined' ||
            typeof globalThis.webkitAudioContext !== 'undefined';
    }
    static isNodeJS() {
        return typeof process !== 'undefined' &&
            process.versions &&
            typeof process.versions.node === 'string';
    }
    static calculateSpectralCentroid(data, sampleRate, windowSize) {
        const spectrum = this.computeSpectrum(data.slice(0, windowSize));
        let weightedSum = 0;
        let magnitudeSum = 0;
        for (let i = 0; i < spectrum.length; i++) {
            const frequency = (i * sampleRate) / (2 * spectrum.length);
            weightedSum += frequency * spectrum[i];
            magnitudeSum += spectrum[i];
        }
        return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    }
    static calculateZeroCrossingRate(data) {
        let crossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i - 1] >= 0) !== (data[i] >= 0)) {
                crossings++;
            }
        }
        return crossings / (data.length - 1);
    }
    static calculateSpectralRolloff(data, sampleRate, windowSize, rolloffThreshold = 0.85) {
        const spectrum = this.computeSpectrum(data.slice(0, windowSize));
        const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
        const thresholdEnergy = totalEnergy * rolloffThreshold;
        let cumulativeEnergy = 0;
        for (let i = 0; i < spectrum.length; i++) {
            cumulativeEnergy += spectrum[i];
            if (cumulativeEnergy >= thresholdEnergy) {
                return (i * sampleRate) / (2 * spectrum.length);
            }
        }
        return (spectrum.length - 1) * sampleRate / (2 * spectrum.length);
    }
}
Object.defineProperty(AudioProcessor, "STANDARD_SAMPLE_RATE", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 44100
});
Object.defineProperty(AudioProcessor, "STANDARD_CHANNELS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 1
});
Object.defineProperty(AudioProcessor, "MAX_CHUNK_SIZE", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 1024 * 1024
});
Object.defineProperty(AudioProcessor, "SUPPORTED_FORMATS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ['mp3', 'wav', 'flac', 'ogg', 'webm', 'm4a', 'aac', 'opus']
});
Object.defineProperty(AudioProcessor, "AUDIO_DECODE_FORMATS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ['mp3', 'wav', 'flac', 'ogg', 'opus']
});
Object.defineProperty(AudioProcessor, "PARTIAL_SUPPORT_FORMATS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ['m4a', 'aac', 'alac']
});
Object.defineProperty(AudioProcessor, "FALLBACK_FORMATS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ['webm']
});

class OnsetDetection {
    constructor(config = {}) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = config;
    }
    detectOnsets(audioData, sampleRate, options = {}) {
        return OnsetDetection.detectOnsets(audioData, sampleRate, options);
    }
    static toFloat32Array(audioData) {
        if (audioData instanceof Float32Array) {
            return audioData;
        }
        return new Float32Array(audioData);
    }
    static detectOnsets(audioData, sampleRate, options = {}) {
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
    static spectralFluxOnsets(audioData, sampleRate, options) {
        const data = this.toFloat32Array(audioData);
        if (this.isAudioSilent(data)) {
            return [];
        }
        const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
        const onsetFunction = this.calculateSpectralFlux(frames, {
            useLogarithmic: true,
            useFrequencyWeighting: true,
            normalizationWindow: 7
        });
        return this.pickPeaks(onsetFunction, sampleRate, options.hopSize, options.threshold, options.minInterval);
    }
    static energyOnsets(audioData, sampleRate, options) {
        const data = this.toFloat32Array(audioData);
        if (this.isAudioSilent(data)) {
            return [];
        }
        const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
        const onsetFunction = this.calculateEnergyDifference(frames, {
            useHighFreqEmphasis: true,
            smoothingWindow: 5,
            adaptiveThreshold: true
        });
        return this.pickPeaks(onsetFunction, sampleRate, options.hopSize, options.threshold, options.minInterval);
    }
    static complexDomainOnsets(audioData, sampleRate, options) {
        const data = this.toFloat32Array(audioData);
        if (this.isAudioSilent(data)) {
            return [];
        }
        const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
        const onsetFunction = this.calculateComplexDomain(frames, {
            phaseWeight: 0.6,
            magnitudeWeight: 0.4,
            usePredictivePhase: true
        }, options.hopSize, options.windowSize);
        return this.pickPeaks(onsetFunction, sampleRate, options.hopSize, options.threshold, options.minInterval);
    }
    static combinedOnsets(audioData, sampleRate, options) {
        const data = this.toFloat32Array(audioData);
        if (this.isAudioSilent(data, 0.001)) {
            return [];
        }
        if (this.isAudioNoise(data, sampleRate)) {
            options.threshold *= 1.5;
            options.minInterval *= 1.2;
        }
        const frames = AudioProcessor.frameAudio(data, options.windowSize, options.hopSize);
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
        const complexDomain = this.calculateComplexDomain(frames, {
            phaseWeight: 0.6,
            magnitudeWeight: 0.4,
            usePredictivePhase: true
        }, options.hopSize, options.windowSize);
        const combined = this.combineOnsetFunctions([
            { function: spectralFlux, weight: this.DEFAULT_COMBINATION_WEIGHTS.spectralFlux, name: 'spectral_flux' },
            { function: energyDiff, weight: this.DEFAULT_COMBINATION_WEIGHTS.energy, name: 'energy' },
            { function: complexDomain, weight: this.DEFAULT_COMBINATION_WEIGHTS.complexDomain, name: 'complex_domain' }
        ], this.DEFAULT_COMBINATION_WEIGHTS);
        return this.pickPeaks(combined, sampleRate, options.hopSize, options.threshold, options.minInterval);
    }
    static calculateSpectralFlux(frames, options = {}) {
        const onsetFunction = new Float32Array(frames.length);
        let previousSpectrum = null;
        const useLogarithmic = options.useLogarithmic ?? true;
        const useFrequencyWeighting = options.useFrequencyWeighting ?? true;
        const normalizationWindow = options.normalizationWindow ?? 7;
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (!frame)
                continue;
            const windowed = AudioProcessor.applyWindow(frame);
            let spectrum = AudioProcessor.computeSpectrum(windowed);
            if (useLogarithmic) {
                spectrum = spectrum.map(val => Math.log(1 + val));
            }
            if (previousSpectrum) {
                let flux = 0;
                const maxBin = Math.min(spectrum.length, Math.floor(spectrum.length * 0.8));
                for (let bin = 1; bin < maxBin; bin++) {
                    const currentVal = spectrum[bin] || 0;
                    const prevVal = previousSpectrum[bin] || 0;
                    const diff = currentVal - prevVal;
                    if (diff > 0) {
                        let weight = 1.0;
                        if (useFrequencyWeighting) {
                            const freqRatio = bin / maxBin;
                            if (freqRatio < 0.1) {
                                weight = 0.5;
                            }
                            else if (freqRatio > 0.1 && freqRatio < 0.5) {
                                weight = 1.0;
                            }
                            else {
                                weight = 0.7;
                            }
                        }
                        flux += diff * diff * weight;
                    }
                }
                onsetFunction[i] = Math.sqrt(flux);
            }
            else {
                onsetFunction[i] = 0;
            }
            previousSpectrum = spectrum;
        }
        if (normalizationWindow > 1) {
            return this.applyLocalNormalization(onsetFunction, normalizationWindow);
        }
        return onsetFunction;
    }
    static calculateEnergyDifference(frames, options = {}) {
        const onsetFunction = new Float32Array(frames.length);
        const useHighFreqEmphasis = options.useHighFreqEmphasis ?? true;
        const smoothingWindow = options.smoothingWindow ?? 5;
        const adaptiveThreshold = options.adaptiveThreshold ?? true;
        const energies = new Float32Array(frames.length);
        const highFreqEnergies = new Float32Array(frames.length);
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (!frame)
                continue;
            energies[i] = this.calculateFrameEnergy(frame);
            if (useHighFreqEmphasis) {
                const windowed = AudioProcessor.applyWindow(frame);
                const spectrum = AudioProcessor.computeSpectrum(windowed);
                const startBin = Math.floor(spectrum.length * 0.3);
                let hfEnergy = 0;
                for (let bin = startBin; bin < spectrum.length; bin++) {
                    hfEnergy += spectrum[bin] * spectrum[bin];
                }
                highFreqEnergies[i] = Math.sqrt(hfEnergy);
            }
        }
        const smoothedEnergies = this.applySmoothingFilter(energies, smoothingWindow);
        const smoothedHFEnergies = useHighFreqEmphasis ?
            this.applySmoothingFilter(highFreqEnergies, smoothingWindow) : highFreqEnergies;
        for (let i = 1; i < frames.length; i++) {
            const currentEnergy = smoothedEnergies[i] || 0;
            const prevEnergy = smoothedEnergies[i - 1] || 0;
            const energyDiff = currentEnergy - prevEnergy;
            let onsetValue = 0;
            if (energyDiff > 0) {
                onsetValue = energyDiff / (prevEnergy + 1e-6);
                if (useHighFreqEmphasis) {
                    const hfDiff = smoothedHFEnergies[i] - smoothedHFEnergies[i - 1];
                    if (hfDiff > 0) {
                        onsetValue += 0.5 * hfDiff / (smoothedHFEnergies[i - 1] + 1e-6);
                    }
                }
                if (adaptiveThreshold) {
                    const localMean = this.calculateLocalMean(smoothedEnergies, i, 10);
                    const localStd = this.calculateLocalStandardDeviation(smoothedEnergies, i, 10, localMean);
                    const threshold = localMean + 0.5 * localStd;
                    if (currentEnergy > threshold) {
                        onsetValue *= 1.5;
                    }
                    else {
                        onsetValue *= 0.5;
                    }
                }
            }
            onsetFunction[i] = onsetValue;
        }
        return onsetFunction;
    }
    static calculateComplexDomain(frames, options = {}, hopSize = 512, windowSize = 1024) {
        const onsetFunction = new Float32Array(frames.length);
        const phaseWeight = options.phaseWeight ?? 0.5;
        const magnitudeWeight = options.magnitudeWeight ?? 0.5;
        const usePredictivePhase = options.usePredictivePhase ?? true;
        let previousMagnitude = null;
        let previousPhase = null;
        let previousPreviousPhase = null;
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (!frame)
                continue;
            const windowed = AudioProcessor.applyWindow(frame);
            const { magnitude, phase } = this.computeComplexSpectrum(windowed);
            if (previousMagnitude && previousPhase) {
                let complexDiff = 0;
                const maxBin = Math.min(magnitude.length, Math.floor(magnitude.length * 0.8));
                for (let bin = 1; bin < maxBin; bin++) {
                    let expectedPhase;
                    if (usePredictivePhase && previousPreviousPhase && i >= 2) {
                        const phase1 = previousPhase[bin] || 0;
                        const phase0 = previousPreviousPhase[bin] || 0;
                        const phaseDelta = this.wrapPhase(phase1 - phase0);
                        expectedPhase = phase1 + phaseDelta;
                    }
                    else {
                        expectedPhase = (previousPhase[bin] || 0) + (bin * Math.PI * hopSize) / windowSize;
                    }
                    const actualPhase = phase[bin] || 0;
                    const phaseDiff = this.wrapPhase(actualPhase - expectedPhase);
                    const magnitudeDiff = (magnitude[bin] || 0) - (previousMagnitude[bin] || 0);
                    const freqWeight = this.getFrequencyWeight(bin, maxBin);
                    const currentMag = magnitude[bin] || 0;
                    const phaseComponent = currentMag * Math.abs(phaseDiff) * phaseWeight;
                    const magComponent = Math.max(0, magnitudeDiff) * magnitudeWeight;
                    complexDiff += (phaseComponent + magComponent) * freqWeight;
                }
                onsetFunction[i] = complexDiff;
            }
            else {
                onsetFunction[i] = 0;
            }
            if (previousPhase) {
                previousPreviousPhase = previousPhase;
            }
            previousMagnitude = magnitude;
            previousPhase = phase;
        }
        return onsetFunction;
    }
    static computeComplexSpectrum(frame) {
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
    static wrapPhase(phase) {
        while (phase > Math.PI)
            phase -= 2 * Math.PI;
        while (phase < -Math.PI)
            phase += 2 * Math.PI;
        return phase;
    }
    static calculateFrameEnergy(frame) {
        let energy = 0;
        for (let i = 0; i < frame.length; i++) {
            energy += frame[i] * frame[i];
        }
        return energy;
    }
    static combineOnsetFunctions(functions, weights) {
        if (functions.length === 0) {
            throw new Error('No onset functions provided');
        }
        const length = functions[0]?.function.length || 0;
        const combined = new Float32Array(length);
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
        if (functions.length >= 3) {
            const hfcFunction = this.calculateHighFrequencyContent(functions.map(f => f.function));
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
    static normalizeOnsetFunction(onsetFunction) {
        const max = Math.max(...onsetFunction);
        if (max === 0)
            return onsetFunction;
        const normalized = new Float32Array(onsetFunction.length);
        for (let i = 0; i < onsetFunction.length; i++) {
            normalized[i] = onsetFunction[i] / max;
        }
        return normalized;
    }
    static pickPeaks(onsetFunction, sampleRate, hopSize, threshold, minInterval) {
        const onsets = [];
        const minFrameInterval = Math.floor(minInterval * sampleRate / hopSize);
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
    static calculateAdaptiveThreshold(onsetFunction, baseThreshold, strategy = 'hybrid') {
        const threshold = new Float32Array(onsetFunction.length);
        const windowSize = Math.max(20, Math.floor(onsetFunction.length * 0.05));
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
                    const mean = this.calculateMean(windowData);
                    const std = this.calculateStandardDeviation(windowData, mean);
                    const sortedData = Array.from(windowData).sort((a, b) => a - b);
                    const median = sortedData[Math.floor(sortedData.length * 0.5)] || 0;
                    const statThreshold = mean + 1.2 * std;
                    const percThreshold = median + 2.0 * std;
                    adaptiveThreshold = Math.max(baseThreshold, statThreshold, percThreshold);
                    const localActivity = std / (mean + 1e-6);
                    if (localActivity > 1.0) {
                        adaptiveThreshold *= 0.8;
                    }
                    else if (localActivity < 0.3) {
                        adaptiveThreshold *= 1.2;
                    }
                    break;
                }
            }
            threshold[i] = adaptiveThreshold;
        }
        return this.applySmoothingFilter(threshold, 3);
    }
    static postProcessOnsets(onsets, audioData, sampleRate) {
        if (onsets.length === 0)
            return onsets;
        const sortedOnsets = [...onsets].sort((a, b) => a.time - b.time);
        const filtered = [];
        const minInterval = 0.05;
        for (let i = 0; i < sortedOnsets.length; i++) {
            const current = sortedOnsets[i];
            let keepOnset = true;
            for (const accepted of filtered) {
                if (Math.abs(current.time - accepted.time) < minInterval) {
                    if (current.strength <= accepted.strength) {
                        keepOnset = false;
                        break;
                    }
                    else {
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
        return filtered.map(onset => this.refineOnsetTiming(onset, audioData, sampleRate));
    }
    static refineOnsetTiming(onset, audioData, sampleRate) {
        const data = this.toFloat32Array(audioData);
        const sampleIndex = Math.floor(onset.time * sampleRate);
        const windowSize = 512;
        const halfWindow = Math.floor(windowSize / 2);
        const start = Math.max(0, sampleIndex - halfWindow);
        const end = Math.min(data.length, sampleIndex + halfWindow);
        let bestScore = -Infinity;
        let bestIndex = sampleIndex;
        for (let i = start; i < end; i += 16) {
            const windowEnd = Math.min(i + windowSize, data.length);
            if (windowEnd - i < windowSize / 2)
                continue;
            const windowData = data.slice(i, windowEnd);
            const energy = this.calculateFrameEnergy(windowData);
            const spectralCentroid = this.calculateSpectralCentroidForWindow(windowData, sampleRate);
            const zcr = this.calculateZeroCrossingRate(windowData);
            const energyScore = energy;
            const spectralScore = spectralCentroid / 1000;
            const zcrScore = zcr * 100;
            const compositeScore = 0.6 * energyScore + 0.3 * spectralScore + 0.1 * zcrScore;
            if (compositeScore > bestScore) {
                bestScore = compositeScore;
                bestIndex = i;
            }
        }
        const microAdjustment = this.findZeroCrossingAlignment(data, bestIndex, 64);
        return {
            ...onset,
            time: (bestIndex + microAdjustment) / sampleRate,
            confidence: Math.min(onset.confidence * 1.1, 1.0)
        };
    }
    static applyLocalNormalization(onsetFunction, windowSize) {
        const normalized = new Float32Array(onsetFunction.length);
        const halfWindow = Math.floor(windowSize / 2);
        for (let i = 0; i < onsetFunction.length; i++) {
            const start = Math.max(0, i - halfWindow);
            const end = Math.min(onsetFunction.length, i + halfWindow + 1);
            const windowData = onsetFunction.slice(start, end);
            const localMax = Math.max(...windowData);
            const localMean = this.calculateMean(windowData);
            if (localMax > localMean * 1.5) {
                normalized[i] = onsetFunction[i] / (localMax + 1e-6);
            }
            else {
                normalized[i] = onsetFunction[i] / (localMean + 1e-6);
            }
        }
        return normalized;
    }
    static applySmoothingFilter(signal, windowSize) {
        if (windowSize <= 1)
            return signal;
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
    static calculateLocalMean(data, center, windowSize) {
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
    static calculateLocalStandardDeviation(data, center, windowSize, mean) {
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
    static calculateMean(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] || 0;
        }
        return data.length > 0 ? sum / data.length : 0;
    }
    static calculateStandardDeviation(data, mean) {
        const actualMean = mean ?? this.calculateMean(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
            const diff = (data[i] || 0) - actualMean;
            sumSquares += diff * diff;
        }
        return data.length > 0 ? Math.sqrt(sumSquares / data.length) : 0;
    }
    static calculateFunctionReliability(onsetFunction) {
        const mean = this.calculateMean(onsetFunction);
        const std = this.calculateStandardDeviation(onsetFunction, mean);
        if (std === 0)
            return 0.5;
        const snr = mean / std;
        return Math.min(Math.max(snr / 10, 0.1), 1.0);
    }
    static calculateDynamicConfidence(onsetFunction) {
        const confidence = new Float32Array(onsetFunction.length);
        const windowSize = 10;
        for (let i = 0; i < onsetFunction.length; i++) {
            const localMean = this.calculateLocalMean(onsetFunction, i, windowSize);
            const localStd = this.calculateLocalStandardDeviation(onsetFunction, i, windowSize, localMean);
            const significance = localStd > 0 ? Math.abs(onsetFunction[i] - localMean) / localStd : 0;
            confidence[i] = Math.min(significance / 3.0, 1.0);
        }
        return confidence;
    }
    static calculateHighFrequencyContent(functions) {
        if (functions.length === 0)
            return new Float32Array();
        const length = functions[0]?.length || 0;
        const hfc = new Float32Array(length);
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
    static getFrequencyWeight(bin, maxBin) {
        const freqRatio = bin / maxBin;
        if (freqRatio < 0.05)
            return 0.3;
        if (freqRatio < 0.15)
            return 0.8;
        if (freqRatio < 0.6)
            return 1.0;
        if (freqRatio < 0.8)
            return 0.7;
        return 0.4;
    }
    static isAudioSilent(data, threshold = 0.001) {
        const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length);
        return rms < threshold;
    }
    static isAudioNoise(data, sampleRate) {
        const zcr = SignalProcessing.zeroCrossingRate(data);
        const normalizedZCR = zcr * sampleRate;
        return normalizedZCR > 3000;
    }
    static calculateSpectralCentroidForWindow(windowData, sampleRate) {
        const windowed = AudioProcessor.applyWindow(windowData);
        const spectrum = AudioProcessor.computeSpectrum(windowed);
        return SignalProcessing.spectralCentroid(spectrum, sampleRate);
    }
    static calculateZeroCrossingRate(data) {
        let crossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i - 1] >= 0) !== (data[i] >= 0)) {
                crossings++;
            }
        }
        return crossings / (data.length - 1);
    }
    static findZeroCrossingAlignment(data, center, searchRadius) {
        const start = Math.max(0, center - searchRadius);
        const end = Math.min(data.length - 1, center + searchRadius);
        let bestOffset = 0;
        let minDistance = Infinity;
        for (let i = start; i < end; i++) {
            if ((data[i] >= 0) !== (data[i + 1] >= 0)) {
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
Object.defineProperty(OnsetDetection, "DEFAULT_OPTIONS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        windowSize: 1024,
        hopSize: 512,
        method: 'combined',
        threshold: 0.3,
        minInterval: 0.05
    }
});
Object.defineProperty(OnsetDetection, "DEFAULT_COMBINATION_WEIGHTS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        spectralFlux: 0.35,
        energy: 0.25,
        complexDomain: 0.25,
        highFreqContent: 0.15
    }
});

class TempoTracking {
    constructor(config = {}) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = config;
    }
    detectTempo(audioData, sampleRate, options = {}) {
        return TempoTracking.detectTempo(audioData, sampleRate, options);
    }
    trackBeats(audioData, sampleRate, tempo, options = {}) {
        return TempoTracking.trackBeats(audioData, sampleRate, tempo, options);
    }
    static toFloat32Array(audioData) {
        if (audioData instanceof Float32Array) {
            return audioData;
        }
        return new Float32Array(audioData);
    }
    static detectTempo(audioData, sampleRate, options = {}, advancedOptions = {}) {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        const data = this.toFloat32Array(audioData);
        if (this.isAudioSilent(data, 0.001)) {
            return { bpm: 120, confidence: 0.0 };
        }
        if (this.isExtremelyFast(data, sampleRate)) {
            opts.minBpm = Math.max(opts.minBpm, 140);
            opts.maxBpm = Math.min(opts.maxBpm, 300);
        }
        else if (this.isExtremelySlow(data, sampleRate)) {
            opts.minBpm = Math.max(opts.minBpm, 40);
            opts.maxBpm = Math.min(opts.maxBpm, 90);
        }
        const onsetFunction = this.calculateOnsetFunction(data, sampleRate);
        const tempoHypotheses = this.autocorrelationTempo(onsetFunction, sampleRate, opts.minBpm, opts.maxBpm, advancedOptions);
        const bestTempo = this.selectBestTempo(tempoHypotheses);
        return {
            bpm: bestTempo.bpm,
            confidence: bestTempo.confidence,
            timeSignature: this.estimateTimeSignature(bestTempo.bpm, onsetFunction, sampleRate, tempoHypotheses),
            metadata: {
                phase: bestTempo.phase,
                alternativeTempos: tempoHypotheses.slice(0, 3).map(h => ({
                    bpm: h.bpm,
                    confidence: h.confidence
                }))
            }
        };
    }
    static trackBeats(onsets, tempo, audioDuration, options = {}, beatTrackingOptions = {}) {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        if (onsets.length === 0) {
            return this.generateRegularBeats(tempo, audioDuration);
        }
        if (onsets.length < 3) {
            return this.simpleTemplateBeatTracking(onsets, tempo, audioDuration, beatTrackingOptions);
        }
        let beats;
        if (opts.useDynamicProgramming) {
            beats = this.dynamicProgrammingBeats(onsets, tempo, audioDuration, beatTrackingOptions);
        }
        else {
            beats = this.simpleTemplateBeatTracking(onsets, tempo, audioDuration, beatTrackingOptions);
        }
        return this.postProcessBeats(beats, tempo, beatTrackingOptions);
    }
    static generateRegularBeats(tempo, audioDuration) {
        const beats = [];
        const beatInterval = 60 / tempo.bpm;
        const phase = tempo.metadata?.phase || 0;
        for (let time = phase; time <= audioDuration; time += beatInterval) {
            beats.push({
                timestamp: time * 1000,
                confidence: tempo.confidence * 0.5,
                strength: 0.5
            });
        }
        return beats;
    }
    static postProcessBeats(beats, tempo, options) {
        if (beats.length < 2)
            return beats;
        let processedBeats = [...beats];
        if (options.phaseAlignment && options.phaseAlignment !== 'energy') {
            processedBeats = this.alignBeatPhases(processedBeats, tempo, options.phaseAlignment);
        }
        if (options.confidenceThreshold) {
            processedBeats = processedBeats.filter(beat => beat.confidence >= options.confidenceThreshold);
        }
        const minInterval = (60 / tempo.bpm) * 0.7;
        processedBeats = this.enforceMinimumSpacing(processedBeats, minInterval);
        return processedBeats;
    }
    static alignBeatPhases(beats, tempo, method) {
        if (beats.length < 2)
            return beats;
        const targetInterval = 60 / tempo.bpm;
        const aligned = [];
        aligned.push(beats[0]);
        for (let i = 1; i < beats.length; i++) {
            const currentBeat = beats[i];
            const expectedTime = aligned[0].timestamp / 1000 + i * targetInterval;
            let alignedTime;
            switch (method) {
                case 'spectral':
                    alignedTime = currentBeat.timestamp / 1000 * 0.3 + expectedTime * 0.7;
                    break;
                case 'combined':
                default:
                    alignedTime = currentBeat.timestamp / 1000 * 0.5 + expectedTime * 0.5;
                    break;
            }
            aligned.push({
                ...currentBeat,
                timestamp: alignedTime * 1000,
                confidence: currentBeat.confidence * 0.9
            });
        }
        return aligned;
    }
    static enforceMinimumSpacing(beats, minInterval) {
        if (beats.length < 2)
            return beats;
        const spaced = [beats[0]];
        for (let i = 1; i < beats.length; i++) {
            const currentBeat = beats[i];
            const lastBeat = spaced[spaced.length - 1];
            const interval = (currentBeat.timestamp - lastBeat.timestamp) / 1000;
            if (interval >= minInterval) {
                spaced.push(currentBeat);
            }
            else {
                if (currentBeat.strength > lastBeat.strength) {
                    spaced[spaced.length - 1] = currentBeat;
                }
            }
        }
        return spaced;
    }
    static extractTempoCurve(audioData, sampleRate, windowSize = 5.0, hopSize = 1.0, options = {}) {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        const data = this.toFloat32Array(audioData);
        const tempoCurve = [];
        const windowSamples = Math.floor(windowSize * sampleRate);
        const hopSamples = Math.floor(hopSize * sampleRate);
        for (let start = 0; start + windowSamples < data.length; start += hopSamples) {
            const window = data.slice(start, start + windowSamples);
            const windowTempo = this.detectTempo(window, sampleRate, opts);
            tempoCurve.push({
                time: start / sampleRate,
                bpm: windowTempo.bpm,
                confidence: windowTempo.confidence
            });
        }
        return this.smoothTempoCurve(tempoCurve);
    }
    static calculateOnsetFunction(audioData, sampleRate) {
        const windowSize = 1024;
        const hopSize = 256;
        const frames = AudioProcessor.frameAudio(audioData, windowSize, hopSize);
        const onsetFunction = new Float32Array(frames.length);
        let previousSpectrum = null;
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (!frame)
                continue;
            const windowed = AudioProcessor.applyWindow(frame);
            const spectrum = AudioProcessor.computeSpectrum(windowed);
            if (previousSpectrum) {
                let flux = 0;
                const maxBin = Math.floor(spectrum.length * 0.3);
                for (let bin = 1; bin < maxBin; bin++) {
                    const specValue = spectrum[bin];
                    const prevValue = previousSpectrum[bin];
                    if (specValue === undefined || prevValue === undefined)
                        continue;
                    const diff = specValue - prevValue;
                    flux += Math.max(0, diff);
                }
                onsetFunction[i] = flux;
            }
            else {
                onsetFunction[i] = 0;
            }
            previousSpectrum = spectrum;
        }
        return this.lowPassFilter(onsetFunction, 20, sampleRate / hopSize);
    }
    static autocorrelationTempo(onsetFunction, sampleRate, minBpm, maxBpm, options = {}) {
        const hopSize = 256;
        const frameRate = sampleRate / hopSize;
        const useMultiScale = options.useMultiScale ?? true;
        const detectTempoMultiples = options.detectTempoMultiples ?? true;
        const useOnsetWeighting = options.useOnsetWeighting ?? true;
        const safeMinBpm = Math.max(40, minBpm * 0.8);
        const safeMaxBpm = Math.min(300, maxBpm * 1.2);
        const maxLag = Math.floor(frameRate * 60 / safeMinBpm);
        const minLag = Math.floor(frameRate * 60 / safeMaxBpm);
        let processedOnsetFunction = onsetFunction;
        if (useOnsetWeighting) {
            processedOnsetFunction = this.applyOnsetWeighting(onsetFunction);
        }
        let autocorrResults;
        if (useMultiScale) {
            autocorrResults = this.calculateMultiScaleAutocorrelation(processedOnsetFunction, maxLag, [1, 2, 4]);
        }
        else {
            autocorrResults = [this.calculateAutocorrelation(processedOnsetFunction, maxLag)];
        }
        const hypotheses = [];
        for (let scaleIdx = 0; scaleIdx < autocorrResults.length; scaleIdx++) {
            const autocorr = autocorrResults[scaleIdx];
            const scale = useMultiScale ? [1, 2, 4][scaleIdx] : 1;
            for (let lag = minLag; lag <= maxLag; lag++) {
                if (this.isAutocorrelationPeak(autocorr, lag)) {
                    const bpm = (60 * frameRate) / (lag * scale);
                    if (bpm >= minBpm && bpm <= maxBpm) {
                        const confidence = this.calculateTempoConfidence(autocorr, lag, bpm, processedOnsetFunction);
                        const phase = this.estimateBeatPhase(processedOnsetFunction, bpm, frameRate);
                        hypotheses.push({
                            bpm,
                            confidence,
                            phase,
                            strength: autocorr[lag] || 0,
                            autocorrelationPeak: autocorr[lag] || 0
                        });
                    }
                }
            }
        }
        if (detectTempoMultiples && hypotheses.length > 0) {
            const multipleHypotheses = this.generateTempoMultiples(hypotheses);
            hypotheses.push(...multipleHypotheses);
        }
        return hypotheses
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 15);
    }
    static calculateAutocorrelation(signal, maxLag) {
        const autocorr = new Float32Array(maxLag + 1);
        const n = signal.length;
        let mean = 0;
        for (let i = 0; i < n; i++) {
            mean += signal[i];
        }
        mean /= n;
        let variance = 0;
        for (let i = 0; i < n; i++) {
            const diff = signal[i] - mean;
            variance += diff * diff;
        }
        variance /= n;
        if (variance === 0)
            return autocorr;
        for (let lag = 0; lag <= maxLag; lag++) {
            let sum = 0;
            const count = n - lag;
            for (let i = 0; i < count; i++) {
                sum += (signal[i] - mean) * (signal[i + lag] - mean);
            }
            autocorr[lag] = sum / (count * variance);
        }
        return autocorr;
    }
    static selectBestTempo(hypotheses) {
        if (hypotheses.length === 0) {
            return { bpm: 120, confidence: 0.0, phase: 0.0 };
        }
        const scoredHypotheses = hypotheses.map(hypothesis => {
            let score = hypothesis.confidence;
            const bpm = hypothesis.bpm;
            if (bpm >= 110 && bpm <= 130) {
                score *= 1.3;
            }
            else if (bpm >= 90 && bpm <= 110) {
                score *= 1.2;
            }
            else if (bpm >= 60 && bpm <= 80) {
                score *= 1.15;
            }
            else if (bpm >= 140 && bpm <= 160) {
                score *= 1.1;
            }
            const proximityBoost = this.calculateCommonTempoProximity(bpm);
            score *= (1 + proximityBoost * 0.1);
            if (bpm < 50) {
                score *= 0.3;
            }
            else if (bpm < 70) {
                score *= 0.7;
            }
            else if (bpm > 250) {
                score *= 0.2;
            }
            else if (bpm > 200) {
                score *= 0.6;
            }
            const remainder = bpm % 1;
            if (remainder < 0.05 || remainder > 0.95) {
                score *= 1.08;
            }
            else if (Math.abs(remainder - 0.5) < 0.05) {
                score *= 1.04;
            }
            else if (Math.abs(remainder - 0.25) < 0.05 || Math.abs(remainder - 0.75) < 0.05) {
                score *= 1.02;
            }
            score *= (0.8 + 0.2 * hypothesis.autocorrelationPeak);
            const phaseAlignmentQuality = this.evaluatePhaseAlignment(hypothesis);
            score *= (0.9 + 0.1 * phaseAlignmentQuality);
            return { ...hypothesis, score };
        });
        const best = scoredHypotheses.reduce((prev, curr) => curr.score > prev.score ? curr : prev);
        return {
            bpm: best.bpm,
            confidence: best.confidence,
            phase: best.phase
        };
    }
    static dynamicProgrammingBeats(onsets, tempo, audioDuration, options = {}) {
        if (onsets.length === 0)
            return [];
        const variableTempo = options.variableTempo ?? false;
        const tempoTolerance = options.tempoTolerance ?? 0.1;
        const confidenceThreshold = options.confidenceThreshold ?? 0.3;
        const phaseAlignment = options.phaseAlignment ?? 'combined';
        const baseBeatInterval = 60 / tempo.bpm;
        let currentTempo = tempo.bpm;
        const tolerance = baseBeatInterval * 0.25;
        const expectedBeats = [];
        let currentTime = 0;
        while (currentTime <= audioDuration) {
            expectedBeats.push({ time: currentTime, tempo: currentTempo });
            if (variableTempo && expectedBeats.length > 4) {
                const recentTempo = this.estimateLocalTempo(onsets, currentTime, baseBeatInterval * 4);
                if (Math.abs(recentTempo - currentTempo) / currentTempo < tempoTolerance) {
                    currentTempo = currentTempo * 0.9 + recentTempo * 0.1;
                }
            }
            currentTime += 60 / currentTempo;
        }
        const m = onsets.length;
        const n = expectedBeats.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(-Infinity));
        const backtrack = Array(m + 1).fill(null).map(() => Array(n + 1).fill(null));
        const tempoTrack = Array(m + 1).fill(null).map(() => Array(n + 1).fill(currentTempo));
        for (let j = 0; j <= n; j++) {
            dp[0][j] = 0;
        }
        for (let i = 1; i <= m; i++) {
            const onset = onsets[i - 1];
            for (let j = 1; j <= n; j++) {
                const expectedBeat = expectedBeats[j - 1];
                const timeDiff = Math.abs(onset.time - expectedBeat.time);
                if (dp[i - 1][j] > dp[i][j]) {
                    dp[i][j] = dp[i - 1][j];
                    backtrack[i][j] = { from: [i - 1, j], used: false };
                    tempoTrack[i][j] = tempoTrack[i - 1][j];
                }
                if (timeDiff <= tolerance && j > 0) {
                    let score = this.calculateBeatScore(onset, expectedBeat, timeDiff, tolerance, phaseAlignment);
                    if (onset.confidence < confidenceThreshold) {
                        score *= 0.5;
                    }
                    if (j > 1 && Math.abs(expectedBeat.tempo - currentTempo) < currentTempo * 0.1) {
                        score *= 1.1;
                    }
                    const newScore = dp[i - 1][j - 1] + score;
                    if (newScore > dp[i][j]) {
                        dp[i][j] = newScore;
                        backtrack[i][j] = { from: [i - 1, j - 1], used: true };
                        tempoTrack[i][j] = expectedBeat.tempo;
                    }
                }
            }
        }
        const beats = [];
        let i = m, j = n;
        while (i > 0 && j > 0 && backtrack[i][j]) {
            const bt = backtrack[i][j];
            if (bt.used) {
                const onset = onsets[i - 1];
                const alignedTime = this.applyBeatPhaseAlignment(onset.time, expectedBeats[j - 1].time, phaseAlignment);
                beats.unshift({
                    timestamp: alignedTime * 1000,
                    confidence: this.calculateBeatConfidence(onset, expectedBeats[j - 1], tolerance),
                    strength: onset.strength,
                    metadata: {
                        originalTime: onset.time,
                        expectedTime: expectedBeats[j - 1].time,
                        tempo: tempoTrack[i][j]
                    }
                });
            }
            [i, j] = bt.from;
        }
        return beats;
    }
    static simpleTemplateBeatTracking(onsets, tempo, audioDuration, options = {}) {
        const beatInterval = 60 / tempo.bpm;
        const beats = [];
        const baseTolerance = beatInterval * 0.35;
        const variableTempo = options.variableTempo ?? false;
        let currentTempo = tempo.bpm;
        let currentTime = 0;
        while (currentTime <= audioDuration) {
            let tolerance = baseTolerance;
            if (variableTempo) {
                const localTempo = this.estimateLocalTempo(onsets, currentTime, beatInterval * 4);
                if (Math.abs(localTempo - currentTempo) > currentTempo * 0.1) {
                    tolerance *= 1.5;
                }
                currentTempo = currentTempo * 0.9 + localTempo * 0.1;
            }
            let bestOnset = null;
            let minDistance = tolerance;
            let bestScore = 0;
            for (const onset of onsets) {
                const distance = Math.abs(onset.time - currentTime);
                if (distance < tolerance) {
                    const score = ((1 - distance / tolerance) * 0.5 +
                        onset.strength * 0.3 +
                        onset.confidence * 0.2);
                    if (score > bestScore) {
                        bestScore = score;
                        bestOnset = onset;
                        minDistance = distance;
                    }
                }
            }
            if (bestOnset) {
                const alignedTime = this.applyBeatPhaseAlignment(bestOnset.time, currentTime, options.phaseAlignment || 'combined');
                beats.push({
                    timestamp: alignedTime * 1000,
                    confidence: bestOnset.confidence * (1 - minDistance / tolerance),
                    strength: bestOnset.strength,
                    metadata: {
                        originalTime: bestOnset.time,
                        expectedTime: currentTime,
                        distance: minDistance,
                        score: bestScore
                    }
                });
            }
            else if (beats.length > 0 && options.variableTempo) {
                beats.push({
                    timestamp: currentTime * 1000,
                    confidence: tempo.confidence * 0.3,
                    strength: 0.2,
                    metadata: {
                        interpolated: true,
                        expectedTime: currentTime
                    }
                });
            }
            currentTime += 60 / currentTempo;
        }
        return beats;
    }
    static estimateTimeSignature(bpm, onsetFunction, sampleRate, tempoHypotheses) {
        const hopSize = 256;
        const frameRate = sampleRate / hopSize;
        const beatInterval = (60 * frameRate) / bpm;
        const accentScores = this.analyzeAccentPatterns(onsetFunction, beatInterval, [2, 3, 4, 6, 8]);
        const bestPattern = accentScores.reduce((best, current) => current.score > best.score ? current : best);
        let finalNumerator = bestPattern.numerator;
        let finalDenominator = 4;
        if (bpm >= 160 && bpm <= 200 && bestPattern.numerator === 3) {
            finalNumerator = 3;
            finalDenominator = 4;
        }
        else if (bpm >= 60 && bpm <= 90 && bestPattern.numerator === 6) {
            finalNumerator = 6;
            finalDenominator = 8;
        }
        else if (bestPattern.score < 0.3) {
            if (bpm >= 150) {
                finalNumerator = 4;
            }
            else if (bpm < 80) {
                finalNumerator = 4;
            }
            else {
                finalNumerator = 4;
            }
        }
        if (tempoHypotheses && tempoHypotheses.length > 1) {
            const hasDoubleTimeCandidate = tempoHypotheses.some(h => Math.abs(h.bpm - bpm * 2) < bpm * 0.1);
            const hasHalfTimeCandidate = tempoHypotheses.some(h => Math.abs(h.bpm - bpm / 2) < bpm * 0.1);
            if (hasDoubleTimeCandidate && finalNumerator === 2) {
                finalNumerator = 4;
            }
            if (hasHalfTimeCandidate && finalNumerator === 8) {
                finalNumerator = 4;
            }
        }
        return { numerator: finalNumerator, denominator: finalDenominator };
    }
    static analyzeAccentPatterns(onsetFunction, beatInterval, testPatterns) {
        const results = [];
        for (const pattern of testPatterns) {
            const measureLength = beatInterval * pattern;
            let score = 0;
            let measureCount = 0;
            for (let start = 0; start + measureLength < onsetFunction.length; start += measureLength) {
                const measureOnsets = onsetFunction.slice(start, start + measureLength);
                const beatStrengths = [];
                for (let beat = 0; beat < pattern; beat++) {
                    const beatStart = Math.floor(beat * beatInterval);
                    const beatEnd = Math.floor((beat + 1) * beatInterval);
                    if (beatEnd <= measureOnsets.length) {
                        const beatSlice = measureOnsets.slice(beatStart, beatEnd);
                        const maxStrength = Math.max(...beatSlice);
                        beatStrengths.push(maxStrength);
                    }
                }
                if (beatStrengths.length === pattern) {
                    score += this.evaluateAccentPattern(beatStrengths, pattern);
                    measureCount++;
                }
            }
            if (measureCount > 0) {
                results.push({
                    numerator: pattern,
                    score: score / measureCount
                });
            }
            else {
                results.push({
                    numerator: pattern,
                    score: 0
                });
            }
        }
        return results;
    }
    static evaluateAccentPattern(beatStrengths, pattern) {
        if (beatStrengths.length !== pattern)
            return 0;
        const accentPatterns = {
            2: [1.0, 0.6],
            3: [1.0, 0.6, 0.7],
            4: [1.0, 0.6, 0.8, 0.6],
            6: [1.0, 0.5, 0.6, 0.8, 0.5, 0.6],
            8: [1.0, 0.5, 0.6, 0.5, 0.7, 0.5, 0.6, 0.5]
        };
        const expectedPattern = accentPatterns[pattern];
        if (!expectedPattern)
            return 0;
        const maxStrength = Math.max(...beatStrengths);
        if (maxStrength === 0)
            return 0;
        const normalizedStrengths = beatStrengths.map(s => s / maxStrength);
        let correlation = 0;
        for (let i = 0; i < pattern; i++) {
            const expected = expectedPattern[i] || 0;
            const actual = normalizedStrengths[i] || 0;
            correlation += Math.min(expected, actual);
        }
        return correlation / pattern;
    }
    static smoothTempoCurve(tempoCurve, smoothingFactor = 0.3) {
        if (tempoCurve.length <= 2)
            return tempoCurve;
        const smoothed = [...tempoCurve];
        for (let i = 1; i < smoothed.length - 1; i++) {
            const values = [
                tempoCurve[i - 1].bpm,
                tempoCurve[i].bpm,
                tempoCurve[i + 1].bpm
            ].sort((a, b) => a - b);
            const medianBpm = values[1];
            if (Math.abs(tempoCurve[i].bpm - medianBpm) > medianBpm * 0.2) {
                smoothed[i] = {
                    ...tempoCurve[i],
                    bpm: medianBpm,
                    confidence: tempoCurve[i].confidence * 0.8
                };
            }
        }
        const finalSmoothed = [...smoothed];
        for (let i = 1; i < smoothed.length - 1; i++) {
            const current = smoothed[i];
            const prev = smoothed[i - 1];
            const next = smoothed[i + 1];
            const avgConfidence = (prev.confidence + current.confidence + next.confidence) / 3;
            const dynamicSmoothingFactor = smoothingFactor * (1.0 - avgConfidence * 0.5);
            const totalWeight = prev.confidence + current.confidence * 2 + next.confidence;
            const weightedBpm = (prev.bpm * prev.confidence +
                current.bpm * current.confidence * 2 +
                next.bpm * next.confidence) / totalWeight;
            finalSmoothed[i] = {
                time: current.time,
                bpm: current.bpm * (1 - dynamicSmoothingFactor) + weightedBpm * dynamicSmoothingFactor,
                confidence: Math.min(avgConfidence * 1.1, 1.0)
            };
        }
        return this.enforceTempoConsistency(finalSmoothed);
    }
    static lowPassFilter(signal, cutoff, sampleRate) {
        const rc = 1.0 / (cutoff * 2 * Math.PI);
        const dt = 1.0 / sampleRate;
        const alpha = dt / (rc + dt);
        const filtered = new Float32Array(signal.length);
        filtered[0] = signal[0];
        for (let i = 1; i < signal.length; i++) {
            filtered[i] = filtered[i - 1] + alpha * (signal[i] - filtered[i - 1]);
        }
        return filtered;
    }
    static analyzeBeatConsistency(beats) {
        if (beats.length < 2) {
            return {
                consistency: 0,
                averageInterval: 0,
                intervalVariance: 0,
                tempoStability: 0,
                rhythmicRegularity: 0
            };
        }
        const intervals = [];
        for (let i = 1; i < beats.length; i++) {
            intervals.push(beats[i].timestamp - beats[i - 1].timestamp);
        }
        const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        let variance = 0;
        for (const interval of intervals) {
            const diff = interval - averageInterval;
            variance += diff * diff;
        }
        variance /= intervals.length;
        const standardDeviation = Math.sqrt(variance);
        const consistency = Math.max(0, 1 - standardDeviation / averageInterval);
        const tempoStability = this.calculateTempoStability(intervals);
        const rhythmicRegularity = this.calculateRhythmicRegularity(intervals, averageInterval);
        return {
            consistency,
            averageInterval,
            intervalVariance: variance,
            tempoStability,
            rhythmicRegularity
        };
    }
    static applyOnsetWeighting(onsetFunction) {
        const weighted = new Float32Array(onsetFunction.length);
        for (let i = 0; i < onsetFunction.length; i++) {
            const windowSize = 20;
            const start = Math.max(0, i - windowSize);
            const end = Math.min(onsetFunction.length, i + windowSize);
            let localMax = 0;
            for (let j = start; j < end; j++) {
                localMax = Math.max(localMax, onsetFunction[j] || 0);
            }
            const prominence = localMax > 0 ? (onsetFunction[i] || 0) / localMax : 0;
            weighted[i] = (onsetFunction[i] || 0) * Math.pow(prominence, 0.5);
        }
        return weighted;
    }
    static calculateMultiScaleAutocorrelation(signal, maxLag, scales) {
        const results = [];
        for (const scale of scales) {
            const downsampled = new Float32Array(Math.floor(signal.length / scale));
            for (let i = 0; i < downsampled.length; i++) {
                let sum = 0;
                const start = i * scale;
                const end = Math.min(signal.length, start + scale);
                for (let j = start; j < end; j++) {
                    sum += signal[j] || 0;
                }
                downsampled[i] = sum / (end - start);
            }
            const scaledMaxLag = Math.floor(maxLag / scale);
            const autocorr = this.calculateAutocorrelation(downsampled, scaledMaxLag);
            results.push(autocorr);
        }
        return results;
    }
    static isAutocorrelationPeak(autocorr, lag, threshold = 0.1) {
        if (lag <= 1 || lag >= autocorr.length - 1)
            return false;
        const current = autocorr[lag] || 0;
        const prev = autocorr[lag - 1] || 0;
        const next = autocorr[lag + 1] || 0;
        return current > prev &&
            current > next &&
            current > threshold;
    }
    static calculateTempoConfidence(autocorr, lag, bpm, onsetFunction) {
        const peak = autocorr[lag] || 0;
        const windowSize = Math.max(3, Math.floor(lag * 0.1));
        let localMax = 0;
        for (let i = Math.max(0, lag - windowSize); i <= Math.min(autocorr.length - 1, lag + windowSize); i++) {
            if (i !== lag) {
                localMax = Math.max(localMax, autocorr[i] || 0);
            }
        }
        const prominence = localMax > 0 ? peak / localMax : 1.0;
        const onsetStrength = this.calculateMean(onsetFunction);
        const onsetConsistency = this.calculateOnsetConsistency(onsetFunction);
        let confidence = peak * 0.4 + prominence * 0.3 + onsetStrength * 0.2 + onsetConsistency * 0.1;
        confidence *= this.getMusicalPriorBoost(bpm);
        return Math.min(confidence, 1.0);
    }
    static estimateBeatPhase(onsetFunction, bpm, frameRate) {
        const beatPeriod = (60 * frameRate) / bpm;
        const numPhases = 16;
        let bestPhase = 0;
        let bestScore = 0;
        for (let phase = 0; phase < numPhases; phase++) {
            const phaseOffset = (phase * beatPeriod) / numPhases;
            let score = 0;
            let count = 0;
            for (let beat = phaseOffset; beat < onsetFunction.length; beat += beatPeriod) {
                const index = Math.round(beat);
                if (index < onsetFunction.length) {
                    score += onsetFunction[index] || 0;
                    count++;
                }
            }
            if (count > 0) {
                score /= count;
                if (score > bestScore) {
                    bestScore = score;
                    bestPhase = phaseOffset / frameRate;
                }
            }
        }
        return bestPhase;
    }
    static generateTempoMultiples(originalHypotheses) {
        const multiples = [];
        for (const hypothesis of originalHypotheses.slice(0, 5)) {
            for (const multiple of this.TEMPO_MULTIPLES) {
                if (multiple === 1.0)
                    continue;
                const newBpm = hypothesis.bpm * multiple;
                if (newBpm >= 50 && newBpm <= 250) {
                    const confidenceScale = multiple === 0.5 || multiple === 2.0 ? 0.8 : 0.6;
                    multiples.push({
                        bpm: newBpm,
                        confidence: hypothesis.confidence * confidenceScale,
                        phase: hypothesis.phase,
                        strength: hypothesis.strength * confidenceScale,
                        autocorrelationPeak: hypothesis.autocorrelationPeak
                    });
                }
            }
        }
        return multiples;
    }
    static calculateCommonTempoProximity(bpm) {
        let minDistance = Infinity;
        for (const commonBpm of this.COMMON_TEMPOS) {
            const distance = Math.abs(bpm - commonBpm) / commonBpm;
            minDistance = Math.min(minDistance, distance);
        }
        return Math.max(0, 1 - minDistance * 2);
    }
    static evaluatePhaseAlignment(hypothesis) {
        const phaseNormalized = (hypothesis.phase % (60 / hypothesis.bpm)) / (60 / hypothesis.bpm);
        const beatPositions = [0, 0.25, 0.5, 0.75];
        let minDistance = 1.0;
        for (const pos of beatPositions) {
            const distance = Math.min(Math.abs(phaseNormalized - pos), Math.abs(phaseNormalized - pos - 1), Math.abs(phaseNormalized - pos + 1));
            minDistance = Math.min(minDistance, distance);
        }
        return 1.0 - minDistance * 4;
    }
    static estimateLocalTempo(onsets, centerTime, windowSize) {
        const windowOnsets = onsets.filter(onset => Math.abs(onset.time - centerTime) <= windowSize / 2);
        if (windowOnsets.length < 2) {
            return 120;
        }
        const intervals = [];
        for (let i = 1; i < windowOnsets.length; i++) {
            intervals.push(windowOnsets[i].time - windowOnsets[i - 1].time);
        }
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)] || 0.5;
        return medianInterval > 0 ? 60 / medianInterval : 120;
    }
    static calculateBeatScore(onset, expectedBeat, timeDiff, tolerance, phaseAlignment) {
        const timingScore = (1 - timeDiff / tolerance);
        const strengthScore = onset.strength;
        const confidenceScore = onset.confidence;
        let baseScore = 0.5 * strengthScore + 0.3 * timingScore + 0.2 * confidenceScore;
        switch (phaseAlignment) {
            case 'energy':
                baseScore *= (1 + 0.2 * onset.strength);
                break;
            case 'spectral':
                baseScore *= (1 + 0.1 * onset.confidence);
                break;
            case 'combined':
                baseScore *= (1 + 0.1 * onset.strength + 0.1 * onset.confidence);
                break;
        }
        return baseScore;
    }
    static applyBeatPhaseAlignment(onsetTime, expectedTime, alignmentMethod) {
        switch (alignmentMethod) {
            case 'energy':
                return onsetTime * 0.7 + expectedTime * 0.3;
            case 'spectral':
                return onsetTime * 0.4 + expectedTime * 0.6;
            case 'combined':
            default:
                return onsetTime * 0.5 + expectedTime * 0.5;
        }
    }
    static calculateBeatConfidence(onset, expectedBeat, tolerance) {
        const timeDiff = Math.abs(onset.time - expectedBeat.time);
        const timingAccuracy = Math.max(0, 1 - timeDiff / tolerance);
        return Math.min(onset.confidence * 0.7 + timingAccuracy * 0.3, 1.0);
    }
    static enforceTempoConsistency(tempoCurve) {
        const consistent = [...tempoCurve];
        const maxTempoChange = 0.15;
        for (let i = 1; i < consistent.length; i++) {
            const current = consistent[i];
            const previous = consistent[i - 1];
            const tempoChange = Math.abs(current.bpm - previous.bpm) / previous.bpm;
            if (tempoChange > maxTempoChange) {
                const maxAllowedChange = previous.bpm * maxTempoChange;
                const direction = current.bpm > previous.bpm ? 1 : -1;
                consistent[i] = {
                    ...current,
                    bpm: previous.bpm + direction * maxAllowedChange,
                    confidence: current.confidence * 0.8
                };
            }
        }
        return consistent;
    }
    static calculateTempoStability(intervals) {
        if (intervals.length < 3)
            return 1.0;
        const accelerations = [];
        for (let i = 2; i < intervals.length; i++) {
            const accel = intervals[i] - 2 * intervals[i - 1] + intervals[i - 2];
            accelerations.push(Math.abs(accel));
        }
        const meanAccel = accelerations.reduce((sum, val) => sum + val, 0) / accelerations.length;
        const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        return Math.max(0, 1 - meanAccel / avgInterval);
    }
    static calculateRhythmicRegularity(intervals, expectedInterval) {
        if (intervals.length === 0)
            return 0;
        let regularityScore = 0;
        for (const interval of intervals) {
            const deviation = Math.abs(interval - expectedInterval) / expectedInterval;
            regularityScore += Math.max(0, 1 - deviation * 2);
        }
        return regularityScore / intervals.length;
    }
    static calculateMean(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] || 0;
        }
        return data.length > 0 ? sum / data.length : 0;
    }
    static calculateOnsetConsistency(onsetFunction) {
        if (onsetFunction.length < 2)
            return 0;
        const mean = this.calculateMean(onsetFunction);
        let variance = 0;
        for (let i = 0; i < onsetFunction.length; i++) {
            const diff = (onsetFunction[i] || 0) - mean;
            variance += diff * diff;
        }
        variance /= onsetFunction.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
        return Math.max(0, 1 - cv);
    }
    static getMusicalPriorBoost(bpm) {
        for (const commonBpm of this.COMMON_TEMPOS) {
            if (Math.abs(bpm - commonBpm) < 5) {
                return 1.2;
            }
        }
        return 1.0;
    }
    static isAudioSilent(data, threshold) {
        const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length);
        return rms < threshold;
    }
    static isExtremelyFast(data, sampleRate) {
        const zcr = SignalProcessing.zeroCrossingRate(data);
        return zcr * sampleRate > 2000;
    }
    static isExtremelySlow(data, sampleRate) {
        const energyVariation = this.calculateEnergyVariation(data);
        return energyVariation < 0.1;
    }
    static calculateEnergyVariation(data) {
        const windowSize = 2048;
        const hopSize = 1024;
        const energies = [];
        for (let i = 0; i < data.length - windowSize; i += hopSize) {
            let energy = 0;
            for (let j = 0; j < windowSize; j++) {
                energy += (data[i + j] || 0) ** 2;
            }
            energies.push(Math.sqrt(energy / windowSize));
        }
        if (energies.length < 2)
            return 1.0;
        const mean = energies.reduce((sum, val) => sum + val, 0) / energies.length;
        const variance = energies.reduce((sum, val) => sum + (val - mean) ** 2, 0) / energies.length;
        return mean > 0 ? Math.sqrt(variance) / mean : 0;
    }
}
Object.defineProperty(TempoTracking, "DEFAULT_OPTIONS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        minBpm: 60,
        maxBpm: 200,
        windowSize: 10.0,
        useDynamicProgramming: true
    }
});
Object.defineProperty(TempoTracking, "TEMPO_MULTIPLES", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: [0.25, 0.5, 1.0, 2.0, 3.0, 4.0]
});
Object.defineProperty(TempoTracking, "COMMON_TEMPOS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: [120, 128, 100, 140, 90, 110, 130, 150]
});

class SpectralFeatures {
    static extractFeatures(audioData, sampleRate = 44100) {
        const fft = SpectralFeatures.calculateFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        const features = {
            spectralCentroid: SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate),
            spectralRolloff: SpectralFeatures.calculateSpectralRolloffFromMagnitude(magnitude, sampleRate),
            spectralBandwidth: SpectralFeatures.calculateSpectralBandwidthFromMagnitude(magnitude, sampleRate),
            zeroCrossingRate: SpectralFeatures.calculateZeroCrossingRate(audioData),
            rmsEnergy: SpectralFeatures.calculateRmsEnergy(audioData),
            mfcc: SpectralFeatures.calculateMfccFromMagnitude(magnitude, sampleRate)
        };
        return features;
    }
    static calculateSpectralCentroid(audioData, sampleRate) {
        const fft = SpectralFeatures.calculateFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        return SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate);
    }
    static calculateSpectralCentroidFromMagnitude(magnitude, sampleRate) {
        let weightedSum = 0;
        let magnitudeSum = 0;
        for (let i = 0; i < magnitude.length / 2; i++) {
            const frequency = (i * sampleRate) / magnitude.length;
            weightedSum += frequency * magnitude[i];
            magnitudeSum += magnitude[i];
        }
        return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    }
    static calculateSpectralRolloff(audioData, sampleRate) {
        const fft = SpectralFeatures.calculateFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        return SpectralFeatures.calculateSpectralRolloffFromMagnitude(magnitude, sampleRate);
    }
    static calculateSpectralRolloffFromMagnitude(magnitude, sampleRate) {
        const totalEnergy = magnitude.reduce((sum, mag) => sum + mag * mag, 0);
        const threshold = totalEnergy * 0.85;
        let runningEnergy = 0;
        for (let i = 0; i < magnitude.length / 2; i++) {
            runningEnergy += magnitude[i] * magnitude[i];
            if (runningEnergy >= threshold) {
                return (i * sampleRate) / magnitude.length;
            }
        }
        return sampleRate / 2;
    }
    static calculateSpectralBandwidth(audioData, sampleRate) {
        const fft = SpectralFeatures.calculateFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        return SpectralFeatures.calculateSpectralBandwidthFromMagnitude(magnitude, sampleRate);
    }
    static calculateSpectralBandwidthFromMagnitude(magnitude, sampleRate) {
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
    static calculateZeroCrossingRate(audioData) {
        let crossings = 0;
        for (let i = 1; i < audioData.length; i++) {
            if ((audioData[i - 1] >= 0 && audioData[i] < 0) ||
                (audioData[i - 1] < 0 && audioData[i] >= 0)) {
                crossings++;
            }
        }
        return crossings / audioData.length;
    }
    static calculateRmsEnergy(audioData) {
        const sumSquares = audioData.reduce((sum, sample) => sum + sample * sample, 0);
        return Math.sqrt(sumSquares / audioData.length);
    }
    static calculateMfcc(audioData, sampleRate) {
        const fft = SpectralFeatures.calculateFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        return SpectralFeatures.calculateMfccFromMagnitude(magnitude, sampleRate);
    }
    static calculateMfccFromMagnitude(magnitude, sampleRate) {
        const numCoefficients = 13;
        const mfcc = [];
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
    static calculateFFT(audioData) {
        const N = audioData.length;
        const paddedLength = Math.pow(2, Math.ceil(Math.log2(N)));
        const paddedData = new Float32Array(paddedLength);
        paddedData.set(audioData);
        const fft = new FFT(paddedLength);
        const input = new Array(paddedLength * 2);
        for (let i = 0; i < paddedLength; i++) {
            input[i * 2] = paddedData[i];
            input[i * 2 + 1] = 0;
        }
        const output = new Array(paddedLength * 2);
        fft.transform(output, input);
        const result = [];
        for (let i = 0; i < paddedLength; i++) {
            result.push({
                real: output[i * 2],
                imag: output[i * 2 + 1]
            });
        }
        return result;
    }
    static extractFrameFeatures(audioData, frameSize = 2048, hopSize = 512, sampleRate = 44100) {
        const features = [];
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
    static calculateChroma(audioData, sampleRate = 44100) {
        if (audioData.length > 8192) {
            return SpectralFeatures.calculateChromaFromFrames(audioData, sampleRate);
        }
        const fft = SpectralFeatures.calculateFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        return SpectralFeatures.calculateChromaFromMagnitude(magnitude, sampleRate);
    }
    static calculateChromaFromFrames(audioData, sampleRate) {
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
        return numFrames > 0 ? avgChroma.map(val => val / numFrames) : avgChroma;
    }
    static calculateChromaFromMagnitude(magnitude, sampleRate) {
        const chromaBins = 12;
        const chroma = new Array(chromaBins).fill(0);
        for (let i = 1; i < magnitude.length / 2; i++) {
            const frequency = (i * sampleRate) / magnitude.length;
            if (frequency > 0) {
                const midiNote = 12 * Math.log2(frequency / 440) + 69;
                const chromaBin = Math.round(midiNote) % 12;
                if (chromaBin >= 0 && chromaBin < 12) {
                    chroma[chromaBin] += magnitude[i];
                }
            }
        }
        const sum = chroma.reduce((a, b) => a + b, 0);
        return sum > 0 ? chroma.map(val => val / sum) : chroma;
    }
}

class HybridDetector {
    constructor(config = {}) {
        Object.defineProperty(this, "onsetDetector", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
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
    async detectBeats(audioData) {
        if (!audioData || audioData.length === 0) {
            throw new Error('Invalid audio data provided');
        }
        try {
            const features = await this.extractAudioFeatures(audioData);
            const genreProfile = this.config.genreAdaptive
                ? this.detectGenre(features)
                : null;
            const adaptedConfig = genreProfile
                ? this.adaptConfigForGenre(genreProfile)
                : this.config;
            const [onsetBeats, tempoBeats, spectralBeats] = await Promise.all([
                this.runOnsetDetection(audioData, adaptedConfig),
                this.runTempoTracking(audioData, adaptedConfig),
                this.runSpectralAnalysis(audioData, adaptedConfig)
            ]);
            let combinedBeats = this.combineDetectionResults(onsetBeats, tempoBeats, spectralBeats, adaptedConfig);
            if (this.config.multiPassEnabled) {
                combinedBeats = await this.multiPassRefinement(audioData, combinedBeats, adaptedConfig);
            }
            combinedBeats = this.calculateConfidenceScores(combinedBeats, features);
            const filteredBeats = combinedBeats.filter(beat => beat.confidence >= this.config.confidenceThreshold);
            return this.sortAndValidateBeats(filteredBeats);
        }
        catch (error) {
            throw new Error(`Hybrid beat detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async extractAudioFeatures(audioData) {
        let spectralData;
        if (audioData.length > 8192) {
            const frameFeatures = SpectralFeatures.extractFrameFeatures(audioData, this.config.frameSize, this.config.hopSize, this.config.sampleRate);
            spectralData = this.averageFrameFeatures(frameFeatures);
        }
        else {
            spectralData = SpectralFeatures.extractFeatures(audioData, this.config.sampleRate);
        }
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
    detectGenre(features) {
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
    calculateGenreScore(features, profile) {
        let score = 0;
        const spectralScore = 1 - Math.abs(features.spectralCentroid - 0.5);
        score += spectralScore * 0.3;
        const dynamicScore = Math.min(features.dynamicRange / 40, 1);
        score += dynamicScore * profile.rhythmComplexity * 0.3;
        const energyScore = Math.min(features.rms * 10, 1);
        score += energyScore * 0.2;
        const zcrScore = Math.min(features.zeroCrossingRate, 1);
        score += zcrScore * profile.onsetSensitivity * 0.2;
        return Math.max(0, Math.min(1, score));
    }
    adaptConfigForGenre(profile) {
        return {
            ...this.config,
            minTempo: profile.tempoRange[0],
            maxTempo: profile.tempoRange[1],
            onsetWeight: this.config.onsetWeight * profile.onsetSensitivity,
            spectralWeight: this.config.spectralWeight * profile.spectralEmphasis,
            confidenceThreshold: this.config.confidenceThreshold * (1 - profile.rhythmComplexity * 0.2)
        };
    }
    async runOnsetDetection(audioData, config) {
        const onsets = this.onsetDetector.detectOnsets(audioData, this.config.sampleRate);
        return onsets.map(onset => ({
            timestamp: onset.time,
            confidence: onset.strength,
            source: 'onset',
            strength: onset.strength,
            metadata: {
                detectionMethod: 'onset'
            }
        }));
    }
    async runTempoTracking(audioData, config) {
        const tempoData = TempoTracking.detectTempo(audioData, this.config.sampleRate, {
            minBpm: config.minTempo,
            maxBpm: config.maxTempo,
            windowSize: 10.0,
            useDynamicProgramming: true
        });
        const beats = [];
        const beatInterval = 60 / tempoData.bpm;
        for (let time = 0; time < audioData.length / this.config.sampleRate; time += beatInterval) {
            beats.push({
                timestamp: time,
                confidence: tempoData.confidence,
                source: 'tempo',
                strength: tempoData.confidence,
                metadata: {
                    bpm: tempoData.bpm,
                    phase: (time % beatInterval) / beatInterval
                }
            });
        }
        return beats;
    }
    async runSpectralAnalysis(audioData, config) {
        const beats = [];
        const frameSize = this.config.frameSize;
        const hopSize = this.config.hopSize;
        const numFrames = Math.floor((audioData.length - frameSize) / hopSize) + 1;
        for (let i = 1; i < numFrames; i++) {
            const time = (i * hopSize) / this.config.sampleRate;
            const flux = this.calculateSpectralFlux(audioData, i, frameSize, hopSize);
            if (flux > 0.1) {
                beats.push({
                    timestamp: time,
                    confidence: Math.min(flux, 1),
                    source: 'spectral',
                    strength: flux,
                    metadata: {
                        spectralFlux: flux
                    }
                });
            }
        }
        return beats;
    }
    combineDetectionResults(onsetBeats, tempoBeats, spectralBeats, config) {
        const combinedBeats = [];
        const timeWindow = 0.05;
        const allBeats = [
            ...onsetBeats.map(b => ({ ...b, weight: config.onsetWeight })),
            ...tempoBeats.map(b => ({ ...b, weight: config.tempoWeight })),
            ...spectralBeats.map(b => ({ ...b, weight: config.spectralWeight }))
        ];
        allBeats.sort((a, b) => a.timestamp - b.timestamp);
        let i = 0;
        while (i < allBeats.length) {
            const currentBeat = allBeats[i];
            const group = [currentBeat];
            let j = i + 1;
            while (j < allBeats.length && allBeats[j].timestamp - currentBeat.timestamp <= timeWindow) {
                group.push(allBeats[j]);
                j++;
            }
            const combinedBeat = this.combineNearbyBeats(group);
            combinedBeats.push(combinedBeat);
            i = j;
        }
        return combinedBeats;
    }
    combineNearbyBeats(beats) {
        if (beats.length === 1) {
            const { weight, ...beat } = beats[0];
            return beat;
        }
        const totalWeight = beats.reduce((sum, b) => sum + b.weight * b.confidence, 0);
        const weightedTimestamp = beats.reduce((sum, b) => sum + b.timestamp * b.weight * b.confidence, 0) / totalWeight;
        const combinedConfidence = totalWeight / beats.length;
        const strongestBeat = beats.reduce((max, b) => b.confidence * b.weight > max.confidence * max.weight ? b : max);
        return {
            timestamp: weightedTimestamp,
            confidence: Math.min(combinedConfidence, 1),
            source: 'hybrid',
            strength: combinedConfidence,
            metadata: {
                sources: beats.map(b => b.source),
                originalConfidences: beats.map(b => b.confidence),
                weights: beats.map(b => b.weight),
                dominantSource: strongestBeat.source
            }
        };
    }
    async multiPassRefinement(audioData, beats, config) {
        let refinedBeats = this.removeIntervalOutliers(beats);
        refinedBeats = await this.enhanceSpectralBeats(audioData, refinedBeats);
        refinedBeats = this.applyTemporalSmoothing(refinedBeats);
        return refinedBeats;
    }
    removeIntervalOutliers(beats) {
        if (beats.length < 3)
            return beats;
        const intervals = [];
        for (let i = 1; i < beats.length; i++) {
            intervals.push(beats[i].timestamp - beats[i - 1].timestamp);
        }
        intervals.sort((a, b) => a - b);
        const median = intervals[Math.floor(intervals.length / 2)];
        const threshold = median * 0.5;
        return beats.filter((beat, i) => {
            if (i === 0 || i === beats.length - 1)
                return true;
            const prevInterval = beat.timestamp - beats[i - 1].timestamp;
            const nextInterval = beats[i + 1].timestamp - beat.timestamp;
            return Math.abs(prevInterval - median) <= threshold ||
                Math.abs(nextInterval - median) <= threshold;
        });
    }
    async enhanceSpectralBeats(audioData, beats) {
        const enhancedBeats = [...beats];
        for (let i = 0; i < enhancedBeats.length; i++) {
            const beat = enhancedBeats[i];
            const sampleIndex = Math.floor(beat.timestamp * this.config.sampleRate);
            const windowSize = Math.floor(this.config.sampleRate * 0.02);
            const startIndex = Math.max(0, sampleIndex - windowSize / 2);
            const endIndex = Math.min(audioData.length, sampleIndex + windowSize / 2);
            let energy = 0;
            for (let j = startIndex; j < endIndex; j++) {
                energy += audioData[j] * audioData[j];
            }
            energy /= (endIndex - startIndex);
            const energyBoost = Math.min(energy * 5, 0.3);
            enhancedBeats[i] = {
                ...beat,
                confidence: Math.min(beat.confidence + energyBoost, 1),
                strength: Math.min(beat.strength + energyBoost, 1)
            };
        }
        return enhancedBeats;
    }
    applyTemporalSmoothing(beats) {
        if (beats.length < 3)
            return beats;
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
    calculateConfidenceScores(beats, features) {
        return beats.map(beat => {
            let confidence = beat.confidence;
            if (beat.source === 'tempo' || beat.source === 'hybrid') {
                confidence *= 1.1;
            }
            if (beat.source === 'onset' && beat.strength > 0.8) {
                confidence *= 1.2;
            }
            if (features.dynamicRange > 20) {
                confidence *= 1.1;
            }
            if (features.rms < 0.01) {
                confidence *= 0.8;
            }
            return {
                ...beat,
                confidence: Math.min(confidence, 1)
            };
        });
    }
    sortAndValidateBeats(beats) {
        const sortedBeats = beats.sort((a, b) => a.timestamp - b.timestamp);
        const minInterval = 0.02;
        const uniqueBeats = [];
        for (const beat of sortedBeats) {
            if (uniqueBeats.length === 0 ||
                beat.timestamp - uniqueBeats[uniqueBeats.length - 1].timestamp >= minInterval) {
                uniqueBeats.push(beat);
            }
        }
        return uniqueBeats;
    }
    calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }
    calculateZeroCrossingRate(audioData) {
        let crossings = 0;
        for (let i = 1; i < audioData.length; i++) {
            if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
                crossings++;
            }
        }
        return crossings / audioData.length;
    }
    calculateDynamicRange(audioData) {
        let max = 0;
        let min = 0;
        for (let i = 0; i < audioData.length; i++) {
            max = Math.max(max, Math.abs(audioData[i]));
            min = Math.min(min, Math.abs(audioData[i]));
        }
        return 20 * Math.log10(max / (min || 1e-10));
    }
    calculateSpectralFlux(audioData, frameIndex, frameSize, hopSize) {
        const startIndex = frameIndex * hopSize;
        const prevStartIndex = (frameIndex - 1) * hopSize;
        if (prevStartIndex < 0 || startIndex + frameSize > audioData.length) {
            return 0;
        }
        let flux = 0;
        const binSize = frameSize / 2;
        for (let i = 0; i < binSize; i++) {
            const current = Math.abs(audioData[startIndex + i]);
            const previous = Math.abs(audioData[prevStartIndex + i]);
            flux += Math.max(0, current - previous);
        }
        return flux / binSize;
    }
    averageFrameFeatures(frameFeatures) {
        if (frameFeatures.length === 0) {
            throw new Error('Cannot average empty frame features array');
        }
        if (frameFeatures.length === 1) {
            return frameFeatures[0];
        }
        const numFrames = frameFeatures.length;
        const averaged = {
            spectralCentroid: 0,
            spectralRolloff: 0,
            zeroCrossingRate: 0,
            rms: 0,
            zcr: 0,
            mfcc: new Array(frameFeatures[0].mfcc.length).fill(0)
        };
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
Object.defineProperty(HybridDetector, "GENRE_PROFILES", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: [
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
    ]
});

class BeatSelector {
    static selectBeatsEnhanced(allBeats, config, tempo) {
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
        const selectedBeats = BeatSelector.selectBeatsInternal(allBeats, fullConfig, tempo);
        const beatResults = BeatSelector.convertToBeatResults(selectedBeats, tempo);
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
    selectBeats(allBeats, selection, tempo, audioDuration) {
        if (allBeats.length === 0)
            return [];
        const config = { ...BeatSelector.DEFAULT_SELECTION, ...selection };
        if (config.count >= allBeats.length) {
            return [...allBeats].sort((a, b) => a.timestamp - b.timestamp);
        }
        return BeatSelector.selectBeatsInternal(allBeats, config, tempo, audioDuration);
    }
    static selectBeats(allBeats, selection, tempo, audioDuration) {
        if (allBeats.length === 0)
            return [];
        const config = { ...BeatSelector.DEFAULT_SELECTION, ...selection };
        if (config.count >= allBeats.length) {
            return [...allBeats].sort((a, b) => a.timestamp - b.timestamp);
        }
        return BeatSelector.selectBeatsInternal(allBeats, config, tempo, audioDuration);
    }
    static selectBeatsInternal(allBeats, config, tempo, audioDuration) {
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
    static energyBasedSelection(beats, config) {
        const sortedBeats = [...beats]
            .sort((a, b) => b.strength - a.strength)
            .slice(0, config.count);
        return sortedBeats.sort((a, b) => a.timestamp - b.timestamp);
    }
    static regularSelection(beats, config, audioDuration) {
        if (!audioDuration || audioDuration <= 0) {
            const firstBeat = Math.min(...beats.map(b => b.timestamp));
            const lastBeat = Math.max(...beats.map(b => b.timestamp));
            audioDuration = lastBeat - firstBeat;
        }
        const selectedBeats = [];
        const interval = audioDuration * 1000 / config.count;
        for (let i = 0; i < config.count; i++) {
            const targetTime = i * interval;
            const closestBeat = BeatSelector.findClosestBeat(beats, targetTime);
            if (closestBeat && !selectedBeats.some(b => b.timestamp === closestBeat.timestamp)) {
                selectedBeats.push(closestBeat);
            }
        }
        return selectedBeats.sort((a, b) => a.timestamp - b.timestamp);
    }
    static musicalSelection(beats, config, tempo) {
        const scoredBeats = BeatSelector.scoreBeatsMusically(beats, tempo);
        const selectedBeats = scoredBeats
            .sort((a, b) => b.musicalScore - a.musicalScore)
            .slice(0, config.count)
            .map(sb => sb.beat);
        return selectedBeats.sort((a, b) => a.timestamp - b.timestamp);
    }
    static adaptiveSelection(beats, config, tempo, audioDuration) {
        const scoredBeats = BeatSelector.scoreBeatsComprehensively(beats, tempo, audioDuration);
        for (const scored of scoredBeats) {
            scored.totalScore =
                scored.energyScore * config.energyWeight +
                    scored.regularityScore * config.regularityWeight +
                    scored.musicalScore * config.musicalWeight +
                    scored.contextScore * 0.1;
        }
        const selectedBeats = BeatSelector.dynamicProgrammingSelection(scoredBeats, config.count);
        return selectedBeats.sort((a, b) => a.timestamp - b.timestamp);
    }
    static scoreBeatsComprehensively(beats, tempo, audioDuration) {
        const scoredBeats = [];
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
                totalScore: 0
            });
        }
        return scoredBeats;
    }
    static calculateEnergyScore(beat, maxStrength, maxConfidence) {
        const strengthScore = maxStrength > 0 ? beat.strength / maxStrength : 0;
        const confidenceScore = maxConfidence > 0 ? beat.confidence / maxConfidence : 0;
        return (strengthScore + confidenceScore) / 2;
    }
    static calculateRegularityScore(beat, allBeats, audioDuration) {
        if (!audioDuration)
            return 0.5;
        const beatTime = beat.timestamp / 1000;
        const normalizedTime = beatTime / audioDuration;
        1.0 / allBeats.length;
        const position = allBeats.findIndex(b => b === beat) / allBeats.length;
        const spacingError = Math.abs(position - normalizedTime);
        return Math.max(0, 1 - spacingError * 2);
    }
    static calculateMusicalScore(beat, allBeats, tempo) {
        let score = 0.5;
        if (tempo) {
            const beatInterval = 60000 / tempo.bpm;
            const beatTime = beat.timestamp;
            const nearestBeat = Math.round(beatTime / beatInterval) * beatInterval;
            const alignment = 1 - Math.abs(beatTime - nearestBeat) / (beatInterval / 2);
            score += alignment * 0.3;
            const beatNumber = Math.round(beatTime / beatInterval);
            if (tempo.timeSignature && tempo.timeSignature.numerator === 4) {
                if (beatNumber % 4 === 0) {
                    score += 0.2;
                }
                else if (beatNumber % 2 === 0) {
                    score += 0.1;
                }
            }
        }
        const localProminence = BeatSelector.calculateLocalProminence(beat, allBeats);
        score += localProminence * 0.2;
        return Math.min(1.0, score);
    }
    static calculateContextScore(beat, allBeats, index) {
        let score = 0.5;
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
                score += 0.2;
            }
        }
        const isolation = BeatSelector.calculateIsolation(beat, allBeats);
        score -= isolation * 0.3;
        return Math.max(0, Math.min(1.0, score));
    }
    static calculateLocalProminence(beat, allBeats) {
        const windowMs = 1000;
        const localBeats = allBeats.filter(b => Math.abs(b.timestamp - beat.timestamp) <= windowMs);
        if (localBeats.length <= 1)
            return 1.0;
        const maxLocalStrength = Math.max(...localBeats.map(b => b.strength));
        return maxLocalStrength > 0 ? beat.strength / maxLocalStrength : 0;
    }
    static calculateIsolation(beat, allBeats) {
        const windowMs = 500;
        const nearbyBeats = allBeats.filter(b => b !== beat && Math.abs(b.timestamp - beat.timestamp) <= windowMs);
        const maxNearby = 5;
        return Math.max(0, 1 - nearbyBeats.length / maxNearby);
    }
    static scoreBeatsMusically(beats, tempo) {
        return beats.map(beat => ({
            beat,
            musicalScore: BeatSelector.calculateMusicalScore(beat, beats, tempo)
        }));
    }
    static dynamicProgrammingSelection(scoredBeats, count) {
        if (scoredBeats.length <= count) {
            return scoredBeats.map(sb => sb.beat);
        }
        const sorted = [...scoredBeats].sort((a, b) => a.beat.timestamp - b.beat.timestamp);
        const n = sorted.length;
        const minSpacing = BeatSelector.calculateMinimumSpacing(sorted);
        const dp = Array(n + 1).fill(null).map(() => Array(count + 1).fill(-Infinity));
        const backtrack = Array(n + 1).fill(null).map(() => Array(count + 1).fill(null));
        for (let i = 0; i <= n; i++) {
            dp[i][0] = 0;
        }
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= Math.min(i, count); j++) {
                const currentBeat = sorted[i - 1];
                if (dp[i - 1][j] > dp[i][j]) {
                    dp[i][j] = dp[i - 1][j];
                    backtrack[i][j] = { from: [i - 1, j], selected: false };
                }
                for (let k = i - 2; k >= 0; k--) {
                    const prevBeat = sorted[k];
                    const spacing = currentBeat.beat.timestamp - prevBeat.beat.timestamp;
                    if (spacing >= minSpacing && dp[k][j - 1] !== -Infinity) {
                        const newScore = dp[k][j - 1] + currentBeat.totalScore;
                        if (newScore > dp[i][j]) {
                            dp[i][j] = newScore;
                            backtrack[i][j] = { from: [k, j - 1], selected: true };
                        }
                        break;
                    }
                }
            }
        }
        const selected = [];
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
    static calculateMinimumSpacing(scoredBeats) {
        if (scoredBeats.length <= 1)
            return 0;
        const intervals = [];
        for (let i = 1; i < scoredBeats.length; i++) {
            const interval = scoredBeats[i].beat.timestamp - scoredBeats[i - 1].beat.timestamp;
            intervals.push(interval);
        }
        const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        return avgInterval * 0.3;
    }
    static findClosestBeat(beats, targetTime) {
        if (beats.length === 0)
            return null;
        let closest = beats[0];
        if (!closest)
            return null;
        let minDistance = Math.abs(closest.timestamp - targetTime);
        for (let i = 1; i < beats.length; i++) {
            const beat = beats[i];
            if (!beat)
                continue;
            const distance = Math.abs(beat.timestamp - targetTime);
            if (distance < minDistance) {
                minDistance = distance;
                closest = beat;
            }
        }
        return closest;
    }
    static analyzeSelection(selectedBeats, allBeats, audioDuration) {
        if (selectedBeats.length === 0) {
            return { coverage: 0, diversity: 0, spacing: 0, quality: 0 };
        }
        let coverage = 1.0;
        if (audioDuration && audioDuration > 0) {
            const firstBeat = Math.min(...selectedBeats.map(b => b.timestamp));
            const lastBeat = Math.max(...selectedBeats.map(b => b.timestamp));
            const spanCovered = (lastBeat - firstBeat) / 1000;
            coverage = Math.min(1.0, spanCovered / audioDuration);
        }
        const strengths = selectedBeats.map(b => b.strength);
        const minStrength = Math.min(...strengths);
        const maxStrength = Math.max(...strengths);
        const diversity = maxStrength > 0 ? 1 - (maxStrength - minStrength) / maxStrength : 0;
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
        const quality = (coverage + diversity + spacing) / 3;
        return { coverage, diversity, spacing, quality };
    }
    static convertToBeatResults(beats, tempo) {
        return beats.map((beat, index) => {
            const result = {
                timestamp: beat.timestamp,
                confidence: beat.confidence,
                strength: beat.strength,
                type: BeatSelector.classifyBeatType(beat, beats, index, tempo),
                metadata: {
                    detectionScore: beat.strength * beat.confidence,
                    ...beat.metadata
                }
            };
            if (tempo) {
                const beatInterval = 60000 / tempo.bpm;
                const beatNumber = Math.round(beat.timestamp / beatInterval);
                result.metadata.expectedTime = beatNumber * beatInterval;
                result.metadata.timingDeviation = beat.timestamp - result.metadata.expectedTime;
                result.metadata.beatNumber = (beatNumber % (tempo.timeSignature?.numerator || 4)) + 1;
                result.metadata.measureNumber = Math.floor(beatNumber / (tempo.timeSignature?.numerator || 4)) + 1;
                result.metadata.beatPhase = (beat.timestamp % beatInterval) / beatInterval;
            }
            return result;
        });
    }
    static classifyBeatType(beat, allBeats, index, tempo) {
        if (!tempo)
            return undefined;
        const beatInterval = 60000 / tempo.bpm;
        const beatNumber = Math.round(beat.timestamp / beatInterval);
        const numerator = tempo.timeSignature?.numerator || 4;
        const beatInMeasure = beatNumber % numerator;
        if (beatInMeasure === 0) {
            return 'downbeat';
        }
        else if (numerator === 4 && beatInMeasure === 2) {
            return 'beat';
        }
        else if (beatInMeasure % 2 === 0) {
            return 'beat';
        }
        else {
            const expectedStrength = BeatSelector.getExpectedStrengthForPosition(beatInMeasure, numerator);
            if (beat.strength > expectedStrength * 1.5) {
                return 'syncopated';
            }
            return 'offbeat';
        }
    }
    static getExpectedStrengthForPosition(beatInMeasure, numerator) {
        if (beatInMeasure === 0)
            return 1.0;
        if (numerator === 4 && beatInMeasure === 2)
            return 0.8;
        if (beatInMeasure % 2 === 0)
            return 0.6;
        return 0.4;
    }
    static handleInsufficientBeats(availableBeats, requestedCount, audioDuration, tempo) {
        if (availableBeats.length >= requestedCount) {
            return BeatSelector.convertToBeatResults(availableBeats.slice(0, requestedCount), tempo);
        }
        const result = [...availableBeats];
        const needed = requestedCount - availableBeats.length;
        if (tempo && audioDuration && needed > 0) {
            const beatInterval = 60000 / tempo.bpm;
            const syntheticBeats = BeatSelector.generateSyntheticBeats(availableBeats, needed, beatInterval, audioDuration);
            result.push(...syntheticBeats);
        }
        return BeatSelector.convertToBeatResults(result.sort((a, b) => a.timestamp - b.timestamp).slice(0, requestedCount), tempo);
    }
    static generateSyntheticBeats(existingBeats, count, beatInterval, audioDuration) {
        const synthetic = [];
        const maxTime = audioDuration * 1000;
        const avgStrength = existingBeats.length > 0
            ? existingBeats.reduce((sum, b) => sum + b.strength, 0) / existingBeats.length
            : 0.5;
        const avgConfidence = existingBeats.length > 0
            ? existingBeats.reduce((sum, b) => sum + b.confidence, 0) / existingBeats.length
            : 0.6;
        const expectedBeats = Math.floor(maxTime / beatInterval);
        const taken = new Set(existingBeats.map(b => Math.round(b.timestamp / beatInterval)));
        for (let i = 0; i < expectedBeats && synthetic.length < count; i++) {
            if (!taken.has(i)) {
                synthetic.push({
                    timestamp: i * beatInterval,
                    strength: avgStrength * 0.7,
                    confidence: avgConfidence * 0.5,
                    metadata: {
                        interpolated: true,
                        synthetic: true
                    }
                });
            }
        }
        return synthetic.slice(0, count);
    }
    static getSelectionStatistics(result) {
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
    static validateConfig(config) {
        const errors = [];
        if (config.count !== undefined) {
            if (!Number.isInteger(config.count) || config.count < 1) {
                errors.push('count must be a positive integer');
            }
        }
        const weights = ['energyWeight', 'regularityWeight', 'musicalWeight'];
        for (const weight of weights) {
            if (config[weight] !== undefined) {
                if (typeof config[weight] !== 'number' ||
                    config[weight] < 0 || config[weight] > 1) {
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
    static getAvailableStrategies() {
        return {
            energy: 'Select beats with highest energy/strength values',
            regular: 'Distribute beats evenly across time duration',
            musical: 'Select beats based on musical/rhythmic importance',
            adaptive: 'Combine multiple approaches using weighted scoring and dynamic programming'
        };
    }
}
Object.defineProperty(BeatSelector, "DEFAULT_SELECTION", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        strategy: 'adaptive',
        count: 16,
        energyWeight: 0.3,
        regularityWeight: 0.3,
        musicalWeight: 0.4
    }
});
Object.defineProperty(BeatSelector, "DEFAULT_CONFIG", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        strategy: 'adaptive',
        count: 16,
        energyWeight: 0.3,
        regularityWeight: 0.3,
        musicalWeight: 0.4,
        minSpacing: 50,
        audioDuration: undefined
    }
});

class OutputFormatter {
    format(result, selectedBeats, format = {}) {
        return OutputFormatter.formatToParsedBeatsOutput(result, selectedBeats, format);
    }
    static format(result, selectedBeats, format = {}) {
        return OutputFormatter.formatToParsedBeatsOutput(result, selectedBeats, format);
    }
    static formatToParsedBeatsOutput(result, selectedBeats, format = {}) {
        const config = { ...OutputFormatter.DEFAULT_FORMAT, ...format };
        const output = {
            beats: selectedBeats || OutputFormatter.convertBeatsToResults(result.beats),
            version: OutputFormatter.VERSION,
            timestamp: new Date().toISOString(),
            metadata: {
                processingTime: result.metadata.processingTime,
                samplesProcessed: result.metadata.samplesProcessed,
                parameters: result.metadata.parameters,
                ...OutputFormatter.generateProcessingMetadata(result, selectedBeats, config)
            }
        };
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
    static formatResult(result, selectedBeats, format = {}, version = '1.0.0') {
        const config = { ...OutputFormatter.DEFAULT_FORMAT, ...format };
        const formattedResult = {
            beats: OutputFormatter.formatBeats(selectedBeats || result.beats, config),
            version,
            timestamp: new Date().toISOString()
        };
        if (result.tempo) {
            formattedResult.tempo = OutputFormatter.formatTempo(result.tempo, config);
        }
        if (config.includeMetadata) {
            formattedResult.metadata = OutputFormatter.formatMetadata(result.metadata, result.beats, config, selectedBeats);
        }
        return formattedResult;
    }
    static formatBeats(beats, config) {
        return beats.map(beat => OutputFormatter.formatSingleBeat(beat, config));
    }
    static formatSingleBeat(beat, config) {
        const formatted = {
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
    static formatTempo(tempo, config) {
        const formatted = {
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
    static formatMetadata(originalMetadata, allBeats, config, selectedBeats) {
        const metadata = {
            processingTime: originalMetadata.processingTime,
            samplesProcessed: originalMetadata.samplesProcessed,
            parameters: originalMetadata.parameters
        };
        if (allBeats.length > 0) {
            const analysis = OutputFormatter.analyzeBeats(allBeats, selectedBeats, config);
            metadata.analysis = analysis;
        }
        return metadata;
    }
    static analyzeBeats(allBeats, selectedBeats, config) {
        const beatsToAnalyze = selectedBeats || allBeats;
        const totalConfidence = beatsToAnalyze.reduce((sum, b) => sum + b.confidence, 0);
        const totalStrength = beatsToAnalyze.reduce((sum, b) => sum + b.strength, 0);
        const averageConfidence = beatsToAnalyze.length > 0 ? totalConfidence / beatsToAnalyze.length : 0;
        const averageStrength = beatsToAnalyze.length > 0 ? totalStrength / beatsToAnalyze.length : 0;
        let beatDensity = 0;
        if (beatsToAnalyze.length > 1) {
            const sortedBeats = [...beatsToAnalyze].sort((a, b) => a.timestamp - b.timestamp);
            const duration = (sortedBeats[sortedBeats.length - 1].timestamp - sortedBeats[0].timestamp) / 1000;
            beatDensity = duration > 0 ? beatsToAnalyze.length / duration : 0;
        }
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
    static calculateQualityScore(beats) {
        if (beats.length === 0)
            return 0;
        let score = 0;
        let factors = 0;
        const avgConfidence = beats.reduce((sum, b) => sum + b.confidence, 0) / beats.length;
        score += avgConfidence * 0.3;
        factors++;
        if (beats.length > 2) {
            const sortedBeats = [...beats].sort((a, b) => a.timestamp - b.timestamp);
            const intervals = [];
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
        const strengths = beats.map(b => b.strength);
        const maxStrength = Math.max(...strengths);
        const minStrength = Math.min(...strengths);
        const avgStrength = strengths.reduce((sum, val) => sum + val, 0) / strengths.length;
        const strengthScore = maxStrength > 0 ? avgStrength / maxStrength : 0;
        const variation = maxStrength > 0 ? (maxStrength - minStrength) / maxStrength : 0;
        const variationBonus = Math.min(0.2, variation * 0.5);
        score += (strengthScore + variationBonus) * 0.3;
        factors++;
        return factors > 0 ? score / factors : 0;
    }
    static toJSON(result, pretty = false) {
        if (pretty) {
            return JSON.stringify(result, null, 2);
        }
        return JSON.stringify(result);
    }
    static toCSV(beats, includeHeaders = true) {
        if (beats.length === 0) {
            return includeHeaders ? 'timestamp,confidence,strength\n' : '';
        }
        let csv = '';
        if (includeHeaders) {
            const headers = ['timestamp'];
            if (beats[0].confidence !== undefined)
                headers.push('confidence');
            if (beats[0].strength !== undefined)
                headers.push('strength');
            csv += headers.join(',') + '\n';
        }
        for (const beat of beats) {
            const row = [beat.timestamp.toString()];
            if (beat.confidence !== undefined)
                row.push(beat.confidence.toString());
            if (beat.strength !== undefined)
                row.push(beat.strength.toString());
            csv += row.join(',') + '\n';
        }
        return csv;
    }
    static toMIDITicks(beats, ticksPerQuarterNote = 480, bpm = 120) {
        const msPerTick = (60000 / bpm / ticksPerQuarterNote);
        return beats.map(beat => ({
            tick: Math.round(beat.timestamp / msPerTick),
            velocity: Math.round((beat.strength || 0.5) * 127)
        }));
    }
    static toClickTrack(beats, sampleRate = 44100) {
        return beats.map(beat => Math.round(beat.timestamp * sampleRate / 1000));
    }
    static createSummary(result) {
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
        const timestamps = beats.map(b => b.timestamp);
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const duration = (maxTime - minTime) / 1000;
        let averageBPM = 0;
        if (beats.length > 1 && duration > 0) {
            averageBPM = (beats.length - 1) / duration * 60;
        }
        else if (result.tempo) {
            averageBPM = result.tempo.bpm;
        }
        const confidences = beats
            .map(b => b.confidence)
            .filter((c) => c !== undefined);
        const confidence = confidences.length > 0 ? {
            min: Math.min(...confidences),
            max: Math.max(...confidences),
            average: confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        } : { min: 0, max: 0, average: 0 };
        const strengths = beats
            .map(b => b.strength)
            .filter((s) => s !== undefined);
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
    static validateResult(result) {
        if (!result || typeof result !== 'object')
            return false;
        const r = result;
        if (!Array.isArray(r.beats))
            return false;
        if (typeof r.version !== 'string')
            return false;
        if (typeof r.timestamp !== 'string')
            return false;
        for (const beat of r.beats) {
            if (!OutputFormatter.validateBeat(beat))
                return false;
        }
        if (r.tempo !== undefined && !OutputFormatter.validateTempo(r.tempo)) {
            return false;
        }
        return true;
    }
    static validateBeat(beat) {
        if (!beat || typeof beat !== 'object')
            return false;
        const b = beat;
        if (typeof b.timestamp !== 'number' || !isFinite(b.timestamp)) {
            return false;
        }
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
    static validateTempo(tempo) {
        if (!tempo || typeof tempo !== 'object')
            return false;
        const t = tempo;
        if (typeof t.bpm !== 'number' || !isFinite(t.bpm) || t.bpm <= 0) {
            return false;
        }
        if (t.confidence !== undefined &&
            (typeof t.confidence !== 'number' || !isFinite(t.confidence))) {
            return false;
        }
        return true;
    }
    static convertBeatsToResults(beats) {
        return beats.map(beat => ({
            timestamp: beat.timestamp,
            confidence: beat.confidence,
            strength: beat.strength,
            metadata: beat.metadata
        }));
    }
    static generateProcessingMetadata(result, selectedBeats, config) {
        const allBeats = result.beats;
        const outputBeats = selectedBeats || OutputFormatter.convertBeatsToResults(allBeats);
        const metadata = {};
        if (outputBeats.length > 0) {
            const totalConfidence = outputBeats.reduce((sum, b) => sum + b.confidence, 0);
            const totalStrength = outputBeats.reduce((sum, b) => sum + b.strength, 0);
            const averageConfidence = totalConfidence / outputBeats.length;
            const averageStrength = totalStrength / outputBeats.length;
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
        metadata.performance = {
            memoryUsage: OutputFormatter.getMemoryUsage(),
            efficiency: OutputFormatter.calculateProcessingEfficiency(result.metadata.processingTime, allBeats.length)
        };
        metadata.algorithmVersions = {
            beatSelector: '2.0.0',
            outputFormatter: OutputFormatter.VERSION
        };
        return metadata;
    }
    static calculateAdvancedQualityScore(beats) {
        if (beats.length === 0)
            return 0;
        let score = 0;
        let factors = 0;
        const avgConfidence = beats.reduce((sum, b) => sum + b.confidence, 0) / beats.length;
        score += avgConfidence * 0.3;
        factors++;
        const typeDistribution = OutputFormatter.analyzeBeatTypeDistribution(beats);
        score += typeDistribution * 0.2;
        factors++;
        if (beats.length > 2) {
            const timingConsistency = OutputFormatter.calculateTimingConsistency(beats);
            score += timingConsistency * 0.25;
            factors++;
        }
        const strengthQuality = OutputFormatter.calculateStrengthQuality(beats);
        score += strengthQuality * 0.25;
        factors++;
        return factors > 0 ? score / factors : 0;
    }
    static analyzeBeatTypeDistribution(beats) {
        if (beats.length === 0)
            return 0;
        const typeCounts = beats.reduce((acc, beat) => {
            const type = beat.type || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
        const totalBeats = beats.length;
        let distributionScore = 0.5;
        if (typeCounts.downbeat) {
            distributionScore += Math.min(0.3, (typeCounts.downbeat / totalBeats) * 1.5);
        }
        const uniqueTypes = Object.keys(typeCounts).length;
        if (uniqueTypes > 1) {
            distributionScore += Math.min(0.2, uniqueTypes * 0.05);
        }
        return Math.min(1.0, distributionScore);
    }
    static calculateTimingConsistency(beats) {
        if (beats.length < 3)
            return 1.0;
        const sortedBeats = [...beats].sort((a, b) => a.timestamp - b.timestamp);
        const intervals = [];
        for (let i = 1; i < sortedBeats.length; i++) {
            intervals.push(sortedBeats[i].timestamp - sortedBeats[i - 1].timestamp);
        }
        if (intervals.length === 0)
            return 1.0;
        const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => {
            const diff = val - mean;
            return sum + diff * diff;
        }, 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
        return Math.max(0, 1 - coefficientOfVariation);
    }
    static calculateStrengthQuality(beats) {
        if (beats.length === 0)
            return 0;
        const strengths = beats.map(b => b.strength);
        const avgStrength = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
        const maxStrength = Math.max(...strengths);
        const minStrength = Math.min(...strengths);
        const normalizedAvg = maxStrength > 0 ? avgStrength / maxStrength : 0;
        const dynamicRange = maxStrength > 0 ? (maxStrength - minStrength) / maxStrength : 0;
        const rangeBonus = Math.min(0.3, dynamicRange * 0.5);
        return Math.min(1.0, normalizedAvg * 0.7 + rangeBonus);
    }
    static getMemoryUsage() {
        return undefined;
    }
    static calculateProcessingEfficiency(processingTime, beatsProcessed) {
        if (processingTime <= 0 || beatsProcessed <= 0)
            return 0;
        const beatsPerMs = beatsProcessed / processingTime;
        return Math.min(1.0, beatsPerMs);
    }
    static toStructuredJSON(output, format = 'pretty') {
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
    static createMinimalOutput(output) {
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
    static toXML(output) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<beatAnalysis version="' + output.version + '" timestamp="' + output.timestamp + '">\n';
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
        if (output.tempo) {
            xml += '  <tempo bpm="' + output.tempo.bpm +
                '" confidence="' + (output.tempo.confidence || 0) + '"';
            if (output.tempo.timeSignature) {
                xml += ' timeSignature="' + output.tempo.timeSignature.numerator +
                    '/' + output.tempo.timeSignature.denominator + '"';
            }
            xml += '/>\n';
        }
        xml += '  <metadata processingTime="' + output.metadata.processingTime + '"';
        if (output.metadata.analysis) {
            xml += ' totalBeats="' + output.metadata.analysis.totalBeatsDetected + '"';
            xml += ' selectedBeats="' + output.metadata.analysis.beatsSelected + '"';
        }
        xml += '/>\n';
        xml += '</beatAnalysis>';
        return xml;
    }
    static toYAML(output) {
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
    static validateOutput(output) {
        if (!output || typeof output !== 'object')
            return false;
        const o = output;
        if (!Array.isArray(o.beats))
            return false;
        if (typeof o.version !== 'string')
            return false;
        if (typeof o.timestamp !== 'string')
            return false;
        if (!o.metadata || typeof o.metadata !== 'object')
            return false;
        for (const beat of o.beats) {
            if (!OutputFormatter.validateBeatResult(beat))
                return false;
        }
        return true;
    }
    static validateBeatResult(beat) {
        if (!beat || typeof beat !== 'object')
            return false;
        const b = beat;
        if (typeof b.timestamp !== 'number' || !isFinite(b.timestamp))
            return false;
        if (typeof b.confidence !== 'number' || !isFinite(b.confidence))
            return false;
        if (typeof b.strength !== 'number' || !isFinite(b.strength))
            return false;
        if (b.type !== undefined && typeof b.type !== 'string')
            return false;
        return true;
    }
    static roundToPrecision(value, precision) {
        const factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }
}
Object.defineProperty(OutputFormatter, "DEFAULT_FORMAT", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        includeConfidence: true,
        includeStrength: true,
        includeMetadata: true,
        precision: 3
    }
});
Object.defineProperty(OutputFormatter, "VERSION", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: '2.0.0'
});

class BeatParser {
    constructor(config = {}) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "audioProcessor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hybridDetector", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "beatSelector", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "outputFormatter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "plugins", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "initialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.config = { ...BeatParser.DEFAULT_CONFIG, ...config };
        this.plugins = [...this.config.plugins];
        this.audioProcessor = new AudioProcessor({
            sampleRate: this.config.sampleRate,
            enableNormalization: this.config.enableNormalization,
            enableFiltering: this.config.enableFiltering
        });
        this.hybridDetector = new HybridDetector(this.config);
        this.beatSelector = new BeatSelector();
        this.outputFormatter = new OutputFormatter();
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            for (const plugin of this.plugins) {
                if (plugin.initialize) {
                    await plugin.initialize(this.config);
                }
            }
            this.initialized = true;
        }
        catch (error) {
            throw new Error(`Failed to initialize BeatParser: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async parseFile(filePath, options = {}) {
        if (!await this.fileExists(filePath)) {
            throw new Error(`Audio file not found: ${filePath}`);
        }
        const extension = path.extname(filePath).toLowerCase();
        const supportedFormats = ['.wav', '.mp3', '.flac', '.ogg', '.m4a'];
        if (!supportedFormats.includes(extension)) {
            throw new Error(`Unsupported audio format: ${extension}. Supported formats: ${supportedFormats.join(', ')}`);
        }
        try {
            await this.initialize();
            const audioBuffer = await this.audioProcessor.loadFile(filePath);
            return await this.parseBuffer(audioBuffer, {
                ...options,
                filename: path.basename(filePath)
            });
        }
        catch (error) {
            throw new Error(`Failed to parse file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async parseBuffer(audioData, options = {}) {
        const startTime = Date.now();
        try {
            await this.initialize();
            let processedAudio;
            if (audioData instanceof Buffer) {
                processedAudio = await this.audioProcessor.processBuffer(audioData);
            }
            else {
                processedAudio = audioData;
            }
            this.validateAudioData(processedAudio);
            if (this.config.enablePreprocessing) {
                processedAudio = await this.preprocessAudio(processedAudio);
            }
            processedAudio = await this.applyAudioPlugins(processedAudio);
            let beats = await this.hybridDetector.detectBeats(processedAudio);
            beats = await this.applyBeatPlugins(beats);
            const selectedBeats = await this.beatSelector.selectBeats(beats, {
                targetCount: options.targetPictureCount,
                selectionMethod: options.selectionMethod || 'adaptive',
                qualityThreshold: this.config.confidenceThreshold
            });
            const result = {
                beats: selectedBeats,
                tempo: undefined,
                metadata: {
                    processingTime: Date.now() - startTime,
                    samplesProcessed: processedAudio.length,
                    parameters: options,
                    audioLength: processedAudio.length / this.config.sampleRate,
                    sampleRate: this.config.sampleRate,
                    algorithmsUsed: ['hybrid'],
                    pluginsUsed: this.plugins.map(p => ({ name: p.name, version: p.version }))
                }
            };
            return result;
        }
        catch (error) {
            throw new Error(`Failed to parse audio buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async parseStream(audioStream, options = {}) {
        const startTime = Date.now();
        try {
            await this.initialize();
            const chunkSize = options.chunkSize || this.config.sampleRate;
            const overlap = options.overlap || 0.1;
            const overlapSamples = Math.floor(chunkSize * overlap);
            const allBeats = [];
            const audioChunks = [];
            let processedSamples = 0;
            let timeOffset = 0;
            let previousChunk = null;
            const reader = 'getReader' in audioStream
                ? audioStream.getReader()
                : audioStream;
            if ('getReader' in reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    const chunk = await this.processStreamChunk(value, previousChunk, overlapSamples, timeOffset);
                    allBeats.push(...chunk.beats);
                    audioChunks.push(chunk.audio);
                    processedSamples += value.length;
                    timeOffset = processedSamples / this.config.sampleRate;
                    previousChunk = value;
                    if (options.progressCallback) {
                        options.progressCallback(processedSamples);
                    }
                }
            }
            else {
                for await (const chunk of reader) {
                    const processedChunk = await this.processStreamChunk(chunk, previousChunk, overlapSamples, timeOffset);
                    allBeats.push(...processedChunk.beats);
                    audioChunks.push(processedChunk.audio);
                    processedSamples += chunk.length;
                    timeOffset = processedSamples / this.config.sampleRate;
                    previousChunk = chunk;
                    if (options.progressCallback) {
                        options.progressCallback(processedSamples);
                    }
                }
            }
            const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedAudio = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
                combinedAudio.set(chunk, offset);
                offset += chunk.length;
            }
            const dedupedBeats = this.removeDuplicateBeats(allBeats);
            const processedBeats = await this.applyBeatPlugins(dedupedBeats);
            const selectedBeats = await this.beatSelector.selectBeats(processedBeats, {
                targetCount: options.targetPictureCount,
                selectionMethod: options.selectionMethod || 'adaptive',
                qualityThreshold: this.config.confidenceThreshold
            });
            const result = {
                beats: selectedBeats,
                tempo: undefined,
                metadata: {
                    processingTime: Date.now() - startTime,
                    samplesProcessed: combinedAudio.length,
                    parameters: options,
                    audioLength: combinedAudio.length / this.config.sampleRate,
                    sampleRate: this.config.sampleRate,
                    algorithmsUsed: ['hybrid', 'streaming'],
                    pluginsUsed: this.plugins.map(p => ({ name: p.name, version: p.version })),
                    chunksProcessed: audioChunks.length
                }
            };
            return result;
        }
        catch (error) {
            throw new Error(`Failed to parse audio stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    addPlugin(plugin) {
        if (this.initialized) {
            throw new Error('Cannot add plugins after parser initialization. Add plugins before calling any parse methods.');
        }
        if (this.plugins.some(p => p.name === plugin.name)) {
            throw new Error(`Plugin with name '${plugin.name}' is already registered`);
        }
        this.plugins.push(plugin);
        this.config.plugins.push(plugin);
    }
    removePlugin(pluginName) {
        if (this.initialized) {
            throw new Error('Cannot remove plugins after parser initialization');
        }
        this.plugins = this.plugins.filter(p => p.name !== pluginName);
        this.config.plugins = this.config.plugins.filter(p => p.name !== pluginName);
    }
    getPlugins() {
        return this.plugins.map(p => ({ name: p.name, version: p.version }));
    }
    updateConfig(newConfig) {
        if (this.initialized) {
            throw new Error('Cannot update configuration after parser initialization');
        }
        this.config = { ...this.config, ...newConfig };
        this.hybridDetector = new HybridDetector(this.config);
        this.audioProcessor = new AudioProcessor({
            sampleRate: this.config.sampleRate,
            enableNormalization: this.config.enableNormalization,
            enableFiltering: this.config.enableFiltering
        });
    }
    getConfig() {
        return { ...this.config };
    }
    static getVersion() {
        return '1.0.0';
    }
    static getSupportedFormats() {
        return ['.wav', '.mp3', '.flac', '.ogg', '.m4a'];
    }
    async cleanup() {
        try {
            for (const plugin of this.plugins) {
                if (plugin.cleanup) {
                    await plugin.cleanup();
                }
            }
            this.initialized = false;
        }
        catch (error) {
            console.warn('Error during cleanup:', error);
        }
    }
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    validateAudioData(audioData) {
        if (!audioData || audioData.length === 0) {
            throw new Error('Invalid or empty audio data provided');
        }
        if (audioData.length < this.config.frameSize) {
            throw new Error(`Audio data too short. Minimum length: ${this.config.frameSize} samples`);
        }
        for (let i = 0; i < Math.min(audioData.length, 1000); i++) {
            if (!isFinite(audioData[i])) {
                throw new Error('Audio data contains invalid values (NaN or Infinity)');
            }
        }
    }
    async preprocessAudio(audioData) {
        let processed = audioData;
        if (this.config.enableNormalization) {
            processed = await this.audioProcessor.normalize(processed);
        }
        if (this.config.enableFiltering) {
            processed = await this.audioProcessor.applyFilters(processed);
        }
        return processed;
    }
    async applyAudioPlugins(audioData) {
        let processed = audioData;
        for (const plugin of this.plugins) {
            if (plugin.processAudio) {
                processed = await plugin.processAudio(processed, this.config);
            }
        }
        return processed;
    }
    async applyBeatPlugins(beats) {
        let processed = beats;
        for (const plugin of this.plugins) {
            if (plugin.processBeats) {
                processed = await plugin.processBeats(processed, this.config);
            }
        }
        return processed;
    }
    async processStreamChunk(chunk, previousChunk, overlapSamples, timeOffset) {
        let processAudio = chunk;
        if (previousChunk && overlapSamples > 0) {
            const overlapStart = Math.max(0, previousChunk.length - overlapSamples);
            const overlap = previousChunk.slice(overlapStart);
            const combined = new Float32Array(overlap.length + chunk.length);
            combined.set(overlap);
            combined.set(chunk, overlap.length);
            processAudio = combined;
        }
        const processedAudio = await this.preprocessAudio(processAudio);
        const pluginProcessed = await this.applyAudioPlugins(processedAudio);
        const rawBeats = await this.hybridDetector.detectBeats(pluginProcessed);
        const adjustedBeats = rawBeats.map(beat => ({
            ...beat,
            timestamp: beat.timestamp + timeOffset
        }));
        return {
            beats: adjustedBeats,
            audio: chunk
        };
    }
    removeDuplicateBeats(beats) {
        const sortedBeats = beats.sort((a, b) => a.timestamp - b.timestamp);
        const deduped = [];
        const minInterval = 0.05;
        for (const beat of sortedBeats) {
            if (deduped.length === 0 ||
                beat.timestamp - deduped[deduped.length - 1].timestamp >= minInterval) {
                deduped.push(beat);
            }
            else {
                const lastBeat = deduped[deduped.length - 1];
                if (beat.confidence > lastBeat.confidence) {
                    deduped[deduped.length - 1] = beat;
                }
            }
        }
        return deduped;
    }
}
Object.defineProperty(BeatParser, "DEFAULT_CONFIG", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
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
        enablePreprocessing: true,
        enableNormalization: true,
        enableFiltering: false,
        outputFormat: 'json',
        includeMetadata: true,
        includeConfidenceScores: true,
        plugins: []
    }
});

function validateAudioData(audioData) {
    if (!audioData) {
        throw new Error('Audio data is required');
    }
    if (!Array.isArray(audioData) &&
        !(audioData instanceof Float32Array) &&
        !(audioData instanceof Float64Array)) {
        throw new Error('Audio data must be an array or typed array');
    }
    if (audioData.length === 0) {
        throw new Error('Audio data cannot be empty');
    }
    for (let i = 0; i < audioData.length; i++) {
        const sample = audioData[i];
        if (typeof sample !== 'number' || !isFinite(sample)) {
            throw new Error(`Invalid audio sample at index ${i}: ${sample}`);
        }
    }
}
function validateParseOptions(options) {
    const defaults = {
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
    if (result.minConfidence < 0 || result.minConfidence > 1) {
        throw new Error('minConfidence must be between 0 and 1');
    }
    if (!Number.isInteger(result.windowSize) || result.windowSize <= 0) {
        throw new Error('windowSize must be a positive integer');
    }
    if (!Number.isInteger(result.hopSize) || result.hopSize <= 0) {
        throw new Error('hopSize must be a positive integer');
    }
    if (!Number.isInteger(result.sampleRate) || result.sampleRate <= 0) {
        throw new Error('sampleRate must be a positive integer');
    }
    if (result.hopSize > result.windowSize) {
        throw new Error('hopSize cannot be larger than windowSize');
    }
    return result;
}

class BaseParser {
    constructor(name, version) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.name = name;
        this.version = version;
    }
    getName() {
        return this.name;
    }
    getVersion() {
        return this.version;
    }
    validateAndPrepareData(audioData, options) {
        validateAudioData(audioData);
        const validatedOptions = validateParseOptions(options);
        const data = audioData instanceof Float32Array
            ? audioData
            : new Float32Array(audioData);
        return { data, options: validatedOptions };
    }
    createMetadata(startTime, samplesProcessed, options) {
        return {
            processingTime: Date.now() - startTime,
            samplesProcessed,
            parameters: options,
        };
    }
}

class BasicBeatParser extends BaseParser {
    constructor() {
        super('BasicBeatParser', '1.0.0');
    }
    async parse(audioData, options) {
        const startTime = Date.now();
        const { data, options: validatedOptions } = this.validateAndPrepareData(audioData, options);
        const beats = await this.detectBeats(data, validatedOptions);
        const metadata = this.createMetadata(startTime, data.length, validatedOptions);
        return {
            beats,
            metadata,
        };
    }
    async detectBeats(data, options) {
        const beats = [];
        const { windowSize, hopSize, sampleRate, minConfidence } = options;
        for (let i = 0; i < data.length - windowSize; i += hopSize) {
            const window = data.slice(i, i + windowSize);
            const energy = this.calculateEnergy(window);
            if (energy > minConfidence) {
                beats.push({
                    timestamp: (i / sampleRate) * 1000,
                    confidence: Math.min(energy, 1.0),
                    strength: energy,
                });
            }
        }
        return beats;
    }
    calculateEnergy(window) {
        let energy = 0;
        for (let i = 0; i < window.length; i++) {
            energy += window[i] * window[i];
        }
        return energy / window.length;
    }
}

class AdvancedBeatParser extends BaseParser {
    constructor() {
        super('AdvancedBeatParser', '1.0.0');
        Object.defineProperty(this, "defaultOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                minConfidence: 0.3,
                windowSize: 1024,
                hopSize: 512,
                sampleRate: 44100,
                onsetDetection: {
                    method: 'combined',
                    windowSize: 1024,
                    hopSize: 512,
                    threshold: 0.3,
                    minInterval: 0.05
                },
                tempoTracking: {
                    minBpm: 60,
                    maxBpm: 200,
                    windowSize: 10.0,
                    useDynamicProgramming: true
                },
                beatSelection: {
                    strategy: 'adaptive',
                    count: 16,
                    energyWeight: 0.3,
                    regularityWeight: 0.3,
                    musicalWeight: 0.4
                },
                outputFormat: {
                    includeConfidence: true,
                    includeStrength: true,
                    includeMetadata: true,
                    precision: 3
                },
                preprocessAudio: true,
                highPassCutoff: 80.0
            }
        });
    }
    async parse(audioData, options = {}) {
        const startTime = Date.now();
        const { data, options: validatedOptions } = this.validateAndPrepareData(audioData, options);
        const opts = { ...this.defaultOptions, ...validatedOptions, ...options };
        try {
            let processedAudio = data;
            if (opts.preprocessAudio) {
                processedAudio = this.preprocessAudio(data, opts);
            }
            const onsets = OnsetDetection.detectOnsets(processedAudio, opts.sampleRate, opts.onsetDetection);
            const refinedOnsets = OnsetDetection.postProcessOnsets(onsets, processedAudio, opts.sampleRate);
            const tempo = TempoTracking.detectTempo(processedAudio, opts.sampleRate, opts.tempoTracking);
            const audioDuration = processedAudio.length / opts.sampleRate;
            const allBeats = TempoTracking.trackBeats(refinedOnsets, tempo, audioDuration, opts.tempoTracking);
            const selectedBeats = BeatSelector.selectBeats(allBeats, opts.beatSelection, tempo, audioDuration);
            const metadata = this.createMetadata(startTime, data.length, opts);
            const baseResult = {
                beats: selectedBeats,
                tempo,
                metadata
            };
            if (opts.outputFormat) {
                const formattedResult = OutputFormatter.formatResult(baseResult, selectedBeats, opts.outputFormat, this.getVersion());
                baseResult.metadata = {
                    ...baseResult.metadata,
                    formattedResult
                };
            }
            return baseResult;
        }
        catch (error) {
            const metadata = this.createMetadata(startTime, data.length, opts);
            return {
                beats: [],
                metadata: {
                    ...metadata,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
    async parseWithBeatCount(audioData, beatCount, options = {}) {
        const beatSelection = {
            strategy: 'adaptive',
            count: beatCount,
            energyWeight: 0.3,
            regularityWeight: 0.3,
            musicalWeight: 0.4
        };
        return this.parse(audioData, { ...options, beatSelection });
    }
    async parseForGenre(audioData, genre, options = {}) {
        const genreOptions = this.getGenreOptimizedOptions(genre);
        const mergedOptions = this.mergeOptions(genreOptions, options);
        return this.parse(audioData, mergedOptions);
    }
    async analyzeBeats(audioData, options = {}) {
        const analysisOptions = {
            ...options,
            beatSelection: { strategy: 'energy', count: 1000 }
        };
        const result = await this.parse(audioData, analysisOptions);
        const beatDensity = result.beats.length > 0 ?
            result.beats.length / (result.beats[result.beats.length - 1].timestamp / 1000) : 0;
        const averageConfidence = result.beats.length > 0 ?
            result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length : 0;
        const tempoStability = result.tempo ?
            TempoTracking.analyzeBeatConsistency(result.beats).consistency : 0;
        return {
            allBeats: result.beats,
            tempo: result.tempo || { bpm: 0, confidence: 0 },
            onsetCount: result.beats.length,
            analysis: {
                beatDensity,
                averageConfidence,
                tempoStability
            }
        };
    }
    preprocessAudio(audioData, options) {
        let processed = audioData;
        if (options.highPassCutoff > 0) {
            processed = AudioProcessor.applyFilter(processed, { type: 'highpass', cutoff: options.highPassCutoff }, options.sampleRate);
        }
        const maxAmplitude = Math.max(...Array.from(processed).map(Math.abs));
        if (maxAmplitude > 0 && maxAmplitude !== 1) {
            processed = processed.map(sample => sample / maxAmplitude);
        }
        return processed;
    }
    getGenreOptimizedOptions(genre) {
        switch (genre) {
            case 'electronic':
                return {
                    onsetDetection: {
                        method: 'energy',
                        threshold: 0.25,
                        minInterval: 0.03
                    },
                    tempoTracking: {
                        minBpm: 100,
                        maxBpm: 180,
                        useDynamicProgramming: true
                    },
                    beatSelection: {
                        strategy: 'regular',
                        count: 16,
                        energyWeight: 0.5,
                        regularityWeight: 0.4,
                        musicalWeight: 0.1
                    }
                };
            case 'rock':
                return {
                    onsetDetection: {
                        method: 'spectral_flux',
                        threshold: 0.35,
                        minInterval: 0.04
                    },
                    tempoTracking: {
                        minBpm: 80,
                        maxBpm: 160,
                        useDynamicProgramming: true
                    },
                    beatSelection: {
                        strategy: 'musical',
                        count: 16,
                        energyWeight: 0.4,
                        regularityWeight: 0.3,
                        musicalWeight: 0.3
                    }
                };
            case 'jazz':
                return {
                    onsetDetection: {
                        method: 'combined',
                        threshold: 0.4,
                        minInterval: 0.06
                    },
                    tempoTracking: {
                        minBpm: 60,
                        maxBpm: 200,
                        useDynamicProgramming: false
                    },
                    beatSelection: {
                        strategy: 'adaptive',
                        count: 12,
                        energyWeight: 0.2,
                        regularityWeight: 0.2,
                        musicalWeight: 0.6
                    }
                };
            case 'classical':
                return {
                    onsetDetection: {
                        method: 'complex_domain',
                        threshold: 0.5,
                        minInterval: 0.08
                    },
                    tempoTracking: {
                        minBpm: 40,
                        maxBpm: 180,
                        windowSize: 15.0,
                        useDynamicProgramming: true
                    },
                    beatSelection: {
                        strategy: 'musical',
                        count: 8,
                        energyWeight: 0.1,
                        regularityWeight: 0.3,
                        musicalWeight: 0.6
                    }
                };
            case 'hip-hop':
                return {
                    onsetDetection: {
                        method: 'energy',
                        threshold: 0.3,
                        minInterval: 0.04
                    },
                    tempoTracking: {
                        minBpm: 70,
                        maxBpm: 140,
                        useDynamicProgramming: true
                    },
                    beatSelection: {
                        strategy: 'regular',
                        count: 16,
                        energyWeight: 0.4,
                        regularityWeight: 0.5,
                        musicalWeight: 0.1
                    },
                    highPassCutoff: 60.0
                };
            default:
                return {};
        }
    }
    mergeOptions(baseOptions, userOptions) {
        return {
            ...baseOptions,
            ...userOptions,
            onsetDetection: {
                ...baseOptions.onsetDetection,
                ...userOptions.onsetDetection
            },
            tempoTracking: {
                ...baseOptions.tempoTracking,
                ...userOptions.tempoTracking
            },
            beatSelection: {
                ...baseOptions.beatSelection,
                ...userOptions.beatSelection
            },
            outputFormat: {
                ...baseOptions.outputFormat,
                ...userOptions.outputFormat
            }
        };
    }
}

class BeatParserWorkerClient {
    constructor(options = {}) {
        Object.defineProperty(this, "worker", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "messageId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "pendingOperations", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.options = {
            workerUrl: options.workerUrl || new URL('./BeatParserWorker.ts', (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.js', document.baseURI).href))).href,
            maxRetries: options.maxRetries ?? 3,
            retryDelay: options.retryDelay ?? 1000,
            timeout: options.timeout ?? 300000,
        };
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            if (typeof Worker === 'undefined') {
                throw new Error('Web Workers are not supported in this environment');
            }
            this.worker = new Worker(this.options.workerUrl, {
                type: 'module'
            });
            this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
            this.worker.addEventListener('error', this.handleWorkerError.bind(this));
            this.worker.addEventListener('messageerror', this.handleWorkerMessageError.bind(this));
            this.isInitialized = true;
        }
        catch (error) {
            throw new Error(`Failed to initialize BeatParser worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async parseBuffer(audioData, options = {}, config = {}) {
        await this.initialize();
        if (!this.worker) {
            throw new Error('Worker not initialized');
        }
        return new Promise((resolve, reject) => {
            const messageId = this.generateMessageId();
            const { progressCallback, ...parseOptions } = options;
            const timeoutId = setTimeout(() => {
                this.cancelOperation(messageId);
                reject(new Error('Worker operation timed out'));
            }, this.options.timeout);
            this.pendingOperations.set(messageId, {
                resolve: resolve,
                reject,
                progressCallback,
                timeoutId
            });
            const message = {
                id: messageId,
                type: 'parse-buffer',
                payload: {
                    audioData: this.transferableFloat32Array(audioData),
                    options: parseOptions,
                    config
                }
            };
            this.worker.postMessage(message, [audioData.buffer]);
        });
    }
    async parseStream(chunks, options = {}, config = {}) {
        await this.initialize();
        if (!this.worker) {
            throw new Error('Worker not initialized');
        }
        return new Promise((resolve, reject) => {
            const messageId = this.generateMessageId();
            const { progressCallback, ...parseOptions } = options;
            const timeoutId = setTimeout(() => {
                this.cancelOperation(messageId);
                reject(new Error('Worker operation timed out'));
            }, this.options.timeout);
            this.pendingOperations.set(messageId, {
                resolve: resolve,
                reject,
                progressCallback,
                timeoutId
            });
            const transferableChunks = chunks.map(chunk => this.transferableFloat32Array(chunk));
            const transferList = chunks.map(chunk => chunk.buffer);
            const message = {
                id: messageId,
                type: 'parse-stream',
                payload: {
                    chunks: transferableChunks,
                    options: parseOptions,
                    config
                }
            };
            this.worker.postMessage(message, transferList);
        });
    }
    async processBatch(audioBuffers, options = [], config = {}) {
        await this.initialize();
        if (!this.worker) {
            throw new Error('Worker not initialized');
        }
        return new Promise((resolve, reject) => {
            const messageId = this.generateMessageId();
            const progressCallback = options[0]?.progressCallback;
            const parseOptions = options.map(opt => {
                if (!opt)
                    return {};
                const { progressCallback: _, ...rest } = opt;
                return rest;
            });
            const batchTimeout = this.options.timeout * Math.max(1, Math.ceil(audioBuffers.length / 5));
            const timeoutId = setTimeout(() => {
                this.cancelOperation(messageId);
                reject(new Error('Batch operation timed out'));
            }, batchTimeout);
            this.pendingOperations.set(messageId, {
                resolve: resolve,
                reject,
                progressCallback,
                timeoutId
            });
            const transferableBuffers = audioBuffers.map(buffer => this.transferableFloat32Array(buffer));
            const transferList = audioBuffers.map(buffer => buffer.buffer);
            const message = {
                id: messageId,
                type: 'batch-process',
                payload: {
                    audioBuffers: transferableBuffers,
                    options: parseOptions,
                    config
                }
            };
            this.worker.postMessage(message, transferList);
        });
    }
    cancelOperation(messageId) {
        if (messageId) {
            const operation = this.pendingOperations.get(messageId);
            if (operation) {
                if (operation.timeoutId) {
                    clearTimeout(operation.timeoutId);
                }
                operation.reject(new Error('Operation cancelled'));
                this.pendingOperations.delete(messageId);
            }
        }
        else {
            for (const [id, operation] of this.pendingOperations) {
                if (operation.timeoutId) {
                    clearTimeout(operation.timeoutId);
                }
                operation.reject(new Error('Operation cancelled'));
            }
            this.pendingOperations.clear();
        }
        if (this.worker) {
            this.worker.postMessage({
                id: messageId || 'all',
                type: 'cancel'
            });
        }
    }
    getPendingOperationCount() {
        return this.pendingOperations.size;
    }
    isBusy() {
        return this.pendingOperations.size > 0;
    }
    async terminate() {
        this.cancelOperation();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isInitialized = false;
    }
    generateMessageId() {
        return `msg_${++this.messageId}_${Date.now()}`;
    }
    transferableFloat32Array(array) {
        const transferable = new Float32Array(array.length);
        transferable.set(array);
        return transferable;
    }
    handleWorkerMessage(event) {
        const { id, type, payload } = event.data;
        const operation = this.pendingOperations.get(id);
        if (!operation) {
            console.warn(`Received message for unknown operation: ${id}`);
            return;
        }
        try {
            switch (type) {
                case 'progress': {
                    const progressData = payload;
                    if (operation.progressCallback) {
                        operation.progressCallback(progressData);
                    }
                    break;
                }
                case 'result': {
                    const result = payload;
                    if (operation.timeoutId) {
                        clearTimeout(operation.timeoutId);
                    }
                    this.pendingOperations.delete(id);
                    operation.resolve(result);
                    break;
                }
                case 'error': {
                    const errorData = payload;
                    if (operation.timeoutId) {
                        clearTimeout(operation.timeoutId);
                    }
                    this.pendingOperations.delete(id);
                    operation.reject(new Error(errorData.message));
                    break;
                }
                default: {
                    console.warn(`Unknown worker message type: ${type}`);
                }
            }
        }
        catch (error) {
            operation.reject(error instanceof Error ? error : new Error('Unknown error handling worker message'));
            this.pendingOperations.delete(id);
        }
    }
    handleWorkerError(event) {
        console.error('Worker error:', event);
        const error = new Error(`Worker error: ${event.message}`);
        for (const [id, operation] of this.pendingOperations) {
            if (operation.timeoutId) {
                clearTimeout(operation.timeoutId);
            }
            operation.reject(error);
        }
        this.pendingOperations.clear();
    }
    handleWorkerMessageError(event) {
        console.error('Worker message error:', event);
        const error = new Error('Worker message error - possible data serialization issue');
        for (const [id, operation] of this.pendingOperations) {
            if (operation.timeoutId) {
                clearTimeout(operation.timeoutId);
            }
            operation.reject(error);
        }
        this.pendingOperations.clear();
    }
}
function createWorkerClient(options) {
    return new BeatParserWorkerClient(options);
}
function isWorkerSupported() {
    return typeof Worker !== 'undefined' && typeof Worker === 'function';
}

exports.AdvancedBeatParser = AdvancedBeatParser;
exports.AudioFormatError = AudioFormatError;
exports.AudioLoadError = AudioLoadError;
exports.AudioProcessingError = AudioProcessingError;
exports.AudioProcessor = AudioProcessor;
exports.AudioUtils = AudioUtils;
exports.BaseParser = BaseParser;
exports.BasicBeatParser = BasicBeatParser;
exports.BeatParser = BeatParser;
exports.BeatParserWorkerClient = BeatParserWorkerClient;
exports.BeatSelector = BeatSelector;
exports.HybridDetector = HybridDetector;
exports.OnsetDetection = OnsetDetection;
exports.OutputFormatter = OutputFormatter;
exports.SignalProcessing = SignalProcessing;
exports.SignalProcessingError = SignalProcessingError;
exports.SpectralFeatures = SpectralFeatures;
exports.TempoTracking = TempoTracking;
exports.createWorkerClient = createWorkerClient;
exports.default = BeatParser;
exports.isWorkerSupported = isWorkerSupported;
exports.validateAudioData = validateAudioData;
exports.validateParseOptions = validateParseOptions;
//# sourceMappingURL=index.js.map
