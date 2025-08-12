/**
 * Basic usage examples for the BeatParser library
 */

import BeatParser, { BeatParserPlugin } from '../index';

// Example 1: Basic usage with default settings
export async function basicExample() {
  const parser = new BeatParser();
  
  try {
    // Create simple test audio data
    const audioData = createTestAudio();
    const result = await parser.parseBuffer(audioData, {
      targetPictureCount: 10
    });
    
    console.log(`Found ${result.beats.length} beats:`);
    result.beats.forEach((beat, index) => {
      console.log(`Beat ${index + 1}: ${beat.timestamp.toFixed(2)}s (confidence: ${beat.confidence.toFixed(2)})`);
    });
    
    return result;
  } finally {
    await parser.cleanup();
  }
}

// Example 2: Custom configuration for electronic music
export async function electronicMusicExample() {
  const parser = new BeatParser({
    minTempo: 120,
    maxTempo: 140,
    genreAdaptive: true,
    multiPassEnabled: true,
    confidenceThreshold: 0.7
  });
  
  try {
    const audioData = createTestAudio();
    const result = await parser.parseBuffer(audioData, {
      targetPictureCount: 16,
      selectionMethod: 'adaptive'
    });
    
    return result;
  } finally {
    await parser.cleanup();
  }
}

// Example 3: Processing audio buffer from memory
export async function bufferProcessingExample() {
  const parser = new BeatParser();
  
  // Create test audio data (sine wave with beats)
  const duration = 5; // 5 seconds
  const sampleRate = 44100;
  const audioData = new Float32Array(duration * sampleRate);
  
  for (let i = 0; i < audioData.length; i++) {
    const t = i / sampleRate;
    
    // Add beat every 0.5 seconds (120 BPM)
    if (t % 0.5 < 0.05) {
      audioData[i] = Math.sin(2 * Math.PI * 60 * (t % 0.5) * 20) * 0.8;
    } else {
      audioData[i] = Math.sin(2 * Math.PI * 440 * t) * 0.1; // Background tone
    }
  }
  
  try {
    const result = await parser.parseBuffer(audioData, {
      targetPictureCount: 8
    });
    
    console.log('Processed audio buffer:', {
      duration: `${duration}s`,
      beatsFound: result.beats.length,
      averageConfidence: result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length
    });
    
    return result;
  } finally {
    await parser.cleanup();
  }
}

// Example 4: Plugin system usage
export async function pluginExample() {
  // Create a custom plugin that enhances beat detection
  const beatEnhancerPlugin: BeatParserPlugin = {
    name: 'beat-enhancer',
    version: '1.0.0',
    
    initialize: async (config) => {
      console.log('Beat enhancer plugin initialized with config:', config.sampleRate);
    },
    
    processBeats: async (beats) => {
      // Boost confidence for beats with high strength
      return beats.map(beat => ({
        ...beat,
        confidence: Math.min(beat.confidence * 1.2, 1)
      }));
    },
    
    cleanup: async () => {
      console.log('Beat enhancer plugin cleaned up');
    }
  };
  
  const parser = new BeatParser();
  parser.addPlugin(beatEnhancerPlugin);
  
  try {
    const result = await parser.parseBuffer(createTestAudio(), {
      targetPictureCount: 5
    });
    
    console.log('Plugin processing result:', {
      pluginsUsed: parser.getPlugins(),
      beatsDetected: result.beats.length
    });
    
    return result;
  } finally {
    await parser.cleanup();
  }
}

// Example 5: Advanced configuration and error handling
export async function advancedExample() {
  const parser = new BeatParser({
    // Audio processing
    sampleRate: 44100,
    frameSize: 4096,
    hopSize: 1024,
    
    // Algorithm weights
    onsetWeight: 0.5,
    tempoWeight: 0.3,
    spectralWeight: 0.2,
    
    // Advanced features
    multiPassEnabled: true,
    genreAdaptive: true,
    
    // Output configuration
    outputFormat: 'json',
    includeMetadata: true,
    includeConfidenceScores: true
  });
  
  try {
    const fallbackAudio = createTestAudio();
    const result = await parser.parseBuffer(fallbackAudio, {
      targetPictureCount: 10,
      selectionMethod: 'adaptive'
    });
    
    console.log('Advanced processing successful');
    return result;
  } finally {
    await parser.cleanup();
  }
}

// Utility function
function createTestAudio(duration = 3): Float32Array {
  const sampleRate = 44100;
  const audio = new Float32Array(duration * sampleRate);
  
  for (let i = 0; i < audio.length; i++) {
    const t = i / sampleRate;
    
    // Simple beat pattern
    if (t % 0.5 < 0.05) { // Beat every 0.5 seconds
      audio[i] = Math.sin(2 * Math.PI * 60 * (t % 0.05) * 20) * 0.8;
    } else {
      audio[i] = Math.sin(2 * Math.PI * 220 * t) * 0.05; // Background
    }
  }
  
  return audio;
}

// Example usage:
if (typeof require !== 'undefined' && require.main === module) {
  (async () => {
    try {
      console.log('Running basic example...');
      await bufferProcessingExample();
      
      console.log('\nRunning plugin example...');
      await pluginExample();
      
      console.log('\nAll examples completed successfully!');
    } catch (error) {
      console.error('Example failed:', error);
    }
  })();
}