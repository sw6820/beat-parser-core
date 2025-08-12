import { BeatParser } from '../core/BeatParser';

describe('Basic Functionality Test', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser();
  });
  
  afterEach(async () => {
    await parser.cleanup();
  });

  test('should create BeatParser instance', () => {
    expect(parser).toBeInstanceOf(BeatParser);
  });

  test('should get version info', () => {
    const version = BeatParser.getVersion();
    expect(typeof version).toBe('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('should get supported formats', () => {
    const formats = BeatParser.getSupportedFormats();
    expect(Array.isArray(formats)).toBe(true);
    expect(formats.length).toBeGreaterThan(0);
  });

  test('should have default configuration', () => {
    const config = parser.getConfig();
    expect(config).toBeDefined();
    expect(config.sampleRate).toBeDefined();
    expect(config.frameSize).toBeDefined();
    expect(config.hopSize).toBeDefined();
  });

  test('should parse simple audio buffer', async () => {
    // Create simple test audio
    const audioData = new Float32Array(8192);
    
    // Fill with simple pattern
    for (let i = 0; i < audioData.length; i++) {
      audioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
      
      // Add a beat every 2000 samples
      if (i % 2000 === 0) {
        audioData[i] = 0.8;
      }
    }

    const result = await parser.parseBuffer(audioData, {
      targetPictureCount: 3
    });
    
    expect(result).toBeDefined();
    expect(result.beats).toBeDefined();
    expect(Array.isArray(result.beats)).toBe(true);
    expect(result.metadata).toBeDefined();
    
    // Should respect the target count
    expect(result.beats.length).toBeLessThanOrEqual(3);
  });

  test('should handle empty plugin list', () => {
    const plugins = parser.getPlugins();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(0);
  });
});