# Architecture

## System Overview

The Beat Parser uses a hybrid approach combining multiple algorithms for robust beat detection:

```
Audio Input → AudioProcessor → HybridDetector → BeatSelector → Results
                    ↓               ↓               ↓
                Preprocessing   Beat Detection   Selection & 
                Normalization   (Multi-algorithm)  Formatting
```

## Core Components

### BeatParser (Main API)
- Primary interface for all beat detection operations  
- Manages configuration, plugins, and resource lifecycle
- Provides unified API for buffer, file, and stream processing

### AudioProcessor  
- Handles audio format conversion and preprocessing
- Supports MP3, WAV, FLAC, OGG, OPUS formats via audio-decode library
- Performs normalization and filtering operations

### HybridDetector
- Combines multiple detection algorithms for improved accuracy
- Uses onset detection, tempo tracking, and spectral analysis
- Implements genre-adaptive processing for different music styles

### Algorithm Components

#### OnsetDetection
- Detects sudden changes in audio signal (note onsets)
- Uses energy-based and spectral-based detection methods
- Provides beat candidate locations with confidence scores

#### TempoTracking  
- Analyzes rhythmic patterns to determine tempo
- Implements autocorrelation and comb filter techniques
- Estimates BPM and time signature information

#### SpectralFeatures
- Extracts frequency domain features from audio
- Uses optimized FFT (fft.js library) for performance
- Provides spectral centroid, rolloff, and MFCC features

### Selection & Output

#### BeatSelector
- Selects final beats from candidate pool
- Implements multiple selection strategies (uniform, adaptive, energy-based)
- Applies confidence thresholds and quality filtering

#### OutputFormatter  
- Formats results into structured output
- Supports multiple output formats (JSON primary)
- Includes metadata and processing information

## Algorithm Flow

1. **Audio Input**: Load and decode audio file
2. **Preprocessing**: Normalize and filter audio data  
3. **Feature Extraction**: Extract time and frequency domain features
4. **Beat Detection**: Run multiple detection algorithms in parallel
5. **Candidate Fusion**: Combine results with weighted confidence scoring
6. **Beat Selection**: Select best beats based on target count and quality
7. **Output Formatting**: Structure results with metadata

## Performance Architecture

### FFT Optimization
- Uses fft.js library for O(n log n) performance
- Processes audio in 2048-sample frames with 512-sample hop size
- Includes progress tracking for large files

### Memory Management
- Streaming support for large audio files
- Automatic resource cleanup and garbage collection
- Efficient Float32Array processing throughout pipeline

### Parallel Processing
- Algorithms run concurrently where possible
- Web Worker support for non-blocking processing
- Plugin system allows for custom parallel operations

## Design Patterns

- **Facade Pattern**: BeatParser provides simplified interface to complex subsystem
- **Strategy Pattern**: Multiple beat detection and selection algorithms
- **Observer Pattern**: Progress callbacks and event handling  
- **Plugin Pattern**: Extensible processing pipeline
- **Factory Pattern**: Audio processor creation based on format type

## Data Types

### Core Interfaces
```typescript
interface Beat {
  timestamp: number;    // Position in milliseconds
  confidence: number;   // Quality score 0-1  
  strength: number;     // Signal strength
}

interface ParseResult {
  beats: Beat[];
  tempo?: { bpm: number; confidence: number };
  metadata: ProcessingMetadata;
}
```

### Configuration
```typescript
interface BeatParserConfig {
  sampleRate: number;           // Default: 44100
  minTempo: number;             // Default: 60 BPM
  maxTempo: number;             // Default: 200 BPM
  confidenceThreshold: number;  // Default: 0.5
}
```

This architecture provides a robust, performant, and extensible foundation for beat detection across various audio formats and use cases.