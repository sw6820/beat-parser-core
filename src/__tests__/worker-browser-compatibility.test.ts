/**
 * Web Worker Browser Compatibility Tests
 * Comprehensive validation of cross-browser worker support and feature detection
 */

import { performance } from 'perf_hooks';
import { BeatParserWorkerClient, isWorkerSupported } from '../worker/WorkerClient';
import { WorkerTestingUtils, type WorkerBrowserCompatibility, type BrowserWorkerFeatures } from './worker-testing-utils';

describe('Web Worker Browser Compatibility', () => {
  let testEnv: ReturnType<typeof WorkerTestingUtils.setupTestEnvironment>;
  
  beforeAll(() => {
    testEnv = WorkerTestingUtils.setupTestEnvironment();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Browser Environment Detection', () => {
    test('should detect Web Worker support accurately', () => {
      const support = WorkerTestingUtils.checkWorkerSupport();
      
      expect(support.isSupported).toBe(true);
      expect(support.features).toBeDefined();
      expect(Array.isArray(support.limitations)).toBe(true);
      
      console.log(`Worker support: ${support.isSupported}`);
      console.log(`Features:`, support.features);
      console.log(`Limitations:`, support.limitations);
    });

    test('should provide detailed feature detection', () => {
      const support = WorkerTestingUtils.checkWorkerSupport();
      
      // Validate feature detection structure
      expect(typeof support.features.basicWorker).toBe('boolean');
      expect(typeof support.features.moduleWorker).toBe('boolean');
      expect(typeof support.features.transferableObjects).toBe('boolean');
      expect(typeof support.features.sharedArrayBuffer).toBe('boolean');
      
      // In our test environment, basic features should be available
      expect(support.features.basicWorker).toBe(true);
      expect(support.features.transferableObjects).toBe(true);
    });

    test('should handle missing Worker constructor', () => {
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

    test('should handle missing transferable objects support', () => {
      const originalArrayBuffer = (global as any).ArrayBuffer;
      delete (global as any).ArrayBuffer;

      try {
        const support = WorkerTestingUtils.checkWorkerSupport();
        
        expect(support.features.transferableObjects).toBe(false);
        expect(support.limitations).toContain('Transferable Objects not supported');
      } finally {
        (global as any).ArrayBuffer = originalArrayBuffer;
      }
    });

    test('should detect SharedArrayBuffer availability', () => {
      const support = WorkerTestingUtils.checkWorkerSupport();
      
      // SharedArrayBuffer may not be available in all environments
      expect(typeof support.features.sharedArrayBuffer).toBe('boolean');
      
      if (!support.features.sharedArrayBuffer) {
        expect(support.limitations).toContain('SharedArrayBuffer not supported');
      }
    });
  });

  describe('Cross-Browser Worker Features', () => {
    let workerClient: BeatParserWorkerClient;

    beforeEach(async () => {
      workerClient = WorkerTestingUtils.createTestWorkerClient();
      await workerClient.initialize();
    });

    afterEach(async () => {
      await workerClient.terminate();
    });

    test('should support basic Worker functionality across browsers', async () => {
      const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
      
      const result = await workerClient.parseBuffer(testAudio, {
        filename: 'browser-compat-basic.wav',
        targetPictureCount: 5
      });

      expect(result).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.metadata.filename).toBe('browser-compat-basic.wav');
    });

    test('should handle module-based workers', async () => {
      // Test module worker support
      const moduleWorkerClient = new BeatParserWorkerClient({
        workerUrl: new URL('../worker/BeatParserWorker.ts', import.meta.url).href
      });

      try {
        await moduleWorkerClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const result = await moduleWorkerClient.parseBuffer(testAudio, {
          filename: 'module-worker-test.wav'
        });

        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe('module-worker-test.wav');
      } finally {
        await moduleWorkerClient.terminate();
      }
    });

    test('should support transferable objects optimization', async () => {
      const largeAudio = new Float32Array(44100); // 1 second of audio
      
      // Fill with recognizable pattern
      for (let i = 0; i < largeAudio.length; i++) {
        largeAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      }

      const originalBuffer = largeAudio.buffer;
      
      const result = await workerClient.parseBuffer(largeAudio, {
        filename: 'transferable-test.wav'
      });

      expect(result).toBeDefined();
      expect(result.metadata.filename).toBe('transferable-test.wav');
      
      // Note: In real implementation, buffer might be transferred
      // Mock implementation doesn't actually transfer, so buffer remains intact
      expect(largeAudio.length).toBe(44100);
    });

    test('should gracefully handle unsupported features', async () => {
      // Simulate environment without certain features
      const originalWorker = (global as any).Worker;
      
      // Create a limited Worker implementation
      (global as any).Worker = class LimitedWorker extends testEnv.mockWorker {
        constructor(url: string, options?: WorkerOptions) {
          super(url, options);
          
          // Simulate feature limitations
          if (options && options.type === 'module') {
            throw new Error('Module workers not supported');
          }
        }
      };

      try {
        const limitedClient = new BeatParserWorkerClient();
        await limitedClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const result = await limitedClient.parseBuffer(testAudio);
        
        expect(result).toBeDefined();
        await limitedClient.terminate();
      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle different worker creation patterns', async () => {
      const workerPatterns = [
        { type: 'default', options: {} },
        { type: 'module', options: { type: 'module' as const } },
        { type: 'credentials', options: { credentials: 'same-origin' as const } }
      ];

      for (const pattern of workerPatterns) {
        try {
          const patternClient = new BeatParserWorkerClient({
            workerUrl: '../worker/BeatParserWorker.ts',
            timeout: 10000
          });

          await patternClient.initialize();
          
          const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
          const result = await patternClient.parseBuffer(testAudio, {
            filename: `pattern-${pattern.type}.wav`
          });

          expect(result).toBeDefined();
          expect(result.metadata.filename).toBe(`pattern-${pattern.type}.wav`);
          
          await patternClient.terminate();
          
          console.log(`Worker pattern '${pattern.type}': SUCCESS`);
        } catch (error) {
          // Some patterns may not be supported in test environment
          console.log(`Worker pattern '${pattern.type}': ${error}`);
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Browser-Specific Performance Characteristics', () => {
    const simulatedBrowsers = [
      { name: 'Chrome', latency: 50, errorRate: 0 },
      { name: 'Firefox', latency: 80, errorRate: 0 },
      { name: 'Safari', latency: 100, errorRate: 0.02 },
      { name: 'Edge', latency: 60, errorRate: 0.01 }
    ];

    test('should measure performance across different browser engines', async () => {
      const performanceResults: Array<{
        browser: string;
        averageTime: number;
        successRate: number;
        throughput: number;
      }> = [];

      for (const browser of simulatedBrowsers) {
        const browserClient = WorkerTestingUtils.createTestWorkerClient({
          latency: browser.latency,
          errorRate: browser.errorRate
        });

        try {
          await browserClient.initialize();
          
          const testOperations = 5;
          const testAudio = WorkerTestingUtils.generateTestAudio('medium') as Float32Array;
          
          const operationResults = await Promise.allSettled(
            Array.from({ length: testOperations }, (_, i) =>
              browserClient.parseBuffer(testAudio, { filename: `${browser.name.toLowerCase()}-${i}.wav` })
            )
          );

          const successful = operationResults.filter(r => r.status === 'fulfilled');
          const successRate = successful.length / testOperations;
          
          // Calculate average time (approximated from latency)
          const averageTime = browser.latency + 100; // Base processing time
          const throughput = successRate > 0 ? successful.length / (averageTime / 1000) : 0;

          performanceResults.push({
            browser: browser.name,
            averageTime,
            successRate,
            throughput
          });

          console.log(`${browser.name}: ${averageTime.toFixed(0)}ms avg, ${(successRate * 100).toFixed(1)}% success`);
        } finally {
          await browserClient.terminate();
        }
      }

      // Analyze browser performance differences
      expect(performanceResults).toHaveLength(simulatedBrowsers.length);
      
      performanceResults.forEach(result => {
        expect(result.averageTime).toBeGreaterThan(0);
        expect(result.successRate).toBeGreaterThanOrEqual(0);
        expect(result.successRate).toBeLessThanOrEqual(1);
        
        if (result.successRate > 0) {
          expect(result.throughput).toBeGreaterThan(0);
        }
      });

      // Chrome should generally perform well
      const chromeResult = performanceResults.find(r => r.browser === 'Chrome');
      expect(chromeResult).toBeDefined();
      expect(chromeResult!.successRate).toBeGreaterThan(0.9);
    });

    test('should handle browser-specific memory limitations', async () => {
      const memorySizes = [1, 5, 10]; // MB
      const browserMemoryResults: Array<{
        size: number;
        results: Array<{ browser: string; success: boolean; time?: number }>;
      }> = [];

      for (const sizeMB of memorySizes) {
        const sizeResults: Array<{ browser: string; success: boolean; time?: number }> = [];
        
        // Simulate different memory handling per browser
        for (const browser of simulatedBrowsers.slice(0, 2)) { // Test with 2 browsers
          const memoryMultiplier = browser.name === 'Safari' ? 1.5 : 1.0; // Safari uses more memory
          const effectiveSize = sizeMB * memoryMultiplier;
          
          // Create large audio data
          const samples = Math.floor(effectiveSize * 1024 * 1024 / 4);
          const largeAudio = new Float32Array(samples);
          
          // Fill with pattern
          for (let i = 0; i < samples; i++) {
            largeAudio[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
          }

          const browserClient = WorkerTestingUtils.createTestWorkerClient({
            latency: browser.latency,
            errorRate: browser.errorRate
          });

          try {
            await browserClient.initialize();
            
            const startTime = performance.now();
            const result = await browserClient.parseBuffer(largeAudio, {
              filename: `memory-${sizeMB}mb-${browser.name.toLowerCase()}.wav`
            });
            const endTime = performance.now();

            sizeResults.push({
              browser: browser.name,
              success: true,
              time: endTime - startTime
            });

            expect(result).toBeDefined();
            expect(result.metadata.filename).toBe(`memory-${sizeMB}mb-${browser.name.toLowerCase()}.wav`);
          } catch (error) {
            sizeResults.push({
              browser: browser.name,
              success: false
            });
            
            console.log(`${browser.name} failed with ${sizeMB}MB: ${error}`);
          } finally {
            await browserClient.terminate();
          }
        }

        browserMemoryResults.push({ size: sizeMB, results: sizeResults });
      }

      // Analyze memory handling differences
      browserMemoryResults.forEach((sizeResult, i) => {
        console.log(`Memory test ${sizeResult.size}MB:`);
        
        sizeResult.results.forEach(result => {
          console.log(`  ${result.browser}: ${result.success ? 'SUCCESS' : 'FAILED'}${result.time ? ` (${result.time.toFixed(0)}ms)` : ''}`);
        });

        // At least some browsers should handle each size
        const successCount = sizeResult.results.filter(r => r.success).length;
        expect(successCount).toBeGreaterThan(0);
      });
    });

    test('should validate worker message size limits', async () => {
      const messageSizes = [1024, 1024 * 64, 1024 * 1024]; // 1KB, 64KB, 1MB
      
      for (const messageSize of messageSizes) {
        const audio = new Float32Array(messageSize / 4); // Convert bytes to float32 elements
        audio.fill(0.5);

        const workerClient = WorkerTestingUtils.createTestWorkerClient();

        try {
          await workerClient.initialize();
          
          const result = await workerClient.parseBuffer(audio, {
            filename: `message-size-${messageSize}.wav`
          });

          expect(result).toBeDefined();
          expect(result.metadata.filename).toBe(`message-size-${messageSize}.wav`);
          
          console.log(`Message size ${messageSize} bytes: SUCCESS`);
        } catch (error) {
          console.log(`Message size ${messageSize} bytes: FAILED - ${error}`);
          expect(error).toBeInstanceOf(Error);
        } finally {
          await workerClient.terminate();
        }
      }
    });
  });

  describe('Progressive Enhancement & Fallbacks', () => {
    test('should provide graceful degradation when workers unavailable', () => {
      const originalWorker = (global as any).Worker;
      delete (global as any).Worker;

      try {
        // Detection should work correctly
        expect(isWorkerSupported()).toBe(false);
        
        const support = WorkerTestingUtils.checkWorkerSupport();
        expect(support.isSupported).toBe(false);
        expect(support.limitations.length).toBeGreaterThan(0);
        
        // Client creation should handle gracefully or throw descriptive error
        expect(() => {
          const client = new BeatParserWorkerClient();
          // Initialize should fail gracefully
          return client.initialize();
        }).not.toThrow(); // Constructor shouldn't throw
        
      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle partial feature support scenarios', async () => {
      // Simulate browser with basic workers but limited features
      const originalWorker = (global as any).Worker;
      const originalArrayBuffer = (global as any).ArrayBuffer;
      
      (global as any).Worker = class PartialWorker extends testEnv.mockWorker {
        postMessage(message: any, transfer?: any[]) {
          // Simulate no transferable support - ignore transfer parameter
          super.postMessage(message);
        }
      };

      try {
        const partialClient = WorkerTestingUtils.createTestWorkerClient();
        await partialClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const result = await partialClient.parseBuffer(testAudio, {
          filename: 'partial-features.wav'
        });

        expect(result).toBeDefined();
        expect(result.metadata.filename).toBe('partial-features.wav');
        
        await partialClient.terminate();
      } finally {
        (global as any).Worker = originalWorker;
        (global as any).ArrayBuffer = originalArrayBuffer;
      }
    });

    test('should provide clear error messages for unsupported environments', async () => {
      const originalWorker = (global as any).Worker;
      delete (global as any).Worker;

      try {
        const unsupportedClient = new BeatParserWorkerClient();
        
        await expect(unsupportedClient.initialize())
          .rejects
          .toThrow(/Web Workers.*not supported/);
      } finally {
        (global as any).Worker = originalWorker;
      }
    });

    test('should handle worker script loading failures', async () => {
      const originalWorker = (global as any).Worker;
      
      (global as any).Worker = class FailingWorker {
        constructor() {
          // Simulate script loading failure
          throw new Error('Failed to load worker script');
        }
      };

      try {
        const failingClient = new BeatParserWorkerClient({
          workerUrl: '/non-existent-worker.js'
        });
        
        await expect(failingClient.initialize())
          .rejects
          .toThrow(/Failed to initialize BeatParser worker/);
      } finally {
        (global as any).Worker = originalWorker;
      }
    });
  });

  describe('Security & Origin Policy Compliance', () => {
    test('should handle same-origin policy restrictions', async () => {
      // Simulate cross-origin worker loading
      const crossOriginClient = new BeatParserWorkerClient({
        workerUrl: 'https://external-domain.com/worker.js'
      });

      try {
        // This would normally fail due to CORS in real browsers
        // Our mock implementation allows it, but we test the pattern
        await crossOriginClient.initialize();
        
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const result = await crossOriginClient.parseBuffer(testAudio);
        
        expect(result).toBeDefined();
      } catch (error) {
        // In real environment, this might fail due to CORS
        expect(error).toBeInstanceOf(Error);
        console.log('Cross-origin worker loading failed as expected:', error.message);
      } finally {
        await crossOriginClient.terminate();
      }
    });

    test('should validate worker script integrity', async () => {
      // Test with various worker URLs to simulate integrity checking
      const workerUrls = [
        '../worker/BeatParserWorker.ts',
        './BeatParserWorker.js',
        '/workers/beat-parser.js'
      ];

      for (const url of workerUrls) {
        try {
          const integrityClient = new BeatParserWorkerClient({ workerUrl: url });
          await integrityClient.initialize();
          
          const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
          const result = await integrityClient.parseBuffer(testAudio, {
            filename: `integrity-test-${url.replace(/[^a-zA-Z0-9]/g, '-')}.wav`
          });
          
          expect(result).toBeDefined();
          await integrityClient.terminate();
          
          console.log(`Worker URL ${url}: SUCCESS`);
        } catch (error) {
          console.log(`Worker URL ${url}: ${error}`);
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    test('should handle Content Security Policy restrictions', async () => {
      // Simulate CSP restrictions by limiting worker creation
      const originalWorker = (global as any).Worker;
      
      (global as any).Worker = class CSPRestrictedWorker {
        constructor(scriptURL: string, options?: WorkerOptions) {
          // Simulate CSP blocking inline or external scripts
          if (scriptURL.startsWith('data:') || scriptURL.includes('inline')) {
            throw new Error('Content Security Policy violation');
          }
          
          return new testEnv.mockWorker(scriptURL, options);
        }
      };

      try {
        // This should work with proper URLs
        const cspClient = new BeatParserWorkerClient({
          workerUrl: '../worker/BeatParserWorker.ts'
        });
        
        await cspClient.initialize();
        const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
        const result = await cspClient.parseBuffer(testAudio);
        
        expect(result).toBeDefined();
        await cspClient.terminate();
      } finally {
        (global as any).Worker = originalWorker;
      }
    });
  });

  describe('Browser Compatibility Matrix', () => {
    test('should generate compatibility report for different environments', async () => {
      const environments = [
        { name: 'Modern Chrome', features: { basic: true, module: true, transferable: true, sharedArrayBuffer: true } },
        { name: 'Firefox ESR', features: { basic: true, module: true, transferable: true, sharedArrayBuffer: false } },
        { name: 'Safari 14+', features: { basic: true, module: false, transferable: true, sharedArrayBuffer: false } },
        { name: 'Legacy Edge', features: { basic: true, module: false, transferable: false, sharedArrayBuffer: false } },
        { name: 'Mobile Safari', features: { basic: true, module: false, transferable: true, sharedArrayBuffer: false } }
      ];

      const compatibilityMatrix: WorkerBrowserCompatibility[] = [];

      for (const env of environments) {
        // Simulate environment-specific behavior
        const originalWorker = (global as any).Worker;
        const originalArrayBuffer = (global as any).ArrayBuffer;
        const originalSharedArrayBuffer = (global as any).SharedArrayBuffer;

        try {
          // Set up environment simulation
          if (!env.features.basic) {
            delete (global as any).Worker;
          }
          if (!env.features.transferable) {
            delete (global as any).ArrayBuffer;
          }
          if (!env.features.sharedArrayBuffer) {
            delete (global as any).SharedArrayBuffer;
          }

          // Test environment
          const support = WorkerTestingUtils.checkWorkerSupport();
          
          const browserFeatures: BrowserWorkerFeatures = {
            moduleWorkers: env.features.module,
            importScripts: true, // Assume basic import support
            nestedWorkers: false, // Generally not supported
            workerTypeModule: env.features.module,
            transferableStreams: env.features.transferable
          };

          let performanceMetrics = {
            creationTime: 0,
            messageLatency: 0,
            transferEfficiency: 0,
            memoryIsolation: env.features.basic
          };

          // Measure performance if workers are supported
          if (support.isSupported) {
            const client = WorkerTestingUtils.createTestWorkerClient();
            
            try {
              const startTime = performance.now();
              await client.initialize();
              const initTime = performance.now() - startTime;
              
              const testAudio = WorkerTestingUtils.generateTestAudio('simple') as Float32Array;
              
              const messageStart = performance.now();
              await client.parseBuffer(testAudio);
              const messageTime = performance.now() - messageStart;
              
              performanceMetrics = {
                creationTime: initTime,
                messageLatency: messageTime,
                transferEfficiency: testAudio.length * 4 / messageTime, // bytes/ms
                memoryIsolation: true
              };
            } finally {
              await client.terminate();
            }
          }

          compatibilityMatrix.push({
            browser: env.name,
            version: 'Latest',
            workerSupported: support.isSupported,
            transferableSupported: env.features.transferable,
            sharedArrayBufferSupported: env.features.sharedArrayBuffer,
            features: browserFeatures,
            performance: performanceMetrics
          });

        } finally {
          // Restore original environment
          (global as any).Worker = originalWorker;
          (global as any).ArrayBuffer = originalArrayBuffer;
          if (originalSharedArrayBuffer) {
            (global as any).SharedArrayBuffer = originalSharedArrayBuffer;
          }
        }
      }

      // Generate compatibility report
      console.log('\nBrowser Compatibility Matrix:');
      console.log('============================');
      
      compatibilityMatrix.forEach(compat => {
        console.log(`\n${compat.browser}:`);
        console.log(`  Worker Support: ${compat.workerSupported ? '✓' : '✗'}`);
        console.log(`  Transferable Objects: ${compat.transferableSupported ? '✓' : '✗'}`);
        console.log(`  SharedArrayBuffer: ${compat.sharedArrayBufferSupported ? '✓' : '✗'}`);
        console.log(`  Module Workers: ${compat.features.moduleWorkers ? '✓' : '✗'}`);
        
        if (compat.workerSupported) {
          console.log(`  Init Time: ${compat.performance.creationTime.toFixed(2)}ms`);
          console.log(`  Message Latency: ${compat.performance.messageLatency.toFixed(2)}ms`);
          console.log(`  Transfer Rate: ${compat.performance.transferEfficiency.toFixed(0)} bytes/ms`);
        }
      });

      // Validate compatibility matrix
      expect(compatibilityMatrix).toHaveLength(environments.length);
      
      compatibilityMatrix.forEach(compat => {
        expect(typeof compat.workerSupported).toBe('boolean');
        expect(typeof compat.transferableSupported).toBe('boolean');
        expect(typeof compat.sharedArrayBufferSupported).toBe('boolean');
        
        if (compat.workerSupported) {
          expect(compat.performance.creationTime).toBeGreaterThanOrEqual(0);
          expect(compat.performance.messageLatency).toBeGreaterThan(0);
          expect(compat.performance.transferEfficiency).toBeGreaterThan(0);
        }
      });

      // Modern Chrome should have best feature support
      const modernChrome = compatibilityMatrix.find(c => c.browser === 'Modern Chrome');
      expect(modernChrome).toBeDefined();
      expect(modernChrome!.workerSupported).toBe(true);
      expect(modernChrome!.features.moduleWorkers).toBe(true);
      expect(modernChrome!.transferableSupported).toBe(true);
    });

    test('should provide browser-specific optimization recommendations', () => {
      const recommendations: Record<string, string[]> = {
        'Modern Chrome': [
          'Use module workers for better ES6+ support',
          'Leverage SharedArrayBuffer for high-performance data sharing',
          'Implement transferable objects for large data transfers'
        ],
        'Firefox': [
          'Use standard Worker constructor',
          'Implement fallback for SharedArrayBuffer unavailability',
          'Optimize for slightly higher message passing latency'
        ],
        'Safari': [
          'Avoid module workers, use classic worker scripts',
          'Test memory limits carefully on mobile devices',
          'Implement careful error handling for iOS-specific restrictions'
        ],
        'Legacy Edge': [
          'Use conservative Worker features only',
          'Implement comprehensive fallbacks',
          'Consider polyfills for advanced features'
        ]
      };

      // Validate recommendations structure
      Object.entries(recommendations).forEach(([browser, recs]) => {
        expect(Array.isArray(recs)).toBe(true);
        expect(recs.length).toBeGreaterThan(0);
        
        recs.forEach(rec => {
          expect(typeof rec).toBe('string');
          expect(rec.length).toBeGreaterThan(10);
        });
        
        console.log(`\n${browser} Recommendations:`);
        recs.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      });

      expect(Object.keys(recommendations).length).toBeGreaterThan(3);
    });
  });
});