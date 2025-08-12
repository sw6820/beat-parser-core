/**
 * Error Simulation Utilities
 * 
 * Comprehensive utilities for simulating various error conditions, resource
 * exhaustion scenarios, failure injection, and recovery validation helpers
 * for error handling and recovery testing.
 */

import { BeatParser, BeatParserPlugin } from '../../core/BeatParser';
import type { ParseOptions, BeatCandidate } from '../../types';

export interface ErrorSimulationOptions {
  /** Failure rate (0-1) */
  failureRate?: number;
  /** Delay before failure (ms) */
  failureDelay?: number;
  /** Number of failures before success */
  failuresBeforeSuccess?: number;
  /** Whether to simulate transient vs permanent failures */
  transient?: boolean;
  /** Maximum recovery attempts */
  maxRecoveryAttempts?: number;
}

export interface ResourceExhaustionOptions {
  /** Memory threshold in bytes */
  memoryThreshold?: number;
  /** CPU time limit in ms */
  cpuTimeLimit?: number;
  /** File handle limit */
  fileHandleLimit?: number;
  /** Enable pressure relief mechanisms */
  enablePressureRelief?: boolean;
}

export interface FailureInjectionOptions {
  /** Components to target for failure injection */
  targetComponents?: ('audio-processing' | 'beat-detection' | 'tempo-tracking' | 'output-formatting')[];
  /** Failure patterns to simulate */
  failurePatterns?: ('random' | 'systematic' | 'cascading' | 'periodic')[];
  /** Recovery strategies to test */
  recoveryStrategies?: ('retry' | 'fallback' | 'graceful-degradation' | 'circuit-breaker')[];
}

/**
 * Error simulation utilities class
 */
export class ErrorSimulator {
  private static instance: ErrorSimulator | null = null;
  private failureCounters: Map<string, number> = new Map();
  private resourceTracking: Map<string, number> = new Map();
  
  static getInstance(): ErrorSimulator {
    if (!ErrorSimulator.instance) {
      ErrorSimulator.instance = new ErrorSimulator();
    }
    return ErrorSimulator.instance;
  }

  /**
   * Create a plugin that simulates various error conditions
   */
  createErrorSimulationPlugin(options: ErrorSimulationOptions = {}): BeatParserPlugin {
    const {
      failureRate = 0.3,
      failureDelay = 0,
      failuresBeforeSuccess = 2,
      transient = true,
      maxRecoveryAttempts = 3
    } = options;

    let attemptCount = 0;
    const pluginId = `error-sim-${Date.now()}-${Math.random()}`;

    return {
      name: 'error-simulator',
      version: '1.0.0',
      
      initialize: async () => {
        this.failureCounters.set(pluginId, 0);
      },

      processAudio: async (audioData) => {
        attemptCount++;
        const currentFailures = this.failureCounters.get(pluginId) || 0;

        // Simulate delay before potential failure
        if (failureDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, failureDelay));
        }

        // Determine if this attempt should fail
        const shouldFail = transient 
          ? currentFailures < failuresBeforeSuccess && Math.random() < failureRate
          : Math.random() < failureRate;

        if (shouldFail) {
          this.failureCounters.set(pluginId, currentFailures + 1);
          
          if (transient && currentFailures >= maxRecoveryAttempts) {
            throw new Error(`Maximum recovery attempts exceeded: ${currentFailures}`);
          }

          const errorMessages = [
            'Simulated processing failure',
            'Transient algorithm error',
            'Resource temporarily unavailable',
            'Processing timeout simulation',
            'Temporary system overload'
          ];

          const errorMessage = errorMessages[currentFailures % errorMessages.length];
          throw new Error(`${errorMessage} (attempt ${attemptCount}, failure ${currentFailures + 1})`);
        }

        // Success - reset failure counter for transient errors
        if (transient) {
          this.failureCounters.set(pluginId, 0);
        }

        return audioData;
      },

