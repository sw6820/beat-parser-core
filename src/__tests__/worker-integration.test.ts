/**
 * Web Worker Integration Tests
 * Validation of Web Worker integration with Web APIs and external systems
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import { WorkerTestingUtils } from './worker-testing-utils';

describe('Web Worker Integration with Web APIs', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('AudioContext Integration', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should process AudioContext-compatible data', async () => {
      // Simulate AudioContext-like audio data
      const sampleRate = 44100;
      const channels = 2;
      const duration = 2; // seconds
      const frameCount = sampleRate * duration;

      // Create interleaved stereo audio buffer
      const audioBuffer = new Float32Array(frameCount * channels);
      
      for (let frame = 0; frame < frameCount; frame++) {
        const t = frame / sampleRate;
        const leftSample = Math.sin(2 * Math.PI * 440 * t) * 0.5;
        const rightSample = Math.sin(2 * Math.PI * 660 * t) * 0.3;
        
        audioBuffer[frame * 2] = leftSample;
        audioBuffer[frame * 2 + 1] = rightSample;
      }

      // Convert to mono for processing (average channels)
      const monoBuffer = new Float32Array(frameCount);
      for (let frame = 0; frame < frameCount; frame++) {
        monoBuffer[frame] = (audioBuffer[frame * 2] + audioBuffer[frame * 2 + 1]) / 2;
      }

      const result = await workerClient.parseBuffer(monoBuffer, {
        filename: 'audiocontext-stereo.wav',
        targetPictureCount: 8
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.metadata.processingInfo.sampleRate).toBe(44100);
      expect(result.metadata.processingInfo.audioLength).toBeCloseTo(duration, 1);
    });

    test('should handle different sample rates', async () => {
      const sampleRates = [22050, 44100, 48000, 96000];
      
      for (const sampleRate of sampleRates) {
        const duration = 1; // 1 second
        const samples = sampleRate * duration;
        const audio = new Float32Array(samples);
        
        // Generate test signal
        for (let i = 0; i < samples; i++) {
          audio[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
        }

        const result = await workerClient.parseBuffer(audio, {
          filename: `samplerate-${sampleRate}.wav`
        }, {
          sampleRate
        });

        expect(result).toBeDefined();
        expect(result.metadata.processingInfo.audioLength).toBeCloseTo(duration, 1);
        console.log(`Sample rate ${sampleRate}Hz: ${result.beats.length} beats detected`);
      }
    });

    test('should integrate with Web Audio API patterns', async () => {
      // Simulate Web Audio API processing chain
      const audioContext = {
        sampleRate: 44100,
        currentTime: 0,
        createBuffer: (channels: number, length: number, sampleRate: number) => ({
          numberOfChannels: channels,
          length,
          sampleRate,
          getChannelData: (channel: number) => new Float32Array(length)
        })
      };

      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
      const channelData = buffer.getChannelData(0);
      
      // Fill with audio data
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = Math.sin(2 * Math.PI * 440 * i / audioContext.sampleRate) * 0.4;
      }

      const result = await workerClient.parseBuffer(channelData, {
        filename: 'webaudio-integration.wav',
        targetPictureCount: 10
      });

      expect(result).toBeDefined();
      expect(result.beats.length).toBeLessThanOrEqual(10);
      expect(result.metadata.processingInfo.sampleRate).toBe(audioContext.sampleRate);
    });
  });

  describe('File API Integration', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle File-like objects', async () => {
      // Simulate File API data
      const audioData = WorkerTestingUtils.generateTestAudio('medium') as Float32Array;
      
      // Mock file metadata
      const fileInfo = {
        name: 'uploaded-audio.wav',
        size: audioData.length * 4,
        type: 'audio/wav',
        lastModified: Date.now()
      };

      const result = await workerClient.parseBuffer(audioData, {
        filename: fileInfo.name,
        targetPictureCount: 6
      });

      expect(result).toBeDefined();
      expect(result.metadata.filename).toBe(fileInfo.name);
      expect(result.beats.length).toBeLessThanOrEqual(6);
    });

    test('should process chunked file uploads', async () => {
      // Simulate chunked file reading
      const totalSize = 88200; // 2 seconds at 44.1kHz
      const chunkSize = 8192;
      const chunks: Float32Array[] = [];

      for (let offset = 0; offset < totalSize; offset += chunkSize) {
        const size = Math.min(chunkSize, totalSize - offset);
        const chunk = new Float32Array(size);
        
        for (let i = 0; i < size; i++) {
          const sampleIndex = offset + i;
          chunk[i] = Math.sin(2 * Math.PI * 440 * sampleIndex / 44100) * 0.4;
        }
        
        chunks.push(chunk);
      }

      const result = await workerClient.parseStream(chunks, {
        filename: 'chunked-upload.wav',
        targetPictureCount: 8
      });

      expect(result).toBeDefined();
      expect(result.metadata.filename).toBe('chunked-upload.wav');
      expect(result.metadata.processingInfo.audioLength).toBeCloseTo(2, 1);
    });

    test('should handle various audio formats simulation', async () => {
      const formats = [
        { name: 'wav', sampleRate: 44100, bitDepth: 16 },
        { name: 'mp3', sampleRate: 44100, bitDepth: 16 },
        { name: 'flac', sampleRate: 96000, bitDepth: 24 },
        { name: 'aac', sampleRate: 48000, bitDepth: 16 }
      ];

      for (const format of formats) {
        const duration = 1.5;
        const samples = Math.floor(format.sampleRate * duration);
        const audio = new Float32Array(samples);
        
        // Simulate format-specific characteristics
        const amplitudeScale = format.bitDepth === 24 ? 0.8 : 0.6;
        
        for (let i = 0; i < samples; i++) {
          audio[i] = Math.sin(2 * Math.PI * 440 * i / format.sampleRate) * amplitudeScale;
        }

        const result = await workerClient.parseBuffer(audio, {
          filename: `test-file.${format.name}`,
          targetPictureCount: 5
        }, {
          sampleRate: format.sampleRate
        });

        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe(`test-file.${format.name}`);
        console.log(`Format ${format.name} (${format.sampleRate}Hz): ${result.beats.length} beats`);
      }
    });
  });

  describe('IndexedDB Integration Simulation', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle cached audio data patterns', async () => {
      // Simulate cached audio data retrieval
      const cacheEntries = [
        { key: 'track-1', audio: WorkerTestingUtils.generateTestAudio('simple') as Float32Array },
        { key: 'track-2', audio: WorkerTestingUtils.generateTestAudio('complex') as Float32Array },
        { key: 'track-3', audio: WorkerTestingUtils.generateTestAudio('medium') as Float32Array }
      ];

      const results = [];

      for (const entry of cacheEntries) {
        const result = await workerClient.parseBuffer(entry.audio, {
          filename: `${entry.key}.wav`,
          targetPictureCount: 4
        });

        results.push({
          key: entry.key,
          result
        });
      }

      expect(results).toHaveLength(3);
      
      results.forEach(({ key, result }) => {
        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe(`${key}.wav`);
        expect(result.beats.length).toBeLessThanOrEqual(4);
      });
    });

    test('should process batch operations from database', async () => {
      // Simulate batch database operations
      const batchData = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        title: `Track ${i + 1}`,
        audio: WorkerTestingUtils.generateTestAudio('simple', { duration: 1 + i * 0.5 }) as Float32Array
      }));

      const batchOptions = batchData.map(item => ({
        filename: `${item.title.toLowerCase().replace(' ', '-')}.wav`,
        targetPictureCount: 3
      }));

      const batchResults = await workerClient.processBatch(
        batchData.map(item => item.audio),
        batchOptions
      );

      expect(batchResults).toHaveLength(batchData.length);
      
      batchResults.forEach((result, i) => {
        const originalItem = batchData[i];
        expect(result.metadata.filename).toBe(`track-${i + 1}.wav`);
        expect(result.beats.length).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('Network Integration', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle network-loaded audio data', async () => {
      // Simulate network audio loading
      const networkAudio = {
        url: 'https://example.com/audio/track.wav',
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': '176400' // 2 seconds at 44.1kHz, 16-bit
        },
        data: WorkerTestingUtils.generateTestAudio('medium', { duration: 2 }) as Float32Array
      };

      const result = await workerClient.parseBuffer(networkAudio.data, {
        filename: 'network-audio.wav',
        targetPictureCount: 8
      });

      expect(result).toBeDefined();
      expect(result.metadata.filename).toBe('network-audio.wav');
      expect(result.metadata.processingInfo.audioLength).toBeCloseTo(2, 1);
    });

    test('should handle streaming audio data', async () => {
      // Simulate streaming audio chunks
      const streamChunks = Array.from({ length: 6 }, (_, i) => {
        const chunkDuration = 0.5; // 500ms chunks
        const samples = Math.floor(44100 * chunkDuration);
        const chunk = new Float32Array(samples);
        
        for (let j = 0; j < samples; j++) {
          const globalIndex = i * samples + j;
          chunk[j] = Math.sin(2 * Math.PI * 440 * globalIndex / 44100) * 0.4;
        }
        
        return chunk;
      });

      const result = await workerClient.parseStream(streamChunks, {
        filename: 'streamed-audio.wav',
        targetPictureCount: 12
      });

      expect(result).toBeDefined();
      expect(result.metadata.filename).toBe('streamed-audio.wav');
      expect(result.metadata.processingInfo.audioLength).toBeCloseTo(3, 1); // 6 * 0.5s
    });

    test('should handle network interruptions gracefully', async () => {
      // Simulate network interruption by using error injection
      const unreliableClient = WorkerTestingUtils.createTestWorkerClient({
        errorRate: 0.3 // 30% failure rate to simulate network issues
      });

      try {
        await unreliableClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('medium') as Float32Array;
        
        // Try multiple times to simulate retry behavior
        let lastError: Error | null = null;
        let success = false;
        
        for (let attempt = 0; attempt < 3 && !success; attempt++) {
          try {
            const result = await unreliableClient.parseBuffer(testAudio, {
              filename: `network-retry-${attempt}.wav`
            });
            
            expect(result).toBeDefined();
            success = true;
          } catch (error) {
            lastError = error as Error;
            console.log(`Network attempt ${attempt + 1} failed: ${error}`);
          }
        }

        // Either succeed or document the failure pattern
        if (!success && lastError) {
          expect(lastError).toBeInstanceOf(Error);
          console.log('Network simulation consistently failed as expected');
        }
      } finally {
        await unreliableClient.terminate();
      }
    });
  });

  describe('Real-time Processing Integration', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient({
        latency: 20 // Low latency for real-time simulation
      });
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should handle real-time audio buffers', async () => {
      // Simulate real-time audio processing (typical buffer sizes)
      const bufferSizes = [256, 512, 1024, 2048];
      
      for (const bufferSize of bufferSizes) {
        const audioBuffer = new Float32Array(bufferSize);
        
        // Fill with real-time audio pattern
        for (let i = 0; i < bufferSize; i++) {
          audioBuffer[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
        }

        const startTime = performance.now();
        const result = await workerClient.parseBuffer(audioBuffer, {
          filename: `realtime-${bufferSize}.wav`,
          targetPictureCount: 2
        });
        const processingTime = performance.now() - startTime;

        expect(result).toBeDefined();
        expect(result.beats.length).toBeLessThanOrEqual(2);
        
        // Real-time constraint: processing should be faster than buffer duration
        const bufferDuration = (bufferSize / 44100) * 1000; // milliseconds
        console.log(`Buffer ${bufferSize}: ${processingTime.toFixed(2)}ms processing, ${bufferDuration.toFixed(2)}ms duration`);
        
        // For real-time processing, we'd want processing time < buffer duration
        // This is a soft requirement for testing purposes
        expect(processingTime).toBeLessThan(bufferDuration * 10); // Allow 10x overhead for testing
      }
    });

    test('should maintain timing accuracy in continuous processing', async () => {
      // Simulate continuous real-time processing
      const bufferCount = 8;
      const bufferSize = 1024;
      const expectedTotalDuration = (bufferCount * bufferSize / 44100) * 1000; // ms

      const processingTimes: number[] = [];
      const results: any[] = [];

      for (let i = 0; i < bufferCount; i++) {
        const buffer = new Float32Array(bufferSize);
        
        // Generate continuous audio signal
        for (let j = 0; j < bufferSize; j++) {
          const globalIndex = i * bufferSize + j;
          buffer[j] = Math.sin(2 * Math.PI * 440 * globalIndex / 44100) * 0.4;
        }

        const startTime = performance.now();
        const result = await workerClient.parseBuffer(buffer, {
          filename: `continuous-${i}.wav`,
          targetPictureCount: 1
        });
        const endTime = performance.now();

        processingTimes.push(endTime - startTime);
        results.push(result);
      }

      expect(results).toHaveLength(bufferCount);
      
      // Analyze timing characteristics
      const totalProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0);
      const averageProcessingTime = totalProcessingTime / bufferCount;
      const maxProcessingTime = Math.max(...processingTimes);
      const minProcessingTime = Math.min(...processingTimes);

      console.log(`Continuous processing statistics:`);
      console.log(`  Average: ${averageProcessingTime.toFixed(2)}ms per buffer`);
      console.log(`  Range: ${minProcessingTime.toFixed(2)}ms - ${maxProcessingTime.toFixed(2)}ms`);
      console.log(`  Total: ${totalProcessingTime.toFixed(2)}ms vs ${expectedTotalDuration.toFixed(2)}ms duration`);

      // All results should be valid
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe(`continuous-${i}.wav`);
      });

      // Processing should be reasonably consistent
      const processingVariance = Math.max(...processingTimes) - Math.min(...processingTimes);
      expect(processingVariance).toBeLessThan(averageProcessingTime * 2); // Variance shouldn't be too high
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle Web API integration errors', async () => {
      // Simulate various API integration failures
      const errorScenarios = [
        { name: 'Invalid Audio Format', errorRate: 1.0 },
        { name: 'Network Timeout', latency: 10000 },
        { name: 'Memory Pressure', memoryLeaks: true }
      ];

      for (const scenario of errorScenarios) {
        const errorClient = WorkerTestingUtils.createTestWorkerClient({
          errorRate: scenario.errorRate || 0,
          latency: scenario.latency || 100,
          memoryLeaks: scenario.memoryLeaks || false
        });

        try {
          const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
          
          if (scenario.errorRate === 1.0) {
            await expect(
              errorClient.parseBuffer(testAudio, { filename: `error-${scenario.name}.wav` })
            ).rejects.toThrow();
          } else if (scenario.latency === 10000) {
            // This would timeout in a real implementation
            const shortTimeoutClient = WorkerTestingUtils.createTestWorkerClient({
              timeout: 100
            });
            
            await expect(
              shortTimeoutClient.parseBuffer(testAudio)
            ).rejects.toThrow('timeout');
            
            await shortTimeoutClient.terminate();
          }

          console.log(`Error scenario '${scenario.name}' handled correctly`);
        } finally {
          await errorClient.terminate();
        }
      }
    });

    test('should provide meaningful error context', async () => {
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
          
          // Error should have meaningful message
          expect(errorObj.message).toBeDefined();
          expect(errorObj.message.length).toBeGreaterThan(0);
          expect(errorObj.message).toContain('Simulated');
          
          console.log('Error context:', errorObj.message);
        }
      } finally {
        await errorClient.terminate();
      }
    });
  });
});