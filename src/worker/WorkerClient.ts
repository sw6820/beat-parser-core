/**
 * Client interface for BeatParserWorker
 * Provides Promise-based API for worker communication
 */

import type { ParseOptions, ParseResult } from '../types';
import type { BeatParserConfig } from '../core/BeatParser';
import type {
  WorkerMessage,
  ParseBufferMessage,
  ParseStreamMessage,
  BatchProcessMessage,
  ProgressMessage,
  ResultMessage,
  ErrorMessage
} from './BeatParserWorker';

export interface WorkerProgressCallback {
  (progress: {
    current: number;
    total: number;
    stage: string;
    percentage: number;
  }): void;
}

export interface WorkerClientOptions {
  workerUrl?: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface WorkerParseOptions extends ParseOptions {
  progressCallback?: WorkerProgressCallback;
}

export class BeatParserWorkerClient {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingOperations = new Map<string, {
    resolve: (result: ParseResult | ParseResult[]) => void;
    reject: (error: Error) => void;
    progressCallback?: WorkerProgressCallback;
    timeoutId?: NodeJS.Timeout;
  }>();
  
  private options: Required<WorkerClientOptions>;
  private isInitialized = false;

  constructor(options: WorkerClientOptions = {}) {
    this.options = {
      workerUrl: options.workerUrl || new URL('./BeatParserWorker.ts', import.meta.url).href,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 300000, // 5 minutes default
    };
  }

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Check if we're in a browser environment with Worker support
      if (typeof Worker === 'undefined') {
        throw new Error('Web Workers are not supported in this environment');
      }

      this.worker = new Worker(this.options.workerUrl, {
        type: 'module'
      });

