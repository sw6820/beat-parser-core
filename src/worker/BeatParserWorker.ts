/**
 * Web Worker implementation for BeatParser
 * Offloads heavy processing to worker threads with progress reporting
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import type { ParseOptions, ParseResult } from '../types';

// Worker message types
export interface WorkerMessage {
  id: string;
  type: 'parse-buffer' | 'parse-stream' | 'progress' | 'result' | 'error' | 'batch-process' | 'cancel';
  payload?: unknown;
}

export interface ParseBufferMessage extends WorkerMessage {
  type: 'parse-buffer';
  payload: {
    audioData: Float32Array;
    options?: ParseOptions;
    config?: BeatParserConfig;
  };
}

export interface ParseStreamMessage extends WorkerMessage {
  type: 'parse-stream';
  payload: {
    chunks: Float32Array[];
    options?: ParseOptions;
    config?: BeatParserConfig;
  };
}

export interface BatchProcessMessage extends WorkerMessage {
  type: 'batch-process';
  payload: {
    audioBuffers: Float32Array[];
    options?: ParseOptions[];
    config?: BeatParserConfig;
  };
}

export interface ProgressMessage extends WorkerMessage {
  type: 'progress';
  payload: {
    current: number;
    total: number;
    stage: string;
    percentage: number;
  };
}

export interface ResultMessage extends WorkerMessage {
  type: 'result';
  payload: ParseResult | ParseResult[];
}

export interface ErrorMessage extends WorkerMessage {
  type: 'error';
  payload: {
    message: string;
    stack?: string;
  };
}

export interface CancelMessage extends WorkerMessage {
  type: 'cancel';
  payload?: undefined;
}

// Worker state management
class WorkerState {
  private cancelRequested = false;
  private currentOperation: string | null = null;

  cancel(): void {
    this.cancelRequested = true;
  }

  reset(): void {
    this.cancelRequested = false;
    this.currentOperation = null;
  }

  isCancelled(): boolean {
    return this.cancelRequested;
  }

  setOperation(operation: string): void {
    this.currentOperation = operation;
  }

  getOperation(): string | null {
    return this.currentOperation;
  }
}

const workerState = new WorkerState();

// Progress reporting utility
function reportProgress(
  messageId: string,
  current: number,
  total: number,
  stage: string
): void {
  const percentage = Math.round((current / total) * 100);
  
  const progressMessage: ProgressMessage = {
    id: messageId,
    type: 'progress',
    payload: {
      current,
      total,
      stage,
      percentage
    }
  };
  
  // Use proper worker message posting based on environment
  if (typeof postMessage !== 'undefined') {
    postMessage(progressMessage);
  } else if (typeof self !== 'undefined' && 'postMessage' in self) {
    self.postMessage(progressMessage);
  }
}

// Error reporting utility
function reportError(messageId: string, error: Error): void {
  const errorMessage: ErrorMessage = {
    id: messageId,
    type: 'error',
    payload: {
      message: error.message,
      stack: error.stack
    }
  };
  
  if (typeof postMessage !== 'undefined') {
    postMessage(errorMessage);
  } else if (typeof self !== 'undefined' && 'postMessage' in self) {
    self.postMessage(errorMessage);
  }
}

// Result reporting utility
function reportResult(messageId: string, result: ParseResult | ParseResult[]): void {
  const resultMessage: ResultMessage = {
    id: messageId,
    type: 'result',
    payload: result
  };
  
  if (typeof postMessage !== 'undefined') {
    postMessage(resultMessage);
  } else if (typeof self !== 'undefined' && 'postMessage' in self) {
    self.postMessage(resultMessage);
  }
}

// Process single audio buffer
async function processBuffer(
  messageId: string,
  audioData: Float32Array,
  options: ParseOptions = {},
  config: BeatParserConfig = {}
): Promise<void> {
  try {
    workerState.setOperation('processBuffer');
    
    reportProgress(messageId, 0, 100, 'Initializing parser');
    
    if (workerState.isCancelled()) {
      return;
    }
    
    const parser = new BeatParser(config);
    await parser.initialize();
    
    reportProgress(messageId, 20, 100, 'Processing audio');
    
    if (workerState.isCancelled()) {
      return;
    }
    
    // Add progress callback to options
    const enhancedOptions: ParseOptions = {
      ...options,
      progressCallback: (progress: number) => {
        if (!workerState.isCancelled()) {
          // Map progress to 20-90% range
          const mappedProgress = 20 + (progress / audioData.length) * 70;
          reportProgress(messageId, mappedProgress, 100, 'Detecting beats');
        }
      }
    };
    
    const result = await parser.parseBuffer(audioData, enhancedOptions);
    
    if (workerState.isCancelled()) {
      return;
    }
    
    reportProgress(messageId, 100, 100, 'Complete');
    reportResult(messageId, result);
    
    await parser.cleanup();
  } catch (error) {
    reportError(messageId, error instanceof Error ? error : new Error('Unknown error'));
  }
}

// Process audio stream chunks
async function processStream(
  messageId: string,
  chunks: Float32Array[],
  options: ParseOptions = {},
  config: BeatParserConfig = {}
): Promise<void> {
  try {
    workerState.setOperation('processStream');
    
    reportProgress(messageId, 0, 100, 'Initializing streaming parser');
    
    if (workerState.isCancelled()) {
      return;
    }
    
    const parser = new BeatParser(config);
    await parser.initialize();
    
    reportProgress(messageId, 10, 100, 'Processing stream chunks');
    
    // Combine chunks into a single buffer for processing
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedAudio = new Float32Array(totalLength);
    let offset = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      if (workerState.isCancelled()) {
        return;
      }
      
      combinedAudio.set(chunks[i], offset);
      offset += chunks[i].length;
      
      // Report chunk processing progress
      const chunkProgress = 10 + ((i + 1) / chunks.length) * 20;
      reportProgress(messageId, chunkProgress, 100, `Processing chunk ${i + 1}/${chunks.length}`);
    }
    
    if (workerState.isCancelled()) {
      return;
    }
    
    // Create streaming options with progress callback
    const streamingOptions = {
      ...options,
      progressCallback: (progress: number) => {
        if (!workerState.isCancelled()) {
          // Map to remaining 70% of progress
          const mappedProgress = 30 + (progress / combinedAudio.length) * 70;
          reportProgress(messageId, mappedProgress, 100, 'Detecting beats in stream');
        }
      }
    };
    
    const result = await parser.parseBuffer(combinedAudio, streamingOptions);
    
    if (workerState.isCancelled()) {
      return;
    }
    
    reportProgress(messageId, 100, 100, 'Stream processing complete');
    reportResult(messageId, result);
    
    await parser.cleanup();
  } catch (error) {
    reportError(messageId, error instanceof Error ? error : new Error('Unknown error'));
  }
}

// Process multiple audio buffers in batch
async function processBatch(
  messageId: string,
  audioBuffers: Float32Array[],
  options: ParseOptions[] = [],
  config: BeatParserConfig = {}
): Promise<void> {
  try {
    workerState.setOperation('processBatch');
    
    reportProgress(messageId, 0, 100, 'Initializing batch processor');
    
    if (workerState.isCancelled()) {
      return;
    }
    
    const parser = new BeatParser(config);
    await parser.initialize();
    
    const results: ParseResult[] = [];
    const totalBuffers = audioBuffers.length;
    
    for (let i = 0; i < totalBuffers; i++) {
      if (workerState.isCancelled()) {
        return;
      }
      
      const buffer = audioBuffers[i];
      const bufferOptions = options[i] || {};
      
      reportProgress(
        messageId,
        (i / totalBuffers) * 90,
        100,
        `Processing buffer ${i + 1}/${totalBuffers}`
      );
      
      try {
        // Add individual buffer progress reporting
        const enhancedOptions: ParseOptions = {
          ...bufferOptions,
          progressCallback: (progress: number) => {
            if (!workerState.isCancelled()) {
              const bufferProgress = (i / totalBuffers) * 90 + (progress / buffer.length) * (90 / totalBuffers);
              reportProgress(messageId, bufferProgress, 100, `Processing buffer ${i + 1}/${totalBuffers}`);
            }
          }
        };
        
        const result = await parser.parseBuffer(buffer, enhancedOptions);
        results.push(result);
      } catch (error) {
        // Continue with other buffers even if one fails
        console.warn(`Failed to process buffer ${i + 1}:`, error);
        results.push({
          beats: [],
          confidence: 0,
          tempo: 0,
          timeSignature: { numerator: 4, denominator: 4 },
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            filename: bufferOptions.filename || `buffer_${i + 1}`,
            processingInfo: {
              audioLength: buffer.length,
              sampleRate: config.sampleRate || 44100,
              processingTime: Date.now(),
              algorithmsUsed: [],
              pluginsUsed: []
            }
          }
        });
      }
    }
    
    if (workerState.isCancelled()) {
      return;
    }
    
    reportProgress(messageId, 100, 100, 'Batch processing complete');
    reportResult(messageId, results);
    
    await parser.cleanup();
  } catch (error) {
    reportError(messageId, error instanceof Error ? error : new Error('Unknown error'));
  }
}

// Handle worker cancellation
function handleCancel(): void {
  workerState.cancel();
}

// Main message handler
async function handleMessage(event: MessageEvent<WorkerMessage>): Promise<void> {
  const { id, type, payload } = event.data;
  
  // Reset state for new operations
  if (type !== 'cancel') {
    workerState.reset();
  }
  
  try {
    switch (type) {
      case 'parse-buffer': {
        const { audioData, options, config } = (payload as ParseBufferMessage['payload'])!;
        await processBuffer(id, audioData, options, config);
        break;
      }
      
      case 'parse-stream': {
        const { chunks, options, config } = (payload as ParseStreamMessage['payload'])!;
        await processStream(id, chunks, options, config);
        break;
      }
      
      case 'batch-process': {
        const { audioBuffers, options, config } = (payload as BatchProcessMessage['payload'])!;
        await processBatch(id, audioBuffers, options, config);
        break;
      }
      
      case 'cancel': {
        handleCancel();
        break;
      }
      
      default: {
        reportError(id, new Error(`Unknown message type: ${type}`));
      }
    }
  } catch (error) {
    reportError(id, error instanceof Error ? error : new Error('Unknown error'));
  }
}

// Set up worker message handling
if (typeof self !== 'undefined') {
  self.addEventListener('message', handleMessage);
} else if (typeof addEventListener !== 'undefined') {
  addEventListener('message', handleMessage);
}

// Types are already exported above as interfaces