/**
 * Cross-Platform Module Loading Tests
 * Validates module system compatibility across CommonJS, ES Modules, and UMD
 */

describe('Cross-Platform Module Loading', () => {
  describe('CommonJS Module Loading', () => {
    test('should load main module using require', () => {
      // Test CommonJS require
      expect(() => {
        const beatParser = require('../index');
        expect(beatParser).toBeDefined();
      }).not.toThrow();
    });

    test('should load core modules via CommonJS', () => {
      const coreIndex = require('../core/index');
      expect(coreIndex).toBeDefined();
      expect(coreIndex.BeatParser).toBeDefined();
      expect(coreIndex.AudioProcessor).toBeDefined();

      const beatParserModule = require('../core/BeatParser');
      expect(beatParserModule).toBeDefined();
      expect(beatParserModule.BeatParser).toBeDefined();
    });

    test('should load utility modules via CommonJS', () => {
      const utilsIndex = require('../utils/index');
      expect(utilsIndex).toBeDefined();
      expect(utilsIndex.AudioUtils).toBeDefined();
      expect(utilsIndex.SignalProcessing).toBeDefined();

      const audioUtils = require('../utils/AudioUtils');
      expect(audioUtils).toBeDefined();
      expect(audioUtils.AudioUtils).toBeDefined();
    });

    test('should load algorithm modules via CommonJS', () => {
      const algorithmsIndex = require('../algorithms/index');
      expect(algorithmsIndex).toBeDefined();

      const hybridDetector = require('../algorithms/HybridDetector');
      expect(hybridDetector).toBeDefined();
      expect(hybridDetector.HybridDetector).toBeDefined();
    });

    test('should load worker modules via CommonJS', () => {
      const workerIndex = require('../worker/index');
      expect(workerIndex).toBeDefined();

      const workerClient = require('../worker/WorkerClient');
      expect(workerClient).toBeDefined();
      expect(workerClient.BeatParserWorkerClient).toBeDefined();
      expect(workerClient.createWorkerClient).toBeDefined();
      expect(workerClient.isWorkerSupported).toBeDefined();
    });

    test('should support destructured imports via CommonJS', () => {
      const { BeatParser } = require('../core/BeatParser');
      expect(BeatParser).toBeDefined();
      expect(typeof BeatParser).toBe('function');

      const { AudioUtils, SignalProcessing } = require('../utils/index');
      expect(AudioUtils).toBeDefined();
      expect(SignalProcessing).toBeDefined();
    });

    test('should handle circular dependencies in CommonJS', () => {
      // Test that circular dependencies don't cause loading issues
      expect(() => {
        const coreIndex = require('../core/index');
        const parsersIndex = require('../parsers/index');
        expect(coreIndex).toBeDefined();
        expect(parsersIndex).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('ES Module Loading', () => {
    test('should support dynamic imports', async () => {
      const mainModule = await import('../index');
      expect(mainModule).toBeDefined();
      expect(mainModule.BeatParser).toBeDefined();
      expect(mainModule.default).toBeDefined();
    });

    test('should load core modules via ES imports', async () => {
      const coreModule = await import('../core/BeatParser');
      expect(coreModule).toBeDefined();
      expect(coreModule.BeatParser).toBeDefined();

      const audioProcessor = await import('../core/AudioProcessor');
      expect(audioProcessor).toBeDefined();
      expect(audioProcessor.AudioProcessor).toBeDefined();
    });

    test('should support named imports', async () => {
      const { BeatParser } = await import('../core/BeatParser');
      expect(BeatParser).toBeDefined();
      expect(typeof BeatParser).toBe('function');

      const { AudioUtils } = await import('../utils/AudioUtils');
      expect(AudioUtils).toBeDefined();
    });

    test('should support default exports', async () => {
      const mainModule = await import('../index');
      expect(mainModule.default).toBeDefined();
      expect(typeof mainModule.default).toBe('function');

      // Default export should be BeatParser
      const defaultExport = mainModule.default;
      const namedExport = mainModule.BeatParser;
      expect(defaultExport).toBe(namedExport);
    });

    test('should handle re-exports correctly', async () => {
      const mainModule = await import('../index');
      const coreModule = await import('../core/index');

      // Main module should re-export core module exports
      expect(mainModule.BeatParser).toBe(coreModule.BeatParser);
      expect(mainModule.AudioProcessor).toBe(coreModule.AudioProcessor);
    });

    test('should support star exports', async () => {
      const mainModule = await import('../index');
      
      // Should have all core exports
      expect(mainModule.BeatParser).toBeDefined();
      expect(mainModule.AudioProcessor).toBeDefined();
      expect(mainModule.BaseParser).toBeDefined();
      expect(mainModule.BeatSelector).toBeDefined();
      expect(mainModule.OutputFormatter).toBeDefined();

      // Should have utility exports
      expect(mainModule.AudioUtils).toBeDefined();
      expect(mainModule.SignalProcessing).toBeDefined();

      // Should have algorithm exports
      expect(mainModule.HybridDetector).toBeDefined();
    });
  });

  describe('Module Resolution', () => {
    test('should resolve relative imports correctly', async () => {
      // Test that modules can import their dependencies
      const beatParser = await import('../core/BeatParser');
      const audioProcessor = await import('../core/AudioProcessor');
      
      expect(beatParser).toBeDefined();
      expect(audioProcessor).toBeDefined();

      // These modules should have successfully imported their dependencies
      expect(beatParser.BeatParser).toBeDefined();
      expect(audioProcessor.AudioProcessor).toBeDefined();
    });

    test('should resolve index imports correctly', async () => {
      const coreIndex = await import('../core');
      const utilsIndex = await import('../utils');
      const algorithmsIndex = await import('../algorithms');
      const workersIndex = await import('../worker');

      expect(coreIndex).toBeDefined();
      expect(utilsIndex).toBeDefined();
      expect(algorithmsIndex).toBeDefined();
      expect(workersIndex).toBeDefined();
    });

    test('should handle deep imports', async () => {
      // Direct deep imports should work
      const hybridDetector = await import('../algorithms/HybridDetector');
      const onsetDetection = await import('../algorithms/OnsetDetection');
      
      expect(hybridDetector.HybridDetector).toBeDefined();
      expect(onsetDetection.OnsetDetection).toBeDefined();
    });

    test('should handle conditional imports', async () => {
      // Conditional imports based on environment should work
      const workerClient = await import('../worker/WorkerClient');
      expect(workerClient.isWorkerSupported).toBeDefined();
      
      const isSupported = workerClient.isWorkerSupported();
      expect(typeof isSupported).toBe('boolean');
    });
  });

  describe('Type Definition Loading', () => {
    test('should load type definitions without runtime errors', async () => {
      // Loading the main module should include TypeScript types
      const mainModule = await import('../index');
      expect(mainModule).toBeDefined();

      // Types module should be loadable
      const typesModule = await import('../types/index');
      expect(typesModule).toBeDefined();
    });

    test('should handle type-only imports gracefully', async () => {
      // Even though we can't directly test TypeScript types in Jest,
      // we can ensure the modules that export types load correctly
      const typesModule = await import('../types/index');
      expect(typesModule).toBeDefined();
    });
  });

  describe('Bundle Compatibility', () => {
    test('should be compatible with bundler environments', async () => {
      // Simulate bundler environment where modules are processed
      const mainModule = await import('../index');
      
      // All main exports should be available
      expect(mainModule.BeatParser).toBeDefined();
      expect(mainModule.default).toBeDefined();
      expect(mainModule.HybridDetector).toBeDefined();
      expect(mainModule.BeatParserWorkerClient).toBeDefined();
    });

    test('should handle tree-shaking friendly exports', async () => {
      // Individual imports should work (tree-shaking friendly)
      const { BeatParser } = await import('../core/BeatParser');
      const { AudioUtils } = await import('../utils/AudioUtils');
      const { HybridDetector } = await import('../algorithms/HybridDetector');
      
      expect(BeatParser).toBeDefined();
      expect(AudioUtils).toBeDefined();
      expect(HybridDetector).toBeDefined();
    });

    test('should support side-effect free imports', async () => {
      // Importing modules should not cause side effects
      let sideEffectOccurred = false;
      
      // Mock console to detect side effects
      const originalConsoleLog = console.log;
      console.log = (...args) => {
        if (args.some(arg => typeof arg === 'string' && arg.includes('initialization'))) {
          sideEffectOccurred = true;
        }
        originalConsoleLog(...args);
      };

      try {
        await import('../core/BeatParser');
        await import('../utils/AudioUtils');
        await import('../algorithms/HybridDetector');

        // Module loading should not cause unwanted side effects
        expect(sideEffectOccurred).toBe(false);
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });

  describe('Error Handling in Module Loading', () => {
    test('should handle missing dependencies gracefully', async () => {
      // Even if optional dependencies are missing, core modules should load
      const mainModule = await import('../index');
      expect(mainModule).toBeDefined();
      expect(mainModule.BeatParser).toBeDefined();
    });

    test('should provide meaningful error messages for failed imports', async () => {
      // Test importing non-existent module
      await expect(import('../non-existent-module'))
        .rejects
        .toThrow();

      try {
        await import('../non-existent-module');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toMatch(/cannot.*resolve|not.*found/i);
      }
    });
  });

  describe('Node.js Module Compatibility', () => {
    test('should support Node.js module.exports patterns', () => {
      // Test traditional module.exports pattern
      const moduleExports = require('../core/BeatParser');
      expect(moduleExports).toBeDefined();
      expect(moduleExports.BeatParser).toBeDefined();
    });

    test('should support Node.js exports field patterns', async () => {
      // Dynamic import should work with exports field in package.json
      const mainModule = await import('../index');
      expect(mainModule).toBeDefined();
    });

    test('should handle Node.js built-in modules correctly', () => {
      // Modules that use Node.js built-ins should handle them correctly
      expect(() => {
        const audioProcessor = require('../core/AudioProcessor');
        expect(audioProcessor).toBeDefined();
      }).not.toThrow();
    });

    test('should support conditional exports for Node.js', async () => {
      // Main module should load correctly in Node.js environment
      const mainModule = await import('../index');
      expect(mainModule).toBeDefined();
      
      // Worker client should detect Node.js environment correctly
      expect(mainModule.isWorkerSupported()).toBe(false);
    });
  });

  describe('Module Caching', () => {
    test('should cache modules correctly', async () => {
      const module1 = await import('../core/BeatParser');
      const module2 = await import('../core/BeatParser');
      
      // Same module should be returned (cached)
      expect(module1).toBe(module2);
      expect(module1.BeatParser).toBe(module2.BeatParser);
    });

    test('should handle cache invalidation correctly', () => {
      const modulePath = require.resolve('../core/BeatParser');
      
      // Load module
      const module1 = require('../core/BeatParser');
      
      // Delete from cache
      delete require.cache[modulePath];
      
      // Load again - should work without issues
      const module2 = require('../core/BeatParser');
      
      expect(module1).toBeDefined();
      expect(module2).toBeDefined();
      // They should be different instances now
      expect(module1).not.toBe(module2);
    });
  });

  describe('Circular Dependency Handling', () => {
    test('should handle circular dependencies without deadlock', async () => {
      // Test that circular dependencies between modules are handled gracefully
      const coreModule = await import('../core/index');
      const parsersModule = await import('../parsers/index');
      const algorithmsModule = await import('../algorithms/index');
      
      expect(coreModule).toBeDefined();
      expect(parsersModule).toBeDefined();
      expect(algorithmsModule).toBeDefined();
    });

    test('should maintain module identity with circular deps', async () => {
      // Import the same module through different paths
      const directImport = await import('../core/BeatParser');
      const indexImport = await import('../core/index');
      
      // Should refer to the same constructor
      expect(directImport.BeatParser).toBe(indexImport.BeatParser);
    });
  });

  describe('Module Metadata', () => {
    test('should provide module metadata correctly', async () => {
      // Test that modules provide correct metadata
      const mainModule = await import('../index');
      
      // Should have both named and default exports
      const exportNames = Object.keys(mainModule);
      expect(exportNames).toContain('BeatParser');
      expect(exportNames).toContain('default');
      expect(exportNames).toContain('HybridDetector');
      expect(exportNames).toContain('AudioProcessor');
    });

    test('should handle import.meta correctly where available', async () => {
      // In ES module context, import.meta might be available
      // This test ensures that modules that might use import.meta handle it correctly
      const workerModule = await import('../worker/WorkerClient');
      expect(workerModule).toBeDefined();
    });
  });
});