      this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));
      this.worker.addEventListener('messageerror', this.handleWorkerMessageError.bind(this));

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize BeatParser worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse audio buffer using worker
   */
  async parseBuffer(
    audioData: Float32Array,
    options: WorkerParseOptions = {},
    config: BeatParserConfig = {}
  ): Promise<ParseResult> {
    await this.initialize();
    
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise<ParseResult>((resolve, reject) => {
      const messageId = this.generateMessageId();
      const { progressCallback, ...parseOptions } = options;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.cancelOperation(messageId);
        reject(new Error('Worker operation timed out'));
      }, this.options.timeout);

      // Store operation
      this.pendingOperations.set(messageId, {
        resolve: resolve as (result: ParseResult | ParseResult[]) => void,
        reject,
        progressCallback,
        timeoutId
      });

      // Send message to worker
      const message: ParseBufferMessage = {
        id: messageId,
        type: 'parse-buffer',
        payload: {
          audioData: this.transferableFloat32Array(audioData),
          options: parseOptions,
          config
        }
      };

      this.worker!.postMessage(message, [audioData.buffer]);
    });
  }

  /**
   * Parse audio stream using worker
   */
  async parseStream(
    chunks: Float32Array[],
    options: WorkerParseOptions = {},
    config: BeatParserConfig = {}
  ): Promise<ParseResult> {
    await this.initialize();
    
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise<ParseResult>((resolve, reject) => {
      const messageId = this.generateMessageId();
      const { progressCallback, ...parseOptions } = options;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.cancelOperation(messageId);
        reject(new Error('Worker operation timed out'));
      }, this.options.timeout);

      // Store operation
      this.pendingOperations.set(messageId, {
        resolve: resolve as (result: ParseResult | ParseResult[]) => void,
        reject,
        progressCallback,
        timeoutId
      });

      // Prepare transferable chunks
      const transferableChunks = chunks.map(chunk => this.transferableFloat32Array(chunk));
      const transferList = chunks.map(chunk => chunk.buffer);

      // Send message to worker
      const message: ParseStreamMessage = {
        id: messageId,
        type: 'parse-stream',
        payload: {
          chunks: transferableChunks,
          options: parseOptions,
          config
        }
      };

      this.worker!.postMessage(message, transferList);
    });
  }

  /**
   * Process multiple audio buffers in batch
   */
  async processBatch(
    audioBuffers: Float32Array[],
    options: WorkerParseOptions[] = [],
    config: BeatParserConfig = {}
  ): Promise<ParseResult[]> {
    await this.initialize();
    
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise<ParseResult[]>((resolve, reject) => {
      const messageId = this.generateMessageId();

      // Extract progress callback from first options if available
      const progressCallback = options[0]?.progressCallback;
      const parseOptions = options.map(opt => {
        if (!opt) return {};
        const { progressCallback: _, ...rest } = opt;
        return rest;
      });

      // Set up timeout (longer for batch operations)
      const batchTimeout = this.options.timeout * Math.max(1, Math.ceil(audioBuffers.length / 5));
      const timeoutId = setTimeout(() => {
        this.cancelOperation(messageId);
        reject(new Error('Batch operation timed out'));
      }, batchTimeout);

      // Store operation
      this.pendingOperations.set(messageId, {
        resolve: resolve as (result: ParseResult | ParseResult[]) => void,
        reject,
        progressCallback,
        timeoutId
      });

      // Prepare transferable buffers
      const transferableBuffers = audioBuffers.map(buffer => this.transferableFloat32Array(buffer));
      const transferList = audioBuffers.map(buffer => buffer.buffer);

      // Send message to worker
      const message: BatchProcessMessage = {
        id: messageId,
        type: 'batch-process',
        payload: {
          audioBuffers: transferableBuffers,
          options: parseOptions,
          config
        }
      };

      this.worker!.postMessage(message, transferList);
    });
  }

  /**
   * Cancel a specific operation or all operations
   */
  cancelOperation(messageId?: string): void {
    if (messageId) {
      const operation = this.pendingOperations.get(messageId);
      if (operation) {
        if (operation.timeoutId) {
          clearTimeout(operation.timeoutId);
        }
        operation.reject(new Error('Operation cancelled'));
        this.pendingOperations.delete(messageId);
      }
    } else {
      // Cancel all operations
      for (const [id, operation] of this.pendingOperations) {
        if (operation.timeoutId) {
          clearTimeout(operation.timeoutId);
        }
        operation.reject(new Error('Operation cancelled'));
      }
      this.pendingOperations.clear();
    }

    // Send cancel message to worker
    if (this.worker) {
      this.worker.postMessage({
        id: messageId || 'all',
        type: 'cancel'
      });
    }
  }

  /**
   * Get the number of pending operations
   */
  getPendingOperationCount(): number {
    return this.pendingOperations.size;
  }

  /**
   * Check if worker is busy
   */
  isBusy(): boolean {
    return this.pendingOperations.size > 0;
  }

  /**
   * Terminate the worker and cleanup resources
   */
  async terminate(): Promise<void> {
    // Cancel all pending operations
    this.cancelOperation();

    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.isInitialized = false;
  }

  // Private methods

  private generateMessageId(): string {
    return `msg_${++this.messageId}_${Date.now()}`;
  }

  private transferableFloat32Array(array: Float32Array): Float32Array {
    // Create a new Float32Array that can be transferred
    const transferable = new Float32Array(array.length);
    transferable.set(array);
    return transferable;
  }

  private handleWorkerMessage(event: MessageEvent<WorkerMessage>): void {
    const { id, type, payload } = event.data;
    const operation = this.pendingOperations.get(id);

    if (!operation) {
      console.warn(`Received message for unknown operation: ${id}`);
      return;
    }

    try {
      switch (type) {
        case 'progress': {
          const progressData = payload as ProgressMessage['payload'];
          if (operation.progressCallback) {
            operation.progressCallback(progressData);
          }
          break;
        }

        case 'result': {
          const result = payload as ResultMessage['payload'];
          if (operation.timeoutId) {
            clearTimeout(operation.timeoutId);
          }
          this.pendingOperations.delete(id);
          operation.resolve(result);
          break;
        }

        case 'error': {
          const errorData = payload as ErrorMessage['payload'];
          if (operation.timeoutId) {
            clearTimeout(operation.timeoutId);
          }
          this.pendingOperations.delete(id);
          operation.reject(new Error(errorData.message));
          break;
        }

        default: {
          console.warn(`Unknown worker message type: ${type}`);
        }
      }
    } catch (error) {
      operation.reject(error instanceof Error ? error : new Error('Unknown error handling worker message'));
      this.pendingOperations.delete(id);
    }
  }

  private handleWorkerError(event: ErrorEvent): void {
    console.error('Worker error:', event);
    
    // Reject all pending operations
    const error = new Error(`Worker error: ${event.message}`);
    for (const [id, operation] of this.pendingOperations) {
      if (operation.timeoutId) {
        clearTimeout(operation.timeoutId);
      }
      operation.reject(error);
    }
    this.pendingOperations.clear();
  }

  private handleWorkerMessageError(event: MessageEvent): void {
    console.error('Worker message error:', event);
    
    // This usually indicates serialization/deserialization issues
    const error = new Error('Worker message error - possible data serialization issue');
    for (const [id, operation] of this.pendingOperations) {
      if (operation.timeoutId) {
        clearTimeout(operation.timeoutId);
      }
      operation.reject(error);
    }
    this.pendingOperations.clear();
  }
}

// Utility function to create a worker client with default settings
export function createWorkerClient(options?: WorkerClientOptions): BeatParserWorkerClient {
  return new BeatParserWorkerClient(options);
}

// Utility function to check if workers are supported
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof Worker === 'function';
}

// Default export
export default BeatParserWorkerClient;