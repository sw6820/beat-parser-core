/**
 * Picture Count Selection Test Suite
 * 
 * Comprehensive testing of the core value proposition: intelligent beat selection
 * for visual content synchronization with various picture counts.
 */

import { BeatParser } from '../core/BeatParser';
import { BeatSelector } from '../core/BeatSelector';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import type { Beat, Tempo, BeatSelectorConfig, BeatResult } from '../types';

describe('Picture Count Selection Comprehensive Test Suite', () => {
  let parser: BeatParser;
  
  beforeEach(() => {
    parser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.1, // Lower threshold for testing
      includeMetadata: true
    });
  });
  
  afterEach(async () => {
    await parser.cleanup();
  });

  describe('Picture Count Edge Cases', () => {
    describe('Zero Pictures (0)', () => {
      test('should handle zero picture request gracefully', async () => {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(120, {
          sampleRate: 44100,
          channels: 1,
          duration: 2,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(audioData, {
          targetPictureCount: 0
        });

        expect(result).toBeDefined();
        expect(result.beats).toHaveLength(0);
        expect(result.metadata.analysis?.beatsSelected).toBe(0);
      });

      test('should return empty selection with quality metrics', () => {
        const emptyBeats: Beat[] = [];
        const selectionResult = BeatSelector.selectBeatsEnhanced(emptyBeats, { 
          count: 0, 
          strategy: 'adaptive' 
        });

        expect(selectionResult.beats).toHaveLength(0);
        expect(selectionResult.quality).toEqual({
          coverage: 0,
          diversity: 0,
          spacing: 0,
          overall: 0
        });
        expect(selectionResult.metadata.totalCandidates).toBe(0);
      });
    });

    describe('Single Picture (1)', () => {
      test('should select the strongest beat when requesting one picture', async () => {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(120, {
          sampleRate: 44100,
          channels: 1,
          duration: 2,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(audioData, {
          targetPictureCount: 1,
          selectionMethod: 'energy'
        });

        expect(result.beats).toHaveLength(1);
        expect(result.beats[0].strength).toBeGreaterThan(0);
        expect(result.metadata.analysis?.beatsSelected).toBe(1);
      });

      test('should select optimal single beat across strategies', () => {
        const testBeats: Beat[] = [
          { timestamp: 1000, strength: 0.3, confidence: 0.7, metadata: {} },
          { timestamp: 2000, strength: 0.9, confidence: 0.8, metadata: {} },
          { timestamp: 3000, strength: 0.5, confidence: 0.9, metadata: {} },
          { timestamp: 4000, strength: 0.7, confidence: 0.6, metadata: {} }
        ];

        const strategies = ['energy', 'regular', 'musical', 'adaptive'] as const;
        
        strategies.forEach(strategy => {
          const result = BeatSelector.selectBeatsEnhanced(testBeats, {
            count: 1,
            strategy,
            audioDuration: 5
          });

          expect(result.beats).toHaveLength(1);
          expect(result.beats[0].strength).toBeGreaterThan(0);
          expect(result.metadata.strategy).toBe(strategy);
        });
      });
    });

    describe('Very Few Pictures (2-5)', () => {
      test('should optimize spacing for 2 pictures', async () => {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(120, {
          sampleRate: 44100,
          channels: 1,
          duration: 4,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(audioData, {
          targetPictureCount: 2,
          selectionMethod: 'regular'
        });

        expect(result.beats).toHaveLength(2);
        expect(result.beats[0].timestamp).toBeLessThan(result.beats[1].timestamp);
        
        // Should have reasonable spacing
        const spacing = result.beats[1].timestamp - result.beats[0].timestamp;
        expect(spacing).toBeGreaterThan(1000); // At least 1 second apart
      });

      test('should maintain quality with 3-5 pictures', async () => {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(150, {
          sampleRate: 44100,
          channels: 1,
          duration: 3,
          bitDepth: 16,
          format: 'wav'
        });

        for (let count = 3; count <= 5; count++) {
          const result = await parser.parseBuffer(audioData, {
            targetPictureCount: count,
            selectionMethod: 'adaptive'
          });

          expect(result.beats).toHaveLength(count);
          
          // Check temporal ordering
          for (let i = 1; i < result.beats.length; i++) {
            expect(result.beats[i].timestamp).toBeGreaterThan(result.beats[i-1].timestamp);
          }

          // Verify quality metrics exist
          expect(result.metadata.analysis?.qualityScore).toBeDefined();
          expect(result.metadata.analysis?.qualityScore).toBeGreaterThanOrEqual(0);
        }
      });

      test('should optimize beat distribution for small counts', () => {
        const denseBeatPattern: Beat[] = Array.from({ length: 20 }, (_, i) => ({
          timestamp: i * 500, // Every 0.5 seconds
          strength: Math.random() * 0.8 + 0.2,
          confidence: Math.random() * 0.5 + 0.5,
          metadata: {}
        }));

        for (let count = 2; count <= 5; count++) {
          const result = BeatSelector.selectBeatsEnhanced(denseBeatPattern, {
            count,
            strategy: 'regular',
            audioDuration: 10
          });

          expect(result.beats).toHaveLength(count);
          expect(result.quality.coverage).toBeGreaterThan(0.5);
          expect(result.quality.spacing).toBeGreaterThan(0.3);
        }
      });
    });

    describe('Normal Usage (10-50)', () => {
      test('should handle typical slideshow picture counts', async () => {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(128, {
          sampleRate: 44100,
          channels: 1,
          duration: 30, // 30 second track
          bitDepth: 16,
          format: 'wav'
        });

        for (const count of [10, 16, 20, 24, 32, 48]) {
          const result = await parser.parseBuffer(audioData, {
            targetPictureCount: count,
            selectionMethod: 'adaptive'
          });

          expect(result.beats).toHaveLength(count);
          expect(result.metadata.analysis?.averageConfidence).toBeGreaterThan(0);
          expect(result.metadata.analysis?.beatDensity).toBeGreaterThan(0);
        }
      });

      test('should maintain consistent quality across normal ranges', () => {
        const richBeatPattern: Beat[] = Array.from({ length: 200 }, (_, i) => ({
          timestamp: i * 150 + Math.random() * 50, // Slightly irregular timing
          strength: Math.sin(i * 0.1) * 0.4 + 0.6, // Varying strength
          confidence: Math.random() * 0.3 + 0.7,
          metadata: {}
        }));

        for (const count of [10, 20, 30, 40, 50]) {
          const result = BeatSelector.selectBeatsEnhanced(richBeatPattern, {
            count,
            strategy: 'adaptive',
            audioDuration: 30
          });

          expect(result.beats).toHaveLength(count);
          expect(result.quality.overall).toBeGreaterThan(0.4);
          expect(result.quality.coverage).toBeGreaterThan(0.6);
        }
      });
    });

    describe('Large Requests (100-500)', () => {
      test('should stress test selection algorithm with large counts', async () => {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(140, {
          sampleRate: 44100,
          channels: 1,
          duration: 60, // 1 minute
          bitDepth: 16,
          format: 'wav'
        });

        for (const count of [100, 200, 300, 500]) {
          const startTime = Date.now();
          
          const result = await parser.parseBuffer(audioData, {
            targetPictureCount: count,
            selectionMethod: 'adaptive'
          });

          const processingTime = Date.now() - startTime;

          expect(result.beats.length).toBeLessThanOrEqual(count);
          expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
          expect(result.metadata.processingTime).toBeDefined();
        }
      });

      test('should maintain performance with large selection counts', () => {
        const largeBeatSet: Beat[] = Array.from({ length: 1000 }, (_, i) => ({
          timestamp: i * 100,
          strength: Math.random(),
          confidence: Math.random(),
          metadata: {}
        }));

        for (const count of [100, 250, 500]) {
          const startTime = Date.now();
          
          const result = BeatSelector.selectBeatsEnhanced(largeBeatSet, {
            count,
            strategy: 'adaptive',
            audioDuration: 100
          });

          const processingTime = Date.now() - startTime;

          expect(result.beats).toHaveLength(count);
          expect(processingTime).toBeLessThan(5000); // 5 second max
          expect(result.metadata.processingTime).toBeLessThan(5000);
        }
      });
    });

    describe('Extreme Requests (1000+)', () => {
      test('should handle extreme picture counts gracefully', () => {
        const moderateBeatSet: Beat[] = Array.from({ length: 500 }, (_, i) => ({
          timestamp: i * 200,
          strength: Math.random(),
          confidence: Math.random(),
          metadata: {}
        }));

        const result = BeatSelector.selectBeatsEnhanced(moderateBeatSet, {
          count: 1000,
          strategy: 'adaptive',
          audioDuration: 100
        });

        // Should return all available beats when count exceeds available
        expect(result.beats.length).toBeLessThanOrEqual(500);
        expect(result.metadata.totalCandidates).toBe(500);
      });

      test('should validate configuration for extreme requests', () => {
        const config: Partial<BeatSelectorConfig> = {
          count: 2000,
          strategy: 'adaptive',
          energyWeight: 0.5,
          regularityWeight: 0.3,
          musicalWeight: 0.2
        };

        const errors = BeatSelector.validateConfig(config);
        expect(errors).toHaveLength(0); // Should be valid
      });
    });
  });

  describe('Beat Selection Strategy Testing', () => {
    const createTestBeats = (count: number): Beat[] => {
      return Array.from({ length: count }, (_, i) => ({
        timestamp: i * 1000 + Math.random() * 200,
        strength: Math.random() * 0.6 + 0.4,
        confidence: Math.random() * 0.4 + 0.6,
        metadata: {}
      }));
    };

    describe('Energy Strategy', () => {
      test('should select highest-energy beats', () => {
        const testBeats: Beat[] = [
          { timestamp: 1000, strength: 0.3, confidence: 0.7, metadata: {} },
          { timestamp: 2000, strength: 0.9, confidence: 0.5, metadata: {} },
          { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 4000, strength: 0.5, confidence: 0.9, metadata: {} },
          { timestamp: 5000, strength: 0.8, confidence: 0.6, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(testBeats, {
          count: 3,
          strategy: 'energy'
        });

        expect(result.beats).toHaveLength(3);
        // Should be ordered by timestamp after selection
        expect(result.beats[0].timestamp).toBeLessThan(result.beats[1].timestamp);
        expect(result.beats[1].timestamp).toBeLessThan(result.beats[2].timestamp);
        
        // Should include high-strength beats
        const selectedStrengths = result.beats.map(b => b.strength);
        expect(Math.max(...selectedStrengths)).toBeGreaterThan(0.7);
      });

      test('should prioritize energy over temporal distribution', () => {
        const beats = createTestBeats(20);
        // Set specific high-energy beats
        beats[2].strength = 0.95;
        beats[7].strength = 0.90;
        beats[15].strength = 0.88;

        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: 3,
          strategy: 'energy'
        });

        const selectedStrengths = result.beats.map(b => b.strength).sort((a, b) => b - a);
        expect(selectedStrengths[0]).toBeGreaterThanOrEqual(0.88);
      });
    });

    describe('Regular Strategy', () => {
      test('should distribute beats evenly across time', () => {
        const beats = createTestBeats(20);
        const audioDuration = 10; // 10 seconds

        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: 5,
          strategy: 'regular',
          audioDuration
        });

        expect(result.beats).toHaveLength(5);
        
        // Check temporal distribution
        const intervals = [];
        for (let i = 1; i < result.beats.length; i++) {
          intervals.push(result.beats[i].timestamp - result.beats[i-1].timestamp);
        }

        const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        const expectedInterval = (audioDuration * 1000) / 5; // Convert to ms
        
        // Should have relatively consistent intervals
        expect(Math.abs(avgInterval - expectedInterval)).toBeLessThan(expectedInterval * 0.5);
        expect(result.quality.spacing).toBeGreaterThan(0.3);
      });

      test('should maintain regularity over energy', () => {
        const beats: Beat[] = [
          { timestamp: 0, strength: 0.9, confidence: 0.8, metadata: {} },
          { timestamp: 500, strength: 0.95, confidence: 0.9, metadata: {} },
          { timestamp: 2500, strength: 0.4, confidence: 0.6, metadata: {} },
          { timestamp: 5000, strength: 0.5, confidence: 0.7, metadata: {} },
          { timestamp: 7500, strength: 0.3, confidence: 0.5, metadata: {} },
          { timestamp: 10000, strength: 0.6, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: 3,
          strategy: 'regular',
          audioDuration: 10
        });

        expect(result.beats).toHaveLength(3);
        expect(result.quality.spacing).toBeGreaterThan(0.5);
      });
    });

    describe('Musical Strategy', () => {
      test('should consider musical context with tempo information', () => {
        const beats = createTestBeats(16);
        const tempo: Tempo = {
          bpm: 120,
          confidence: 0.8,
          timeSignature: { numerator: 4, denominator: 4 }
        };

        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: 8,
          strategy: 'musical'
        }, tempo);

        expect(result.beats).toHaveLength(8);
        expect(result.metadata.strategy).toBe('musical');
      });

      test('should handle musical strategy without tempo', () => {
        const beats = createTestBeats(12);

        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: 6,
          strategy: 'musical'
        });

        expect(result.beats).toHaveLength(6);
        // Should still work without tempo info
        expect(result.quality.overall).toBeGreaterThan(0);
      });
    });

    describe('Adaptive Strategy', () => {
      test('should combine multiple factors intelligently', () => {
        const beats = createTestBeats(24);
        
        const result = BeatSelector.selectBeatsEnhanced(beats, {
          count: 12,
          strategy: 'adaptive',
          energyWeight: 0.4,
          regularityWeight: 0.3,
          musicalWeight: 0.3
        });

        expect(result.beats).toHaveLength(12);
        expect(result.quality.overall).toBeGreaterThan(0.3);
        expect(result.quality.coverage).toBeGreaterThan(0.4);
        expect(result.quality.diversity).toBeGreaterThan(0);
      });

      test('should adapt weights dynamically', () => {
        const beats = createTestBeats(20);
        
        const configurations = [
          { energyWeight: 0.8, regularityWeight: 0.1, musicalWeight: 0.1 },
          { energyWeight: 0.1, regularityWeight: 0.8, musicalWeight: 0.1 },
          { energyWeight: 0.33, regularityWeight: 0.33, musicalWeight: 0.34 }
        ];

        configurations.forEach((config, index) => {
          const result = BeatSelector.selectBeatsEnhanced(beats, {
            count: 8,
            strategy: 'adaptive',
            ...config
          });

          expect(result.beats).toHaveLength(8);
          expect(result.quality.overall).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Audio Content vs Picture Count Testing', () => {
    describe('Short Audio with Many Pictures', () => {
      test('should handle 5-15 second audio with many picture requests', async () => {
        for (const duration of [5, 10, 15]) {
          const audioData = AudioTestFileGenerator.generateBeatsPattern(140, {
            sampleRate: 44100,
            channels: 1,
            duration,
            bitDepth: 16,
            format: 'wav'
          });

          for (const pictureCount of [20, 50, 100]) {
            const result = await parser.parseBuffer(audioData, {
              targetPictureCount: pictureCount,
              selectionMethod: 'adaptive'
            });

            // Should not exceed reasonable beat density
            const beatDensity = result.beats.length / duration;
            expect(beatDensity).toBeLessThan(10); // Max 10 beats per second
            expect(result.metadata.analysis?.beatDensity).toBeDefined();
          }
        }
      });

      test('should maintain quality with high picture density requests', () => {
        const shortAudioBeats: Beat[] = Array.from({ length: 30 }, (_, i) => ({
          timestamp: i * 167, // ~6 per second for 5 seconds
          strength: Math.random() * 0.5 + 0.5,
          confidence: Math.random() * 0.3 + 0.7,
          metadata: {}
        }));

        const result = BeatSelector.selectBeatsEnhanced(shortAudioBeats, {
          count: 50, // More than available
          strategy: 'adaptive',
          audioDuration: 5
        });

        expect(result.beats.length).toBeLessThanOrEqual(30);
        expect(result.quality.coverage).toBeGreaterThan(0.7);
      });
    });

    describe('Long Audio with Few Pictures', () => {
      test('should handle 5+ minute audio with few picture requests', async () => {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(100, {
          sampleRate: 44100,
          channels: 1,
          duration: 300, // 5 minutes
          bitDepth: 16,
          format: 'wav'
        });

        for (const pictureCount of [5, 10, 15]) {
          const result = await parser.parseBuffer(audioData, {
            targetPictureCount: pictureCount,
            selectionMethod: 'regular'
          });

          expect(result.beats).toHaveLength(pictureCount);
          
          // Should have good coverage across the long duration
          const timeSpan = result.beats[result.beats.length - 1].timestamp - result.beats[0].timestamp;
          expect(timeSpan).toBeGreaterThan(200000); // At least 200 seconds coverage
        }
      });

      test('should optimize spacing for sparse selections', () => {
        const longAudioBeats: Beat[] = Array.from({ length: 500 }, (_, i) => ({
          timestamp: i * 600, // One every 0.6 seconds for 300 seconds
          strength: Math.random() * 0.4 + 0.3,
          confidence: Math.random() * 0.4 + 0.6,
          metadata: {}
        }));

        const result = BeatSelector.selectBeatsEnhanced(longAudioBeats, {
          count: 8,
          strategy: 'regular',
          audioDuration: 300
        });

        expect(result.beats).toHaveLength(8);
        expect(result.quality.spacing).toBeGreaterThan(0.6);
        expect(result.quality.coverage).toBeGreaterThan(0.8);
      });
    });

    describe('Sparse vs Dense Beat Content', () => {
      test('should handle sparse beat content with many picture requests', () => {
        const sparseBeats: Beat[] = Array.from({ length: 5 }, (_, i) => ({
          timestamp: i * 5000, // Every 5 seconds
          strength: 0.8,
          confidence: 0.9,
          metadata: {}
        }));

        const result = BeatSelector.selectBeatsEnhanced(sparseBeats, {
          count: 20,
          strategy: 'adaptive',
          audioDuration: 25
        });

        expect(result.beats.length).toBeLessThanOrEqual(5);
        expect(result.quality.overall).toBeGreaterThan(0.5);
      });

      test('should handle dense beat content with few picture requests', () => {
        const denseBeats: Beat[] = Array.from({ length: 100 }, (_, i) => ({
          timestamp: i * 200, // Every 0.2 seconds
          strength: Math.random() * 0.6 + 0.4,
          confidence: Math.random() * 0.4 + 0.6,
          metadata: {}
        }));

        const result = BeatSelector.selectBeatsEnhanced(denseBeats, {
          count: 5,
          strategy: 'energy',
          audioDuration: 20
        });

        expect(result.beats).toHaveLength(5);
        expect(result.quality.diversity).toBeGreaterThan(0.3);
        expect(result.quality.spacing).toBeGreaterThan(0.5);
      });
    });

    describe('Silence and Ambient Audio', () => {
      test('should handle near-silence with picture requests', async () => {
        const quietAudio = AudioTestFileGenerator.generateQuietAudio({
          sampleRate: 44100,
          channels: 1,
          duration: 10,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(quietAudio, {
          targetPictureCount: 5,
          selectionMethod: 'regular'
        });

        // May find few or no beats in quiet audio
        expect(result.beats.length).toBeLessThanOrEqual(5);
        expect(result.metadata).toBeDefined();
      });

      test('should handle pure silence gracefully', async () => {
        const silence = AudioTestFileGenerator.generateSilence({
          sampleRate: 44100,
          channels: 1,
          duration: 5,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(silence, {
          targetPictureCount: 10,
          selectionMethod: 'adaptive'
        });

        expect(result.beats.length).toBeLessThanOrEqual(10);
        expect(result.metadata.processingTime).toBeGreaterThan(0);
      });
    });
  });

  describe('Quality Validation', () => {
    describe('Beat Distribution Quality', () => {
      test('should measure coverage across audio duration', () => {
        const beats: Beat[] = [
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 5000, strength: 0.6, confidence: 0.7, metadata: {} },
          { timestamp: 9000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const quality = BeatSelector.analyzeSelection(beats, beats, 10);
        
        expect(quality.coverage).toBeGreaterThan(0.7); // Good span coverage
        expect(quality.diversity).toBeGreaterThan(0); // Some diversity in strengths
        expect(quality.spacing).toBeGreaterThan(0.3); // Reasonable spacing
        expect(quality.quality).toBeGreaterThan(0.4); // Overall quality
      });

      test('should penalize poor distribution', () => {
        const clusterBeats: Beat[] = [
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 1100, strength: 0.6, confidence: 0.7, metadata: {} },
          { timestamp: 1200, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const quality = BeatSelector.analyzeSelection(clusterBeats, clusterBeats, 10);
        
        expect(quality.coverage).toBeLessThan(0.5); // Poor span coverage
        expect(quality.spacing).toBeLessThan(0.5); // Poor spacing
      });
    });

    describe('Timing Accuracy and Musical Coherence', () => {
      test('should validate beat timing with tempo context', () => {
        const tempo: Tempo = {
          bpm: 120,
          confidence: 0.9,
          timeSignature: { numerator: 4, denominator: 4 }
        };

        const alignedBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 500, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 1000, strength: 0.9, confidence: 0.9, metadata: {} },
          { timestamp: 1500, strength: 0.6, confidence: 0.7, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(alignedBeats, {
          count: 4,
          strategy: 'musical'
        }, tempo);

        expect(result.beats).toHaveLength(4);
        
        // Check if beats have tempo-related metadata
        result.beats.forEach(beat => {
          if (beat.metadata) {
            expect(beat.metadata.expectedTime).toBeDefined();
            expect(beat.metadata.beatNumber).toBeDefined();
          }
        });
      });

      test('should maintain musical coherence in selections', () => {
        const tempo: Tempo = {
          bpm: 100,
          confidence: 0.8,
          timeSignature: { numerator: 4, denominator: 4 }
        };

        const musicalBeats: Beat[] = Array.from({ length: 16 }, (_, i) => ({
          timestamp: i * 600, // 100 BPM = 600ms per beat
          strength: i % 4 === 0 ? 0.9 : 0.6, // Downbeats stronger
          confidence: 0.8,
          metadata: {}
        }));

        const result = BeatSelector.selectBeatsEnhanced(musicalBeats, {
          count: 8,
          strategy: 'musical',
          musicalWeight: 0.8
        }, tempo);

        expect(result.beats).toHaveLength(8);
        expect(result.quality.overall).toBeGreaterThan(0.5);
      });
    });

    describe('Confidence Score Reliability', () => {
      test('should track confidence scores in selections', () => {
        const beatsWithVaryingConfidence: Beat[] = Array.from({ length: 10 }, (_, i) => ({
          timestamp: i * 1000,
          strength: 0.7,
          confidence: i * 0.1 + 0.1, // 0.1 to 1.0
          metadata: {}
        }));

        const result = BeatSelector.selectBeatsEnhanced(beatsWithVaryingConfidence, {
          count: 5,
          strategy: 'adaptive'
        });

        const stats = BeatSelector.getSelectionStatistics(result);
        
        expect(stats.totalSelected).toBe(5);
        expect(stats.averageConfidence).toBeGreaterThan(0);
        expect(stats.averageConfidence).toBeLessThanOrEqual(1);
        expect(stats.averageStrength).toBeCloseTo(0.7, 1);
      });

      test('should prefer higher confidence beats in adaptive strategy', () => {
        const mixedConfidenceBeats: Beat[] = [
          { timestamp: 1000, strength: 0.6, confidence: 0.9, metadata: {} },
          { timestamp: 2000, strength: 0.8, confidence: 0.3, metadata: {} },
          { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 4000, strength: 0.5, confidence: 0.95, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(mixedConfidenceBeats, {
          count: 2,
          strategy: 'adaptive',
          energyWeight: 0.3,
          regularityWeight: 0.3,
          musicalWeight: 0.4
        });

        const stats = BeatSelector.getSelectionStatistics(result);
        expect(stats.averageConfidence).toBeGreaterThan(0.7);
      });
    });

    describe('Selection Diversity', () => {
      test('should maintain diversity in beat strengths', () => {
        const diverseBeats: Beat[] = [
          { timestamp: 1000, strength: 0.3, confidence: 0.8, metadata: {} },
          { timestamp: 2000, strength: 0.6, confidence: 0.8, metadata: {} },
          { timestamp: 3000, strength: 0.9, confidence: 0.8, metadata: {} },
          { timestamp: 4000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 5000, strength: 0.4, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(diverseBeats, {
          count: 3,
          strategy: 'adaptive'
        });

        expect(result.quality.diversity).toBeGreaterThan(0.3);
      });

      test('should avoid clustering in adaptive selections', () => {
        const clusteredBeats: Beat[] = [
          // Cluster 1
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 1100, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 1200, strength: 0.9, confidence: 0.9, metadata: {} },
          // Isolated beats
          { timestamp: 5000, strength: 0.6, confidence: 0.7, metadata: {} },
          { timestamp: 9000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(clusteredBeats, {
          count: 3,
          strategy: 'adaptive',
          audioDuration: 10
        });

        expect(result.beats).toHaveLength(3);
        expect(result.quality.spacing).toBeGreaterThan(0.3);
      });
    });
  });

  describe('Synthetic Beat Generation Testing', () => {
    describe('Insufficient Available Beats', () => {
      test('should handle N > available beats gracefully', () => {
        const fewBeats: Beat[] = [
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          fewBeats, 
          5, 
          5, // 5 second duration
          { bpm: 120, confidence: 0.8 }
        );

        expect(result.length).toBeGreaterThanOrEqual(2); // At least the original beats
        expect(result.length).toBeLessThanOrEqual(5);
      });

      test('should generate synthetic beats maintaining rhythm', () => {
        const sparseBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 2000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const tempo: Tempo = { bpm: 120, confidence: 0.8 };
        const result = BeatSelector.handleInsufficientBeats(sparseBeats, 8, 4, tempo);

        expect(result.length).toBeLessThanOrEqual(8);
        
        // Check for synthetic beat markers
        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );
        expect(syntheticBeats.length).toBeGreaterThan(0);
      });
    });

    describe('Interpolation Quality', () => {
      test('should maintain consistent confidence scoring for synthetic beats', () => {
        const originalBeats: Beat[] = [
          { timestamp: 0, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          originalBeats, 
          5, 
          10,
          { bpm: 60, confidence: 0.9 }
        );

        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );

        syntheticBeats.forEach(beat => {
          expect(beat.confidence).toBeGreaterThan(0);
          expect(beat.confidence).toBeLessThan(0.8); // Lower than original
          expect(beat.strength).toBeGreaterThan(0);
          expect(beat.metadata?.interpolated).toBe(true);
        });
      });

      test('should place synthetic beats on musical grid', () => {
        const singleBeat: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const tempo: Tempo = { bpm: 120, confidence: 0.8 }; // 500ms per beat
        const result = BeatSelector.handleInsufficientBeats(singleBeat, 4, 2, tempo);

        // Check if synthetic beats align with tempo grid
        const expectedTimes = [0, 500, 1000, 1500];
        result.forEach(beat => {
          const closestExpected = expectedTimes.reduce((prev, curr) => 
            Math.abs(curr - beat.timestamp) < Math.abs(prev - beat.timestamp) ? curr : prev
          );
          expect(Math.abs(beat.timestamp - closestExpected)).toBeLessThan(100);
        });
      });
    });
  });

  describe('Performance Benchmarks', () => {
    describe('Large Picture Count Performance', () => {
      test('should complete large selections within time limits', () => {
        const largeBeatSet: Beat[] = Array.from({ length: 2000 }, (_, i) => ({
          timestamp: i * 50,
          strength: Math.random(),
          confidence: Math.random(),
          metadata: {}
        }));

        const performanceTests = [
          { count: 100, maxTime: 1000 },
          { count: 500, maxTime: 3000 },
          { count: 1000, maxTime: 5000 }
        ];

        performanceTests.forEach(test => {
          const startTime = Date.now();
          const result = BeatSelector.selectBeatsEnhanced(largeBeatSet, {
            count: test.count,
            strategy: 'adaptive'
          });
          const duration = Date.now() - startTime;

          expect(result.beats).toHaveLength(test.count);
          expect(duration).toBeLessThan(test.maxTime);
          expect(result.metadata.processingTime).toBeLessThan(test.maxTime);
        });
      });

      test('should scale efficiently with input size', () => {
        const sizes = [100, 500, 1000, 2000];
        const results: Array<{ size: number; time: number }> = [];

        sizes.forEach(size => {
          const beats: Beat[] = Array.from({ length: size }, (_, i) => ({
            timestamp: i * 100,
            strength: Math.random(),
            confidence: Math.random(),
            metadata: {}
          }));

          const startTime = Date.now();
          BeatSelector.selectBeatsEnhanced(beats, {
            count: Math.min(100, size),
            strategy: 'adaptive'
          });
          const duration = Date.now() - startTime;

          results.push({ size, time: duration });
        });

        // Should not grow exponentially
        for (let i = 1; i < results.length; i++) {
          const growthRatio = results[i].time / results[i-1].time;
          const sizeRatio = results[i].size / results[i-1].size;
          expect(growthRatio).toBeLessThan(sizeRatio * 2); // Should be sub-quadratic
        }
      });
    });

    describe('Memory Usage Optimization', () => {
      test('should not leak memory during large operations', async () => {
        const initialMemory = process.memoryUsage().heapUsed;

        // Perform many selections to test for leaks
        for (let i = 0; i < 100; i++) {
          const beats: Beat[] = Array.from({ length: 200 }, (_, j) => ({
            timestamp: j * 100,
            strength: Math.random(),
            confidence: Math.random(),
            metadata: {}
          }));

          BeatSelector.selectBeatsEnhanced(beats, {
            count: 50,
            strategy: 'adaptive'
          });
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryGrowth = finalMemory - initialMemory;

        // Should not grow significantly (allowing for some GC variations)
        expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // 10MB threshold
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid configurations gracefully', () => {
      const invalidConfigs = [
        { count: -1, strategy: 'adaptive' },
        { count: 0.5, strategy: 'adaptive' },
        { count: 10, strategy: 'invalid' as any },
        { count: 10, energyWeight: -0.1, strategy: 'adaptive' },
        { count: 10, energyWeight: 1.1, strategy: 'adaptive' }
      ];

      invalidConfigs.forEach(config => {
        const errors = BeatSelector.validateConfig(config);
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    test('should handle malformed beat data', () => {
      const malformedBeats = [
        { timestamp: NaN, strength: 0.5, confidence: 0.8, metadata: {} },
        { timestamp: 1000, strength: Infinity, confidence: 0.8, metadata: {} },
        { timestamp: 2000, strength: 0.5, confidence: -0.1, metadata: {} }
      ] as Beat[];

      // Should not crash, may filter out invalid beats
      expect(() => {
        BeatSelector.selectBeatsEnhanced(malformedBeats, {
          count: 2,
          strategy: 'adaptive'
        });
      }).not.toThrow();
    });

    test('should handle concurrent selection requests', async () => {
      const beats = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i * 100,
        strength: Math.random(),
        confidence: Math.random(),
        metadata: {}
      }));

      // Run multiple selections concurrently
      const promises = Array.from({ length: 10 }, () => 
        Promise.resolve(BeatSelector.selectBeatsEnhanced(beats, {
          count: 20,
          strategy: 'adaptive'
        }))
      );

      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result.beats).toHaveLength(20);
        expect(result.quality.overall).toBeGreaterThan(0);
      });
    });
  });

  describe('Integration with Real-World Scenarios', () => {
    test('should handle typical slideshow use case', async () => {
      const audioData = AudioTestFileGenerator.generateBeatsPattern(128, {
        sampleRate: 44100,
        channels: 1,
        duration: 180, // 3 minute song
        bitDepth: 16,
        format: 'wav'
      });

      const result = await parser.parseBuffer(audioData, {
        targetPictureCount: 24, // Typical photo slideshow
        selectionMethod: 'adaptive'
      });

      expect(result.beats).toHaveLength(24);
      expect(result.metadata.analysis?.qualityScore).toBeGreaterThan(0.5);
      
      // Should have good temporal distribution
      const timeSpan = result.beats[result.beats.length - 1].timestamp - result.beats[0].timestamp;
      expect(timeSpan).toBeGreaterThan(120000); // At least 2 minutes coverage
    });

    test('should adapt to different music genres', async () => {
      const genreTests = [
        { bpm: 70, name: 'ballad' },
        { bpm: 120, name: 'pop' },
        { bpm: 180, name: 'electronic' }
      ];

      for (const genre of genreTests) {
        const audioData = AudioTestFileGenerator.generateBeatsPattern(genre.bpm, {
          sampleRate: 44100,
          channels: 1,
          duration: 60,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(audioData, {
          targetPictureCount: 16,
          selectionMethod: 'musical'
        });

        expect(result.beats).toHaveLength(16);
        expect(result.metadata.analysis?.beatDensity).toBeGreaterThan(0);
      });
    });
  });
});