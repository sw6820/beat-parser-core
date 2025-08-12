# API Reference

## BeatParser Class

### Constructor

```typescript
new BeatParser(config?: BeatParserConfig)
```

### Methods

#### parseBuffer(audioData, options?)
Parse audio data from Float32Array or Buffer.

```typescript
async parseBuffer(
  audioData: Float32Array | Buffer, 
  options?: ParseOptions
): Promise<ParseResult>
```

**Parameters:**
- `audioData` - Audio data as Float32Array or Buffer
- `options` - Optional parsing configuration

**Returns:** Promise resolving to parse results with detected beats

#### parseFile(filePath, options?)
Parse audio file from filesystem.

```typescript
async parseFile(
  filePath: string, 
  options?: ParseOptions
): Promise<ParseResult>
```

#### parseStream(audioStream, options?)
Parse streaming audio data.

```typescript
async parseStream(
  audioStream: ReadableStream<Float32Array> | AsyncIterableIterator<Float32Array>,
  options?: StreamingOptions
): Promise<ParseResult>
```

### Configuration

```typescript
interface BeatParserConfig {
  sampleRate?: number;           // Default: 44100
  minTempo?: number;             // Default: 60 BPM
  maxTempo?: number;             // Default: 200 BPM
  confidenceThreshold?: number;  // Default: 0.5
  enablePreprocessing?: boolean; // Default: true
  enableNormalization?: boolean; // Default: true
  outputFormat?: 'json' | 'xml' | 'csv';
  includeMetadata?: boolean;     // Default: true
}
```

### Parse Options

```typescript
interface ParseOptions {
  targetPictureCount?: number;   // Number of beats to select
  selectionMethod?: 'uniform' | 'adaptive' | 'energy';
  minConfidence?: number;        // Minimum confidence threshold
  filename?: string;             // Optional filename for metadata
  progressCallback?: (processed: number) => void;
}
```

### Parse Result

```typescript
interface ParseResult {
  beats: Beat[];                 // Array of detected beats
  tempo?: Tempo;                 // Detected tempo information
  metadata: {
    processingTime: number;      // Processing time in milliseconds
    samplesProcessed: number;    // Total samples processed
    parameters: ParseOptions;    // Parameters used
    audioLength: number;         // Audio duration in seconds
    sampleRate: number;          // Sample rate used
    algorithmsUsed: string[];    // Algorithms used
  };
}
```

### Beat Interface

```typescript
interface Beat {
  timestamp: number;             // Time position in milliseconds
  confidence: number;            // Confidence score (0-1)
  strength: number;              // Signal strength
  frequency?: number;            // Dominant frequency
}
```

### Tempo Interface

```typescript
interface Tempo {
  bpm: number;                   // Beats per minute
  confidence: number;            // Tempo confidence (0-1)
  timeSignature?: {
    numerator: number;           // Time signature numerator
    denominator: number;         // Time signature denominator
  };
}
```

## Static Methods

### getSupportedFormats()
Get list of supported audio formats.

```typescript
BeatParser.getSupportedFormats(): string[]
```

**Returns:** Array of supported file extensions

### getVersion()
Get library version.

```typescript
BeatParser.getVersion(): string
```

## Error Handling

All methods throw descriptive errors:

```typescript
try {
  const result = await parser.parseBuffer(audioData);
} catch (error) {
  console.error('Beat parsing failed:', error.message);
}
```

Common error types:
- `Invalid audio data provided`
- `Audio file not found`  
- `Unsupported audio format`
- `Failed to parse audio buffer`

## Plugin System

### Adding Plugins

```typescript
interface BeatParserPlugin {
  name: string;
  version: string;
  initialize?: (config: BeatParserConfig) => void;
  processAudio?: (audio: Float32Array) => Float32Array;
  processBeats?: (beats: Beat[]) => Beat[];
  cleanup?: () => void;
}

parser.addPlugin(plugin);
```

### Plugin Management

```typescript
parser.getPlugins(): BeatParserPlugin[]
parser.removePlugin(name: string): void
```

## Configuration Updates

```typescript
// Update configuration
parser.updateConfig({
  minTempo: 80,
  maxTempo: 160,
  confidenceThreshold: 0.7
});

// Get current configuration
const config = parser.getConfig();
```

## Resource Management

Always clean up resources when done:

```typescript
await parser.cleanup();
```