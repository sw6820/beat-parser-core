/**
 * Cross-Platform Testing Utilities
 * Provides helper functions and utilities for cross-platform compatibility testing
 */

export interface PlatformInfo {
  runtime: 'node' | 'browser' | 'worker' | 'unknown';
  version?: string;
  features: PlatformFeatures;
  capabilities: PlatformCapabilities;
  environment: EnvironmentDetails;
}

export interface PlatformFeatures {
  // Core JavaScript features
  es2020: boolean;
  es2021: boolean;
  modules: boolean;
  dynamicImport: boolean;
  
  // Audio features
  webAudioAPI: boolean;
  audioContext: boolean;
  mediaDevices: boolean;
  
  // Worker features  
  webWorkers: boolean;
  workerThreads: boolean;
  sharedWorkers: boolean;
  serviceWorkers: boolean;
  
  // Storage features
  localStorage: boolean;
  indexedDB: boolean;
  fileSystem: boolean;
  
  // Networking features
  fetch: boolean;
  webSockets: boolean;
  webRTC: boolean;
  
  // Performance features
  performanceAPI: boolean;
  performanceObserver: boolean;
  
  // Binary data features
  arrayBuffer: boolean;
  sharedArrayBuffer: boolean;
  atomics: boolean;
  transferableObjects: boolean;
}

export interface PlatformCapabilities {
  // Memory limits
  maxHeapSize?: number;
  maxArrayBufferSize?: number;
  
  // Processing limits
  maxWorkers?: number;
  supportsMultiThreading: boolean;
  
  // File system
  canReadFiles: boolean;
  canWriteFiles: boolean;
  supportsStreaming: boolean;
  
  // Network
  corsEnabled: boolean;
  supportsHTTPS: boolean;
  
  // Performance characteristics
  jitCompilation: boolean;
  garbageCollection: 'mark-and-sweep' | 'generational' | 'concurrent' | 'unknown';
}

export interface EnvironmentDetails {
  platform: string;
  arch: string;
  userAgent?: string;
  language: string;
  timezone: string;
  nodeVersion?: string;
  v8Version?: string;
}

export class PlatformDetector {
  /**
   * Detect comprehensive platform information
   */
  static detect(): PlatformInfo {
    const runtime = PlatformTester.detectRuntime();
    const version = PlatformTester.detectVersion(runtime);
    const features = PlatformTester.detectFeatures();
    const capabilities = PlatformTester.detectCapabilities();
    const environment = PlatformTester.detectEnvironment();

    return {
      runtime,
      version,
      features,
      capabilities,
      environment
    };
  }

  /**
   * Detect the current runtime environment
   */
  static detectRuntime(): PlatformInfo['runtime'] {
    if (typeof process !== 'undefined' && process.versions?.node) {
      return 'node';
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return 'browser';
    }
    if (typeof importScripts === 'function') {
      return 'worker';
    }
    return 'unknown';
  }

  /**
   * Detect runtime version
   */
  static detectVersion(runtime: PlatformInfo['runtime']): string | undefined {
    switch (runtime) {
      case 'node':
        return process.versions?.node;
      case 'browser':
        return typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
      default:
        return undefined;
    }
  }

  /**
   * Detect available platform features
   */
  static detectFeatures(): PlatformFeatures {
    return {
      // Core JavaScript features
      es2020: PlatformTester.testES2020(),
      es2021: PlatformTester.testES2021(),
      modules: PlatformTester.testModules(),
      dynamicImport: PlatformTester.testDynamicImport(),
      
      // Audio features
      webAudioAPI: PlatformTester.testWebAudioAPI(),
      audioContext: typeof AudioContext !== 'undefined' || typeof (globalThis as any).webkitAudioContext !== 'undefined',
      mediaDevices: typeof navigator !== 'undefined' && 'mediaDevices' in navigator,
      
      // Worker features
      webWorkers: typeof Worker !== 'undefined',
      workerThreads: PlatformTester.testWorkerThreads(),
      sharedWorkers: typeof SharedWorker !== 'undefined',
      serviceWorkers: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      
      // Storage features
      localStorage: PlatformTester.testLocalStorage(),
      indexedDB: PlatformTester.testIndexedDB(),
      fileSystem: PlatformTester.testFileSystem(),
      
      // Networking features
      fetch: typeof fetch !== 'undefined',
      webSockets: typeof WebSocket !== 'undefined',
      webRTC: typeof RTCPeerConnection !== 'undefined',
      
      // Performance features
      performanceAPI: typeof performance !== 'undefined',
      performanceObserver: typeof PerformanceObserver !== 'undefined',
      
      // Binary data features
      arrayBuffer: typeof ArrayBuffer !== 'undefined',
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      atomics: typeof Atomics !== 'undefined',
      transferableObjects: PlatformTester.testTransferableObjects()
    };
  }

