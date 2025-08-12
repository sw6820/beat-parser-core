/**
 * Audio Loading Examples
 * Demonstrates the enhanced audio decoding capabilities of AudioProcessor
 * with audio-decode library integration
 */

import { AudioProcessor } from '../core/AudioProcessor';
import type { AudioBuffer } from '../types';

// Example 1: Basic file loading with auto-detection
export async function basicFileLoading() {
  console.log('=== Basic File Loading Example ===');
  
  try {
    // Load MP3 file with default options
    const audioBuffer = await AudioProcessor.loadFile('./audio/sample.mp3');
    
    console.log('Audio loaded successfully:');
    console.log(`- Duration: ${audioBuffer.duration.toFixed(2)}s`);
    console.log(`- Sample Rate: ${audioBuffer.sampleRate}Hz`);
    console.log(`- Channels: ${audioBuffer.channels}`);
    console.log(`- Samples: ${audioBuffer.data.length}`);
    
    return audioBuffer;
  } catch (error) {
    console.error('Failed to load audio:', error);
    throw error;
  }
}

// Example 2: Advanced loading with options
export async function advancedFileLoading() {
  console.log('=== Advanced File Loading Example ===');
  
  const options = {
    normalize: true,           // Normalize audio to [-1, 1] range
    forceMono: true,          // Convert to mono
    targetSampleRate: 44100,  // Resample to 44.1kHz
    debug: true,              // Enable detailed logging
    preferredDecoder: 'audio-decode' as const
  };
  
  try {
    const audioBuffer = await AudioProcessor.loadFile('./audio/complex.flac', options);
    
    console.log('Advanced audio loading completed:');
    console.log(`- Format: FLAC (decoded with audio-decode library)`);
    console.log(`- Duration: ${audioBuffer.duration.toFixed(2)}s`);
    console.log(`- Sample Rate: ${audioBuffer.sampleRate}Hz`);
    console.log(`- Normalized: Yes`);
    
    return audioBuffer;
  } catch (error) {
    console.error('Advanced loading failed:', error);
    throw error;
  }
}

