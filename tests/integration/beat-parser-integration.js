#!/usr/bin/env node

/**
 * Complete Beat Parser Test with Audio Decoding
 * Demonstrates full functionality with real audio files
 */

import decode from 'audio-decode';
import { BeatParser } from '../../dist/index.esm.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

/**
 * Complete beat parsing with audio decoding
 */
async function parseMusicFile(filePath, options = {}) {
  console.log(`\n${colors.bright}${colors.blue}🎵 Complete Beat Parser Test${colors.reset}`);
  console.log(`${colors.yellow}File:${colors.reset} ${filePath}`);
  console.log('=' .repeat(60));
  
  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`${colors.red}❌ File not found: ${filePath}${colors.reset}`);
    return null;
  }
  
  // File info
  const stats = fs.statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const format = path.extname(filePath).substring(1).toUpperCase();
  
  console.log(`${colors.blue}📊 File Info:${colors.reset}`);
  console.log(`  • Size: ${fileSizeMB} MB`);
  console.log(`  • Format: ${format}`);
  
  try {
    // Step 1: Decode audio file
    console.log(`\n${colors.yellow}Step 1: Decoding audio file...${colors.reset}`);
    const startDecode = Date.now();
    
    const fileBuffer = fs.readFileSync(filePath);
    const audioBuffer = await decode(fileBuffer);
    
    const decodeTime = Date.now() - startDecode;
    console.log(`${colors.green}✓ Audio decoded in ${decodeTime}ms${colors.reset}`);
    console.log(`  • Sample Rate: ${audioBuffer.sampleRate} Hz`);
    console.log(`  • Duration: ${audioBuffer.duration.toFixed(2)} seconds`);
    console.log(`  • Channels: ${audioBuffer.numberOfChannels}`);
    
    // Step 2: Convert to Float32Array (mono)
    console.log(`\n${colors.yellow}Step 2: Converting to mono Float32Array...${colors.reset}`);
    let audioData;
    
    if (audioBuffer.numberOfChannels === 1) {
      audioData = audioBuffer.getChannelData(0);
    } else {
      // Mix stereo to mono
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      audioData = new Float32Array(left.length);
      
      for (let i = 0; i < left.length; i++) {
        audioData[i] = (left[i] + right[i]) / 2;
      }
    }
    
    console.log(`${colors.green}✓ Converted to mono: ${audioData.length} samples${colors.reset}`);
    
    // Step 3: Parse beats
    console.log(`\n${colors.yellow}Step 3: Detecting beats...${colors.reset}`);
    const startParse = Date.now();
    
    const parser = new BeatParser({
      sampleRate: audioBuffer.sampleRate,
      enablePreprocessing: true,
      enableNormalization: true
    });
    
    const result = await parser.parseBuffer(audioData, {
      targetPictureCount: options.pictureCount || 10,
      selectionMethod: options.method || 'adaptive',
      minConfidence: options.minConfidence || 0.5,
      filename: path.basename(filePath),
      ...options
    });
    
    const parseTime = Date.now() - startParse;
    console.log(`${colors.green}✓ Beats detected in ${parseTime}ms${colors.reset}`);
    
    // Cleanup
    await parser.cleanup();
    
    // Display results
    console.log(`\n${colors.bright}${colors.green}═══ Analysis Complete ═══${colors.reset}`);
    console.log(`\n${colors.bright}📈 Results:${colors.reset}`);
    console.log(`  • Beats Detected: ${colors.green}${result.beats.length}${colors.reset}`);
    console.log(`  • Total Processing: ${colors.blue}${decodeTime + parseTime}ms${colors.reset}`);
    console.log(`  • Processing Speed: ${colors.magenta}${(fileSizeMB / ((decodeTime + parseTime) / 1000)).toFixed(2)} MB/s${colors.reset}`);
    
    // Tempo
    if (result.tempo) {
      console.log(`\n${colors.bright}🎵 Tempo Analysis:${colors.reset}`);
      console.log(`  • BPM: ${colors.magenta}${result.tempo.bpm.toFixed(1)}${colors.reset}`);
      console.log(`  • Confidence: ${colors.yellow}${(result.tempo.confidence * 100).toFixed(1)}%${colors.reset}`);
      
      if (result.tempo.timeSignature) {
        console.log(`  • Time Signature: ${colors.blue}${result.tempo.timeSignature.numerator}/${result.tempo.timeSignature.denominator}${colors.reset}`);
      }
    }
    
    // Beat statistics
    if (result.beats.length > 0) {
      const avgConfidence = result.beats.reduce((sum, b) => sum + b.confidence, 0) / result.beats.length;
      const avgStrength = result.beats.reduce((sum, b) => sum + b.strength, 0) / result.beats.length;
      
      console.log(`\n${colors.bright}📊 Beat Statistics:${colors.reset}`);
      console.log(`  • Average Confidence: ${colors.yellow}${(avgConfidence * 100).toFixed(1)}%${colors.reset}`);
      console.log(`  • Average Strength: ${colors.blue}${avgStrength.toFixed(3)}${colors.reset}`);
      
      // Calculate intervals
      if (result.beats.length > 1) {
        const intervals = [];
        for (let i = 1; i < result.beats.length; i++) {
          intervals.push(result.beats[i].timestamp - result.beats[i-1].timestamp);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        
        console.log(`  • Average Interval: ${colors.green}${avgInterval.toFixed(0)}ms${colors.reset}`);
        console.log(`  • Calculated BPM: ${colors.magenta}${(60000 / avgInterval).toFixed(1)}${colors.reset}`);
      }
    }
    
    // Show first few beats
    console.log(`\n${colors.bright}🎯 Beat Timeline (first 8):${colors.reset}`);
    const beatsToShow = Math.min(8, result.beats.length);
    
    for (let i = 0; i < beatsToShow; i++) {
      const beat = result.beats[i];
      const time = (beat.timestamp / 1000).toFixed(2);
      const confidence = (beat.confidence * 100).toFixed(0);
      const strengthBar = '█'.repeat(Math.round(beat.strength * 10));
      
      console.log(`  ${String(i + 1).padStart(2)}. ${time.padStart(6)}s  [${confidence.padStart(3)}%] ${colors.green}${strengthBar}${colors.reset}`);
    }
    
    if (result.beats.length > beatsToShow) {
      console.log(`  ... and ${result.beats.length - beatsToShow} more beats`);
    }
    
    // Save option
    if (options.save) {
      const outputFile = filePath.replace(path.extname(filePath), '_beats_complete.json');
      const outputData = {
        file: path.basename(filePath),
        format: format,
        fileSize: fileSizeMB + ' MB',
        processedAt: new Date().toISOString(),
        processing: {
          decodingTime: decodeTime + 'ms',
          parsingTime: parseTime + 'ms',
          totalTime: (decodeTime + parseTime) + 'ms'
        },
        audio: {
          sampleRate: audioBuffer.sampleRate,
          duration: audioBuffer.duration,
          channels: audioBuffer.numberOfChannels,
          samples: audioData.length
        },
        analysis: {
          tempo: result.tempo,
          beatCount: result.beats.length,
          beats: result.beats,
          metadata: result.metadata
        }
      };
      
      fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
      console.log(`\n${colors.green}💾 Complete results saved to: ${outputFile}${colors.reset}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Error:${colors.reset}`, error.message);
    if (options.debug) {
      console.error(`${colors.yellow}Stack:${colors.reset}`, error.stack);
    }
    return null;
  }
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.bright}${colors.blue}🎵 Beat Parser - Complete Test with Audio Decoding${colors.reset}

This demonstrates the complete beat parsing pipeline with real audio file decoding.

${colors.yellow}Usage:${colors.reset}
  node test-beat-parser-complete.js <music-file> [options]

${colors.yellow}Options:${colors.reset}
  --pictures <n>     Number of beats to select (default: 10)
  --method <type>    Selection method: uniform, adaptive, energy (default: adaptive)
  --confidence <n>   Minimum confidence 0-1 (default: 0.5)
  --save            Save complete results to JSON
  --debug           Show detailed error information
  --help            Show this help

${colors.yellow}Examples:${colors.reset}
  node test-beat-parser-complete.js ./music/summer-vibes-158665.mp3
  node test-beat-parser-complete.js song.wav --pictures 20 --save
  node test-beat-parser-complete.js track.flac --method energy --confidence 0.7

${colors.green}✅ Supported Formats:${colors.reset}
  MP3, WAV, FLAC, OGG, OPUS

${colors.bright}Features:${colors.reset}
  • Real audio file decoding using audio-decode library
  • Complete beat detection and analysis
  • Tempo and time signature detection
  • Detailed statistics and metrics
  • JSON export capability
    `);
    return;
  }
  
  const musicFile = args[0];
  const options = {};
  
  // Parse options
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
      case '--debug':
        options.debug = true;
        break;
    }
  }
  
  console.log(`${colors.bright}${colors.magenta}🚀 Beat Parser Complete Test${colors.reset}`);
  console.log(`${colors.yellow}Real audio file processing with audio-decode library${colors.reset}`);
  
  const result = await parseMusicFile(musicFile, options);
  
  if (result) {
    console.log(`\n${colors.bright}${colors.green}✨ Success! Beat parsing completed.${colors.reset}`);
    console.log(`${colors.blue}The beat parser now works with real audio files!${colors.reset}`);
  } else {
    console.log(`\n${colors.red}Test failed. Please check the errors above.${colors.reset}`);
    process.exit(1);
  }
}

// Run
main().catch(console.error);

export { parseMusicFile };