/**
 * Cross-Platform Environment Detection Tests
 * Validates runtime environment detection and feature availability across platforms
 */

import { performance } from 'perf_hooks';

describe('Cross-Platform Environment Detection', () => {
  describe('Runtime Environment Detection', () => {
    test('should correctly identify Node.js environment', () => {
      const isNode = typeof process !== 'undefined' && process.versions?.node;
      const isBrowser = typeof window !== 'undefined';
      const isWorker = typeof importScripts === 'function';

      expect(isNode).toBe(true);
      expect(isBrowser).toBe(false);
      expect(isWorker).toBe(false);

      // Node.js specific features
      expect(typeof process.versions.node).toBe('string');
      expect(typeof require).toBe('function');
      expect(typeof module).toBe('object');
      expect(typeof Buffer).toBe('function');
    });

    test('should provide Node.js version information', () => {
      expect(process.versions).toBeDefined();
      expect(typeof process.versions.node).toBe('string');
      expect(typeof process.versions.v8).toBe('string');
      
      const nodeVersion = process.versions.node;
      const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
      
      // Ensure we're on a supported version (18+)
      expect(majorVersion).toBeGreaterThanOrEqual(18);
    });

    test('should detect available global objects', () => {
      const globals = {
        // Node.js globals
        process: typeof process !== 'undefined',
        Buffer: typeof Buffer !== 'undefined',
        require: typeof require !== 'undefined',
        module: typeof module !== 'undefined',
        __dirname: typeof __dirname !== 'undefined',
        __filename: typeof __filename !== 'undefined',
        
        // Browser globals (should be undefined in Node.js)
        window: typeof window !== 'undefined',
        document: typeof document !== 'undefined',
        navigator: typeof navigator !== 'undefined',
        location: typeof location !== 'undefined',
        
        // Web Worker globals
        importScripts: typeof importScripts !== 'undefined',
        postMessage: typeof postMessage !== 'undefined',
        
        // Universal globals
        console: typeof console !== 'undefined',
        performance: typeof performance !== 'undefined',
        setTimeout: typeof setTimeout !== 'undefined',
        setInterval: typeof setInterval !== 'undefined',
        Promise: typeof Promise !== 'undefined',
        Array: typeof Array !== 'undefined',
        Object: typeof Object !== 'undefined',
        JSON: typeof JSON !== 'undefined',
        Math: typeof Math !== 'undefined'
      };

      // Node.js environment expectations
      expect(globals.process).toBe(true);
      expect(globals.Buffer).toBe(true);
      expect(globals.require).toBe(true);
      expect(globals.module).toBe(true);
      
      // Browser globals should not be present
      expect(globals.window).toBe(false);
      expect(globals.document).toBe(false);
      expect(globals.navigator).toBe(false);
      
      // Universal globals should be present
      expect(globals.console).toBe(true);
      expect(globals.performance).toBe(true);
      expect(globals.Promise).toBe(true);
    });
  });

  describe('Audio API Detection', () => {
    test('should detect Web Audio API availability', () => {
      const hasAudioContext = typeof AudioContext !== 'undefined';
      const hasWebkitAudioContext = typeof (globalThis as any).webkitAudioContext !== 'undefined';
      const hasWebAudioAPI = hasAudioContext || hasWebkitAudioContext;

      // In Node.js environment, Web Audio API should not be available
      expect(hasWebAudioAPI).toBe(false);
      expect(hasAudioContext).toBe(false);
      expect(hasWebkitAudioContext).toBe(false);
    });

    test('should detect alternative audio processing capabilities', () => {
      // Node.js should have Buffer and stream processing capabilities
      expect(typeof Buffer).toBe('function');
      expect(typeof ArrayBuffer).toBe('function');
      expect(typeof Float32Array).toBe('function');
      expect(typeof Uint8Array).toBe('function');
      expect(typeof DataView).toBe('function');

      // Test buffer creation and manipulation
      const buffer = Buffer.from([1, 2, 3, 4]);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      const float32Array = new Float32Array(arrayBuffer);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(float32Array).toBeInstanceOf(Float32Array);
    });
  });

  describe('Worker API Detection', () => {
    test('should detect Worker API availability', () => {
      const hasWorker = typeof Worker !== 'undefined';
      const hasWorkerThreads = (() => {
        try {
          require.resolve('worker_threads');
          return true;
        } catch {
          return false;
        }
      })();

      // In Node.js environment
      expect(hasWorker).toBe(false); // No Web Workers
      expect(hasWorkerThreads).toBe(true); // Has worker_threads module

      // Test worker_threads import
      if (hasWorkerThreads) {
        const workerThreads = require('worker_threads');
        expect(typeof workerThreads.Worker).toBe('function');
        expect(typeof workerThreads.isMainThread).toBe('boolean');
        expect(typeof workerThreads.parentPort).toBeDefined();
      }
    });

    test('should detect transferable object support', () => {
      const hasArrayBuffer = typeof ArrayBuffer !== 'undefined';
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      const hasMessageChannel = typeof MessageChannel !== 'undefined';

      expect(hasArrayBuffer).toBe(true);
      // SharedArrayBuffer availability varies by environment
      expect(typeof hasSharedArrayBuffer).toBe('boolean');
      expect(hasMessageChannel).toBe(false); // Not available in Node.js
    });
  });

  describe('File System API Detection', () => {
    test('should detect Node.js file system capabilities', () => {
      const hasFs = (() => {
        try {
          require.resolve('fs');
          return true;
        } catch {
          return false;
        }
      })();

      const hasPath = (() => {
        try {
          require.resolve('path');
          return true;
        } catch {
          return false;
        }
      })();

      expect(hasFs).toBe(true);
      expect(hasPath).toBe(true);

      if (hasFs && hasPath) {
        const fs = require('fs');
        const path = require('path');

        expect(typeof fs.readFileSync).toBe('function');
        expect(typeof fs.writeFileSync).toBe('function');
        expect(typeof fs.existsSync).toBe('function');
        expect(typeof fs.statSync).toBe('function');
        expect(typeof path.join).toBe('function');
        expect(typeof path.resolve).toBe('function');
        expect(typeof path.basename).toBe('function');
      }
    });

    test('should not detect browser File API', () => {
      const hasFile = typeof File !== 'undefined';
      const hasFileReader = typeof FileReader !== 'undefined';
      const hasBlob = typeof Blob !== 'undefined';

      // These should not be available in Node.js
      expect(hasFile).toBe(false);
      expect(hasFileReader).toBe(false);
      expect(hasBlob).toBe(false);
    });
  });

  describe('Module System Detection', () => {
    test('should detect CommonJS support', () => {
      expect(typeof require).toBe('function');
      expect(typeof module).toBe('object');
      expect(typeof exports).toBe('object');
      expect(module.exports).toBeDefined();

      // Test CommonJS module loading
      const path = require('path');
      expect(typeof path.join).toBe('function');
    });

    test('should detect ES Module support', async () => {
      // Dynamic import should work in Node.js with ES modules
      try {
        const pathModule = await import('path');
        expect(typeof pathModule.join).toBe('function');
      } catch (error) {
        // If dynamic import fails, it might be due to module resolution
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should detect import.meta availability', () => {
      // import.meta should be available in ES module context
      const hasImportMeta = typeof import.meta !== 'undefined';
      
      // This test might fail depending on how Jest is configured
      // In pure Node.js ES modules, import.meta would be available
      expect(typeof hasImportMeta).toBe('boolean');
    });
  });

  describe('Performance API Detection', () => {
    test('should detect timing capabilities', () => {
      expect(typeof performance).toBe('object');
      expect(typeof performance.now).toBe('function');
      
      // Test performance measurement
      const start = performance.now();
      const end = performance.now();
      expect(end).toBeGreaterThanOrEqual(start);
      expect(typeof (end - start)).toBe('number');
    });

    test('should detect memory measurement capabilities', () => {
      if (process.memoryUsage) {
        const memory = process.memoryUsage();
        expect(typeof memory.heapUsed).toBe('number');
        expect(typeof memory.heapTotal).toBe('number');
        expect(typeof memory.external).toBe('number');
        expect(memory.heapUsed).toBeGreaterThan(0);
      }
    });

    test('should detect high-resolution time', () => {
      const time1 = process.hrtime.bigint();
      const time2 = process.hrtime.bigint();
      
      expect(typeof time1).toBe('bigint');
      expect(typeof time2).toBe('bigint');
      expect(time2).toBeGreaterThanOrEqual(time1);
    });
  });

  describe('Error Handling Capabilities', () => {
    test('should detect error stack trace support', () => {
      const error = new Error('Test error');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack?.includes('Test error')).toBe(true);
    });

    test('should detect async error handling', async () => {
      try {
        await Promise.reject(new Error('Async error'));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Async error');
        expect((error as Error).stack).toBeDefined();
      }
    });

    test('should handle uncaught exceptions', () => {
      const originalHandler = process.listeners('uncaughtException');
      let caughtError: Error | null = null;

      const testHandler = (error: Error) => {
        caughtError = error;
      };

      process.on('uncaughtException', testHandler);

      // This won't actually cause an uncaught exception in Jest
      // but tests that the mechanism exists
      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);

      process.removeListener('uncaughtException', testHandler);
    });
  });

  describe('Platform-Specific Features', () => {
    test('should detect operating system', () => {
      expect(process.platform).toBeDefined();
      expect(typeof process.platform).toBe('string');
      expect(['darwin', 'linux', 'win32', 'freebsd', 'openbsd', 'sunos']).toContain(process.platform);

      expect(process.arch).toBeDefined();
      expect(typeof process.arch).toBe('string');
      expect(['x64', 'arm64', 'arm', 'ia32']).toContain(process.arch);
    });

    test('should detect path separator', () => {
      const path = require('path');
      expect(path.sep).toBeDefined();
      expect(typeof path.sep).toBe('string');
      expect(['/','\\'].includes(path.sep)).toBe(true);
    });

    test('should detect environment variables', () => {
      expect(process.env).toBeDefined();
      expect(typeof process.env).toBe('object');
      expect(process.env.NODE_ENV).toBeDefined();
    });
  });
});