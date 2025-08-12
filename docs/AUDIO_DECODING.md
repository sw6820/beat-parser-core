# Audio Decoding Guide

## Overview

The beat parser uses the `audio-decode` library for robust audio format support, enabling processing of various compressed and uncompressed audio formats.

## Supported Formats

### Primary Formats
- **WAV** - Uncompressed PCM audio, best quality
- **MP3** - MPEG Layer 3, most common format
- **FLAC** - Free Lossless Audio Codec, high quality compression
- **OGG** - Ogg Vorbis, open source compression
- **OPUS** - Modern low-latency codec

### Format Characteristics

| Format | Compression | Quality | Processing Speed |
|--------|-------------|---------|------------------|
| WAV    | None        | Highest | Fastest         |
| FLAC   | Lossless    | High    | Fast            |
| OGG    | Lossy       | Good    | Medium          |
| MP3    | Lossy       | Good    | Medium          |
| OPUS   | Lossy       | Good    | Medium          |

## Usage Examples

### File Processing
```typescript
import { BeatParser } from '@beat-parser/core';

const parser = new BeatParser();

// Process different formats
const mp3Result = await parser.parseFile('./music.mp3');
const wavResult = await parser.parseFile('./music.wav');
const flacResult = await parser.parseFile('./music.flac');
```

### Buffer Processing
```typescript
// Decode audio buffer
const audioBuffer = await fs.readFile('./music.mp3');
const result = await parser.parseBuffer(audioBuffer);
```

### Format Detection
```typescript
// Check supported formats
const formats = BeatParser.getSupportedFormats();
console.log('Supported formats:', formats);
// Output: ['wav', 'mp3', 'flac', 'ogg', 'opus']
```

## Audio Processing Pipeline

### 1. Format Detection
The library automatically detects audio format from:
- File extension
- Magic bytes in header
- MIME type (for web usage)

### 2. Decoding Process
```
Audio File → audio-decode → Float32Array → BeatParser → Results
    ↓           ↓              ↓             ↓
 Binary     Decode to     Normalized    Beat Detection
 Format     PCM Audio     Samples       Processing
```

### 3. Sample Rate Handling
- **Input**: Any sample rate supported by format
- **Processing**: Converted to configured sample rate (default 44.1kHz)
- **Output**: Beat timestamps in milliseconds

### 4. Channel Handling
- **Stereo**: Automatically mixed to mono for processing
- **Mono**: Used directly
- **Multi-channel**: Mixed to mono with equal weighting

## Configuration Options

### Audio Processing Config
```typescript
const parser = new BeatParser({
  sampleRate: 44100,           // Target sample rate
  enablePreprocessing: true,   // Enable audio preprocessing
  enableNormalization: true    // Enable amplitude normalization
});
```

### Format-Specific Options
```typescript
const parseOptions = {
  filename: 'music.mp3',       // Helps with format detection
  progressCallback: (progress) => {
    console.log(`Decoding: ${progress}%`);
  }
};
```

## Performance Considerations

### Processing Speed by Format
1. **WAV** - Fastest (no decompression needed)
2. **FLAC** - Fast (efficient lossless decoding)
3. **OGG/OPUS** - Medium (standard lossy decoding)
4. **MP3** - Medium (standard lossy decoding)

### Memory Usage
- **Compressed formats**: ~10x less memory during file loading
- **Uncompressed formats**: Full audio data loaded to memory
- **Streaming**: Reduces memory usage for all formats

### Best Practices
```typescript
// For best performance with large files
const result = await parser.parseFile('./large-audio.mp3', {
  progressCallback: (progress) => {
    // Monitor decoding progress
    console.log(`Decoded: ${progress}%`);
  }
});
```

## Error Handling

### Common Audio Decoding Errors
```typescript
try {
  const result = await parser.parseFile('./audio.mp3');
} catch (error) {
  if (error.message.includes('Unsupported audio format')) {
    console.error('Format not supported');
  } else if (error.message.includes('Failed to decode audio')) {
    console.error('File corrupted or invalid');
  } else if (error.message.includes('File not found')) {
    console.error('Audio file missing');
  }
}
```

### Format Validation
```typescript
// Check if format is supported before processing
const supportedFormats = BeatParser.getSupportedFormats();
const fileExtension = path.extname('./music.mp3').slice(1);

if (!supportedFormats.includes(fileExtension)) {
  throw new Error(`Format ${fileExtension} not supported`);
}
```

## Audio Quality Guidelines

### Recommended Settings
- **Sample Rate**: 44.1kHz (CD quality)
- **Bit Depth**: 16-bit minimum, 24-bit preferred
- **Format**: WAV or FLAC for best accuracy

### Quality vs Performance Trade-offs
- **High Quality**: WAV/FLAC, 44.1kHz+, slower processing
- **Balanced**: MP3/OGG, 44.1kHz, good speed and quality
- **Fast Processing**: Lower sample rates, compressed formats

### Beat Detection Accuracy by Format
1. **WAV/FLAC** - Highest accuracy (no compression artifacts)
2. **OGG/OPUS** - Good accuracy (modern compression)
3. **MP3** - Good accuracy (widely compatible)

## Troubleshooting

### File Won't Decode
1. Check file format is supported
2. Verify file is not corrupted
3. Ensure file has audio content (not empty)
4. Try different sample rate settings

### Poor Beat Detection Quality
1. Use higher quality source audio
2. Avoid highly compressed MP3s (<128kbps)
3. Ensure audio has clear rhythmic content
4. Adjust confidence threshold settings

### Memory Issues with Large Files
1. Use streaming processing for files >2 minutes
2. Enable Web Worker processing
3. Process files in smaller batches
4. Always call cleanup() after processing

## Integration Examples

### Web Application
```typescript
// Handle file upload and decode
const handleFileUpload = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = new Uint8Array(arrayBuffer);
  
  const parser = new BeatParser();
  try {
    const result = await parser.parseBuffer(audioBuffer, {
      filename: file.name,
      progressCallback: (progress) => {
        updateProgressBar(progress);
      }
    });
    return result;
  } finally {
    await parser.cleanup();
  }
};
```

### Node.js Batch Processing
```typescript
import fs from 'fs/promises';
import path from 'path';

const processAudioDirectory = async (dirPath: string) => {
  const files = await fs.readdir(dirPath);
  const audioFiles = files.filter(file => 
    BeatParser.getSupportedFormats().includes(
      path.extname(file).slice(1).toLowerCase()
    )
  );
  
  const parser = new BeatParser();
  const results = [];
  
  try {
    for (const file of audioFiles) {
      const filePath = path.join(dirPath, file);
      const result = await parser.parseFile(filePath);
      results.push({ file, ...result });
    }
    return results;
  } finally {
    await parser.cleanup();
  }
};
```

For complete API documentation, see [API.md](API.md).