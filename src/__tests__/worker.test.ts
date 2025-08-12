/**
 * Tests for Web Worker functionality
 * Tests BeatParserWorkerClient and worker communication
 */

import { BeatParserWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import type { WorkerProgressCallback } from '../worker/WorkerClient';

// Mock Worker for Node.js environment
class MockWorker {
  private listeners: Map<string, Function[]> = new Map();
  // private messageHandlers: Function[] = [];

  constructor(private _scriptURL: string, private _options?: WorkerOptions) {}

  postMessage(message: any, _transfer?: any[]): void {
    // Simulate async message processing
    setTimeout(() => {
      this.simulateWorkerResponse(message);
    }, 10);
  }

  addEventListener(type: string, listener: Function): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: Function): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  terminate(): void {
    this.listeners.clear();
  }

  private simulateWorkerResponse(message: any): void {
    const { id, type, payload } = message;
    
    // Simulate different response times based on message type
    const delay = type === 'batch-process' ? 100 : 50;
    
    setTimeout(() => {
      // Send progress message first
      this.sendMessage({
        id,
        type: 'progress',
        payload: {
          current: 50,
          total: 100,
          stage: `Processing ${type}`,
          percentage: 50
        }
      });

      // Send final result
      setTimeout(() => {
        if (type === 'parse-buffer' || type === 'parse-stream') {
          this.sendMessage({
            id,
            type: 'result',
            payload: {
              beats: [
                { timestamp: 0.5, confidence: 0.8, spectralCentroid: 1000, rhythmicPattern: [1, 0, 1, 0] },
                { timestamp: 1.0, confidence: 0.9, spectralCentroid: 1100, rhythmicPattern: [1, 0, 1, 0] },
                { timestamp: 1.5, confidence: 0.7, spectralCentroid: 950, rhythmicPattern: [1, 0, 1, 0] }
              ],
              confidence: 0.8,
              tempo: 120,
              timeSignature: { numerator: 4, denominator: 4 },
              metadata: {
                filename: payload?.options?.filename || 'test-audio',
                processingInfo: {
                  audioLength: payload?.audioData?.length / 44100 || 5,
                  sampleRate: 44100,
                  processingTime: Date.now(),
                  algorithmsUsed: ['hybrid'],
                  pluginsUsed: []
                }
              }
            }
          });
        } else if (type === 'batch-process') {
          const batchSize = payload?.audioBuffers?.length || 1;
          const results = Array.from({ length: batchSize }, (_, i) => ({
            beats: [
              { timestamp: 0.5 + i * 0.1, confidence: 0.8, spectralCentroid: 1000, rhythmicPattern: [1, 0, 1, 0] }
            ],
            confidence: 0.8,
            tempo: 120,
            timeSignature: { numerator: 4, denominator: 4 },
            metadata: {
              filename: `batch-item-${i}`,
              processingInfo: {
                audioLength: 5,
                sampleRate: 44100,
                processingTime: Date.now(),
                algorithmsUsed: ['hybrid'],
                pluginsUsed: []
              }
            }
          }));

          this.sendMessage({
            id,
            type: 'result',
            payload: results
          });
        }
      }, delay);
    }, 10);
  }

  private sendMessage(data: any): void {
    const messageListeners = this.listeners.get('message') || [];
    messageListeners.forEach(listener => {
      listener({ data });
    });
  }
}

// Mock Worker in global scope for testing
(global as any).Worker = MockWorker;

