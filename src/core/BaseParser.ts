/**
 * Base parser class that provides common functionality for parser implementations
 */

import type { AudioData, ParseOptions, ParseResult, Parser } from '../types';
import { validateAudioData, validateParseOptions } from '../utils';

export abstract class BaseParser implements Parser {
  protected readonly name: string;
  protected readonly version: string;

  constructor(name: string, version: string) {
    this.name = name;
    this.version = version;
  }

  /**
   * Get parser name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get parser version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Parse audio data - must be implemented by subclasses
   */
  abstract parse(
    audioData: AudioData,
    options?: ParseOptions
  ): Promise<ParseResult>;

  /**
   * Validate and prepare audio data for processing
   */
  protected validateAndPrepareData(
    audioData: AudioData,
    options?: ParseOptions
  ): { data: Float32Array; options: Required<ParseOptions> } {
    validateAudioData(audioData);
    const validatedOptions = validateParseOptions(options);

    // Convert to Float32Array if needed
    const data =
      audioData instanceof Float32Array
        ? audioData
        : new Float32Array(audioData);

    return { data, options: validatedOptions };
  }

  /**
   * Create timing metadata for results
   */
  protected createMetadata(
    startTime: number,
    samplesProcessed: number,
    options: ParseOptions
  ): ParseResult['metadata'] {
    return {
      processingTime: Date.now() - startTime,
      samplesProcessed,
      parameters: options,
    };
  }
}
