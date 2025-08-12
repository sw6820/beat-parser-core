/**
 * Concurrency Test Framework
 * Advanced testing infrastructure for Web Worker concurrency and thread safety validation
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseResult } from '../types';
import type { ConcurrencyTestResult, ThreadSafetyViolation } from './worker-testing-utils';

export interface ConcurrencyTestConfig {
  concurrencyLevel: number;
  operationsPerThread: number;
  testDurationMs: number;
  stressMode: boolean;
  resourceContention: boolean;
  timeoutVariation: boolean;
  errorInjection: {
    enabled: boolean;
    rate: number;
    types: ('timeout' | 'error' | 'cancel')[];
  };
}

export interface ThreadSafetyTest {
  name: string;
  description: string;
  execute: (config: ConcurrencyTestConfig) => Promise<ThreadSafetyTestResult>;
}

export interface ThreadSafetyTestResult {
  testName: string;
  success: boolean;
  violations: ThreadSafetyViolation[];
  metrics: ConcurrencyMetrics;
  recommendations: string[];
}

export interface ConcurrencyMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  throughput: number;
  resourceUtilization: ResourceUtilization;
  concurrencyEfficiency: number;
  scalabilityFactor: number;
}

export interface ResourceUtilization {
  averageWorkerCount: number;
  maxWorkerCount: number;
  memoryPeak: number;
  memoryAverage: number;
  cpuUtilization: number;
}

export interface DeadlockDetectionResult {
  detected: boolean;
  suspiciousOperations: string[];
  waitingChains: WaitingChain[];
  resolutionSuggestions: string[];
}

export interface WaitingChain {
  operationId: string;
  waitingFor: string[];
  waitTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface RaceConditionTest {
  name: string;
  sharedResource: string;
  accessPattern: 'read-read' | 'read-write' | 'write-write';
  expectedBehavior: string;
  violationDetector: (results: ConcurrencyTestResult[]) => ThreadSafetyViolation[];
}

export class ConcurrencyTestFramework {
  private activeWorkers = new Map<string, BeatParserWorkerClient>();
  private operationTracker = new Map<string, ConcurrencyTestResult>();
  private resourceMonitor: NodeJS.Timeout | null = null;
  private resourceSnapshots: Array<{ timestamp: number; memory: NodeJS.MemoryUsage }> = [];

  /**
   * Execute comprehensive concurrency test suite
   */
  async executeConcurrencyTestSuite(
    configs: ConcurrencyTestConfig[]
  ): Promise<{
    results: ThreadSafetyTestResult[];
    overallAssessment: {
      threadSafety: 'safe' | 'warnings' | 'unsafe';
      recommendations: string[];
      criticalIssues: ThreadSafetyViolation[];
    };
  }> {
    console.log('🔄 Starting comprehensive concurrency test suite...');

    const testSuite: ThreadSafetyTest[] = [
      this.createBasicConcurrencyTest(),
      this.createResourceContentionTest(),
      this.createDeadlockDetectionTest(),
      this.createRaceConditionTest(),
      this.createStressTest(),
      this.createScalabilityTest()
    ];

    const results: ThreadSafetyTestResult[] = [];
    const allViolations: ThreadSafetyViolation[] = [];

    for (const config of configs) {
      console.log(`📊 Testing concurrency level: ${config.concurrencyLevel}`);
      
      for (const test of testSuite) {
        try {
          const result = await test.execute(config);
          results.push(result);
          allViolations.push(...result.violations);
          
          console.log(`   ${test.name}: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
          if (result.violations.length > 0) {
            console.log(`      Violations: ${result.violations.length}`);
          }
        } catch (error) {
          console.error(`   ${test.name}: ERROR - ${error}`);
          results.push({
            testName: test.name,
            success: false,
            violations: [{
              type: 'state-corruption',
              description: `Test execution failed: ${error}`,
              timestamp: performance.now(),
              severity: 'critical'
            }],
            metrics: this.createEmptyMetrics(),
            recommendations: ['Fix test execution error before proceeding']
          });
        }
      }
    }

    // Analyze overall assessment
    const criticalIssues = allViolations.filter(v => v.severity === 'critical');
    const highSeverityIssues = allViolations.filter(v => v.severity === 'high');
    
    let threadSafety: 'safe' | 'warnings' | 'unsafe';
    if (criticalIssues.length > 0) {
      threadSafety = 'unsafe';
    } else if (highSeverityIssues.length > 0 || allViolations.length > 5) {
      threadSafety = 'warnings';
    } else {
      threadSafety = 'safe';
    }

    const recommendations = this.generateOverallRecommendations(results, allViolations);

    console.log('✅ Concurrency test suite completed');
    console.log(`   Thread safety assessment: ${threadSafety.toUpperCase()}`);
    console.log(`   Total violations: ${allViolations.length}`);
    console.log(`   Critical issues: ${criticalIssues.length}`);

    return {
      results,
      overallAssessment: {
        threadSafety,
        recommendations,
        criticalIssues
      }
    };
  }

  /**
   * Test basic concurrent operations without resource contention
   */
  private createBasicConcurrencyTest(): ThreadSafetyTest {
    return {
      name: 'Basic Concurrency Test',
      description: 'Test concurrent operations with independent resources',
      execute: async (config: ConcurrencyTestConfig): Promise<ThreadSafetyTestResult> => {
        const startTime = performance.now();
        this.startResourceMonitoring();

        const operations: Promise<ConcurrencyTestResult>[] = [];
        
        // Create concurrent operations
        for (let i = 0; i < config.concurrencyLevel; i++) {
          const workerId = `worker-${i}`;
          const worker = new BeatParserWorkerClient();
          this.activeWorkers.set(workerId, worker);

          for (let j = 0; j < config.operationsPerThread; j++) {
            const operationId = `${workerId}-op-${j}`;
            operations.push(this.executeWorkerOperation(
              workerId,
              operationId,
              this.generateTestAudio(1000 + j * 100)
            ));
          }
        }

        // Execute all operations concurrently
        const results = await Promise.allSettled(operations);
        
        const endTime = performance.now();
        this.stopResourceMonitoring();

        // Analyze results for thread safety violations
        const successfulResults = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<ConcurrencyTestResult>).value);

        const violations = this.analyzeBasicConcurrencyViolations(successfulResults);
        const metrics = this.calculateConcurrencyMetrics(successfulResults, endTime - startTime);

        // Cleanup workers
        await this.cleanupWorkers();

        return {
          testName: 'Basic Concurrency Test',
          success: violations.length === 0,
          violations,
          metrics,
          recommendations: this.generateBasicConcurrencyRecommendations(violations, metrics)
        };
      }
    };
  }

  /**
   * Test resource contention scenarios
   */
  private createResourceContentionTest(): ThreadSafetyTest {
    return {
      name: 'Resource Contention Test',
      description: 'Test concurrent operations with shared resource access',
      execute: async (config: ConcurrencyTestConfig): Promise<ThreadSafetyTestResult> => {
        const startTime = performance.now();
        this.startResourceMonitoring();

        // Use single large audio buffer to create resource contention
        const sharedAudioBuffer = this.generateTestAudio(100000); // Large buffer
        const operations: Promise<ConcurrencyTestResult>[] = [];

        // Create multiple workers trying to process the same large buffer
        for (let i = 0; i < config.concurrencyLevel; i++) {
          const workerId = `contention-worker-${i}`;
          const worker = new BeatParserWorkerClient();
          this.activeWorkers.set(workerId, worker);

          for (let j = 0; j < config.operationsPerThread; j++) {
            const operationId = `${workerId}-contention-${j}`;
            operations.push(this.executeWorkerOperation(
              workerId,
              operationId,
              sharedAudioBuffer,
              { 
                filename: `contention-test-${i}-${j}`,
                targetPictureCount: 10
              }
            ));
          }
        }

        const results = await Promise.allSettled(operations);
        const endTime = performance.now();
        this.stopResourceMonitoring();

        const successfulResults = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<ConcurrencyTestResult>).value);

        const violations = this.analyzeResourceContentionViolations(successfulResults);
        const metrics = this.calculateConcurrencyMetrics(successfulResults, endTime - startTime);

        await this.cleanupWorkers();

        return {
          testName: 'Resource Contention Test',
          success: violations.length === 0,
          violations,
          metrics,
          recommendations: this.generateResourceContentionRecommendations(violations, metrics)
        };
      }
    };
  }

  /**
   * Test for potential deadlock situations
   */
  private createDeadlockDetectionTest(): ThreadSafetyTest {
    return {
      name: 'Deadlock Detection Test',
      description: 'Test for potential deadlock scenarios in worker coordination',
      execute: async (config: ConcurrencyTestConfig): Promise<ThreadSafetyTestResult> => {
        const startTime = performance.now();
        const operations: Promise<ConcurrencyTestResult>[] = [];
        
        // Create operations with interdependencies that could lead to deadlock
        const circularOps = Math.min(config.concurrencyLevel, 4);
        
        for (let i = 0; i < circularOps; i++) {
          const workerId = `deadlock-worker-${i}`;
          const worker = new BeatParserWorkerClient({
            timeout: 5000 // Shorter timeout to detect hangs
          });
          this.activeWorkers.set(workerId, worker);

          // Create operations that might wait on each other
          const operationId = `${workerId}-deadlock-test`;
          operations.push(this.executeDeadlockProneOperation(
            workerId,
            operationId,
            i,
            circularOps
          ));
        }

        // Monitor for deadlocks during execution
        const deadlockDetector = this.startDeadlockDetection(operations);
        
        const results = await Promise.allSettled(operations);
        const deadlockResult = await deadlockDetector;
        
        const endTime = performance.now();

        const successfulResults = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<ConcurrencyTestResult>).value);

        const violations = this.analyzeDeadlockViolations(successfulResults, deadlockResult);
        const metrics = this.calculateConcurrencyMetrics(successfulResults, endTime - startTime);

        await this.cleanupWorkers();

        return {
          testName: 'Deadlock Detection Test',
          success: violations.length === 0,
          violations,
          metrics,
          recommendations: this.generateDeadlockRecommendations(violations, deadlockResult)
        };
      }
    };
  }

  /**
   * Test for race condition detection
   */
  private createRaceConditionTest(): ThreadSafetyTest {
    return {
      name: 'Race Condition Test',
      description: 'Test for race conditions in shared state access',
      execute: async (config: ConcurrencyTestConfig): Promise<ThreadSafetyTestResult> => {
        const startTime = performance.now();
        this.startResourceMonitoring();

        // Create race condition scenario with rapid concurrent operations
        const raceOperations: Promise<ConcurrencyTestResult>[] = [];
        
        for (let i = 0; i < config.concurrencyLevel; i++) {
          const workerId = `race-worker-${i}`;
          const worker = new BeatParserWorkerClient();
          this.activeWorkers.set(workerId, worker);

          // Launch multiple operations simultaneously to create race conditions
          for (let j = 0; j < config.operationsPerThread; j++) {
            const operationId = `race-${i}-${j}`;
            raceOperations.push(this.executeRaceConditionTest(
              workerId,
              operationId,
              j
            ));
          }
        }

        const results = await Promise.allSettled(raceOperations);
        const endTime = performance.now();
        this.stopResourceMonitoring();

        const successfulResults = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<ConcurrencyTestResult>).value);

        const violations = this.analyzeRaceConditionViolations(successfulResults);
        const metrics = this.calculateConcurrencyMetrics(successfulResults, endTime - startTime);

        await this.cleanupWorkers();

        return {
          testName: 'Race Condition Test',
          success: violations.length === 0,
          violations,
          metrics,
          recommendations: this.generateRaceConditionRecommendations(violations, metrics)
        };
      }
    };
  }

  /**
   * Stress test with high load and resource pressure
   */
  private createStressTest(): ThreadSafetyTest {
    return {
      name: 'Concurrency Stress Test',
      description: 'High-load stress testing of concurrent worker operations',
      execute: async (config: ConcurrencyTestConfig): Promise<ThreadSafetyTestResult> => {
        const stressConfig = {
          ...config,
          concurrencyLevel: Math.max(config.concurrencyLevel * 2, 10),
          operationsPerThread: Math.max(config.operationsPerThread * 3, 20)
        };

        const startTime = performance.now();
        this.startResourceMonitoring();

        const stressOperations: Promise<ConcurrencyTestResult>[] = [];

        for (let i = 0; i < stressConfig.concurrencyLevel; i++) {
          const workerId = `stress-worker-${i}`;
          const worker = new BeatParserWorkerClient();
          this.activeWorkers.set(workerId, worker);

          for (let j = 0; j < stressConfig.operationsPerThread; j++) {
            const operationId = `stress-${i}-${j}`;
            stressOperations.push(this.executeStressOperation(
              workerId,
              operationId,
              i,
              j
            ));
          }
        }

        const results = await Promise.allSettled(stressOperations);
        const endTime = performance.now();
        this.stopResourceMonitoring();

        const successfulResults = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<ConcurrencyTestResult>).value);

        const violations = this.analyzeStressTestViolations(successfulResults);
        const metrics = this.calculateConcurrencyMetrics(successfulResults, endTime - startTime);

        await this.cleanupWorkers();

        return {
          testName: 'Concurrency Stress Test',
          success: violations.length === 0,
          violations,
          metrics,
          recommendations: this.generateStressTestRecommendations(violations, metrics)
        };
      }
    };
  }

  /**
   * Test scalability characteristics
   */
  private createScalabilityTest(): ThreadSafetyTest {
    return {
      name: 'Concurrency Scalability Test',
      description: 'Test how performance scales with increased concurrency',
      execute: async (config: ConcurrencyTestConfig): Promise<ThreadSafetyTestResult> => {
        const scalabilityResults: Array<{
          concurrency: number;
          metrics: ConcurrencyMetrics;
        }> = [];

        // Test with different concurrency levels
        const testLevels = [1, 2, 4, config.concurrencyLevel];
        
        for (const level of testLevels) {
          const levelConfig = { ...config, concurrencyLevel: level };
          const startTime = performance.now();
          
          const operations: Promise<ConcurrencyTestResult>[] = [];
          
          for (let i = 0; i < level; i++) {
            const workerId = `scale-worker-${i}`;
            const worker = new BeatParserWorkerClient();
            this.activeWorkers.set(workerId, worker);

            for (let j = 0; j < config.operationsPerThread; j++) {
              const operationId = `scale-${level}-${i}-${j}`;
              operations.push(this.executeWorkerOperation(
                workerId,
                operationId,
                this.generateTestAudio(5000)
              ));
            }
          }

          const results = await Promise.allSettled(operations);
          const endTime = performance.now();

          const successfulResults = results
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<ConcurrencyTestResult>).value);

          const metrics = this.calculateConcurrencyMetrics(successfulResults, endTime - startTime);
          scalabilityResults.push({ concurrency: level, metrics });

          await this.cleanupWorkers();
        }

        const violations = this.analyzeScalabilityViolations(scalabilityResults);
        const avgMetrics = this.averageMetrics(scalabilityResults.map(r => r.metrics));

        return {
          testName: 'Concurrency Scalability Test',
          success: violations.length === 0,
          violations,
          metrics: avgMetrics,
          recommendations: this.generateScalabilityRecommendations(violations, scalabilityResults)
        };
      }
    };
  }

  // Helper methods for executing various test operations
  private async executeWorkerOperation(
    workerId: string,
    operationId: string,
    audioData: Float32Array,
    options?: any
  ): Promise<ConcurrencyTestResult> {
    const startTime = performance.now();
    
    try {
      const worker = this.activeWorkers.get(workerId);
      if (!worker) throw new Error(`Worker ${workerId} not found`);

      const result = await worker.parseBuffer(audioData, options);
      const endTime = performance.now();

      const testResult: ConcurrencyTestResult = {
        operationId,
        startTime,
        endTime,
        duration: endTime - startTime,
        success: true,
        result,
        threadSafetyViolations: []
      };

      this.operationTracker.set(operationId, testResult);
      return testResult;
    } catch (error) {
      const endTime = performance.now();
      const testResult: ConcurrencyTestResult = {
        operationId,
        startTime,
        endTime,
        duration: endTime - startTime,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        threadSafetyViolations: []
      };

      this.operationTracker.set(operationId, testResult);
      return testResult;
    }
  }

  private async executeDeadlockProneOperation(
    workerId: string,
    operationId: string,
    index: number,
    total: number
  ): Promise<ConcurrencyTestResult> {
    const startTime = performance.now();
    
    // Create artificial dependency chain that could lead to deadlock
    const delay = (index * 100) % 500; // Staggered delays
    await new Promise(resolve => setTimeout(resolve, delay));

    return this.executeWorkerOperation(
      workerId,
      operationId,
      this.generateTestAudio(2000 + index * 500)
    );
  }

  private async executeRaceConditionTest(
    workerId: string,
    operationId: string,
    sequence: number
  ): Promise<ConcurrencyTestResult> {
    // Attempt to create race condition with rapid, simultaneous operations
    const audio = this.generateTestAudio(1000);
    
    return this.executeWorkerOperation(workerId, operationId, audio, {
      filename: `race-test-${sequence}`,
      targetPictureCount: sequence % 3 + 1
    });
  }

  private async executeStressOperation(
    workerId: string,
    operationId: string,
    workerIndex: number,
    opIndex: number
  ): Promise<ConcurrencyTestResult> {
    // Generate varying load to stress test the system
    const audioSize = 1000 + (workerIndex * opIndex) % 5000;
    const audio = this.generateTestAudio(audioSize);

    return this.executeWorkerOperation(workerId, operationId, audio, {
      filename: `stress-${workerIndex}-${opIndex}`,
      targetPictureCount: (opIndex % 5) + 1
    });
  }

  // Violation analysis methods
  private analyzeBasicConcurrencyViolations(results: ConcurrencyTestResult[]): ThreadSafetyViolation[] {
    const violations: ThreadSafetyViolation[] = [];
    
    // Check for overlapping operations that should be isolated
    const operationOverlaps = this.detectOperationOverlaps(results);
    operationOverlaps.forEach(overlap => {
      violations.push({
        type: 'race-condition',
        description: `Operations ${overlap.op1} and ${overlap.op2} may have interfered with each other`,
        timestamp: overlap.timestamp,
        severity: 'medium'
      });
    });

    return violations;
  }

  private analyzeResourceContentionViolations(results: ConcurrencyTestResult[]): ThreadSafetyViolation[] {
    const violations: ThreadSafetyViolation[] = [];
    
    // Analyze results for resource contention indicators
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));
    
    if (maxDuration > avgDuration * 3) {
      violations.push({
        type: 'resource-leak',
        description: 'Significant variation in processing times suggests resource contention',
        timestamp: performance.now(),
        severity: 'medium'
      });
    }

    return violations;
  }

  private analyzeDeadlockViolations(
    results: ConcurrencyTestResult[],
    deadlockResult: DeadlockDetectionResult
  ): ThreadSafetyViolation[] {
    const violations: ThreadSafetyViolation[] = [];
    
    if (deadlockResult.detected) {
      violations.push({
        type: 'deadlock',
        description: 'Potential deadlock detected in worker operations',
        timestamp: performance.now(),
        severity: 'critical'
      });
    }

    deadlockResult.suspiciousOperations.forEach(opId => {
      violations.push({
        type: 'deadlock',
        description: `Operation ${opId} showed suspicious waiting patterns`,
        timestamp: performance.now(),
        severity: 'high'
      });
    });

    return violations;
  }

  private analyzeRaceConditionViolations(results: ConcurrencyTestResult[]): ThreadSafetyViolation[] {
    const violations: ThreadSafetyViolation[] = [];
    
    // Look for inconsistent results that might indicate race conditions
    if (results.length > 1) {
      const successfulResults = results.filter(r => r.success && r.result);
      const resultHashes = new Set();
      const duplicateResults = new Set();

      successfulResults.forEach(result => {
        if (result.result) {
          const hash = this.hashResult(result.result as ParseResult);
          if (resultHashes.has(hash)) {
            duplicateResults.add(hash);
          } else {
            resultHashes.add(hash);
          }
        }
      });

      if (duplicateResults.size > successfulResults.length / 3) {
        violations.push({
          type: 'race-condition',
          description: 'Suspicious result patterns suggest possible race conditions',
          timestamp: performance.now(),
          severity: 'medium'
        });
      }
    }

    return violations;
  }

  private analyzeStressTestViolations(results: ConcurrencyTestResult[]): ThreadSafetyViolation[] {
    const violations: ThreadSafetyViolation[] = [];
    
    const failureRate = results.filter(r => !r.success).length / results.length;
    if (failureRate > 0.1) {
      violations.push({
        type: 'resource-leak',
        description: `High failure rate (${(failureRate * 100).toFixed(1)}%) under stress conditions`,
        timestamp: performance.now(),
        severity: 'high'
      });
    }

    return violations;
  }

  private analyzeScalabilityViolations(results: Array<{
    concurrency: number;
    metrics: ConcurrencyMetrics;
  }>): ThreadSafetyViolation[] {
    const violations: ThreadSafetyViolation[] = [];
    
    // Check if performance degrades significantly with increased concurrency
    if (results.length > 1) {
      const throughputTrend = results.map(r => r.metrics.throughput);
      const isDecreasing = throughputTrend.every((val, i) => 
        i === 0 || val < throughputTrend[i - 1] * 0.8
      );

      if (isDecreasing) {
        violations.push({
          type: 'resource-leak',
          description: 'Throughput decreases significantly with increased concurrency',
          timestamp: performance.now(),
          severity: 'medium'
        });
      }
    }

    return violations;
  }

  // Helper methods
  private generateTestAudio(samples: number): Float32Array {
    const audio = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      audio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
    }
    return audio;
  }

  private detectOperationOverlaps(results: ConcurrencyTestResult[]): Array<{
    op1: string;
    op2: string;
    timestamp: number;
  }> {
    const overlaps: Array<{ op1: string; op2: string; timestamp: number }> = [];
    
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const r1 = results[i];
        const r2 = results[j];
        
        // Check if operations overlapped in time
        if (r1.startTime < r2.endTime && r2.startTime < r1.endTime) {
          overlaps.push({
            op1: r1.operationId,
            op2: r2.operationId,
            timestamp: Math.max(r1.startTime, r2.startTime)
          });
        }
      }
    }
    
    return overlaps;
  }

  private async startDeadlockDetection(
    operations: Promise<ConcurrencyTestResult>[]
  ): Promise<DeadlockDetectionResult> {
    const suspiciousOperations: string[] = [];
    const waitingChains: WaitingChain[] = [];
    
    // Monitor operation completion patterns
    const timeout = setTimeout(() => {
      // If we reach here, some operations may be stuck
    }, 10000);

    try {
      await Promise.race([
        Promise.all(operations),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Potential deadlock timeout')), 8000)
        )
      ]);
      clearTimeout(timeout);
      
      return {
        detected: false,
        suspiciousOperations,
        waitingChains,
        resolutionSuggestions: []
      };
    } catch (error) {
      clearTimeout(timeout);
      
      return {
        detected: true,
        suspiciousOperations: ['timeout-detected'],
        waitingChains: [],
        resolutionSuggestions: [
          'Implement operation timeouts',
          'Add deadlock detection mechanisms',
          'Review worker coordination logic'
        ]
      };
    }
  }

  private hashResult(result: ParseResult): string {
    // Simple hash of result for detecting duplicates
    const beatsHash = result.beats.length.toString();
    const tempoHash = Math.round(result.tempo).toString();
    const confidenceHash = Math.round(result.confidence * 100).toString();
    
    return `${beatsHash}-${tempoHash}-${confidenceHash}`;
  }

  private calculateConcurrencyMetrics(
    results: ConcurrencyTestResult[],
    totalDuration: number
  ): ConcurrencyMetrics {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const latencies = successful.map(r => r.duration);
    const avgLatency = latencies.length > 0 ? 
      latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;
    
    const throughput = successful.length / (totalDuration / 1000);
    
    const resourceUtilization: ResourceUtilization = {
      averageWorkerCount: this.activeWorkers.size,
      maxWorkerCount: this.activeWorkers.size,
      memoryPeak: this.getMemoryPeak(),
      memoryAverage: this.getMemoryAverage(),
      cpuUtilization: 0 // Would need platform-specific implementation
    };

    return {
      totalOperations: results.length,
      successfulOperations: successful.length,
      failedOperations: failed.length,
      averageLatency: avgLatency,
      maxLatency: Math.max(...latencies, 0),
      minLatency: Math.min(...latencies, 0),
      throughput,
      resourceUtilization,
      concurrencyEfficiency: throughput / this.activeWorkers.size,
      scalabilityFactor: 1 // Would be calculated differently in full implementation
    };
  }

  private createEmptyMetrics(): ConcurrencyMetrics {
    return {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageLatency: 0,
      maxLatency: 0,
      minLatency: 0,
      throughput: 0,
      resourceUtilization: {
        averageWorkerCount: 0,
        maxWorkerCount: 0,
        memoryPeak: 0,
        memoryAverage: 0,
        cpuUtilization: 0
      },
      concurrencyEfficiency: 0,
      scalabilityFactor: 0
    };
  }

  private averageMetrics(metrics: ConcurrencyMetrics[]): ConcurrencyMetrics {
    if (metrics.length === 0) return this.createEmptyMetrics();
    
    const sum = metrics.reduce((acc, m) => ({
      totalOperations: acc.totalOperations + m.totalOperations,
      successfulOperations: acc.successfulOperations + m.successfulOperations,
      failedOperations: acc.failedOperations + m.failedOperations,
      averageLatency: acc.averageLatency + m.averageLatency,
      maxLatency: Math.max(acc.maxLatency, m.maxLatency),
      minLatency: Math.min(acc.minLatency, m.minLatency),
      throughput: acc.throughput + m.throughput,
      resourceUtilization: {
        averageWorkerCount: acc.resourceUtilization.averageWorkerCount + m.resourceUtilization.averageWorkerCount,
        maxWorkerCount: Math.max(acc.resourceUtilization.maxWorkerCount, m.resourceUtilization.maxWorkerCount),
        memoryPeak: Math.max(acc.resourceUtilization.memoryPeak, m.resourceUtilization.memoryPeak),
        memoryAverage: acc.resourceUtilization.memoryAverage + m.resourceUtilization.memoryAverage,
        cpuUtilization: acc.resourceUtilization.cpuUtilization + m.resourceUtilization.cpuUtilization
      },
      concurrencyEfficiency: acc.concurrencyEfficiency + m.concurrencyEfficiency,
      scalabilityFactor: acc.scalabilityFactor + m.scalabilityFactor
    }), this.createEmptyMetrics());

    const count = metrics.length;
    return {
      totalOperations: sum.totalOperations,
      successfulOperations: sum.successfulOperations,
      failedOperations: sum.failedOperations,
      averageLatency: sum.averageLatency / count,
      maxLatency: sum.maxLatency,
      minLatency: sum.minLatency,
      throughput: sum.throughput / count,
      resourceUtilization: {
        averageWorkerCount: sum.resourceUtilization.averageWorkerCount / count,
        maxWorkerCount: sum.resourceUtilization.maxWorkerCount,
        memoryPeak: sum.resourceUtilization.memoryPeak,
        memoryAverage: sum.resourceUtilization.memoryAverage / count,
        cpuUtilization: sum.resourceUtilization.cpuUtilization / count
      },
      concurrencyEfficiency: sum.concurrencyEfficiency / count,
      scalabilityFactor: sum.scalabilityFactor / count
    };
  }

  // Resource monitoring methods
  private startResourceMonitoring(): void {
    this.resourceSnapshots = [];
    this.resourceMonitor = setInterval(() => {
      this.resourceSnapshots.push({
        timestamp: performance.now(),
        memory: process.memoryUsage()
      });
    }, 100);
  }

  private stopResourceMonitoring(): void {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
      this.resourceMonitor = null;
    }
  }

  private getMemoryPeak(): number {
    return Math.max(...this.resourceSnapshots.map(s => s.memory.heapUsed), 0);
  }

  private getMemoryAverage(): number {
    if (this.resourceSnapshots.length === 0) return 0;
    const total = this.resourceSnapshots.reduce((sum, s) => sum + s.memory.heapUsed, 0);
    return total / this.resourceSnapshots.length;
  }

  private async cleanupWorkers(): Promise<void> {
    const cleanupPromises = Array.from(this.activeWorkers.values())
      .map(worker => worker.terminate());
    
    await Promise.allSettled(cleanupPromises);
    this.activeWorkers.clear();
    this.operationTracker.clear();
  }

  // Recommendation generation methods
  private generateOverallRecommendations(
    results: ThreadSafetyTestResult[],
    allViolations: ThreadSafetyViolation[]
  ): string[] {
    const recommendations: string[] = [];
    
    const criticalCount = allViolations.filter(v => v.severity === 'critical').length;
    const highCount = allViolations.filter(v => v.severity === 'high').length;
    
    if (criticalCount > 0) {
      recommendations.push('CRITICAL: Address critical thread safety violations immediately');
    }
    
    if (highCount > 0) {
      recommendations.push('HIGH PRIORITY: Review and fix high-severity concurrency issues');
    }
    
    if (allViolations.some(v => v.type === 'deadlock')) {
      recommendations.push('Implement proper deadlock prevention mechanisms');
    }
    
    if (allViolations.some(v => v.type === 'race-condition')) {
      recommendations.push('Add synchronization mechanisms to prevent race conditions');
    }
    
    if (allViolations.some(v => v.type === 'resource-leak')) {
      recommendations.push('Improve resource management and cleanup procedures');
    }
    
    return recommendations;
  }

  private generateBasicConcurrencyRecommendations(
    violations: ThreadSafetyViolation[],
    metrics: ConcurrencyMetrics
  ): string[] {
    const recommendations: string[] = [];
    
    if (metrics.concurrencyEfficiency < 0.8) {
      recommendations.push('Optimize worker efficiency - current efficiency below 80%');
    }
    
    if (violations.length > 0) {
      recommendations.push('Implement proper operation isolation mechanisms');
    }
    
    return recommendations;
  }

  private generateResourceContentionRecommendations(
    violations: ThreadSafetyViolation[],
    metrics: ConcurrencyMetrics
  ): string[] {
    const recommendations: string[] = [];
    
    if (violations.some(v => v.type === 'resource-leak')) {
      recommendations.push('Implement resource pooling to reduce contention');
      recommendations.push('Add resource usage monitoring and throttling');
    }
    
    return recommendations;
  }

  private generateDeadlockRecommendations(
    violations: ThreadSafetyViolation[],
    deadlockResult: DeadlockDetectionResult
  ): string[] {
    const recommendations: string[] = [...deadlockResult.resolutionSuggestions];
    
    if (violations.some(v => v.type === 'deadlock')) {
      recommendations.push('Implement operation timeouts');
      recommendations.push('Add deadlock detection and recovery mechanisms');
    }
    
    return recommendations;
  }

  private generateRaceConditionRecommendations(
    violations: ThreadSafetyViolation[],
    metrics: ConcurrencyMetrics
  ): string[] {
    const recommendations: string[] = [];
    
    if (violations.some(v => v.type === 'race-condition')) {
      recommendations.push('Implement proper synchronization primitives');
      recommendations.push('Use atomic operations where appropriate');
    }
    
    return recommendations;
  }

  private generateStressTestRecommendations(
    violations: ThreadSafetyViolation[],
    metrics: ConcurrencyMetrics
  ): string[] {
    const recommendations: string[] = [];
    
    if (metrics.failedOperations > metrics.totalOperations * 0.1) {
      recommendations.push('Improve error handling under high load conditions');
      recommendations.push('Implement graceful degradation mechanisms');
    }
    
    return recommendations;
  }

  private generateScalabilityRecommendations(
    violations: ThreadSafetyViolation[],
    results: Array<{ concurrency: number; metrics: ConcurrencyMetrics }>
  ): string[] {
    const recommendations: string[] = [];
    
    if (results.length > 1) {
      const throughputTrend = results.map(r => r.metrics.throughput);
      const maxThroughput = Math.max(...throughputTrend);
      const finalThroughput = throughputTrend[throughputTrend.length - 1];
      
      if (finalThroughput < maxThroughput * 0.7) {
        recommendations.push('Poor scaling characteristics - consider optimizing for higher concurrency');
        recommendations.push('Investigate resource bottlenecks at high concurrency levels');
      }
    }
    
    return recommendations;
  }
}