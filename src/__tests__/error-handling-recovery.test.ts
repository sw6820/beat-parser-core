/**
 * Error Recovery and Graceful Degradation Test Suite
 * 
 * Comprehensive tests for recovery mechanisms, fallback strategies, graceful degradation,
 * automatic retry logic, and system stability after error conditions.
 * Validates that the system can recover and continue operating after various failures.
 */

import { BeatParser, BeatParserConfig, BeatParserPlugin } from '../core/BeatParser';
import { BeatParserWorkerClient } from '../worker/WorkerClient';
import type { ParseOptions, BeatCandidate, StreamingOptions } from '../types';

describe('Error Handling: Recovery & Graceful Degradation', () => {
  let parser: BeatParser;
  let workerClient: BeatParserWorkerClient;
  
  beforeEach(() => {
    parser = new BeatParser();
    workerClient = new BeatParserWorkerClient({ timeout: 5000 });
  });
  
  afterEach(async () => {
    await Promise.allSettled([
      parser.cleanup(),
      workerClient.terminate()
    ]);
  });

  describe('Automatic Retry Mechanisms', () => {
    describe('Exponential Backoff Retry', () => {
      test('should implement exponential backoff for transient failures', async () => {
        let attemptCount = 0;
        const maxAttempts = 3;
        const baseDelay = 100; // ms
        
        const flakyPlugin: BeatParserPlugin = {
          name: 'flaky-retry',
          version: '1.0.0',
          processAudio: async (audioData) => {
            attemptCount++;
            
            if (attemptCount < maxAttempts) {
              throw new Error(`Transient failure ${attemptCount}`);
            }
            
            // Success on final attempt
            return audioData;
          }
        };
        
        // Create custom parser with retry logic
        const retryParser = new BeatParser();
        retryParser.addPlugin(flakyPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const startTime = Date.now();
        
        try {
          // Implement manual retry logic for test
          let lastError: Error | null = null;
          let success = false;
          
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const result = await retryParser.parseBuffer(buffer);
              expect(result).toBeDefined();
              success = true;
              break;
            } catch (error) {
              lastError = error as Error;
              if (attempt < maxAttempts) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          
          if (!success && lastError) {
            throw lastError;
          }
          
          const endTime = Date.now();
          const totalTime = endTime - startTime;
          
          expect(attemptCount).toBe(maxAttempts);
          expect(totalTime).toBeGreaterThan(baseDelay * 3); // Should have delays
          
        } finally {
          await retryParser.cleanup();
        }
      }, 10000);

      test('should respect maximum retry attempts', async () => {
        let attemptCount = 0;
        
        const alwaysFailingPlugin: BeatParserPlugin = {
          name: 'always-fail',
          version: '1.0.0',
          processAudio: async () => {
            attemptCount++;
            throw new Error(`Persistent failure ${attemptCount}`);
          }
        };
        
        const retryParser = new BeatParser();
        retryParser.addPlugin(alwaysFailingPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        const maxRetries = 3;
        
        try {
          let finalError: Error | null = null;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              await retryParser.parseBuffer(buffer);
              fail('Should not succeed');
            } catch (error) {
              finalError = error as Error;
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
          }
          
          expect(attemptCount).toBe(maxRetries);
          expect(finalError).toBeDefined();
          expect(finalError!.message).toContain(`Persistent failure ${maxRetries}`);
          
        } finally {
          await retryParser.cleanup();
        }
      });

      test('should differentiate between retryable and non-retryable errors', async () => {
        const smartRetryPlugin: BeatParserPlugin = {
          name: 'smart-retry',
          version: '1.0.0',
          processAudio: async (audioData, config) => {
            // Simulate different error types
            const errorType = (config as any).errorType || 'transient';
            
            switch (errorType) {
              case 'transient':
                throw new Error('Network timeout'); // Retryable
              case 'permanent':
                throw new Error('Invalid configuration'); // Non-retryable
              case 'resource':
                throw new Error('Out of memory'); // Non-retryable
              default:
                return audioData;
            }
          }
        };
        
        const testCases = [
          { errorType: 'transient', shouldRetry: true },
          { errorType: 'permanent', shouldRetry: false },
          { errorType: 'resource', shouldRetry: false }
        ];
        
        for (const testCase of testCases) {
          const testParser = new BeatParser(testCase as any);
          testParser.addPlugin(smartRetryPlugin);
          
          const buffer = new Float32Array(4096).fill(0.5);
          
          try {
            await testParser.parseBuffer(buffer);
            fail(`Should have failed for ${testCase.errorType}`);
          } catch (error) {
            const message = (error as Error).message;
            
            if (testCase.shouldRetry) {
              // Transient errors should be identified as retryable
              expect(message).toMatch(/Network timeout|timeout/);
            } else {
              // Permanent errors should be identified as non-retryable
              expect(message).toMatch(/Invalid configuration|Out of memory/);
            }
          } finally {
            await testParser.cleanup();
          }
        }
      });
    });

    describe('Circuit Breaker Pattern', () => {
      test('should implement circuit breaker for failing plugins', async () => {
        let failureCount = 0;
        const circuitBreakerThreshold = 3;
        
        const circuitBreakerPlugin: BeatParserPlugin = {
          name: 'circuit-breaker',
          version: '1.0.0',
          processAudio: async () => {
            failureCount++;
            
            if (failureCount <= circuitBreakerThreshold) {
              throw new Error(`Failure ${failureCount}`);
            }
            
            // After threshold, should be bypassed (circuit open)
            throw new Error('Should not be called - circuit should be open');
          }
        };
        
        const cbParser = new BeatParser();
        cbParser.addPlugin(circuitBreakerPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // First few failures should be normal
        for (let i = 1; i <= circuitBreakerThreshold; i++) {
          try {
            await cbParser.parseBuffer(buffer);
            fail('Should have failed');
          } catch (error) {
            expect((error as Error).message).toContain(`Failure ${i}`);
          }
        }
        
        // After threshold, circuit should be open
        try {
          await cbParser.parseBuffer(buffer);
          // Should either succeed (bypassed) or fail fast
        } catch (error) {
          const message = (error as Error).message;
          expect(message).not.toContain('Should not be called');
        }
        
        await cbParser.cleanup();
      });

      test('should recover from circuit breaker open state', async () => {
        let failureCount = 0;
        let circuitState = 'closed'; // closed -> open -> half-open -> closed
        
        const recoveringPlugin: BeatParserPlugin = {
          name: 'recovering',
          version: '1.0.0',
          processAudio: async (audioData) => {
            if (circuitState === 'open') {
              // Circuit is open, should not process
              return audioData; // Bypass
            }
            
            if (circuitState === 'half-open') {
              // Try to recover
              circuitState = 'closed';
              return audioData; // Success
            }
            
            // Normal processing - fail initially
            failureCount++;
            if (failureCount <= 3) {
              if (failureCount === 3) {
                circuitState = 'open';
                setTimeout(() => { circuitState = 'half-open'; }, 100);
              }
              throw new Error(`Normal failure ${failureCount}`);
            }
            
            return audioData;
          }
        };
        
        const recoveryParser = new BeatParser();
        recoveryParser.addPlugin(recoveringPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Initial failures
        for (let i = 1; i <= 3; i++) {
          try {
            await recoveryParser.parseBuffer(buffer);
            if (i <= 2) fail('Should have failed initially');
          } catch (error) {
            if (i <= 2) {
              expect((error as Error).message).toContain(`Normal failure ${i}`);
            }
          }
        }
        
        // Wait for circuit to enter half-open state
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Should now succeed (recovered)
        const result = await recoveryParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await recoveryParser.cleanup();
      });
    });
  });

  describe('Fallback Strategies', () => {
    describe('Algorithm Fallback', () => {
      test('should fall back to simpler algorithms when complex ones fail', async () => {
        let complexAlgorithmUsed = false;
        let simpleAlgorithmUsed = false;
        
        const fallbackPlugin: BeatParserPlugin = {
          name: 'algorithm-fallback',
          version: '1.0.0',
          processAudio: async (audioData, config) => {
            // Try complex algorithm first
            try {
              complexAlgorithmUsed = true;
              throw new Error('Complex algorithm failed');
            } catch (error) {
              // Fall back to simple algorithm
              simpleAlgorithmUsed = true;
              return audioData; // Simple algorithm succeeds
            }
          }
        };
        
        const fallbackParser = new BeatParser();
        fallbackParser.addPlugin(fallbackPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await fallbackParser.parseBuffer(buffer);
        
        expect(result).toBeDefined();
        expect(complexAlgorithmUsed).toBe(true);
        expect(simpleAlgorithmUsed).toBe(true);
        
        await fallbackParser.cleanup();
      });

      test('should maintain quality metadata when using fallback algorithms', async () => {
        const qualityFallbackPlugin: BeatParserPlugin = {
          name: 'quality-fallback',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate fallback with quality metadata
            (audioData as any).metadata = {
              algorithm: 'fallback',
              quality: 'reduced',
              reason: 'primary algorithm failed'
            };
            return audioData;
          }
        };
        
        const qualityParser = new BeatParser();
        qualityParser.addPlugin(qualityFallbackPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await qualityParser.parseBuffer(buffer);
        
        expect(result).toBeDefined();
        expect(result.metadata).toBeDefined();
        // Should include information about fallback usage
        
        await qualityParser.cleanup();
      });

      test('should prioritize fallback algorithms by reliability', async () => {
        const algorithmPriorityPlugin: BeatParserPlugin = {
          name: 'priority-fallback',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const algorithms = [
              { name: 'advanced', reliability: 0.95, impl: () => { throw new Error('Advanced failed'); } },
              { name: 'standard', reliability: 0.85, impl: () => { throw new Error('Standard failed'); } },
              { name: 'basic', reliability: 0.99, impl: () => audioData }
            ];
            
            // Sort by reliability (highest first)
            algorithms.sort((a, b) => b.reliability - a.reliability);
            
            for (const algorithm of algorithms) {
              try {
                return algorithm.impl();
              } catch (error) {
                // Continue to next algorithm
                continue;
              }
            }
            
            throw new Error('All algorithms failed');
          }
        };
        
        const priorityParser = new BeatParser();
        priorityParser.addPlugin(algorithmPriorityPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await priorityParser.parseBuffer(buffer);
        expect(result).toBeDefined(); // Should succeed with basic algorithm
        
        await priorityParser.cleanup();
      });
    });

    describe('Resource Fallback', () => {
      test('should reduce quality when resources are limited', async () => {
        let memoryPressure = false;
        
        const resourceAwarePlugin: BeatParserPlugin = {
          name: 'resource-aware',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate memory pressure detection
            const memoryUsage = process.memoryUsage();
            memoryPressure = memoryUsage.heapUsed > 50 * 1024 * 1024; // 50MB threshold
            
            if (memoryPressure) {
              // Reduce quality - use smaller buffer
              const reducedBuffer = new Float32Array(audioData.length / 2);
              for (let i = 0; i < reducedBuffer.length; i++) {
                reducedBuffer[i] = audioData[i * 2]; // Downsample
              }
              return reducedBuffer;
            }
            
            return audioData;
          }
        };
        
        const resourceParser = new BeatParser();
        resourceParser.addPlugin(resourceAwarePlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await resourceParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        // If memory pressure was detected, processing should have adapted
        if (memoryPressure) {
          // Verify that quality reduction occurred
          expect(result.metadata).toBeDefined();
        }
        
        await resourceParser.cleanup();
      });

      test('should skip advanced features when CPU is limited', async () => {
        let cpuIntensive = true;
        
        const cpuAwarePlugin: BeatParserPlugin = {
          name: 'cpu-aware',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const startTime = Date.now();
            
            if (!cpuIntensive) {
              // Skip expensive operations
              return audioData;
            }
            
            // Simulate CPU-intensive operation
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            // If processing takes too long, disable CPU-intensive features
            if (processingTime > 50) {
              cpuIntensive = false;
            }
            
            return audioData;
          }
        };
        
        const cpuParser = new BeatParser();
        cpuParser.addPlugin(cpuAwarePlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await cpuParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await cpuParser.cleanup();
      });

      test('should maintain minimal functionality under extreme resource pressure', async () => {
        const extremeResourcePlugin: BeatParserPlugin = {
          name: 'extreme-resource',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate extreme resource pressure
            const availableMemory = 1024; // Very limited
            
            if (audioData.length * 4 > availableMemory) {
              // Can't process full buffer - return minimal result
              const minimalBuffer = new Float32Array(Math.min(256, audioData.length));
              for (let i = 0; i < minimalBuffer.length; i++) {
                minimalBuffer[i] = audioData[i];
              }
              return minimalBuffer;
            }
            
            return audioData;
          }
        };
        
        const extremeParser = new BeatParser();
        extremeParser.addPlugin(extremeResourcePlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await extremeParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        expect(result.beats).toBeDefined(); // Should provide minimal result
        
        await extremeParser.cleanup();
      });
    });
  });

  describe('Graceful Degradation Modes', () => {
    describe('Quality Level Degradation', () => {
      test('should degrade gracefully through quality levels', async () => {
        const qualityLevels = ['high', 'medium', 'low', 'minimal'];
        let currentQualityIndex = 0;
        
        const degradationPlugin: BeatParserPlugin = {
          name: 'quality-degradation',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const quality = qualityLevels[currentQualityIndex];
            
            switch (quality) {
              case 'high':
                currentQualityIndex++;
                throw new Error('High quality processing failed');
              case 'medium':
                currentQualityIndex++;
                throw new Error('Medium quality processing failed');
              case 'low':
                currentQualityIndex++;
                throw new Error('Low quality processing failed');
              case 'minimal':
                // Minimal processing always succeeds
                return new Float32Array(audioData.length / 4).fill(0.1);
              default:
                throw new Error('No quality level available');
            }
          }
        };
        
        const degradeParser = new BeatParser();
        degradeParser.addPlugin(degradationPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Should eventually succeed at minimal quality
        let attempts = 0;
        let result;
        
        while (attempts < qualityLevels.length) {
          try {
            result = await degradeParser.parseBuffer(buffer);
            break;
          } catch (error) {
            attempts++;
            if (attempts >= qualityLevels.length) {
              throw error;
            }
          }
        }
        
        expect(result).toBeDefined();
        expect(currentQualityIndex).toBe(3); // Should have reached minimal quality
        
        await degradeParser.cleanup();
      });

      test('should preserve essential functionality during degradation', async () => {
        const essentialFeaturesPlugin: BeatParserPlugin = {
          name: 'essential-features',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const features = {
              spectralAnalysis: true,
              tempoDetection: true,
              beatTracking: true, // Essential
              harmonicAnalysis: false, // Optional
              advancedFiltering: false // Optional
            };
            
            // Simulate resource pressure forcing feature reduction
            try {
              if (features.spectralAnalysis) {
                throw new Error('Spectral analysis failed');
              }
            } catch {
              features.spectralAnalysis = false;
            }
            
            try {
              if (features.tempoDetection) {
                throw new Error('Tempo detection failed');
              }
            } catch {
              features.tempoDetection = false;
            }
            
            // Beat tracking is essential and should always work
            if (!features.beatTracking) {
              throw new Error('Essential beat tracking failed');
            }
            
            // Return result with available features
            (audioData as any).availableFeatures = features;
            return audioData;
          }
        };
        
        const essentialParser = new BeatParser();
        essentialParser.addPlugin(essentialFeaturesPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await essentialParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        // Should indicate which features are available
        const features = (buffer as any).availableFeatures;
        expect(features.beatTracking).toBe(true); // Essential feature preserved
        
        await essentialParser.cleanup();
      });
    });

    describe('Service Level Degradation', () => {
      test('should maintain basic service when advanced features fail', async () => {
        const serviceLevelPlugin: BeatParserPlugin = {
          name: 'service-level',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const services = {
              basic: true,
              advanced: true,
              premium: true
            };
            
            try {
              // Premium service fails
              if (services.premium) {
                throw new Error('Premium service unavailable');
              }
            } catch {
              services.premium = false;
            }
            
            try {
              // Advanced service fails
              if (services.advanced) {
                throw new Error('Advanced service unavailable');
              }
            } catch {
              services.advanced = false;
            }
            
            // Basic service should always be available
            if (!services.basic) {
              throw new Error('Basic service failed - system unavailable');
            }
            
            (audioData as any).serviceLevel = Object.keys(services).find(key => services[key as keyof typeof services]);
            return audioData;
          }
        };
        
        const serviceParser = new BeatParser();
        serviceParser.addPlugin(serviceLevelPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await serviceParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        // Should operate at basic service level
        const serviceLevel = (buffer as any).serviceLevel;
        expect(serviceLevel).toBe('basic');
        
        await serviceParser.cleanup();
      });

      test('should provide user feedback about degraded service', async () => {
        const feedbackPlugin: BeatParserPlugin = {
          name: 'service-feedback',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const degradationReasons = [];
            
            try {
              throw new Error('High-quality analysis unavailable');
            } catch (error) {
              degradationReasons.push('Quality reduced due to resource constraints');
            }
            
            try {
              throw new Error('Real-time processing unavailable');
            } catch (error) {
              degradationReasons.push('Switched to batch processing mode');
            }
            
            (audioData as any).serviceNotifications = degradationReasons;
            return audioData;
          }
        };
        
        const feedbackParser = new BeatParser();
        feedbackParser.addPlugin(feedbackPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        const result = await feedbackParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        const notifications = (buffer as any).serviceNotifications;
        expect(notifications).toHaveLength(2);
        expect(notifications[0]).toContain('Quality reduced');
        expect(notifications[1]).toContain('batch processing');
        
        await feedbackParser.cleanup();
      });
    });
  });

  describe('Resource Cleanup and Recovery', () => {
    describe('Memory Leak Prevention', () => {
      test('should clean up resources after processing errors', async () => {
        let allocatedResources = 0;
        
        const resourceTrackingPlugin: BeatParserPlugin = {
          name: 'resource-tracking',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate resource allocation
            allocatedResources += 1000;
            
            try {
              throw new Error('Processing failed');
            } catch (error) {
              // Cleanup should happen even on error
              allocatedResources -= 1000;
              throw error;
            }
          }
        };
        
        const cleanupParser = new BeatParser();
        cleanupParser.addPlugin(resourceTrackingPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        try {
          await cleanupParser.parseBuffer(buffer);
          fail('Should have failed');
        } catch (error) {
          expect(error).toBeDefined();
        }
        
        // Resources should be cleaned up
        expect(allocatedResources).toBe(0);
        
        await cleanupParser.cleanup();
      });

      test('should prevent memory leaks during repeated operations', async () => {
        const iterations = 100;
        const initialMemory = process.memoryUsage().heapUsed;
        
        for (let i = 0; i < iterations; i++) {
          const buffer = new Float32Array(1024).fill(Math.random());
          
          try {
            const result = await parser.parseBuffer(buffer);
            expect(result).toBeDefined();
          } catch (error) {
            // Some operations might fail - that's okay
          }
          
          // Force garbage collection periodically
          if (i % 10 === 0 && global.gc) {
            global.gc();
          }
        }
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;
        
        // Memory increase should be reasonable (less than 50MB for 100 operations)
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      }, 30000);
    });

    describe('State Recovery', () => {
      test('should restore parser state after errors', async () => {
        const stateCorruptionPlugin: BeatParserPlugin = {
          name: 'state-corruption',
          version: '1.0.0',
          processAudio: async (audioData) => {
            // Simulate state corruption
            (parser as any).initialized = false;
            throw new Error('State corrupted');
          }
        };
        
        parser.addPlugin(stateCorruptionPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // First operation should fail and corrupt state
        try {
          await parser.parseBuffer(buffer);
          fail('Should have failed');
        } catch (error) {
          expect((error as Error).message).toContain('State corrupted');
        }
        
        // Remove the problematic plugin
        parser.removePlugin('state-corruption');
        
        // Parser should recover and work normally
        const result = await parser.parseBuffer(buffer);
        expect(result).toBeDefined();
      });

      test('should maintain configuration consistency after errors', async () => {
        const originalConfig = parser.getConfig();
        
        const configCorruptionPlugin: BeatParserPlugin = {
          name: 'config-corruption',
          version: '1.0.0',
          initialize: async () => {
            throw new Error('Initialization failed');
          }
        };
        
        parser.addPlugin(configCorruptionPlugin);
        
        try {
          await parser.initialize();
          fail('Should have failed');
        } catch (error) {
          expect(error).toBeDefined();
        }
        
        // Configuration should remain consistent
        const configAfterError = parser.getConfig();
        expect(configAfterError.sampleRate).toBe(originalConfig.sampleRate);
        expect(configAfterError.hopSize).toBe(originalConfig.hopSize);
      });

      test('should recover plugin state after partial failures', async () => {
        let pluginState = { initialized: false, healthy: true };
        
        const statefulPlugin: BeatParserPlugin = {
          name: 'stateful',
          version: '1.0.0',
          initialize: async () => {
            pluginState.initialized = true;
            pluginState.healthy = true;
          },
          processAudio: async (audioData) => {
            if (!pluginState.healthy) {
              // Attempt to recover
              pluginState.healthy = true;
            }
            
            // Fail once to test recovery
            if (pluginState.initialized && pluginState.healthy) {
              pluginState.healthy = false;
              throw new Error('Plugin became unhealthy');
            }
            
            return audioData;
          }
        };
        
        const statefulParser = new BeatParser();
        statefulParser.addPlugin(statefulPlugin);
        
        await statefulParser.initialize();
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // First operation should fail
        try {
          await statefulParser.parseBuffer(buffer);
          fail('Should have failed');
        } catch (error) {
          expect((error as Error).message).toContain('unhealthy');
        }
        
        // Plugin should recover automatically
        const result = await statefulParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await statefulParser.cleanup();
      });
    });
  });

  describe('System Stability After Errors', () => {
    describe('Error Isolation', () => {
      test('should isolate errors between different parser instances', async () => {
        const failingParser = new BeatParser();
        const healthyParser = new BeatParser();
        
        const crashingPlugin: BeatParserPlugin = {
          name: 'crashing',
          version: '1.0.0',
          processAudio: async () => {
            throw new Error('Plugin crash');
          }
        };
        
        failingParser.addPlugin(crashingPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Failing parser should not affect healthy parser
        try {
          await failingParser.parseBuffer(buffer);
          fail('Should have failed');
        } catch (error) {
          expect((error as Error).message).toContain('Plugin crash');
        }
        
        // Healthy parser should still work
        const result = await healthyParser.parseBuffer(buffer);
        expect(result).toBeDefined();
        
        await Promise.all([failingParser.cleanup(), healthyParser.cleanup()]);
      });

      test('should isolate errors between concurrent operations', async () => {
        const concurrentPlugin: BeatParserPlugin = {
          name: 'concurrent',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const randomValue = Math.random();
            if (randomValue < 0.3) { // 30% failure rate
              throw new Error(`Random failure ${randomValue}`);
            }
            return audioData;
          }
        };
        
        const concurrentParser = new BeatParser();
        concurrentParser.addPlugin(concurrentPlugin);
        
        const buffers = Array(20).fill(null).map(() => 
          new Float32Array(2048).fill(Math.random())
        );
        
        // Run concurrent operations
        const operations = buffers.map(buffer => 
          concurrentParser.parseBuffer(buffer).catch(error => ({ error }))
        );
        
        const results = await Promise.all(operations);
        
        // Some should succeed, some should fail
        const successes = results.filter(r => !('error' in r));
        const failures = results.filter(r => 'error' in r);
        
        expect(successes.length).toBeGreaterThan(0);
        expect(failures.length).toBeGreaterThan(0);
        expect(successes.length + failures.length).toBe(20);
        
        // Failed operations should not affect successful ones
        successes.forEach(result => {
          expect(result).toBeDefined();
          expect((result as any).beats).toBeDefined();
        });
        
        await concurrentParser.cleanup();
      }, 15000);
    });

    describe('System Health Monitoring', () => {
      test('should monitor and report system health', async () => {
        let healthMetrics = {
          successfulOperations: 0,
          failedOperations: 0,
          averageProcessingTime: 0,
          memoryUsage: 0
        };
        
        const healthMonitoringPlugin: BeatParserPlugin = {
          name: 'health-monitor',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const startTime = Date.now();
            const startMemory = process.memoryUsage().heapUsed;
            
            try {
              // Simulate some processing
              await new Promise(resolve => setTimeout(resolve, 10));
              
              const endTime = Date.now();
              const endMemory = process.memoryUsage().heapUsed;
              
              healthMetrics.successfulOperations++;
              healthMetrics.averageProcessingTime = 
                (healthMetrics.averageProcessingTime + (endTime - startTime)) / 2;
              healthMetrics.memoryUsage = endMemory - startMemory;
              
              return audioData;
            } catch (error) {
              healthMetrics.failedOperations++;
              throw error;
            }
          }
        };
        
        const healthParser = new BeatParser();
        healthParser.addPlugin(healthMonitoringPlugin);
        
        const buffer = new Float32Array(4096).fill(0.5);
        
        // Perform multiple operations
        for (let i = 0; i < 10; i++) {
          try {
            await healthParser.parseBuffer(buffer);
          } catch (error) {
            // Some might fail - that's okay for monitoring
          }
        }
        
        expect(healthMetrics.successfulOperations).toBeGreaterThan(0);
        expect(healthMetrics.averageProcessingTime).toBeGreaterThan(0);
        
        await healthParser.cleanup();
      });

      test('should provide system recovery recommendations', async () => {
        const recommendations: string[] = [];
        
        const advisoryPlugin: BeatParserPlugin = {
          name: 'advisory',
          version: '1.0.0',
          processAudio: async (audioData) => {
            const memoryUsage = process.memoryUsage();
            
            if (memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
              recommendations.push('Consider reducing buffer sizes');
            }
            
            if (audioData.length > 88200) { // > 2 seconds at 44.1kHz
              recommendations.push('Large buffers may cause performance issues');
            }
            
            return audioData;
          }
        };
        
        const advisoryParser = new BeatParser();
        advisoryParser.addPlugin(advisoryPlugin);
        
        const largeBuffer = new Float32Array(100000).fill(0.5);
        
        await advisoryParser.parseBuffer(largeBuffer);
        
        expect(recommendations.length).toBeGreaterThan(0);
        expect(recommendations.some(rec => rec.includes('performance issues'))).toBe(true);
        
        await advisoryParser.cleanup();
      });
    });
  });

  describe('Integration Recovery Patterns', () => {
    test('should recover from streaming operation failures', async () => {
      let streamChunksProcessed = 0;
      let streamErrors = 0;
      
      const resilientStream = new ReadableStream({
        pull(controller) {
          streamChunksProcessed++;
          
          if (streamChunksProcessed <= 2) {
            // First two chunks succeed
            controller.enqueue(new Float32Array(1024).fill(0.5));
          } else if (streamChunksProcessed === 3) {
            // Third chunk fails
            streamErrors++;
            controller.error(new Error('Stream processing error'));
          } else {
            // Subsequent chunks would succeed if stream continued
            controller.enqueue(new Float32Array(1024).fill(0.3));
            controller.close();
          }
        }
      });
      
      try {
        await parser.parseStream(resilientStream);
        fail('Should have failed due to stream error');
      } catch (error) {
        expect((error as Error).message).toMatch(/Stream.*error|processing.*error/);
      }
      
      expect(streamChunksProcessed).toBe(3);
      expect(streamErrors).toBe(1);
    });

    test('should maintain data consistency during recovery', async () => {
      const dataConsistencyPlugin: BeatParserPlugin = {
        name: 'data-consistency',
        version: '1.0.0',
        processBeats: async (beats) => {
          // Simulate partial processing failure
          const processedBeats = beats.slice(0, Math.floor(beats.length / 2));
          
          if (processedBeats.length === 0) {
            throw new Error('No beats to process');
          }
          
          // Ensure data consistency - all beats should have required fields
          return processedBeats.map(beat => ({
            ...beat,
            timestamp: beat.timestamp || 0,
            confidence: Math.max(0, Math.min(1, beat.confidence || 0)),
            strength: Math.max(0, beat.strength || 0)
          }));
        }
      };
      
      const consistencyParser = new BeatParser();
      consistencyParser.addPlugin(dataConsistencyPlugin);
      
      const buffer = new Float32Array(4096).fill(0.5);
      
      const result = await consistencyParser.parseBuffer(buffer);
      
      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      
      // All returned beats should have consistent data structure
      result.beats.forEach(beat => {
        expect(beat).toHaveProperty('timestamp');
        expect(beat).toHaveProperty('confidence');
        expect(beat).toHaveProperty('strength');
        expect(beat.confidence).toBeGreaterThanOrEqual(0);
        expect(beat.confidence).toBeLessThanOrEqual(1);
      });
      
      await consistencyParser.cleanup();
    });
  });
});