      cleanup: async () => {
        this.failureCounters.delete(pluginId);
      }
    };
  }

  /**
   * Create a plugin that simulates resource exhaustion
   */
  createResourceExhaustionPlugin(options: ResourceExhaustionOptions = {}): BeatParserPlugin {
    const {
      memoryThreshold = 100 * 1024 * 1024, // 100MB
      cpuTimeLimit = 5000, // 5 seconds
      fileHandleLimit = 10,
      enablePressureRelief = true
    } = options;

    let allocatedMemory = 0;
    let fileHandles = 0;
    const pluginId = `resource-exhaust-${Date.now()}`;

    return {
      name: 'resource-exhaustion-simulator',
      version: '1.0.0',

      initialize: async () => {
        this.resourceTracking.set(`${pluginId}-memory`, 0);
        this.resourceTracking.set(`${pluginId}-handles`, 0);
      },

      processAudio: async (audioData) => {
        const startTime = Date.now();
        const bufferSize = audioData.length * 4; // 4 bytes per float

        // Memory exhaustion simulation
        allocatedMemory += bufferSize;
        this.resourceTracking.set(`${pluginId}-memory`, allocatedMemory);

        if (allocatedMemory > memoryThreshold) {
          if (enablePressureRelief) {
            // Simulate memory pressure relief
            allocatedMemory = Math.floor(memoryThreshold * 0.7);
            console.warn(`Memory pressure relief activated: ${allocatedMemory} bytes`);
          } else {
            throw new Error(`Memory exhaustion: ${allocatedMemory} bytes > ${memoryThreshold} bytes limit`);
          }
        }

        // File handle exhaustion simulation
        fileHandles++;
        this.resourceTracking.set(`${pluginId}-handles`, fileHandles);

        if (fileHandles > fileHandleLimit) {
          throw new Error(`File handle exhaustion: ${fileHandles} handles > ${fileHandleLimit} limit`);
        }

        // CPU time exhaustion simulation
        const processingTime = Date.now() - startTime;
        if (processingTime > cpuTimeLimit) {
          throw new Error(`CPU time exhaustion: ${processingTime}ms > ${cpuTimeLimit}ms limit`);
        }

        // Simulate some processing work
        const result = new Float32Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          result[i] = audioData[i] * 0.95;
        }

        return result;
      },

      cleanup: async () => {
        // Cleanup resources
        allocatedMemory = 0;
        fileHandles = 0;
        this.resourceTracking.delete(`${pluginId}-memory`);
        this.resourceTracking.delete(`${pluginId}-handles`);
      }
    };
  }

  /**
   * Create a plugin for failure injection testing
   */
  createFailureInjectionPlugin(options: FailureInjectionOptions = {}): BeatParserPlugin {
    const {
      targetComponents = ['audio-processing', 'beat-detection'],
      failurePatterns = ['random'],
      recoveryStrategies = ['retry']
    } = options;

    let operationCount = 0;
    let failureHistory: Array<{ component: string; pattern: string; timestamp: number }> = [];

    return {
      name: 'failure-injection',
      version: '1.0.0',

      processAudio: async (audioData) => {
        operationCount++;
        
        for (const component of targetComponents) {
          for (const pattern of failurePatterns) {
            if (this.shouldInjectFailure(component, pattern, operationCount)) {
              const failureRecord = {
                component,
                pattern,
                timestamp: Date.now()
              };
              failureHistory.push(failureRecord);

              // Apply recovery strategy
              const recovery = recoveryStrategies[0]; // Use first strategy for simplicity
              const errorMessage = this.generateFailureMessage(component, pattern, recovery);
              
              throw new Error(errorMessage);
            }
          }
        }

        return audioData;
      },

      getFailureHistory: () => [...failureHistory], // Expose for testing

      cleanup: async () => {
        failureHistory = [];
        operationCount = 0;
      }
    } as any;
  }

  /**
   * Determine if failure should be injected based on pattern
   */
  private shouldInjectFailure(component: string, pattern: string, operationCount: number): boolean {
    switch (pattern) {
      case 'random':
        return Math.random() < 0.2; // 20% failure rate

      case 'systematic':
        return operationCount % 3 === 0; // Every 3rd operation

      case 'cascading':
        // Increasing failure rate over time
        return Math.random() < (operationCount * 0.05);

      case 'periodic':
        return operationCount % 5 === 0 && operationCount % 10 !== 0; // Specific pattern

      default:
        return false;
    }
  }

  /**
   * Generate appropriate error message based on component and pattern
   */
  private generateFailureMessage(component: string, pattern: string, recovery: string): string {
    const messages = {
      'audio-processing': {
        'random': 'Random audio processing failure',
        'systematic': 'Systematic audio processing breakdown',
        'cascading': 'Cascading audio processing error',
        'periodic': 'Periodic audio processing interruption'
      },
      'beat-detection': {
        'random': 'Random beat detection algorithm failure',
        'systematic': 'Systematic beat detection malfunction', 
        'cascading': 'Cascading beat detection error',
        'periodic': 'Periodic beat detection timeout'
      },
      'tempo-tracking': {
        'random': 'Random tempo tracking failure',
        'systematic': 'Systematic tempo analysis error',
        'cascading': 'Cascading tempo computation failure',
        'periodic': 'Periodic tempo tracking timeout'
      },
      'output-formatting': {
        'random': 'Random output formatting error',
        'systematic': 'Systematic result serialization failure',
        'cascading': 'Cascading output generation error',
        'periodic': 'Periodic formatting timeout'
      }
    };

    const componentMessages = messages[component as keyof typeof messages] || messages['audio-processing'];
    const baseMessage = componentMessages[pattern as keyof typeof componentMessages] || componentMessages['random'];
    
    return `${baseMessage} (recovery: ${recovery})`;
  }

  /**
   * Get current resource usage statistics
   */
  getResourceUsage(): Record<string, number> {
    const usage: Record<string, number> = {};
    this.resourceTracking.forEach((value, key) => {
      usage[key] = value;
    });
    return usage;
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.failureCounters.clear();
    this.resourceTracking.clear();
  }
}

