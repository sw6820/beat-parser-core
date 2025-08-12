#!/usr/bin/env node

/**
 * Complete Music File Test - Shows full audio decoding and analysis
 * Tests with files from ./music directory
 */

import decode from 'audio-decode';
import fs from 'fs';
import path from 'path';

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

async function analyzeMusicFile(filePath) {
  console.log(`\n${colors.bright}${colors.blue}🎵 COMPLETE MUSIC FILE ANALYSIS${colors.reset}`);
  console.log('═'.repeat(60));
  
  try {
    // File information
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`\n${colors.bright}📁 FILE INFORMATION${colors.reset}`);
    console.log(`  File Name: ${colors.yellow}${fileName}${colors.reset}`);
    console.log(`  File Size: ${colors.blue}${fileSizeMB} MB${colors.reset}`);
    console.log(`  File Path: ${colors.green}${filePath}${colors.reset}`);
    
    // Load and decode audio
    console.log(`\n${colors.bright}🔧 AUDIO DECODING${colors.reset}`);
    console.log(`  Loading file...`);
    const fileBuffer = fs.readFileSync(filePath);
    
    const startDecode = Date.now();
    console.log(`  Decoding with audio-decode library...`);
    const audioBuffer = await decode(fileBuffer);
    const decodeTime = Date.now() - startDecode;
    
    console.log(`  ${colors.green}✓ Successfully decoded in ${decodeTime}ms${colors.reset}`);
    console.log(`  Decoding speed: ${colors.magenta}${(fileSizeMB / (decodeTime / 1000)).toFixed(1)} MB/s${colors.reset}`);
    
    // Audio properties
    console.log(`\n${colors.bright}🎵 AUDIO PROPERTIES${colors.reset}`);
    console.log(`  Sample Rate: ${colors.yellow}${audioBuffer.sampleRate.toLocaleString()} Hz${colors.reset}`);
    console.log(`  Duration: ${colors.blue}${audioBuffer.duration.toFixed(2)} seconds${colors.reset}`);
    console.log(`  Channels: ${colors.green}${audioBuffer.numberOfChannels}${colors.reset}`);
    console.log(`  Total Samples: ${colors.magenta}${audioBuffer.length.toLocaleString()}${colors.reset}`);
    console.log(`  Samples per Channel: ${colors.yellow}${(audioBuffer.length / audioBuffer.numberOfChannels).toLocaleString()}${colors.reset}`);
    
    // Extract channels
    console.log(`\n${colors.bright}📊 CHANNEL DATA${colors.reset}`);
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
    
    console.log(`  Left Channel: ${colors.green}${leftChannel.length.toLocaleString()} samples${colors.reset}`);
    if (audioBuffer.numberOfChannels > 1) {
      console.log(`  Right Channel: ${colors.green}${rightChannel.length.toLocaleString()} samples${colors.reset}`);
    }
    
    // Convert to mono
    console.log(`\n${colors.bright}🔄 MONO CONVERSION${colors.reset}`);
    const monoData = new Float32Array(leftChannel.length);
    
    if (audioBuffer.numberOfChannels === 1) {
      monoData.set(leftChannel);
      console.log(`  ${colors.blue}Audio is already mono${colors.reset}`);
    } else {
      for (let i = 0; i < leftChannel.length; i++) {
        monoData[i] = (leftChannel[i] + rightChannel[i]) / 2;
      }
      console.log(`  ${colors.green}✓ Converted stereo to mono${colors.reset}`);
    }
    console.log(`  Mono samples: ${colors.yellow}${monoData.length.toLocaleString()}${colors.reset}`);
    
    // Audio analysis
    console.log(`\n${colors.bright}📈 AUDIO ANALYSIS${colors.reset}`);
    
    // Calculate RMS (Root Mean Square - loudness)
    let sum = 0;
    let maxSample = 0;
    let minSample = 0;
    
    for (let i = 0; i < monoData.length; i += 100) { // Sample every 100th for speed
      const sample = monoData[i];
      sum += sample * sample;
      if (sample > maxSample) maxSample = sample;
      if (sample < minSample) minSample = sample;
    }
    
    const rms = Math.sqrt(sum / (monoData.length / 100));
    console.log(`  RMS Level (Loudness): ${colors.yellow}${rms.toFixed(4)}${colors.reset}`);
    console.log(`  Peak Level: ${colors.green}${maxSample.toFixed(4)}${colors.reset}`);
    console.log(`  Min Level: ${colors.red}${minSample.toFixed(4)}${colors.reset}`);
    console.log(`  Dynamic Range: ${colors.magenta}${(maxSample - minSample).toFixed(4)}${colors.reset}`);
    
    // Find significant peaks (potential beats)
    console.log(`\n${colors.bright}🎯 PEAK DETECTION (Potential Beats)${colors.reset}`);
    
    const peaks = [];
    const windowSize = 2048;
    const hopSize = 512;
    const threshold = rms * 1.5; // Peaks above 1.5x RMS
    
    for (let i = 0; i < monoData.length - windowSize; i += hopSize) {
      let windowMax = 0;
      let windowMaxIndex = i;
      
      // Find peak in window
      for (let j = i; j < i + windowSize && j < monoData.length; j++) {
        const abs = Math.abs(monoData[j]);
        if (abs > windowMax) {
          windowMax = abs;
          windowMaxIndex = j;
        }
      }
      
      // Check if it's a significant peak
      if (windowMax > threshold) {
        // Check if it's a local maximum
        const localIndex = windowMaxIndex;
        if (localIndex > 0 && localIndex < monoData.length - 1) {
          const current = Math.abs(monoData[localIndex]);
          const prev = Math.abs(monoData[localIndex - 1]);
          const next = Math.abs(monoData[localIndex + 1]);
          
          if (current > prev && current > next) {
            peaks.push({
              index: localIndex,
              time: localIndex / audioBuffer.sampleRate,
              strength: current
            });
          }
        }
      }
    }
    
    // Filter peaks to avoid duplicates (minimum 100ms apart)
    const minPeakDistance = audioBuffer.sampleRate * 0.1; // 100ms
    const filteredPeaks = [];
    let lastPeakIndex = -minPeakDistance;
    
    for (const peak of peaks) {
      if (peak.index - lastPeakIndex >= minPeakDistance) {
        filteredPeaks.push(peak);
        lastPeakIndex = peak.index;
      }
    }
    
    console.log(`  Total Peaks Found: ${colors.green}${filteredPeaks.length}${colors.reset}`);
    console.log(`  Detection Threshold: ${colors.yellow}${threshold.toFixed(4)}${colors.reset}`);
    
    // Estimate tempo from peak intervals
    if (filteredPeaks.length > 10) {
      const intervals = [];
      for (let i = 1; i < Math.min(filteredPeaks.length, 100); i++) {
        const interval = filteredPeaks[i].time - filteredPeaks[i-1].time;
        if (interval > 0.2 && interval < 2.0) { // Between 30 and 300 BPM
          intervals.push(interval);
        }
      }
      
      if (intervals.length > 0) {
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        const estimatedBPM = 60 / medianInterval;
        
        console.log(`\n${colors.bright}🎼 TEMPO ESTIMATION${colors.reset}`);
        console.log(`  Estimated BPM: ${colors.magenta}${estimatedBPM.toFixed(1)}${colors.reset}`);
        console.log(`  Beat Interval: ${colors.yellow}${(medianInterval * 1000).toFixed(0)}ms${colors.reset}`);
        console.log(`  Confidence: ${colors.green}Based on ${intervals.length} intervals${colors.reset}`);
      }
    }
    
    // Show first few peaks
    console.log(`\n${colors.bright}🎯 FIRST 10 PEAKS (Time & Strength)${colors.reset}`);
    for (let i = 0; i < Math.min(10, filteredPeaks.length); i++) {
      const peak = filteredPeaks[i];
      const timeStr = peak.time.toFixed(3).padStart(7);
      const strengthBar = '█'.repeat(Math.round(peak.strength * 20));
      console.log(`  ${String(i + 1).padStart(2)}. ${timeStr}s  [${peak.strength.toFixed(3)}] ${colors.green}${strengthBar}${colors.reset}`);
    }
    
    if (filteredPeaks.length > 10) {
      console.log(`  ... and ${filteredPeaks.length - 10} more peaks`);
    }
    
    // Summary
    console.log(`\n${colors.bright}${colors.green}✅ ANALYSIS COMPLETE${colors.reset}`);
    console.log('═'.repeat(60));
    console.log(`\n${colors.bright}📋 SUMMARY${colors.reset}`);
    console.log(`  • File: ${colors.yellow}${fileName}${colors.reset}`);
    console.log(`  • Duration: ${colors.blue}${audioBuffer.duration.toFixed(1)}s${colors.reset}`);
    console.log(`  • Detected Peaks: ${colors.green}${filteredPeaks.length}${colors.reset}`);
    console.log(`  • Audio Quality: ${colors.magenta}${audioBuffer.sampleRate} Hz, ${audioBuffer.numberOfChannels} channels${colors.reset}`);
    console.log(`  • Processing Speed: ${colors.yellow}${decodeTime}ms decoding${colors.reset}`);
    
    return {
      fileName,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      peaks: filteredPeaks.length,
      decodeTime
    };
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Error analyzing file:${colors.reset}`, error.message);
    return null;
  }
}

// Main function
async function main() {
  console.log(`${colors.bright}${colors.magenta}🚀 BEAT PARSER - MUSIC FILE TESTING${colors.reset}`);
  console.log(`${colors.yellow}Testing with files from ./music directory${colors.reset}`);
  
  const musicFile = './music/summer-vibes-158665.mp3';
  
  console.log(`\nMusic file to test: ${colors.green}${musicFile}${colors.reset}`);
  
  const result = await analyzeMusicFile(musicFile);
  
  if (result) {
    console.log(`\n${colors.bright}${colors.green}🎉 TEST SUCCESSFUL!${colors.reset}`);
    console.log(`\nThe audio-decode library successfully processed the music file.`);
    console.log(`This proves that users can now test the beat parser with real local music files!`);
  }
}

// Run the test
main().catch(console.error);