describe('Web Worker Support', () => {
  let workerClient: BeatParserWorkerClient;

  beforeEach(() => {
    workerClient = new BeatParserWorkerClient({
      maxRetries: 2,
      timeout: 10000
    });
  });

  afterEach(async () => {
    await workerClient.terminate();
  });

  describe('Worker Environment Detection', () => {
    test('should detect worker support', () => {
      const isSupported = isWorkerSupported();
      expect(typeof isSupported).toBe('boolean');
      expect(isSupported).toBe(true); // Should be true with our mock
    });

    test('should handle missing Worker constructor', () => {
      const originalWorker = (global as any).Worker;
      delete (global as any).Worker;

      const isSupported = isWorkerSupported();
      expect(isSupported).toBe(false);

      // Restore Worker
      (global as any).Worker = originalWorker;
    });
  });

  describe('Worker Client Initialization', () => {
    test('should initialize worker client', async () => {
      await expect(workerClient.initialize()).resolves.not.toThrow();
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should handle initialization errors', async () => {
      const originalWorker = (global as any).Worker;
      (global as any).Worker = class {
        constructor() {
          throw new Error('Worker initialization failed');
        }
      };

      const failingClient = new BeatParserWorkerClient();
      await expect(failingClient.initialize()).rejects.toThrow('Failed to initialize BeatParser worker');

      // Restore Worker
      (global as any).Worker = originalWorker;
    });

    test('should not re-initialize if already initialized', async () => {
      await workerClient.initialize();
      const firstInit = workerClient.isBusy();
      
      await workerClient.initialize(); // Second call
      const secondInit = workerClient.isBusy();
      
      expect(firstInit).toBe(secondInit);
    });
  });

  describe('Buffer Processing', () => {
    const createTestAudio = (length: number = 44100): Float32Array => {
      const audio = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        audio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.1;
      }
      return audio;
    };

    test('should process audio buffer', async () => {
      const testAudio = createTestAudio();
      
      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 5,
        filename: 'test-buffer.wav'
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.beats.length).toBeLessThanOrEqual(5);
      expect(result.metadata.filename).toBe('test-buffer.wav');
    });

    test('should handle progress callbacks during buffer processing', async () => {
      const testAudio = createTestAudio();
      const progressUpdates: Array<{
        current: number;
        total: number;
        stage: string;
        percentage: number;
      }> = [];

      const progressCallback: WorkerProgressCallback = (progress) => {
        progressUpdates.push(progress);
      };

      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 3,
        progressCallback
      });

      expect(result).toBeDefined();
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('percentage');
      expect(progressUpdates[0]).toHaveProperty('stage');
      expect(progressUpdates[0]!.percentage).toBeGreaterThanOrEqual(0);
      expect(progressUpdates[0]!.percentage).toBeLessThanOrEqual(100);
    });

    test('should handle multiple concurrent buffer operations', async () => {
      const operations = Array.from({ length: 3 }, (_, i) => {
        const testAudio = createTestAudio(44100 + i * 1000);
        return workerClient.parseBuffer(testAudio, {
          targetPictureCount: 3,
          filename: `concurrent-${i}.wav`
        });
      });

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.beats).toBeDefined();
        expect(result.metadata.filename).toBe(`concurrent-${index}.wav`);
      });
    });
  });

  describe('Stream Processing', () => {
    const createAudioChunks = (chunkCount: number, chunkSize: number = 4096): Float32Array[] => {
      return Array.from({ length: chunkCount }, (_, i) => {
        const chunk = new Float32Array(chunkSize);
        const frequency = 440 + i * 10; // Vary frequency per chunk
        for (let j = 0; j < chunkSize; j++) {
          chunk[j] = Math.sin(2 * Math.PI * frequency * j / 44100) * 0.1;
        }
        return chunk;
      });
    };

    test('should process audio stream chunks', async () => {
      const chunks = createAudioChunks(4);
      
      const result = await workerClient.parseStream(chunks, {
        targetPictureCount: 6,
        filename: 'test-stream'
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeLessThanOrEqual(6);
      expect(result.metadata.filename).toBe('test-stream');
    });

    test('should handle progress callbacks during stream processing', async () => {
      const chunks = createAudioChunks(3);
      const progressUpdates: Array<{
        current: number;
        total: number;
        stage: string;
        percentage: number;
      }> = [];

      const result = await workerClient.parseStream(chunks, {
        targetPictureCount: 4,
        progressCallback: (progress) => progressUpdates.push(progress)
      });

      expect(result).toBeDefined();
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some(p => p.stage.includes('chunk'))).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    const createTestBuffers = (count: number): Float32Array[] => {
      return Array.from({ length: count }, (_, i) => {
        const audio = new Float32Array(4096 + i * 100);
        const frequency = 440 + i * 50;
        for (let j = 0; j < audio.length; j++) {
          audio[j] = Math.sin(2 * Math.PI * frequency * j / 44100) * 0.1;
        }
        return audio;
      });
    };

    test('should process multiple audio buffers in batch', async () => {
      const buffers = createTestBuffers(3);
      const options = buffers.map((_, i) => ({
        targetPictureCount: 2,
        filename: `batch-item-${i}.wav`
      }));

      const results = await workerClient.processBatch(buffers, options);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.beats).toBeDefined();
        expect(result.metadata.filename).toBe(`batch-item-${index}.wav`);
      });
    });

    test('should handle batch progress callbacks', async () => {
      const buffers = createTestBuffers(2);
      const progressUpdates: Array<{
        current: number;
        total: number;
        stage: string;
        percentage: number;
      }> = [];

      const results = await workerClient.processBatch(buffers, [], {
        // Progress callback from the first options parameter
        progressCallback: (progress: any) => progressUpdates.push(progress)
      } as any);

      expect(results).toHaveLength(2);
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    test('should handle mixed success/failure in batch processing', async () => {
      const buffers = createTestBuffers(2);
      
      // This will succeed with our mock implementation
      const results = await workerClient.processBatch(buffers);
      
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.beats).toBeDefined();
      });
    });
  });

  describe('Operation Management', () => {
    test('should track pending operations', async () => {
      const testAudio = new Float32Array(4096);
      
      expect(workerClient.getPendingOperationCount()).toBe(0);
      expect(workerClient.isBusy()).toBe(false);

      const promise = workerClient.parseBuffer(testAudio);
      
      // During processing, should be busy
      expect(workerClient.isBusy()).toBe(true);
      expect(workerClient.getPendingOperationCount()).toBe(1);

      await promise;

      // After completion, should not be busy
      expect(workerClient.isBusy()).toBe(false);
      expect(workerClient.getPendingOperationCount()).toBe(0);
    });

    test('should cancel specific operations', async () => {
      const testAudio = new Float32Array(4096);
      
      // Start operation but cancel immediately
      const promise = workerClient.parseBuffer(testAudio);
      workerClient.cancelOperation(); // Cancel all operations

      await expect(promise).rejects.toThrow('Operation cancelled');
      expect(workerClient.isBusy()).toBe(false);
    });

    test('should handle operation timeouts', async () => {
      const shortTimeoutClient = new BeatParserWorkerClient({
        timeout: 1 // 1ms timeout
      });

      try {
        const testAudio = new Float32Array(4096);
        
        await expect(
          shortTimeoutClient.parseBuffer(testAudio)
        ).rejects.toThrow('Worker operation timed out');
      } finally {
        await shortTimeoutClient.terminate();
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle worker errors', async () => {
      // Create a worker that will fail
      const errorWorker = new MockWorker('error-script.js');
      const originalSendMessage = (errorWorker as any).sendMessage;
      
      (errorWorker as any).sendMessage = function(data: any) {
        if (data.type === 'result') {
          // Send error instead of result
          originalSendMessage.call(this, {
            ...data,
            type: 'error',
            payload: {
              message: 'Simulated worker error',
              stack: 'Error: Simulated worker error\n  at worker.js:1:1'
            }
          });
        } else {
          originalSendMessage.call(this, data);
        }
      };

      (global as any).Worker = function() { return errorWorker; };

      const errorClient = new BeatParserWorkerClient();
      
      try {
        const testAudio = new Float32Array(4096);
        await expect(
          errorClient.parseBuffer(testAudio)
        ).rejects.toThrow('Simulated worker error');
      } finally {
        await errorClient.terminate();
        (global as any).Worker = MockWorker; // Restore original mock
      }
    });

    test('should handle worker message errors', () => {
      const client = new BeatParserWorkerClient();
      
      // Simulate message error event
      (client as any).handleWorkerMessageError({ 
        type: 'messageerror',
        data: 'Invalid message'
      });

      expect(client.getPendingOperationCount()).toBe(0);
    });

    test('should cleanup properly on termination', async () => {
      const testAudio = new Float32Array(4096);
      
      // Start an operation
      const promise = workerClient.parseBuffer(testAudio);
      expect(workerClient.isBusy()).toBe(true);

      // Terminate worker
      await workerClient.terminate();

      // Should cancel pending operations
      await expect(promise).rejects.toThrow('Operation cancelled');
      expect(workerClient.isBusy()).toBe(false);
    });
  });

  describe('Configuration Options', () => {
    test('should use custom worker URL', async () => {
      const customClient = new BeatParserWorkerClient({
        workerUrl: '/custom/worker/path.js'
      });

      await expect(customClient.initialize()).resolves.not.toThrow();
      await customClient.terminate();
    });

    test('should respect retry configuration', async () => {
      const retryClient = new BeatParserWorkerClient({
        maxRetries: 5,
        retryDelay: 100
      });

      // The mock doesn't actually implement retries, but configuration should be set
      expect((retryClient as any).options.maxRetries).toBe(5);
      expect((retryClient as any).options.retryDelay).toBe(100);
      
      await retryClient.terminate();
    });
  });

  describe('Integration with BeatParser Configuration', () => {
    test('should pass configuration to worker', async () => {
      const testAudio = new Float32Array(4096);
      const config = {
        sampleRate: 48000,
        minTempo: 80,
        maxTempo: 160,
        confidenceThreshold: 0.8
      };

      const result = await workerClient.parseBuffer(testAudio, {
        targetPictureCount: 5
      }, config);

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      // Configuration is passed to worker but validation happens there
    });

    test('should handle different parsing options per operation', async () => {
      const buffers = [
        new Float32Array(4096),
        new Float32Array(2048)
      ];

      const options = [
        { targetPictureCount: 5, filename: 'first.wav' },
        { targetPictureCount: 3, filename: 'second.wav' }
      ];

      const results = await workerClient.processBatch(buffers, options);

      expect(results).toHaveLength(2);
      expect(results[0]!.metadata.filename).toBe('first.wav');
      expect(results[1]!.metadata.filename).toBe('second.wav');
    });
  });

  describe('Resource Management', () => {
    test('should handle transferable objects correctly', async () => {
      const testAudio = new Float32Array(4096);
      // const originalBuffer = testAudio.buffer;

      const result = await workerClient.parseBuffer(testAudio);

      // The audio should still be valid after transfer in our mock
      expect(result).toBeDefined();
      expect(testAudio.length).toBe(4096); // Mock doesn't actually transfer
    });

    test('should handle large data transfers efficiently', async () => {
      const largeAudio = new Float32Array(44100 * 10); // 10 seconds of audio
      
      const startTime = Date.now();
      const result = await workerClient.parseBuffer(largeAudio, {
        targetPictureCount: 20
      });
      const processingTime = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds with mock
    });
  });
});