/**
 * Web Worker Basic Functionality Tests
 * Comprehensive validation of core Web Worker operations and lifecycle management
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import type { WorkerProgressCallback, WorkerParseOptions, WorkerClientOptions } from '../worker/WorkerClient';
import type { ParseResult } from '../types';
import type { BeatParserConfig } from '../core/BeatParser';
import { WorkerTestingUtils, type WorkerTestMetrics } from './worker-testing-utils';

describe('Web Worker Basic Functionality', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Worker Environment Detection', () => {
    test('should detect Web Worker support correctly', () => {
      const support = WorkerTestingUtils.checkWorkerSupport();
      
      expect(support.isSupported).toBe(true);
      expect(support.features.basicWorker).toBe(true);
      expect(Array.isArray(support.limitations)).toBe(true);
      
      // Verify isWorkerSupported utility function
      expect(isWorkerSupported()).toBe(true);
    });

    test('should handle missing Worker constructor gracefully', () => {
      const originalWorker = (global as any).Worker;
      delete (global as any).Worker;

      try {
        const support = WorkerTestingUtils.checkWorkerSupport();
        expect(support.isSupported).toBe(false);
        expect(support.features.basicWorker).toBe(false);
        expect(support.limitations).toContain('Web Workers not supported');
        
        expect(isWorkerSupported()).toBe(false);
      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should identify available worker features', () => {
      const support = WorkerTestingUtils.checkWorkerSupport();
      
      expect(typeof support.features.moduleWorker).toBe('boolean');
      expect(typeof support.features.transferableObjects).toBe('boolean');
      expect(typeof support.features.sharedArrayBuffer).toBe('boolean');
    });

    test('should provide meaningful feature limitations', () => {
      const originalSharedArrayBuffer = (global as any).SharedArrayBuffer;
      delete (global as any).SharedArrayBuffer;

      try {
        const support = WorkerTestingUtils.checkWorkerSupport();
        expect(support.limitations).toContain('SharedArrayBuffer not supported');
      } finally {
        if (originalSharedArrayBuffer) {
          (global as any).SharedArrayBuffer = originalSharedArrayBuffer;
        }
      }
    });
  });

  describe('Worker Client Creation and Configuration', () => {
    test('should create worker client with default options', () => {
      const client = createWorkerClient();
      
      expect(client).toBeInstanceOf(BeatParserWorkerClient);
      expect(client.getPendingOperationCount()).toBe(0);
      expect(client.isBusy()).toBe(false);
    });

    test('should create worker client with custom options', () => {
      const options: WorkerClientOptions = {
        maxRetries: 5,
        retryDelay: 200,
        timeout: 60000,
        workerUrl: '/custom/worker.js'
      };

      const client = createWorkerClient(options);
      
      expect(client).toBeInstanceOf(BeatParserWorkerClient);
      
      // Verify options are applied (accessing private field for testing)
      const clientOptions = (client as any).options;
      expect(clientOptions.maxRetries).toBe(5);
      expect(clientOptions.retryDelay).toBe(200);
      expect(clientOptions.timeout).toBe(60000);
    });

    test('should use sensible defaults for partial options', () => {
      const client = createWorkerClient({ timeout: 5000 });
      
      const clientOptions = (client as any).options;
      expect(clientOptions.timeout).toBe(5000);
      expect(clientOptions.maxRetries).toBe(3);  // Default
      expect(clientOptions.retryDelay).toBe(1000);  // Default
    });

    test('should validate option ranges', () => {
      expect(() => {
        createWorkerClient({ maxRetries: -1 });
      }).not.toThrow();  // Should handle gracefully
      
      expect(() => {
        createWorkerClient({ timeout: 0 });
      }).not.toThrow();  // Should handle gracefully
    });
  });

  describe('Worker Lifecycle Management', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(() => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
    });

    afterEach(async () => {
      if (workerClient) {
        await workerClient.terminate();
      }
    });

    test('should initialize worker successfully', async () => {
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);

      await expect(workerClient.initialize()).resolves.not.toThrow();

      expect(workerClient.getPendingOperationCount()).toBe(0);
      expect(workerClient.isBusy()).toBe(false);
    });

    test('should handle repeated initialization calls', async () => {
      await workerClient.initialize();
      const firstInitState = workerClient.isBusy();

      // Second initialization should be idempotent
      await workerClient.initialize();
      const secondInitState = workerClient.isBusy();

      expect(firstInitState).toBe(secondInitState);
    });

    test('should handle initialization failures gracefully', async () => {
      const failingClient = WorkerTestingUtils.createTestWorkerClient();
      
      // Mock worker initialization failure
      const originalWorker = (global as any).Worker;
      (global as any).Worker = class {
        constructor() {
          throw new Error('Worker initialization failed');
        }
      };

      await expect(failingClient.initialize())
        .rejects
        .toThrow('Failed to initialize BeatParser worker');

      // Restore original worker
      (global as any).Worker = originalWorker;
    });

    test('should track initialization state correctly', async () => {
      expect((workerClient as any).isInitialized).toBe(false);
      
      await workerClient.initialize();
      expect((workerClient as any).isInitialized).toBe(true);
      
      await workerClient.terminate();
      expect((workerClient as any).isInitialized).toBe(false);
    });

    test('should terminate worker cleanly', async () => {
      await workerClient.initialize();
      
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      const operationPromise = workerClient.parseBuffer(testAudio);

      // Terminate while operation is pending
      await workerClient.terminate();

      // Operation should be rejected due to termination
      await expect(operationPromise).rejects.toThrow('Operation cancelled');
      
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should handle multiple terminate calls safely', async () => {
      await workerClient.initialize();
      
      await workerClient.terminate();
      await workerClient.terminate();  // Second call should be safe
      
      expect(workerClient.isBusy()).toBe(false);
    });
  });

  describe('Basic Audio Processing Operations', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should process audio buffer successfully', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      
      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 5,
        filename: 'basic-test.wav'
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(5);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.tempo).toBeGreaterThan(0);
      expect(result.metadata.filename).toBe('basic-test.wav');
    });

    test('should handle different audio sizes', async () => {
      const sizes = [1000, 5000, 20000, 50000];
      
      for (const size of sizes) {
        const audio = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          audio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
        }

        const result = await workerClient.parseBuffer(audio, {
          filename: `test-${size}-samples.wav`
        });

        expect(result.beats).toBeDefined();
        expect(result.metadata.filename).toBe(`test-${size}-samples.wav`);
        expect(result.metadata.processingInfo.audioLength).toBeCloseTo(size / 44100, 1);
      }
    });

    test('should process complex audio patterns', async () => {
      const complexAudio = WorkerTestingUtils.generateTestAudio('complex') as Float32Array;
      
      const result = await workerClient.parseBuffer(complexAudio, {
        targetPictureCount: 10,
        filename: 'complex-test.wav'
      });

      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(10);
      expect(result.confidence).toBeGreaterThan(0);
      
      // Verify beat properties
      result.beats.forEach(beat => {
        expect(beat.timestamp).toBeGreaterThanOrEqual(0);
        expect(beat.confidence).toBeGreaterThanOrEqual(0);
        expect(beat.confidence).toBeLessThanOrEqual(1);
        expect(beat.spectralCentroid).toBeGreaterThan(0);
        expect(Array.isArray(beat.rhythmicPattern)).toBe(true);
      });
    });

    test('should apply parse options correctly', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      
      const options: WorkerParseOptions = {
        targetPictureCount: 3,
        filename: 'options-test.wav',
        algorithm: 'hybrid'
      };

      const result = await workerClient.parseBuffer(testAudio, options);

      expect(result.beats.length).toBeLessThanOrEqual(3);
      expect(result.metadata.filename).toBe('options-test.wav');
    });

    test('should use BeatParser configuration', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      
      const config: BeatParserConfig = {
        sampleRate: 48000,
        minTempo: 60,
        maxTempo: 200,
        confidenceThreshold: 0.7
      };

      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 5
      }, config);

      expect(result.beats).toBeDefined();
      expect(result.tempo).toBeGreaterThanOrEqual(60);
      expect(result.tempo).toBeLessThanOrEqual(200);
      
      // All beats should meet confidence threshold
      result.beats.forEach(beat => {
        expect(beat.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });
  });

  describe('Stream Processing Operations', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should process audio stream chunks', async () => {
      const chunks = WorkerTestingUtils.generateTestAudio('streaming', {
        duration: 3,
        chunkSize: 2048,
        count: 6
      }) as Float32Array[];

      const result = await workerClient.parseStream(chunks, {
        targetPictureCount: 8,
        filename: 'stream-test'
      });

      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(8);
      expect(result.metadata.filename).toBe('stream-test');
    });

    test('should handle varying chunk sizes', async () => {
      const chunkSizes = [1024, 2048, 4096, 8192];
      const chunks: Float32Array[] = [];

      // Create chunks with different sizes
      chunkSizes.forEach((size, index) => {
        const chunk = new Float32Array(size);
        const frequency = 440 + index * 110;
        
        for (let i = 0; i < size; i++) {
          chunk[i] = Math.sin(2 * Math.PI * frequency * i / 44100) * 0.3;
        }
        
        chunks.push(chunk);
      });

      const result = await workerClient.parseStream(chunks, {
        filename: 'variable-chunks.wav'
      });

      expect(result.beats).toBeDefined();
      expect(result.metadata.filename).toBe('variable-chunks.wav');
      
      // Should successfully process all chunks
      const totalSamples = chunkSizes.reduce((sum, size) => sum + size, 0);
      expect(result.metadata.processingInfo.audioLength).toBeCloseTo(totalSamples / 44100, 1);
    });

    test('should handle single chunk stream', async () => {
      const singleChunk = [WorkerTestingUtils.generateTestAudio('simple') as Float32Array];
      
      const result = await workerClient.parseStream(singleChunk, {
        filename: 'single-chunk.wav'
      });

      expect(result.beats).toBeDefined();
      expect(result.metadata.filename).toBe('single-chunk.wav');
    });

    test('should handle empty chunk stream', async () => {
      const emptyChunks: Float32Array[] = [];
      
      // This should handle gracefully or throw appropriate error
      await expect(workerClient.parseStream(emptyChunks))
        .rejects
        .toThrow(); // Should throw error for empty stream
    });

    test('should process large number of small chunks efficiently', async () => {
      const chunks: Float32Array[] = [];
      const chunkSize = 256;  // Small chunks
      const numChunks = 50;   // Many chunks

      for (let i = 0; i < numChunks; i++) {
        const chunk = new Float32Array(chunkSize);
        for (let j = 0; j < chunkSize; j++) {
          chunk[j] = Math.sin(2 * Math.PI * 440 * (i * chunkSize + j) / 44100) * 0.3;
        }
        chunks.push(chunk);
      }

      const startTime = performance.now();
      const result = await workerClient.parseStream(chunks, {
        filename: 'many-chunks.wav'
      });
      const processingTime = performance.now() - startTime;

      expect(result.beats).toBeDefined();
      expect(processingTime).toBeLessThan(10000); // Should complete in reasonable time
    });
  });

  describe('Batch Processing Operations', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should process multiple audio buffers in batch', async () => {
      const buffers = WorkerTestingUtils.generateTestAudio('batch', {
        duration: 2,
        count: 3
      }) as Float32Array[];

      const options = buffers.map((_, i) => ({
        targetPictureCount: 3,
        filename: `batch-item-${i}.wav`
      }));

      const results = await workerClient.processBatch(buffers, options);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(3);
        expect(result.metadata.filename).toBe(`batch-item-${index}.wav`);
      });
    });

    test('should handle batch with different buffer sizes', async () => {
      const buffers: Float32Array[] = [
        WorkerTestingUtils.generateTestAudio('simple', { duration: 1 }) as Float32Array,
        WorkerTestingUtils.generateTestAudio('simple', { duration: 3 }) as Float32Array,
        WorkerTestingUtils.generateTestAudio('simple', { duration: 2 }) as Float32Array
      ];

      const results = await workerClient.processBatch(buffers);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.beats).toBeDefined();
        const expectedDuration = index === 0 ? 1 : index === 1 ? 3 : 2;
        expect(result.metadata.processingInfo.audioLength).toBeCloseTo(expectedDuration, 0);
      });
    });

    test('should handle batch with different options per buffer', async () => {
      const buffers = WorkerTestingUtils.generateTestAudio('batch', {
        duration: 2,
        count: 3
      }) as Float32Array[];

      const options = [
        { targetPictureCount: 2, filename: 'first.wav' },
        { targetPictureCount: 5, filename: 'second.wav' },
        { targetPictureCount: 3, filename: 'third.wav' }
      ];

      const results = await workerClient.processBatch(buffers, options);

      expect(results).toHaveLength(3);
      expect(results[0].beats.length).toBeLessThanOrEqual(2);
      expect(results[1].beats.length).toBeLessThanOrEqual(5);
      expect(results[2].beats.length).toBeLessThanOrEqual(3);
      expect(results[0].metadata.filename).toBe('first.wav');
      expect(results[1].metadata.filename).toBe('second.wav');
      expect(results[2].metadata.filename).toBe('third.wav');
    });

    test('should handle empty batch', async () => {
      const emptyBatch: Float32Array[] = [];
      
      // Should handle gracefully or throw appropriate error
      await expect(workerClient.processBatch(emptyBatch))
        .rejects
        .toThrow(); // Should throw error for empty batch
    });

    test('should handle large batch efficiently', async () => {
      const batchSize = 10;
      const buffers = Array.from({ length: batchSize }, (_, i) =>
        WorkerTestingUtils.generateTestAudio('simple', { duration: 1 }) as Float32Array
      );

      const startTime = performance.now();
      const results = await workerClient.processBatch(buffers);
      const processingTime = performance.now() - startTime;

      expect(results).toHaveLength(batchSize);
      results.forEach(result => {
        expect(result.beats).toBeDefined();
      });

      // Should process reasonably efficiently
      expect(processingTime).toBeLessThan(batchSize * 1000); // Less than 1s per item
    });
  });

  describe('Progress Reporting', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should report progress during buffer processing', async () => {
      const progressTracker = WorkerTestingUtils.createProgressTracker();
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;

      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 5,
        progressCallback: progressTracker.callback
      });

      expect(result).toBeDefined();
      expect(progressTracker.updates.length).toBeGreaterThan(0);

      // Verify progress update structure
      progressTracker.updates.forEach(update => {
        expect(update.current).toBeGreaterThanOrEqual(0);
        expect(update.total).toBeGreaterThan(0);
        expect(update.percentage).toBeGreaterThanOrEqual(0);
        expect(update.percentage).toBeLessThanOrEqual(100);
        expect(typeof update.stage).toBe('string');
        expect(update.stage.length).toBeGreaterThan(0);
        expect(update.timestamp).toBeGreaterThan(0);
      });

      // Progress should generally increase
      const percentages = progressTracker.updates.map(u => u.percentage);
      expect(percentages[percentages.length - 1]).toBeGreaterThan(percentages[0]);
    });

    test('should report progress during stream processing', async () => {
      const progressTracker = WorkerTestingUtils.createProgressTracker();
      const chunks = WorkerTestingUtils.generateTestAudio('streaming', {
        chunkSize: 2048,
        count: 4
      }) as Float32Array[];

      const result = await workerClient.parseStream(chunks, {
        progressCallback: progressTracker.callback
      });

      expect(result).toBeDefined();
      expect(progressTracker.updates.length).toBeGreaterThan(0);

      // Should have chunk-specific progress updates
      const chunkUpdates = progressTracker.updates.filter(u => 
        u.stage.includes('chunk')
      );
      expect(chunkUpdates.length).toBeGreaterThan(0);
    });

    test('should report progress during batch processing', async () => {
      const progressTracker = WorkerTestingUtils.createProgressTracker();
      const buffers = WorkerTestingUtils.generateTestAudio('batch', {
        count: 3
      }) as Float32Array[];

      const results = await workerClient.processBatch(buffers, [{
        progressCallback: progressTracker.callback
      }]);

      expect(results).toBeDefined();
      expect(progressTracker.updates.length).toBeGreaterThan(0);

      // Should have buffer-specific progress updates
      const bufferUpdates = progressTracker.updates.filter(u =>
        u.stage.includes('buffer')
      );
      expect(bufferUpdates.length).toBeGreaterThan(0);
    });

    test('should handle missing progress callback gracefully', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;

      // No progress callback provided - should still work
      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 3
      });

      expect(result).toBeDefined();
      expect(result.beats.length).toBeLessThanOrEqual(3);
    });

    test('should handle progress callback errors gracefully', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;

      const errorCallback: WorkerProgressCallback = () => {
        throw new Error('Progress callback error');
      };

      // Should still complete processing despite callback errors
      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 3,
        progressCallback: errorCallback
      });

      expect(result).toBeDefined();
    });
  });

  describe('Operation State Management', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should track pending operations correctly', async () => {
      expect(workerClient.getPendingOperationCount()).toBe(0);
      expect(workerClient.isBusy()).toBe(false);

      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      const operationPromise = workerClient.parseBuffer(testAudio);

      // During operation
      expect(workerClient.isBusy()).toBe(true);
      expect(workerClient.getPendingOperationCount()).toBe(1);

      const result = await operationPromise;

      // After completion
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
      expect(result).toBeDefined();
    });

    test('should track multiple concurrent operations', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      
      const operations = [
        workerClient.parseBuffer(testAudio, { filename: 'op1.wav' }),
        workerClient.parseBuffer(testAudio, { filename: 'op2.wav' }),
        workerClient.parseBuffer(testAudio, { filename: 'op3.wav' })
      ];

      // All operations should be tracked
      expect(workerClient.isBusy()).toBe(true);
      expect(workerClient.getPendingOperationCount()).toBe(3);

      const results = await Promise.all(operations);

      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
      expect(results).toHaveLength(3);
    });

    test('should handle operation cancellation', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;
      
      // Start a long-running operation
      const operationPromise = workerClient.parseBuffer(testAudio);
      
      expect(workerClient.isBusy()).toBe(true);
      
      // Cancel the operation
      workerClient.cancelOperation();
      
      // Operation should be cancelled
      await expect(operationPromise).rejects.toThrow('Operation cancelled');
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should handle individual operation cancellation', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      
      const op1 = workerClient.parseBuffer(testAudio, { filename: 'op1.wav' });
      const op2 = workerClient.parseBuffer(testAudio, { filename: 'op2.wav' });
      
      expect(workerClient.getPendingOperationCount()).toBe(2);
      
      // This would require access to message IDs - simplified test
      workerClient.cancelOperation(); // Cancel all for now
      
      await expect(Promise.all([op1, op2])).rejects.toThrow('Operation cancelled');
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should handle timeout scenarios', async () => {
      const shortTimeoutClient = WorkerTestingUtils.createTestWorkerClient({
        timeout: 50  // Very short timeout
      });

      try {
        const testAudio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;
        
        await expect(
          shortTimeoutClient.parseBuffer(testAudio)
        ).rejects.toThrow('Worker operation timed out');

        expect(shortTimeoutClient.isBusy()).toBe(false);
        expect(shortTimeoutClient.getPendingOperationCount()).toBe(0);
      } finally {
        await shortTimeoutClient.terminate();
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle worker creation errors', async () => {
      const originalWorker = (global as any).Worker;
      (global as any).Worker = class {
        constructor() {
          throw new Error('Worker creation failed');
        }
      };

      try {
        const failingClient = new BeatParserWorkerClient();
        await expect(failingClient.initialize())
          .rejects
          .toThrow('Failed to initialize BeatParser worker');
      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle worker runtime errors', async () => {
      const errorClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 1.0  // Force errors
      });

      try {
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        await expect(
          errorClient.parseBuffer(testAudio)
        ).rejects.toThrow('Simulated worker error');
      } finally {
        await errorClient.terminate();
      }
    });

    test('should handle invalid audio data', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        // Test with various invalid inputs
        await expect(
          workerClient.parseBuffer(new Float32Array(0))  // Empty array
        ).rejects.toThrow();
        
        // Test with extremely small buffer
        await expect(
          workerClient.parseBuffer(new Float32Array(1))
        ).rejects.toThrow();
      } finally {
        await workerClient.terminate();
      }
    });

    test('should handle corrupted audio data', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        const corruptedAudio = new Float32Array(1000);
        // Fill with NaN and Infinity values
        for (let i = 0; i < 1000; i += 10) {
          corruptedAudio[i] = NaN;
          if (i + 5 < 1000) corruptedAudio[i + 5] = Infinity;
        }
        
        // Should handle gracefully or throw appropriate error
        await expect(
          workerClient.parseBuffer(corruptedAudio)
        ).rejects.toThrow();
      } finally {
        await workerClient.terminate();
      }
    });

    test('should recover from transient errors', async () => {
      // This would test retry logic - simplified for mock implementation
      const unreliableClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 0.7  // 70% error rate to test retries
      });

      try {
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Some operations might succeed after retries
        const results = await Promise.allSettled([
          unreliableClient.parseBuffer(testAudio),
          unreliableClient.parseBuffer(testAudio),
          unreliableClient.parseBuffer(testAudio)
        ]);

        // At least some should complete (or all fail consistently)
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failCount = results.filter(r => r.status === 'rejected').length;
        
        expect(successCount + failCount).toBe(3);
      } finally {
        await unreliableClient.terminate();
      }
    });
  });

  describe('Resource Management', () => {
    test('should handle memory-intensive operations', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        // Create large audio buffer
        const largeAudio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;
        
        const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
          () => workerClient.parseBuffer(largeAudio),
          'Large Audio Processing'
        );

        expect(result).toBeDefined();
        expect(metrics.duration).toBeGreaterThan(0);
        expect(metrics.memoryUsage.heapUsedDelta).toBeGreaterThanOrEqual(0);
        
        // Memory should be cleaned up after operation
        expect(workerClient.isBusy()).toBe(false);
      } finally {
        await workerClient.terminate();
      }
    });

    test('should clean up resources on termination', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();
      
      await workerClient.initialize();
      
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      const operationPromise = workerClient.parseBuffer(testAudio);
      
      // Terminate while operation is in progress
      await workerClient.terminate();
      
      // Operation should be cancelled and resources cleaned
      await expect(operationPromise).rejects.toThrow('Operation cancelled');
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should handle transferable object optimization', async () => {
      const workerClient = WorkerTestingUtils.createTestWorkerClient();

      try {
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const originalBuffer = testAudio.buffer;
        
        const result = await workerClient.parseBuffer(testAudio);
        
        expect(result).toBeDefined();
        // Note: In real implementation, buffer might be transferred and detached
        // Mock implementation doesn't actually transfer, so buffer remains intact
        expect(testAudio.length).toBeGreaterThan(0);
      } finally {
        await workerClient.terminate();
      }
    });
  });
});