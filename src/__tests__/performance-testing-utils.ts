/**
 * Performance Testing Infrastructure
 * High-precision timing utilities and performance monitoring tools
 */

import { performance } from 'perf_hooks';

// Performance measurement interfaces
export interface PerformanceMetrics {
  duration: number;
  memoryUsage: MemoryDelta;
  cpuUsage?: CPUMetrics;
  startTime: number;
  endTime: number;
}

export interface MemoryDelta {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface CPUMetrics {
  user: number;
  system: number;
}

export interface StatisticalAnalysis {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  outliers: number[];
  confidenceInterval95: {
    lower: number;
    upper: number;
  };
}

export interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  timeout: number;
  forceGC: boolean;
  collectMemoryStats: boolean;
  collectCPUStats: boolean;
}

export interface LoadTestConfig {
  concurrency: number;
  duration: number;
  rampUpTime: number;
  rampDownTime: number;
  maxOperations?: number;
}

export interface ScalabilityTestResult {
  inputSize: number;
  outputSize: number;
  duration: number;
  memoryUsed: number;
  throughput: number;
  efficiency: number;
}

// High-precision performance utilities
export class PerformanceUtils {
  private static readonly DEFAULT_CONFIG: BenchmarkConfig = {
    iterations: 10,
    warmupIterations: 3,
    timeout: 300000, // 5 minutes
    forceGC: true,
    collectMemoryStats: true,
    collectCPUStats: false
  };

