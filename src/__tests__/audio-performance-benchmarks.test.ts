/**
 * Audio Performance Benchmarks
 * Measures processing time, memory usage, and throughput for different audio scenarios
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';

interface BenchmarkResult {
  testName: string;
  audioFormat: string;
  duration: number;
  fileSize: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  processingTime: number;
  memoryUsed: number;
  beatsDetected: number;
  avgConfidence: number;
  throughputRatio: number; // processing_time / audio_duration
  memoryEfficiency: number; // memory_used / file_size
  success: boolean;
  errorType?: string;
}

interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

describe('Audio Performance Benchmarks', () => {
  let testFiles: string[] = [];
  const benchmarkResults: BenchmarkResult[] = [];
  
  beforeAll(async () => {
    testFiles = await AudioTestFileGenerator.generateTestFiles();
    
    // Also generate additional performance test files
    await generatePerformanceTestFiles();
    
    console.log('Performance benchmarking started...');
  }, 120000); // 2 minutes for setup

  afterAll(async () => {
    await AudioTestFileGenerator.cleanupTestFiles();
    
    // Generate performance report
    generatePerformanceReport();
  });

  async function generatePerformanceTestFiles(): Promise<void> {
    const testDir = path.join(__dirname, 'test-audio-files');
    
    // Generate files specifically for performance testing
    const performanceTestCases = [
      // Different durations
      { name: 'perf_1s_44khz', duration: 1, sampleRate: 44100 },
      { name: 'perf_5s_44khz', duration: 5, sampleRate: 44100 },
      { name: 'perf_10s_44khz', duration: 10, sampleRate: 44100 },
      { name: 'perf_30s_44khz', duration: 30, sampleRate: 44100 },
      { name: 'perf_60s_44khz', duration: 60, sampleRate: 44100 },
      
      // Different sample rates
      { name: 'perf_5s_8khz', duration: 5, sampleRate: 8000 },
      { name: 'perf_5s_22khz', duration: 5, sampleRate: 22050 },
      { name: 'perf_5s_48khz', duration: 5, sampleRate: 48000 },
      { name: 'perf_5s_96khz', duration: 5, sampleRate: 96000 },
      
      // Complex audio scenarios
      { name: 'perf_silence_10s', duration: 10, sampleRate: 44100, type: 'silence' },
      { name: 'perf_noise_10s', duration: 10, sampleRate: 44100, type: 'noise' },
      { name: 'perf_beats_10s', duration: 10, sampleRate: 44100, type: 'beats' },
    ];

    for (const testCase of performanceTestCases) {
      try {
        let samples: Float32Array;
        
        switch (testCase.type) {
          case 'silence':
            samples = AudioTestFileGenerator.generateSilence({
              sampleRate: testCase.sampleRate,
              channels: 1,
              duration: testCase.duration,
              bitDepth: 16,
              format: 'wav'
            });
            break;
          case 'noise':
            samples = AudioTestFileGenerator.generateWhiteNoise({
              sampleRate: testCase.sampleRate,
              channels: 1,
              duration: testCase.duration,
              bitDepth: 16,
              format: 'wav'
            });
            break;
          case 'beats':
            samples = AudioTestFileGenerator.generateBeatsPattern(120, {
              sampleRate: testCase.sampleRate,
              channels: 1,
              duration: testCase.duration,
              bitDepth: 16,
              format: 'wav'
            });
            break;
          default:
            samples = AudioTestFileGenerator.generateSineWave(440, {
              sampleRate: testCase.sampleRate,
              channels: 1,
              duration: testCase.duration,
              bitDepth: 16,
              format: 'wav'
            });
        }
        
        const wavBuffer = AudioTestFileGenerator.createWavBuffer(samples, {
          sampleRate: testCase.sampleRate,
          channels: 1,
          duration: testCase.duration,
          bitDepth: 16,
          format: 'wav'
        });
        
        const filePath = path.join(testDir, `${testCase.name}.wav`);
        await fs.writeFile(filePath, wavBuffer);
        testFiles.push(filePath);
        
        console.log(`Generated performance test: ${testCase.name}.wav`);
      } catch (error) {
        console.warn(`Failed to generate performance test ${testCase.name}:`, error);
      }
    }
  }

  function getMemorySnapshot(): MemorySnapshot {
    return process.memoryUsage();
  }

  async function benchmarkSingleFile(
    filePath: string, 
    config: BeatParserConfig = {}
  ): Promise<BenchmarkResult> {
    const fileName = path.basename(filePath, '.wav');
    const fileStats = await fs.stat(filePath);
    
    // Extract test parameters from filename
    const sampleRateMatch = fileName.match(/(\d+)khz/) || ['', '44'];
    const durationMatch = fileName.match(/(\d+)s/) || ['', '2'];
    const channelsMatch = fileName.includes('stereo') ? 2 : 1;
    const bitDepthMatch = fileName.match(/(\d+)bit/) || ['', '16'];
    
    const estimatedSampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1]) * 1000 : 44100;
    const estimatedDuration = parseFloat(durationMatch[1]);
    const estimatedChannels = channelsMatch;
    const estimatedBitDepth = parseInt(bitDepthMatch[1]);

    const beatParser = new BeatParser({
      sampleRate: estimatedSampleRate,
      ...config
    });

    try {
      // Force garbage collection if available
      if (global.gc) global.gc();
      
      const startMemory = getMemorySnapshot();
      const startTime = process.hrtime.bigint();
      
      const result = await beatParser.parseFile(filePath);
      
      const endTime = process.hrtime.bigint();
      const endMemory = getMemorySnapshot();
      
      const processingTimeMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      const memoryUsedBytes = endMemory.heapUsed - startMemory.heapUsed;
      
      const avgConfidence = result.beats.length > 0 
        ? result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length
        : 0;
      
      const benchmarkResult: BenchmarkResult = {
        testName: fileName,
        audioFormat: 'wav',
        duration: estimatedDuration,
        fileSize: fileStats.size,
        sampleRate: estimatedSampleRate,
        channels: estimatedChannels,
        bitDepth: estimatedBitDepth,
        processingTime: processingTimeMs,
        memoryUsed: Math.max(0, memoryUsedBytes), // Ensure non-negative
        beatsDetected: result.beats.length,
        avgConfidence,
        throughputRatio: processingTimeMs / (estimatedDuration * 1000),
        memoryEfficiency: Math.max(0, memoryUsedBytes) / fileStats.size,
        success: true
      };
      
      benchmarkResults.push(benchmarkResult);
      return benchmarkResult;
      
    } catch (error) {
      const benchmarkResult: BenchmarkResult = {
        testName: fileName,
        audioFormat: 'wav',
        duration: estimatedDuration,
        fileSize: fileStats.size,
        sampleRate: estimatedSampleRate,
        channels: estimatedChannels,
        bitDepth: estimatedBitDepth,
        processingTime: 0,
        memoryUsed: 0,
        beatsDetected: 0,
        avgConfidence: 0,
        throughputRatio: 0,
        memoryEfficiency: 0,
        success: false,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      };
      
      benchmarkResults.push(benchmarkResult);
      return benchmarkResult;
    } finally {
      await beatParser.cleanup();
    }
  }

  function generatePerformanceReport(): void {
    console.log('\n=== AUDIO INPUT PERFORMANCE BENCHMARK REPORT ===\n');
    
    const successfulResults = benchmarkResults.filter(r => r.success);
    const failedResults = benchmarkResults.filter(r => !r.success);
    
    console.log(`Total Tests: ${benchmarkResults.length}`);
    console.log(`Successful: ${successfulResults.length}`);
    console.log(`Failed: ${failedResults.length}\n`);
    
    if (successfulResults.length > 0) {
      // Processing time statistics
      const processingTimes = successfulResults.map(r => r.processingTime);
      const avgProcessingTime = processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
      const minProcessingTime = Math.min(...processingTimes);
      const maxProcessingTime = Math.max(...processingTimes);
      
      console.log('PROCESSING TIME ANALYSIS:');
      console.log(`Average: ${avgProcessingTime.toFixed(2)}ms`);
      console.log(`Minimum: ${minProcessingTime.toFixed(2)}ms`);
      console.log(`Maximum: ${maxProcessingTime.toFixed(2)}ms\n`);
      
      // Throughput analysis
      const throughputRatios = successfulResults.map(r => r.throughputRatio);
      const avgThroughputRatio = throughputRatios.reduce((sum, t) => sum + t, 0) / throughputRatios.length;
      
      console.log('THROUGHPUT ANALYSIS:');
      console.log(`Average Throughput Ratio: ${avgThroughputRatio.toFixed(3)} (processing_time/audio_duration)`);
      console.log(`Real-time Performance: ${avgThroughputRatio < 1 ? 'YES' : 'NO'} (${avgThroughputRatio < 1 ? 'Faster' : 'Slower'} than real-time)\n`);
      
      // Memory usage analysis
      const memoryUsages = successfulResults.map(r => r.memoryUsed).filter(m => m > 0);
      if (memoryUsages.length > 0) {
        const avgMemoryUsage = memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length;
        const maxMemoryUsage = Math.max(...memoryUsages);
        
        console.log('MEMORY USAGE ANALYSIS:');
        console.log(`Average Memory: ${(avgMemoryUsage / (1024 * 1024)).toFixed(2)}MB`);
        console.log(`Peak Memory: ${(maxMemoryUsage / (1024 * 1024)).toFixed(2)}MB\n`);
      }
      
      // Sample rate performance
      const sampleRateGroups = successfulResults.reduce((groups: Record<number, BenchmarkResult[]>, result) => {
        const rate = result.sampleRate;
        if (!groups[rate]) groups[rate] = [];
        groups[rate].push(result);
        return groups;
      }, {});
      
      console.log('SAMPLE RATE PERFORMANCE:');
      for (const [rate, results] of Object.entries(sampleRateGroups)) {
        const avgTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
        const avgThroughput = results.reduce((sum, r) => sum + r.throughputRatio, 0) / results.length;
        console.log(`${rate}Hz: ${avgTime.toFixed(2)}ms avg, ${avgThroughput.toFixed(3)} throughput ratio`);
      }
      console.log();
      
      // Duration performance
      const durationGroups = successfulResults.reduce((groups: Record<number, BenchmarkResult[]>, result) => {
        const duration = result.duration;
        if (!groups[duration]) groups[duration] = [];
        groups[duration].push(result);
        return groups;
      }, {});
      
      console.log('DURATION PERFORMANCE:');
      for (const [duration, results] of Object.entries(durationGroups)) {
        const avgTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
        const avgThroughput = results.reduce((sum, r) => sum + r.throughputRatio, 0) / results.length;
        console.log(`${duration}s: ${avgTime.toFixed(2)}ms avg, ${avgThroughput.toFixed(3)} throughput ratio`);
      }
      console.log();
    }
    
    if (failedResults.length > 0) {
      console.log('FAILED TESTS:');
      failedResults.forEach(result => {
        console.log(`${result.testName}: ${result.errorType}`);
      });
      console.log();
    }
    
    console.log('=== END PERFORMANCE REPORT ===\n');
  }

  describe('Processing Time Benchmarks', () => {
    test('should process different durations efficiently', async () => {
      const durationFiles = testFiles.filter(f => f.includes('perf_') && f.includes('s_'));
      
      for (const file of durationFiles) {
        const result = await benchmarkSingleFile(file);
        
        expect(result.success).toBe(true);
        expect(result.processingTime).toBeGreaterThan(0);
        
        // Processing should be reasonably fast
        // For a 1-second file, processing should take less than 10 seconds
        const maxExpectedTime = Math.max(10000, result.duration * 5000); // 5x real-time max
        expect(result.processingTime).toBeLessThan(maxExpectedTime);
        
        console.log(`${result.testName}: ${result.processingTime.toFixed(2)}ms (${result.throughputRatio.toFixed(3)}x real-time)`);
      }
    }, 180000); // 3 minutes timeout

    test('should scale reasonably with sample rate', async () => {
      const sampleRateFiles = testFiles.filter(f => f.includes('perf_5s_') && f.includes('khz'));
      
      const results: BenchmarkResult[] = [];
      for (const file of sampleRateFiles) {
        const result = await benchmarkSingleFile(file);
        expect(result.success).toBe(true);
        results.push(result);
      }
      
      // Sort by sample rate
      results.sort((a, b) => a.sampleRate - b.sampleRate);
      
      // Processing time should generally increase with sample rate
      // but not necessarily linearly due to algorithm optimizations
      for (let i = 1; i < results.length; i++) {
        const current = results[i];
        const previous = results[i - 1];
        
        console.log(`${current!.sampleRate}Hz: ${current!.processingTime.toFixed(2)}ms`);
        
        // High sample rates shouldn't be drastically slower
        const timeRatio = current!.processingTime / previous!.processingTime;
        const sampleRateRatio = current!.sampleRate / previous!.sampleRate;
        
        expect(timeRatio).toBeLessThan(sampleRateRatio * 2); // No more than 2x the sample rate ratio
      }
    }, 120000);

    test('should handle different audio content types efficiently', async () => {
      const contentTypeFiles = testFiles.filter(f => 
        f.includes('perf_silence_') || f.includes('perf_noise_') || f.includes('perf_beats_')
      );
      
      const contentResults: Record<string, BenchmarkResult> = {};
      
      for (const file of contentTypeFiles) {
        const result = await benchmarkSingleFile(file);
        expect(result.success).toBe(true);
        
        let contentType = 'unknown';
        if (file.includes('silence')) contentType = 'silence';
        else if (file.includes('noise')) contentType = 'noise';
        else if (file.includes('beats')) contentType = 'beats';
        
        contentResults[contentType] = result;
        
        console.log(`${contentType}: ${result.processingTime.toFixed(2)}ms, ${result.beatsDetected} beats, ${result.avgConfidence.toFixed(3)} avg confidence`);
      }
      
      // Different content types should have reasonable processing times
      Object.values(contentResults).forEach(result => {
        expect(result.processingTime).toBeGreaterThan(0);
        expect(result.processingTime).toBeLessThan(60000); // 1 minute max for 10-second audio
      });
    }, 120000);
  });

  describe('Memory Usage Benchmarks', () => {
    test('should use memory efficiently across different file sizes', async () => {
      const sizeTestFiles = testFiles.filter(f => f.includes('perf_') && f.match(/\d+s_44khz/));
      
      for (const file of sizeTestFiles) {
        const result = await benchmarkSingleFile(file);
        
        expect(result.success).toBe(true);
        
        // Memory usage should be reasonable relative to file size
        const memoryToFileSizeRatio = result.memoryUsed / result.fileSize;
        
        console.log(`${result.testName}: ${(result.memoryUsed / (1024 * 1024)).toFixed(2)}MB, ratio: ${memoryToFileSizeRatio.toFixed(2)}`);
        
        // Memory usage shouldn't be excessively high
        // Reasonable ratio might be 2-10x file size depending on processing
        expect(memoryToFileSizeRatio).toBeLessThan(20);
      }
    }, 180000);

    test('should not leak memory with repeated processing', async () => {
      const testFile = testFiles.find(f => f.includes('perf_5s_44khz'));
      expect(testFile).toBeDefined();

      // Force garbage collection if available
      if (global.gc) global.gc();
      
      const initialMemory = getMemorySnapshot();
      const results: BenchmarkResult[] = [];
      
      // Process the same file multiple times
      for (let i = 0; i < 5; i++) {
        const result = await benchmarkSingleFile(testFile!);
        expect(result.success).toBe(true);
        results.push(result);
        
        // Force garbage collection between iterations
        if (global.gc) global.gc();
      }
      
      const finalMemory = getMemorySnapshot();
      const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory increase over 5 iterations: ${(totalMemoryIncrease / (1024 * 1024)).toFixed(2)}MB`);
      
      // Memory increase should be minimal (less than 50MB for 5 iterations)
      expect(totalMemoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      // Processing times should be consistent (no degradation)
      const processingTimes = results.map(r => r.processingTime);
      const avgTime = processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
      const maxDeviation = Math.max(...processingTimes.map(t => Math.abs(t - avgTime)));
      
      // Max deviation should be less than 50% of average time
      expect(maxDeviation).toBeLessThan(avgTime * 0.5);
    }, 180000);
  });

  describe('Throughput Analysis', () => {
    test('should achieve real-time performance for typical use cases', async () => {
      const typicalFiles = testFiles.filter(f => 
        f.includes('44khz') && (f.includes('1s') || f.includes('5s'))
      );
      
      const realTimeResults: BenchmarkResult[] = [];
      
      for (const file of typicalFiles) {
        const result = await benchmarkSingleFile(file);
        expect(result.success).toBe(true);
        
        realTimeResults.push(result);
        
        const isRealTime = result.throughputRatio < 1.0;
        console.log(`${result.testName}: ${result.throughputRatio.toFixed(3)}x real-time (${isRealTime ? 'REAL-TIME' : 'SLOWER'})`);
      }
      
      // At least 70% of typical files should achieve real-time performance
      const realTimeCount = realTimeResults.filter(r => r.throughputRatio < 1.0).length;
      const realTimePercentage = realTimeCount / realTimeResults.length;
      
      console.log(`Real-time performance: ${realTimeCount}/${realTimeResults.length} (${(realTimePercentage * 100).toFixed(1)}%)`);
      expect(realTimePercentage).toBeGreaterThan(0.7);
    }, 120000);

    test('should handle high sample rates acceptably', async () => {
      const highSampleRateFiles = testFiles.filter(f => f.includes('96khz'));
      
      for (const file of highSampleRateFiles) {
        const result = await benchmarkSingleFile(file);
        expect(result.success).toBe(true);
        
        // High sample rate files might not achieve real-time, but should be reasonable
        // Allow up to 5x real-time for 96kHz
        expect(result.throughputRatio).toBeLessThan(5.0);
        
        console.log(`High sample rate ${result.testName}: ${result.throughputRatio.toFixed(3)}x real-time`);
      }
    }, 120000);
  });

  describe('Configuration Impact Benchmarks', () => {
    test('should measure impact of different frame sizes', async () => {
      const testFile = testFiles.find(f => f.includes('perf_5s_44khz') && !f.includes('silence'));
      expect(testFile).toBeDefined();

      const frameSizes = [512, 1024, 2048, 4096];
      const frameSizeResults: Array<BenchmarkResult & { frameSize: number }> = [];
      
      for (const frameSize of frameSizes) {
        const config: BeatParserConfig = {
          frameSize,
          hopSize: frameSize / 4 // Maintain 4:1 ratio
        };
        
        const result = await benchmarkSingleFile(testFile!, config);
        expect(result.success).toBe(true);
        
        frameSizeResults.push({ ...result, frameSize });
        console.log(`Frame size ${frameSize}: ${result.processingTime.toFixed(2)}ms, ${result.beatsDetected} beats`);
      }
      
      // All frame sizes should work
      frameSizeResults.forEach(result => {
        expect(result.processingTime).toBeGreaterThan(0);
        expect(result.beatsDetected).toBeGreaterThanOrEqual(0);
      });
    }, 120000);

    test('should measure impact of different confidence thresholds', async () => {
      const testFile = testFiles.find(f => f.includes('perf_beats_'));
      expect(testFile).toBeDefined();

      const confidenceThresholds = [0.3, 0.5, 0.7, 0.9];
      const confidenceResults: Array<BenchmarkResult & { confidenceThreshold: number }> = [];
      
      for (const threshold of confidenceThresholds) {
        const config: BeatParserConfig = {
          confidenceThreshold: threshold
        };
        
        const result = await benchmarkSingleFile(testFile!, config);
        expect(result.success).toBe(true);
        
        confidenceResults.push({ ...result, confidenceThreshold: threshold });
        console.log(`Confidence ${threshold}: ${result.beatsDetected} beats, ${result.avgConfidence.toFixed(3)} avg confidence`);
      }
      
      // Higher thresholds should generally result in fewer beats but higher average confidence
      for (let i = 1; i < confidenceResults.length; i++) {
        const current = confidenceResults[i]!;
        const previous = confidenceResults[i - 1]!;
        
        // Beats detected should decrease or stay the same
        expect(current.beatsDetected).toBeLessThanOrEqual(previous.beatsDetected);
        
        // If beats are detected, average confidence should increase
        if (current.beatsDetected > 0 && previous.beatsDetected > 0) {
          expect(current.avgConfidence).toBeGreaterThanOrEqual(previous.avgConfidence);
        }
      }
    }, 120000);
  });
});