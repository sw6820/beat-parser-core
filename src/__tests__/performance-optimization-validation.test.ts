/**
 * Performance Optimization Validation Tests
 * Validation of optimization impact and effectiveness measurement
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { WorkerClient } from '../worker/WorkerClient';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';
import type { ParseResult } from '../types';

// Optimization scenario interface
interface OptimizationScenario {
  name: string;
  description: string;
  baselineConfig: BeatParserConfig;
  optimizedConfig: BeatParserConfig;
  testAudio: {
    duration: number;
    complexity: 'minimal' | 'low' | 'medium' | 'high' | 'maximum';
    targetBeats: number;
  };
  expectedImprovements: {
    minSpeedupRatio: number; // Expected minimum speedup (optimized/baseline)
    maxMemoryIncrease: number; // Maximum allowed memory increase (%)
    minQualityRetention: number; // Minimum quality retention (%)
  };
  validationCriteria: {
    functionalEquivalence: boolean; // Should produce equivalent results
    accuracyTolerance: number; // Allowed accuracy difference (%)
    performanceGains: boolean; // Must show performance improvement
  };
}

describe('Performance Optimization Validation Tests', () => {
  let baseParser: BeatParser;
  let workerClient: WorkerClient;

  // Optimization scenarios to test
  const optimizationScenarios: OptimizationScenario[] = [
    {
      name: 'frame-size-optimization',
      description: 'Optimized frame size for better FFT performance',
      baselineConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512,
        confidenceThreshold: 0.6,
        multiPassEnabled: false
      },
      optimizedConfig: {
        sampleRate: 44100,
        frameSize: 4096, // Larger frame size for FFT efficiency
        hopSize: 1024,
        confidenceThreshold: 0.6,
        multiPassEnabled: false
      },
      testAudio: {
        duration: 20,
        complexity: 'medium',
        targetBeats: 40
      },
      expectedImprovements: {
        minSpeedupRatio: 1.1, // At least 10% faster
        maxMemoryIncrease: 50, // Allow 50% memory increase for larger frames
        minQualityRetention: 90 // Retain 90% of detection quality
      },
      validationCriteria: {
        functionalEquivalence: true,
        accuracyTolerance: 10,
        performanceGains: true
      }
    },
    {
      name: 'confidence-threshold-optimization',
      description: 'Optimized confidence threshold for speed vs accuracy balance',
      baselineConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512,
        confidenceThreshold: 0.8, // High threshold (slower, more accurate)
        multiPassEnabled: true
      },
      optimizedConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512,
        confidenceThreshold: 0.5, // Lower threshold (faster, potentially less accurate)
        multiPassEnabled: false
      },
      testAudio: {
        duration: 15,
        complexity: 'high',
        targetBeats: 30
      },
      expectedImprovements: {
        minSpeedupRatio: 1.3, // At least 30% faster
        maxMemoryIncrease: 10, // Should use similar memory
        minQualityRetention: 80 // May sacrifice some quality for speed
      },
      validationCriteria: {
        functionalEquivalence: false,
        accuracyTolerance: 20,
        performanceGains: true
      }
    },
    {
      name: 'multi-pass-optimization',
      description: 'Single pass vs multi-pass processing comparison',
      baselineConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512,
        confidenceThreshold: 0.6,
        multiPassEnabled: true // Multi-pass for accuracy
      },
      optimizedConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512,
        confidenceThreshold: 0.7, // Slightly higher threshold to compensate
        multiPassEnabled: false // Single pass for speed
      },
      testAudio: {
        duration: 25,
        complexity: 'medium',
        targetBeats: 50
      },
      expectedImprovements: {
        minSpeedupRatio: 1.5, // At least 50% faster
        maxMemoryIncrease: -10, // Should use less memory
        minQualityRetention: 85 // Good quality retention with optimized threshold
      },
      validationCriteria: {
        functionalEquivalence: false,
        accuracyTolerance: 15,
        performanceGains: true
      }
    },
    {
      name: 'hop-size-optimization',
      description: 'Optimized hop size for processing efficiency',
      baselineConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 256, // Small hop size (more detailed, slower)
        confidenceThreshold: 0.6,
        multiPassEnabled: false
      },
      optimizedConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512, // Larger hop size (faster processing)
        confidenceThreshold: 0.6,
        multiPassEnabled: false
      },
      testAudio: {
        duration: 12,
        complexity: 'medium',
        targetBeats: 24
      },
      expectedImprovements: {
        minSpeedupRatio: 1.4, // At least 40% faster
        maxMemoryIncrease: -20, // Should use less memory
        minQualityRetention: 88 // Good quality retention
      },
      validationCriteria: {
        functionalEquivalence: true,
        accuracyTolerance: 12,
        performanceGains: true
      }
    },
    {
      name: 'memory-optimization',
      description: 'Memory-optimized configuration for resource-constrained environments',
      baselineConfig: {
        sampleRate: 44100,
        frameSize: 4096,
        hopSize: 1024,
        confidenceThreshold: 0.6,
        multiPassEnabled: true
      },
      optimizedConfig: {
        sampleRate: 44100,
        frameSize: 1024, // Smaller frame size
        hopSize: 256, // Smaller hop size
        confidenceThreshold: 0.5, // Lower threshold
        multiPassEnabled: false
      },
      testAudio: {
        duration: 18,
        complexity: 'medium',
        targetBeats: 36
      },
      expectedImprovements: {
        minSpeedupRatio: 1.0, // May not be faster, but should use less memory
        maxMemoryIncrease: -30, // Should use 30% less memory
        minQualityRetention: 75 // Acceptable quality loss for memory savings
      },
      validationCriteria: {
        functionalEquivalence: false,
        accuracyTolerance: 25,
        performanceGains: false // Primary goal is memory reduction
      }
    },
    {
      name: 'high-precision-optimization',
      description: 'High precision configuration for maximum accuracy',
      baselineConfig: {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512,
        confidenceThreshold: 0.6,
        multiPassEnabled: false
      },
      optimizedConfig: {
        sampleRate: 44100,
        frameSize: 8192, // Very large frame size
        hopSize: 2048, // Larger hop size to balance
        confidenceThreshold: 0.8, // High threshold
        multiPassEnabled: true
      },
      testAudio: {
        duration: 30,
        complexity: 'high',
        targetBeats: 60
      },
      expectedImprovements: {
        minSpeedupRatio: 0.7, // May be slower but more accurate
        maxMemoryIncrease: 200, // Allow significant memory increase
        minQualityRetention: 110 // Should improve quality
      },
      validationCriteria: {
        functionalEquivalence: false,
        accuracyTolerance: -10, // Should be more accurate
        performanceGains: false // Primary goal is accuracy improvement
      }
    }
  ];

  beforeAll(async () => {
    console.log('🎯 Initializing optimization validation test suite...');
    
    baseParser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.6
    });

    try {
      workerClient = new WorkerClient();
      await workerClient.initialize();
      console.log('  Worker client available for optimization testing');
    } catch (error) {
      console.warn('  Worker client not available:', error);
      workerClient = null as any;
    }

    console.log('✅ Optimization validation suite initialized');
  }, 60000);

  afterAll(async () => {
    await baseParser.cleanup();
    if (workerClient) {
      await workerClient.terminate();
    }
    console.log('🧹 Optimization validation test suite completed');
  });

  describe('Configuration Optimization Validation', () => {
    test('Systematic optimization impact analysis', async () => {
      console.log('Running systematic optimization impact analysis...');
      
      const optimizationResults: Array<{
        scenario: string;
        baseline: {
          duration: number;
          memory: number;
          throughput: number;
          beatsDetected: number;
          avgConfidence: number;
          qualityScore: number;
        };
        optimized: {
          duration: number;
          memory: number;
          throughput: number;
          beatsDetected: number;
          avgConfidence: number;
          qualityScore: number;
        };
        improvements: {
          speedupRatio: number;
          memoryChange: number;
          qualityRetention: number;
          throughputImprovement: number;
        };
        validation: {
          meetsSpeedupTarget: boolean;
          meetsMemoryTarget: boolean;
          meetsQualityTarget: boolean;
          overallSuccess: boolean;
        };
      }> = [];

      for (const scenario of optimizationScenarios) {
        console.log(`  Testing optimization: ${scenario.name}...`);
        
        // Generate test audio
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          scenario.testAudio.duration,
          44100,
          scenario.testAudio.complexity
        );

        // Test baseline configuration
        const baselineParser = new BeatParser(scenario.baselineConfig);
        let baselineResults;
        
        try {
          const baselineBenchmark = await PerformanceUtils.benchmarkOperation(
            () => baselineParser.parseBuffer(testAudio, { 
              targetPictureCount: scenario.testAudio.targetBeats 
            }),
            `Baseline: ${scenario.name}`,
            { iterations: 8, warmupIterations: 2 }
          );

          const baselineResult = baselineBenchmark.results[0];
          const baselineAvgConfidence = baselineResult.beats.length > 0 ? 
            baselineResult.beats.reduce((sum, b) => sum + b.confidence, 0) / baselineResult.beats.length : 0;

          baselineResults = {
            duration: baselineBenchmark.analysis.mean,
            memory: Math.max(...baselineBenchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
            throughput: baselineBenchmark.aggregatedMetrics.throughput,
            beatsDetected: baselineResult.beats.length,
            avgConfidence: baselineAvgConfidence,
            qualityScore: baselineResult.beats.length * baselineAvgConfidence
          };
        } finally {
          await baselineParser.cleanup();
        }

        // Test optimized configuration
        const optimizedParser = new BeatParser(scenario.optimizedConfig);
        let optimizedResults;

        try {
          const optimizedBenchmark = await PerformanceUtils.benchmarkOperation(
            () => optimizedParser.parseBuffer(testAudio, { 
              targetPictureCount: scenario.testAudio.targetBeats 
            }),
            `Optimized: ${scenario.name}`,
            { iterations: 8, warmupIterations: 2 }
          );

          const optimizedResult = optimizedBenchmark.results[0];
          const optimizedAvgConfidence = optimizedResult.beats.length > 0 ? 
            optimizedResult.beats.reduce((sum, b) => sum + b.confidence, 0) / optimizedResult.beats.length : 0;

          optimizedResults = {
            duration: optimizedBenchmark.analysis.mean,
            memory: Math.max(...optimizedBenchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
            throughput: optimizedBenchmark.aggregatedMetrics.throughput,
            beatsDetected: optimizedResult.beats.length,
            avgConfidence: optimizedAvgConfidence,
            qualityScore: optimizedResult.beats.length * optimizedAvgConfidence
          };
        } finally {
          await optimizedParser.cleanup();
        }

        // Calculate improvements
        const speedupRatio = baselineResults.duration / optimizedResults.duration;
        const memoryChange = ((optimizedResults.memory - baselineResults.memory) / baselineResults.memory) * 100;
        const qualityRetention = baselineResults.qualityScore > 0 ? 
          (optimizedResults.qualityScore / baselineResults.qualityScore) * 100 : 100;
        const throughputImprovement = ((optimizedResults.throughput - baselineResults.throughput) / baselineResults.throughput) * 100;

        // Validate against expected improvements
        const meetsSpeedupTarget = speedupRatio >= scenario.expectedImprovements.minSpeedupRatio;
        const meetsMemoryTarget = memoryChange <= scenario.expectedImprovements.maxMemoryIncrease;
        const meetsQualityTarget = qualityRetention >= scenario.expectedImprovements.minQualityRetention;
        const overallSuccess = (!scenario.validationCriteria.performanceGains || meetsSpeedupTarget) && 
                              meetsMemoryTarget && meetsQualityTarget;

        optimizationResults.push({
          scenario: scenario.name,
          baseline: baselineResults,
          optimized: optimizedResults,
          improvements: {
            speedupRatio,
            memoryChange,
            qualityRetention,
            throughputImprovement
          },
          validation: {
            meetsSpeedupTarget,
            meetsMemoryTarget,
            meetsQualityTarget,
            overallSuccess
          }
        });

        const successIcon = overallSuccess ? '✅' : '❌';
        console.log(`    ${successIcon} ${scenario.name}:`);
        console.log(`      Speedup: ${speedupRatio.toFixed(2)}x (target: ${scenario.expectedImprovements.minSpeedupRatio.toFixed(2)}x) ${meetsSpeedupTarget ? '✅' : '❌'}`);
        console.log(`      Memory: ${memoryChange > 0 ? '+' : ''}${memoryChange.toFixed(1)}% (target: <${scenario.expectedImprovements.maxMemoryIncrease}%) ${meetsMemoryTarget ? '✅' : '❌'}`);
        console.log(`      Quality: ${qualityRetention.toFixed(1)}% (target: >${scenario.expectedImprovements.minQualityRetention}%) ${meetsQualityTarget ? '✅' : '❌'}`);

        // Validate that tests executed successfully
        expect(baselineResults.beatsDetected).toBeGreaterThanOrEqual(0);
        expect(optimizedResults.beatsDetected).toBeGreaterThanOrEqual(0);
        expect(baselineResults.duration).toBeGreaterThan(0);
        expect(optimizedResults.duration).toBeGreaterThan(0);
      }

      // Analyze overall optimization effectiveness
      const successfulOptimizations = optimizationResults.filter(r => r.validation.overallSuccess);
      const speedupOptimizations = optimizationResults.filter(r => r.improvements.speedupRatio > 1.0);
      const memoryOptimizations = optimizationResults.filter(r => r.improvements.memoryChange < 0);
      const qualityImprovements = optimizationResults.filter(r => r.improvements.qualityRetention > 100);

      console.log('\nOptimization Analysis Summary:');
      console.log(`  Total optimizations tested: ${optimizationResults.length}`);
      console.log(`  Successful optimizations: ${successfulOptimizations.length}/${optimizationResults.length}`);
      console.log(`  Speed improvements: ${speedupOptimizations.length} (avg: ${speedupOptimizations.reduce((sum, r) => sum + r.improvements.speedupRatio, 0) / (speedupOptimizations.length || 1).toFixed(2)}x)`);
      console.log(`  Memory improvements: ${memoryOptimizations.length} (avg: ${(memoryOptimizations.reduce((sum, r) => sum + r.improvements.memoryChange, 0) / (memoryOptimizations.length || 1)).toFixed(1)}%)`);
      console.log(`  Quality improvements: ${qualityImprovements.length}`);

      // Validate optimization success rate
      expect(successfulOptimizations.length).toBeGreaterThan(optimizationResults.length * 0.6); // At least 60% should succeed
      expect(speedupOptimizations.length).toBeGreaterThan(0); // At least one should provide speedup
      
      // Detailed validation for each optimization
      optimizationResults.forEach((result, index) => {
        const scenario = optimizationScenarios[index];
        
        if (scenario.validationCriteria.performanceGains) {
          expect(result.improvements.speedupRatio).toBeGreaterThanOrEqual(scenario.expectedImprovements.minSpeedupRatio);
        }
        
        if (scenario.validationCriteria.functionalEquivalence) {
          const beatCountDiff = Math.abs(result.baseline.beatsDetected - result.optimized.beatsDetected);
          const maxAllowedDiff = Math.max(1, result.baseline.beatsDetected * scenario.validationCriteria.accuracyTolerance / 100);
          expect(beatCountDiff).toBeLessThanOrEqual(maxAllowedDiff);
        }
      });
    }, 600000);

    test('Optimization trade-off analysis', async () => {
      console.log('Running optimization trade-off analysis...');
      
      // Create configurations representing different optimization priorities
      const tradeOffConfigurations = [
        {
          name: 'Speed Priority',
          description: 'Optimized for maximum processing speed',
          config: {
            sampleRate: 44100,
            frameSize: 1024,
            hopSize: 512,
            confidenceThreshold: 0.3,
            multiPassEnabled: false
          },
          priority: 'speed',
          expectedCharacteristics: {
            relativeDuration: 0.6, // Should be 40% faster than baseline
            relativeMemory: 0.8, // Should use 20% less memory
            relativeQuality: 0.85 // May sacrifice 15% quality
          }
        },
        {
          name: 'Quality Priority',
          description: 'Optimized for maximum detection quality',
          config: {
            sampleRate: 44100,
            frameSize: 8192,
            hopSize: 2048,
            confidenceThreshold: 0.9,
            multiPassEnabled: true
          },
          priority: 'quality',
          expectedCharacteristics: {
            relativeDuration: 2.5, // May be 2.5x slower
            relativeMemory: 3.0, // May use 3x more memory
            relativeQuality: 1.15 // Should improve quality by 15%
          }
        },
        {
          name: 'Memory Priority',
          description: 'Optimized for minimal memory usage',
          config: {
            sampleRate: 44100,
            frameSize: 512,
            hopSize: 128,
            confidenceThreshold: 0.4,
            multiPassEnabled: false
          },
          priority: 'memory',
          expectedCharacteristics: {
            relativeDuration: 1.1, // May be slightly slower
            relativeMemory: 0.4, // Should use 60% less memory
            relativeQuality: 0.8 // May sacrifice 20% quality
          }
        },
        {
          name: 'Balanced',
          description: 'Balanced optimization for general use',
          config: {
            sampleRate: 44100,
            frameSize: 2048,
            hopSize: 512,
            confidenceThreshold: 0.6,
            multiPassEnabled: false
          },
          priority: 'balanced',
          expectedCharacteristics: {
            relativeDuration: 1.0, // Baseline performance
            relativeMemory: 1.0, // Baseline memory
            relativeQuality: 1.0 // Baseline quality
          }
        }
      ];

      const tradeOffResults: Array<{
        config: string;
        priority: string;
        duration: number;
        memory: number;
        qualityScore: number;
        efficiency: number;
        tradeOffScore: number;
      }> = [];

      const testAudio = AudioPerformanceUtils.generateTestAudio(20, 44100, 'high');
      const baselineConfig = tradeOffConfigurations.find(c => c.priority === 'balanced')!;

      // Test baseline first to establish reference
      let baselineResults;
      const baselineParser = new BeatParser(baselineConfig.config);
      
      try {
        const baselineBenchmark = await PerformanceUtils.benchmarkOperation(
          () => baselineParser.parseBuffer(testAudio, { targetPictureCount: 40 }),
          'Trade-off baseline',
          { iterations: 6, warmupIterations: 2 }
        );

        const baselineResult = baselineBenchmark.results[0];
        const baselineAvgConfidence = baselineResult.beats.length > 0 ? 
          baselineResult.beats.reduce((sum, b) => sum + b.confidence, 0) / baselineResult.beats.length : 0;

        baselineResults = {
          duration: baselineBenchmark.analysis.mean,
          memory: Math.max(...baselineBenchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
          qualityScore: baselineResult.beats.length * baselineAvgConfidence
        };
      } finally {
        await baselineParser.cleanup();
      }

      // Test each configuration
      for (const config of tradeOffConfigurations) {
        console.log(`  Testing trade-off: ${config.name}...`);
        
        const testParser = new BeatParser(config.config);

        try {
          const benchmark = await PerformanceUtils.benchmarkOperation(
            () => testParser.parseBuffer(testAudio, { targetPictureCount: 40 }),
            `Trade-off: ${config.name}`,
            { iterations: 6, warmupIterations: 2 }
          );

          const result = benchmark.results[0];
          const avgConfidence = result.beats.length > 0 ? 
            result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length : 0;

          const duration = benchmark.analysis.mean;
          const memory = Math.max(...benchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed)));
          const qualityScore = result.beats.length * avgConfidence;
          
          // Calculate efficiency based on priority
          let efficiency = 0;
          if (config.priority === 'speed') {
            efficiency = baselineResults.duration / duration; // Higher is better
          } else if (config.priority === 'memory') {
            efficiency = baselineResults.memory / memory; // Higher is better
          } else if (config.priority === 'quality') {
            efficiency = qualityScore / baselineResults.qualityScore; // Higher is better
          } else {
            // Balanced: harmonic mean of normalized metrics
            const speedRatio = baselineResults.duration / duration;
            const memoryRatio = baselineResults.memory / memory;
            const qualityRatio = qualityScore / baselineResults.qualityScore;
            efficiency = 3 / (1/speedRatio + 1/memoryRatio + 1/qualityRatio);
          }

          // Calculate trade-off score (weighted based on priority)
          const normalizedDuration = duration / baselineResults.duration;
          const normalizedMemory = memory / baselineResults.memory;
          const normalizedQuality = qualityScore / baselineResults.qualityScore;

          let tradeOffScore = 0;
          switch (config.priority) {
            case 'speed':
              tradeOffScore = (1/normalizedDuration) * 0.6 + (1/normalizedMemory) * 0.2 + normalizedQuality * 0.2;
              break;
            case 'memory':
              tradeOffScore = (1/normalizedMemory) * 0.6 + (1/normalizedDuration) * 0.2 + normalizedQuality * 0.2;
              break;
            case 'quality':
              tradeOffScore = normalizedQuality * 0.6 + (1/normalizedDuration) * 0.2 + (1/normalizedMemory) * 0.2;
              break;
            default:
              tradeOffScore = (1/normalizedDuration + 1/normalizedMemory + normalizedQuality) / 3;
          }

          tradeOffResults.push({
            config: config.name,
            priority: config.priority,
            duration,
            memory,
            qualityScore,
            efficiency,
            tradeOffScore
          });

          console.log(`    Duration: ${duration.toFixed(0)}ms (${normalizedDuration.toFixed(2)}x baseline)`);
          console.log(`    Memory: ${(memory / 1024 / 1024).toFixed(1)}MB (${normalizedMemory.toFixed(2)}x baseline)`);
          console.log(`    Quality: ${qualityScore.toFixed(2)} (${normalizedQuality.toFixed(2)}x baseline)`);
          console.log(`    Trade-off score: ${tradeOffScore.toFixed(3)}`);

        } finally {
          await testParser.cleanup();
        }
      }

      // Analyze trade-off effectiveness
      console.log('\nTrade-off Analysis Results:');
      const sortedByScore = [...tradeOffResults].sort((a, b) => b.tradeOffScore - a.tradeOffScore);
      
      console.log('  Ranking by trade-off score:');
      sortedByScore.forEach((result, index) => {
        console.log(`    ${index + 1}. ${result.config} (${result.priority}): ${result.tradeOffScore.toFixed(3)}`);
      });

      // Validate trade-off expectations
      tradeOffConfigurations.forEach((config, index) => {
        const result = tradeOffResults[index];
        
        if (config.priority === 'speed') {
          const speedImprovement = baselineResults.duration / result.duration;
          expect(speedImprovement).toBeGreaterThan(1.2); // Should be at least 20% faster
        } else if (config.priority === 'memory') {
          const memoryImprovement = baselineResults.memory / result.memory;
          expect(memoryImprovement).toBeGreaterThan(1.5); // Should use at least 33% less memory
        } else if (config.priority === 'quality') {
          const qualityImprovement = result.qualityScore / baselineResults.qualityScore;
          expect(qualityImprovement).toBeGreaterThan(1.05); // Should improve quality by at least 5%
        }
      });

      // Each configuration should excel in its priority area
      const speedConfig = tradeOffResults.find(r => r.priority === 'speed');
      const memoryConfig = tradeOffResults.find(r => r.priority === 'memory');
      const qualityConfig = tradeOffResults.find(r => r.priority === 'quality');
      
      if (speedConfig && memoryConfig && qualityConfig) {
        // Speed config should be fastest
        expect(speedConfig.duration).toBeLessThan(memoryConfig.duration);
        expect(speedConfig.duration).toBeLessThan(qualityConfig.duration);
        
        // Memory config should use least memory
        expect(memoryConfig.memory).toBeLessThan(speedConfig.memory);
        expect(memoryConfig.memory).toBeLessThan(qualityConfig.memory);
        
        // Quality config should have highest quality score
        expect(qualityConfig.qualityScore).toBeGreaterThan(speedConfig.qualityScore);
        expect(qualityConfig.qualityScore).toBeGreaterThan(memoryConfig.qualityScore);
      }
    }, 400000);
  });

  describe('Algorithm Optimization Validation', () => {
    test('Beat selection algorithm optimization comparison', async () => {
      console.log('Testing beat selection algorithm optimizations...');
      
      const algorithms = ['energy', 'regular', 'musical', 'adaptive'] as const;
      const algorithmResults: Array<{
        algorithm: string;
        duration: number;
        memory: number;
        beatsDetected: number;
        avgConfidence: number;
        qualityScore: number;
        complexity: string;
      }> = [];

      // Test different audio complexities
      const complexities: Array<{ 
        name: string; 
        complexity: 'minimal' | 'low' | 'medium' | 'high' | 'maximum';
        duration: number;
        expectedBests: string[];
      }> = [
        { name: 'Simple Audio', complexity: 'low', duration: 10, expectedBests: ['energy', 'regular'] },
        { name: 'Complex Audio', complexity: 'high', duration: 15, expectedBests: ['musical', 'adaptive'] },
        { name: 'Maximum Complexity', complexity: 'maximum', duration: 12, expectedBests: ['adaptive', 'musical'] }
      ];

      for (const testCase of complexities) {
        console.log(`  Testing algorithms on ${testCase.name}...`);
        
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          testCase.duration,
          44100,
          testCase.complexity
        );

        const caseResults: typeof algorithmResults = [];

        for (const algorithm of algorithms) {
          const benchmark = await PerformanceUtils.benchmarkOperation(
            () => baseParser.parseBuffer(testAudio, { 
              targetPictureCount: testCase.duration * 2,
              algorithm: algorithm
            }),
            `${testCase.name} - ${algorithm}`,
            { iterations: 5, warmupIterations: 1 }
          );

          const result = benchmark.results[0];
          const avgConfidence = result.beats.length > 0 ? 
            result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length : 0;

          const algorithmResult = {
            algorithm,
            duration: benchmark.analysis.mean,
            memory: Math.max(...benchmark.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
            beatsDetected: result.beats.length,
            avgConfidence,
            qualityScore: result.beats.length * avgConfidence,
            complexity: testCase.name
          };

          caseResults.push(algorithmResult);
          algorithmResults.push(algorithmResult);

          console.log(`    ${algorithm}: ${benchmark.analysis.mean.toFixed(0)}ms, ${result.beats.length} beats, ${avgConfidence.toFixed(3)} conf`);
        }

        // Analyze which algorithms perform best for this complexity
        const sortedByQuality = [...caseResults].sort((a, b) => b.qualityScore - a.qualityScore);
        const sortedBySpeed = [...caseResults].sort((a, b) => a.duration - b.duration);
        const sortedByMemory = [...caseResults].sort((a, b) => a.memory - b.memory);

        console.log(`    Best quality: ${sortedByQuality[0].algorithm} (${sortedByQuality[0].qualityScore.toFixed(2)})`);
        console.log(`    Fastest: ${sortedBySpeed[0].algorithm} (${sortedBySpeed[0].duration.toFixed(0)}ms)`);
        console.log(`    Memory efficient: ${sortedByMemory[0].algorithm} (${(sortedByMemory[0].memory / 1024 / 1024).toFixed(1)}MB)`);

        // Validate expected performance characteristics
        const bestQualityAlgorithm = sortedByQuality[0].algorithm;
        expect(testCase.expectedBests).toContain(bestQualityAlgorithm);
      }

      // Overall algorithm analysis
      console.log('\nAlgorithm Optimization Analysis:');
      const algorithmSummary = algorithms.map(algorithm => {
        const algoResults = algorithmResults.filter(r => r.algorithm === algorithm);
        const avgDuration = algoResults.reduce((sum, r) => sum + r.duration, 0) / algoResults.length;
        const avgMemory = algoResults.reduce((sum, r) => sum + r.memory, 0) / algoResults.length;
        const avgQuality = algoResults.reduce((sum, r) => sum + r.qualityScore, 0) / algoResults.length;

        return {
          algorithm,
          avgDuration,
          avgMemory,
          avgQuality,
          consistency: Math.sqrt(algoResults.reduce((sum, r) => sum + Math.pow(r.duration - avgDuration, 2), 0) / algoResults.length)
        };
      });

      algorithmSummary.forEach(summary => {
        console.log(`  ${summary.algorithm}:`);
        console.log(`    Avg duration: ${summary.avgDuration.toFixed(0)}ms (±${summary.consistency.toFixed(0)}ms)`);
        console.log(`    Avg memory: ${(summary.avgMemory / 1024 / 1024).toFixed(1)}MB`);
        console.log(`    Avg quality: ${summary.avgQuality.toFixed(2)}`);
      });

      // Validate algorithm differentiation
      const durationRange = Math.max(...algorithmSummary.map(s => s.avgDuration)) - 
                           Math.min(...algorithmSummary.map(s => s.avgDuration));
      const qualityRange = Math.max(...algorithmSummary.map(s => s.avgQuality)) - 
                          Math.min(...algorithmSummary.map(s => s.avgQuality));

      expect(durationRange).toBeGreaterThan(100); // At least 100ms difference between fastest and slowest
      expect(qualityRange).toBeGreaterThan(0.5); // Meaningful quality differences

      // Validate that all algorithms produce valid results
      algorithmResults.forEach(result => {
        expect(result.beatsDetected).toBeGreaterThanOrEqual(0);
        expect(result.duration).toBeGreaterThan(0);
        expect(result.avgConfidence).toBeGreaterThanOrEqual(0);
      });
    }, 450000);

    test('Worker thread optimization validation', async () => {
      if (!workerClient) {
        console.warn('Worker client not available - skipping worker optimization tests');
        return;
      }

      console.log('Testing worker thread optimization validation...');
      
      const workerOptimizationTests = [
        {
          name: 'Single Large File',
          testFunc: (useWorker: boolean) => {
            const audio = AudioPerformanceUtils.generateTestAudio(45, 44100, 'high');
            const parser = useWorker ? workerClient : baseParser;
            return parser.parseBuffer(audio, { targetPictureCount: 90 });
          },
          expectedWorkerBenefit: 'memory_isolation'
        },
        {
          name: 'Multiple Medium Files',
          testFunc: async (useWorker: boolean) => {
            const files = Array.from({ length: 5 }, () => 
              AudioPerformanceUtils.generateTestAudio(12, 44100, 'medium')
            );
            
            if (useWorker) {
              // Process in parallel with worker
              const promises = files.map(audio => 
                workerClient.parseBuffer(audio, { targetPictureCount: 24 })
              );
              return Promise.all(promises);
            } else {
              // Process sequentially with main thread
              const results = [];
              for (const audio of files) {
                results.push(await baseParser.parseBuffer(audio, { targetPictureCount: 24 }));
              }
              return results;
            }
          },
          expectedWorkerBenefit: 'parallelization'
        }
      ];

      const workerOptimizationResults: Array<{
        testName: string;
        mainThread: {
          duration: number;
          memory: number;
          beatsTotal: number;
        };
        workerThread: {
          duration: number;
          memory: number;
          beatsTotal: number;
        };
        optimization: {
          speedupRatio: number;
          memoryBenefit: number;
          accuracy: number;
        };
        expectedBenefit: string;
      }> = [];

      for (const test of workerOptimizationTests) {
        console.log(`  Testing worker optimization: ${test.name}...`);
        
        // Test main thread
        const mainThreadBench = await PerformanceUtils.measureOperation(
          () => test.testFunc(false),
          `Main thread: ${test.name}`,
          { iterations: 1, warmupIterations: 0 }
        );

        // Test worker thread
        const workerThreadBench = await PerformanceUtils.measureOperation(
          () => test.testFunc(true),
          `Worker thread: ${test.name}`,
          { iterations: 1, warmupIterations: 0 }
        );

        // Calculate metrics
        const mainBeats = Array.isArray(mainThreadBench.result) ? 
          mainThreadBench.result.reduce((sum, r) => sum + r.beats.length, 0) :
          mainThreadBench.result.beats.length;

        const workerBeats = Array.isArray(workerThreadBench.result) ? 
          workerThreadBench.result.reduce((sum, r) => sum + r.beats.length, 0) :
          workerThreadBench.result.beats.length;

        const speedupRatio = mainThreadBench.metrics.duration / workerThreadBench.metrics.duration;
        const memoryBenefit = (Math.max(0, mainThreadBench.metrics.memoryUsage.heapUsed) - 
                              Math.max(0, workerThreadBench.metrics.memoryUsage.heapUsed)) / 1024 / 1024;
        const accuracy = workerBeats > 0 ? Math.abs(mainBeats - workerBeats) / workerBeats : 0;

        workerOptimizationResults.push({
          testName: test.name,
          mainThread: {
            duration: mainThreadBench.metrics.duration,
            memory: Math.max(0, mainThreadBench.metrics.memoryUsage.heapUsed),
            beatsTotal: mainBeats
          },
          workerThread: {
            duration: workerThreadBench.metrics.duration,
            memory: Math.max(0, workerThreadBench.metrics.memoryUsage.heapUsed),
            beatsTotal: workerBeats
          },
          optimization: {
            speedupRatio,
            memoryBenefit,
            accuracy
          },
          expectedBenefit: test.expectedWorkerBenefit
        });

        console.log(`    Main thread: ${mainThreadBench.metrics.duration.toFixed(0)}ms, ${mainBeats} beats`);
        console.log(`    Worker thread: ${workerThreadBench.metrics.duration.toFixed(0)}ms, ${workerBeats} beats`);
        console.log(`    Speedup: ${speedupRatio.toFixed(2)}x, Memory benefit: ${memoryBenefit.toFixed(1)}MB, Accuracy: ${(accuracy * 100).toFixed(1)}% diff`);

        // Basic validation
        expect(mainBeats).toBeGreaterThan(0);
        expect(workerBeats).toBeGreaterThan(0);
        expect(Math.abs(mainBeats - workerBeats)).toBeLessThanOrEqual(Math.max(2, mainBeats * 0.1)); // Allow 10% variance
      }

      // Analyze worker optimization effectiveness
      console.log('\nWorker Thread Optimization Analysis:');
      const avgSpeedup = workerOptimizationResults.reduce((sum, r) => sum + r.optimization.speedupRatio, 0) / 
                        workerOptimizationResults.length;
      const avgMemoryBenefit = workerOptimizationResults.reduce((sum, r) => sum + r.optimization.memoryBenefit, 0) / 
                              workerOptimizationResults.length;
      const maxAccuracyDiff = Math.max(...workerOptimizationResults.map(r => r.optimization.accuracy));

      console.log(`  Average speedup: ${avgSpeedup.toFixed(2)}x`);
      console.log(`  Average memory benefit: ${avgMemoryBenefit.toFixed(1)}MB`);
      console.log(`  Maximum accuracy difference: ${(maxAccuracyDiff * 100).toFixed(1)}%`);

      // Validate worker thread benefits
      expect(avgSpeedup).toBeGreaterThan(0.8); // Should not be significantly slower
      expect(maxAccuracyDiff).toBeLessThan(0.15); // <15% accuracy difference
      
      // At least one test should show clear benefits
      const hasSpeedBenefit = workerOptimizationResults.some(r => r.optimization.speedupRatio > 1.1);
      const hasMemoryBenefit = workerOptimizationResults.some(r => r.optimization.memoryBenefit > 5);
      
      expect(hasSpeedBenefit || hasMemoryBenefit).toBe(true);
    }, 300000);
  });

  describe('Optimization Impact Measurement', () => {
    test('Before and after optimization comparison', async () => {
      console.log('Running before/after optimization comparison...');
      
      // Define a realistic optimization scenario
      const beforeConfig: BeatParserConfig = {
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 256, // Small hop size (detailed analysis)
        confidenceThreshold: 0.8, // High threshold (conservative)
        multiPassEnabled: true // Multi-pass (thorough)
      };

      const afterConfig: BeatParserConfig = {
        sampleRate: 44100,
        frameSize: 4096, // Larger frames for better FFT efficiency
        hopSize: 1024, // Larger hop size for speed
        confidenceThreshold: 0.6, // Balanced threshold
        multiPassEnabled: false // Single pass for speed
      };

      const testScenarios = [
        { name: 'Short Track', duration: 15, complexity: 'medium' as const, targetBeats: 30 },
        { name: 'Long Track', duration: 180, complexity: 'high' as const, targetBeats: 360 },
        { name: 'Complex Audio', duration: 45, complexity: 'maximum' as const, targetBeats: 90 }
      ];

      const comparisonResults: Array<{
        scenario: string;
        before: {
          duration: number;
          memory: number;
          beatsDetected: number;
          avgConfidence: number;
          qualityScore: number;
        };
        after: {
          duration: number;
          memory: number;
          beatsDetected: number;
          avgConfidence: number;
          qualityScore: number;
        };
        improvements: {
          speedImprovement: number;
          memoryImprovement: number;
          qualityChange: number;
          efficiencyGain: number;
        };
      }> = [];

      for (const scenario of testScenarios) {
        console.log(`  Testing scenario: ${scenario.name}...`);
        
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          scenario.duration,
          44100,
          scenario.complexity
        );

        // Test "before" configuration
        const beforeParser = new BeatParser(beforeConfig);
        let beforeResults;

        try {
          const beforeBench = await PerformanceUtils.benchmarkOperation(
            () => beforeParser.parseBuffer(testAudio, { targetPictureCount: scenario.targetBeats }),
            `Before: ${scenario.name}`,
            { iterations: 5, warmupIterations: 1 }
          );

          const beforeResult = beforeBench.results[0];
          const beforeAvgConf = beforeResult.beats.length > 0 ? 
            beforeResult.beats.reduce((sum, b) => sum + b.confidence, 0) / beforeResult.beats.length : 0;

          beforeResults = {
            duration: beforeBench.analysis.mean,
            memory: Math.max(...beforeBench.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
            beatsDetected: beforeResult.beats.length,
            avgConfidence: beforeAvgConf,
            qualityScore: beforeResult.beats.length * beforeAvgConf
          };
        } finally {
          await beforeParser.cleanup();
        }

        // Test "after" configuration
        const afterParser = new BeatParser(afterConfig);
        let afterResults;

        try {
          const afterBench = await PerformanceUtils.benchmarkOperation(
            () => afterParser.parseBuffer(testAudio, { targetPictureCount: scenario.targetBeats }),
            `After: ${scenario.name}`,
            { iterations: 5, warmupIterations: 1 }
          );

          const afterResult = afterBench.results[0];
          const afterAvgConf = afterResult.beats.length > 0 ? 
            afterResult.beats.reduce((sum, b) => sum + b.confidence, 0) / afterResult.beats.length : 0;

          afterResults = {
            duration: afterBench.analysis.mean,
            memory: Math.max(...afterBench.metrics.map(m => Math.max(0, m.memoryUsage.heapUsed))),
            beatsDetected: afterResult.beats.length,
            avgConfidence: afterAvgConf,
            qualityScore: afterResult.beats.length * afterAvgConf
          };
        } finally {
          await afterParser.cleanup();
        }

        // Calculate improvements
        const speedImprovement = ((beforeResults.duration - afterResults.duration) / beforeResults.duration) * 100;
        const memoryImprovement = ((beforeResults.memory - afterResults.memory) / beforeResults.memory) * 100;
        const qualityChange = ((afterResults.qualityScore - beforeResults.qualityScore) / beforeResults.qualityScore) * 100;
        const efficiencyGain = (speedImprovement + memoryImprovement + qualityChange) / 3; // Composite score

        comparisonResults.push({
          scenario: scenario.name,
          before: beforeResults,
          after: afterResults,
          improvements: {
            speedImprovement,
            memoryImprovement,
            qualityChange,
            efficiencyGain
          }
        });

        console.log(`    Speed improvement: ${speedImprovement > 0 ? '+' : ''}${speedImprovement.toFixed(1)}%`);
        console.log(`    Memory improvement: ${memoryImprovement > 0 ? '+' : ''}${memoryImprovement.toFixed(1)}%`);
        console.log(`    Quality change: ${qualityChange > 0 ? '+' : ''}${qualityChange.toFixed(1)}%`);
        console.log(`    Efficiency gain: ${efficiencyGain.toFixed(1)}%`);
      }

      // Analyze overall optimization impact
      console.log('\nOptimization Impact Analysis:');
      const avgSpeedImprovement = comparisonResults.reduce((sum, r) => sum + r.improvements.speedImprovement, 0) / 
                                 comparisonResults.length;
      const avgMemoryImprovement = comparisonResults.reduce((sum, r) => sum + r.improvements.memoryImprovement, 0) / 
                                  comparisonResults.length;
      const avgQualityChange = comparisonResults.reduce((sum, r) => sum + r.improvements.qualityChange, 0) / 
                              comparisonResults.length;
      const avgEfficiencyGain = comparisonResults.reduce((sum, r) => sum + r.improvements.efficiencyGain, 0) / 
                               comparisonResults.length;

      console.log(`  Average speed improvement: ${avgSpeedImprovement.toFixed(1)}%`);
      console.log(`  Average memory improvement: ${avgMemoryImprovement.toFixed(1)}%`);
      console.log(`  Average quality change: ${avgQualityChange.toFixed(1)}%`);
      console.log(`  Average efficiency gain: ${avgEfficiencyGain.toFixed(1)}%`);

      // Validate optimization effectiveness
      expect(avgSpeedImprovement).toBeGreaterThan(20); // Should improve speed by >20%
      expect(avgMemoryImprovement).toBeGreaterThan(10); // Should improve memory by >10%
      expect(avgQualityChange).toBeGreaterThan(-30); // Quality loss should be <30%
      expect(avgEfficiencyGain).toBeGreaterThan(0); // Overall should be positive

      // Individual scenario validation
      comparisonResults.forEach(result => {
        expect(result.before.beatsDetected).toBeGreaterThan(0);
        expect(result.after.beatsDetected).toBeGreaterThan(0);
        expect(result.improvements.speedImprovement).toBeGreaterThan(0); // Each should show speed improvement
      });

      // Consistency check
      const speedImprovementVariance = Math.sqrt(
        comparisonResults.reduce((sum, r) => 
          sum + Math.pow(r.improvements.speedImprovement - avgSpeedImprovement, 2), 0
        ) / comparisonResults.length
      );
      
      expect(speedImprovementVariance).toBeLessThan(20); // Speed improvements should be consistent
    }, 500000);
  });
});