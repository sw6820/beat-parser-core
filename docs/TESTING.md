# Testing Guide

## Overview

Comprehensive testing setup for beat parser development and validation.

## Test Structure

### Organized Test Files
```
tests/
├── demos/
│   └── audio-decode-demo.js       # Audio decoding demonstration
├── integration/
│   ├── beat-parser-integration.js # Full integration tests
│   └── music-analysis.js          # Real music file analysis
├── utils/
│   ├── test-runner.js             # Test execution utility
│   └── quick-test.js              # Fast validation tests
└── archived/                      # Legacy test files
```

## NPM Test Scripts

### Available Commands
```bash
npm run test:quick        # Fast validation tests
npm run test:demo         # Audio decoding demo
npm run test:music        # Music file analysis
npm run test:integration  # Full integration tests  
npm run test:all          # Complete test suite
```

### Script Configuration
```json
{
  "scripts": {
    "test:quick": "node tests/utils/quick-test.js",
    "test:demo": "node tests/demos/audio-decode-demo.js",
    "test:music": "node tests/integration/music-analysis.js",
    "test:integration": "node tests/integration/beat-parser-integration.js",
    "test:all": "node tests/utils/test-runner.js"
  }
}
```

## Test Categories

### Quick Tests (`npm run test:quick`)
Fast validation of core functionality:
- Library loading and initialization
- Basic configuration validation
- Audio buffer processing
- Error handling
- Resource cleanup

Expected output:
```
✅ Library loads successfully
✅ Parser initializes correctly
✅ Audio processing works
✅ All quick tests passed
```

### Audio Decode Demo (`npm run test:demo`)
Demonstrates audio decoding capabilities:
- MP3/WAV/FLAC format support
- Sample rate conversion
- Channel mixing
- Audio normalization

### Music Analysis (`npm run test:music`)
Tests with real music files from `./music/` directory:
- Beat detection accuracy
- Tempo estimation
- Processing performance
- Output validation

Expected results:
```
Processing: summer-vibes-158665.mp3
Found 16 beats in 5.2 seconds
Tempo: ~158 BPM
Processing time: 2.1 seconds
✅ Analysis complete
```

### Integration Tests (`npm run test:integration`)
Comprehensive system testing:
- End-to-end processing pipeline
- Multiple algorithm coordination
- Error handling and recovery
- Performance benchmarking
- Memory usage validation

## Testing Audio Files

### Required Test Files
Place audio files in `./music/` directory:
```
music/
├── summer-vibes-158665.mp3    # Primary test file
├── test-track.wav             # WAV format test
└── sample.flac                # FLAC format test
```

### Audio File Requirements
- **Duration**: 3-10 seconds for quick tests
- **Format**: MP3, WAV, or FLAC
- **Quality**: 44.1kHz sample rate preferred
- **Content**: Clear rhythmic patterns

## Performance Testing

### Benchmarking
```javascript
// Performance test example
const startTime = Date.now();
const result = await parser.parseFile('./music/test-track.mp3');
const processingTime = Date.now() - startTime;

console.log(`Processing time: ${processingTime}ms`);
console.log(`Beats found: ${result.beats.length}`);
console.log(`Efficiency: ${result.metadata.samplesProcessed / processingTime} samples/ms`);
```

### Expected Performance
| File Duration | Processing Time | Memory Usage |
|---------------|-----------------|---------------|
| 5 seconds     | <3 seconds     | <10MB        |
| 30 seconds    | <15 seconds    | <25MB        |
| 2 minutes     | <60 seconds    | <50MB        |

## Development Testing

### Local Development
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run quick validation
npm run test:quick

# Test with music files
npm run test:music
```

### Debugging Tests
```javascript
// Enable debug logging
process.env.DEBUG = 'beat-parser:*';

