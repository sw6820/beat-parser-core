/**
 * Synthetic Beat Generation Test Suite
 * 
 * Tests the system's ability to handle cases where requested picture count
 * exceeds available beats through intelligent synthetic beat generation
 * and interpolation algorithms.
 */

import { BeatSelector } from '../core/BeatSelector';
import { BeatParser } from '../core/BeatParser';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import type { Beat, Tempo, BeatResult } from '../types';

describe('Synthetic Beat Generation Test Suite', () => {
  let parser: BeatParser;

  beforeEach(() => {
    parser = new BeatParser({
      sampleRate: 44100,
      confidenceThreshold: 0.1,
      includeMetadata: true
    });
  });

  afterEach(async () => {
    await parser.cleanup();
  });

  describe('Insufficient Beat Handling', () => {
    describe('Basic Insufficient Beat Cases', () => {
      test('should return all available beats when N > available', () => {
        const limitedBeats: Beat[] = [
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(limitedBeats, {
          count: 10, // Request more than available
          strategy: 'adaptive'
        });

        expect(result.beats.length).toBeLessThanOrEqual(2);
        expect(result.metadata.totalCandidates).toBe(2);
        expect(result.quality.overall).toBeGreaterThan(0);
      });

      test('should handle edge case of zero available beats', () => {
        const noBeats: Beat[] = [];

        const result = BeatSelector.selectBeatsEnhanced(noBeats, {
          count: 5,
          strategy: 'adaptive'
        });

        expect(result.beats).toHaveLength(0);
        expect(result.quality.overall).toBe(0);
        expect(result.metadata.totalCandidates).toBe(0);
      });

      test('should handle single beat with multiple requests', () => {
        const singleBeat: Beat[] = [
          { timestamp: 5000, strength: 0.9, confidence: 0.95, metadata: {} }
        ];

        const result = BeatSelector.selectBeatsEnhanced(singleBeat, {
          count: 8,
          strategy: 'energy'
        });

        expect(result.beats).toHaveLength(1);
        expect(result.beats[0].timestamp).toBe(5000);
        expect(result.beats[0].strength).toBe(0.9);
        expect(result.beats[0].confidence).toBe(0.95);
      });
    });

    describe('Tempo-Based Synthetic Generation', () => {
      test('should generate synthetic beats with tempo information', () => {
        const sparseBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 2000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const tempo: Tempo = {
          bpm: 120, // 500ms per beat
          confidence: 0.9
        };

        const result = BeatSelector.handleInsufficientBeats(
          sparseBeats, 
          8, // Request 8 beats
          4, // 4 second duration
          tempo
        );

        expect(result.length).toBeGreaterThan(2);
        expect(result.length).toBeLessThanOrEqual(8);

        // Check for synthetic beats
        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );
        expect(syntheticBeats.length).toBeGreaterThan(0);

        // Synthetic beats should align with tempo grid
        syntheticBeats.forEach(beat => {
          const expectedBeatTime = Math.round(beat.timestamp / 500) * 500; // 500ms per beat at 120 BPM
          expect(Math.abs(beat.timestamp - expectedBeatTime)).toBeLessThan(50);
        });
      });

      test('should maintain consistent tempo intervals in synthetic beats', () => {
        const isolatedBeats: Beat[] = [
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const tempo: Tempo = {
          bpm: 100, // 600ms per beat
          confidence: 0.8
        };

        const result = BeatSelector.handleInsufficientBeats(
          isolatedBeats,
          6,
          3.6, // 3.6 seconds = 6 beats at 100 BPM
          tempo
        );

        expect(result.length).toBeLessThanOrEqual(6);

        // Check interval consistency for synthetic beats
        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        ).sort((a, b) => a.timestamp - b.timestamp);

        if (syntheticBeats.length > 1) {
          const intervals = [];
          for (let i = 1; i < syntheticBeats.length; i++) {
            intervals.push(syntheticBeats[i].timestamp - syntheticBeats[i - 1].timestamp);
          }

          const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
          const expectedInterval = 600; // 100 BPM = 600ms

          expect(Math.abs(avgInterval - expectedInterval)).toBeLessThan(100);
        }
      });

      test('should handle different tempo ranges for synthetic generation', () => {
        const testCases = [
          { bpm: 60, expectedInterval: 1000 },
          { bpm: 120, expectedInterval: 500 },
          { bpm: 180, expectedInterval: 333.33 },
          { bpm: 200, expectedInterval: 300 }
        ];

        testCases.forEach(testCase => {
          const singleBeat: Beat[] = [
            { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} }
          ];

          const tempo: Tempo = {
            bpm: testCase.bpm,
            confidence: 0.8
          };

          const result = BeatSelector.handleInsufficientBeats(
            singleBeat,
            4,
            3, // 3 second duration
            tempo
          );

          const syntheticBeats = result.filter(beat => 
            beat.metadata && beat.metadata.synthetic === true
          ).sort((a, b) => a.timestamp - b.timestamp);

          if (syntheticBeats.length > 1) {
            const interval = syntheticBeats[1].timestamp - syntheticBeats[0].timestamp;
            expect(Math.abs(interval - testCase.expectedInterval)).toBeLessThan(testCase.expectedInterval * 0.1);
          }
        });
      });
    });

    describe('Quality Assessment of Synthetic Beats', () => {
      test('should assign appropriate confidence scores to synthetic beats', () => {
        const originalBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          originalBeats,
          6,
          3,
          { bpm: 120, confidence: 0.9 }
        );

        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );

        const originalAvgConfidence = originalBeats.reduce((sum, b) => sum + b.confidence, 0) / originalBeats.length;

        syntheticBeats.forEach(beat => {
          // Synthetic beats should have lower confidence than originals
          expect(beat.confidence).toBeLessThan(originalAvgConfidence);
          expect(beat.confidence).toBeGreaterThan(0);
          expect(beat.confidence).toBeLessThanOrEqual(1);
        });
      });

      test('should assign appropriate strength scores to synthetic beats', () => {
        const originalBeats: Beat[] = [
          { timestamp: 500, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 2500, strength: 0.6, confidence: 0.7, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          originalBeats,
          5,
          3,
          { bpm: 120, confidence: 0.8 }
        );

        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );

        const originalAvgStrength = originalBeats.reduce((sum, b) => sum + b.strength, 0) / originalBeats.length;

        syntheticBeats.forEach(beat => {
          // Synthetic beats should have slightly lower strength
          expect(beat.strength).toBeLessThan(originalAvgStrength * 1.1);
          expect(beat.strength).toBeGreaterThan(0);
          expect(beat.strength).toBeLessThanOrEqual(1);
        });
      });

      test('should mark synthetic beats with proper metadata', () => {
        const fewBeats: Beat[] = [
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          fewBeats,
          4,
          2,
          { bpm: 150, confidence: 0.8 }
        );

        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );

        syntheticBeats.forEach(beat => {
          expect(beat.metadata).toBeDefined();
          expect(beat.metadata!.synthetic).toBe(true);
          expect(beat.metadata!.interpolated).toBe(true);
        });

        // Original beats should not be marked as synthetic
        const originalBeats = result.filter(beat => 
          !beat.metadata || beat.metadata.synthetic !== true
        );
        originalBeats.forEach(beat => {
          expect(beat.metadata?.synthetic).not.toBe(true);
        });
      });
    });

    describe('Gap Filling Algorithms', () => {
      test('should fill gaps intelligently based on existing beat patterns', () => {
        const gappyBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} },
          // Gap from 1000 to 4000
          { timestamp: 4000, strength: 0.6, confidence: 0.7, metadata: {} },
          { timestamp: 5000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          gappyBeats,
          8,
          5,
          { bpm: 120, confidence: 0.8 }
        );

        expect(result.length).toBeGreaterThan(4);
        
        // Should fill the gap between 1000 and 4000
        const beatsInGap = result.filter(beat => 
          beat.timestamp > 1000 && beat.timestamp < 4000
        );
        expect(beatsInGap.length).toBeGreaterThan(0);

        // Gap-filling beats should be marked as synthetic
        beatsInGap.forEach(beat => {
          expect(beat.metadata?.synthetic).toBe(true);
        });
      });

      test('should avoid over-densification in already dense regions', () => {
        const denseThenSparse: Beat[] = [
          // Dense region
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 300, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 600, strength: 0.6, confidence: 0.7, metadata: {} },
          { timestamp: 900, strength: 0.8, confidence: 0.9, metadata: {} },
          // Sparse region
          { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          denseThenSparse,
          8,
          3,
          { bpm: 120, confidence: 0.8 }
        );

        // Should preferentially fill sparse regions
        const syntheticInSparse = result.filter(beat => 
          beat.timestamp > 1000 && beat.timestamp < 3000 &&
          beat.metadata && beat.metadata.synthetic === true
        );

        const syntheticInDense = result.filter(beat => 
          beat.timestamp < 1000 &&
          beat.metadata && beat.metadata.synthetic === true
        );

        expect(syntheticInSparse.length).toBeGreaterThanOrEqual(syntheticInDense.length);
      });

      test('should respect minimum spacing constraints in gap filling', () => {
        const sparseBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 5000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          sparseBeats,
          10,
          5,
          { bpm: 120, confidence: 0.8 }
        );

        // Check minimum spacing between all beats
        const sortedResults = result.sort((a, b) => a.timestamp - b.timestamp);
        for (let i = 1; i < sortedResults.length; i++) {
          const spacing = sortedResults[i].timestamp - sortedResults[i - 1].timestamp;
          expect(spacing).toBeGreaterThan(100); // Minimum spacing
        }
      });
    });

    describe('Integration with Real Audio Analysis', () => {
      test('should handle insufficient beats in quiet audio sections', async () => {
        const quietAudio = AudioTestFileGenerator.generateQuietAudio({
          sampleRate: 44100,
          channels: 1,
          duration: 10,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(quietAudio, {
          targetPictureCount: 15,
          selectionMethod: 'regular'
        });

        // May have few detected beats, but should not crash
        expect(result.beats.length).toBeLessThanOrEqual(15);
        expect(result.metadata.processingTime).toBeGreaterThan(0);

        // Any synthetic beats should be marked appropriately
        const syntheticBeats = result.beats.filter(beat => 
          beat.metadata && beat.metadata.interpolated === true
        );

        syntheticBeats.forEach(beat => {
          expect(beat.confidence).toBeGreaterThan(0);
          expect(beat.strength).toBeGreaterThan(0);
        });
      });

      test('should handle insufficient beats in sparse rhythmic content', async () => {
        // Create audio with very sparse beats
        const sparseAudio = AudioTestFileGenerator.generateBeatsPattern(40, { // Very slow tempo
          sampleRate: 44100,
          channels: 1,
          duration: 20,
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(sparseAudio, {
          targetPictureCount: 30, // More than likely to be detected
          selectionMethod: 'adaptive'
        });

        expect(result.beats.length).toBeLessThanOrEqual(30);

        // Should maintain reasonable quality even with synthetic additions
        if (result.metadata.analysis?.qualityScore !== undefined) {
          expect(result.metadata.analysis.qualityScore).toBeGreaterThan(0.2);
        }
      });

      test('should maintain temporal coherence with synthetic beats in real audio', async () => {
        const regularAudio = AudioTestFileGenerator.generateBeatsPattern(100, {
          sampleRate: 44100,
          channels: 1,
          duration: 6, // 6 seconds at 100 BPM = 10 beats expected
          bitDepth: 16,
          format: 'wav'
        });

        const result = await parser.parseBuffer(regularAudio, {
          targetPictureCount: 20, // Request double
          selectionMethod: 'musical'
        });

        // Check temporal distribution
        const sortedBeats = result.beats.sort((a, b) => a.timestamp - b.timestamp);
        
        if (sortedBeats.length > 1) {
          const intervals = [];
          for (let i = 1; i < sortedBeats.length; i++) {
            intervals.push(sortedBeats[i].timestamp - sortedBeats[i - 1].timestamp);
          }

          const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
          const intervalVariance = intervals.reduce((sum, val) => {
            const diff = val - avgInterval;
            return sum + diff * diff;
          }, 0) / intervals.length;

          // Should maintain reasonable regularity
          const stdDev = Math.sqrt(intervalVariance);
          expect(stdDev / avgInterval).toBeLessThan(0.8); // Coefficient of variation < 80%
        }
      });
    });

    describe('Performance and Scalability', () => {
      test('should handle large synthetic generation requests efficiently', () => {
        const fewBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 2000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 4000, strength: 0.6, confidence: 0.7, metadata: {} }
        ];

        const largeCounts = [100, 250, 500];

        largeCounts.forEach(count => {
          const startTime = Date.now();
          
          const result = BeatSelector.handleInsufficientBeats(
            fewBeats,
            count,
            count / 2, // Reasonable duration
            { bpm: 120, confidence: 0.8 }
          );

          const processingTime = Date.now() - startTime;

          expect(result.length).toBeGreaterThan(3);
          expect(result.length).toBeLessThanOrEqual(count);
          expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds
        });
      });

      test('should not consume excessive memory during synthetic generation', () => {
        const initialMemory = process.memoryUsage().heapUsed;

        // Generate multiple large synthetic beat sets
        for (let i = 0; i < 10; i++) {
          const baseBeats: Beat[] = [
            { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} }
          ];

          BeatSelector.handleInsufficientBeats(
            baseBeats,
            200,
            100,
            { bpm: 120, confidence: 0.8 }
          );
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;

        // Should not increase memory significantly
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB threshold
      });
    });

    describe('Edge Cases and Error Handling', () => {
      test('should handle invalid tempo information gracefully', () => {
        const beats: Beat[] = [
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const invalidTempos = [
          { bpm: 0, confidence: 0.8 },
          { bpm: -60, confidence: 0.8 },
          { bpm: 1000, confidence: 0.8 }, // Unrealistically fast
          undefined
        ];

        invalidTempos.forEach(tempo => {
          expect(() => {
            const result = BeatSelector.handleInsufficientBeats(
              beats,
              5,
              3,
              tempo as any
            );
            expect(result.length).toBeGreaterThan(0);
          }).not.toThrow();
        });
      });

      test('should handle extreme duration requests', () => {
        const singleBeat: Beat[] = [
          { timestamp: 5000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const extremeCases = [
          { duration: 0.1, count: 10 },      // Very short duration, many beats
          { duration: 1000, count: 5 },     // Very long duration, few beats
          { duration: -1, count: 5 },       // Invalid negative duration
          { duration: 0, count: 5 }         // Zero duration
        ];

        extremeCases.forEach(testCase => {
          expect(() => {
            const result = BeatSelector.handleInsufficientBeats(
              singleBeat,
              testCase.count,
              testCase.duration,
              { bpm: 120, confidence: 0.8 }
            );
            expect(result.length).toBeGreaterThan(0);
          }).not.toThrow();
        });
      });

      test('should handle malformed beat metadata during synthetic generation', () => {
        const malformedBeats: Beat[] = [
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: null as any },
          { timestamp: 2000, strength: 0.7, confidence: 0.8, metadata: undefined as any },
          { timestamp: 3000, strength: 0.6, confidence: 0.7, metadata: { corrupted: true, data: null } }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          malformedBeats,
          8,
          4,
          { bpm: 120, confidence: 0.8 }
        );

        expect(result.length).toBeGreaterThan(3);
        
        // Synthetic beats should still have proper metadata
        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );

        syntheticBeats.forEach(beat => {
          expect(beat.metadata).toBeDefined();
          expect(beat.metadata!.synthetic).toBe(true);
          expect(beat.metadata!.interpolated).toBe(true);
        });
      });
    });

    describe('Quality Assurance for Synthetic Beats', () => {
      test('should maintain beat quality standards for synthetic beats', () => {
        const highQualityOriginals: Beat[] = [
          { timestamp: 0, strength: 0.9, confidence: 0.95, metadata: {} },
          { timestamp: 2000, strength: 0.85, confidence: 0.9, metadata: {} }
        ];

        const result = BeatSelector.handleInsufficientBeats(
          highQualityOriginals,
          6,
          3,
          { bpm: 120, confidence: 0.9 }
        );

        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );

        // Synthetic beats should maintain reasonable quality relative to originals
        const originalAvgQuality = highQualityOriginals.reduce((sum, b) => 
          sum + (b.strength * b.confidence), 0) / highQualityOriginals.length;

        syntheticBeats.forEach(beat => {
          const syntheticQuality = beat.strength * beat.confidence;
          expect(syntheticQuality).toBeGreaterThan(originalAvgQuality * 0.5); // At least half the quality
          expect(syntheticQuality).toBeLessThan(originalAvgQuality * 1.1); // Not unrealistically high
        });
      });

      test('should validate synthetic beat placement accuracy', () => {
        const preciseBeats: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const tempo: Tempo = {
          bpm: 120, // Exactly 500ms per beat
          confidence: 0.95
        };

        const result = BeatSelector.handleInsufficientBeats(
          preciseBeats,
          5,
          2.5, // 5 beats in 2.5 seconds
          tempo
        );

        const syntheticBeats = result.filter(beat => 
          beat.metadata && beat.metadata.synthetic === true
        );

        // Check timing accuracy of synthetic beats
        syntheticBeats.forEach(beat => {
          const expectedBeatIndex = Math.round(beat.timestamp / 500);
          const expectedTime = expectedBeatIndex * 500;
          const timingError = Math.abs(beat.timestamp - expectedTime);
          
          expect(timingError).toBeLessThan(50); // Within 50ms of expected time
        });
      });
    });
  });
});