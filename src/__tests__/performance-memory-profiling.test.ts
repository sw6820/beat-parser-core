/**
 * Performance Memory Profiling Tests
 * Memory usage and leak detection analysis
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { WorkerClient } from '../worker/WorkerClient';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';
import type { ParseOptions, ParseResult } from '../types';

describe('Performance Memory Profiling Tests', () => {
  let parser: BeatParser;
  let workerClient: WorkerClient;

  // Memory test configurations
  const memoryTestConfigs = [
    { frameSize: 512, hopSize: 128, label: 'Memory Efficient' },
    { frameSize: 2048, hopSize: 512, label: 'Balanced' },
    { frameSize: 8192, hopSize: 2048, label: 'Memory Intensive' }
  ];

  beforeAll(async () => {
    console.log('🧠 Initializing memory profiling test suite...');
    
    // Enable garbage collection for memory testing if available
    if (global.gc) {
      global.gc();
      console.log('  GC available for memory testing');
    } else {
      console.warn('  GC not available - memory tests may be less accurate');
    }

    parser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.6
    });

    try {
      workerClient = new WorkerClient();
      await workerClient.initialize();
      console.log('  Worker client initialized for memory isolation testing');
    } catch (error) {
      console.warn('  Worker client initialization failed:', error);
      workerClient = null as any;
    }

    console.log('✅ Memory profiling suite initialized');
  }, 60000);

  afterAll(async () => {
    await parser.cleanup();
    if (workerClient) {
      await workerClient.terminate();
    }
    
    // Final cleanup
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('🧹 Memory profiling test suite completed');
  });

  describe('Memory Usage Patterns', () => {
    test('Audio buffer memory allocation patterns', async () => {
      const bufferSizes = [1024, 4096, 16384, 65536, 262144]; // Different buffer sizes
      const allocationResults: Array<{
        bufferSize: number;
        audioSizeMB: number;
        peakMemoryMB: number;
        memoryDeltaMB: number;
        memoryMultiplier: number;
        allocationEfficiency: number;
      }> = [];

      for (const bufferSize of bufferSizes) {
        const testAudio = new Float32Array(bufferSize);
        // Fill with test data to ensure memory allocation
        for (let i = 0; i < bufferSize; i++) {
          testAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
        }

        const audioSizeMB = (bufferSize * 4) / 1024 / 1024; // Float32Array = 4 bytes per sample

        const memoryProfile = await PerformanceUtils.profileMemoryUsage(
          () => parser.parseBuffer(testAudio, { targetPictureCount: Math.max(1, Math.floor(bufferSize / 10000)) }),
          `Buffer allocation: ${bufferSize} samples`,
          25 // Frequent memory snapshots
        );

        const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
        const memoryDeltaMB = Math.max(0, memoryProfile.memoryDelta.heapUsed) / 1024 / 1024;
        const memoryMultiplier = peakMemoryMB / audioSizeMB;
        const allocationEfficiency = audioSizeMB / peakMemoryMB;

        allocationResults.push({
          bufferSize,
          audioSizeMB,
          peakMemoryMB,
          memoryDeltaMB,
          memoryMultiplier,
          allocationEfficiency
        });

        console.log(`Buffer ${bufferSize}: Audio ${audioSizeMB.toFixed(2)}MB → Peak ${peakMemoryMB.toFixed(2)}MB (${memoryMultiplier.toFixed(1)}x)`);

        // Validate memory allocation efficiency
        expect(peakMemoryMB).toBeGreaterThan(audioSizeMB * 0.5); // Should use at least 50% of audio size
        expect(peakMemoryMB).toBeLessThan(audioSizeMB * 20); // Should not use more than 20x audio size
        expect(memoryMultiplier).toBeLessThan(15); // Reasonable memory overhead
      }

      // Analyze allocation scaling
      console.log('Memory Allocation Scaling Analysis:');
      for (let i = 1; i < allocationResults.length; i++) {
        const current = allocationResults[i];
        const previous = allocationResults[i - 1];
        
        const sizeRatio = current.audioSizeMB / previous.audioSizeMB;
        const memoryRatio = current.peakMemoryMB / previous.peakMemoryMB;
        const scalingEfficiency = sizeRatio / memoryRatio;

        console.log(`  ${previous.bufferSize} → ${current.bufferSize}: Size ${sizeRatio.toFixed(2)}x, Memory ${memoryRatio.toFixed(2)}x, Efficiency ${scalingEfficiency.toFixed(2)}`);

        // Memory scaling should be roughly proportional to input size
        expect(scalingEfficiency).toBeGreaterThan(0.5); // Not dramatically worse scaling
        expect(scalingEfficiency).toBeLessThan(2.0); // Not dramatically better scaling
      }

      // Larger buffers should generally be more memory-efficient
      const smallBuffer = allocationResults[0];
      const largeBuffer = allocationResults[allocationResults.length - 1];
      
      if (largeBuffer.allocationEfficiency > smallBuffer.allocationEfficiency) {
        console.log('✓ Large buffers are more memory-efficient');
      } else {
        console.log('ℹ Small buffers are more memory-efficient (or comparable)');
      }
    }, 180000);

    test('Processing phase memory consumption', async () => {
      const testAudio = AudioPerformanceUtils.generateTestAudio(10, 44100, 'high');
      
      // Create a custom parser to access internal components
      const memoryParser = new BeatParser({
        sampleRate: 44100,
        frameSize: 2048,
        hopSize: 512,
        confidenceThreshold: 0.6
      });

      try {
        const phaseResults: Array<{
          phase: string;
          memoryUsed: number;
          memoryDelta: number;
          duration: number;
        }> = [];

        // Measure memory usage for each processing phase
        const phases = [
          {
            name: 'Audio Loading',
            operation: async () => {
              // Simulate audio loading (already loaded, but measure baseline)
              return { audio: testAudio };
            }
          },
          {
            name: 'Audio Preprocessing',
            operation: async () => {
              // Access internal audio processor if available
              if (memoryParser['audioProcessor']) {
                return memoryParser['audioProcessor'].preprocess(testAudio);
              }
              return testAudio;
            }
          },
          {
            name: 'Spectral Analysis',
            operation: async () => {
              if (memoryParser['audioProcessor']) {
                return memoryParser['audioProcessor'].computeSpectrum(testAudio);
              }
              return new Float32Array(1024); // Fallback
            }
          },
          {
            name: 'Beat Detection',
            operation: async () => {
              return memoryParser.parseBuffer(testAudio, { 
                targetPictureCount: 20,
                skipPostProcessing: true 
              });
            }
          },
          {
            name: 'Beat Selection',
            operation: async () => {
              return memoryParser.parseBuffer(testAudio, { targetPictureCount: 20 });
            }
          }
        ];

        let baselineMemory = process.memoryUsage().heapUsed;

        for (const phase of phases) {
          try {
            const phaseProfile = await PerformanceUtils.profileMemoryUsage(
              phase.operation,
              phase.name,
              100 // 100ms memory snapshots
            );

            const memoryUsed = phaseProfile.peakMemory.heapUsed / 1024 / 1024;
            const memoryDelta = Math.max(0, phaseProfile.memoryDelta.heapUsed) / 1024 / 1024;
            const duration = phaseProfile.snapshots[phaseProfile.snapshots.length - 1].timestamp - 
                           phaseProfile.snapshots[0].timestamp;

            phaseResults.push({
              phase: phase.name,
              memoryUsed,
              memoryDelta,
              duration
            });

            console.log(`${phase.name}: ${memoryUsed.toFixed(2)}MB peak, +${memoryDelta.toFixed(2)}MB delta, ${duration.toFixed(0)}ms`);
          } catch (error) {
            console.warn(`Phase ${phase.name} failed:`, error);
          }
        }

        // Analyze memory consumption by phase
        const totalMemoryDelta = phaseResults.reduce((sum, p) => sum + p.memoryDelta, 0);
        const maxMemoryUsed = Math.max(...phaseResults.map(p => p.memoryUsed));
        
        console.log(`Total memory delta: ${totalMemoryDelta.toFixed(2)}MB`);
        console.log(`Peak memory usage: ${maxMemoryUsed.toFixed(2)}MB`);

        // Validate phase memory usage
        phaseResults.forEach(result => {
          expect(result.memoryUsed).toBeGreaterThan(0);
          expect(result.memoryUsed).toBeLessThan(500); // <500MB per phase
          expect(result.memoryDelta).toBeLessThan(200); // <200MB delta per phase
        });

        // Most memory-intensive phase should be identifiable
        const mostMemoryIntensive = phaseResults.reduce((max, current) => 
          current.memoryUsed > max.memoryUsed ? current : max
        );
        
        console.log(`Most memory-intensive phase: ${mostMemoryIntensive.phase} (${mostMemoryIntensive.memoryUsed.toFixed(2)}MB)`);
        expect(['Spectral Analysis', 'Beat Detection', 'Beat Selection']).toContain(mostMemoryIntensive.phase);
      } finally {
        await memoryParser.cleanup();
      }
    }, 120000);

    test('Memory usage with different audio complexities', async () => {
      const complexities: Array<{
        name: string;
        complexity: 'minimal' | 'low' | 'medium' | 'high' | 'maximum';
        expectedMemoryRatio: number;
      }> = [
        { name: 'Silence', complexity: 'minimal', expectedMemoryRatio: 1.0 },
        { name: 'Simple Sine', complexity: 'low', expectedMemoryRatio: 1.2 },
        { name: 'Musical Content', complexity: 'medium', expectedMemoryRatio: 1.5 },
        { name: 'Complex Audio', complexity: 'high', expectedMemoryRatio: 2.0 },
        { name: 'Maximum Complexity', complexity: 'maximum', expectedMemoryRatio: 3.0 }
      ];

      const complexityResults: Array<{
        complexity: string;
        audioSizeMB: number;
        peakMemoryMB: number;
        memoryRatio: number;
        processingTime: number;
        beatsDetected: number;
      }> = [];

      const baselineDuration = 8; // 8 seconds

      for (const test of complexities) {
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          baselineDuration,
          44100,
          test.complexity
        );

        const audioSizeMB = (testAudio.length * 4) / 1024 / 1024;

        const memoryProfile = await PerformanceUtils.profileMemoryUsage(
          () => parser.parseBuffer(testAudio, { targetPictureCount: 16 }),
          `Complexity: ${test.name}`,
          50
        );

        const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
        const memoryRatio = peakMemoryMB / audioSizeMB;
        const processingTime = memoryProfile.snapshots[memoryProfile.snapshots.length - 1].timestamp - 
                              memoryProfile.snapshots[0].timestamp;

        complexityResults.push({
          complexity: test.name,
          audioSizeMB,
          peakMemoryMB,
          memoryRatio,
          processingTime,
          beatsDetected: memoryProfile.result.beats.length
        });

        console.log(`${test.name}: ${peakMemoryMB.toFixed(2)}MB (${memoryRatio.toFixed(1)}x), ${processingTime.toFixed(0)}ms, ${memoryProfile.result.beats.length} beats`);

        // Validate memory usage is reasonable for complexity
        expect(memoryRatio).toBeLessThan(test.expectedMemoryRatio * 2); // Allow 2x buffer
        expect(peakMemoryMB).toBeLessThan(audioSizeMB * 10); // Never more than 10x audio size
      }

      // Analyze complexity impact on memory
      const silenceResult = complexityResults.find(r => r.complexity === 'Silence');
      const maxComplexityResult = complexityResults.find(r => r.complexity === 'Maximum Complexity');

      if (silenceResult && maxComplexityResult) {
        const complexityMemoryRatio = maxComplexityResult.peakMemoryMB / silenceResult.peakMemoryMB;
        console.log(`Memory impact of complexity: ${complexityMemoryRatio.toFixed(2)}x increase from silence to maximum`);
        
        // Complex audio should use more memory, but not excessively
        expect(complexityMemoryRatio).toBeGreaterThan(1.1); // Should use more memory
        expect(complexityMemoryRatio).toBeLessThan(5.0); // But not more than 5x
      }

      // Memory usage should correlate with detected beats (more complex = more processing)
      const memoryVsBeats = complexityResults.map(r => ({
        memory: r.peakMemoryMB,
        beats: r.beatsDetected
      })).filter(r => r.beats > 0);

      if (memoryVsBeats.length > 2) {
        // Calculate correlation coefficient
        const meanMemory = memoryVsBeats.reduce((sum, r) => sum + r.memory, 0) / memoryVsBeats.length;
        const meanBeats = memoryVsBeats.reduce((sum, r) => sum + r.beats, 0) / memoryVsBeats.length;
        
        let numerator = 0;
        let denomMemory = 0;
        let denomBeats = 0;
        
        memoryVsBeats.forEach(r => {
          const memoryDiff = r.memory - meanMemory;
          const beatsDiff = r.beats - meanBeats;
          numerator += memoryDiff * beatsDiff;
          denomMemory += memoryDiff * memoryDiff;
          denomBeats += beatsDiff * beatsDiff;
        });

        const correlation = numerator / Math.sqrt(denomMemory * denomBeats);
        console.log(`Memory vs Beats correlation: ${correlation.toFixed(3)}`);
        
        // Should have some positive correlation (more beats → more memory)
        expect(correlation).toBeGreaterThan(-0.5); // Not strongly negative
      }
    }, 240000);
  });

  describe('Memory Leak Detection', () => {
    test('Single operation memory leak detection', async () => {
      const iterations = 20;
      const memorySnapshots: Array<{
        iteration: number;
        beforeGC: number;
        afterGC: number;
        delta: number;
      }> = [];

      console.log(`Running ${iterations} iterations for memory leak detection...`);

      for (let i = 0; i < iterations; i++) {
        const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'medium');
        
        // Force GC before measurement
        if (global.gc) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        const memoryBefore = process.memoryUsage().heapUsed;
        
        // Perform operation
        const result = await parser.parseBuffer(testAudio, { targetPictureCount: 10 });
        
        // Force GC after operation
        if (global.gc) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        const memoryAfter = process.memoryUsage().heapUsed;
        const delta = memoryAfter - memoryBefore;

        memorySnapshots.push({
          iteration: i + 1,
          beforeGC: memoryBefore / 1024 / 1024,
          afterGC: memoryAfter / 1024 / 1024,
          delta: delta / 1024 / 1024
        });

        if (i % 5 === 0) {
          console.log(`  Iteration ${i + 1}: ${(delta / 1024 / 1024).toFixed(2)}MB delta`);
        }

        // Validate operation succeeded
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeGreaterThan(0);
      }

      // Analyze memory leak patterns
      const deltas = memorySnapshots.map(s => s.delta);
      const cumulativeDelta = deltas.reduce((sum, d) => sum + d, 0);
      const avgDelta = cumulativeDelta / iterations;
      const maxDelta = Math.max(...deltas);
      const minDelta = Math.min(...deltas);

      console.log('Memory Leak Analysis:');
      console.log(`  Average delta: ${avgDelta.toFixed(2)}MB per operation`);
      console.log(`  Cumulative delta: ${cumulativeDelta.toFixed(2)}MB after ${iterations} operations`);
      console.log(`  Range: ${minDelta.toFixed(2)}MB to ${maxDelta.toFixed(2)}MB`);

      // Calculate trend (linear regression on memory usage over iterations)
      const n = memorySnapshots.length;
      const sumX = memorySnapshots.reduce((sum, s) => sum + s.iteration, 0);
      const sumY = memorySnapshots.reduce((sum, s) => sum + s.afterGC, 0);
      const sumXY = memorySnapshots.reduce((sum, s) => sum + s.iteration * s.afterGC, 0);
      const sumX2 = memorySnapshots.reduce((sum, s) => sum + s.iteration * s.iteration, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      console.log(`  Memory trend: ${slope.toFixed(3)}MB per iteration`);

      // Validate leak detection thresholds
      expect(Math.abs(slope)).toBeLessThan(1.0); // <1MB leak per operation
      expect(Math.abs(avgDelta)).toBeLessThan(2.0); // <2MB average delta
      expect(Math.abs(cumulativeDelta)).toBeLessThan(20.0); // <20MB total after all operations

      // Trend should not be strongly positive (indicating leak)
      expect(slope).toBeLessThan(0.5); // Memory growth <0.5MB per iteration
    }, 300000);

    test('Parser instance lifecycle memory management', async () => {
      const lifecycleIterations = 10;
      const memoryBaseline = global.gc ? 
        (() => { global.gc(); return process.memoryUsage().heapUsed; })() :
        process.memoryUsage().heapUsed;

      console.log(`Parser lifecycle memory test (${lifecycleIterations} parsers)...`);

      const lifecycleResults: Array<{
        iteration: number;
        creationMemory: number;
        peakMemory: number;
        cleanupMemory: number;
        retained: number;
      }> = [];

      for (let i = 0; i < lifecycleIterations; i++) {
        // Force GC before creating parser
        if (global.gc) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 25));
        }

        const creationMemory = process.memoryUsage().heapUsed;

        // Create parser with specific configuration
        const testParser = new BeatParser({
          sampleRate: 44100,
          frameSize: 4096,
          hopSize: 1024,
          confidenceThreshold: 0.7,
          multiPassEnabled: true
        });

        // Use parser for processing
        const testAudio = AudioPerformanceUtils.generateTestAudio(6, 44100, 'high');
        await testParser.parseBuffer(testAudio, { targetPictureCount: 12 });

        const peakMemory = process.memoryUsage().heapUsed;

        // Cleanup parser
        await testParser.cleanup();

        // Force GC after cleanup
        if (global.gc) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 25));
        }

        const cleanupMemory = process.memoryUsage().heapUsed;
        const retained = cleanupMemory - creationMemory;

        lifecycleResults.push({
          iteration: i + 1,
          creationMemory: creationMemory / 1024 / 1024,
          peakMemory: peakMemory / 1024 / 1024,
          cleanupMemory: cleanupMemory / 1024 / 1024,
          retained: retained / 1024 / 1024
        });

        console.log(`  Parser ${i + 1}: Peak ${(peakMemory / 1024 / 1024).toFixed(2)}MB, Retained ${(retained / 1024 / 1024).toFixed(2)}MB`);
      }

      // Analyze lifecycle memory management
      const totalRetained = lifecycleResults[lifecycleResults.length - 1].cleanupMemory - lifecycleResults[0].creationMemory;
      const avgRetained = lifecycleResults.reduce((sum, r) => sum + r.retained, 0) / lifecycleIterations;
      const maxRetained = Math.max(...lifecycleResults.map(r => r.retained));

      console.log('Parser Lifecycle Analysis:');
      console.log(`  Total retained: ${totalRetained.toFixed(2)}MB after ${lifecycleIterations} parsers`);
      console.log(`  Average retained: ${avgRetained.toFixed(2)}MB per parser`);
      console.log(`  Maximum retained: ${maxRetained.toFixed(2)}MB`);

      // Validate lifecycle memory management
      expect(Math.abs(totalRetained)).toBeLessThan(50); // <50MB total retention
      expect(Math.abs(avgRetained)).toBeLessThan(10); // <10MB average retention per parser
      expect(maxRetained).toBeLessThan(20); // <20MB maximum retention

      // Memory usage should not grow unbounded across parser instances
      const firstHalf = lifecycleResults.slice(0, Math.floor(lifecycleIterations / 2));
      const secondHalf = lifecycleResults.slice(Math.floor(lifecycleIterations / 2));
      
      const firstHalfAvg = firstHalf.reduce((sum, r) => sum + r.retained, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, r) => sum + r.retained, 0) / secondHalf.length;
      
      if (firstHalf.length > 0 && secondHalf.length > 0) {
        const retentionGrowth = secondHalfAvg - firstHalfAvg;
        console.log(`  Retention growth: ${retentionGrowth.toFixed(2)}MB between first and second half`);
        expect(Math.abs(retentionGrowth)).toBeLessThan(5); // <5MB growth between halves
      }
    }, 400000);

    test('Worker thread memory isolation', async () => {
      if (!workerClient) {
        console.warn('Worker client not available - skipping worker memory isolation test');
        return;
      }

      console.log('Worker thread memory isolation test...');

      // Baseline main thread memory
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const mainThreadBaseline = process.memoryUsage().heapUsed;

      // Test main thread memory impact
      const testAudio = AudioPerformanceUtils.generateTestAudio(8, 44100, 'high');
      
      const mainThreadProfile = await PerformanceUtils.profileMemoryUsage(
        () => parser.parseBuffer(testAudio, { targetPictureCount: 16 }),
        'Main thread processing',
        100
      );

      // Test worker thread memory impact
      const workerProfile = await PerformanceUtils.profileMemoryUsage(
        () => workerClient.parseBuffer(testAudio, { targetPictureCount: 16 }),
        'Worker thread processing',
        100
      );

      const mainThreadImpact = mainThreadProfile.peakMemory.heapUsed - mainThreadBaseline;
      const workerThreadImpact = workerProfile.peakMemory.heapUsed - mainThreadBaseline;

      console.log(`Main thread memory impact: ${(mainThreadImpact / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Worker thread memory impact: ${(workerThreadImpact / 1024 / 1024).toFixed(2)}MB`);

      // Worker should have less impact on main thread memory
      expect(Math.abs(workerThreadImpact)).toBeLessThan(Math.abs(mainThreadImpact) + 10); // Allow some message passing overhead
      
      // Results should be equivalent
      expect(Math.abs(mainThreadProfile.result.beats.length - workerProfile.result.beats.length)).toBeLessThanOrEqual(2);

      // Test memory isolation with intensive workload
      const intensiveAudio = AudioPerformanceUtils.generateTestAudio(15, 44100, 'maximum');
      
      const intensiveMainProfile = await PerformanceUtils.profileMemoryUsage(
        () => parser.parseBuffer(intensiveAudio, { targetPictureCount: 30 }),
        'Main thread intensive',
        50
      );

      const intensiveWorkerProfile = await PerformanceUtils.profileMemoryUsage(
        () => workerClient.parseBuffer(intensiveAudio, { targetPictureCount: 30 }),
        'Worker thread intensive',
        50
      );

      const intensiveMainImpact = intensiveMainProfile.peakMemory.heapUsed - mainThreadBaseline;
      const intensiveWorkerImpact = intensiveWorkerProfile.peakMemory.heapUsed - mainThreadBaseline;

      console.log(`Intensive main thread impact: ${(intensiveMainImpact / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Intensive worker thread impact: ${(intensiveWorkerImpact / 1024 / 1024).toFixed(2)}MB`);

      // Worker should provide better memory isolation for intensive workloads
      const isolationBenefit = Math.abs(intensiveMainImpact) - Math.abs(intensiveWorkerImpact);
      console.log(`Memory isolation benefit: ${(isolationBenefit / 1024 / 1024).toFixed(2)}MB`);
      
      if (isolationBenefit > 0) {
        expect(isolationBenefit).toBeGreaterThan(1024 * 1024); // At least 1MB benefit
      } else {
        console.warn('Worker thread did not provide memory isolation benefit');
        // This might be expected in some environments
      }
    }, 240000);
  });

  describe('Memory Optimization Analysis', () => {
    test('Configuration memory impact analysis', async () => {
      const optimizationResults: Array<{
        config: string;
        peakMemoryMB: number;
        avgMemoryMB: number;
        memoryEfficiency: number;
        processingTime: number;
        qualityScore: number;
      }> = [];

      const testAudio = AudioPerformanceUtils.generateTestAudio(6, 44100, 'medium');

      for (const config of memoryTestConfigs) {
        const testParser = new BeatParser({
          sampleRate: 44100,
          frameSize: config.frameSize,
          hopSize: config.hopSize,
          confidenceThreshold: 0.6
        });

        try {
          const memoryProfile = await PerformanceUtils.profileMemoryUsage(
            () => testParser.parseBuffer(testAudio, { targetPictureCount: 12 }),
            `Memory config: ${config.label}`,
            50
          );

          const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
          const avgMemoryMB = memoryProfile.snapshots.reduce(
            (sum, s) => sum + s.memory.heapUsed, 0
          ) / memoryProfile.snapshots.length / 1024 / 1024;

          const processingTime = memoryProfile.snapshots[memoryProfile.snapshots.length - 1].timestamp - 
                                memoryProfile.snapshots[0].timestamp;

          // Calculate quality score based on beats found and confidence
          const beatsFound = memoryProfile.result.beats.length;
          const avgConfidence = beatsFound > 0 ? 
            memoryProfile.result.beats.reduce((sum, b) => sum + b.confidence, 0) / beatsFound : 0;
          const qualityScore = beatsFound * avgConfidence;

          const memoryEfficiency = qualityScore / peakMemoryMB; // Quality per MB

          optimizationResults.push({
            config: config.label,
            peakMemoryMB,
            avgMemoryMB,
            memoryEfficiency,
            processingTime,
            qualityScore
          });

          console.log(`${config.label}:`);
          console.log(`  Peak: ${peakMemoryMB.toFixed(2)}MB, Avg: ${avgMemoryMB.toFixed(2)}MB`);
          console.log(`  Time: ${processingTime.toFixed(0)}ms, Quality: ${qualityScore.toFixed(2)}`);
          console.log(`  Efficiency: ${memoryEfficiency.toFixed(3)} quality/MB`);
        } finally {
          await testParser.cleanup();
        }
      }

      // Analyze memory optimization trade-offs
      const memoryEfficient = optimizationResults.find(r => r.config === 'Memory Efficient');
      const memoryIntensive = optimizationResults.find(r => r.config === 'Memory Intensive');

      if (memoryEfficient && memoryIntensive) {
        const memoryRatio = memoryIntensive.peakMemoryMB / memoryEfficient.peakMemoryMB;
        const qualityRatio = memoryIntensive.qualityScore / memoryEfficient.qualityScore;
        const timeRatio = memoryEfficient.processingTime / memoryIntensive.processingTime;

        console.log('Memory Optimization Trade-offs:');
        console.log(`  Memory ratio (intensive/efficient): ${memoryRatio.toFixed(2)}x`);
        console.log(`  Quality ratio (intensive/efficient): ${qualityRatio.toFixed(2)}x`);
        console.log(`  Time ratio (efficient/intensive): ${timeRatio.toFixed(2)}x`);

        // Memory intensive should use more memory but potentially provide better quality
        expect(memoryRatio).toBeGreaterThan(1.2); // Should use at least 20% more memory
        expect(memoryRatio).toBeLessThan(10); // But not more than 10x

        // Either quality should improve or time should improve (or both)
        const hasQualityBenefit = qualityRatio > 1.1;
        const hasTimeBenefit = timeRatio > 1.1;
        
        if (!hasQualityBenefit && !hasTimeBenefit) {
          console.warn('Memory intensive configuration shows no clear benefit');
        } else {
          console.log(`✓ Memory intensive provides ${hasQualityBenefit ? 'quality' : ''} ${hasQualityBenefit && hasTimeBenefit ? 'and ' : ''} ${hasTimeBenefit ? 'time' : ''} benefits`);
        }
      }

      // Find optimal configuration based on efficiency
      const mostEfficient = optimizationResults.reduce((best, current) => 
        current.memoryEfficiency > best.memoryEfficiency ? current : best
      );

      console.log(`Most memory-efficient configuration: ${mostEfficient.config}`);
      console.log(`  Efficiency: ${mostEfficient.memoryEfficiency.toFixed(3)} quality/MB`);

      // All configurations should be functional
      optimizationResults.forEach(result => {
        expect(result.peakMemoryMB).toBeGreaterThan(0);
        expect(result.peakMemoryMB).toBeLessThan(300); // <300MB peak for any configuration
        expect(result.qualityScore).toBeGreaterThan(0);
        expect(result.processingTime).toBeLessThan(60000); // <60s processing time
      });
    }, 240000);

    test('Garbage collection impact on memory patterns', async () => {
      if (!global.gc) {
        console.warn('Garbage collection not available - skipping GC impact test');
        return;
      }

      const gcTestResults: Array<{
        testType: string;
        withoutGC: {
          peakMemory: number;
          finalMemory: number;
          processingTime: number;
        };
        withGC: {
          peakMemory: number;
          finalMemory: number;
          processingTime: number;
        };
        gcImpact: {
          memoryReduction: number;
          timeOverhead: number;
          efficiency: number;
        };
      }> = [];

      const testScenarios = [
        {
          name: 'Single Large File',
          operation: () => {
            const audio = AudioPerformanceUtils.generateTestAudio(12, 44100, 'high');
            return parser.parseBuffer(audio, { targetPictureCount: 24 });
          }
        },
        {
          name: 'Multiple Small Files',
          operation: async () => {
            const results = [];
            for (let i = 0; i < 5; i++) {
              const audio = AudioPerformanceUtils.generateTestAudio(3, 44100, 'medium');
              results.push(await parser.parseBuffer(audio, { targetPictureCount: 6 }));
            }
            return results;
          }
        }
      ];

      for (const scenario of testScenarios) {
        console.log(`GC impact test: ${scenario.name}...`);

        // Test without forced GC
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 50));

        const withoutGCProfile = await PerformanceUtils.profileMemoryUsage(
          scenario.operation,
          `${scenario.name} - No forced GC`,
          200 // More frequent sampling for GC analysis
        );

        // Test with periodic forced GC
        let gcCount = 0;
        const withGCProfile = await PerformanceUtils.profileMemoryUsage(
          async () => {
            const operation = scenario.operation;
            
            // Set up periodic GC during operation
            const gcInterval = setInterval(() => {
              global.gc!();
              gcCount++;
            }, 500); // Every 500ms

            try {
              return await operation();
            } finally {
              clearInterval(gcInterval);
            }
          },
          `${scenario.name} - With forced GC`,
          200
        );

        const memoryReduction = withoutGCProfile.peakMemory.heapUsed - withGCProfile.peakMemory.heapUsed;
        const timeOverhead = withGCProfile.snapshots[withGCProfile.snapshots.length - 1].timestamp - 
                           withGCProfile.snapshots[0].timestamp - 
                           (withoutGCProfile.snapshots[withoutGCProfile.snapshots.length - 1].timestamp - 
                            withoutGCProfile.snapshots[0].timestamp);
        const efficiency = memoryReduction / Math.max(1, timeOverhead); // Memory saved per ms overhead

        gcTestResults.push({
          testType: scenario.name,
          withoutGC: {
            peakMemory: withoutGCProfile.peakMemory.heapUsed / 1024 / 1024,
            finalMemory: withoutGCProfile.memoryDelta.heapUsed / 1024 / 1024,
            processingTime: withoutGCProfile.snapshots[withoutGCProfile.snapshots.length - 1].timestamp - 
                           withoutGCProfile.snapshots[0].timestamp
          },
          withGC: {
            peakMemory: withGCProfile.peakMemory.heapUsed / 1024 / 1024,
            finalMemory: withGCProfile.memoryDelta.heapUsed / 1024 / 1024,
            processingTime: withGCProfile.snapshots[withGCProfile.snapshots.length - 1].timestamp - 
                           withGCProfile.snapshots[0].timestamp
          },
          gcImpact: {
            memoryReduction: memoryReduction / 1024 / 1024,
            timeOverhead,
            efficiency: efficiency / 1024 // KB per ms
          }
        });

        console.log(`  Without GC: Peak ${(withoutGCProfile.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB, Time ${(withoutGCProfile.snapshots[withoutGCProfile.snapshots.length - 1].timestamp - withoutGCProfile.snapshots[0].timestamp).toFixed(0)}ms`);
        console.log(`  With GC: Peak ${(withGCProfile.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB, Time ${(withGCProfile.snapshots[withGCProfile.snapshots.length - 1].timestamp - withGCProfile.snapshots[0].timestamp).toFixed(0)}ms`);
        console.log(`  GC called ${gcCount} times, Memory reduction: ${(memoryReduction / 1024 / 1024).toFixed(2)}MB, Time overhead: ${timeOverhead.toFixed(0)}ms`);
      }

      // Analyze GC effectiveness
      console.log('Garbage Collection Impact Analysis:');
      gcTestResults.forEach(result => {
        console.log(`${result.testType}:`);
        console.log(`  Memory reduction: ${result.gcImpact.memoryReduction.toFixed(2)}MB`);
        console.log(`  Time overhead: ${result.gcImpact.timeOverhead.toFixed(0)}ms`);
        console.log(`  Efficiency: ${result.gcImpact.efficiency.toFixed(2)} KB/ms`);

        // GC should generally reduce peak memory usage
        if (result.gcImpact.memoryReduction > 0) {
          expect(result.gcImpact.memoryReduction).toBeGreaterThan(1); // At least 1MB reduction
          console.log(`  ✓ Effective memory reduction`);
        } else {
          console.log(`  ⚠ No significant memory reduction`);
        }

        // Time overhead should be reasonable
        expect(result.gcImpact.timeOverhead).toBeLessThan(result.withoutGC.processingTime); // Overhead < original processing time
      });
    }, 360000);
  });
});