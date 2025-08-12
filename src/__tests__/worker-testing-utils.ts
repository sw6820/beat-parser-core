/**
 * Web Worker Testing Utilities & Framework
 * Comprehensive testing infrastructure for Web Worker operations and concurrency
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import type { WorkerProgressCallback, WorkerParseOptions } from '../worker/WorkerClient';
import type { ParseResult } from '../types';
import type { BeatParserConfig } from '../core/BeatParser';

// Extended worker testing interfaces
export interface WorkerTestMetrics {
  duration: number;
  memoryUsage: WorkerMemoryMetrics;
  communicationOverhead: number;
  transferTime: number;
  responseTime: number;
  messagingEfficiency: number;
  startTime: number;
  endTime: number;
}

export interface WorkerMemoryMetrics {
  heapUsedDelta: number;
  heapTotalDelta: number;
  rssDelta: number;
  externalDelta: number;
  arrayBuffersDelta: number;
}

export interface WorkerPerformanceComparison {
  workerTime: number;
  mainThreadTime: number;
  speedupRatio: number;
  memoryComparison: number;
  overhead: number;
  efficiency: number;
  recommendation: 'use-worker' | 'use-main-thread' | 'depends-on-size';
}

export interface ConcurrencyTestResult {
  operationId: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  result?: ParseResult | ParseResult[];
  error?: Error;
  threadSafetyViolations: ThreadSafetyViolation[];
}

export interface ThreadSafetyViolation {
  type: 'race-condition' | 'deadlock' | 'resource-leak' | 'state-corruption';
  description: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface WorkerStressTestConfig {
  maxConcurrentWorkers: number;
  operationsPerWorker: number;
  stressDurationMs: number;
  memoryPressure: boolean;
  timeoutStress: boolean;
  errorInjection: boolean;
}

export interface WorkerBrowserCompatibility {
  browser: string;
  version: string;
  workerSupported: boolean;
  transferableSupported: boolean;
  sharedArrayBufferSupported: boolean;
  features: BrowserWorkerFeatures;
  performance: BrowserWorkerPerformance;
}

export interface BrowserWorkerFeatures {
  moduleWorkers: boolean;
  importScripts: boolean;
  nestedWorkers: boolean;
  workerTypeModule: boolean;
  transferableStreams: boolean;
}

export interface BrowserWorkerPerformance {
  creationTime: number;
  messageLatency: number;
  transferEfficiency: number;
  memoryIsolation: boolean;
}

// Mock Worker Implementation for Testing
export class EnhancedMockWorker extends EventTarget {
  private listeners: Map<string, Function[]> = new Map();
  private isTerminated = false;
  private messageQueue: any[] = [];
  private operationLatency = 50;

  constructor(
    private scriptURL: string,
    private options?: WorkerOptions,
    private testConfig?: {
      latency?: number;
      errorRate?: number;
      memoryLeaks?: boolean;
      progressUpdates?: boolean;
    }
  ) {
    super();
    if (testConfig?.latency) {
      this.operationLatency = testConfig.latency;
    }
  }

  postMessage(message: any, transfer?: Transferable[]): void {
    if (this.isTerminated) {
      throw new Error('Cannot post message to terminated worker');
    }

    // Simulate transfer time for large data
    const dataSize = this.estimateDataSize(message);
    const transferTime = Math.max(1, dataSize / (100 * 1024 * 1024)); // Simulate 100MB/s transfer

    setTimeout(() => {
      this.processMessage(message, transfer, transferTime);
    }, transferTime);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener as Function);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener as Function);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  terminate(): void {
    this.isTerminated = true;
    this.listeners.clear();
    this.messageQueue = [];
  }

  private estimateDataSize(data: any): number {
    if (!data) return 0;
    if (data.payload?.audioData instanceof Float32Array) {
      return data.payload.audioData.length * 4; // 4 bytes per float
    }
    if (data.payload?.audioBuffers instanceof Array) {
      return data.payload.audioBuffers.reduce(
        (total: number, buffer: Float32Array) => total + buffer.length * 4,
        0
      );
    }
    return 1024; // Default small message size
  }

  private processMessage(message: any, transfer?: Transferable[], transferTime?: number): void {
    if (this.isTerminated) return;

    const { id, type, payload } = message;

    // Simulate error injection
    if (this.testConfig?.errorRate && Math.random() < this.testConfig.errorRate) {
      this.sendMessage({
        id,
        type: 'error',
        payload: {
          message: 'Simulated worker error',
          stack: 'Error: Simulated error\n  at MockWorker'
        }
      });
      return;
    }

    // Send progress updates if enabled
    if (this.testConfig?.progressUpdates !== false) {
      setTimeout(() => {
        this.sendMessage({
          id,
          type: 'progress',
          payload: {
            current: 25,
            total: 100,
            stage: `Processing ${type}`,
            percentage: 25
          }
        });
      }, this.operationLatency / 4);

      setTimeout(() => {
        this.sendMessage({
          id,
          type: 'progress',
          payload: {
            current: 75,
            total: 100,
            stage: `Processing ${type}`,
            percentage: 75
          }
        });
      }, this.operationLatency * 3 / 4);
    }

    // Send final result
    setTimeout(() => {
      this.sendResult(id, type, payload);
    }, this.operationLatency);
  }

  private sendResult(id: string, type: string, payload: any): void {
    if (this.isTerminated) return;

    switch (type) {
      case 'parse-buffer':
      case 'parse-stream':
        this.sendMessage({
          id,
          type: 'result',
          payload: this.createMockParseResult(payload)
        });
        break;

      case 'batch-process':
        const batchSize = payload?.audioBuffers?.length || 1;
        const results = Array.from({ length: batchSize }, (_, i) =>
          this.createMockParseResult(payload, i)
        );
        this.sendMessage({
          id,
          type: 'result',
          payload: results
        });
        break;

      case 'cancel':
        // Handle cancellation - don't send result
        break;

      default:
        this.sendMessage({
          id,
          type: 'error',
          payload: {
            message: `Unknown message type: ${type}`,
            stack: 'Error: Unknown message type'
          }
        });
    }
  }

  private createMockParseResult(payload: any, index: number = 0): ParseResult {
    const audioLength = payload?.audioData?.length || payload?.audioBuffers?.[index]?.length || 44100;
    
    return {
      beats: [
        {
          timestamp: 0.5 + index * 0.1,
          confidence: 0.8 + Math.random() * 0.2,
          spectralCentroid: 1000 + Math.random() * 200,
          rhythmicPattern: [1, 0, 1, 0]
        },
        {
          timestamp: 1.0 + index * 0.1,
          confidence: 0.9 + Math.random() * 0.1,
          spectralCentroid: 1100 + Math.random() * 200,
          rhythmicPattern: [1, 0, 1, 0]
        }
      ],
      confidence: 0.8 + Math.random() * 0.2,
      tempo: 120 + Math.random() * 40,
      timeSignature: { numerator: 4, denominator: 4 },
      metadata: {
        filename: payload?.options?.filename || `test-audio-${index}`,
        processingInfo: {
          audioLength: audioLength / 44100,
          sampleRate: 44100,
          processingTime: Date.now(),
          algorithmsUsed: ['hybrid'],
          pluginsUsed: []
        }
      }
    };
  }

  private sendMessage(data: any): void {
    const messageListeners = this.listeners.get('message') || [];
    messageListeners.forEach(listener => {
      try {
        listener({ data });
      } catch (error) {
        console.warn('Mock worker message listener error:', error);
      }
    });
  }
}

// Worker Testing Utilities
export class WorkerTestingUtils {
  /**
   * Create a worker client with test configuration
   */
  static createTestWorkerClient(options?: {
    latency?: number;
    errorRate?: number;
    memoryLeaks?: boolean;
    timeout?: number;
  }): BeatParserWorkerClient {
    // Mock the Worker constructor for testing
    const originalWorker = (global as any).Worker;
    (global as any).Worker = class {
      constructor(url: string, opts?: WorkerOptions) {
        return new EnhancedMockWorker(url, opts, {
          latency: options?.latency,
          errorRate: options?.errorRate,
          memoryLeaks: options?.memoryLeaks
        });
      }
    };

    const client = createWorkerClient({
      timeout: options?.timeout || 30000,
      maxRetries: 3,
      retryDelay: 100
    });

    // Restore original Worker after creation if it existed
    if (originalWorker) {
      (global as any).Worker = originalWorker;
    }

    return client;
  }

  /**
   * Measure worker operation performance with detailed metrics
   */
  static async measureWorkerOperation<T>(
    operation: () => Promise<T>,
    label: string = 'Worker Operation'
  ): Promise<{ result: T; metrics: WorkerTestMetrics }> {
    // Force GC if available
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const startMemory = process.memoryUsage();
    const startTime = performance.now();
    const communicationStart = performance.now();

    let result: T;
    try {
      result = await operation();
    } catch (error) {
      throw new Error(`Worker operation failed: ${error}`);
    }

    const endTime = performance.now();
    const communicationEnd = performance.now();
    const endMemory = process.memoryUsage();

    const duration = endTime - startTime;
    const communicationOverhead = communicationEnd - communicationStart - duration;

    const memoryUsage: WorkerMemoryMetrics = {
      heapUsedDelta: endMemory.heapUsed - startMemory.heapUsed,
      heapTotalDelta: endMemory.heapTotal - startMemory.heapTotal,
      rssDelta: endMemory.rss - startMemory.rss,
      externalDelta: endMemory.external - startMemory.external,
      arrayBuffersDelta: endMemory.arrayBuffers - startMemory.arrayBuffers
    };

    const transferTime = Math.max(0, communicationOverhead * 0.3);
    const responseTime = duration - transferTime;
    const messagingEfficiency = responseTime > 0 ? transferTime / responseTime : 0;

    const metrics: WorkerTestMetrics = {
      duration,
      memoryUsage,
      communicationOverhead,
      transferTime,
      responseTime,
      messagingEfficiency,
      startTime,
      endTime
    };

    console.log(`📊 Worker operation completed: ${label}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);
    console.log(`   Communication overhead: ${communicationOverhead.toFixed(2)}ms`);
    console.log(`   Transfer time: ${transferTime.toFixed(2)}ms`);
    console.log(`   Memory delta: ${(memoryUsage.heapUsedDelta / 1024 / 1024).toFixed(2)}MB`);

    return { result, metrics };
  }

  /**
   * Compare worker performance vs main thread processing
   */
  static async compareWorkerPerformance<T>(
    workerOperation: () => Promise<T>,
    mainThreadOperation: () => Promise<T>,
    label: string = 'Performance Comparison'
  ): Promise<WorkerPerformanceComparison> {
    console.log(`🏁 Starting performance comparison: ${label}`);

    // Measure main thread performance
    const { metrics: mainMetrics } = await this.measureWorkerOperation(
      mainThreadOperation,
      `${label} (Main Thread)`
    );

    // Small delay to ensure clean state
    await new Promise(resolve => setTimeout(resolve, 100));

    // Measure worker performance
    const { metrics: workerMetrics } = await this.measureWorkerOperation(
      workerOperation,
      `${label} (Worker)`
    );

    const workerTime = workerMetrics.duration;
    const mainThreadTime = mainMetrics.duration;
    const speedupRatio = mainThreadTime / workerTime;
    const memoryComparison = workerMetrics.memoryUsage.heapUsedDelta / 
                           Math.max(1, mainMetrics.memoryUsage.heapUsedDelta);
    const overhead = workerMetrics.communicationOverhead;
    const efficiency = Math.max(0, (speedupRatio - 1) * (1 - overhead / workerTime));

    let recommendation: 'use-worker' | 'use-main-thread' | 'depends-on-size';
    if (efficiency > 0.2) {
      recommendation = 'use-worker';
    } else if (efficiency < -0.1) {
      recommendation = 'use-main-thread';
    } else {
      recommendation = 'depends-on-size';
    }

    console.log(`✅ Performance comparison completed: ${label}`);
    console.log(`   Worker time: ${workerTime.toFixed(2)}ms`);
    console.log(`   Main thread time: ${mainThreadTime.toFixed(2)}ms`);
    console.log(`   Speedup ratio: ${speedupRatio.toFixed(2)}x`);
    console.log(`   Recommendation: ${recommendation}`);

    return {
      workerTime,
      mainThreadTime,
      speedupRatio,
      memoryComparison,
      overhead,
      efficiency,
      recommendation
    };
  }

  /**
   * Generate various test audio patterns for worker testing
   */
  static generateTestAudio(
    type: 'simple' | 'complex' | 'large' | 'streaming' | 'batch',
    options?: {
      duration?: number;
      sampleRate?: number;
      count?: number;
      chunkSize?: number;
    }
  ): Float32Array | Float32Array[] {
    const duration = options?.duration || 2;
    const sampleRate = options?.sampleRate || 44100;
    const samples = Math.floor(duration * sampleRate);

    switch (type) {
      case 'simple':
        return this.generateSimpleAudio(samples, sampleRate);

      case 'complex':
        return this.generateComplexAudio(samples, sampleRate);

      case 'large':
        return this.generateSimpleAudio(samples * 5, sampleRate); // 5x larger

      case 'streaming':
        const chunkSize = options?.chunkSize || 4096;
        const chunks = Math.ceil(samples / chunkSize);
        return Array.from({ length: chunks }, (_, i) => {
          const chunkSamples = Math.min(chunkSize, samples - i * chunkSize);
          return this.generateSimpleAudio(chunkSamples, sampleRate, i * chunkSize);
        });

      case 'batch':
        const count = options?.count || 3;
        return Array.from({ length: count }, (_, i) =>
          this.generateSimpleAudio(samples + i * 1000, sampleRate)
        );

      default:
        return this.generateSimpleAudio(samples, sampleRate);
    }
  }

  private static generateSimpleAudio(samples: number, sampleRate: number, offset: number = 0): Float32Array {
    const audio = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const t = (i + offset) / sampleRate;
      audio[i] = Math.sin(2 * Math.PI * 440 * t) * 0.3;
    }
    return audio;
  }

  private static generateComplexAudio(samples: number, sampleRate: number): Float32Array {
    const audio = new Float32Array(samples);
    const frequencies = [220, 440, 880];
    const amplitudes = [0.3, 0.2, 0.1];

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      frequencies.forEach((freq, index) => {
        sample += Math.sin(2 * Math.PI * freq * t) * amplitudes[index];
      });

      // Add some noise
      sample += (Math.random() - 0.5) * 0.05;
      audio[i] = sample;
    }

    return audio;
  }

  /**
   * Create mock progress callback for testing
   */
  static createProgressTracker(): {
    callback: WorkerProgressCallback;
    updates: Array<{ current: number; total: number; stage: string; percentage: number; timestamp: number }>;
    reset: () => void;
  } {
    const updates: Array<{ current: number; total: number; stage: string; percentage: number; timestamp: number }> = [];

    const callback: WorkerProgressCallback = (progress) => {
      updates.push({
        ...progress,
        timestamp: performance.now()
      });
    };

    const reset = () => {
      updates.length = 0;
    };

    return { callback, updates, reset };
  }

  /**
   * Setup test environment with proper mocks and utilities
   */
  static setupTestEnvironment(): {
    cleanup: () => void;
    mockWorker: typeof EnhancedMockWorker;
  } {
    const originalWorker = (global as any).Worker;

    // Install enhanced mock worker
    (global as any).Worker = EnhancedMockWorker;

    const cleanup = () => {
      if (originalWorker) {
        (global as any).Worker = originalWorker;
      } else {
        delete (global as any).Worker;
      }
    };

    return {
      cleanup,
      mockWorker: EnhancedMockWorker
    };
  }

  /**
   * Verify worker environment support
   */
  static checkWorkerSupport(): {
    isSupported: boolean;
    features: {
      basicWorker: boolean;
      moduleWorker: boolean;
      transferableObjects: boolean;
      sharedArrayBuffer: boolean;
    };
    limitations: string[];
  } {
    const isSupported = isWorkerSupported();
    const features = {
      basicWorker: typeof Worker !== 'undefined',
      moduleWorker: typeof Worker !== 'undefined',
      transferableObjects: typeof ArrayBuffer !== 'undefined',
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined'
    };

    const limitations: string[] = [];
    if (!features.basicWorker) limitations.push('Web Workers not supported');
    if (!features.moduleWorker) limitations.push('Module Workers not supported');
    if (!features.transferableObjects) limitations.push('Transferable Objects not supported');
    if (!features.sharedArrayBuffer) limitations.push('SharedArrayBuffer not supported');

    return {
      isSupported,
      features,
      limitations
    };
  }
}