  /**
   * High-precision timing measurement using performance.now()
   */
  static async measureOperation<T>(
    operation: () => Promise<T> | T,
    label: string = 'Operation',
    config: Partial<BenchmarkConfig> = {}
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    // Force garbage collection if available and requested
    if (fullConfig.forceGC && global.gc) {
      global.gc();
      // Wait a bit for GC to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const startMemory = fullConfig.collectMemoryStats ? process.memoryUsage() : null;
    const startCPU = fullConfig.collectCPUStats ? process.cpuUsage() : null;
    const startTime = performance.now();

    let result: T;
    try {
      result = await Promise.resolve(operation());
    } catch (error) {
      throw new Error(`Performance measurement failed for ${label}: ${error}`);
    }

    const endTime = performance.now();
    const endMemory = fullConfig.collectMemoryStats ? process.memoryUsage() : null;
    const endCPU = fullConfig.collectCPUStats ? process.cpuUsage(startCPU || undefined) : null;

    const duration = endTime - startTime;

    const memoryUsage: MemoryDelta = startMemory && endMemory ? {
      rss: endMemory.rss - startMemory.rss,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      external: endMemory.external - startMemory.external,
      arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
    } : {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0
    };

    const cpuUsage: CPUMetrics | undefined = endCPU ? {
      user: endCPU.user / 1000, // Convert to milliseconds
      system: endCPU.system / 1000
    } : undefined;

    const metrics: PerformanceMetrics = {
      duration,
      memoryUsage,
      cpuUsage,
      startTime,
      endTime
    };

    return { result, metrics };
  }

  /**
   * Run multiple iterations and collect statistical analysis
   */
  static async benchmarkOperation<T>(
    operation: () => Promise<T> | T,
    label: string,
    config: Partial<BenchmarkConfig> = {}
  ): Promise<{
    results: T[];
    metrics: PerformanceMetrics[];
    analysis: StatisticalAnalysis;
    aggregatedMetrics: {
      totalDuration: number;
      averageDuration: number;
      totalMemoryUsed: number;
      averageMemoryUsed: number;
      throughput: number;
    };
  }> {
    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
    const results: T[] = [];
    const metrics: PerformanceMetrics[] = [];

    console.log(`🏃 Starting benchmark: ${label} (${fullConfig.iterations} iterations + ${fullConfig.warmupIterations} warmup)`);

    // Warmup iterations (not counted in results)
    for (let i = 0; i < fullConfig.warmupIterations; i++) {
      try {
        await this.measureOperation(operation, `${label} warmup ${i + 1}`, {
          ...fullConfig,
          collectMemoryStats: false,
          collectCPUStats: false
        });
      } catch (error) {
        console.warn(`Warmup iteration ${i + 1} failed:`, error);
      }
    }

    // Force GC after warmup
    if (fullConfig.forceGC && global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Actual benchmark iterations
    for (let i = 0; i < fullConfig.iterations; i++) {
      try {
        const { result, metrics: iterationMetrics } = await this.measureOperation(
          operation,
          `${label} iteration ${i + 1}`,
          fullConfig
        );

        results.push(result);
        metrics.push(iterationMetrics);

        // Progress indicator
        if (i % Math.max(1, Math.floor(fullConfig.iterations / 10)) === 0) {
          const progress = ((i + 1) / fullConfig.iterations * 100).toFixed(1);
          console.log(`   Progress: ${progress}% (${i + 1}/${fullConfig.iterations})`);
        }
      } catch (error) {
        console.error(`Iteration ${i + 1} failed:`, error);
        throw error;
      }
    }

    const durations = metrics.map(m => m.duration);
    const memoryUsages = metrics.map(m => m.memoryUsage.heapUsed);

    const analysis = this.calculateStatistics(durations);
    
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const totalMemoryUsed = Math.max(...memoryUsages.map(m => Math.max(0, m)));
    const averageDuration = analysis.mean;
    const averageMemoryUsed = memoryUsages.reduce((sum, m) => sum + Math.max(0, m), 0) / memoryUsages.length;
    const throughput = fullConfig.iterations / (totalDuration / 1000); // Operations per second

    console.log(`✅ Benchmark completed: ${label}`);
    console.log(`   Average: ${averageDuration.toFixed(2)}ms`);
    console.log(`   Range: ${analysis.min.toFixed(2)}ms - ${analysis.max.toFixed(2)}ms`);
    console.log(`   Throughput: ${throughput.toFixed(2)} ops/sec`);
    if (averageMemoryUsed > 0) {
      console.log(`   Memory: ${(averageMemoryUsed / 1024 / 1024).toFixed(2)}MB avg`);
    }

    return {
      results,
      metrics,
      analysis,
      aggregatedMetrics: {
        totalDuration,
        averageDuration,
        totalMemoryUsed,
        averageMemoryUsed,
        throughput
      }
    };
  }

  /**
   * Calculate comprehensive statistical analysis
   */
  static calculateStatistics(values: number[]): StatisticalAnalysis {
    if (values.length === 0) {
      throw new Error('Cannot calculate statistics for empty array');
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const median = this.calculatePercentile(sorted, 50);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const percentiles = {
      p50: this.calculatePercentile(sorted, 50),
      p90: this.calculatePercentile(sorted, 90),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99)
    };

    // Identify outliers using IQR method
    const q1 = this.calculatePercentile(sorted, 25);
    const q3 = this.calculatePercentile(sorted, 75);
    const iqr = q3 - q1;
    const outlierThreshold = 1.5 * iqr;
    const outliers = values.filter(v => v < q1 - outlierThreshold || v > q3 + outlierThreshold);

    // 95% confidence interval (assuming normal distribution)
    const marginOfError = 1.96 * (stdDev / Math.sqrt(values.length));
    const confidenceInterval95 = {
      lower: mean - marginOfError,
      upper: mean + marginOfError
    };

    return {
      mean,
      median,
      min,
      max,
      stdDev,
      percentiles,
      outliers,
      confidenceInterval95
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private static calculatePercentile(sortedValues: number[], percentile: number): number {
    if (percentile < 0 || percentile > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }
    
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (lower === upper) {
      return sortedValues[lower];
    }
    
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Memory profiling utilities
   */
  static async profileMemoryUsage<T>(
    operation: () => Promise<T> | T,
    label: string = 'Memory Profile',
    intervalMs: number = 100
  ): Promise<{
    result: T;
    snapshots: Array<{
      timestamp: number;
      memory: NodeJS.MemoryUsage;
    }>;
    peakMemory: NodeJS.MemoryUsage;
    memoryDelta: MemoryDelta;
  }> {
    const snapshots: Array<{ timestamp: number; memory: NodeJS.MemoryUsage }> = [];
    let peakMemory: NodeJS.MemoryUsage = process.memoryUsage();
    let isComplete = false;

    // Force initial GC
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const initialMemory = process.memoryUsage();

    // Start memory monitoring
    const monitoringInterval = setInterval(() => {
      if (isComplete) return;
      
      const currentMemory = process.memoryUsage();
      snapshots.push({
        timestamp: performance.now(),
        memory: currentMemory
      });

      // Track peak memory usage
      if (currentMemory.heapUsed > peakMemory.heapUsed) {
        peakMemory = currentMemory;
      }
    }, intervalMs);

    try {
      console.log(`📊 Starting memory profiling: ${label}`);
      const result = await Promise.resolve(operation());
      
      isComplete = true;
      clearInterval(monitoringInterval);

      // Final memory snapshot
      const finalMemory = process.memoryUsage();
      if (finalMemory.heapUsed > peakMemory.heapUsed) {
        peakMemory = finalMemory;
      }

      const memoryDelta: MemoryDelta = {
        rss: finalMemory.rss - initialMemory.rss,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        external: finalMemory.external - initialMemory.external,
        arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers
      };

      console.log(`✅ Memory profiling completed: ${label}`);
      console.log(`   Peak heap: ${(peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Delta heap: ${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Snapshots collected: ${snapshots.length}`);

      return {
        result,
        snapshots,
        peakMemory,
        memoryDelta
      };
    } catch (error) {
      isComplete = true;
      clearInterval(monitoringInterval);
      throw error;
    }
  }

  /**
   * Load testing utilities for concurrent operations
   */
  static async loadTest<T>(
    operationFactory: () => () => Promise<T> | T,
    label: string,
    config: LoadTestConfig
  ): Promise<{
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageLatency: number;
    throughput: number;
    errors: Array<{ timestamp: number; error: Error }>;
    latencies: number[];
  }> {
    console.log(`🚀 Starting load test: ${label}`);
    console.log(`   Concurrency: ${config.concurrency}`);
    console.log(`   Duration: ${config.duration}ms`);
    console.log(`   Ramp-up: ${config.rampUpTime}ms`);

    const results: T[] = [];
    const errors: Array<{ timestamp: number; error: Error }> = [];
    const latencies: number[] = [];
    let totalOperations = 0;
    let activeOperations = 0;
    const startTime = performance.now();
    const endTime = startTime + config.duration;

    // Ramp up gradually
    const rampUpInterval = config.rampUpTime / config.concurrency;
    const workers: Promise<void>[] = [];

    for (let i = 0; i < config.concurrency; i++) {
      // Stagger worker startup
      await new Promise(resolve => setTimeout(resolve, rampUpInterval));

      const worker = this.loadTestWorker(
        operationFactory,
        endTime,
        config.maxOperations,
        (latency, error, result) => {
          totalOperations++;
          if (error) {
            errors.push({ timestamp: performance.now(), error });
          } else {
            results.push(result);
            latencies.push(latency);
          }
        }
      );

      workers.push(worker);
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    const actualDuration = performance.now() - startTime;
    const successfulOperations = results.length;
    const failedOperations = errors.length;
    const averageLatency = latencies.length > 0 ? 
      latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;
    const throughput = (successfulOperations / actualDuration) * 1000; // ops/sec

    console.log(`✅ Load test completed: ${label}`);
    console.log(`   Total operations: ${totalOperations}`);
    console.log(`   Successful: ${successfulOperations}`);
    console.log(`   Failed: ${failedOperations}`);
    console.log(`   Success rate: ${((successfulOperations / totalOperations) * 100).toFixed(2)}%`);
    console.log(`   Average latency: ${averageLatency.toFixed(2)}ms`);
    console.log(`   Throughput: ${throughput.toFixed(2)} ops/sec`);

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageLatency,
      throughput,
      errors,
      latencies
    };
  }

  private static async loadTestWorker<T>(
    operationFactory: () => () => Promise<T> | T,
    endTime: number,
    maxOperations: number | undefined,
    callback: (latency: number, error?: Error, result?: T) => void
  ): Promise<void> {
    let operationCount = 0;

    while (performance.now() < endTime && 
           (maxOperations === undefined || operationCount < maxOperations)) {
      const operation = operationFactory();
      const operationStart = performance.now();

      try {
        const result = await Promise.resolve(operation());
        const latency = performance.now() - operationStart;
        callback(latency, undefined, result);
      } catch (error) {
        const latency = performance.now() - operationStart;
        callback(latency, error instanceof Error ? error : new Error(String(error)));
      }

      operationCount++;
    }
  }

  /**
   * Scalability testing utilities
   */
  static async scalabilityTest<T>(
    operationFactory: (inputSize: number) => () => Promise<T> | T,
    inputSizes: number[],
    label: string,
    expectedComplexity?: 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n²)'
  ): Promise<{
    results: ScalabilityTestResult[];
    scalingFactor: number;
    complexityAnalysis: {
      apparent: string;
      matches: boolean;
      rSquared: number;
    };
  }> {
    console.log(`📈 Starting scalability test: ${label}`);
    console.log(`   Input sizes: ${inputSizes.join(', ')}`);
    if (expectedComplexity) {
      console.log(`   Expected complexity: ${expectedComplexity}`);
    }

    const results: ScalabilityTestResult[] = [];

    for (const inputSize of inputSizes) {
      const operation = operationFactory(inputSize);
      const { result, metrics } = await this.measureOperation(
        operation,
        `${label} (size=${inputSize})`,
        { iterations: 1, warmupIterations: 0 }
      );

      // Try to determine output size if result is array-like or has length
      let outputSize = 0;
      if (result && typeof result === 'object') {
        if (Array.isArray(result)) {
          outputSize = result.length;
        } else if ('length' in result) {
          outputSize = (result as any).length;
        } else if ('size' in result) {
          outputSize = (result as any).size;
        }
      }

      const throughput = inputSize / (metrics.duration / 1000); // units per second
      const efficiency = throughput / inputSize; // throughput per unit input

      results.push({
        inputSize,
        outputSize,
        duration: metrics.duration,
        memoryUsed: Math.max(0, metrics.memoryUsage.heapUsed),
        throughput,
        efficiency
      });

      console.log(`   Size ${inputSize}: ${metrics.duration.toFixed(2)}ms, ${throughput.toFixed(2)} units/sec`);
    }

    // Analyze scaling characteristics
    const scalingFactor = this.calculateScalingFactor(results);
    const complexityAnalysis = this.analyzeComplexity(results, expectedComplexity);

    console.log(`✅ Scalability test completed: ${label}`);
    console.log(`   Scaling factor: ${scalingFactor.toFixed(3)}`);
    console.log(`   Apparent complexity: ${complexityAnalysis.apparent}`);
    if (expectedComplexity) {
      console.log(`   Matches expected: ${complexityAnalysis.matches ? 'YES' : 'NO'}`);
    }

    return {
      results,
      scalingFactor,
      complexityAnalysis
    };
  }

  private static calculateScalingFactor(results: ScalabilityTestResult[]): number {
    if (results.length < 2) return 1;

    const ratios: number[] = [];
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      const inputRatio = curr.inputSize / prev.inputSize;
      const timeRatio = curr.duration / prev.duration;
      ratios.push(timeRatio / inputRatio);
    }

    return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  }

  private static analyzeComplexity(
    results: ScalabilityTestResult[],
    expected?: string
  ): { apparent: string; matches: boolean; rSquared: number } {
    const inputSizes = results.map(r => r.inputSize);
    const durations = results.map(r => r.duration);

    // Test different complexity models
    const models = {
      'O(1)': inputSizes.map(() => 1),
      'O(log n)': inputSizes.map(n => Math.log(n)),
      'O(n)': inputSizes,
      'O(n log n)': inputSizes.map(n => n * Math.log(n)),
      'O(n²)': inputSizes.map(n => n * n)
    };

    let bestModel = 'O(1)';
    let bestR2 = -1;

    for (const [complexity, modelValues] of Object.entries(models)) {
      const r2 = this.calculateRSquared(modelValues, durations);
      if (r2 > bestR2) {
        bestR2 = r2;
        bestModel = complexity;
      }
    }

    return {
      apparent: bestModel,
      matches: expected ? bestModel === expected : false,
      rSquared: bestR2
    };
  }

  private static calculateRSquared(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;

    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;

    for (let i = 0; i < x.length; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denominatorX += dx * dx;
      denominatorY += dy * dy;
    }

    if (denominatorX === 0 || denominatorY === 0) return 0;

    const correlation = numerator / Math.sqrt(denominatorX * denominatorY);
    return correlation * correlation;
  }

  /**
   * Performance regression detection
   */
  static detectRegression(
    baselineMetrics: StatisticalAnalysis,
    currentMetrics: StatisticalAnalysis,
    threshold: number = 0.1 // 10% threshold
  ): {
    hasRegression: boolean;
    regressionPercent: number;
    severity: 'none' | 'minor' | 'moderate' | 'severe';
    recommendation: string;
  } {
    const regressionPercent = (currentMetrics.mean - baselineMetrics.mean) / baselineMetrics.mean;
    const hasRegression = regressionPercent > threshold;

    let severity: 'none' | 'minor' | 'moderate' | 'severe' = 'none';
    let recommendation = 'No performance issues detected.';

    if (hasRegression) {
      if (regressionPercent > 0.5) {
        severity = 'severe';
        recommendation = 'Critical performance regression detected. Immediate investigation required.';
      } else if (regressionPercent > 0.3) {
        severity = 'moderate';
        recommendation = 'Significant performance regression. Review recent changes.';
      } else {
        severity = 'minor';
        recommendation = 'Minor performance regression detected. Monitor for trends.';
      }
    }

    return {
      hasRegression,
      regressionPercent,
      severity,
      recommendation
    };
  }
}

// Audio-specific performance utilities
export class AudioPerformanceUtils {
  /**
   * Generate test audio with specific characteristics for performance testing
   */
  static generateTestAudio(
    duration: number,
    sampleRate: number = 44100,
    complexity: 'minimal' | 'low' | 'medium' | 'high' | 'maximum' = 'medium'
  ): Float32Array {
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);

    switch (complexity) {
      case 'minimal':
        // Pure silence
        break;

      case 'low':
        // Simple sine wave
        for (let i = 0; i < samples; i++) {
          audio[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
        }
        break;

      case 'medium':
        // Multiple frequency components
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          audio[i] = (
            Math.sin(2 * Math.PI * 220 * t) * 0.3 +
            Math.sin(2 * Math.PI * 440 * t) * 0.3 +
            Math.sin(2 * Math.PI * 880 * t) * 0.2
          );
        }
        break;

      case 'high':
        // Complex harmonic content with rhythm
        const bpm = 120;
        const beatInterval = (60 / bpm) * sampleRate;
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          const beatPhase = i % beatInterval;
          const beatStrength = Math.exp(-beatPhase / sampleRate * 10);
          
          audio[i] = (
            Math.sin(2 * Math.PI * 60 * t) * beatStrength * 0.4 +
            Math.sin(2 * Math.PI * 220 * t) * 0.2 +
            Math.sin(2 * Math.PI * 440 * t) * 0.2 +
            Math.sin(2 * Math.PI * 880 * t) * 0.1 +
            (Math.random() - 0.5) * 0.05
          );
        }
        break;

      case 'maximum':
        // Very complex audio with multiple patterns
        const patterns = [60, 120, 240, 480, 960];
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          let sample = 0;
          
          patterns.forEach((freq, index) => {
            const amplitude = 0.2 / (index + 1);
            sample += Math.sin(2 * Math.PI * freq * t) * amplitude;
          });
          
          // Add noise and transients
          if (Math.random() < 0.001) {
            sample += (Math.random() - 0.5) * 0.8;
          }
          
          sample += (Math.random() - 0.5) * 0.02;
          audio[i] = sample;
        }
        break;
    }

    return audio;
  }