  /**
   * Detect platform capabilities
   */
  static detectCapabilities(): PlatformCapabilities {
    return {
      maxHeapSize: PlatformTester.detectMaxHeapSize(),
      maxArrayBufferSize: PlatformTester.detectMaxArrayBufferSize(),
      maxWorkers: PlatformTester.detectMaxWorkers(),
      supportsMultiThreading: PlatformTester.testMultiThreading(),
      canReadFiles: PlatformTester.testFileReading(),
      canWriteFiles: PlatformTester.testFileWriting(),
      supportsStreaming: PlatformTester.testStreaming(),
      corsEnabled: PlatformTester.testCORS(),
      supportsHTTPS: PlatformTester.testHTTPS(),
      jitCompilation: PlatformTester.testJIT(),
      garbageCollection: PlatformTester.detectGCType()
    };
  }

  /**
   * Detect environment details
   */
  static detectEnvironment(): EnvironmentDetails {
    return {
      platform: PlatformTester.detectPlatform(),
      arch: PlatformTester.detectArch(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      language: PlatformTester.detectLanguage(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      nodeVersion: typeof process !== 'undefined' ? process.versions?.node : undefined,
      v8Version: typeof process !== 'undefined' ? process.versions?.v8 : undefined
    };
  }

  // Feature detection helpers

  private static testES2020(): boolean {
    try {
      // Test optional chaining and nullish coalescing
      const obj: any = {};
      return obj?.test ?? true;
    } catch {
      return false;
    }
  }

  private static testES2021(): boolean {
    try {
      // Test logical assignment operators
      let x = false;
      x ||= true;
      return x;
    } catch {
      return false;
    }
  }

  private static testModules(): boolean {
    // Check if ES modules are supported
    return typeof module !== 'undefined' && module.exports !== undefined;
  }

  private static testDynamicImport(): boolean {
    // Check if dynamic import is available
    try {
      return typeof eval('import') === 'function';
    } catch {
      return false;
    }
  }

  private static testWebAudioAPI(): boolean {
    return typeof AudioContext !== 'undefined' || typeof (globalThis as any).webkitAudioContext !== 'undefined';
  }

  private static testWorkerThreads(): boolean {
    try {
      require.resolve('worker_threads');
      return true;
    } catch {
      return false;
    }
  }

  private static testLocalStorage(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch {
      return false;
    }
  }

  private static testIndexedDB(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private static testFileSystem(): boolean {
    try {
      require.resolve('fs');
      return true;
    } catch {
      return false;
    }
  }

  private static testTransferableObjects(): boolean {
    return typeof ArrayBuffer !== 'undefined' && typeof MessageChannel !== 'undefined';
  }

  private static detectMaxHeapSize(): number | undefined {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      return memory.heapTotal;
    }
    return undefined;
  }

  private static detectMaxArrayBufferSize(): number | undefined {
    try {
      // Try to detect the maximum ArrayBuffer size
      // This is heuristic and platform-dependent
      const testSize = 1024 * 1024 * 1024; // 1GB
      new ArrayBuffer(Math.min(testSize, 100 * 1024 * 1024)); // Test with 100MB max
      return testSize;
    } catch {
      return 100 * 1024 * 1024; // Default to 100MB
    }
  }

  private static detectMaxWorkers(): number | undefined {
    if (typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator) {
      return navigator.hardwareConcurrency;
    }
    if (typeof process !== 'undefined') {
      // Node.js doesn't have a hard limit, but practical limits apply
      return 8; // Conservative estimate
    }
    return 4; // Default conservative estimate
  }

  private static testMultiThreading(): boolean {
    return typeof Worker !== 'undefined' || PlatformTester.testWorkerThreads();
  }

  private static testFileReading(): boolean {
    try {
      const fs = require('fs');
      return typeof fs.readFileSync === 'function';
    } catch {
      return typeof FileReader !== 'undefined';
    }
  }

  private static testFileWriting(): boolean {
    try {
      const fs = require('fs');
      return typeof fs.writeFileSync === 'function';
    } catch {
      return false; // Browsers generally can't write files directly
    }
  }

  private static testStreaming(): boolean {
    return typeof ReadableStream !== 'undefined' || 
           (typeof require !== 'undefined' && (() => {
             try {
               require.resolve('stream');
               return true;
             } catch {
               return false;
             }
           })());
  }

  private static testCORS(): boolean {
    // In Node.js, CORS doesn't apply
    if (typeof process !== 'undefined') return true;
    
    // In browsers, assume CORS is enabled (it's a server-side setting)
    return typeof window !== 'undefined';
  }

  private static testHTTPS(): boolean {
    if (typeof location !== 'undefined') {
      return location.protocol === 'https:';
    }
    // Node.js supports HTTPS
    return typeof process !== 'undefined';
  }

  private static testJIT(): boolean {
    // Most modern JavaScript engines use JIT
    // This is a heuristic test
    const start = performance.now();
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += Math.sin(i);
    }
    const time = performance.now() - start;
    
    // If it's reasonably fast, likely has JIT
    return time < 100; // Less than 100ms for 100k operations
  }

  private static detectGCType(): PlatformCapabilities['garbageCollection'] {
    if (typeof process !== 'undefined' && process.versions?.v8) {
      return 'generational'; // V8 uses generational GC
    }
    return 'unknown';
  }

  private static detectPlatform(): string {
    if (typeof process !== 'undefined') {
      return process.platform;
    }
    if (typeof navigator !== 'undefined') {
      return navigator.platform;
    }
    return 'unknown';
  }

  private static detectArch(): string {
    if (typeof process !== 'undefined') {
      return process.arch;
    }
    // Browser architecture detection is limited
    return 'unknown';
  }

  private static detectLanguage(): string {
    if (typeof navigator !== 'undefined') {
      return navigator.language;
    }
    if (typeof process !== 'undefined') {
      return process.env.LANG || 'en-US';
    }
    return 'en-US';
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTester {
  /**
   * Measure execution time of a function
   */
  static async measureAsync<T>(fn: () => Promise<T>, runs = 1): Promise<{ result: T; avgTime: number; minTime: number; maxTime: number; times: number[] }> {
    const times: number[] = [];
    let result: T;

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      result = await fn();
      const end = performance.now();
      times.push(end - start);
    }

    return {
      result: result!,
      avgTime: times.reduce((sum, time) => sum + time, 0) / runs,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      times
    };
  }

  /**
   * Measure execution time of a synchronous function
   */
  static measure<T>(fn: () => T, runs = 1): { result: T; avgTime: number; minTime: number; maxTime: number; times: number[] } {
    const times: number[] = [];
    let result: T;

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      result = fn();
      const end = performance.now();
      times.push(end - start);
    }

    return {
      result: result!,
      avgTime: times.reduce((sum, time) => sum + time, 0) / runs,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      times
    };
  }

  /**
   * Measure memory usage before and after function execution
   */
  static measureMemory<T>(fn: () => T): { result: T; memoryDelta: number; beforeMemory: number; afterMemory: number } {
    const beforeMemory = PlatformTester.getMemoryUsage();
    const result = fn();
    const afterMemory = PlatformTester.getMemoryUsage();

    return {
      result,
      memoryDelta: afterMemory - beforeMemory,
      beforeMemory,
      afterMemory
    };
  }

  /**
   * Get current memory usage
   */
  static getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    
    return 0;
  }

