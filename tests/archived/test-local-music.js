#!/usr/bin/env node

/**
 * Local Music Testing Script for Beat Parser
 * Test the beat parser with your own music files
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

async function testMusicFile(filePath, options = {}) {
  console.log(`\n${colors.bright}${colors.blue}🎵 Testing Music File${colors.reset}`);
  console.log(`${colors.yellow}File:${colors.reset} ${filePath}`);
  console.log('=' .repeat(50));
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`${colors.red}❌ Error: File not found: ${filePath}${colors.reset}`);
    return;
  }
  
  // Get file info
  const stats = fs.statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`${colors.blue}📊 File Size:${colors.reset} ${fileSizeMB} MB`);
  
  const parser = new BeatParser({
    sampleRate: 44100,
    enablePreprocessing: true,
    enableNormalization: true
  });
  
  const startTime = Date.now();
  
  try {
    console.log(`\n${colors.yellow}⏳ Processing...${colors.reset}`);
    
    // Read the audio file as buffer
    const fileBuffer = fs.readFileSync(filePath);
    const audioBuffer = new Float32Array(fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength));
    
    // Parse with user options
    const result = await parser.parseBuffer(audioBuffer, {
      targetPictureCount: options.pictureCount || 10,
      selectionMethod: options.method || 'adaptive',
      minConfidence: options.minConfidence || 0.5,
      filename: path.basename(filePath),
      ...options
    });
    
    const processingTime = Date.now() - startTime;
    
    // Display Results
    console.log(`\n${colors.green}✅ Processing Complete!${colors.reset}`);
    console.log('=' .repeat(50));
    
    // Basic Info
    console.log(`\n${colors.bright}📈 Analysis Results:${colors.reset}`);
    console.log(`  • Beats Detected: ${colors.green}${result.beats.length}${colors.reset}`);
    console.log(`  • Processing Time: ${colors.blue}${processingTime}ms${colors.reset}`);
    
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
    
    // Beat Timeline (first 10 and last 5)
    console.log(`\n${colors.bright}🎯 Beat Timeline:${colors.reset}`);
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
      
      // Show last 3 beats
      console.log(`\n  Last 3 beats:`);
      for (let i = result.beats.length - 3; i < result.beats.length; i++) {
        const beat = result.beats[i];
        const time = (beat.timestamp / 1000).toFixed(2);
        const confidence = (beat.confidence * 100).toFixed(0);
        
        console.log(`  ${String(i + 1).padStart(2)}. ${time.padStart(6)}s  [${confidence}%]`);
      }
    }
    
    // Save results option
    if (options.save) {
      const outputFile = filePath.replace(path.extname(filePath), '_beats.json');
      const outputData = {
        file: path.basename(filePath),
        processedAt: new Date().toISOString(),
        processingTime: processingTime,
        tempo: result.tempo,
        beatCount: result.beats.length,
        beats: result.beats,
        metadata: result.metadata
      };
      
      fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
      console.log(`\n${colors.green}💾 Results saved to: ${outputFile}${colors.reset}`);
    }
    
    // Performance metrics
    if (result.metadata) {
      console.log(`\n${colors.bright}⚡ Performance Metrics:${colors.reset}`);
      console.log(`  • Samples Processed: ${colors.blue}${result.metadata.samplesProcessed.toLocaleString()}${colors.reset}`);
      console.log(`  • Processing Speed: ${colors.green}${(result.metadata.samplesProcessed / (processingTime / 1000)).toFixed(0)} samples/sec${colors.reset}`);
      
      const realTimeRatio = (stats.size / 1024 / 1024) / (processingTime / 1000);
      console.log(`  • Speed Ratio: ${colors.magenta}${realTimeRatio.toFixed(1)}x realtime${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Error processing file:${colors.reset}`, error.message);
    console.error(`${colors.yellow}Stack trace:${colors.reset}`, error.stack);
  } finally {
    await parser.cleanup();
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.bright}${colors.blue}🎵 Beat Parser - Local Music Testing Tool${colors.reset}

${colors.yellow}Usage:${colors.reset}
  node test-local-music.js <music-file> [options]

${colors.yellow}Options:${colors.reset}
  --pictures <n>     Number of pictures/beats to select (default: 10)
  --method <type>    Selection method: uniform, adaptive, energy, regular (default: adaptive)
  --confidence <n>   Minimum confidence threshold 0-1 (default: 0.5)
  --save            Save results to JSON file
  --help            Show this help message

${colors.yellow}Examples:${colors.reset}
  node test-local-music.js song.mp3
  node test-local-music.js song.wav --pictures 20
  node test-local-music.js track.mp3 --method energy --save
  node test-local-music.js music.flac --confidence 0.7 --pictures 15

${colors.yellow}Supported Formats:${colors.reset}
  WAV, MP3, FLAC, OGG, M4A
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
  
  await testMusicFile(musicFile, options);
}

// Run if called directly
main().catch(console.error);

export { testMusicFile };