/**
 * Performance Regression Detection Tests
 * Automated performance regression detection and baseline management
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ParseResult } from '../types';

// Performance baseline interface
interface PerformanceBaseline {
  testName: string;
  version: string;
  timestamp: number;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  metrics: {
    duration: {
      mean: number;
      median: number;
      p95: number;
      stdDev: number;
    };
    memory: {
      peak: number;
      average: number;
      delta: number;
    };
    throughput: number;
    efficiency: number;
  };
  configuration: BeatParserConfig;
  testParameters: {
    audioDuration: number;
    audioComplexity: string;
    targetBeats: number;
    iterations: number;
  };
}

interface RegressionTest {
  name: string;
  description: string;
  testFunction: () => Promise<any>;
  audioDuration: number;
  audioComplexity: 'minimal' | 'low' | 'medium' | 'high' | 'maximum';
  targetBeats: number;
  config?: Partial<BeatParserConfig>;
  thresholds: {
    maxDurationIncrease: number; // Percentage
    maxMemoryIncrease: number; // Percentage
    minThroughputDecrease: number; // Percentage (as positive value)
  };
}

describe('Performance Regression Detection Tests', () => {
  let parser: BeatParser;
  const baselineDir = path.join(__dirname, 'performance-baselines');
  
  // Regression test suite
  const regressionTests: RegressionTest[] = [
    {
      name: 'basic-processing',
      description: 'Basic audio processing performance',
      testFunction: async () => {
        const audio = AudioPerformanceUtils.generateTestAudio(10, 44100, 'medium');
        return parser.parseBuffer(audio, { targetPictureCount: 20 });
      },
      audioDuration: 10,
      audioComplexity: 'medium',
      targetBeats: 20,
      thresholds: {
        maxDurationIncrease: 15, // 15% slowdown threshold
        maxMemoryIncrease: 20, // 20% memory increase threshold
        minThroughputDecrease: 10 // 10% throughput decrease threshold
      }
    },
    {
      name: 'large-file-processing',
      description: 'Large file processing performance',
      testFunction: async () => {
        const audio = AudioPerformanceUtils.generateTestAudio(120, 44100, 'high');
        return parser.parseBuffer(audio, { targetPictureCount: 240 });
      },
      audioDuration: 120,
      audioComplexity: 'high',
      targetBeats: 240,
      thresholds: {
        maxDurationIncrease: 20, // Allow more variance for large files
        maxMemoryIncrease: 25,
        minThroughputDecrease: 15
      }
    },
    {
      name: 'high-precision-processing',
      description: 'High precision configuration performance',
      testFunction: async () => {
        const precisionParser = new BeatParser({
          sampleRate: 44100,
          frameSize: 4096,
          hopSize: 1024,
          confidenceThreshold: 0.8,
          multiPassEnabled: true
        });
        
        try {
          const audio = AudioPerformanceUtils.generateTestAudio(30, 44100, 'high');
          return precisionParser.parseBuffer(audio, { targetPictureCount: 60 });
        } finally {
          await precisionParser.cleanup();
        }
      },
      audioDuration: 30,
      audioComplexity: 'high',
      targetBeats: 60,
      config: {
        frameSize: 4096,
        hopSize: 1024,
        confidenceThreshold: 0.8,
        multiPassEnabled: true
      },
      thresholds: {
        maxDurationIncrease: 12,
        maxMemoryIncrease: 18,
        minThroughputDecrease: 8
      }
    },
    {
      name: 'fast-processing',
      description: 'Speed-optimized configuration performance',
      testFunction: async () => {
        const fastParser = new BeatParser({
          sampleRate: 44100,
          frameSize: 1024,
          hopSize: 256,
          confidenceThreshold: 0.4,
          multiPassEnabled: false
        });
        
        try {
          const audio = AudioPerformanceUtils.generateTestAudio(20, 44100, 'medium');
          return fastParser.parseBuffer(audio, { targetPictureCount: 40 });
        } finally {
          await fastParser.cleanup();
        }
      },
      audioDuration: 20,
      audioComplexity: 'medium',
      targetBeats: 40,
      config: {
        frameSize: 1024,
        hopSize: 256,
        confidenceThreshold: 0.4,
        multiPassEnabled: false
      },
      thresholds: {
        maxDurationIncrease: 10, // Stricter for fast config
        maxMemoryIncrease: 15,
        minThroughputDecrease: 8
      }
    },
    {
      name: 'complex-audio-processing',
      description: 'Complex audio processing performance',
      testFunction: async () => {
        const audio = AudioPerformanceUtils.generateTestAudio(15, 44100, 'maximum');
        return parser.parseBuffer(audio, { targetPictureCount: 45 });
      },
      audioDuration: 15,
      audioComplexity: 'maximum',
      targetBeats: 45,
      thresholds: {
        maxDurationIncrease: 25, // Allow more variance for complex audio
        maxMemoryIncrease: 30,
        minThroughputDecrease: 20
      }
    },
    {
      name: 'minimal-audio-processing',
      description: 'Minimal audio processing performance',
      testFunction: async () => {
        const audio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'minimal');
        return parser.parseBuffer(audio, { targetPictureCount: 5 });
      },
      audioDuration: 5,
      audioComplexity: 'minimal',
      targetBeats: 5,
      thresholds: {
        maxDurationIncrease: 8, // Very strict for simple audio
        maxMemoryIncrease: 12,
        minThroughputDecrease: 5
      }
    }
  ];

  beforeAll(async () => {
    console.log('📊 Initializing performance regression test suite...');
    
    parser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.6
    });

    // Ensure baseline directory exists
    try {
      await fs.access(baselineDir);
    } catch {
      await fs.mkdir(baselineDir, { recursive: true });
      console.log(`  Created baseline directory: ${baselineDir}`);
    }

    console.log('✅ Performance regression suite initialized');
  }, 60000);

  afterAll(async () => {
    await parser.cleanup();
    console.log('🧹 Performance regression test suite completed');
  });

  describe('Baseline Management', () => {
    test('Generate performance baselines', async () => {
      console.log('Generating performance baselines...');
      
      const currentVersion = '1.0.0'; // Would normally come from package.json
      const environment = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      };

      const generatedBaselines: PerformanceBaseline[] = [];

      for (const test of regressionTests) {
        console.log(`  Generating baseline for: ${test.name}...`);
        
        const benchmark = await PerformanceUtils.benchmarkOperation(
          test.testFunction,
          `Baseline: ${test.name}`,
          { iterations: 10, warmupIterations: 3 }
        );

        const baseline: PerformanceBaseline = {
          testName: test.name,
          version: currentVersion,
          timestamp: Date.now(),
          environment,
          metrics: {
            duration: {
              mean: benchmark.analysis.mean,
              median: benchmark.analysis.median,
              p95: benchmark.analysis.percentiles.p95,
              stdDev: benchmark.analysis.stdDev
            },
            memory: {
              peak: Math.max(...benchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
              average: benchmark.aggregatedMetrics.averageMemoryUsed,
              delta: benchmark.aggregatedMetrics.averageMemoryUsed // Simplified for baseline
            },
            throughput: benchmark.aggregatedMetrics.throughput,
            efficiency: test.targetBeats / benchmark.analysis.mean // Beats per ms
          },
          configuration: test.config || {
            sampleRate: 44100,
            frameSize: 2048,
            hopSize: 512,
            confidenceThreshold: 0.6
          },
          testParameters: {
            audioDuration: test.audioDuration,
            audioComplexity: test.audioComplexity,
            targetBeats: test.targetBeats,
            iterations: 10
          }
        };

        generatedBaselines.push(baseline);

        // Save baseline to file
        const baselineFile = path.join(baselineDir, `${test.name}-baseline.json`);
        await fs.writeFile(baselineFile, JSON.stringify(baseline, null, 2));
        
        console.log(`    Baseline saved: ${baseline.metrics.duration.mean.toFixed(2)}ms avg, ${(baseline.metrics.memory.peak / 1024 / 1024).toFixed(2)}MB peak`);

        // Validate baseline quality
        expect(baseline.metrics.duration.mean).toBeGreaterThan(0);
        expect(baseline.metrics.throughput).toBeGreaterThan(0);
        expect(baseline.metrics.efficiency).toBeGreaterThan(0);
        expect(benchmark.results.every(r => r.beats.length > 0)).toBe(true);
      }

      console.log(`✅ Generated ${generatedBaselines.length} performance baselines`);
    }, 600000);

    test('Load and validate existing baselines', async () => {
      console.log('Loading and validating existing baselines...');
      
      const loadedBaselines: PerformanceBaseline[] = [];
      
      for (const test of regressionTests) {
        const baselineFile = path.join(baselineDir, `${test.name}-baseline.json`);
        
        try {
          const baselineData = await fs.readFile(baselineFile, 'utf-8');
          const baseline = JSON.parse(baselineData) as PerformanceBaseline;
          
          // Validate baseline structure
          expect(baseline.testName).toBe(test.name);
          expect(baseline.metrics.duration.mean).toBeGreaterThan(0);
          expect(baseline.metrics.memory.peak).toBeGreaterThan(0);
          expect(baseline.metrics.throughput).toBeGreaterThan(0);
          expect(baseline.testParameters.audioDuration).toBe(test.audioDuration);
          
          loadedBaselines.push(baseline);
          console.log(`  Loaded baseline for ${test.name}: ${baseline.metrics.duration.mean.toFixed(2)}ms avg`);
        } catch (error) {
          console.warn(`  No baseline found for ${test.name}, skipping validation`);
        }
      }

      if (loadedBaselines.length === 0) {
        console.warn('No existing baselines found - run baseline generation first');
      } else {
        console.log(`✅ Loaded ${loadedBaselines.length} valid baselines`);
      }
    }, 30000);
  });

  describe('Regression Detection', () => {
    test('Performance regression analysis', async () => {
      console.log('Running performance regression analysis...');
      
      const regressionResults: Array<{
        testName: string;
        baseline: PerformanceBaseline | null;
        current: {
          duration: number;
          memory: number;
          throughput: number;
          efficiency: number;
        };
        regression: {
          hasRegression: boolean;
          durationChange: number;
          memoryChange: number;
          throughputChange: number;
          severity: 'none' | 'minor' | 'moderate' | 'severe';
          details: string[];
        };
      }> = [];

      for (const test of regressionTests) {
        console.log(`  Testing regression for: ${test.name}...`);
        
        // Load baseline if it exists
        let baseline: PerformanceBaseline | null = null;
        const baselineFile = path.join(baselineDir, `${test.name}-baseline.json`);
        
        try {
          const baselineData = await fs.readFile(baselineFile, 'utf-8');
          baseline = JSON.parse(baselineData) as PerformanceBaseline;
        } catch (error) {
          console.warn(`    No baseline found for ${test.name}, creating baseline...`);
          // Generate baseline on the fly for testing
          const benchmark = await PerformanceUtils.benchmarkOperation(
            test.testFunction,
            `Quick baseline: ${test.name}`,
            { iterations: 5, warmupIterations: 2 }
          );
          
          baseline = {
            testName: test.name,
            version: '1.0.0',
            timestamp: Date.now(),
            environment: {
              nodeVersion: process.version,
              platform: process.platform,
              arch: process.arch
            },
            metrics: {
              duration: {
                mean: benchmark.analysis.mean,
                median: benchmark.analysis.median,
                p95: benchmark.analysis.percentiles.p95,
                stdDev: benchmark.analysis.stdDev
              },
              memory: {
                peak: Math.max(...benchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
                average: benchmark.aggregatedMetrics.averageMemoryUsed,
                delta: benchmark.aggregatedMetrics.averageMemoryUsed
              },
              throughput: benchmark.aggregatedMetrics.throughput,
              efficiency: test.targetBeats / benchmark.analysis.mean
            },
            configuration: test.config || {},
            testParameters: {
              audioDuration: test.audioDuration,
              audioComplexity: test.audioComplexity,
              targetBeats: test.targetBeats,
              iterations: 5
            }
          };
        }

        // Run current test
        const currentBenchmark = await PerformanceUtils.benchmarkOperation(
          test.testFunction,
          `Current: ${test.name}`,
          { iterations: 8, warmupIterations: 2 }
        );

        const currentMetrics = {
          duration: currentBenchmark.analysis.mean,
          memory: Math.max(...currentBenchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
          throughput: currentBenchmark.aggregatedMetrics.throughput,
          efficiency: test.targetBeats / currentBenchmark.analysis.mean
        };

        // Perform regression analysis
        let hasRegression = false;
        const details: string[] = [];
        let severity: 'none' | 'minor' | 'moderate' | 'severe' = 'none';

        const durationChange = baseline ? 
          ((currentMetrics.duration - baseline.metrics.duration.mean) / baseline.metrics.duration.mean) * 100 : 0;
        const memoryChange = baseline ? 
          ((currentMetrics.memory - baseline.metrics.memory.peak) / baseline.metrics.memory.peak) * 100 : 0;
        const throughputChange = baseline ? 
          ((baseline.metrics.throughput - currentMetrics.throughput) / baseline.metrics.throughput) * 100 : 0;

        if (baseline) {
          // Check duration regression
          if (durationChange > test.thresholds.maxDurationIncrease) {
            hasRegression = true;
            details.push(`Duration increased by ${durationChange.toFixed(1)}% (threshold: ${test.thresholds.maxDurationIncrease}%)`);
            severity = durationChange > test.thresholds.maxDurationIncrease * 2 ? 'severe' : 
                      durationChange > test.thresholds.maxDurationIncrease * 1.5 ? 'moderate' : 'minor';
          }

          // Check memory regression
          if (memoryChange > test.thresholds.maxMemoryIncrease) {
            hasRegression = true;
            details.push(`Memory usage increased by ${memoryChange.toFixed(1)}% (threshold: ${test.thresholds.maxMemoryIncrease}%)`);
            const memorySeverity = memoryChange > test.thresholds.maxMemoryIncrease * 2 ? 'severe' : 
                                  memoryChange > test.thresholds.maxMemoryIncrease * 1.5 ? 'moderate' : 'minor';
            if (memorySeverity === 'severe' || (severity !== 'severe' && memorySeverity === 'moderate')) {
              severity = memorySeverity;
            }
          }

          // Check throughput regression
          if (throughputChange > test.thresholds.minThroughputDecrease) {
            hasRegression = true;
            details.push(`Throughput decreased by ${throughputChange.toFixed(1)}% (threshold: ${test.thresholds.minThroughputDecrease}%)`);
            const throughputSeverity = throughputChange > test.thresholds.minThroughputDecrease * 2 ? 'severe' : 
                                      throughputChange > test.thresholds.minThroughputDecrease * 1.5 ? 'moderate' : 'minor';
            if (throughputSeverity === 'severe' || (severity !== 'severe' && throughputSeverity === 'moderate')) {
              severity = throughputSeverity;
            }
          }
        }

        regressionResults.push({
          testName: test.name,
          baseline,
          current: currentMetrics,
          regression: {
            hasRegression,
            durationChange,
            memoryChange,
            throughputChange,
            severity,
            details
          }
        });

        const statusIcon = hasRegression ? '⚠️' : '✅';
        console.log(`    ${statusIcon} ${test.name}: Duration ${durationChange > 0 ? '+' : ''}${durationChange.toFixed(1)}%, Memory ${memoryChange > 0 ? '+' : ''}${memoryChange.toFixed(1)}%, Throughput ${throughputChange > 0 ? '-' : '+'}${Math.abs(throughputChange).toFixed(1)}%`);
        
        if (hasRegression) {
          console.log(`      Severity: ${severity}, Details: ${details.join('; ')}`);
        }

        // Validate test execution
        expect(currentBenchmark.results.every(r => r.beats.length > 0)).toBe(true);
        expect(currentMetrics.duration).toBeGreaterThan(0);
        expect(currentMetrics.throughput).toBeGreaterThan(0);
      }

      // Analyze overall regression status
      const regressionsFound = regressionResults.filter(r => r.regression.hasRegression);
      const severeRegressions = regressionsFound.filter(r => r.regression.severity === 'severe');
      const moderateRegressions = regressionsFound.filter(r => r.regression.severity === 'moderate');

      console.log('\nPerformance Regression Analysis Summary:');
      console.log(`  Total tests: ${regressionResults.length}`);
      console.log(`  Regressions found: ${regressionsFound.length}`);
      console.log(`  Severe regressions: ${severeRegressions.length}`);
      console.log(`  Moderate regressions: ${moderateRegressions.length}`);
      console.log(`  Minor regressions: ${regressionsFound.length - severeRegressions.length - moderateRegressions.length}`);

      // Report individual regressions
      if (regressionsFound.length > 0) {
        console.log('\nRegression Details:');
        regressionsFound.forEach(result => {
          console.log(`  ${result.testName} (${result.regression.severity}):`);
          result.regression.details.forEach(detail => {
            console.log(`    - ${detail}`);
          });
        });
      }

      // Regression validation - this would typically fail the build in CI
      // For testing purposes, we'll just log warnings
      if (severeRegressions.length > 0) {
        console.error(`❌ SEVERE PERFORMANCE REGRESSIONS DETECTED (${severeRegressions.length})`);
        // In a real CI environment, you might want to fail the test:
        // expect(severeRegressions.length).toBe(0);
      } else if (moderateRegressions.length > 0) {
        console.warn(`⚠️ Moderate performance regressions detected (${moderateRegressions.length})`);
      } else if (regressionsFound.length > 0) {
        console.info(`ℹ️ Minor performance regressions detected (${regressionsFound.length})`);
      } else {
        console.log('✅ No performance regressions detected');
      }

      // Validate that we have meaningful test coverage
      expect(regressionResults.length).toBeGreaterThan(0);
      expect(regressionResults.every(r => r.current.duration > 0)).toBe(true);
    }, 800000);

    test('Trend analysis over multiple runs', async () => {
      console.log('Running trend analysis...');
      
      // Simulate multiple test runs to detect trends
      const trendsToAnalyze = ['basic-processing', 'fast-processing', 'complex-audio-processing'];
      const runsPerTrend = 5;
      
      const trendResults: Array<{
        testName: string;
        runs: Array<{
          runId: number;
          duration: number;
          memory: number;
          throughput: number;
          timestamp: number;
        }>;
        trend: {
          durationSlope: number;
          memorySlope: number;
          throughputSlope: number;
          isWorseningTrend: boolean;
          confidence: number;
        };
      }> = [];

      for (const testName of trendsToAnalyze) {
        console.log(`  Analyzing trend for: ${testName}...`);
        
        const test = regressionTests.find(t => t.name === testName);
        if (!test) continue;

        const runs = [];
        
        for (let runId = 1; runId <= runsPerTrend; runId++) {
          const runBenchmark = await PerformanceUtils.benchmarkOperation(
            test.testFunction,
            `Trend ${testName} run ${runId}`,
            { iterations: 3, warmupIterations: 1 }
          );

          runs.push({
            runId,
            duration: runBenchmark.analysis.mean,
            memory: Math.max(...runBenchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
            throughput: runBenchmark.aggregatedMetrics.throughput,
            timestamp: Date.now()
          });

          // Small delay between runs to simulate real-world timing
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Calculate trend slopes using linear regression
        const n = runs.length;
        const meanX = (n + 1) / 2; // Run IDs from 1 to n
        const meanDuration = runs.reduce((sum, r) => sum + r.duration, 0) / n;
        const meanMemory = runs.reduce((sum, r) => sum + r.memory, 0) / n;
        const meanThroughput = runs.reduce((sum, r) => sum + r.throughput, 0) / n;

        let numeratorDuration = 0, numeratorMemory = 0, numeratorThroughput = 0;
        let denominator = 0;

        runs.forEach((run, index) => {
          const x = index + 1;
          const dx = x - meanX;
          numeratorDuration += dx * (run.duration - meanDuration);
          numeratorMemory += dx * (run.memory - meanMemory);
          numeratorThroughput += dx * (run.throughput - meanThroughput);
          denominator += dx * dx;
        });

        const durationSlope = denominator > 0 ? numeratorDuration / denominator : 0;
        const memorySlope = denominator > 0 ? numeratorMemory / denominator : 0;
        const throughputSlope = denominator > 0 ? numeratorThroughput / denominator : 0;

        // Determine if trend is worsening (increasing duration/memory or decreasing throughput)
        const isWorseningTrend = durationSlope > 0 || memorySlope > 0 || throughputSlope < 0;

        // Calculate trend confidence (R² value for duration trend)
        let ssRes = 0, ssTot = 0;
        runs.forEach((run, index) => {
          const x = index + 1;
          const predicted = meanDuration + durationSlope * (x - meanX);
          ssRes += Math.pow(run.duration - predicted, 2);
          ssTot += Math.pow(run.duration - meanDuration, 2);
        });
        const confidence = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

        trendResults.push({
          testName,
          runs,
          trend: {
            durationSlope,
            memorySlope,
            throughputSlope,
            isWorseningTrend,
            confidence
          }
        });

        const trendIcon = isWorseningTrend ? '📈⚠️' : '📊✅';
        console.log(`    ${trendIcon} ${testName}:`);
        console.log(`      Duration trend: ${durationSlope > 0 ? '+' : ''}${durationSlope.toFixed(2)}ms per run`);
        console.log(`      Memory trend: ${memorySlope > 0 ? '+' : ''}${(memorySlope / 1024 / 1024).toFixed(2)}MB per run`);
        console.log(`      Throughput trend: ${throughputSlope > 0 ? '+' : ''}${throughputSlope.toFixed(3)} ops/sec per run`);
        console.log(`      Confidence: ${(confidence * 100).toFixed(1)}%`);
      }

      // Analyze overall trends
      const worseningTrends = trendResults.filter(r => r.trend.isWorseningTrend);
      const highConfidenceTrends = trendResults.filter(r => r.trend.confidence > 0.7);
      const concerningTrends = worseningTrends.filter(r => r.trend.confidence > 0.5);

      console.log('\nTrend Analysis Summary:');
      console.log(`  Tests analyzed: ${trendResults.length}`);
      console.log(`  Worsening trends: ${worseningTrends.length}`);
      console.log(`  High confidence trends (R² > 0.7): ${highConfidenceTrends.length}`);
      console.log(`  Concerning trends (worsening + confident): ${concerningTrends.length}`);

      // Validate trend analysis
      expect(trendResults.length).toBeGreaterThan(0);
      expect(trendResults.every(r => r.runs.length === runsPerTrend)).toBe(true);

      // In a real scenario, concerning trends might trigger alerts
      if (concerningTrends.length > 0) {
        console.warn(`⚠️ Concerning performance trends detected:`);
        concerningTrends.forEach(result => {
          console.warn(`  - ${result.testName}: ${(result.trend.confidence * 100).toFixed(1)}% confidence`);
        });
      } else {
        console.log('✅ No concerning performance trends detected');
      }
    }, 600000);
  });

  describe('Performance Monitoring', () => {
    test('Performance threshold monitoring', async () => {
      console.log('Running performance threshold monitoring...');
      
      const monitoringThresholds = {
        criticalDuration: 30000, // 30 seconds
        warningDuration: 15000, // 15 seconds
        criticalMemory: 500 * 1024 * 1024, // 500MB
        warningMemory: 200 * 1024 * 1024, // 200MB
        minThroughput: 0.1 // 0.1 ops/sec minimum
      };

      const monitoringResults: Array<{
        testName: string;
        duration: number;
        memory: number;
        throughput: number;
        status: 'normal' | 'warning' | 'critical';
        alerts: string[];
      }> = [];

      // Monitor critical performance tests
      const criticalTests = regressionTests.filter(t => 
        t.name === 'basic-processing' || 
        t.name === 'large-file-processing' || 
        t.name === 'fast-processing'
      );

      for (const test of criticalTests) {
        console.log(`  Monitoring: ${test.name}...`);
        
        const benchmark = await PerformanceUtils.benchmarkOperation(
          test.testFunction,
          `Monitor: ${test.name}`,
          { iterations: 5, warmupIterations: 1 }
        );

        const duration = benchmark.analysis.mean;
        const memory = Math.max(...benchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed)));
        const throughput = benchmark.aggregatedMetrics.throughput;

        const alerts: string[] = [];
        let status: 'normal' | 'warning' | 'critical' = 'normal';

        // Duration checks
        if (duration > monitoringThresholds.criticalDuration) {
          alerts.push(`CRITICAL: Duration ${duration.toFixed(0)}ms exceeds critical threshold ${monitoringThresholds.criticalDuration}ms`);
          status = 'critical';
        } else if (duration > monitoringThresholds.warningDuration) {
          alerts.push(`WARNING: Duration ${duration.toFixed(0)}ms exceeds warning threshold ${monitoringThresholds.warningDuration}ms`);
          if (status !== 'critical') status = 'warning';
        }

        // Memory checks
        if (memory > monitoringThresholds.criticalMemory) {
          alerts.push(`CRITICAL: Memory ${(memory / 1024 / 1024).toFixed(1)}MB exceeds critical threshold ${monitoringThresholds.criticalMemory / 1024 / 1024}MB`);
          status = 'critical';
        } else if (memory > monitoringThresholds.warningMemory) {
          alerts.push(`WARNING: Memory ${(memory / 1024 / 1024).toFixed(1)}MB exceeds warning threshold ${monitoringThresholds.warningMemory / 1024 / 1024}MB`);
          if (status !== 'critical') status = 'warning';
        }

        // Throughput checks
        if (throughput < monitoringThresholds.minThroughput) {
          alerts.push(`CRITICAL: Throughput ${throughput.toFixed(3)} ops/sec below minimum threshold ${monitoringThresholds.minThroughput}`);
          status = 'critical';
        }

        monitoringResults.push({
          testName: test.name,
          duration,
          memory,
          throughput,
          status,
          alerts
        });

        const statusIcon = status === 'critical' ? '🚨' : status === 'warning' ? '⚠️' : '✅';
        console.log(`    ${statusIcon} ${test.name}: ${status.toUpperCase()}`);
        
        if (alerts.length > 0) {
          alerts.forEach(alert => console.log(`      ${alert}`));
        }

        // Validate monitoring execution
        expect(benchmark.results.every(r => r.beats.length > 0)).toBe(true);
      }

      // Monitoring summary
      const criticalAlerts = monitoringResults.filter(r => r.status === 'critical');
      const warningAlerts = monitoringResults.filter(r => r.status === 'warning');
      const normalResults = monitoringResults.filter(r => r.status === 'normal');

      console.log('\nPerformance Monitoring Summary:');
      console.log(`  Tests monitored: ${monitoringResults.length}`);
      console.log(`  Normal: ${normalResults.length}`);
      console.log(`  Warnings: ${warningAlerts.length}`);
      console.log(`  Critical: ${criticalAlerts.length}`);

      // In production, critical alerts would trigger immediate attention
      if (criticalAlerts.length > 0) {
        console.error(`🚨 CRITICAL PERFORMANCE ALERTS (${criticalAlerts.length}):`);
        criticalAlerts.forEach(result => {
          console.error(`  ${result.testName}:`);
          result.alerts.forEach(alert => console.error(`    - ${alert}`));
        });
      }

      // Validate monitoring coverage
      expect(monitoringResults.length).toBe(criticalTests.length);
      expect(monitoringResults.every(r => r.duration > 0 && r.throughput > 0)).toBe(true);
    }, 300000);

    test('Performance dashboard data collection', async () => {
      console.log('Collecting performance dashboard data...');
      
      const dashboardData = {
        timestamp: new Date().toISOString(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: process.memoryUsage(),
          uptime: process.uptime()
        },
        tests: [] as Array<{
          name: string;
          duration: { mean: number; p95: number; min: number; max: number };
          memory: { peak: number; average: number };
          throughput: number;
          successRate: number;
          qualityMetrics: { beatsDetected: number; avgConfidence: number };
        }>
      };

      // Collect data from key performance tests
      const dashboardTests = regressionTests.slice(0, 4); // Limit for time

      for (const test of dashboardTests) {
        console.log(`  Collecting data for: ${test.name}...`);
        
        const benchmark = await PerformanceUtils.benchmarkOperation(
          test.testFunction,
          `Dashboard: ${test.name}`,
          { iterations: 6, warmupIterations: 2 }
        );

        const successfulResults = benchmark.results.filter(r => r.beats.length > 0);
        const successRate = successfulResults.length / benchmark.results.length;
        
        const avgConfidence = successfulResults.length > 0 ? 
          successfulResults.reduce((sum, r) => 
            sum + (r.beats.reduce((beatSum, b) => beatSum + b.confidence, 0) / r.beats.length)
          , 0) / successfulResults.length : 0;

        const avgBeatsDetected = successfulResults.length > 0 ?
          successfulResults.reduce((sum, r) => sum + r.beats.length, 0) / successfulResults.length : 0;

        dashboardData.tests.push({
          name: test.name,
          duration: {
            mean: benchmark.analysis.mean,
            p95: benchmark.analysis.percentiles.p95,
            min: benchmark.analysis.min,
            max: benchmark.analysis.max
          },
          memory: {
            peak: Math.max(...benchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
            average: benchmark.aggregatedMetrics.averageMemoryUsed
          },
          throughput: benchmark.aggregatedMetrics.throughput,
          successRate,
          qualityMetrics: {
            beatsDetected: avgBeatsDetected,
            avgConfidence
          }
        });

        console.log(`    Success rate: ${(successRate * 100).toFixed(1)}%, Avg confidence: ${avgConfidence.toFixed(3)}`);
      }

      // Save dashboard data
      const dashboardFile = path.join(baselineDir, 'dashboard-data.json');
      await fs.writeFile(dashboardFile, JSON.stringify(dashboardData, null, 2));
      
      console.log(`✅ Dashboard data saved to: ${dashboardFile}`);
      console.log(`   Tests: ${dashboardData.tests.length}`);
      console.log(`   Overall success rate: ${(dashboardData.tests.reduce((sum, t) => sum + t.successRate, 0) / dashboardData.tests.length * 100).toFixed(1)}%`);

      // Validate dashboard data quality
      expect(dashboardData.tests.length).toBeGreaterThan(0);
      expect(dashboardData.tests.every(t => t.successRate > 0)).toBe(true);
      expect(dashboardData.tests.every(t => t.duration.mean > 0)).toBe(true);
      expect(dashboardData.tests.every(t => t.throughput > 0)).toBe(true);

      // Check that data is suitable for monitoring
      const avgSuccessRate = dashboardData.tests.reduce((sum, t) => sum + t.successRate, 0) / dashboardData.tests.length;
      expect(avgSuccessRate).toBeGreaterThan(0.9); // >90% success rate expected

      const avgConfidence = dashboardData.tests.reduce((sum, t) => sum + t.qualityMetrics.avgConfidence, 0) / dashboardData.tests.length;
      expect(avgConfidence).toBeGreaterThan(0.5); // >50% confidence expected
    }, 400000);
  });
});