// Example 3: Multiple format support demonstration
export async function multiFormatDemo() {
  console.log('=== Multi-Format Support Demo ===');
  
  const formats = [
    { file: './audio/sample.mp3', name: 'MP3' },
    { file: './audio/sample.wav', name: 'WAV' },
    { file: './audio/sample.flac', name: 'FLAC' },
    { file: './audio/sample.ogg', name: 'OGG Vorbis' },
    { file: './audio/sample.m4a', name: 'M4A/AAC' },
  ];
  
  const results: { format: string; success: boolean; duration?: number; error?: string }[] = [];
  
  for (const format of formats) {
    try {
      const audioBuffer = await AudioProcessor.loadFile(format.file, { debug: false });
      results.push({
        format: format.name,
        success: true,
        duration: audioBuffer.duration
      });
      console.log(`✅ ${format.name}: ${audioBuffer.duration.toFixed(2)}s`);
    } catch (error) {
      results.push({
        format: format.name,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(`❌ ${format.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return results;
}

// Example 4: Buffer loading (browser/fetch scenario)
export async function bufferLoadingExample() {
  console.log('=== Buffer Loading Example ===');
  
  try {
    // Simulate fetching audio data from a URL
    // In a real browser environment, you might use fetch()
    const fs = await import('fs');
    const fileBuffer = fs.readFileSync('./audio/sample.mp3');
    
    // Convert Node.js Buffer to ArrayBuffer for demonstration
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );
    
    // Load from ArrayBuffer
    const audioBuffer = await AudioProcessor.loadAudio(arrayBuffer, { debug: true });
    
    console.log('Buffer loading completed:');
    console.log(`- Source: ArrayBuffer (${arrayBuffer.byteLength} bytes)`);
    console.log(`- Duration: ${audioBuffer.duration.toFixed(2)}s`);
    
    return audioBuffer;
  } catch (error) {
    console.error('Buffer loading failed:', error);
    throw error;
  }
}

// Example 5: Error handling and fallback strategies
export async function errorHandlingExample() {
  console.log('=== Error Handling Example ===');
  
  const testCases = [
    { file: './audio/nonexistent.mp3', expect: 'File not found' },
    { file: './audio/corrupted.mp3', expect: 'Decode error' },
    { file: './audio/unsupported.xyz', expect: 'Unsupported format' },
  ];
  
  for (const testCase of testCases) {
    try {
      await AudioProcessor.loadFile(testCase.file);
      console.log(`❌ Expected error for ${testCase.file}, but succeeded`);
    } catch (error) {
      console.log(`✅ Expected error for ${testCase.file}: ${error instanceof Error ? error.name : 'Unknown error'}`);
      
      // Demonstrate error type checking
      if (error instanceof AudioProcessor.AudioLoadError) {
        console.log(`   - Load Error: ${error.message}`);
      } else if (error instanceof AudioProcessor.AudioFormatError) {
        console.log(`   - Format Error: ${error.message}`);
        console.log(`   - Format: ${error.format}`);
      }
    }
  }
}

// Example 6: Performance comparison between decoders
export async function performanceComparison() {
  console.log('=== Performance Comparison Example ===');
  
  const testFile = './audio/sample.mp3';
  const decoders: Array<{ name: string; decoder: 'audio-decode' | 'web-audio' | 'manual' }> = [
    { name: 'audio-decode library', decoder: 'audio-decode' },
    { name: 'Web Audio API', decoder: 'web-audio' },
    { name: 'Manual decoding', decoder: 'manual' }
  ];
  
  const results = [];
  
  for (const { name, decoder } of decoders) {
    try {
      const startTime = performance.now();
      await AudioProcessor.loadFile(testFile, { 
        preferredDecoder: decoder,
        debug: false 
      });
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      results.push({ decoder: name, time: duration, success: true });
      console.log(`✅ ${name}: ${duration.toFixed(2)}ms`);
    } catch (error) {
      results.push({ decoder: name, success: false, error: error instanceof Error ? error.message : String(error) });
      console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return results;
}

// Example 7: Feature extraction with loaded audio
export async function featureExtractionExample() {
  console.log('=== Feature Extraction Example ===');
  
  try {
    const audioBuffer = await AudioProcessor.loadFile('./audio/sample.wav', { 
      normalize: true,
      debug: false 
    });
    
    // Extract basic audio features
    const features = AudioProcessor.extractFeatures(audioBuffer.data, audioBuffer.sampleRate);
    
    console.log('Audio Features:');
    console.log(`- RMS Energy: ${features.rms.toFixed(4)}`);
    console.log(`- Spectral Centroid: ${features.spectralCentroid.toFixed(2)}Hz`);
    console.log(`- Zero Crossing Rate: ${features.zcr.toFixed(4)}`);
    console.log(`- Spectral Rolloff: ${features.spectralRolloff.toFixed(2)}Hz`);
    
    return { audioBuffer, features };
  } catch (error) {
    console.error('Feature extraction failed:', error);
    throw error;
  }
}

// Example 8: Streaming audio processing (for large files)
export async function streamingExample() {
  console.log('=== Streaming Audio Processing Example ===');
  
  try {
    const audioBuffer = await AudioProcessor.loadFile('./audio/large-sample.wav', {
      useStreaming: true,
      debug: true
    });
    
    console.log('Processing audio in chunks...');
    let chunkCount = 0;
    
    // Process audio in streaming chunks
    for await (const chunk of AudioProcessor.streamAudio(audioBuffer.data, 1024 * 64)) {
      chunkCount++;
      
      // Process each chunk (example: calculate RMS)
      const chunkRMS = AudioProcessor.extractFeatures(chunk.data, audioBuffer.sampleRate).rms;
      
      console.log(`Chunk ${chunk.index}: ${chunk.startTime.toFixed(2)}s-${(chunk.startTime + chunk.duration).toFixed(2)}s, RMS: ${chunkRMS.toFixed(4)}`);
      
      if (chunk.isFinal) {
        console.log(`Streaming completed. Processed ${chunkCount} chunks.`);
        break;
      }
    }
    
    return { audioBuffer, chunkCount };
  } catch (error) {
    console.error('Streaming processing failed:', error);
    throw error;
  }
}

// Complete demo function
export async function runAllExamples() {
  console.log('🎵 Enhanced Audio Decoding Examples 🎵\n');
  
  try {
    await basicFileLoading();
    console.log('\n');
    
    await advancedFileLoading();
    console.log('\n');
    
    await multiFormatDemo();
    console.log('\n');
    
    await bufferLoadingExample();
    console.log('\n');
    
    await errorHandlingExample();
    console.log('\n');
    
    await performanceComparison();
    console.log('\n');
    
    await featureExtractionExample();
    console.log('\n');
    
    await streamingExample();
    console.log('\n');
    
    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Examples failed:', error);
  }
}

// Export utility function to check format support
export function checkFormatSupport(extension: string): {
  supported: boolean;
  category: string;
  confidence: number;
} {
  // Use the private method via a simple test
  try {
    // This is a bit hacky, but demonstrates the format detection
    const formats = {
      'mp3': { category: 'primary', confidence: 0.9 },
      'wav': { category: 'primary', confidence: 0.9 },
      'flac': { category: 'primary', confidence: 0.9 },
      'ogg': { category: 'primary', confidence: 0.9 },
      'opus': { category: 'primary', confidence: 0.9 },
      'm4a': { category: 'partial', confidence: 0.6 },
      'aac': { category: 'partial', confidence: 0.6 },
      'webm': { category: 'fallback', confidence: 0.4 }
    };
    
    const formatInfo = formats[extension.toLowerCase() as keyof typeof formats];
    
    return {
      supported: Boolean(formatInfo),
      category: formatInfo?.category || 'unsupported',
      confidence: formatInfo?.confidence || 0
    };
  } catch {
    return { supported: false, category: 'unsupported', confidence: 0 };
  }
}

// Usage information
export const USAGE_INFO = {
  supportedFormats: {
    primary: ['MP3', 'WAV', 'FLAC', 'OGG Vorbis', 'OPUS'],
    partial: ['M4A', 'AAC', 'ALAC'],
    fallback: ['WebM']
  },
  decoders: {
    'audio-decode': 'Primary decoder with broad format support',
    'web-audio': 'Browser-based decoder for standard formats',
    'manual': 'Basic WAV decoder for Node.js fallback'
  },
  options: {
    normalize: 'Normalize audio amplitude to [-1, 1] range',
    forceMono: 'Convert multi-channel audio to mono',
    targetSampleRate: 'Resample audio to specified rate',
    debug: 'Enable detailed logging during loading',
    preferredDecoder: 'Force use of specific decoder',
    useStreaming: 'Process large files in chunks'
  }
};