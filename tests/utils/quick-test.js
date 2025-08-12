#!/usr/bin/env node

/**
 * Quick Test Script for Beat Parser
 * Simple test to verify audio decoding and beat detection works
 */

import decode from 'audio-decode';
import { BeatParser } from '../../dist/index.esm.js';
import fs from 'fs';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m'
};

async function quickTest() {
  console.log(`${colors.blue}🎵 Beat Parser - Quick Test${colors.reset}\n`);
  
  const musicFile = path.resolve('./music/summer-vibes-158665.mp3');
  
  try {
    // Test 1: Audio Decoding
    console.log('1️⃣  Testing audio decoding...');
    const fileBuffer = fs.readFileSync(musicFile);
    const audioBuffer = await decode(fileBuffer);
    console.log(`   ${colors.green}✓ Audio decoded: ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.sampleRate}Hz${colors.reset}`);
    
    // Test 2: Beat Detection
    console.log('\n2️⃣  Testing beat detection...');
    const audioData = audioBuffer.getChannelData(0);
    const parser = new BeatParser();
    const result = await parser.parseBuffer(audioData);
    console.log(`   ${colors.green}✓ Beats detected: ${result.beats.length} beats${colors.reset}`);
    
    // Test 3: Tempo Analysis
    if (result.tempo) {
      console.log(`\n3️⃣  Tempo: ${colors.yellow}${result.tempo.bpm.toFixed(1)} BPM${colors.reset}`);
    }
    
    // Success
    console.log(`\n${colors.green}✅ All tests passed!${colors.reset}`);
    console.log('The beat parser is working correctly with audio files.\n');
    
    // Cleanup
    await parser.cleanup();
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Test failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

quickTest().catch(console.error);