  /**
   * Force garbage collection if available
   */
  static forceGC(): boolean {
    if (typeof global !== 'undefined' && (global as any).gc) {
      (global as any).gc();
      return true;
    }
    
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
      return true;
    }
    
    return false;
  }
}

/**
 * Cross-platform audio testing utilities
 */
export class AudioTestUtils {
  /**
   * Generate test audio signal
   */
  static generateSineWave(
    frequency: number,
    duration: number,
    sampleRate = 44100,
    amplitude = 0.5
  ): Float32Array {
    const samples = Math.floor(duration * sampleRate);
    const audioData = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      audioData[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }
    
    return audioData;
  }

  /**
   * Generate white noise
   */
  static generateWhiteNoise(duration: number, sampleRate = 44100, amplitude = 0.5): Float32Array {
    const samples = Math.floor(duration * sampleRate);
    const audioData = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      audioData[i] = amplitude * (Math.random() * 2 - 1);
    }
    
    return audioData;
  }

  /**
   * Generate chirp signal (frequency sweep)
   */
  static generateChirp(
    startFreq: number,
    endFreq: number,
    duration: number,
    sampleRate = 44100,
    amplitude = 0.5
  ): Float32Array {
    const samples = Math.floor(duration * sampleRate);
    const audioData = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const freq = startFreq + (endFreq - startFreq) * t / duration;
      audioData[i] = amplitude * Math.sin(2 * Math.PI * freq * t);
    }
    
    return audioData;
  }

  /**
   * Generate impulse train (for beat detection testing)
   */
  static generateImpulseTrain(
    tempo: number,
    duration: number,
    sampleRate = 44100,
    amplitude = 0.8
  ): Float32Array {
    const samples = Math.floor(duration * sampleRate);
    const audioData = new Float32Array(samples);
    const beatInterval = 60 / tempo; // seconds per beat
    const samplesPerBeat = Math.floor(beatInterval * sampleRate);
    
    for (let i = 0; i < samples; i++) {
      if (i % samplesPerBeat === 0) {
        // Add impulse
        audioData[i] = amplitude;
        // Add short decay
        for (let j = 1; j < 100 && i + j < samples; j++) {
          audioData[i + j] = amplitude * Math.exp(-j / 10);
        }
      }
    }
    
    return audioData;
  }

  /**
   * Create minimal WAV file buffer for testing
   */
  static createWAVBuffer(audioData: Float32Array, sampleRate = 44100): ArrayBuffer {
    const length = audioData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    
    let offset = 0;
    
    // RIFF header
    view.setUint32(offset, 0x52494646, false); offset += 4; // "RIFF"
    view.setUint32(offset, 36 + length * 2, true); offset += 4; // File size - 8
    view.setUint32(offset, 0x57415645, false); offset += 4; // "WAVE"
    
    // fmt chunk
    view.setUint32(offset, 0x666d7420, false); offset += 4; // "fmt "
    view.setUint32(offset, 16, true); offset += 4; // Chunk size
    view.setUint16(offset, 1, true); offset += 2; // PCM format
    view.setUint16(offset, 1, true); offset += 2; // Mono
    view.setUint32(offset, sampleRate, true); offset += 4; // Sample rate
    view.setUint32(offset, sampleRate * 2, true); offset += 4; // Byte rate
    view.setUint16(offset, 2, true); offset += 2; // Block align
    view.setUint16(offset, 16, true); offset += 2; // 16-bit
    
    // data chunk
    view.setUint32(offset, 0x64617461, false); offset += 4; // "data"
    view.setUint32(offset, length * 2, true); offset += 4; // Data size
    
    // Sample data (convert float to 16-bit PCM)
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i])); // Clamp to [-1, 1]
      view.setInt16(offset, sample * 32767, true);
      offset += 2;
    }
    
    return buffer;
  }

  /**
   * Compare two audio signals for similarity
   */
  static compareSignals(signal1: Float32Array, signal2: Float32Array, tolerance = 0.01): {
    similar: boolean;
    maxDifference: number;
    rmsError: number;
  } {
    if (signal1.length !== signal2.length) {
      return { similar: false, maxDifference: Infinity, rmsError: Infinity };
    }
    
    let maxDiff = 0;
    let sumSquaredError = 0;
    
    for (let i = 0; i < signal1.length; i++) {
      const diff = Math.abs(signal1[i] - signal2[i]);
      maxDiff = Math.max(maxDiff, diff);
      sumSquaredError += diff * diff;
    }
    
    const rmsError = Math.sqrt(sumSquaredError / signal1.length);
    
    return {
      similar: maxDiff < tolerance,
      maxDifference: maxDiff,
      rmsError
    };
  }
}

