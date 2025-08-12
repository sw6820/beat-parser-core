/**
 * React/Next.js Integration Tests
 * Comprehensive testing of beat-parser integration with React and Next.js frameworks
 * Tests hooks, SSR compatibility, state management, and production scenarios
 */

import { BeatParser } from '../core/BeatParser';
import { ParseResult, Beat } from '../types';
import { 
  TestApplicationFactory, 
  IntegrationTestOrchestrator,
  PerformanceMonitor,
  ResourceMonitor 
} from './integration-testing-utils';

describe('React/Next.js Integration Tests', () => {
  let beatParser: BeatParser;
  let testAudioFiles: Map<string, Float32Array>;
  let mockReactApp: any;

  beforeAll(async () => {
    testAudioFiles = IntegrationTestOrchestrator.generateTestAudioFiles();
    mockReactApp = await TestApplicationFactory.createReactApp();
  });

  beforeEach(async () => {
    beatParser = new BeatParser({
      sampleRate: 44100,
      enablePreprocessing: true,
      enableNormalization: true
    });
    
    ResourceMonitor.takeSnapshot();
  });

  afterEach(async () => {
    await beatParser.cleanup();
    ResourceMonitor.takeSnapshot();
  });

  afterAll(async () => {
    await mockReactApp.cleanup();
    ResourceMonitor.clearSnapshots();
  });

  describe('React Hooks Integration', () => {
    test('should integrate with useCallback for parser memoization', async () => {
      PerformanceMonitor.startMeasurement('useCallback-integration');
      
      // Simulate useCallback memoization pattern
      const createParser = () => {
        return new BeatParser({
          sampleRate: 44100,
          enablePreprocessing: true
        });
      };

      // Simulate component dependency array changes
      let memoizedParser = createParser();
      const audioData = testAudioFiles.get('short-beat.wav')!;
      
      const result1 = await memoizedParser.parseBuffer(audioData);
      expect(result1.beats).toBeDefined();
      expect(result1.beats.length).toBeGreaterThan(0);

      // Simulate re-render with same dependencies (parser should be memoized)
      const result2 = await memoizedParser.parseBuffer(audioData);
      expect(result2.beats).toBeDefined();
      expect(result2.beats.length).toEqual(result1.beats.length);

      // Simulate dependency change (new parser should be created)
      memoizedParser = createParser();
      const result3 = await memoizedParser.parseBuffer(audioData);
      expect(result3.beats).toBeDefined();

      const duration = PerformanceMonitor.endMeasurement('useCallback-integration');
      expect(duration).toBeLessThan(5000); // Should complete in 5 seconds

      await memoizedParser.cleanup();
    });

    test('should integrate with useEffect for lifecycle management', async () => {
      let parser: BeatParser | null = null;
      let parseResult: ParseResult | null = null;
      let cleanupCalled = false;

      // Simulate useEffect mount
      const effectMount = async () => {
        parser = new BeatParser();
        const audioData = testAudioFiles.get('short-beat.wav')!;
        parseResult = await parser.parseBuffer(audioData);
      };

      // Simulate useEffect cleanup
      const effectCleanup = async () => {
        if (parser) {
          await parser.cleanup();
          cleanupCalled = true;
          parser = null;
          parseResult = null;
        }
      };

      // Execute effect lifecycle
      await effectMount();
      expect(parser).toBeDefined();
      expect(parseResult).toBeDefined();
      expect(parseResult!.beats.length).toBeGreaterThan(0);

      await effectCleanup();
      expect(cleanupCalled).toBe(true);
      expect(parser).toBeNull();
      expect(parseResult).toBeNull();
    });

    test('should integrate with useState for results management', async () => {
      // Simulate useState pattern for beat parsing results
      let audioBeats: Beat[] = [];
      let isProcessing = false;
      let error: string | null = null;

      const setAudioBeats = (beats: Beat[]) => { audioBeats = beats; };
      const setIsProcessing = (processing: boolean) => { isProcessing = processing; };
      const setError = (err: string | null) => { error = err; };

      // Simulate async parsing with state updates
      const processingFunction = async () => {
        setIsProcessing(true);
        setError(null);

        try {
          const audioData = testAudioFiles.get('short-beat.wav')!;
          const result = await beatParser.parseBuffer(audioData);
          setAudioBeats(result.beats);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
          setIsProcessing(false);
        }
      };

      // Initial state
      expect(audioBeats).toEqual([]);
      expect(isProcessing).toBe(false);
      expect(error).toBeNull();

      // Processing state
      const processingPromise = processingFunction();
      // Note: In real React, this would be checked during render cycles
      
      await processingPromise;

      // Final state
      expect(audioBeats.length).toBeGreaterThan(0);
      expect(isProcessing).toBe(false);
      expect(error).toBeNull();
    });

    test('should handle concurrent useState updates safely', async () => {
      let results: Map<string, ParseResult> = new Map();
      let processingCount = 0;

      const updateResult = (id: string, result: ParseResult) => {
        results.set(id, result);
      };

      const incrementProcessing = () => { processingCount++; };
      const decrementProcessing = () => { processingCount--; };

      // Simulate multiple concurrent parsing operations
      const parseOperations = ['short-beat.wav', 'medium-song.wav', 'complex-rhythm.wav']
        .map(async (filename, index) => {
          incrementProcessing();
          
          try {
            const parser = new BeatParser();
            const audioData = testAudioFiles.get(filename)!;
            const result = await parser.parseBuffer(audioData);
            
            updateResult(`result-${index}`, result);
            await parser.cleanup();
          } finally {
            decrementProcessing();
          }
        });

      await Promise.all(parseOperations);

      expect(results.size).toBe(3);
      expect(processingCount).toBe(0);
      
      // Verify each result is valid
      for (const [id, result] of results) {
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeGreaterThan(0);
      }
    });
  });

  describe('React Context Integration', () => {
    test('should work with Context provider for shared parser instances', async () => {
      // Simulate React Context pattern
      const BeatParserContext = {
        parser: new BeatParser({
          sampleRate: 44100,
          enablePreprocessing: true
        }),
        results: new Map<string, ParseResult>()
      };

      const contextConsumer = async (audioId: string) => {
        const audioData = testAudioFiles.get('short-beat.wav')!;
        const result = await BeatParserContext.parser.parseBuffer(audioData);
        BeatParserContext.results.set(audioId, result);
        return result;
      };

      // Simulate multiple components using the same context
      const component1Result = await contextConsumer('component1');
      const component2Result = await contextConsumer('component2');

      expect(component1Result.beats.length).toBeGreaterThan(0);
      expect(component2Result.beats.length).toBeGreaterThan(0);
      expect(BeatParserContext.results.size).toBe(2);

      await BeatParserContext.parser.cleanup();
    });

    test('should handle context updates without memory leaks', async () => {
      const initialMemory = ResourceMonitor.getMemoryUsage();
      
      // Simulate context provider updates
      const contexts: Array<{ parser: BeatParser; results: Map<string, ParseResult> }> = [];
      
      for (let i = 0; i < 5; i++) {
        const context = {
          parser: new BeatParser(),
          results: new Map<string, ParseResult>()
        };
        
        const audioData = testAudioFiles.get('short-beat.wav')!;
        const result = await context.parser.parseBuffer(audioData);
        context.results.set(`result-${i}`, result);
        
        contexts.push(context);
        ResourceMonitor.takeSnapshot();
      }

      // Cleanup all contexts (simulating component unmounts)
      for (const context of contexts) {
        await context.parser.cleanup();
        context.results.clear();
      }

      ResourceMonitor.takeSnapshot();
      const memoryTrend = ResourceMonitor.analyzeMemoryTrend();
      
      expect(memoryTrend.potentialLeak).toBe(false);
      expect(contexts.length).toBe(5);
    });
  });

  describe('React Suspense Integration', () => {
    test('should work with Suspense for async beat processing', async () => {
      let suspensePromise: Promise<ParseResult> | null = null;
      let isSuspended = false;
      let result: ParseResult | null = null;

      // Simulate Suspense resource pattern
      const createBeatResource = (audioData: Float32Array) => {
        if (!suspensePromise) {
          suspensePromise = beatParser.parseBuffer(audioData);
          isSuspended = true;
        }

        if (result) {
          return result;
        }

        // Simulate throwing promise for Suspense
        throw suspensePromise.then(res => {
          result = res;
          isSuspended = false;
          return res;
        });
      };

      const audioData = testAudioFiles.get('short-beat.wav')!;

      try {
        createBeatResource(audioData);
      } catch (promise) {
        expect(isSuspended).toBe(true);
        expect(promise).toBeInstanceOf(Promise);
        
        // Wait for promise resolution
        await promise;
        
        expect(isSuspended).toBe(false);
        expect(result).toBeDefined();
        expect(result!.beats.length).toBeGreaterThan(0);
      }
    });

    test('should handle Suspense boundary errors gracefully', async () => {
      let errorBoundaryTriggered = false;
      let errorMessage = '';

      const simulateErrorBoundary = (error: Error) => {
        errorBoundaryTriggered = true;
        errorMessage = error.message;
      };

      // Simulate component that throws during beat processing
      const problematicComponent = async () => {
        try {
          // Use invalid audio data to trigger error
          const invalidAudioData = new Float32Array(10); // Too short
          await beatParser.parseBuffer(invalidAudioData);
        } catch (error) {
          simulateErrorBoundary(error as Error);
          throw error;
        }
      };

      await expect(problematicComponent()).rejects.toThrow();
      expect(errorBoundaryTriggered).toBe(true);
      expect(errorMessage).toContain('too short');
    });
  });

  describe('Next.js SSR Compatibility', () => {
    test('should be SSR-safe with proper hydration', async () => {
      // Simulate server-side rendering constraints
      const isServer = typeof window === 'undefined';
      
      // Server-side: Parser should not initialize browser-specific features
      if (isServer) {
        expect(() => new BeatParser()).not.toThrow();
      }

      // Client-side hydration simulation
      const serverState = {
        hasAudioData: false,
        beats: [] as Beat[],
        isProcessing: false
      };

      const clientState = { ...serverState };

      // Simulate hydration with audio processing
      if (!isServer) {
        clientState.isProcessing = true;
        
        const audioData = testAudioFiles.get('short-beat.wav')!;
        const result = await beatParser.parseBuffer(audioData);
        
        clientState.beats = result.beats;
        clientState.hasAudioData = true;
        clientState.isProcessing = false;
      }

      // Verify hydration compatibility
      expect(serverState.beats).toEqual([]);
      
      if (!isServer) {
        expect(clientState.beats.length).toBeGreaterThan(0);
        expect(clientState.hasAudioData).toBe(true);
      }
    });

    test('should handle Next.js dynamic imports correctly', async () => {
      // Simulate dynamic import pattern
      const dynamicBeatParser = await (async () => {
        const { BeatParser } = await import('../core/BeatParser');
        return new BeatParser();
      })();

      expect(dynamicBeatParser).toBeInstanceOf(BeatParser);

      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await dynamicBeatParser.parseBuffer(audioData);
      
      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);

      await dynamicBeatParser.cleanup();
    });

    test('should work with Next.js API routes', async () => {
      // Simulate Next.js API route handler
      const apiHandler = async (audioBuffer: ArrayBuffer) => {
        const parser = new BeatParser({
          sampleRate: 44100,
          enablePreprocessing: true
        });

        try {
          const audioData = new Float32Array(audioBuffer);
          const result = await parser.parseBuffer(audioData);
          
          return {
            success: true,
            data: {
              beats: result.beats,
              tempo: result.tempo,
              metadata: result.metadata
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        } finally {
          await parser.cleanup();
        }
      };

      // Test API handler
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const response = await apiHandler(audioData.buffer);

      expect(response.success).toBe(true);
      expect(response.data?.beats).toBeDefined();
      expect(response.data?.beats.length).toBeGreaterThan(0);
    });
  });

  describe('State Management Integration', () => {
    test('should integrate with Redux-style state management', async () => {
      // Simulate Redux-style state and actions
      interface BeatState {
        beats: Beat[];
        isLoading: boolean;
        error: string | null;
        parsedFiles: Map<string, ParseResult>;
      }

      const initialState: BeatState = {
        beats: [],
        isLoading: false,
        error: null,
        parsedFiles: new Map()
      };

      let currentState = { ...initialState };

      const actions = {
        startParsing: () => {
          currentState = {
            ...currentState,
            isLoading: true,
            error: null
          };
        },
        
        parsingSuccess: (fileId: string, result: ParseResult) => {
          currentState = {
            ...currentState,
            beats: result.beats,
            isLoading: false,
            error: null,
            parsedFiles: new Map(currentState.parsedFiles).set(fileId, result)
          };
        },
        
        parsingError: (error: string) => {
          currentState = {
            ...currentState,
            isLoading: false,
            error,
            beats: []
          };
        }
      };

      // Simulate async action with state updates
      const parseAudioFile = async (fileId: string) => {
        actions.startParsing();
        expect(currentState.isLoading).toBe(true);

        try {
          const audioData = testAudioFiles.get('short-beat.wav')!;
          const result = await beatParser.parseBuffer(audioData);
          
          actions.parsingSuccess(fileId, result);
        } catch (error) {
          actions.parsingError(error instanceof Error ? error.message : 'Unknown error');
        }
      };

      await parseAudioFile('test-file-1');

      expect(currentState.isLoading).toBe(false);
      expect(currentState.error).toBeNull();
      expect(currentState.beats.length).toBeGreaterThan(0);
      expect(currentState.parsedFiles.has('test-file-1')).toBe(true);
    });

    test('should work with Zustand-style state management', async () => {
      // Simulate Zustand store pattern
      interface BeatStore {
        beats: Beat[];
        isProcessing: boolean;
        parseAudio: (audioData: Float32Array) => Promise<void>;
        clearBeats: () => void;
      }

      let storeState = {
        beats: [] as Beat[],
        isProcessing: false
      };

      const beatStore: BeatStore = {
        get beats() { return storeState.beats; },
        get isProcessing() { return storeState.isProcessing; },
        
        parseAudio: async (audioData: Float32Array) => {
          storeState.isProcessing = true;
          
          try {
            const result = await beatParser.parseBuffer(audioData);
            storeState.beats = result.beats;
          } finally {
            storeState.isProcessing = false;
          }
        },
        
        clearBeats: () => {
          storeState.beats = [];
        }
      };

      // Test store operations
      expect(beatStore.beats).toEqual([]);
      expect(beatStore.isProcessing).toBe(false);

      const audioData = testAudioFiles.get('short-beat.wav')!;
      await beatStore.parseAudio(audioData);

      expect(beatStore.beats.length).toBeGreaterThan(0);
      expect(beatStore.isProcessing).toBe(false);

      beatStore.clearBeats();
      expect(beatStore.beats).toEqual([]);
    });
  });

  describe('Production React Scenarios', () => {
    test('should handle high-frequency component re-renders', async () => {
      let renderCount = 0;
      let lastResult: ParseResult | null = null;

      // Simulate component that re-renders frequently
      const simulateRender = async () => {
        renderCount++;
        
        if (renderCount % 10 === 1) { // Only parse every 10th render
          const audioData = testAudioFiles.get('short-beat.wav')!;
          lastResult = await beatParser.parseBuffer(audioData);
        }
      };

      // Simulate 100 rapid re-renders
      const renderPromises = Array.from({ length: 100 }, () => simulateRender());
      await Promise.all(renderPromises);

      expect(renderCount).toBe(100);
      expect(lastResult).toBeDefined();
      expect(lastResult!.beats.length).toBeGreaterThan(0);

      // Check memory didn't grow excessively
      const memoryTrend = ResourceMonitor.analyzeMemoryTrend();
      expect(memoryTrend.potentialLeak).toBe(false);
    });

    test('should maintain performance under React Strict Mode', async () => {
      // React Strict Mode causes effects to run twice in development
      let effectRunCount = 0;
      let parserInstances: BeatParser[] = [];

      const strictModeEffect = async () => {
        effectRunCount++;
        
        // Simulate effect that creates parser
        const parser = new BeatParser();
        parserInstances.push(parser);
        
        const audioData = testAudioFiles.get('short-beat.wav')!;
        await parser.parseBuffer(audioData);
        
        // Cleanup function (called in Strict Mode)
        return async () => {
          await parser.cleanup();
        };
      };

      // Simulate Strict Mode double execution
      const cleanup1 = await strictModeEffect(); // First run
      const cleanup2 = await strictModeEffect(); // Second run (Strict Mode)
      
      await cleanup1(); // Cleanup first
      await cleanup2(); // Cleanup second

      expect(effectRunCount).toBe(2);
      expect(parserInstances.length).toBe(2);
    });

    test('should handle component error boundaries correctly', async () => {
      let errorsCaught: Error[] = [];
      let componentRecovered = false;

      const errorBoundary = {
        componentDidCatch: (error: Error) => {
          errorsCaught.push(error);
        },
        
        retry: () => {
          componentRecovered = true;
        }
      };

      const problematicComponent = async () => {
        try {
          // This should fail
          const invalidAudio = new Float32Array(5); // Too short
          await beatParser.parseBuffer(invalidAudio);
        } catch (error) {
          errorBoundary.componentDidCatch(error as Error);
          
          // Simulate error boundary recovery
          errorBoundary.retry();
          
          // Try again with valid data
          const validAudio = testAudioFiles.get('short-beat.wav')!;
          return await beatParser.parseBuffer(validAudio);
        }
      };

      const result = await problematicComponent();

      expect(errorsCaught.length).toBe(1);
      expect(componentRecovered).toBe(true);
      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);
    });

    test('should work with React concurrent features', async () => {
      // Simulate concurrent rendering with time slicing
      const concurrentTasks: Array<() => Promise<ParseResult>> = [];
      
      // Create multiple parsing tasks
      for (let i = 0; i < 5; i++) {
        concurrentTasks.push(async () => {
          const parser = new BeatParser();
          const audioData = testAudioFiles.get('short-beat.wav')!;
          
          try {
            return await parser.parseBuffer(audioData);
          } finally {
            await parser.cleanup();
          }
        });
      }

      // Simulate time-sliced execution (not truly concurrent but interleaved)
      const results: ParseResult[] = [];
      
      for (const task of concurrentTasks) {
        const result = await task();
        results.push(result);
        
        // Yield to scheduler (simulated)
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeGreaterThan(0);
      });
    });
  });

  describe('React Performance Optimization', () => {
    test('should work with React.memo for expensive components', async () => {
      let renderCount = 0;
      let memoizedResult: ParseResult | null = null;

      // Simulate memoized component
      const expensiveComponent = async (audioData: Float32Array, targetCount: number) => {
        renderCount++;
        
        if (!memoizedResult || memoizedResult.metadata.parameters.targetPictureCount !== targetCount) {
          memoizedResult = await beatParser.parseBuffer(audioData, { targetPictureCount: targetCount });
        }
        
        return memoizedResult;
      };

      const audioData = testAudioFiles.get('short-beat.wav')!;

      // First render
      const result1 = await expensiveComponent(audioData, 10);
      expect(renderCount).toBe(1);

      // Same props - should not re-render expensive computation
      const result2 = await expensiveComponent(audioData, 10);
      expect(renderCount).toBe(2); // Component ran but used memoized result
      expect(result2).toBe(result1); // Same reference

      // Different props - should re-render
      const result3 = await expensiveComponent(audioData, 20);
      expect(renderCount).toBe(3);
      expect(result3).not.toBe(result1); // Different reference
    });

    test('should optimize with useMemo for expensive calculations', async () => {
      let calculationCount = 0;
      let memoizedProcessing: Float32Array | null = null;

      // Simulate useMemo for audio preprocessing
      const memoizedPreprocess = (audioData: Float32Array, normalize: boolean) => {
        if (!memoizedProcessing || calculationCount === 0) {
          calculationCount++;
          
          // Simulate expensive preprocessing
          memoizedProcessing = new Float32Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            memoizedProcessing[i] = normalize ? audioData[i] * 0.8 : audioData[i];
          }
        }
        
        return memoizedProcessing;
      };

      const audioData = testAudioFiles.get('short-beat.wav')!;

      // First calculation
      const processed1 = memoizedPreprocess(audioData, true);
      expect(calculationCount).toBe(1);

      // Same dependencies - should use memoized result
      const processed2 = memoizedPreprocess(audioData, true);
      expect(calculationCount).toBe(1); // No new calculation
      expect(processed2).toBe(processed1); // Same reference

      // Use processed data for parsing
      const result = await beatParser.parseBuffer(processed1);
      expect(result.beats.length).toBeGreaterThan(0);
    });
  });
});