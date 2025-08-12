/**
 * Worker module exports
 * Provides Web Worker functionality for beat parsing
 */

export { BeatParserWorkerClient, createWorkerClient, isWorkerSupported } from './WorkerClient';
export type { 
  WorkerProgressCallback, 
  WorkerClientOptions, 
  WorkerParseOptions 
} from './WorkerClient';

export type {
  WorkerMessage,
  ParseBufferMessage,
  ParseStreamMessage,
  BatchProcessMessage,
  ProgressMessage,
  ResultMessage,
  ErrorMessage,
  CancelMessage
} from './BeatParserWorker';

// Default export for convenience
export { BeatParserWorkerClient as default } from './WorkerClient';