/**
 * Cross-platform compatibility test helpers
 */
export class CompatibilityTestUtils {
  /**
   * Test if a feature is available across platforms
   */
  static testFeatureAvailability(featureName: string, testFn: () => boolean): {
    available: boolean;
    error?: string;
  } {
    try {
      const available = testFn();
      return { available };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Test API consistency across platforms
   */
  static testAPIConsistency<T>(
    apiName: string,
    createAPI: () => T,
    tests: Array<{
      name: string;
      test: (api: T) => boolean | Promise<boolean>;
    }>
  ): Promise<{
    apiName: string;
    available: boolean;
    passedTests: string[];
    failedTests: string[];
    errors: { [testName: string]: string };
  }> {
    return new Promise(async (resolve) => {
      let api: T;
      
      try {
        api = createAPI();
      } catch (error) {
        resolve({
          apiName,
          available: false,
          passedTests: [],
          failedTests: tests.map(t => t.name),
          errors: { creation: error instanceof Error ? error.message : String(error) }
        });
        return;
      }
      
      const passedTests: string[] = [];
      const failedTests: string[] = [];
      const errors: { [testName: string]: string } = {};
      
      for (const test of tests) {
        try {
          const result = await test.test(api);
          if (result) {
            passedTests.push(test.name);
          } else {
            failedTests.push(test.name);
          }
        } catch (error) {
          failedTests.push(test.name);
          errors[test.name] = error instanceof Error ? error.message : String(error);
        }
      }
      
      resolve({
        apiName,
        available: true,
        passedTests,
        failedTests,
        errors
      });
    });
  }

  /**
   * Generate compatibility report
   */
  static generateCompatibilityReport(): {
    platform: PlatformInfo;
    timestamp: string;
    summary: {
      totalFeatures: number;
      supportedFeatures: number;
      compatibilityScore: number;
    };
  } {
    const platform = PlatformDetector.detect();
    const features = platform.features;
    
    const supportedFeatures = Object.values(features).filter(Boolean).length;
    const totalFeatures = Object.keys(features).length;
    const compatibilityScore = supportedFeatures / totalFeatures;
    
    return {
      platform,
      timestamp: new Date().toISOString(),
      summary: {
        totalFeatures,
        supportedFeatures,
        compatibilityScore
      }
    };
  }
}

/**
 * Mock utilities for testing different environments
 */
export class MockEnvironment {
  private static originalGlobals: { [key: string]: any } = {};

  /**
   * Mock browser environment
   */
  static mockBrowser(): void {
    PlatformTester.saveOriginalGlobal('window');
    PlatformTester.saveOriginalGlobal('document');
    PlatformTester.saveOriginalGlobal('navigator');
    PlatformTester.saveOriginalGlobal('Worker');
    PlatformTester.saveOriginalGlobal('AudioContext');

    (global as any).window = {
      location: { protocol: 'https:' },
      localStorage: {},
      indexedDB: {}
    };
    
    (global as any).document = {
      createElement: () => ({}),
      addEventListener: () => {}
    };
    
    (global as any).navigator = {
      userAgent: 'MockBrowser/1.0',
      language: 'en-US',
      hardwareConcurrency: 4
    };
    
    (global as any).Worker = function MockWorker() {
      return {
        postMessage: () => {},
        terminate: () => {},
        addEventListener: () => {}
      };
    };
    
    (global as any).AudioContext = function MockAudioContext() {
      return {
        decodeAudioData: () => Promise.resolve({
          numberOfChannels: 1,
          sampleRate: 44100,
          length: 1024,
          duration: 1024 / 44100,
          getChannelData: () => new Float32Array(1024)
        }),
        close: () => Promise.resolve()
      };
    };
  }

  /**
   * Mock Node.js environment (restore default)
   */
  static mockNodeJS(): void {
    PlatformTester.restoreAll();
  }

  /**
   * Mock Web Worker environment
   */
  static mockWebWorker(): void {
    PlatformTester.saveOriginalGlobal('importScripts');
    PlatformTester.saveOriginalGlobal('postMessage');

    (global as any).importScripts = () => {};
    (global as any).postMessage = () => {};

    // Remove Node.js globals
    delete (global as any).process;
    delete (global as any).Buffer;
    delete (global as any).require;
  }

  /**
   * Restore original environment
   */
  static restoreAll(): void {
    for (const [key, value] of Object.entries(PlatformTester.originalGlobals)) {
      if (value === undefined) {
        delete (global as any)[key];
      } else {
        (global as any)[key] = value;
      }
    }
    PlatformTester.originalGlobals = {};
  }

  private static saveOriginalGlobal(key: string): void {
    PlatformTester.originalGlobals[key] = (global as any)[key];
  }
}