/**
 * Recovery validation utilities
 */
export class RecoveryValidator {
  /**
   * Validate exponential backoff implementation
   */
  static validateExponentialBackoff(
    attempts: number[], 
    baseDelay: number = 100, 
    maxDelay: number = 10000
  ): boolean {
    if (attempts.length < 2) return true;

    for (let i = 1; i < attempts.length; i++) {
      const expectedDelay = Math.min(baseDelay * Math.pow(2, i - 1), maxDelay);
      const actualDelay = attempts[i] - attempts[i - 1];
      const tolerance = expectedDelay * 0.2; // 20% tolerance

      if (Math.abs(actualDelay - expectedDelay) > tolerance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate circuit breaker behavior
   */
  static validateCircuitBreaker(
    operationResults: Array<{ success: boolean; timestamp: number }>,
    failureThreshold: number = 3,
    resetTimeout: number = 5000
  ): { isValid: boolean; circuitStates: string[] } {
    let consecutiveFailures = 0;
    let circuitOpen = false;
    let lastFailureTime = 0;
    const circuitStates: string[] = [];

    for (const result of operationResults) {
      // Check if circuit should reset
      if (circuitOpen && result.timestamp - lastFailureTime > resetTimeout) {
        circuitOpen = false;
        consecutiveFailures = 0;
        circuitStates.push('half-open');
      }

      if (circuitOpen) {
        circuitStates.push('open');
        if (result.success) {
          // Should not succeed when circuit is open
          return { isValid: false, circuitStates };
        }
        continue;
      }

      if (result.success) {
        consecutiveFailures = 0;
        circuitStates.push('closed');
      } else {
        consecutiveFailures++;
        lastFailureTime = result.timestamp;
        
        if (consecutiveFailures >= failureThreshold) {
          circuitOpen = true;
          circuitStates.push('open');
        } else {
          circuitStates.push('closed');
        }
      }
    }

    return { isValid: true, circuitStates };
  }

  /**
   * Validate graceful degradation behavior
   */
  static validateGracefulDegradation(
    results: Array<{ 
      success: boolean; 
      quality: 'high' | 'medium' | 'low' | 'minimal'; 
      resourceUsage: number 
    }>,
    degradationThreshold: number = 0.7
  ): boolean {
    let previousQuality: number | null = null;
    const qualityLevels = { high: 3, medium: 2, low: 1, minimal: 0 };

    for (const result of results) {
      const currentQuality = qualityLevels[result.quality];
      
      // Quality should degrade when resource usage is high
      if (result.resourceUsage > degradationThreshold) {
        if (previousQuality !== null && currentQuality > previousQuality) {
          // Quality increased under high resource usage - invalid
          return false;
        }
      }

      // Should maintain at least minimal functionality
      if (!result.success && result.quality !== 'minimal') {
        return false;
      }

      previousQuality = currentQuality;
    }

    return true;
  }

  /**
   * Validate resource cleanup after errors
   */
  static validateResourceCleanup(
    beforeResources: Record<string, number>,
    afterResources: Record<string, number>,
    tolerance: number = 0.1
  ): { isValid: boolean; leaks: string[] } {
    const leaks: string[] = [];

    for (const [resource, beforeValue] of Object.entries(beforeResources)) {
      const afterValue = afterResources[resource] || 0;
      const change = afterValue - beforeValue;
      const changeRatio = Math.abs(change) / Math.max(beforeValue, 1);

      if (changeRatio > tolerance) {
        leaks.push(`${resource}: ${beforeValue} -> ${afterValue} (${change >= 0 ? '+' : ''}${change})`);
      }
    }

    return {
      isValid: leaks.length === 0,
      leaks
    };
  }
}

/**
 * Memory leak detection utilities
 */
export class MemoryLeakDetector {
  private snapshots: Array<{ timestamp: number; memory: NodeJS.MemoryUsage }> = [];

  /**
   * Take a memory snapshot
   */
  takeSnapshot(label?: string): void {
    if (global.gc) {
      global.gc(); // Force garbage collection if available
    }

    const snapshot = {
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      label
    };

    this.snapshots.push(snapshot);
  }

  /**
   * Analyze memory usage pattern for potential leaks
   */
  analyzeLeaks(windowSize: number = 5, growthThreshold: number = 0.1): {
    hasLeak: boolean;
    growthRate: number;
    analysis: string;
  } {
    if (this.snapshots.length < windowSize + 1) {
      return {
        hasLeak: false,
        growthRate: 0,
        analysis: 'Insufficient snapshots for analysis'
      };
    }

    const recentSnapshots = this.snapshots.slice(-windowSize - 1);
    const initial = recentSnapshots[0].memory.heapUsed;
    const final = recentSnapshots[recentSnapshots.length - 1].memory.heapUsed;
    
    const growthRate = (final - initial) / initial;
    const hasLeak = growthRate > growthThreshold;

    let analysis = `Memory growth: ${(growthRate * 100).toFixed(2)}%`;
    if (hasLeak) {
      analysis += ` (exceeded threshold of ${(growthThreshold * 100).toFixed(2)}%)`;
    }

    return {
      hasLeak,
      growthRate,
      analysis
    };
  }

  /**
   * Get memory usage statistics
   */
  getStatistics(): {
    totalSnapshots: number;
    avgHeapUsed: number;
    peakHeapUsed: number;
    memoryTrend: 'increasing' | 'decreasing' | 'stable';
  } {
    if (this.snapshots.length === 0) {
      return {
        totalSnapshots: 0,
        avgHeapUsed: 0,
        peakHeapUsed: 0,
        memoryTrend: 'stable'
      };
    }

    const heapUsages = this.snapshots.map(s => s.memory.heapUsed);
    const avgHeapUsed = heapUsages.reduce((sum, usage) => sum + usage, 0) / heapUsages.length;
    const peakHeapUsed = Math.max(...heapUsages);
    
    // Determine trend
    let memoryTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (this.snapshots.length >= 3) {
      const first = this.snapshots[0].memory.heapUsed;
      const last = this.snapshots[this.snapshots.length - 1].memory.heapUsed;
      const change = (last - first) / first;
      
      if (change > 0.05) {
        memoryTrend = 'increasing';
      } else if (change < -0.05) {
        memoryTrend = 'decreasing';
      }
    }

    return {
      totalSnapshots: this.snapshots.length,
      avgHeapUsed,
      peakHeapUsed,
      memoryTrend
    };
  }

  /**
   * Clear all snapshots
   */
  reset(): void {
    this.snapshots = [];
  }
}

/**
 * Performance monitoring utilities for error scenarios
 */
export class ErrorPerformanceMonitor {
  private measurements: Array<{
    operation: string;
    startTime: number;
    endTime: number;
    success: boolean;
    errorType?: string;
  }> = [];

  /**
   * Start monitoring an operation
   */
  startOperation(operation: string): string {
    const id = `${operation}-${Date.now()}-${Math.random()}`;
    this.measurements.push({
      operation: id,
      startTime: performance.now(),
      endTime: 0,
      success: false
    });
    return id;
  }

  /**
   * End monitoring an operation
   */
  endOperation(id: string, success: boolean, errorType?: string): void {
    const measurement = this.measurements.find(m => m.operation === id);
    if (measurement) {
      measurement.endTime = performance.now();
      measurement.success = success;
      measurement.errorType = errorType;
    }
  }

  /**
   * Get performance statistics
   */
  getStatistics(): {
    totalOperations: number;
    successRate: number;
    averageSuccessTime: number;
    averageFailureTime: number;
    errorBreakdown: Record<string, number>;
  } {
    const completed = this.measurements.filter(m => m.endTime > 0);
    const successful = completed.filter(m => m.success);
    const failed = completed.filter(m => !m.success);

    const successTimes = successful.map(m => m.endTime - m.startTime);
    const failureTimes = failed.map(m => m.endTime - m.startTime);

    const errorBreakdown: Record<string, number> = {};
    failed.forEach(m => {
      const errorType = m.errorType || 'unknown';
      errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
    });

    return {
      totalOperations: completed.length,
      successRate: completed.length > 0 ? successful.length / completed.length : 0,
      averageSuccessTime: successTimes.length > 0 
        ? successTimes.reduce((sum, time) => sum + time, 0) / successTimes.length 
        : 0,
      averageFailureTime: failureTimes.length > 0
        ? failureTimes.reduce((sum, time) => sum + time, 0) / failureTimes.length
        : 0,
      errorBreakdown
    };
  }

  /**
   * Reset all measurements
   */
  reset(): void {
    this.measurements = [];
  }
}

// Export singleton instances for easy use
export const errorSimulator = ErrorSimulator.getInstance();
export const memoryLeakDetector = new MemoryLeakDetector();
export const performanceMonitor = new ErrorPerformanceMonitor();