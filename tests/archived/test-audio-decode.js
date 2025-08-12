#!/usr/bin/env node

/**
 * Audio Decoding Test Script for Beat Parser
 * Tests the new audio decoding functionality with real music files
 */

import { BeatParser } from './dist/index.esm.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color output for better visibility
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

async function testAudioDecoding(filePath, options = {}) {
  console.log(`\n${colors.bright}${colors.blue}🎵 Testing Audio Decoding${colors.reset}`);
  console.log(`${colors.yellow}File:${colors.reset} ${filePath}`);
  console.log('=' .repeat(50));
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`${colors.red}❌ Error: File not found: ${filePath}${colors.reset}`);
    return false;
  }
  
  // Get file info
  const stats = fs.statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`${colors.blue}📊 File Size:${colors.reset} ${fileSizeMB} MB`);
  console.log(`${colors.blue}📄 Format:${colors.reset} ${path.extname(filePath).substring(1).toUpperCase()}`);
  
  const parser = new BeatParser({
    sampleRate: 44100,
    enablePreprocessing: true,
    enableNormalization: true
  });
  
  const startTime = Date.now();
  
  try {
    console.log(`\n${colors.yellow}⏳ Processing with audio-decode library...${colors.reset}`);
    
    // Use the new parseFile method with audio decoding
    const result = await parser.parseFile(filePath, {
      targetPictureCount: options.pictureCount || 10,
      selectionMethod: options.method || 'adaptive',
      minConfidence: options.minConfidence || 0.5,
      ...options
    });
    
    const processingTime = Date.now() - startTime;
    
    // Display Results
    console.log(`\n${colors.green}✅ Audio Decoding & Processing Complete!${colors.reset}`);
    console.log('=' .repeat(50));
    
    // Basic Info
    console.log(`\n${colors.bright}📈 Analysis Results:${colors.reset}`);
    console.log(`  • Beats Detected: ${colors.green}${result.beats.length}${colors.reset}`);
    console.log(`  • Processing Time: ${colors.blue}${processingTime}ms${colors.reset}`);
    console.log(`  • Processing Speed: ${colors.magenta}${(fileSizeMB / (processingTime / 1000)).toFixed(2)} MB/s${colors.reset}`);
    
    // Tempo Info
    if (result.tempo) {
      console.log(`  • Tempo: ${colors.magenta}${result.tempo.bpm.toFixed(1)} BPM${colors.reset}`);
      console.log(`  • Tempo Confidence: ${colors.yellow}${(result.tempo.confidence * 100).toFixed(1)}%${colors.reset}`);
      
      if (result.tempo.timeSignature) {
        console.log(`  • Time Signature: ${colors.blue}${result.tempo.timeSignature.numerator}/${result.tempo.timeSignature.denominator}${colors.reset}`);
      }
    }
    
    // Beat Statistics
    if (result.beats.length > 0) {
      const avgConfidence = result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length;
      const avgStrength = result.beats.reduce((sum, b) => sum + b.strength, 0) / result.beats.length;
      
      console.log(`\n${colors.bright}📊 Beat Statistics:${colors.reset}`);
      console.log(`  • Average Confidence: ${colors.yellow}${(avgConfidence * 100).toFixed(1)}%${colors.reset}`);
      console.log(`  • Average Strength: ${colors.blue}${avgStrength.toFixed(3)}${colors.reset}`);
      
      // Beat intervals
      if (result.beats.length > 1) {
        const intervals = [];
        for (let i = 1; i < result.beats.length; i++) {
          intervals.push(result.beats[i].timestamp - result.beats[i-1].timestamp);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const minInterval = Math.min(...intervals);
        const maxInterval = Math.max(...intervals);
        
        console.log(`  • Average Beat Interval: ${colors.green}${avgInterval.toFixed(0)}ms${colors.reset}`);
        console.log(`  • Interval Range: ${colors.magenta}${minInterval.toFixed(0)}ms - ${maxInterval.toFixed(0)}ms${colors.reset}`);
      }
    }
    
    // Beat Timeline (first 10)
    console.log(`\n${colors.bright}🎯 Beat Timeline (first 10):${colors.reset}`);
    const beatsToShow = Math.min(10, result.beats.length);
    
    for (let i = 0; i < beatsToShow; i++) {
      const beat = result.beats[i];
      const time = (beat.timestamp / 1000).toFixed(2);
      const confidence = (beat.confidence * 100).toFixed(0);
      const strengthBar = '█'.repeat(Math.round(beat.strength * 10));
      
      console.log(`  ${String(i + 1).padStart(2)}. ${time.padStart(6)}s  [${confidence}%] ${colors.green}${strengthBar}${colors.reset}`);
    }
    
    if (result.beats.length > 10) {
      console.log(`  ... and ${result.beats.length - 10} more beats`);
    }
    
    // Audio Decoding Info
    console.log(`\n${colors.bright}🔧 Audio Decoding Info:${colors.reset}`);
    console.log(`  • Decoder Used: ${colors.blue}audio-decode library${colors.reset}`);
    console.log(`  • Format Support: ${colors.green}✓ Native decoding${colors.reset}`);
    
    if (result.metadata) {
      console.log(`  • Samples Processed: ${colors.blue}${result.metadata.samplesProcessed?.toLocaleString() || 'N/A'}${colors.reset}`);
      if (result.metadata.processingInfo) {
        console.log(`  • Sample Rate: ${colors.yellow}${result.metadata.processingInfo.sampleRate} Hz${colors.reset}`);
        console.log(`  • Audio Length: ${colors.magenta}${result.metadata.processingInfo.audioLength?.toFixed(2)} seconds${colors.reset}`);
      }
    }
    
    // Save results option
    if (options.save) {
      const outputFile = filePath.replace(path.extname(filePath), '_beats.json');
      const outputData = {
        file: path.basename(filePath),
        processedAt: new Date().toISOString(),
        processingTime: processingTime,
        decoder: 'audio-decode',
        tempo: result.tempo,
        beatCount: result.beats.length,
        beats: result.beats,
        metadata: result.metadata
      };
      
      fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
      console.log(`\n${colors.green}💾 Results saved to: ${outputFile}${colors.reset}`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Error processing file:${colors.reset}`, error.message);
    console.error(`${colors.yellow}Stack trace:${colors.reset}`, error.stack);
    return false;
  } finally {
    await parser.cleanup();
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.bright}${colors.blue}🎵 Beat Parser - Audio Decoding Test${colors.reset}

This script tests the audio decoding functionality using the audio-decode library.

${colors.yellow}Usage:${colors.reset}
  node test-audio-decode.js <music-file> [options]

${colors.yellow}Options:${colors.reset}
  --pictures <n>     Number of pictures/beats to select (default: 10)
  --method <type>    Selection method: uniform, adaptive, energy, regular (default: adaptive)
  --confidence <n>   Minimum confidence threshold 0-1 (default: 0.5)
  --save            Save results to JSON file
  --help            Show this help message

${colors.yellow}Examples:${colors.reset}
  node test-audio-decode.js ./music/summer-vibes-158665.mp3
  node test-audio-decode.js song.wav --pictures 20
  node test-audio-decode.js track.mp3 --method energy --save
  node test-audio-decode.js music.flac --confidence 0.7 --pictures 15

${colors.yellow}Supported Formats:${colors.reset}
  ${colors.green}✓${colors.reset} MP3, WAV, FLAC, OGG, OPUS - Full support via audio-decode
  ${colors.yellow}⚠${colors.reset} M4A, AAC - Partial support (may require fallback)
  ${colors.blue}→${colors.reset} WebM - Browser-only via Web Audio API

${colors.bright}Features:${colors.reset}
  • Real audio file decoding (not synthetic)
  • Multiple format support
  • Cross-platform compatibility
  • Detailed performance metrics
    `);
    return;
  }
  
  const musicFile = args[0];
  const options = {};
  
  // Parse command line options
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--pictures':
        options.pictureCount = parseInt(args[++i]);
        break;
      case '--method':
        options.method = args[++i];
        break;
      case '--confidence':
        options.minConfidence = parseFloat(args[++i]);
        break;
      case '--save':
        options.save = true;
        break;
    }
  }
  
  console.log(`${colors.bright}${colors.magenta}🚀 Beat Parser with Audio Decoding${colors.reset}`);
  console.log(`${colors.yellow}Using audio-decode library for real audio file processing${colors.reset}`);
  
  const success = await testAudioDecoding(musicFile, options);
  
  if (success) {
    console.log(`\n${colors.green}✨ Test completed successfully!${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ Test failed. Please check the error messages above.${colors.reset}`);
    process.exit(1);
  }
}

// Run if called directly
main().catch(console.error);

export { testAudioDecoding };