  /**
   * Calculate processing efficiency metrics for audio operations
   */
  static calculateAudioEfficiency(
    audioDuration: number,
    processingTime: number,
    memoryUsed: number,
    sampleRate: number = 44100
  ): {
    realTimeRatio: number;
    samplesPerSecond: number;
    bytesPerSample: number;
    efficiency: 'excellent' | 'good' | 'acceptable' | 'poor' | 'unacceptable';
  } {
    const realTimeRatio = processingTime / (audioDuration * 1000);
    const totalSamples = audioDuration * sampleRate;
    const samplesPerSecond = totalSamples / (processingTime / 1000);
    const bytesPerSample = memoryUsed / totalSamples;

    let efficiency: 'excellent' | 'good' | 'acceptable' | 'poor' | 'unacceptable';
    if (realTimeRatio <= 0.1) {
      efficiency = 'excellent';
    } else if (realTimeRatio <= 0.3) {
      efficiency = 'good';
    } else if (realTimeRatio <= 1.0) {
      efficiency = 'acceptable';
    } else if (realTimeRatio <= 3.0) {
      efficiency = 'poor';
    } else {
      efficiency = 'unacceptable';
    }

    return {
      realTimeRatio,
      samplesPerSecond,
      bytesPerSample,
      efficiency
    };
  }
}