#!/usr/bin/env node

/**
 * Direct test of audio-decode library
 */

import decode from 'audio-decode';
import fs from 'fs';

async function testDirect() {
  try {
    console.log('Testing audio-decode library directly...');
    
    // Read the MP3 file
    const buffer = fs.readFileSync('./music/summer-vibes-158665.mp3');
    console.log('File loaded, size:', buffer.length, 'bytes');
    
    // Decode the audio
    console.log('Decoding audio...');
    const audioBuffer = await decode(buffer);
    
    console.log('✅ Success! Audio decoded:');
    console.log('  • Sample Rate:', audioBuffer.sampleRate, 'Hz');
    console.log('  • Duration:', audioBuffer.duration, 'seconds');
    console.log('  • Channels:', audioBuffer.numberOfChannels);
    console.log('  • Length:', audioBuffer.length, 'samples');
    
    // Get first channel data
    const samples = audioBuffer.getChannelData(0);
    console.log('  • First channel samples:', samples.length);
    console.log('  • Sample range:', Math.min(...samples), 'to', Math.max(...samples));
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

testDirect();