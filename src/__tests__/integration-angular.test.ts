/**
 * Angular Integration Tests
 * Comprehensive testing of beat-parser integration with Angular framework
 * Tests services, dependency injection, RxJS observables, NgRx, and Angular Universal
 */

import { BeatParser } from '../core/BeatParser';
import { ParseResult, Beat } from '../types';
import { 
  TestApplicationFactory, 
  IntegrationTestOrchestrator,
  PerformanceMonitor,
  ResourceMonitor 
} from './integration-testing-utils';

describe('Angular Integration Tests', () => {
  let beatParser: BeatParser;
  let testAudioFiles: Map<string, Float32Array>;
  let mockAngularApp: any;

  beforeAll(async () => {
    testAudioFiles = IntegrationTestOrchestrator.generateTestAudioFiles();
    mockAngularApp = await TestApplicationFactory.createAngularApp();
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
    await mockAngularApp.cleanup();
    ResourceMonitor.clearSnapshots();
  });

  describe('Angular Services and Dependency Injection', () => {
    test('should work as an Angular service with proper DI', async () => {
      PerformanceMonitor.startMeasurement('angular-service-di');
      
      // Simulate Angular service with DI
      interface IAudioProcessingService {
        parseAudio(audioData: Float32Array): Promise<ParseResult>;
        cleanup(): Promise<void>;
      }

      class AudioProcessingService implements IAudioProcessingService {
        private parser: BeatParser;

        constructor(config?: any) {
          this.parser = new BeatParser(config?.beatParserConfig || {
            sampleRate: 44100,
            enablePreprocessing: true
          });
        }

        async parseAudio(audioData: Float32Array): Promise<ParseResult> {
          return await this.parser.parseBuffer(audioData);
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      // Simulate Angular DI container
      const injector = {
        services: new Map<string, any>(),
        
        register<T>(token: string, factory: () => T): void {
          this.services.set(token, factory);
        },
        
        get<T>(token: string): T {
          const factory = this.services.get(token);
          if (!factory) throw new Error(`No provider for ${token}`);
          return factory();
        }
      };

      // Register service
      injector.register('AudioProcessingService', () => new AudioProcessingService());

      // Inject and use service
      const audioService = injector.get<AudioProcessingService>('AudioProcessingService');
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await audioService.parseAudio(audioData);

      expect(result.beats.length).toBeGreaterThan(0);
      
      await audioService.cleanup();

      const duration = PerformanceMonitor.endMeasurement('angular-service-di');
      expect(duration).toBeLessThan(5000);
    });

    test('should support singleton and factory providers', async () => {
      let singletonCallCount = 0;
      let factoryCallCount = 0;

      // Singleton service
      class SingletonAudioService {
        private static instance: SingletonAudioService;
        private parser: BeatParser;

        private constructor() {
          singletonCallCount++;
          this.parser = new BeatParser();
        }

        static getInstance(): SingletonAudioService {
          if (!this.instance) {
            this.instance = new SingletonAudioService();
          }
          return this.instance;
        }

        async parseAudio(audioData: Float32Array): Promise<ParseResult> {
          return await this.parser.parseBuffer(audioData);
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      // Factory service
      const audioServiceFactory = (config: any) => {
        factoryCallCount++;
        return new BeatParser(config);
      };

      // Test singleton
      const singleton1 = SingletonAudioService.getInstance();
      const singleton2 = SingletonAudioService.getInstance();
      
      expect(singleton1).toBe(singleton2); // Same instance
      expect(singletonCallCount).toBe(1); // Created only once

      // Test factory
      const factory1 = audioServiceFactory({ sampleRate: 44100 });
      const factory2 = audioServiceFactory({ sampleRate: 48000 });
      
      expect(factory1).not.toBe(factory2); // Different instances
      expect(factoryCallCount).toBe(2); // Created twice

      // Test functionality
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const singletonResult = await singleton1.parseAudio(audioData);
      const factoryResult = await factory1.parseBuffer(audioData);

      expect(singletonResult.beats.length).toBeGreaterThan(0);
      expect(factoryResult.beats.length).toBeGreaterThan(0);

      // Cleanup
      await singleton1.cleanup();
      await factory1.cleanup();
      await factory2.cleanup();
    });

    test('should work with Angular injection tokens', async () => {
      // Simulate Angular injection tokens
      const BEAT_PARSER_CONFIG = 'BEAT_PARSER_CONFIG';
      const AUDIO_PROCESSING_SERVICE = 'AUDIO_PROCESSING_SERVICE';

      // Mock injection token system
      const tokens = {
        [BEAT_PARSER_CONFIG]: {
          sampleRate: 44100,
          enablePreprocessing: true,
          enableNormalization: true
        }
      };

      class AudioService {
        private parser: BeatParser;

        constructor(config: any) {
          this.parser = new BeatParser(config);
        }

        async processAudio(audioData: Float32Array): Promise<ParseResult> {
          return await this.parser.parseBuffer(audioData);
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      // Simulate dependency injection with tokens
      const tokenInjector = {
        provide: (token: string, value: any) => {
          tokens[token] = value;
        },
        
        inject: (token: string) => {
          return tokens[token];
        }
      };

      // Register service with token dependency
      tokenInjector.provide(AUDIO_PROCESSING_SERVICE, 
        new AudioService(tokenInjector.inject(BEAT_PARSER_CONFIG))
      );

      // Use injected service
      const service = tokenInjector.inject(AUDIO_PROCESSING_SERVICE) as AudioService;
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await service.processAudio(audioData);

      expect(result.beats.length).toBeGreaterThan(0);
      await service.cleanup();
    });
  });

  describe('RxJS Observable Integration', () => {
    test('should integrate with RxJS observables for reactive streams', async () => {
      // Mock RxJS-like observable implementation
      class Observable<T> {
        private subscribers: Array<(value: T) => void> = [];
        
        constructor(private executor: (observer: { next: (value: T) => void }) => void) {}
        
        subscribe(observer: (value: T) => void): { unsubscribe: () => void } {
          this.subscribers.push(observer);
          this.executor({ next: (value: T) => this.next(value) });
          
          return {
            unsubscribe: () => {
              this.subscribers = this.subscribers.filter(sub => sub !== observer);
            }
          };
        }
        
        private next(value: T): void {
          this.subscribers.forEach(subscriber => subscriber(value));
        }
        
        map<U>(mapper: (value: T) => U): Observable<U> {
          return new Observable<U>(observer => {
            this.subscribe(value => observer.next(mapper(value)));
          });
        }
        
        filter(predicate: (value: T) => boolean): Observable<T> {
          return new Observable<T>(observer => {
            this.subscribe(value => {
              if (predicate(value)) observer.next(value);
            });
          });
        }
      }

      // Simulate audio processing service with observables
      class ReactiveAudioService {
        private parser = new BeatParser();
        
        processAudioStream(audioData: Float32Array): Observable<ParseResult> {
          return new Observable<ParseResult>(observer => {
            this.parser.parseBuffer(audioData)
              .then(result => observer.next(result))
              .catch(error => console.error(error));
          });
        }
        
        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const service = new ReactiveAudioService();
      let receivedResult: ParseResult | null = null;
      
      // Subscribe to audio processing stream
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const subscription = service.processAudioStream(audioData)
        .filter(result => result.beats.length > 0)
        .subscribe(result => {
          receivedResult = result;
        });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(receivedResult).toBeDefined();
      expect(receivedResult!.beats.length).toBeGreaterThan(0);
      
      subscription.unsubscribe();
      await service.cleanup();
    });

    test('should handle multiple concurrent observable streams', async () => {
      class ConcurrentAudioService {
        private parsers: Map<string, BeatParser> = new Map();
        
        createAudioStream(streamId: string, audioData: Float32Array) {
          const parser = new BeatParser();
          this.parsers.set(streamId, parser);
          
          return new Promise<ParseResult>((resolve, reject) => {
            parser.parseBuffer(audioData)
              .then(resolve)
              .catch(reject);
          });
        }
        
        async cleanup(): Promise<void> {
          for (const parser of this.parsers.values()) {
            await parser.cleanup();
          }
          this.parsers.clear();
        }
      }

      const service = new ConcurrentAudioService();
      const results: ParseResult[] = [];

      // Create multiple concurrent streams
      const streamPromises = [
        service.createAudioStream('stream1', testAudioFiles.get('short-beat.wav')!),
        service.createAudioStream('stream2', testAudioFiles.get('medium-song.wav')!),
        service.createAudioStream('stream3', testAudioFiles.get('complex-rhythm.wav')!)
      ];

      // Wait for all streams to complete
      const streamResults = await Promise.all(streamPromises);
      results.push(...streamResults);

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.beats.length).toBeGreaterThan(0);
      });

      await service.cleanup();
    });

    test('should support RxJS operators for data transformation', async () => {
      // Mock additional RxJS-like operators
      class Subject<T> {
        private observers: Array<(value: T) => void> = [];
        
        next(value: T): void {
          this.observers.forEach(observer => observer(value));
        }
        
        subscribe(observer: (value: T) => void): { unsubscribe: () => void } {
          this.observers.push(observer);
          return {
            unsubscribe: () => {
              this.observers = this.observers.filter(obs => obs !== observer);
            }
          };
        }
        
        pipe<U>(...operators: Array<(input: any) => any>): Subject<U> {
          const result = new Subject<U>();
          
          this.subscribe(value => {
            let transformedValue = value;
            for (const operator of operators) {
              transformedValue = operator(transformedValue);
            }
            result.next(transformedValue);
          });
          
          return result;
        }
      }

      // Custom operators
      const mapToBeats = (result: ParseResult) => result.beats;
      const filterHighConfidence = (beats: Beat[]) => beats.filter(beat => beat.confidence > 0.7);
      const takeFirst = <T>(count: number) => (items: T[]) => items.slice(0, count);

      // Audio processing with operators
      const audioSubject = new Subject<ParseResult>();
      let transformedBeats: Beat[] = [];

      const subscription = audioSubject
        .pipe(
          mapToBeats,
          filterHighConfidence,
          takeFirst(5)
        )
        .subscribe(beats => {
          transformedBeats = beats;
        });

      // Process audio and emit result
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await beatParser.parseBuffer(audioData);
      audioSubject.next(result);

      expect(transformedBeats.length).toBeGreaterThan(0);
      expect(transformedBeats.length).toBeLessThanOrEqual(5);
      transformedBeats.forEach(beat => {
        expect(beat.confidence).toBeGreaterThan(0.7);
      });

      subscription.unsubscribe();
    });
  });

  describe('NgRx State Management Integration', () => {
    test('should integrate with NgRx actions and reducers', async () => {
      // Simulate NgRx action types
      const AudioActionTypes = {
        PARSE_AUDIO_START: 'PARSE_AUDIO_START',
        PARSE_AUDIO_SUCCESS: 'PARSE_AUDIO_SUCCESS',
        PARSE_AUDIO_FAILURE: 'PARSE_AUDIO_FAILURE'
      };

      // Simulate NgRx actions
      const audioActions = {
        parseAudioStart: (fileId: string) => ({
          type: AudioActionTypes.PARSE_AUDIO_START,
          payload: { fileId }
        }),
        
        parseAudioSuccess: (fileId: string, result: ParseResult) => ({
          type: AudioActionTypes.PARSE_AUDIO_SUCCESS,
          payload: { fileId, result }
        }),
        
        parseAudioFailure: (fileId: string, error: string) => ({
          type: AudioActionTypes.PARSE_AUDIO_FAILURE,
          payload: { fileId, error }
        })
      };

      // Simulate NgRx state
      interface AudioState {
        files: Map<string, ParseResult>;
        loading: boolean;
        error: string | null;
        currentFile: string | null;
      }

      const initialState: AudioState = {
        files: new Map(),
        loading: false,
        error: null,
        currentFile: null
      };

      // Simulate NgRx reducer
      const audioReducer = (state: AudioState = initialState, action: any): AudioState => {
        switch (action.type) {
          case AudioActionTypes.PARSE_AUDIO_START:
            return {
              ...state,
              loading: true,
              error: null,
              currentFile: action.payload.fileId
            };
            
          case AudioActionTypes.PARSE_AUDIO_SUCCESS:
            const newFiles = new Map(state.files);
            newFiles.set(action.payload.fileId, action.payload.result);
            return {
              ...state,
              files: newFiles,
              loading: false,
              currentFile: null
            };
            
          case AudioActionTypes.PARSE_AUDIO_FAILURE:
            return {
              ...state,
              loading: false,
              error: action.payload.error,
              currentFile: null
            };
            
          default:
            return state;
        }
      };

      // Simulate store
      let currentState = initialState;
      const dispatch = (action: any) => {
        currentState = audioReducer(currentState, action);
      };

      // Test NgRx flow
      const fileId = 'test-file';
      
      // Start parsing
      dispatch(audioActions.parseAudioStart(fileId));
      expect(currentState.loading).toBe(true);
      expect(currentState.currentFile).toBe(fileId);

      // Simulate async parsing
      try {
        const audioData = testAudioFiles.get('short-beat.wav')!;
        const result = await beatParser.parseBuffer(audioData);
        dispatch(audioActions.parseAudioSuccess(fileId, result));
      } catch (error) {
        dispatch(audioActions.parseAudioFailure(fileId, 'Parse error'));
      }

      // Verify final state
      expect(currentState.loading).toBe(false);
      expect(currentState.files.has(fileId)).toBe(true);
      expect(currentState.error).toBeNull();
      
      const storedResult = currentState.files.get(fileId)!;
      expect(storedResult.beats.length).toBeGreaterThan(0);
    });

    test('should work with NgRx effects for side effects', async () => {
      // Simulate NgRx effects
      class AudioEffects {
        private parser = new BeatParser();
        
        parseAudio$ = (action$: any) => {
          return {
            subscribe: (callback: (action: any) => void) => {
              // Simulate effect that listens to PARSE_AUDIO_START action
              action$.subscribe(async (action: any) => {
                if (action.type === 'PARSE_AUDIO_START') {
                  try {
                    const audioData = testAudioFiles.get('short-beat.wav')!;
                    const result = await this.parser.parseBuffer(audioData);
                    
                    callback({
                      type: 'PARSE_AUDIO_SUCCESS',
                      payload: { fileId: action.payload.fileId, result }
                    });
                  } catch (error) {
                    callback({
                      type: 'PARSE_AUDIO_FAILURE',
                      payload: { 
                        fileId: action.payload.fileId, 
                        error: error instanceof Error ? error.message : 'Unknown error'
                      }
                    });
                  }
                }
              });
            }
          };
        };
        
        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const effects = new AudioEffects();
      let effectResults: any[] = [];
      
      // Mock action stream
      const actionStream = {
        subscribe: (callback: (action: any) => void) => {
          // Simulate dispatching action
          setTimeout(() => {
            callback({
              type: 'PARSE_AUDIO_START',
              payload: { fileId: 'effect-test' }
            });
          }, 10);
        }
      };

      // Subscribe to effects
      effects.parseAudio$(actionStream).subscribe(action => {
        effectResults.push(action);
      });

      // Wait for effect to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(effectResults.length).toBe(1);
      expect(effectResults[0].type).toBe('PARSE_AUDIO_SUCCESS');
      expect(effectResults[0].payload.result.beats.length).toBeGreaterThan(0);

      await effects.cleanup();
    });

    test('should support NgRx selectors for computed state', async () => {
      // Simulate NgRx selectors
      interface AppState {
        audio: {
          files: Map<string, ParseResult>;
          loading: boolean;
          error: string | null;
        };
      }

      const audioSelectors = {
        selectAudioState: (state: AppState) => state.audio,
        
        selectAllFiles: (state: AppState) => 
          Array.from(state.audio.files.entries()),
        
        selectFileById: (fileId: string) => (state: AppState) =>
          state.audio.files.get(fileId),
        
        selectTotalBeats: (state: AppState) => {
          let total = 0;
          for (const result of state.audio.files.values()) {
            total += result.beats.length;
          }
          return total;
        },
        
        selectAverageConfidence: (state: AppState) => {
          const allBeats: Beat[] = [];
          for (const result of state.audio.files.values()) {
            allBeats.push(...result.beats);
          }
          
          if (allBeats.length === 0) return 0;
          return allBeats.reduce((sum, beat) => sum + beat.confidence, 0) / allBeats.length;
        }
      };

      // Create test state
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await beatParser.parseBuffer(audioData);
      
      const testState: AppState = {
        audio: {
          files: new Map([['test1', result], ['test2', result]]),
          loading: false,
          error: null
        }
      };

      // Test selectors
      expect(audioSelectors.selectAllFiles(testState)).toHaveLength(2);
      expect(audioSelectors.selectFileById('test1')(testState)).toBe(result);
      expect(audioSelectors.selectTotalBeats(testState)).toBe(result.beats.length * 2);
      expect(audioSelectors.selectAverageConfidence(testState)).toBeGreaterThan(0);
    });
  });

  describe('Angular Universal (SSR) Compatibility', () => {
    test('should be compatible with Angular Universal SSR', async () => {
      // Simulate Angular Universal environment
      const platformServer = {
        isPlatformServer: () => typeof window === 'undefined'
      };

      const platformBrowser = {
        isPlatformBrowser: () => typeof window !== 'undefined'
      };

      // Simulate Angular service that works with SSR
      class UniversalAudioService {
        private parser: BeatParser | null = null;
        
        constructor(private isServer: boolean = platformServer.isPlatformServer()) {
          if (!this.isServer) {
            this.parser = new BeatParser();
          }
        }
        
        async parseAudio(audioData: Float32Array): Promise<ParseResult | null> {
          if (this.isServer) {
            // Return null or placeholder data on server
            return null;
          }
          
          if (!this.parser) {
            this.parser = new BeatParser();
          }
          
          return await this.parser.parseBuffer(audioData);
        }
        
        async cleanup(): Promise<void> {
          if (this.parser) {
            await this.parser.cleanup();
          }
        }
      }

      // Test server-side
      const serverService = new UniversalAudioService(true);
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const serverResult = await serverService.parseAudio(audioData);
      
      expect(serverResult).toBeNull(); // No processing on server

      // Test client-side
      const clientService = new UniversalAudioService(false);
      const clientResult = await clientService.parseAudio(audioData);
      
      if (typeof window !== 'undefined') {
        expect(clientResult).toBeDefined();
        expect(clientResult!.beats.length).toBeGreaterThan(0);
      }

      await serverService.cleanup();
      await clientService.cleanup();
    });

    test('should handle Angular Universal state transfer', async () => {
      // Simulate Angular Universal state transfer mechanism
      const stateTransfer = {
        serverState: new Map<string, any>(),
        clientState: new Map<string, any>(),
        
        // Server-side: store state for transfer
        set(key: string, value: any): void {
          this.serverState.set(key, JSON.stringify(value));
        },
        
        // Client-side: retrieve transferred state
        get(key: string): any {
          const serialized = this.serverState.get(key);
          return serialized ? JSON.parse(serialized) : null;
        },
        
        // Check if state exists (avoid re-processing on client)
        hasKey(key: string): boolean {
          return this.serverState.has(key);
        }
      };

      // Simulate service that uses state transfer
      class StateTransferAudioService {
        async processWithTransfer(fileId: string, audioData: Float32Array): Promise<ParseResult> {
          const stateKey = `audio-${fileId}`;
          
          // Check if already processed (from server or previous processing)
          if (stateTransfer.hasKey(stateKey)) {
            return stateTransfer.get(stateKey);
          }
          
          // Process audio
          const result = await beatParser.parseBuffer(audioData);
          
          // Store for potential transfer
          stateTransfer.set(stateKey, result);
          
          return result;
        }
      }

      const service = new StateTransferAudioService();
      const audioData = testAudioFiles.get('short-beat.wav')!;
      
      // First call - processes and stores
      const result1 = await service.processWithTransfer('test-file', audioData);
      expect(result1.beats.length).toBeGreaterThan(0);
      
      // Second call - retrieves from state transfer
      const result2 = await service.processWithTransfer('test-file', audioData);
      expect(result2).toEqual(result1); // Same data from state transfer
    });
  });

  describe('Angular Component Integration', () => {
    test('should integrate with Angular component lifecycle hooks', async () => {
      let ngOnInitCalled = false;
      let ngOnDestroyCalled = false;
      let parseResult: ParseResult | null = null;

      // Simulate Angular component
      class AudioPlayerComponent {
        private parser: BeatParser | null = null;
        private subscription: any = null;
        
        ngOnInit(): void {
          ngOnInitCalled = true;
          this.parser = new BeatParser();
        }
        
        ngOnDestroy(): void {
          ngOnDestroyCalled = true;
          if (this.parser) {
            this.parser.cleanup();
          }
          if (this.subscription) {
            this.subscription.unsubscribe();
          }
        }
        
        async loadAudioFile(audioData: Float32Array): Promise<void> {
          if (!this.parser) return;
          
          parseResult = await this.parser.parseBuffer(audioData);
        }
      }

      const component = new AudioPlayerComponent();
      
      // Simulate Angular lifecycle
      component.ngOnInit();
      expect(ngOnInitCalled).toBe(true);
      
      const audioData = testAudioFiles.get('short-beat.wav')!;
      await component.loadAudioFile(audioData);
      expect(parseResult).toBeDefined();
      expect(parseResult!.beats.length).toBeGreaterThan(0);
      
      component.ngOnDestroy();
      expect(ngOnDestroyCalled).toBe(true);
    });

    test('should work with Angular pipes for data transformation', async () => {
      // Simulate Angular pipe
      class BeatFilterPipe {
        transform(beats: Beat[], minConfidence: number = 0.5): Beat[] {
          if (!beats) return [];
          return beats.filter(beat => beat.confidence >= minConfidence);
        }
      }

      class BeatsPerMinutePipe {
        transform(beats: Beat[], duration: number): number {
          if (!beats || beats.length === 0 || duration <= 0) return 0;
          return Math.round((beats.length / duration) * 60);
        }
      }

      const beatFilterPipe = new BeatFilterPipe();
      const beatsPerMinutePipe = new BeatsPerMinutePipe();

      // Get test data
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await beatParser.parseBuffer(audioData);
      const duration = audioData.length / 44100; // seconds

      // Test pipes
      const filteredBeats = beatFilterPipe.transform(result.beats, 0.7);
      const beatsPerMinute = beatsPerMinutePipe.transform(result.beats, duration);

      expect(filteredBeats.length).toBeLessThanOrEqual(result.beats.length);
      filteredBeats.forEach(beat => {
        expect(beat.confidence).toBeGreaterThanOrEqual(0.7);
      });
      
      expect(beatsPerMinute).toBeGreaterThan(0);
      expect(beatsPerMinute).toBeLessThan(300); // Reasonable upper bound
    });

    test('should handle Angular forms integration', async () => {
      // Simulate Angular reactive forms
      interface FormControl {
        value: any;
        errors: Record<string, any> | null;
        setValue(value: any): void;
        setErrors(errors: Record<string, any> | null): void;
      }

      class AudioProcessingForm {
        private controls: Map<string, FormControl> = new Map();
        
        addControl(name: string, initialValue: any = null): void {
          this.controls.set(name, {
            value: initialValue,
            errors: null,
            setValue: function(newValue: any) { this.value = newValue; },
            setErrors: function(errors: Record<string, any> | null) { this.errors = errors; }
          });
        }
        
        get(name: string): FormControl | null {
          return this.controls.get(name) || null;
        }
        
        get valid(): boolean {
          return Array.from(this.controls.values()).every(control => !control.errors);
        }
      }

      // Create form with audio processing controls
      const form = new AudioProcessingForm();
      form.addControl('targetPictureCount', 10);
      form.addControl('minConfidence', 0.5);
      form.addControl('selectionMethod', 'adaptive');

      // Validation function
      const validateAudioOptions = (form: AudioProcessingForm) => {
        const targetCount = form.get('targetPictureCount');
        const minConfidence = form.get('minConfidence');
        
        if (targetCount && (targetCount.value < 1 || targetCount.value > 1000)) {
          targetCount.setErrors({ range: 'Must be between 1 and 1000' });
        }
        
        if (minConfidence && (minConfidence.value < 0 || minConfidence.value > 1)) {
          minConfidence.setErrors({ range: 'Must be between 0 and 1' });
        }
      };

      // Test form validation
      validateAudioOptions(form);
      expect(form.valid).toBe(true);

      // Test with invalid values
      form.get('targetPictureCount')!.setValue(2000);
      validateAudioOptions(form);
      expect(form.valid).toBe(false);

      // Test audio processing with form values
      form.get('targetPictureCount')!.setValue(15);
      form.get('minConfidence')!.setValue(0.6);
      validateAudioOptions(form);
      expect(form.valid).toBe(true);

      const audioData = testAudioFiles.get('short-beat.wav')!;
      const result = await beatParser.parseBuffer(audioData, {
        targetPictureCount: form.get('targetPictureCount')!.value,
        minConfidence: form.get('minConfidence')!.value,
        selectionMethod: form.get('selectionMethod')!.value as any
      });

      expect(result.beats.length).toBeLessThanOrEqual(15);
      result.beats.forEach(beat => {
        expect(beat.confidence).toBeGreaterThanOrEqual(0.6);
      });
    });
  });

  describe('Zone.js Compatibility', () => {
    test('should work correctly with Zone.js patching', async () => {
      // Mock Zone.js behavior
      let zonePatched = false;
      let asyncTaskCount = 0;

      const mockZone = {
        current: {
          name: 'angular'
        },
        
        runTask: async <T>(fn: () => Promise<T>): Promise<T> => {
          asyncTaskCount++;
          zonePatched = true;
          
          try {
            return await fn();
          } finally {
            asyncTaskCount--;
          }
        }
      };

      // Simulate Angular service that uses Zone
      class ZoneAwareAudioService {
        private parser = new BeatParser();
        
        async processInZone(audioData: Float32Array): Promise<ParseResult> {
          return await mockZone.runTask(async () => {
            return await this.parser.parseBuffer(audioData);
          });
        }
        
        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const service = new ZoneAwareAudioService();
      const audioData = testAudioFiles.get('short-beat.wav')!;
      
      // Process in zone
      const result = await service.processInZone(audioData);
      
      expect(zonePatched).toBe(true);
      expect(asyncTaskCount).toBe(0); // Should be back to 0 after completion
      expect(result.beats.length).toBeGreaterThan(0);

      await service.cleanup();
    });

    test('should handle Zone.js async operations correctly', async () => {
      let promiseCount = 0;
      let timeoutCount = 0;

      // Mock Zone.js promise patching
      const originalPromise = Promise;
      const patchedPromise = class extends Promise<any> {
        constructor(executor: any) {
          super(executor);
          promiseCount++;
        }
      };

      // Mock timeout patching
      const originalSetTimeout = setTimeout;
      const patchedSetTimeout = (callback: Function, delay: number) => {
        timeoutCount++;
        return originalSetTimeout(callback, delay);
      };

      // Use patched versions
      global.Promise = patchedPromise as any;
      global.setTimeout = patchedSetTimeout as any;

      try {
        // Process audio (will create promises internally)
        const audioData = testAudioFiles.get('short-beat.wav')!;
        const result = await beatParser.parseBuffer(audioData);
        
        expect(result.beats.length).toBeGreaterThan(0);
        expect(promiseCount).toBeGreaterThan(0); // Zone should have patched promises
        
      } finally {
        // Restore original functions
        global.Promise = originalPromise;
        global.setTimeout = originalSetTimeout;
      }
    });
  });
});