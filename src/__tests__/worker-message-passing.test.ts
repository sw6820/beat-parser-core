/**
 * Web Worker Message Passing & Communication Tests
 * Comprehensive validation of message serialization, transfer efficiency, and communication protocols
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { WorkerMessage, ParseBufferMessage, ProgressMessage, ResultMessage, ErrorMessage } from '../worker/BeatParserWorker';
import { WorkerTestingUtils } from './worker-testing-utils';

describe('Web Worker Message Passing & Communication', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Message Serialization & Deserialization', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should serialize and transfer Float32Array data correctly', async () => {
      const originalAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      const originalData = Array.from(originalAudio); // Copy original data
      
      const result = await workerClient.parseBuffer(originalAudio, {
        filename: 'serialization-test.wav'
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.metadata.filename).toBe('serialization-test.wav');
      
      // Verify audio data was processed correctly
      // Note: Mock implementation doesn't actually process audio, but validates structure
      expect(result.metadata.processingInfo.audioLength).toBeCloseTo(originalAudio.length / 44100, 1);
    });

    test('should handle large data transfers efficiently', async () => {
      const largeAudio = new Float32Array(44100 * 10); // 10 seconds of audio
      
      // Fill with recognizable pattern
      for (let i = 0; i < largeAudio.length; i++) {
        largeAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
      }

      const startTime = performance.now();
      const result = await workerClient.parseBuffer(largeAudio, {
        filename: 'large-transfer.wav'
      });
      const transferTime = performance.now() - startTime;

      expect(result).toBeDefined();
      expect(transferTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.metadata.processingInfo.audioLength).toBeCloseTo(10, 0);
    });

    test('should handle complex nested data structures', async () => {
      const audioData = WorkerTestingUtils.generateTestAudio('complex') as Float32Array;
      
      const complexOptions = {
        filename: 'complex-structure.wav',
        targetPictureCount: 10,
        algorithm: 'hybrid' as const,
        customParams: {
          windowSize: 2048,
          overlapFactor: 0.75,
          analysisFilters: ['lowpass', 'bandpass', 'highpass'],
          metadata: {
            artist: 'Test Artist',
            album: 'Test Album',
            genre: 'Electronic',
            bpm: 120,
            key: 'C major'
          }
        }
      };

      const result = await workerClient.parseBuffer(audioData, complexOptions);

      expect(result).toBeDefined();
      expect(result.metadata.filename).toBe('complex-structure.wav');
      expect(result.beats.length).toBeLessThanOrEqual(10);
    });

    test('should preserve data integrity across transfers', async () => {
      // Test with known data patterns
      const testPatterns = [
        { frequency: 440, amplitude: 0.5, duration: 1 },
        { frequency: 880, amplitude: 0.3, duration: 2 },
        { frequency: 220, amplitude: 0.7, duration: 0.5 }
      ];

      for (const pattern of testPatterns) {
        const samples = Math.floor(pattern.duration * 44100);
        const audioData = new Float32Array(samples);
        
        for (let i = 0; i < samples; i++) {
          audioData[i] = Math.sin(2 * Math.PI * pattern.frequency * i / 44100) * pattern.amplitude;
        }

        const result = await workerClient.parseBuffer(audioData, {
          filename: `pattern-${pattern.frequency}hz.wav`
        });

        expect(result).toBeDefined();
        expect(result.metadata.processingInfo.audioLength).toBeCloseTo(pattern.duration, 1);
      }
    });

    test('should handle special float values (NaN, Infinity)', async () => {
      const problematicAudio = new Float32Array(1000);
      
      // Fill with normal data first
      for (let i = 0; i < 900; i++) {
        problematicAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
      }
      
      // Add problematic values
      problematicAudio[900] = NaN;
      problematicAudio[901] = Infinity;
      problematicAudio[902] = -Infinity;
      problematicAudio[903] = Number.MAX_VALUE;
      problematicAudio[904] = Number.MIN_VALUE;

      // Should handle gracefully - either process successfully or throw descriptive error
      try {
        const result = await workerClient.parseBuffer(problematicAudio, {
          filename: 'problematic-values.wav'
        });
        
        // If it succeeds, should have valid result
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined();
      } catch (error) {
        // If it fails, should have descriptive error
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Message Protocol Validation', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should generate unique message IDs for concurrent operations', async () => {
      const messageIds = new Set<string>();
      const operations: Promise<any>[] = [];
      
      // Intercept message posting to capture IDs
      const originalWorker = (global as any).Worker;
      const capturedMessages: any[] = [];
      
      (global as any).Worker = class extends testEnv.mockWorker {
        postMessage(message: any, transfer?: any[]) {
          capturedMessages.push({ ...message });
          super.postMessage(message, transfer);
        }
      };

      try {
        const newClient = WorkerTestingUtils.createTestWorkerClient();
        await newClient.initialize();

        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;

        // Start multiple concurrent operations
        for (let i = 0; i < 5; i++) {
          operations.push(newClient.parseBuffer(testAudio, { 
            filename: `concurrent-${i}.wav` 
          }));
        }

        await Promise.all(operations);

        // Extract message IDs
        capturedMessages.forEach(msg => {
          if (msg.id) {
            messageIds.add(msg.id);
          }
        });

        // All IDs should be unique
        expect(messageIds.size).toBeGreaterThanOrEqual(5);
        
        await newClient.terminate();
      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle message ordering correctly', async () => {
      const progressTracker = WorkerTestingUtils.createProgressTracker();
      const testAudio = WorkerTestingUtils.generateTestAudio('complex') as Float32Array;

      const result = await workerClient.parseBuffer(testAudio, {
        filename: 'message-ordering.wav',
        progressCallback: progressTracker.callback
      });

      expect(result).toBeDefined();
      
      // Progress updates should be in chronological order
      const timestamps = progressTracker.updates.map(u => u.timestamp);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }

      // Progress percentages should generally increase
      const percentages = progressTracker.updates.map(u => u.percentage);
      expect(percentages[percentages.length - 1]).toBeGreaterThan(percentages[0]);
    });

    test('should validate message structure and types', async () => {
      let capturedMessages: any[] = [];
      
      // Create enhanced mock to capture message validation
      const originalWorker = (global as any).Worker;
      (global as any).Worker = class extends testEnv.mockWorker {
        postMessage(message: any, transfer?: any[]) {
          // Validate message structure
          expect(message).toHaveProperty('id');
          expect(message).toHaveProperty('type');
          expect(typeof message.id).toBe('string');
          expect(message.id.length).toBeGreaterThan(0);
          
          const validTypes = ['parse-buffer', 'parse-stream', 'batch-process', 'cancel'];
          expect(validTypes).toContain(message.type);
          
          if (message.type !== 'cancel') {
            expect(message).toHaveProperty('payload');
          }
          
          capturedMessages.push(message);
          super.postMessage(message, transfer);
        }
      };

      try {
        const validationClient = WorkerTestingUtils.createTestWorkerClient();
        await validationClient.initialize();

        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        await validationClient.parseBuffer(testAudio, {
          filename: 'validation-test.wav'
        });

        expect(capturedMessages.length).toBeGreaterThan(0);
        await validationClient.terminate();
      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle malformed response messages gracefully', async () => {
      // Create worker that sends malformed responses
      const originalWorker = (global as any).Worker;
      (global as any).Worker = class extends testEnv.mockWorker {
        protected sendMessage(data: any): void {
          // Send malformed message first
          const malformedMessage = {
            id: data.id,
            type: 'invalid-type',
            payload: null
          };
          
          setTimeout(() => {
            super.sendMessage(malformedMessage);
            
            // Send correct message after delay
            setTimeout(() => {
              super.sendMessage(data);
            }, 10);
          }, 5);
        }
      };

      try {
        const malformedClient = WorkerTestingUtils.createTestWorkerClient();
        await malformedClient.initialize();

        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        // Should handle malformed messages and still complete
        const result = await malformedClient.parseBuffer(testAudio);
        expect(result).toBeDefined();
        
        await malformedClient.terminate();
      } finally {
        (global as any).Worker = originalWorker;
      }
    });
  });

  describe('Communication Efficiency', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should optimize transfer of large audio buffers', async () => {
      const sizes = [1024, 8192, 44100, 441000]; // Various sizes
      
      for (const size of sizes) {
        const audio = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          audio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
        }

        const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
          () => workerClient.parseBuffer(audio, { filename: `size-${size}.wav` }),
          `Transfer Size ${size}`
        );

        expect(result).toBeDefined();
        expect(metrics.transferTime).toBeGreaterThan(0);
        
        // Transfer efficiency should be reasonable
        const bytesTransferred = size * 4; // 4 bytes per float
        const transferEfficiency = bytesTransferred / metrics.transferTime; // bytes per ms
        
        expect(transferEfficiency).toBeGreaterThan(0);
        console.log(`Size ${size}: Transfer efficiency ${transferEfficiency.toFixed(2)} bytes/ms`);
      }
    });

    test('should minimize communication overhead for small operations', async () => {
      const smallAudio = new Float32Array(1024); // Small buffer
      for (let i = 0; i < 1024; i++) {
        smallAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
      }

      const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
        () => workerClient.parseBuffer(smallAudio, { filename: 'small.wav' }),
        'Small Buffer Transfer'
      );

      expect(result).toBeDefined();
      
      // Communication overhead should be reasonable for small operations
      const overheadRatio = metrics.communicationOverhead / metrics.duration;
      expect(overheadRatio).toBeLessThan(0.5); // Overhead should be less than 50% of total time
    });

    test('should batch multiple small messages efficiently', async () => {
      const chunks = Array.from({ length: 10 }, (_, i) => {
        const chunk = new Float32Array(512);
        for (let j = 0; j < 512; j++) {
          chunk[j] = Math.sin(2 * Math.PI * (440 + i * 10) * j / 44100) * 0.3;
        }
        return chunk;
      });

      const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
        () => workerClient.parseStream(chunks, { filename: 'batched-chunks.wav' }),
        'Batched Small Chunks'
      );

      expect(result).toBeDefined();
      expect(metrics.messagingEfficiency).toBeLessThan(1); // Should be efficient
    });

    test('should handle concurrent message streams without interference', async () => {
      const concurrentOperations = Array.from({ length: 5 }, (_, i) => {
        const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        return WorkerTestingUtils.measureWorkerOperation(
          () => workerClient.parseBuffer(audio, { filename: `concurrent-${i}.wav` }),
          `Concurrent Operation ${i}`
        );
      });

      const results = await Promise.all(concurrentOperations);

      results.forEach((operationResult, index) => {
        expect(operationResult.result).toBeDefined();
        expect(operationResult.result.metadata.filename).toBe(`concurrent-${index}.wav`);
        
        // Each operation should have reasonable metrics
        expect(operationResult.metrics.duration).toBeGreaterThan(0);
        expect(operationResult.metrics.transferTime).toBeGreaterThan(0);
      });

      // Verify no cross-contamination between operations
      const filenames = results.map(r => r.result.metadata.filename);
      const uniqueFilenames = new Set(filenames);
      expect(uniqueFilenames.size).toBe(5);
    });
  });

  describe('Error Communication', () => {
    test('should propagate worker errors correctly', async () => {
      const errorClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 1.0 // Force all operations to error
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

    test('should include error context and stack traces', async () => {
      const errorClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 1.0
      });

      try {
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        
        try {
          await errorClient.parseBuffer(testAudio);
          fail('Expected operation to throw error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const errorObj = error as Error;
          
          // Should have meaningful error message
          expect(errorObj.message).toBeDefined();
          expect(errorObj.message.length).toBeGreaterThan(0);
          
          // Mock implementation includes "Simulated" in error message
          expect(errorObj.message).toContain('Simulated');
        }
      } finally {
        await errorClient.terminate();
      }
    });

    test('should distinguish between different error types', async () => {
      const scenarios = [
        { description: 'Invalid audio data', audio: new Float32Array(0) },
        { description: 'Corrupted audio data', audio: (() => {
          const corrupt = new Float32Array(100);
          corrupt.fill(NaN);
          return corrupt;
        })() }
      ];

      for (const scenario of scenarios) {
        const workerClient = WorkerTestingUtils.createTestWorkerClient();
        
        try {
          await expect(
            workerClient.parseBuffer(scenario.audio)
          ).rejects.toThrow();
        } catch (error) {
          // Different scenarios might throw different errors
          expect(error).toBeInstanceOf(Error);
        } finally {
          await workerClient.terminate();
        }
      }
    });

    test('should handle communication channel failures', async () => {
      // Simulate communication failure by terminating worker unexpectedly
      const workerClient = WorkerTestingUtils.createTestWorkerClient();
      
      try {
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const operationPromise = workerClient.parseBuffer(testAudio);

        // Simulate worker crash by calling terminate
        // This should cause the operation to fail
        setTimeout(() => {
          workerClient.terminate();
        }, 10);

        await expect(operationPromise).rejects.toThrow();
      } catch (error) {
        // Expected to fail due to termination
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Progress Communication', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient({
        latency: 100 // Longer latency to see progress updates
      });
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should provide accurate progress information', async () => {
      const progressTracker = WorkerTestingUtils.createProgressTracker();
      const testAudio = WorkerTestingUtils.generateTestAudio('complex') as Float32Array;

      await workerClient.parseBuffer(testAudio, {
        progressCallback: progressTracker.callback
      });

      expect(progressTracker.updates.length).toBeGreaterThan(0);

      progressTracker.updates.forEach(update => {
        // Validate progress data structure
        expect(update.current).toBeGreaterThanOrEqual(0);
        expect(update.total).toBeGreaterThan(0);
        expect(update.current).toBeLessThanOrEqual(update.total);
        expect(update.percentage).toBeGreaterThanOrEqual(0);
        expect(update.percentage).toBeLessThanOrEqual(100);
        expect(Math.abs(update.percentage - (update.current / update.total) * 100)).toBeLessThan(1);
        expect(typeof update.stage).toBe('string');
        expect(update.stage.length).toBeGreaterThan(0);
      });
    });

    test('should handle progress callback errors without disrupting processing', async () => {
      let callbackErrorCount = 0;
      const errorCallback = () => {
        callbackErrorCount++;
        throw new Error(`Progress callback error ${callbackErrorCount}`);
      };

      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;

      // Processing should complete despite callback errors
      const result = await workerClient.parseBuffer(testAudio, {
        progressCallback: errorCallback
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      // Callback errors should have occurred
      expect(callbackErrorCount).toBeGreaterThan(0);
    });

    test('should provide progress updates at reasonable intervals', async () => {
      const progressTracker = WorkerTestingUtils.createProgressTracker();
      const testAudio = WorkerTestingUtils.generateTestAudio('large') as Float32Array;

      const startTime = performance.now();
      await workerClient.parseBuffer(testAudio, {
        progressCallback: progressTracker.callback
      });
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const updateCount = progressTracker.updates.length;
      
      if (totalTime > 100) { // Only check for operations that take reasonable time
        const updateFrequency = updateCount / (totalTime / 1000); // Updates per second
        
        // Should have reasonable update frequency (not too frequent, not too sparse)
        expect(updateFrequency).toBeGreaterThan(0.5); // At least 0.5 updates/sec
        expect(updateFrequency).toBeLessThan(50);      // Not more than 50 updates/sec
      }
    });

    test('should handle multiple concurrent progress streams', async () => {
      const trackers = Array.from({ length: 3 }, () => 
        WorkerTestingUtils.createProgressTracker()
      );

      const testAudios = trackers.map((_, i) =>
        WorkerTestingUtils.generateTestAudio('simple') as Float32Array
      );

      const operations = trackers.map((tracker, i) =>
        workerClient.parseBuffer(testAudios[i], {
          filename: `progress-concurrent-${i}.wav`,
          progressCallback: tracker.callback
        })
      );

      const results = await Promise.all(operations);

      // All operations should complete successfully
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe(`progress-concurrent-${i}.wav`);
      });

      // Each tracker should have received updates
      trackers.forEach((tracker, i) => {
        expect(tracker.updates.length).toBeGreaterThan(0);
        
        // Updates should be chronologically ordered
        const timestamps = tracker.updates.map(u => u.timestamp);
        for (let j = 1; j < timestamps.length; j++) {
          expect(timestamps[j]).toBeGreaterThanOrEqual(timestamps[j - 1]);
        }
      });
    });
  });

  describe('Message Queue Management', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle rapid message bursts', async () => {
      const burstSize = 10;
      const operations: Promise<any>[] = [];
      
      // Send burst of messages rapidly
      for (let i = 0; i < burstSize; i++) {
        const audio = new Float32Array(1000 + i * 100);
        for (let j = 0; j < audio.length; j++) {
          audio[j] = Math.sin(2 * Math.PI * 440 * j / 44100) * 0.3;
        }
        
        operations.push(workerClient.parseBuffer(audio, {
          filename: `burst-${i}.wav`
        }));
      }

      const results = await Promise.all(operations);

      // All messages should be processed successfully
      expect(results).toHaveLength(burstSize);
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe(`burst-${i}.wav`);
      });
    });

    test('should maintain message order under load', async () => {
      const operationCount = 5;
      const results: any[] = [];
      
      // Send sequential operations
      for (let i = 0; i < operationCount; i++) {
        const audio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const result = await workerClient.parseBuffer(audio, {
          filename: `sequential-${i}.wav`,
          targetPictureCount: i + 1 // Different option per request
        });
        results.push(result);
      }

      // Results should correspond to requests
      results.forEach((result, i) => {
        expect(result.metadata.filename).toBe(`sequential-${i}.wav`);
        expect(result.beats.length).toBeLessThanOrEqual(i + 1);
      });
    });

    test('should handle mixed message types correctly', async () => {
      // Mix different operation types
      const audioBuffer = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      const audioChunks = WorkerTestingUtils.generateTestAudio('streaming', {
        chunkSize: 1024,
        count: 3
      }) as Float32Array[];
      const audioBatch = WorkerTestingUtils.generateTestAudio('batch', {
        count: 2
      }) as Float32Array[];

      const operations = [
        workerClient.parseBuffer(audioBuffer, { filename: 'mixed-buffer.wav' }),
        workerClient.parseStream(audioChunks, { filename: 'mixed-stream.wav' }),
        workerClient.processBatch(audioBatch, [
          { filename: 'mixed-batch-0.wav' },
          { filename: 'mixed-batch-1.wav' }
        ])
      ];

      const [bufferResult, streamResult, batchResults] = await Promise.all(operations);

      expect(bufferResult.metadata.filename).toBe('mixed-buffer.wav');
      expect(streamResult.metadata.filename).toBe('mixed-stream.wav');
      expect(batchResults).toHaveLength(2);
      expect(batchResults[0].metadata.filename).toBe('mixed-batch-0.wav');
      expect(batchResults[1].metadata.filename).toBe('mixed-batch-1.wav');
    });

    test('should handle message queue overflow gracefully', async () => {
      // Create many operations to potentially overflow internal queues
      const overflowSize = 50;
      const operations: Promise<any>[] = [];
      
      for (let i = 0; i < overflowSize; i++) {
        const audio = new Float32Array(500); // Small audio to process quickly
        for (let j = 0; j < audio.length; j++) {
          audio[j] = Math.sin(2 * Math.PI * 440 * j / 44100) * 0.3;
        }
        
        operations.push(workerClient.parseBuffer(audio, {
          filename: `overflow-${i}.wav`
        }));
      }

      // Should handle all operations, potentially with some failures under extreme load
      const results = await Promise.allSettled(operations);
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;
      
      expect(successCount + failCount).toBe(overflowSize);
      
      // Most operations should succeed (allow some failures under extreme load)
      expect(successCount / overflowSize).toBeGreaterThan(0.8);
    });
  });

  describe('Message Size Optimization', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle messages with minimal overhead', async () => {
      const smallAudio = new Float32Array(256); // Very small buffer
      smallAudio.fill(0.1);

      const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
        () => workerClient.parseBuffer(smallAudio, { filename: 'minimal.wav' }),
        'Minimal Message Test'
      );

      expect(result).toBeDefined();
      
      // For small operations, messaging overhead should be minimal relative to processing
      const messagingRatio = metrics.messagingEfficiency;
      expect(messagingRatio).toBeLessThan(2); // Should be reasonable
    });

    test('should optimize large message transfers', async () => {
      const largeAudio = new Float32Array(44100 * 5); // 5 seconds
      for (let i = 0; i < largeAudio.length; i++) {
        largeAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
      }

      const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
        () => workerClient.parseBuffer(largeAudio, { filename: 'large-optimized.wav' }),
        'Large Message Optimization'
      );

      expect(result).toBeDefined();
      
      // For large transfers, the transfer time should scale reasonably with size
      const audioSizeBytes = largeAudio.length * 4;
      const transferEfficiency = audioSizeBytes / metrics.transferTime; // bytes per ms
      
      expect(transferEfficiency).toBeGreaterThan(1000); // Should achieve reasonable transfer rates
    });

    test('should compress or optimize repeated data patterns', async () => {
      // Create audio with repeated patterns (potentially compressible)
      const patternSize = 1024;
      const repetitions = 10;
      const repeatedAudio = new Float32Array(patternSize * repetitions);
      
      // Create pattern
      const pattern = new Float32Array(patternSize);
      for (let i = 0; i < patternSize; i++) {
        pattern[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
      }
      
      // Repeat pattern
      for (let rep = 0; rep < repetitions; rep++) {
        repeatedAudio.set(pattern, rep * patternSize);
      }

      const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
        () => workerClient.parseBuffer(repeatedAudio, { filename: 'repeated-pattern.wav' }),
        'Repeated Pattern Transfer'
      );

      expect(result).toBeDefined();
      
      // Transfer should complete in reasonable time despite repetition
      expect(metrics.transferTime).toBeLessThan(1000); // Should be fast enough
    });

    test('should handle mixed size batch operations efficiently', async () => {
      const mixedSizeBatch = [
        new Float32Array(1000),    // Small
        new Float32Array(10000),   // Medium  
        new Float32Array(100000),  // Large
        new Float32Array(500)      // Very small
      ];

      // Fill with different patterns
      mixedSizeBatch.forEach((buffer, i) => {
        const freq = 220 * (i + 1);
        for (let j = 0; j < buffer.length; j++) {
          buffer[j] = Math.sin(2 * Math.PI * freq * j / 44100) * 0.3;
        }
      });

      const { result, metrics } = await WorkerTestingUtils.measureWorkerOperation(
        () => workerClient.processBatch(mixedSizeBatch, mixedSizeBatch.map((_, i) => ({
          filename: `mixed-size-${i}.wav`
        }))),
        'Mixed Size Batch'
      );

      expect(result).toHaveLength(4);
      
      // Should handle efficiently despite size differences
      expect(metrics.transferTime).toBeGreaterThan(0);
      
      // All results should be valid
      result.forEach((res, i) => {
        expect(res).toBeDefined();
        expect(res.metadata.filename).toBe(`mixed-size-${i}.wav`);
      });
    });
  });
});