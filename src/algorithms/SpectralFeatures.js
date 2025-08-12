"use strict";
/**
 * Spectral feature extraction for audio analysis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpectralFeatures = void 0;
var fft_js_1 = require("fft.js");
var SpectralFeatures = /** @class */ (function () {
    function SpectralFeatures() {
    }
    /**
     * Extract spectral features from audio data
     */
    SpectralFeatures.extractFeatures = function (audioData, sampleRate) {
        if (sampleRate === void 0) { sampleRate = 44100; }
        // Calculate FFT once and reuse it for multiple features
        var fft = SpectralFeatures.calculateFFT(audioData);
        var magnitude = fft.map(function (complex) { return Math.sqrt(complex.real * complex.real + complex.imag * complex.imag); });
        var features = {
            spectralCentroid: SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate),
            spectralRolloff: SpectralFeatures.calculateSpectralRolloffFromMagnitude(magnitude, sampleRate),
            spectralBandwidth: SpectralFeatures.calculateSpectralBandwidthFromMagnitude(magnitude, sampleRate),
            zeroCrossingRate: SpectralFeatures.calculateZeroCrossingRate(audioData),
            rmsEnergy: SpectralFeatures.calculateRmsEnergy(audioData),
            mfcc: SpectralFeatures.calculateMfccFromMagnitude(magnitude, sampleRate)
        };
        return features;
    };
    /**
     * Calculate spectral centroid (brightness measure)
     */
    SpectralFeatures.calculateSpectralCentroid = function (audioData, sampleRate) {
        var fft = SpectralFeatures.calculateFFT(audioData);
        var magnitude = fft.map(function (complex) { return Math.sqrt(complex.real * complex.real + complex.imag * complex.imag); });
        return SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate);
    };
    /**
     * Calculate spectral centroid from pre-computed magnitude spectrum
     */
    SpectralFeatures.calculateSpectralCentroidFromMagnitude = function (magnitude, sampleRate) {
        var weightedSum = 0;
        var magnitudeSum = 0;
        for (var i = 0; i < magnitude.length / 2; i++) {
            var frequency = (i * sampleRate) / magnitude.length;
            weightedSum += frequency * magnitude[i];
            magnitudeSum += magnitude[i];
        }
        return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    };
    /**
     * Calculate spectral rolloff (frequency below which 85% of energy lies)
     */
    SpectralFeatures.calculateSpectralRolloff = function (audioData, sampleRate) {
        var fft = SpectralFeatures.calculateFFT(audioData);
        var magnitude = fft.map(function (complex) { return Math.sqrt(complex.real * complex.real + complex.imag * complex.imag); });
        return SpectralFeatures.calculateSpectralRolloffFromMagnitude(magnitude, sampleRate);
    };
    /**
     * Calculate spectral rolloff from pre-computed magnitude spectrum
     */
    SpectralFeatures.calculateSpectralRolloffFromMagnitude = function (magnitude, sampleRate) {
        var totalEnergy = magnitude.reduce(function (sum, mag) { return sum + mag * mag; }, 0);
        var threshold = totalEnergy * 0.85;
        var runningEnergy = 0;
        for (var i = 0; i < magnitude.length / 2; i++) {
            runningEnergy += magnitude[i] * magnitude[i];
            if (runningEnergy >= threshold) {
                return (i * sampleRate) / magnitude.length;
            }
        }
        return sampleRate / 2; // Nyquist frequency if threshold not reached
    };
    /**
     * Calculate spectral bandwidth
     */
    SpectralFeatures.calculateSpectralBandwidth = function (audioData, sampleRate) {
        var fft = SpectralFeatures.calculateFFT(audioData);
        var magnitude = fft.map(function (complex) { return Math.sqrt(complex.real * complex.real + complex.imag * complex.imag); });
        return SpectralFeatures.calculateSpectralBandwidthFromMagnitude(magnitude, sampleRate);
    };
    /**
     * Calculate spectral bandwidth from pre-computed magnitude spectrum
     */
    SpectralFeatures.calculateSpectralBandwidthFromMagnitude = function (magnitude, sampleRate) {
        var centroid = SpectralFeatures.calculateSpectralCentroidFromMagnitude(magnitude, sampleRate);
        var weightedVariance = 0;
        var magnitudeSum = 0;
        for (var i = 0; i < magnitude.length / 2; i++) {
            var frequency = (i * sampleRate) / magnitude.length;
            var deviation = frequency - centroid;
            weightedVariance += deviation * deviation * magnitude[i];
            magnitudeSum += magnitude[i];
        }
        return magnitudeSum > 0 ? Math.sqrt(weightedVariance / magnitudeSum) : 0;
    };
    /**
     * Calculate zero crossing rate
     */
    SpectralFeatures.calculateZeroCrossingRate = function (audioData) {
        var crossings = 0;
        for (var i = 1; i < audioData.length; i++) {
            if ((audioData[i - 1] >= 0 && audioData[i] < 0) ||
                (audioData[i - 1] < 0 && audioData[i] >= 0)) {
                crossings++;
            }
        }
        return crossings / audioData.length;
    };
    /**
     * Calculate RMS energy
     */
    SpectralFeatures.calculateRmsEnergy = function (audioData) {
        var sumSquares = audioData.reduce(function (sum, sample) { return sum + sample * sample; }, 0);
        return Math.sqrt(sumSquares / audioData.length);
    };
    /**
     * Calculate MFCC coefficients (simplified version)
     */
    SpectralFeatures.calculateMfcc = function (audioData, sampleRate) {
        var fft = SpectralFeatures.calculateFFT(audioData);
        var magnitude = fft.map(function (complex) { return Math.sqrt(complex.real * complex.real + complex.imag * complex.imag); });
        return SpectralFeatures.calculateMfccFromMagnitude(magnitude, sampleRate);
    };
    /**
     * Calculate MFCC coefficients from pre-computed magnitude spectrum
     */
    SpectralFeatures.calculateMfccFromMagnitude = function (magnitude, sampleRate) {
        // Simplified MFCC calculation - in production would use proper mel-scale filtering
        var numCoefficients = 13;
        var mfcc = [];
        // Simplified approach: divide spectrum into bands and calculate log energy
        var bandsPerCoeff = Math.floor(magnitude.length / 2 / numCoefficients);
        for (var i = 0; i < numCoefficients; i++) {
            var startBin = i * bandsPerCoeff;
            var endBin = Math.min((i + 1) * bandsPerCoeff, magnitude.length / 2);
            var bandEnergy = 0;
            for (var j = startBin; j < endBin; j++) {
                bandEnergy += magnitude[j] * magnitude[j];
            }
            mfcc.push(bandEnergy > 0 ? Math.log(bandEnergy) : -Infinity);
        }
        return mfcc;
    };
    /**
     * Fast FFT implementation using fft.js library
     */
    SpectralFeatures.calculateFFT = function (audioData) {
        var N = audioData.length;
        // Zero-pad to next power of 2 if needed
        var paddedLength = Math.pow(2, Math.ceil(Math.log2(N)));
        var paddedData = new Float32Array(paddedLength);
        paddedData.set(audioData);
        // Create FFT instance
        var fft = new fft_js_1.default(paddedLength);
        // Convert to format expected by fft.js (interleaved real/imaginary)
        var input = new Array(paddedLength * 2);
        for (var i = 0; i < paddedLength; i++) {
            input[i * 2] = paddedData[i]; // real part
            input[i * 2 + 1] = 0; // imaginary part (0 for real input)
        }
        // Perform FFT
        var output = new Array(paddedLength * 2);
        fft.transform(output, input);
        // Convert back to our format
        var result = [];
        for (var i = 0; i < paddedLength; i++) {
            result.push({
                real: output[i * 2],
                imag: output[i * 2 + 1]
            });
        }
        return result;
    };
    /**
     * Extract frame-wise features for time-series analysis
     * This method processes audio in small frames to avoid performance issues with large audio files
     */
    SpectralFeatures.extractFrameFeatures = function (audioData, frameSize, hopSize, sampleRate) {
        if (frameSize === void 0) { frameSize = 2048; }
        if (hopSize === void 0) { hopSize = 512; }
        if (sampleRate === void 0) { sampleRate = 44100; }
        var features = [];
        // Ensure frameSize is a power of 2 for optimal FFT performance
        var optimalFrameSize = Math.pow(2, Math.ceil(Math.log2(frameSize)));
        console.log("Processing ".concat(audioData.length, " samples in frames of ").concat(optimalFrameSize, " (hop size: ").concat(hopSize, ")"));
        var processedFrames = 0;
        var totalFrames = Math.floor((audioData.length - optimalFrameSize) / hopSize) + 1;
        for (var i = 0; i <= audioData.length - optimalFrameSize; i += hopSize) {
            var frame = audioData.slice(i, i + optimalFrameSize);
            var frameFeatures = SpectralFeatures.extractFeatures(frame, sampleRate);
            features.push(frameFeatures);
            processedFrames++;
            if (processedFrames % 100 === 0) {
                console.log("Processed ".concat(processedFrames, "/").concat(totalFrames, " frames (").concat(Math.round(processedFrames / totalFrames * 100), "%)"));
            }
        }
        console.log("Completed processing ".concat(processedFrames, " frames"));
        return features;
    };
    /**
     * Calculate chroma features (simplified)
     */
    SpectralFeatures.calculateChroma = function (audioData, sampleRate) {
        if (sampleRate === void 0) { sampleRate = 44100; }
        // For large audio data, process in frames and average the result
        if (audioData.length > 8192) {
            return SpectralFeatures.calculateChromaFromFrames(audioData, sampleRate);
        }
        var fft = SpectralFeatures.calculateFFT(audioData);
        var magnitude = fft.map(function (complex) { return Math.sqrt(complex.real * complex.real + complex.imag * complex.imag); });
        return SpectralFeatures.calculateChromaFromMagnitude(magnitude, sampleRate);
    };
    /**
     * Calculate chroma features from frames for large audio data
     */
    SpectralFeatures.calculateChromaFromFrames = function (audioData, sampleRate) {
        var frameSize = 4096;
        var hopSize = 2048;
        var chromaBins = 12;
        var avgChroma = new Array(chromaBins).fill(0);
        var numFrames = 0;
        for (var i = 0; i <= audioData.length - frameSize; i += hopSize) {
            var frame = audioData.slice(i, i + frameSize);
            var fft = SpectralFeatures.calculateFFT(frame);
            var magnitude = fft.map(function (complex) { return Math.sqrt(complex.real * complex.real + complex.imag * complex.imag); });
            var frameChroma = SpectralFeatures.calculateChromaFromMagnitude(magnitude, sampleRate);
            for (var j = 0; j < chromaBins; j++) {
                avgChroma[j] += frameChroma[j];
            }
            numFrames++;
        }
        // Average across frames
        return numFrames > 0 ? avgChroma.map(function (val) { return val / numFrames; }) : avgChroma;
    };
    /**
     * Calculate chroma features from pre-computed magnitude spectrum
     */
    SpectralFeatures.calculateChromaFromMagnitude = function (magnitude, sampleRate) {
        var chromaBins = 12; // 12 semitones in an octave
        var chroma = new Array(chromaBins).fill(0);
        for (var i = 1; i < magnitude.length / 2; i++) {
            var frequency = (i * sampleRate) / magnitude.length;
            if (frequency > 0) {
                // Convert frequency to MIDI note number, then to chroma bin
                var midiNote = 12 * Math.log2(frequency / 440) + 69;
                var chromaBin = Math.round(midiNote) % 12;
                if (chromaBin >= 0 && chromaBin < 12) {
                    chroma[chromaBin] += magnitude[i];
                }
            }
        }
        // Normalize
        var sum = chroma.reduce(function (a, b) { return a + b; }, 0);
        return sum > 0 ? chroma.map(function (val) { return val / sum; }) : chroma;
    };
    return SpectralFeatures;
}());
exports.SpectralFeatures = SpectralFeatures;