// Run specific test
node tests/integration/beat-parser-integration.js ./music/test-file.mp3
```

## Test Data Validation

### Beat Detection Validation
```javascript
// Validate beat detection results
function validateBeatResults(result) {
  // Check basic structure
  assert(Array.isArray(result.beats), 'Beats should be array');
  assert(result.beats.length > 0, 'Should detect some beats');
  
  // Validate beat properties
  result.beats.forEach(beat => {
    assert(typeof beat.timestamp === 'number', 'Beat timestamp should be number');
    assert(beat.confidence >= 0 && beat.confidence <= 1, 'Confidence should be 0-1');
    assert(beat.strength >= 0, 'Strength should be positive');
  });
  
  // Check temporal ordering
  for (let i = 1; i < result.beats.length; i++) {
    assert(result.beats[i].timestamp > result.beats[i-1].timestamp, 
           'Beats should be temporally ordered');
  }
}
```

### Tempo Validation
```javascript
// Validate tempo detection
function validateTempo(tempo) {
  if (tempo) {
    assert(tempo.bpm > 0, 'BPM should be positive');
    assert(tempo.bpm >= 60 && tempo.bpm <= 300, 'BPM should be reasonable range');
    assert(tempo.confidence >= 0 && tempo.confidence <= 1, 'Tempo confidence 0-1');
  }
}
```

## Continuous Integration

### GitHub Actions
```yaml
name: Test Beat Parser
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: npm run test:quick
      - run: npm run test:integration
```

### Pre-commit Testing
```bash
# Add to .husky/pre-commit
#!/bin/sh
npm run test:quick
```

## Error Testing

### Common Error Scenarios
```javascript
// Test error handling
describe('Error Handling', () => {
  it('should handle invalid audio data', async () => {
    const parser = new BeatParser();
    try {
      await parser.parseBuffer(null);
      assert.fail('Should throw error for null input');
    } catch (error) {
      assert(error.message.includes('Invalid audio data'));
    }
  });
  
  it('should handle file not found', async () => {
    const parser = new BeatParser();
    try {
      await parser.parseFile('./nonexistent.mp3');
      assert.fail('Should throw error for missing file');
    } catch (error) {
      assert(error.message.includes('not found'));
    }
  });
});
```

## Memory Testing

### Memory Leak Detection
```javascript
// Test for memory leaks
async function testMemoryLeaks() {
  const parser = new BeatParser();
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Process multiple files
  for (let i = 0; i < 10; i++) {
    const result = await parser.parseFile('./music/test-track.mp3');
    // Force garbage collection if available
    if (global.gc) global.gc();
  }
  
  await parser.cleanup();
  if (global.gc) global.gc();
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  console.log(`Memory increase: ${memoryIncrease / 1024 / 1024} MB`);
  assert(memoryIncrease < 50 * 1024 * 1024, 'Memory increase should be <50MB');
}
```

## Test Coverage

### Coverage Goals
- **Unit Tests**: >90% code coverage
- **Integration Tests**: All major workflows
- **Error Handling**: All error paths
- **Performance**: Benchmarks for all operations

### Coverage Tools
```bash
# Install coverage tools
npm install --save-dev nyc

# Run with coverage
nyc npm run test:all

# Generate coverage report
nyc report --reporter=html
```

## Troubleshooting Tests

### Common Test Issues

1. **Tests fail with "audio-decode not found"**
   - Run `npm install` to install dependencies
   - Check that audio-decode is in package.json

2. **Music files not found**
   - Create `./music/` directory
   - Add test audio files (MP3, WAV, FLAC)
   - Verify file paths in test scripts

3. **Memory errors during testing**
   - Reduce test file sizes
   - Enable garbage collection
   - Always call parser.cleanup()

4. **Performance tests fail**
   - Check system resources
   - Use smaller test files
   - Verify no other heavy processes running

### Debug Mode
```bash
# Enable debug logging
export DEBUG=beat-parser:*
npm run test:music

# Or for specific test
DEBUG=beat-parser:* node tests/integration/music-analysis.js
```

For complete API documentation, see [API.md](API.md).