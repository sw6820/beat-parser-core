#!/usr/bin/env node

/**
 * Simple Local Music Testing Script for Beat Parser
 * Tests the beat parser with audio files using the simplest approach
 */

import { BeatParser } from './dist/index.esm.js';

async function testMusic(filePath) {
  console.log('\n🎵 Testing Beat Parser with:', filePath);
  console.log('=' .repeat(50));
  
  const parser = new BeatParser();
  
  try {
    // Create a simple audio buffer for testing
    // In a real scenario, you'd load and decode the audio file
    // For now, let's create synthetic audio data
    const sampleRate = 44100;
    const duration = 5; // 5 seconds
    const numSamples = sampleRate * duration;
    const audioData = new Float32Array(numSamples);
    
    // Generate a simple beat pattern (4/4 at 120 BPM)
    const bpm = 120;
    const beatInterval = (60 / bpm) * sampleRate; // samples per beat
    
    for (let i = 0; i < numSamples; i++) {
      // Create impulses at beat positions
      if (i % beatInterval < 100) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
      } else {
        audioData[i] = 0;
      }
    }
    
    console.log('⏳ Processing synthetic audio data...');
    const startTime = Date.now();
    
    const result = await parser.parseBuffer(audioData, {
      targetPictureCount: 10,
      selectionMethod: 'adaptive'
    });
    
    const processingTime = Date.now() - startTime;
    
    console.log('\n✅ Processing Complete!');
    console.log('=' .repeat(50));
    console.log('\n📊 Results:');
    console.log(`  • Beats Detected: ${result.beats ? result.beats.length : 0}`);
    console.log(`  • Processing Time: ${processingTime}ms`);
    
    if (result.tempo) {
      console.log(`  • Tempo: ${result.tempo.bpm ? result.tempo.bpm.toFixed(1) : 'N/A'} BPM`);
      console.log(`  • Tempo Confidence: ${result.tempo.confidence ? (result.tempo.confidence * 100).toFixed(1) : 'N/A'}%`);
    }
    
    if (result.beats && result.beats.length > 0) {
      console.log('\n🎯 First 5 Beats:');
      result.beats.slice(0, 5).forEach((beat, i) => {
        const time = beat.timestamp ? (beat.timestamp / 1000).toFixed(2) : 'N/A';
        const conf = beat.confidence ? (beat.confidence * 100).toFixed(0) : 'N/A';
        console.log(`  ${i + 1}. Time: ${time}s, Confidence: ${conf}%`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await parser.cleanup();
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
🎵 Beat Parser - Simple Test Script

This is a simplified test that uses synthetic audio data.
To test with real audio files, you'll need to add audio decoding.

Usage:
  node test-local-music-simple.js [filename]
  node test-local-music-simple.js --help

Note: Currently generates synthetic beats for testing.
    `);
    return;
  }
  
  await testMusic(args[0]);
}

main().catch(console.error);