/**
 * Vue/Nuxt.js Integration Tests
 * Comprehensive testing of beat-parser integration with Vue.js and Nuxt.js frameworks
 * Tests Composition API, reactivity, SSR compatibility, and Pinia state management
 */

import { BeatParser } from '../core/BeatParser';
import { ParseResult, Beat } from '../types';
import { 
  TestApplicationFactory, 
  IntegrationTestOrchestrator,
  PerformanceMonitor,
  ResourceMonitor 
} from './integration-testing-utils';

describe('Vue/Nuxt.js Integration Tests', () => {
  let beatParser: BeatParser;
  let testAudioFiles: Map<string, Float32Array>;
  let mockVueApp: any;

  beforeAll(async () => {
    testAudioFiles = IntegrationTestOrchestrator.generateTestAudioFiles();
    mockVueApp = await TestApplicationFactory.createVueApp();
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
    await mockVueApp.cleanup();
    ResourceMonitor.clearSnapshots();
  });

  describe('Vue 3 Composition API Integration', () => {
    test('should integrate with ref() for reactive beat data', async () => {
      PerformanceMonitor.startMeasurement('vue-ref-integration');
      
      // Simulate Vue ref pattern
      let beatData: { value: Beat[] } = { value: [] };
      let isLoading: { value: boolean } = { value: false };
      let error: { value: string | null } = { value: null };

      const setRef = <T>(ref: { value: T }, newValue: T) => {
        ref.value = newValue;
      };

      // Simulate composable function
      const useBeatParser = () => {
        const parseAudio = async (audioData: Float32Array) => {
          setRef(isLoading, true);
          setRef(error, null);

          try {
            const result = await beatParser.parseBuffer(audioData);
            setRef(beatData, result.beats);
          } catch (err) {
            setRef(error, err instanceof Error ? err.message : 'Unknown error');
          } finally {
            setRef(isLoading, false);
          }
        };

        return { beatData, isLoading, error, parseAudio };
      };

      const { parseAudio } = useBeatParser();
      const audioData = testAudioFiles.get('short-beat.wav')!;
      
      // Initial state
      expect(beatData.value).toEqual([]);
      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();

      // Parse audio
      await parseAudio(audioData);

      // Final state
      expect(beatData.value.length).toBeGreaterThan(0);
      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();

      const duration = PerformanceMonitor.endMeasurement('vue-ref-integration');
      expect(duration).toBeLessThan(5000);
    });

    test('should integrate with reactive() for complex state objects', async () => {
      // Simulate Vue reactive state
      const audioState = {
        currentFile: null as string | null,
        results: new Map<string, ParseResult>(),
        isProcessing: false,
        processingQueue: [] as string[],
        statistics: {
          totalFiles: 0,
          successfulParses: 0,
          averageProcessingTime: 0
        }
      };

      const updateReactiveState = (updates: Partial<typeof audioState>) => {
        Object.assign(audioState, updates);
      };

      // Simulate audio processing with reactive updates
      const processAudioFile = async (fileId: string, audioData: Float32Array) => {
        updateReactiveState({
          currentFile: fileId,
          isProcessing: true,
          processingQueue: [...audioState.processingQueue, fileId]
        });

        const startTime = Date.now();
        
        try {
          const result = await beatParser.parseBuffer(audioData);
          
          const processingTime = Date.now() - startTime;
          const newResults = new Map(audioState.results);
          newResults.set(fileId, result);
          
          updateReactiveState({
            results: newResults,
            statistics: {
              totalFiles: audioState.statistics.totalFiles + 1,
              successfulParses: audioState.statistics.successfulParses + 1,
              averageProcessingTime: 
                (audioState.statistics.averageProcessingTime + processingTime) / 2
            }
          });
        } finally {
          updateReactiveState({
            isProcessing: false,
            currentFile: null,
            processingQueue: audioState.processingQueue.filter(id => id !== fileId)
          });
        }
      };

      // Process multiple files
      await processAudioFile('file1', testAudioFiles.get('short-beat.wav')!);
      await processAudioFile('file2', testAudioFiles.get('medium-song.wav')!);

      expect(audioState.results.size).toBe(2);
      expect(audioState.statistics.totalFiles).toBe(2);
      expect(audioState.statistics.successfulParses).toBe(2);
      expect(audioState.isProcessing).toBe(false);
      expect(audioState.processingQueue).toEqual([]);
    });

    test('should integrate with computed() for derived state', async () => {
      // Simulate Vue computed properties
      let rawBeats: Beat[] = [];
      let filterStrength = 0.5;

      const computedState = {
        get filteredBeats() {
          return rawBeats.filter(beat => beat.confidence >= filterStrength);
        },
        
        get beatCount() {
          return this.filteredBeats.length;
        },
        
        get averageConfidence() {
          if (this.filteredBeats.length === 0) return 0;
          return this.filteredBeats.reduce((sum, beat) => sum + beat.confidence, 0) / 
                 this.filteredBeats.length;
        },
        
        get strongestBeat() {
          return this.filteredBeats.reduce((strongest, current) => 
            current.strength > strongest.strength ? current : strongest, 
            this.filteredBeats[0] || null
          );
        }
      };

      // Parse audio and update raw beats
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await beatParser.parseBuffer(audioData);
      rawBeats = result.beats;

      // Test computed properties
      expect(computedState.beatCount).toBeGreaterThan(0);
      expect(computedState.averageConfidence).toBeGreaterThan(0);
      expect(computedState.strongestBeat).toBeDefined();

      // Change filter and test reactivity
      filterStrength = 0.8;
      const highConfidenceCount = computedState.beatCount;
      
      filterStrength = 0.3;
      const lowConfidenceCount = computedState.beatCount;
      
      expect(lowConfidenceCount).toBeGreaterThanOrEqual(highConfidenceCount);
    });

    test('should integrate with watch() for reactive side effects', async () => {
      let watcherCallCount = 0;
      let lastWatchedValue: Beat[] = [];
      let sideEffectTriggered = false;

      // Simulate Vue watcher
      const watchBeats = (newBeats: Beat[], oldBeats: Beat[]) => {
        watcherCallCount++;
        lastWatchedValue = [...newBeats];
        
        // Simulate side effect (e.g., analytics tracking)
        if (newBeats.length > oldBeats.length) {
          sideEffectTriggered = true;
        }
      };

      let currentBeats: Beat[] = [];

      // Simulate beat updates that trigger watchers
      const updateBeats = (newBeats: Beat[]) => {
        const oldBeats = [...currentBeats];
        currentBeats = [...newBeats];
        watchBeats(currentBeats, oldBeats);
      };

      // Initial state
      expect(watcherCallCount).toBe(0);
      expect(sideEffectTriggered).toBe(false);

      // Update with beats
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await beatParser.parseBuffer(audioData);
      updateBeats(result.beats);

      expect(watcherCallCount).toBe(1);
      expect(lastWatchedValue.length).toBe(result.beats.length);
      expect(sideEffectTriggered).toBe(true);
    });
  });

  describe('Vue Lifecycle Integration', () => {
    test('should integrate with onMounted and onUnmounted lifecycle hooks', async () => {
      let mountedCalled = false;
      let unmountedCalled = false;
      let parser: BeatParser | null = null;

      // Simulate Vue lifecycle hooks
      const onMounted = async () => {
        mountedCalled = true;
        parser = new BeatParser();
        
        const audioData = testAudioFiles.get('short-beat.wav')!;
        await parser.parseBuffer(audioData);
      };

      const onUnmounted = async () => {
        unmountedCalled = true;
        if (parser) {
          await parser.cleanup();
          parser = null;
        }
      };

      // Simulate component lifecycle
      await onMounted();
      expect(mountedCalled).toBe(true);
      expect(parser).toBeDefined();

      await onUnmounted();
      expect(unmountedCalled).toBe(true);
      expect(parser).toBeNull();
    });

    test('should handle onBeforeUnmount for graceful cleanup', async () => {
      let cleanupPromises: Promise<void>[] = [];
      let resourcesFreed = false;

      const onBeforeUnmount = () => {
        // Simulate cleanup of multiple parsers
        const cleanup1 = beatParser.cleanup().then(() => { resourcesFreed = true; });
        cleanupPromises.push(cleanup1);
      };

      // Start some operations
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const parsePromise = beatParser.parseBuffer(audioData);

      // Simulate unmount during operation
      onBeforeUnmount();

      // Wait for both parse and cleanup
      await parsePromise;
      await Promise.all(cleanupPromises);

      expect(resourcesFreed).toBe(true);
      expect(cleanupPromises.length).toBe(1);
    });
  });

  describe('Vue Reactivity Deep Integration', () => {
    test('should handle nested reactive objects correctly', async () => {
      // Simulate complex nested reactive state
      const audioLibrary = {
        tracks: new Map<string, {
          id: string;
          title: string;
          duration: number;
          beats: Beat[];
          analysis: {
            tempo: number;
            confidence: number;
            processed: boolean;
            processingTime: number;
          };
        }>()
      };

      const addTrack = async (id: string, title: string, audioData: Float32Array) => {
        const startTime = Date.now();
        
        const track = {
          id,
          title,
          duration: audioData.length / 44100,
          beats: [] as Beat[],
          analysis: {
            tempo: 0,
            confidence: 0,
            processed: false,
            processingTime: 0
          }
        };

        audioLibrary.tracks.set(id, track);

        try {
          const result = await beatParser.parseBuffer(audioData);
          
          // Update nested reactive properties
          track.beats = result.beats;
          track.analysis.tempo = result.tempo?.bpm || 0;
          track.analysis.confidence = result.tempo?.confidence || 0;
          track.analysis.processed = true;
          track.analysis.processingTime = Date.now() - startTime;
          
        } catch (error) {
          track.analysis.processed = false;
        }
      };

      // Add multiple tracks
      await addTrack('track1', 'Short Beat', testAudioFiles.get('short-beat.wav')!);
      await addTrack('track2', 'Complex Rhythm', testAudioFiles.get('complex-rhythm.wav')!);

      expect(audioLibrary.tracks.size).toBe(2);
      
      const track1 = audioLibrary.tracks.get('track1')!;
      const track2 = audioLibrary.tracks.get('track2')!;
      
      expect(track1.analysis.processed).toBe(true);
      expect(track1.beats.length).toBeGreaterThan(0);
      expect(track2.analysis.processed).toBe(true);
      expect(track2.beats.length).toBeGreaterThan(0);
    });

    test('should work with Vue provide/inject pattern', async () => {
      // Simulate Vue provide/inject
      const audioProcessingService = {
        parser: new BeatParser(),
        cache: new Map<string, ParseResult>(),
        
        async processAudio(id: string, audioData: Float32Array): Promise<ParseResult> {
          if (this.cache.has(id)) {
            return this.cache.get(id)!;
          }
          
          const result = await this.parser.parseBuffer(audioData);
          this.cache.set(id, result);
          return result;
        },
        
        async cleanup(): Promise<void> {
          await this.parser.cleanup();
          this.cache.clear();
        }
      };

      // Simulate child component injection
      const childComponent = {
        async processFile(fileId: string) {
          const audioData = testAudioFiles.get('short-beat.wav')!;
          return await audioProcessingService.processAudio(fileId, audioData);
        }
      };

      // Test provide/inject pattern
      const result1 = await childComponent.processFile('test1');
      const result2 = await childComponent.processFile('test1'); // Should use cache

      expect(result1.beats.length).toBeGreaterThan(0);
      expect(result2).toBe(result1); // Same reference from cache
      expect(audioProcessingService.cache.size).toBe(1);

      await audioProcessingService.cleanup();
    });
  });

  describe('Nuxt.js SSR Compatibility', () => {
    test('should be compatible with Nuxt.js server-side rendering', async () => {
      // Simulate SSR environment
      const isSSR = typeof window === 'undefined';
      
      // Server-side state
      const serverState = {
        audioData: null,
        beats: [] as Beat[],
        isHydrated: false
      };

      // Client-side hydration state
      const clientState = { ...serverState };

      // SSR: Server cannot process audio files directly
      if (isSSR) {
        expect(() => new BeatParser()).not.toThrow();
        expect(serverState.beats).toEqual([]);
      }

      // Client hydration: Process audio after hydration
      if (!isSSR) {
        clientState.isHydrated = true;
        
        const audioData = testAudioFiles.get('short-beat.wav')!;
        const result = await beatParser.parseBuffer(audioData);
        
        clientState.audioData = audioData;
        clientState.beats = result.beats;
      }

      // Verify SSR compatibility
      expect(serverState.isHydrated).toBe(false);
      if (!isSSR) {
        expect(clientState.isHydrated).toBe(true);
        expect(clientState.beats.length).toBeGreaterThan(0);
      }
    });

    test('should work with Nuxt.js asyncData', async () => {
      // Simulate Nuxt asyncData method
      const asyncData = async (context: { params: { id: string } }) => {
        try {
          // In real Nuxt, this would be server-side
          // Here we simulate the pattern
          const trackId = context.params.id;
          
          // Simulate fetching audio data (would be from API/database)
          const audioData = testAudioFiles.get('short-beat.wav')!;
          
          // Process on client-side only
          if (typeof window !== 'undefined') {
            const parser = new BeatParser();
            const result = await parser.parseBuffer(audioData);
            await parser.cleanup();
            
            return {
              trackId,
              beats: result.beats,
              tempo: result.tempo,
              processed: true
            };
          }
          
          // Server-side returns minimal data
          return {
            trackId,
            beats: [],
            tempo: null,
            processed: false
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      };

      // Test asyncData
      const context = { params: { id: 'test-track' } };
      const data = await asyncData(context);

      expect(data.trackId).toBe('test-track');
      if (typeof window !== 'undefined') {
        expect(data.beats.length).toBeGreaterThan(0);
        expect(data.processed).toBe(true);
      } else {
        expect(data.beats).toEqual([]);
        expect(data.processed).toBe(false);
      }
    });

    test('should integrate with Nuxt.js plugins', async () => {
      // Simulate Nuxt plugin registration
      const audioPlugin = {
        install: (app: any, options: any) => {
          app.config.globalProperties.$audio = {
            parser: new BeatParser(options.parserConfig || {}),
            
            async parseAudio(audioData: Float32Array) {
              return await this.parser.parseBuffer(audioData);
            },
            
            async cleanup() {
              return await this.parser.cleanup();
            }
          };
        }
      };

      // Simulate app with plugin
      const mockApp = {
        config: {
          globalProperties: {}
        }
      };

      const pluginOptions = {
        parserConfig: {
          sampleRate: 44100,
          enablePreprocessing: true
        }
      };

      audioPlugin.install(mockApp, pluginOptions);

      // Test plugin functionality
      const audioService = mockApp.config.globalProperties.$audio;
      expect(audioService).toBeDefined();
      expect(audioService.parser).toBeInstanceOf(BeatParser);

      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await audioService.parseAudio(audioData);
      
      expect(result.beats.length).toBeGreaterThan(0);
      await audioService.cleanup();
    });
  });

  describe('Pinia State Management Integration', () => {
    test('should integrate with Pinia stores', async () => {
      // Simulate Pinia store
      const useAudioStore = () => {
        const state = {
          tracks: new Map<string, ParseResult>(),
          currentTrack: null as string | null,
          isProcessing: false,
          processingQueue: [] as string[]
        };

        const actions = {
          async parseTrack(trackId: string, audioData: Float32Array) {
            state.isProcessing = true;
            state.processingQueue.push(trackId);
            state.currentTrack = trackId;

            try {
              const result = await beatParser.parseBuffer(audioData);
              state.tracks.set(trackId, result);
            } finally {
              state.isProcessing = false;
              state.processingQueue = state.processingQueue.filter(id => id !== trackId);
              state.currentTrack = null;
            }
          },

          getTrack(trackId: string): ParseResult | undefined {
            return state.tracks.get(trackId);
          },

          clearTracks() {
            state.tracks.clear();
          }
        };

        const getters = {
          trackCount: () => state.tracks.size,
          
          isTrackProcessing: (trackId: string) => 
            state.processingQueue.includes(trackId),
          
          averageBeatsPerTrack: () => {
            if (state.tracks.size === 0) return 0;
            const totalBeats = Array.from(state.tracks.values())
              .reduce((sum, result) => sum + result.beats.length, 0);
            return totalBeats / state.tracks.size;
          }
        };

        return { state, actions, getters };
      };

      // Test Pinia store
      const store = useAudioStore();
      
      // Initial state
      expect(store.getters.trackCount()).toBe(0);
      expect(store.state.isProcessing).toBe(false);

      // Process tracks
      await store.actions.parseTrack('track1', testAudioFiles.get('short-beat.wav')!);
      await store.actions.parseTrack('track2', testAudioFiles.get('medium-song.wav')!);

      // Verify results
      expect(store.getters.trackCount()).toBe(2);
      expect(store.state.isProcessing).toBe(false);
      expect(store.actions.getTrack('track1')).toBeDefined();
      expect(store.actions.getTrack('track2')).toBeDefined();
      expect(store.getters.averageBeatsPerTrack()).toBeGreaterThan(0);
    });

    test('should handle Pinia store persistence', async () => {
      // Simulate persisted store state
      let persistedData: string | null = null;
      
      const persistentStore = {
        state: {
          processedTracks: new Map<string, { beats: Beat[]; tempo: number }>()
        },

        persist: () => {
          const serializable = {
            processedTracks: Array.from(this.state.processedTracks.entries())
          };
          persistedData = JSON.stringify(serializable);
        },

        restore: () => {
          if (persistedData) {
            const data = JSON.parse(persistedData);
            this.state.processedTracks = new Map(data.processedTracks);
          }
        },

        async addTrack(trackId: string, audioData: Float32Array) {
          const result = await beatParser.parseBuffer(audioData);
          this.state.processedTracks.set(trackId, {
            beats: result.beats,
            tempo: result.tempo?.bpm || 0
          });
          this.persist();
        }
      };

      // Add track and persist
      await persistentStore.addTrack('persistent-track', testAudioFiles.get('short-beat.wav')!);
      expect(persistedData).toBeTruthy();
      expect(persistentStore.state.processedTracks.size).toBe(1);

      // Clear and restore
      persistentStore.state.processedTracks.clear();
      expect(persistentStore.state.processedTracks.size).toBe(0);

      persistentStore.restore();
      expect(persistentStore.state.processedTracks.size).toBe(1);
      
      const restoredTrack = persistentStore.state.processedTracks.get('persistent-track')!;
      expect(restoredTrack.beats.length).toBeGreaterThan(0);
      expect(restoredTrack.tempo).toBeGreaterThan(0);
    });
  });

  describe('Vue Performance Optimization', () => {
    test('should work with Vue shallowRef for large datasets', async () => {
      // Simulate shallowRef for performance with large beat arrays
      let largeBeatsArray: { value: Beat[] } = { value: [] };
      let updateCount = 0;

      const updateShallowRef = (newValue: Beat[]) => {
        // Shallow comparison - only updates if reference changes
        if (largeBeatsArray.value !== newValue) {
          largeBeatsArray.value = newValue;
          updateCount++;
        }
      };

      // Generate large dataset
      const audioData = testAudioFiles.get('complex-rhythm.wav')!;
      const result = await beatParser.parseBuffer(audioData, { 
        targetPictureCount: 1000 
      });

      // First update
      updateShallowRef(result.beats);
      expect(updateCount).toBe(1);
      expect(largeBeatsArray.value.length).toBe(result.beats.length);

      // Same reference - no update
      updateShallowRef(result.beats);
      expect(updateCount).toBe(1); // No change

      // New array - should update
      const filteredBeats = result.beats.filter(beat => beat.confidence > 0.5);
      updateShallowRef(filteredBeats);
      expect(updateCount).toBe(2);
      expect(largeBeatsArray.value.length).toBe(filteredBeats.length);
    });

    test('should optimize with readonly() for immutable data', async () => {
      // Simulate readonly reactive data
      let mutableConfig = {
        sampleRate: 44100,
        enablePreprocessing: true,
        enableNormalization: true
      };

      let readonlyConfig: Readonly<typeof mutableConfig>;

      const createReadonlyConfig = (config: typeof mutableConfig) => {
        return Object.freeze({ ...config });
      };

      readonlyConfig = createReadonlyConfig(mutableConfig);

      // Use readonly config with parser
      const parser = new BeatParser(readonlyConfig);
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await parser.parseBuffer(audioData);

      expect(result.beats.length).toBeGreaterThan(0);

      // Verify config is readonly (would throw in strict mode)
      expect(() => {
        // @ts-ignore - intentionally trying to modify readonly
        readonlyConfig.sampleRate = 48000;
      }).toThrow();

      await parser.cleanup();
    });

    test('should handle large-scale reactive transformations efficiently', async () => {
      const startTime = Date.now();
      
      // Simulate processing multiple audio files with reactive updates
      const reactiveLibrary = {
        tracks: new Map<string, Beat[]>(),
        statistics: {
          totalTracks: 0,
          totalBeats: 0,
          averageConfidence: 0
        }
      };

      const updateStatistics = () => {
        const allBeats = Array.from(reactiveLibrary.tracks.values()).flat();
        reactiveLibrary.statistics = {
          totalTracks: reactiveLibrary.tracks.size,
          totalBeats: allBeats.length,
          averageConfidence: allBeats.length > 0 
            ? allBeats.reduce((sum, beat) => sum + beat.confidence, 0) / allBeats.length
            : 0
        };
      };

      // Process multiple files
      const audioFiles = ['short-beat.wav', 'medium-song.wav', 'complex-rhythm.wav'];
      
      for (const [index, filename] of audioFiles.entries()) {
        const audioData = testAudioFiles.get(filename)!;
        const result = await beatParser.parseBuffer(audioData);
        
        reactiveLibrary.tracks.set(`track-${index}`, result.beats);
        updateStatistics(); // Simulate reactive update
      }

      const processingTime = Date.now() - startTime;

      // Verify efficiency
      expect(processingTime).toBeLessThan(10000); // Should complete in 10 seconds
      expect(reactiveLibrary.statistics.totalTracks).toBe(3);
      expect(reactiveLibrary.statistics.totalBeats).toBeGreaterThan(0);
      expect(reactiveLibrary.statistics.averageConfidence).toBeGreaterThan(0);
    });
  });
});