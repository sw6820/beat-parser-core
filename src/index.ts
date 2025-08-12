/**
 * @beat-parser/core - TypeScript library for parsing musical beats and rhythmic patterns
 * 
 * Main entry point for the beat parser library.
 */

// Core exports
export * from './core';
export * from './parsers';
export * from './types';
export * from './utils';
export * from './algorithms';
export * from './worker';

// Main class and types for convenience
export { BeatParser, BeatParserConfig, BeatParserPlugin } from './core/BeatParser';
export { HybridDetector } from './algorithms/HybridDetector';

// Worker exports for convenience
export { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from './worker/WorkerClient';
export type { WorkerProgressCallback, WorkerClientOptions, WorkerParseOptions } from './worker/WorkerClient';

// Main class as default export for easier importing
import { BeatParser } from './core/BeatParser';
export default BeatParser;