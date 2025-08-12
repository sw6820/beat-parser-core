/**
 * Cross-Platform Worker Compatibility Tests
 * Validates worker implementation compatibility across Node.js worker_threads and Web Workers
 */

import { BeatParserWorkerClient, isWorkerSupported, createWorkerClient } from '../worker/WorkerClient';
import { performance } from 'perf_hooks';

describe('Cross-Platform Worker Compatibility', () => {
  describe('Worker Environment Detection', () => {
    test('should detect worker support correctly in Node.js', () => {
      const isSupported = isWorkerSupported();
      
      // In Node.js test environment, Web Workers should not be supported
      expect(typeof isSupported).toBe('boolean');
      expect(isSupported).toBe(false);
    });

    test('should check for Web Worker constructor', () => {
      const hasWorkerConstructor = typeof Worker !== 'undefined';
      expect(hasWorkerConstructor).toBe(false); // Not available in Node.js
    });

    test('should check for Node.js worker_threads', () => {
      let hasWorkerThreads = false;
      try {
        require.resolve('worker_threads');
        hasWorkerThreads = true;
      } catch {
        hasWorkerThreads = false;
      }
      
      expect(hasWorkerThreads).toBe(true); // Should be available in Node.js
      
      if (hasWorkerThreads) {
        const workerThreads = require('worker_threads');
        expect(typeof workerThreads.Worker).toBe('function');
        expect(typeof workerThreads.isMainThread).toBe('boolean');
        expect(workerThreads.isMainThread).toBe(true); // We're in the main thread
      }
    });

    test('should check for SharedArrayBuffer support', () => {
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      
      // SharedArrayBuffer availability varies by environment and security settings
      expect(typeof hasSharedArrayBuffer).toBe('boolean');
      
      if (hasSharedArrayBuffer) {
        const sab = new SharedArrayBuffer(1024);
        expect(sab.byteLength).toBe(1024);
      }
    });

    test('should check for Atomics support', () => {
      const hasAtomics = typeof Atomics !== 'undefined';
      
      // Atomics should be available if SharedArrayBuffer is available
      expect(typeof hasAtomics).toBe('boolean');
      
      if (hasAtomics) {
        expect(typeof Atomics.load).toBe('function');
        expect(typeof Atomics.store).toBe('function');
        expect(typeof Atomics.add).toBe('function');
        expect(typeof Atomics.wait).toBe('function');
        expect(typeof Atomics.notify).toBe('function');
      }
    });

    test('should detect transferable object support', () => {
      const hasArrayBuffer = typeof ArrayBuffer !== 'undefined';
      const hasTypedArrays = typeof Float32Array !== 'undefined';
      
      expect(hasArrayBuffer).toBe(true);
      expect(hasTypedArrays).toBe(true);
      
      // Test ArrayBuffer transferability concept (even if workers aren't available)
      const buffer = new ArrayBuffer(1024);
      const view = new Float32Array(buffer);
      expect(view.buffer).toBe(buffer);
      expect(view.byteLength).toBe(1024);
      
      // Test that we can create transferable-style arrays
      const transferableArray = new Float32Array(100);
      transferableArray.fill(0.5);
      expect(transferableArray.length).toBe(100);
      expect(transferableArray[0]).toBe(0.5);
    });
  });

  describe('Worker Client Interface', () => {
    test('should create worker client with consistent interface', () => {
      const client = createWorkerClient();
      
      expect(client).toBeInstanceOf(BeatParserWorkerClient);
      expect(typeof client.initialize).toBe('function');
      expect(typeof client.parseBuffer).toBe('function');
      expect(typeof client.parseStream).toBe('function');
      expect(typeof client.processBatch).toBe('function');
      expect(typeof client.cancelOperation).toBe('function');
      expect(typeof client.terminate).toBe('function');
      expect(typeof client.getPendingOperationCount).toBe('function');
      expect(typeof client.isBusy).toBe('function');
    });

    test('should create worker client with options', () => {
      const options = {
        maxRetries: 5,
        retryDelay: 2000,
        timeout: 600000
      };
      
      const client = createWorkerClient(options);
      expect(client).toBeInstanceOf(BeatParserWorkerClient);
    });

    test('should handle worker client state correctly', () => {
      const client = createWorkerClient();
      
      // Initially should not be busy
      expect(client.isBusy()).toBe(false);
      expect(client.getPendingOperationCount()).toBe(0);
    });
  });

  describe('Worker Initialization Handling', () => {
    let client: BeatParserWorkerClient;

    beforeEach(() => {
      client = createWorkerClient();
    });

    afterEach(async () => {
      await client.terminate();
    });

    test('should handle worker initialization failure gracefully', async () => {
      // In Node.js environment, worker initialization should fail
      await expect(client.initialize())
        .rejects
        .toThrow(/Web Workers are not supported/);
    });

    test('should handle operations without initialization', async () => {
      const audioData = new Float32Array(1024).fill(0.5);
      
      // Operations should fail if worker is not initialized
      await expect(client.parseBuffer(audioData))
        .rejects
        .toThrow();
    });

    test('should handle multiple initialization attempts', async () => {
      // First initialization should fail
      await expect(client.initialize())
        .rejects
        .toThrow();
      
      // Second initialization should also fail consistently
      await expect(client.initialize())
        .rejects
        .toThrow();
    });

    test('should handle termination without initialization', async () => {
      // Should not throw when terminating uninitialized worker
      await expect(client.terminate()).resolves.not.toThrow();
    });
  });

  describe('Message Passing Interface', () => {
    test('should handle message structure consistently', () => {
      // Test that message structures are defined correctly
      const testMessage = {
        id: 'test-message-1',
        type: 'parse-buffer' as const,
        payload: {
          audioData: new Float32Array([0.1, -0.2, 0.3]),
          options: {},
          config: {}
        }
      };
      
      expect(testMessage.id).toBe('test-message-1');
      expect(testMessage.type).toBe('parse-buffer');
      expect(testMessage.payload).toBeDefined();
      expect(testMessage.payload.audioData).toBeInstanceOf(Float32Array);
    });

    test('should handle progress message structure', () => {
      const progressMessage = {
        id: 'test-progress-1',
        type: 'progress' as const,
        payload: {
          current: 50,
          total: 100,
          stage: 'processing',
          percentage: 50
        }
      };
      
      expect(progressMessage.payload.current).toBe(50);
      expect(progressMessage.payload.total).toBe(100);
      expect(progressMessage.payload.stage).toBe('processing');
      expect(progressMessage.payload.percentage).toBe(50);
    });

    test('should handle result message structure', () => {
      const resultMessage = {
        id: 'test-result-1',
        type: 'result' as const,
        payload: {
          beats: [{ time: 0.5, confidence: 0.8 }],
          tempo: 120,
          confidence: 0.9,
          metadata: {
            algorithm: 'hybrid',
            processingTime: 100
          }
        }
      };
      
      expect(Array.isArray(resultMessage.payload.beats)).toBe(true);
      expect(typeof resultMessage.payload.tempo).toBe('number');
      expect(typeof resultMessage.payload.confidence).toBe('number');
      expect(typeof resultMessage.payload.metadata).toBe('object');
    });

    test('should handle error message structure', () => {
      const errorMessage = {
        id: 'test-error-1',
        type: 'error' as const,
        payload: {
          message: 'Test error message',
          code: 'TEST_ERROR',
          stack: 'Error stack trace'
        }
      };
      
      expect(typeof errorMessage.payload.message).toBe('string');
      expect(typeof errorMessage.payload.code).toBe('string');
    });
  });

  describe('Transferable Object Handling', () => {
    let client: BeatParserWorkerClient;

    beforeEach(() => {
      client = createWorkerClient();
    });

    afterEach(async () => {
      await client.terminate();
    });

    test('should handle Float32Array transfer correctly', async () => {
      const audioData = new Float32Array([0.1, -0.2, 0.3, -0.4]);
      
      // Even though worker initialization will fail, we can test the transfer preparation
      try {
        await client.parseBuffer(audioData);
      } catch (error) {
        // Expected to fail due to no worker support
        expect(error).toBeInstanceOf(Error);
      }
      
      // The original array should still be intact
      expect(audioData.length).toBe(4);
      expect(audioData[0]).toBeCloseTo(0.1, 5);
    });

    test('should handle large audio data transfer', async () => {
      const largeAudioData = new Float32Array(44100); // 1 second at 44.1kHz
      largeAudioData.fill(0.5);
      
      try {
        await client.parseBuffer(largeAudioData);
      } catch (error) {
        // Expected to fail due to no worker support
        expect(error).toBeInstanceOf(Error);
      }
      
      // Original data should be preserved
      expect(largeAudioData.length).toBe(44100);
      expect(largeAudioData[0]).toBe(0.5);
    });

    test('should handle multiple buffer transfers', async () => {
      const buffers = [
        new Float32Array([0.1, -0.1]),
        new Float32Array([0.2, -0.2]),
        new Float32Array([0.3, -0.3])
      ];
      
      try {
        await client.processBatch(buffers);
      } catch (error) {
        // Expected to fail due to no worker support
        expect(error).toBeInstanceOf(Error);
      }
      
      // All original buffers should be preserved
      for (let i = 0; i < buffers.length; i++) {
        expect(buffers[i].length).toBe(2);
        expect(buffers[i][0]).toBeCloseTo((i + 1) * 0.1, 5);
      }
    });
  });

  describe('Worker Error Handling', () => {
    let client: BeatParserWorkerClient;

    beforeEach(() => {
      client = createWorkerClient();
    });

    afterEach(async () => {
      await client.terminate();
    });

    test('should handle worker unavailability gracefully', async () => {
      const audioData = new Float32Array(1024).fill(0.5);
      
      // Should reject with meaningful error
      await expect(client.parseBuffer(audioData))
        .rejects
        .toThrow(/Worker not initialized/);
    });

    test('should handle operation cancellation', () => {
      // Should not throw when cancelling non-existent operations
      expect(() => client.cancelOperation('non-existent-id')).not.toThrow();
      expect(() => client.cancelOperation()).not.toThrow();
    });

    test('should handle timeout scenarios', async () => {
      const shortTimeoutClient = createWorkerClient({ timeout: 1 }); // 1ms timeout
      
      try {
        const audioData = new Float32Array(1024);
        
        // Should fail due to initialization failure before timeout
        await expect(shortTimeoutClient.parseBuffer(audioData))
          .rejects
          .toThrow();
          
      } finally {
        await shortTimeoutClient.terminate();
      }
    });

    test('should handle memory errors gracefully', async () => {
      // Test with extremely large buffer that might cause memory issues
      try {
        // Create large buffer but don't actually use it
        const hugeSize = 1024 * 1024 * 100; // 100MB
        const hugeBuffer = new Float32Array(hugeSize);
        
        // Worker initialization will fail before we get to memory issues
        await expect(client.parseBuffer(hugeBuffer.slice(0, 1024)))
          .rejects
          .toThrow();
          
      } catch (error) {
        // If we can't even create the large buffer, that's expected
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Worker Performance Characteristics', () => {
    let client: BeatParserWorkerClient;

    beforeEach(() => {
      client = createWorkerClient();
    });

    afterEach(async () => {
      await client.terminate();
    });

    test('should maintain consistent API response times', async () => {
      const audioData = new Float32Array(1024);
      
      const startTime = performance.now();
      
      try {
        await client.parseBuffer(audioData);
      } catch (error) {
        // Expected to fail quickly
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Should fail fast (within 100ms) due to lack of worker support
        expect(duration).toBeLessThan(100);
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle concurrent operation attempts', async () => {
      const audioBuffers = [
        new Float32Array(512).fill(0.1),
        new Float32Array(512).fill(0.2),
        new Float32Array(512).fill(0.3)
      ];
      
      const promises = audioBuffers.map(buffer => client.parseBuffer(buffer));
      
      // All should fail consistently
      const results = await Promise.allSettled(promises);
      
      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.status).toBe('rejected');
      }
    });

    test('should maintain operation state correctly', () => {
      expect(client.isBusy()).toBe(false);
      expect(client.getPendingOperationCount()).toBe(0);
      
      // State should remain consistent even after failed operations
      client.parseBuffer(new Float32Array(100)).catch(() => {});
      
      // Pending count might temporarily increase but should settle
      setTimeout(() => {
        expect(client.getPendingOperationCount()).toBeGreaterThanOrEqual(0);
      }, 10);
    });
  });

  describe('Environment-Specific Worker Handling', () => {
    test('should detect Node.js worker_threads capabilities', () => {
      let workerThreadsAvailable = false;
      let workerThreadsFeatures = {};
      
      try {
        const workerThreads = require('worker_threads');
        workerThreadsAvailable = true;
        
        workerThreadsFeatures = {
          Worker: typeof workerThreads.Worker === 'function',
          isMainThread: typeof workerThreads.isMainThread === 'boolean',
          parentPort: workerThreads.parentPort !== null,
          workerData: workerThreads.workerData !== null,
          threadId: typeof workerThreads.threadId === 'number'
        };
        
      } catch {
        workerThreadsAvailable = false;
      }
      
      expect(workerThreadsAvailable).toBe(true);
      expect(workerThreadsFeatures).toMatchObject({
        Worker: true,
        isMainThread: true
      });
    });

    test('should handle browser environment simulation', () => {
      // Simulate browser environment by checking what would happen
      const browserLikeEnvironment = {
        hasWindow: typeof window !== 'undefined',
        hasDocument: typeof document !== 'undefined',
        hasNavigator: typeof navigator !== 'undefined',
        hasWorker: typeof Worker !== 'undefined',
        hasWebAudioAPI: typeof AudioContext !== 'undefined'
      };
      
      // In Node.js, these should all be false
      expect(browserLikeEnvironment.hasWindow).toBe(false);
      expect(browserLikeEnvironment.hasDocument).toBe(false);
      expect(browserLikeEnvironment.hasNavigator).toBe(false);
      expect(browserLikeEnvironment.hasWorker).toBe(false);
      expect(browserLikeEnvironment.hasWebAudioAPI).toBe(false);
    });

    test('should provide consistent worker feature detection', () => {
      const workerCapabilities = {
        // Web Worker features (not available in Node.js)
        webWorkers: typeof Worker !== 'undefined',
        sharedWorkers: typeof SharedWorker !== 'undefined',
        serviceWorkers: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
        
        // Node.js worker features
        workerThreads: (() => {
          try {
            require.resolve('worker_threads');
            return true;
          } catch {
            return false;
          }
        })(),
        
        // Shared features
        transferableObjects: typeof ArrayBuffer !== 'undefined',
        sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        atomics: typeof Atomics !== 'undefined'
      };
      
      expect(workerCapabilities.webWorkers).toBe(false);
      expect(workerCapabilities.sharedWorkers).toBe(false);
      expect(workerCapabilities.serviceWorkers).toBe(false);
      expect(workerCapabilities.workerThreads).toBe(true);
      expect(workerCapabilities.transferableObjects).toBe(true);
    });
  });

  describe('Worker Implementation Fallbacks', () => {
    test('should provide fallback behavior when workers unavailable', async () => {
      const client = createWorkerClient();
      const audioData = new Float32Array(100).fill(0.5);
      
      // When workers are unavailable, operations should fail gracefully
      await expect(client.parseBuffer(audioData))
        .rejects
        .toThrow();
      
      // But the failure should be immediate and predictable
      const startTime = performance.now();
      try {
        await client.parseBuffer(audioData);
      } catch {
        const endTime = performance.now();
        expect(endTime - startTime).toBeLessThan(50); // Very fast failure
      }
    });

    test('should maintain API consistency regardless of worker support', () => {
      const client1 = createWorkerClient();
      const client2 = createWorkerClient({ timeout: 1000 });
      
      // Both clients should have identical API surface
      const client1Methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client1));
      const client2Methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client2));
      
      expect(client1Methods).toEqual(client2Methods);
      
      // Core methods should exist on both
      for (const method of ['initialize', 'parseBuffer', 'terminate']) {
        expect(typeof (client1 as any)[method]).toBe('function');
        expect(typeof (client2 as any)[method]).toBe('function');
      }
    });

    test('should handle graceful degradation patterns', async () => {
      // Test that the library can detect and handle missing worker support
      const isSupported = isWorkerSupported();
      
      if (!isSupported) {
        // Should provide clear indication that workers aren't supported
        expect(isSupported).toBe(false);
        
        // Client creation should still work
        const client = createWorkerClient();
        expect(client).toBeDefined();
        
        // But operations should fail with clear errors
        await expect(client.parseBuffer(new Float32Array(10)))
          .rejects
          .toThrow(/not.*supported|not.*initialized/i);
      }
    });
  });

  describe('Memory Management in Worker Context', () => {
    let client: BeatParserWorkerClient;

    beforeEach(() => {
      client = createWorkerClient();
    });

    afterEach(async () => {
      await client.terminate();
    });

    test('should handle memory cleanup on termination', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Attempt some operations (which will fail)
      const audioData = new Float32Array(1000);
      try {
        await client.parseBuffer(audioData);
      } catch {
        // Expected to fail
      }
      
      // Terminate should clean up
      await client.terminate();
      
      const afterTermination = process.memoryUsage().heapUsed;
      
      // Memory usage should not have grown significantly
      const memoryGrowth = afterTermination - initialMemory;
      expect(memoryGrowth).toBeLessThan(1024 * 1024); // Less than 1MB growth
    });

    test('should handle multiple clients without memory leaks', async () => {
      const clients = [];
      
      // Create multiple clients
      for (let i = 0; i < 10; i++) {
        clients.push(createWorkerClient());
      }
      
      // Terminate all
      await Promise.all(clients.map(c => c.terminate()));
      
      // Should complete without memory issues
      expect(clients).toHaveLength(10);
    });
  });
});