# Setup & Installation

## Installation

### npm Installation
```bash
npm install @beat-parser/core
```

### Yarn Installation
```bash
yarn add @beat-parser/core
```

## Quick Start

### Basic Usage
```typescript
import { BeatParser } from '@beat-parser/core';

const parser = new BeatParser();
const result = await parser.parseBuffer(audioData);
console.log('Beats found:', result.beats.length);
```

### Configuration
```typescript
const parser = new BeatParser({
  sampleRate: 44100,
  minTempo: 80,
  maxTempo: 160,
  confidenceThreshold: 0.6
});
```

## Environment Support

### Node.js Requirements
- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- TypeScript 5.0+ (for TypeScript projects)

### Browser Requirements
- Chrome 66+
- Firefox 60+
- Safari 13.1+
- Edge 79+

## Audio Format Support

Supported formats via audio-decode library:
- **WAV** - Uncompressed audio
- **MP3** - MPEG audio compression
- **FLAC** - Lossless compression
- **OGG** - Open source compression
- **OPUS** - Low-latency compression

## TypeScript Setup

Types are included automatically:
```typescript
import { BeatParser, ParseResult, Beat } from '@beat-parser/core';

const parser: BeatParser = new BeatParser();
const result: ParseResult = await parser.parseBuffer(audioData);
```

## Web Worker Setup

For non-blocking processing:
```typescript
import { BeatParserWorkerClient } from '@beat-parser/core';

const client = new BeatParserWorkerClient();
const result = await client.parseBuffer(audioData, {
  progressCallback: (progress) => console.log(`${progress}%`)
});
await client.terminate();
```

## Performance Optimization

### Memory Management
```typescript
// Always cleanup after processing
const parser = new BeatParser();
try {
  const result = await parser.parseBuffer(audioData);
} finally {
  await parser.cleanup();
}
```

### Large Files
For files >30 seconds, use streaming:
```typescript
const result = await parser.parseStream(audioStream, {
  progressCallback: (processed) => console.log(`Processed: ${processed}`)
});
```

## Common Issues

### Audio File Not Found
```typescript
try {
  const result = await parser.parseFile('./music.mp3');
} catch (error) {
  console.error('File not found:', error.message);
}
```

### Unsupported Format
```typescript
// Check supported formats
const formats = BeatParser.getSupportedFormats();
console.log('Supported:', formats); // ['wav', 'mp3', 'flac', 'ogg', 'opus']
```

### Memory Issues
- Use Web Workers for large files
- Enable streaming for files >2 minutes
- Always call cleanup() after processing
- Process files in batches if handling many files

### Worker Issues
If workers not supported:
```typescript
try {
  const client = new BeatParserWorkerClient();
} catch (error) {
  // Fallback to main thread
  const parser = new BeatParser();
}
```

## Development Setup

### Local Development
```bash
git clone https://github.com/username/beat-parser.git
cd beat-parser
npm install
npm run build
npm test
```

### Testing
```bash
npm run test:quick    # Quick tests
npm run test:music    # Full music file tests
npm run test:all      # Complete test suite
```

## Examples

### File Processing
```typescript
import { BeatParser } from '@beat-parser/core';

async function processAudioFile(filePath: string) {
  const parser = new BeatParser({
    confidenceThreshold: 0.7
  });
  
  try {
    const result = await parser.parseFile(filePath, {
      targetPictureCount: 16,
      selectionMethod: 'adaptive'
    });
    
    console.log(`Found ${result.beats.length} beats`);
    console.log(`Tempo: ${result.tempo?.bpm} BPM`);
    
    return result;
  } finally {
    await parser.cleanup();
  }
}
```

### Batch Processing
```typescript
async function processMusicLibrary(files: string[]) {
  const parser = new BeatParser();
  const results = [];
  
  try {
    for (const file of files) {
      const result = await parser.parseFile(file);
      results.push(result);
    }
    return results;
  } finally {
    await parser.cleanup();
  }
}
```

For complete API documentation, see [API.md](API.md).