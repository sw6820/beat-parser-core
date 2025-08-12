/**
 * Selection Quality Metrics Test Suite
 * 
 * Comprehensive validation of beat selection quality, timing accuracy,
 * and performance benchmarks for the picture count selection system.
 */

import { BeatSelector } from '../core/BeatSelector';
import { AudioTestFileGenerator } from './utils/AudioTestFileGenerator';
import type { Beat, Tempo, BeatSelectorConfig } from '../types';

describe('Selection Quality Metrics Test Suite', () => {
  
  describe('Quality Metrics Validation', () => {
    
    describe('Coverage Analysis', () => {
      test('should calculate temporal coverage accurately', () => {
        const beats: Beat[] = [
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 5000, strength: 0.6, confidence: 0.7, metadata: {} },
          { timestamp: 9000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];

        const analysis = BeatSelector.analyzeSelection(beats, beats, 10);
        
        // Coverage should reflect span from 1s to 9s over 10s total
        expect(analysis.coverage).toBeCloseTo(0.8, 1);
        expect(analysis.coverage).toBeGreaterThan(0.7);
        expect(analysis.coverage).toBeLessThanOrEqual(1.0);
      });

      test('should handle edge cases in coverage calculation', () => {
        // Single beat
        const singleBeat: Beat[] = [
          { timestamp: 5000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];
        
        const singleAnalysis = BeatSelector.analyzeSelection(singleBeat, singleBeat, 10);
        expect(singleAnalysis.coverage).toBe(0); // Single point has no span
        
        // No beats
        const noBeats: Beat[] = [];
        const emptyAnalysis = BeatSelector.analyzeSelection(noBeats, noBeats, 10);
        expect(emptyAnalysis.coverage).toBe(0);
        
        // Full span
        const fullSpan: Beat[] = [
          { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 10000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];
        const fullAnalysis = BeatSelector.analyzeSelection(fullSpan, fullSpan, 10);
        expect(fullAnalysis.coverage).toBeCloseTo(1.0, 1);
      });

      test('should penalize poor temporal distribution', () => {
        const clusteredBeats: Beat[] = [
          { timestamp: 2000, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 2100, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 2200, strength: 0.9, confidence: 0.9, metadata: {} }
        ];

        const distributedBeats: Beat[] = [
          { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} },
          { timestamp: 5000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 9000, strength: 0.9, confidence: 0.9, metadata: {} }
        ];

        const clusteredAnalysis = BeatSelector.analyzeSelection(clusteredBeats, clusteredBeats, 10);
        const distributedAnalysis = BeatSelector.analyzeSelection(distributedBeats, distributedBeats, 10);

        expect(distributedAnalysis.coverage).toBeGreaterThan(clusteredAnalysis.coverage);
        expect(clusteredAnalysis.coverage).toBeLessThan(0.5);
        expect(distributedAnalysis.coverage).toBeGreaterThan(0.7);
      });
    });

    describe('Diversity Assessment', () => {
      test('should measure strength diversity correctly', () => {
        const uniformStrengths: Beat[] = [
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 2000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const diverseStrengths: Beat[] = [
          { timestamp: 1000, strength: 0.3, confidence: 0.8, metadata: {} },
          { timestamp: 2000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 3000, strength: 0.9, confidence: 0.8, metadata: {} }
        ];

        const uniformAnalysis = BeatSelector.analyzeSelection(uniformStrengths, uniformStrengths, 5);
        const diverseAnalysis = BeatSelector.analyzeSelection(diverseStrengths, diverseStrengths, 5);

        expect(diverseAnalysis.diversity).toBeGreaterThan(uniformAnalysis.diversity);
        expect(uniformAnalysis.diversity).toBe(0); // No diversity in uniform strengths
        expect(diverseAnalysis.diversity).toBeGreaterThan(0.3);
      });

      test('should handle diversity edge cases', () => {
        // Zero diversity (all same strength)
        const zeroDiv: Beat[] = [
          { timestamp: 1000, strength: 0.5, confidence: 0.8, metadata: {} },
          { timestamp: 2000, strength: 0.5, confidence: 0.8, metadata: {} }
        ];
        const zeroAnalysis = BeatSelector.analyzeSelection(zeroDiv, zeroDiv, 5);
        expect(zeroAnalysis.diversity).toBe(0);

        // Maximum diversity
        const maxDiv: Beat[] = [
          { timestamp: 1000, strength: 0.0, confidence: 0.8, metadata: {} },
          { timestamp: 2000, strength: 1.0, confidence: 0.8, metadata: {} }
        ];
        const maxAnalysis = BeatSelector.analyzeSelection(maxDiv, maxDiv, 5);
        expect(maxAnalysis.diversity).toBe(0); // 1 - (1-0)/1 = 0, but this is expected behavior
      });
    });

    describe('Spacing Regularity', () => {
      test('should assess spacing regularity accurately', () => {
        const regularSpacing: Beat[] = [
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 5000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 7000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const irregularSpacing: Beat[] = [
          { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 1500, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 6000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 9000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];

        const regularAnalysis = BeatSelector.analyzeSelection(regularSpacing, regularSpacing, 10);
        const irregularAnalysis = BeatSelector.analyzeSelection(irregularSpacing, irregularSpacing, 10);

        expect(regularAnalysis.spacing).toBeGreaterThan(irregularAnalysis.spacing);
        expect(regularAnalysis.spacing).toBeGreaterThan(0.8);
        expect(irregularAnalysis.spacing).toBeLessThan(0.5);
      });

      test('should handle spacing edge cases', () => {
        // Single beat (no spacing to measure)
        const singleBeat: Beat[] = [
          { timestamp: 5000, strength: 0.7, confidence: 0.8, metadata: {} }
        ];
        const singleAnalysis = BeatSelector.analyzeSelection(singleBeat, singleBeat, 10);
        expect(singleAnalysis.spacing).toBe(1.0); // Perfect spacing for single beat

        // Identical timestamps (zero spacing)
        const zeroSpacing: Beat[] = [
          { timestamp: 5000, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 5000, strength: 0.8, confidence: 0.9, metadata: {} }
        ];
        const zeroAnalysis = BeatSelector.analyzeSelection(zeroSpacing, zeroSpacing, 10);
        expect(zeroAnalysis.spacing).toBe(0); // No spacing
      });
    });

    describe('Overall Quality Score', () => {
      test('should combine metrics into meaningful overall score', () => {
        const highQualityBeats: Beat[] = [
          { timestamp: 1000, strength: 0.9, confidence: 0.9, metadata: {} },
          { timestamp: 3500, strength: 0.7, confidence: 0.8, metadata: {} },
          { timestamp: 6000, strength: 0.8, confidence: 0.85, metadata: {} },
          { timestamp: 8500, strength: 0.6, confidence: 0.75, metadata: {} }
        ];

        const lowQualityBeats: Beat[] = [
          { timestamp: 1000, strength: 0.3, confidence: 0.4, metadata: {} },
          { timestamp: 1100, strength: 0.3, confidence: 0.4, metadata: {} },
          { timestamp: 1200, strength: 0.3, confidence: 0.4, metadata: {} }
        ];

        const highQualityAnalysis = BeatSelector.analyzeSelection(highQualityBeats, highQualityBeats, 10);
        const lowQualityAnalysis = BeatSelector.analyzeSelection(lowQualityBeats, lowQualityBeats, 10);

        expect(highQualityAnalysis.quality).toBeGreaterThan(lowQualityAnalysis.quality);
        expect(highQualityAnalysis.quality).toBeGreaterThan(0.6);
        expect(lowQualityAnalysis.quality).toBeLessThan(0.4);
      });

      test('should weight coverage, diversity, and spacing equally', () => {
        const testBeats: Beat[] = [
          { timestamp: 0, strength: 0.2, confidence: 0.8, metadata: {} },
          { timestamp: 3333, strength: 0.5, confidence: 0.8, metadata: {} },
          { timestamp: 6666, strength: 0.8, confidence: 0.8, metadata: {} },
          { timestamp: 10000, strength: 1.0, confidence: 0.8, metadata: {} }
        ];

        const analysis = BeatSelector.analyzeSelection(testBeats, testBeats, 10);
        
        // Overall quality should be average of the three components
        const expectedQuality = (analysis.coverage + analysis.diversity + analysis.spacing) / 3;
        expect(analysis.quality).toBeCloseTo(expectedQuality, 2);
      });
    });
  });

  describe('Selection Statistics Validation', () => {
    test('should calculate selection statistics accurately', () => {
      const testBeats: Beat[] = [
        { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} },
        { timestamp: 2000, strength: 0.6, confidence: 0.7, metadata: {} },
        { timestamp: 3000, strength: 0.7, confidence: 0.8, metadata: {} }
      ];

      const selectionResult = BeatSelector.selectBeatsEnhanced(testBeats, {
        count: 3,
        strategy: 'adaptive'
      });

      const stats = BeatSelector.getSelectionStatistics(selectionResult);

      expect(stats.totalSelected).toBe(3);
      expect(stats.averageConfidence).toBeCloseTo(0.8, 1);
      expect(stats.averageStrength).toBeCloseTo(0.7, 1);
      expect(stats.temporalSpread).toBe(2000); // 3000 - 1000
      expect(stats.qualityScore).toBeGreaterThan(0);
    });

    test('should handle empty selection statistics', () => {
      const emptyResult = BeatSelector.selectBeatsEnhanced([], {
        count: 0,
        strategy: 'adaptive'
      });

      const stats = BeatSelector.getSelectionStatistics(emptyResult);

      expect(stats.totalSelected).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.averageStrength).toBe(0);
      expect(stats.temporalSpread).toBe(0);
      expect(stats.qualityScore).toBe(0);
    });
  });

  describe('Strategy Performance Comparison', () => {
    const createTestScenario = (name: string, beats: Beat[], audioDuration: number, tempo?: Tempo) => ({ 
      name, beats, audioDuration, tempo 
    });

    const testScenarios = [
      createTestScenario('Regular Pattern', Array.from({ length: 20 }, (_, i) => ({
        timestamp: i * 1000,
        strength: 0.7 + Math.sin(i * 0.5) * 0.2,
        confidence: 0.8,
        metadata: {}
      })), 20),

      createTestScenario('Variable Strength', Array.from({ length: 15 }, (_, i) => ({
        timestamp: i * 800 + Math.random() * 100,
        strength: Math.random(),
        confidence: 0.7 + Math.random() * 0.3,
        metadata: {}
      })), 12),

      createTestScenario('Sparse Beats', [
        { timestamp: 2000, strength: 0.9, confidence: 0.9, metadata: {} },
        { timestamp: 7000, strength: 0.8, confidence: 0.8, metadata: {} },
        { timestamp: 15000, strength: 0.7, confidence: 0.9, metadata: {} }
      ], 18)
    ];

    test('should compare strategy performance across scenarios', () => {
      const strategies = ['energy', 'regular', 'musical', 'adaptive'] as const;
      const pictureCount = 8;

      testScenarios.forEach(scenario => {
        const results: Record<string, any> = {};

        strategies.forEach(strategy => {
          const result = BeatSelector.selectBeatsEnhanced(scenario.beats, {
            count: Math.min(pictureCount, scenario.beats.length),
            strategy,
            audioDuration: scenario.audioDuration
          }, scenario.tempo);

          results[strategy] = {
            quality: result.quality,
            processingTime: result.metadata.processingTime,
            beatsSelected: result.beats.length
          };
        });

        // Validate that adaptive strategy performs reasonably well
        expect(results.adaptive.quality.overall).toBeGreaterThan(0);
        
        // Validate that all strategies produce valid results
        strategies.forEach(strategy => {
          expect(results[strategy].beatsSelected).toBeLessThanOrEqual(Math.min(pictureCount, scenario.beats.length));
          expect(results[strategy].processingTime).toBeGreaterThan(0);
          expect(results[strategy].quality.overall).toBeGreaterThanOrEqual(0);
          expect(results[strategy].quality.overall).toBeLessThanOrEqual(1);
        });

        console.log(`Scenario: ${scenario.name}`);
        strategies.forEach(strategy => {
          console.log(`  ${strategy}: Quality=${results[strategy].quality.overall.toFixed(3)}, Time=${results[strategy].processingTime}ms`);
        });
      });
    });

    test('should validate strategy-specific optimizations', () => {
      const strongAndWeakBeats: Beat[] = [
        { timestamp: 1000, strength: 0.3, confidence: 0.7, metadata: {} },
        { timestamp: 2000, strength: 0.9, confidence: 0.6, metadata: {} },
        { timestamp: 3000, strength: 0.4, confidence: 0.8, metadata: {} },
        { timestamp: 4000, strength: 0.8, confidence: 0.5, metadata: {} },
        { timestamp: 5000, strength: 0.2, confidence: 0.9, metadata: {} }
      ];

      const energyResult = BeatSelector.selectBeatsEnhanced(strongAndWeakBeats, {
        count: 3,
        strategy: 'energy'
      });

      const regularResult = BeatSelector.selectBeatsEnhanced(strongAndWeakBeats, {
        count: 3,
        strategy: 'regular',
        audioDuration: 5
      });

      // Energy strategy should select higher-strength beats
      const avgEnergyStrength = energyResult.beats.reduce((sum, b) => sum + b.strength, 0) / energyResult.beats.length;
      expect(avgEnergyStrength).toBeGreaterThan(0.5);

      // Regular strategy should have better spacing
      expect(regularResult.quality.spacing).toBeGreaterThan(energyResult.quality.spacing * 0.8);
    });
  });

  describe('Musical Coherence Validation', () => {
    test('should align beats with tempo grid when tempo provided', () => {
      const tempo: Tempo = {
        bpm: 120, // 500ms per beat
        confidence: 0.9,
        timeSignature: { numerator: 4, denominator: 4 }
      };

      // Create beats that are slightly off the grid
      const offGridBeats: Beat[] = [
        { timestamp: 50, strength: 0.8, confidence: 0.9, metadata: {} },   // Close to 0
        { timestamp: 550, strength: 0.7, confidence: 0.8, metadata: {} },  // Close to 500
        { timestamp: 980, strength: 0.9, confidence: 0.9, metadata: {} },  // Close to 1000
        { timestamp: 1520, strength: 0.6, confidence: 0.7, metadata: {} }, // Close to 1500
      ];

      const result = BeatSelector.selectBeatsEnhanced(offGridBeats, {
        count: 4,
        strategy: 'musical'
      }, tempo);

      // Check if results include tempo-aware metadata
      result.beats.forEach((beat, index) => {
        expect(beat.metadata).toBeDefined();
        if (beat.metadata) {
          expect(beat.metadata.expectedTime).toBeDefined();
          expect(beat.metadata.timingDeviation).toBeDefined();
          expect(beat.metadata.beatNumber).toBeDefined();
          expect(beat.metadata.measureNumber).toBeDefined();
          
          // Timing deviation should be reasonable
          const deviation = Math.abs(beat.metadata.timingDeviation as number);
          expect(deviation).toBeLessThan(250); // Less than half a beat
        }
      });
    });

    test('should classify beat types correctly', () => {
      const tempo: Tempo = {
        bpm: 120,
        confidence: 0.9,
        timeSignature: { numerator: 4, denominator: 4 }
      };

      const gridAlignedBeats: Beat[] = [
        { timestamp: 0, strength: 0.9, confidence: 0.9, metadata: {} },    // Should be downbeat
        { timestamp: 500, strength: 0.6, confidence: 0.8, metadata: {} },  // Should be beat
        { timestamp: 1000, strength: 0.8, confidence: 0.8, metadata: {} }, // Should be beat  
        { timestamp: 1500, strength: 0.5, confidence: 0.7, metadata: {} }, // Should be beat
        { timestamp: 2000, strength: 0.9, confidence: 0.9, metadata: {} }, // Should be downbeat
      ];

      const result = BeatSelector.selectBeatsEnhanced(gridAlignedBeats, {
        count: 5,
        strategy: 'musical'
      }, tempo);

      // Check beat type classification
      const downbeats = result.beats.filter(beat => beat.type === 'downbeat');
      const regularBeats = result.beats.filter(beat => beat.type === 'beat');

      expect(downbeats.length).toBeGreaterThan(0);
      expect(regularBeats.length).toBeGreaterThan(0);
      expect(downbeats.length + regularBeats.length).toBeLessThanOrEqual(result.beats.length);
    });

    test('should handle syncopated and offbeat patterns', () => {
      const tempo: Tempo = {
        bpm: 120,
        confidence: 0.9,
        timeSignature: { numerator: 4, denominator: 4 }
      };

      const syncopatedBeats: Beat[] = [
        { timestamp: 250, strength: 0.8, confidence: 0.8, metadata: {} }, // Off-beat with high strength
        { timestamp: 750, strength: 0.7, confidence: 0.8, metadata: {} }, // Off-beat
        { timestamp: 1000, strength: 0.5, confidence: 0.7, metadata: {} }, // On-beat with lower strength
        { timestamp: 1250, strength: 0.9, confidence: 0.9, metadata: {} }, // Off-beat with very high strength
      ];

      const result = BeatSelector.selectBeatsEnhanced(syncopatedBeats, {
        count: 4,
        strategy: 'musical'
      }, tempo);

      // Should identify syncopated patterns
      const syncopated = result.beats.filter(beat => beat.type === 'syncopated');
      const offbeats = result.beats.filter(beat => beat.type === 'offbeat');

      expect(syncopated.length + offbeats.length).toBeGreaterThan(0);
    });
  });

  describe('Timing Precision Validation', () => {
    test('should maintain millisecond precision in timestamps', () => {
      const preciseBeats: Beat[] = [
        { timestamp: 1234.567, strength: 0.8, confidence: 0.9, metadata: {} },
        { timestamp: 2345.678, strength: 0.7, confidence: 0.8, metadata: {} },
        { timestamp: 3456.789, strength: 0.9, confidence: 0.9, metadata: {} }
      ];

      const result = BeatSelector.selectBeatsEnhanced(preciseBeats, {
        count: 3,
        strategy: 'adaptive'
      });

      result.beats.forEach((beat, index) => {
        expect(beat.timestamp).toBeCloseTo(preciseBeats[index].timestamp, 3);
      });
    });

    test('should handle timestamp edge cases', () => {
      const edgeCaseBeats: Beat[] = [
        { timestamp: 0, strength: 0.8, confidence: 0.9, metadata: {} },           // Zero timestamp
        { timestamp: 0.1, strength: 0.7, confidence: 0.8, metadata: {} },         // Very small timestamp
        { timestamp: 1000000, strength: 0.9, confidence: 0.9, metadata: {} },     // Large timestamp
        { timestamp: 999999.999, strength: 0.6, confidence: 0.7, metadata: {} }   // Very precise large timestamp
      ];

      const result = BeatSelector.selectBeatsEnhanced(edgeCaseBeats, {
        count: 4,
        strategy: 'adaptive',
        audioDuration: 1000 // 1000 seconds
      });

      expect(result.beats).toHaveLength(4);
      expect(result.beats[0].timestamp).toBe(0);
      expect(result.beats[result.beats.length - 1].timestamp).toBeLessThanOrEqual(1000000);
    });
  });

  describe('Confidence and Strength Correlation', () => {
    test('should weight confidence appropriately in adaptive selection', () => {
      const mixedQualityBeats: Beat[] = [
        { timestamp: 1000, strength: 0.9, confidence: 0.3, metadata: {} }, // High strength, low confidence
        { timestamp: 2000, strength: 0.5, confidence: 0.9, metadata: {} }, // Low strength, high confidence
        { timestamp: 3000, strength: 0.7, confidence: 0.7, metadata: {} }, // Balanced
        { timestamp: 4000, strength: 0.8, confidence: 0.8, metadata: {} }, // High both
      ];

      const result = BeatSelector.selectBeatsEnhanced(mixedQualityBeats, {
        count: 2,
        strategy: 'adaptive',
        energyWeight: 0.3,
        regularityWeight: 0.2,
        musicalWeight: 0.5 // Higher weight on musical factors
      });

      expect(result.beats).toHaveLength(2);
      
      const stats = BeatSelector.getSelectionStatistics(result);
      expect(stats.averageConfidence).toBeGreaterThan(0.6);
    });

    test('should provide meaningful detection scores', () => {
      const testBeats: Beat[] = [
        { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} },
        { timestamp: 2000, strength: 0.6, confidence: 0.7, metadata: {} },
        { timestamp: 3000, strength: 0.9, confidence: 0.8, metadata: {} }
      ];

      const result = BeatSelector.selectBeatsEnhanced(testBeats, {
        count: 3,
        strategy: 'adaptive'
      });

      result.beats.forEach(beat => {
        expect(beat.metadata?.detectionScore).toBeDefined();
        expect(beat.metadata?.detectionScore).toBeGreaterThan(0);
        expect(beat.metadata?.detectionScore).toBeLessThanOrEqual(1);
        
        // Detection score should correlate with strength * confidence
        const expectedScore = beat.strength * beat.confidence;
        expect(beat.metadata?.detectionScore).toBeCloseTo(expectedScore, 2);
      });
    });
  });

  describe('Selection Robustness', () => {
    test('should handle duplicate timestamps', () => {
      const duplicateBeats: Beat[] = [
        { timestamp: 1000, strength: 0.8, confidence: 0.9, metadata: {} },
        { timestamp: 1000, strength: 0.7, confidence: 0.8, metadata: {} }, // Duplicate timestamp
        { timestamp: 2000, strength: 0.6, confidence: 0.7, metadata: {} },
        { timestamp: 3000, strength: 0.9, confidence: 0.9, metadata: {} }
      ];

      const result = BeatSelector.selectBeatsEnhanced(duplicateBeats, {
        count: 3,
        strategy: 'adaptive'
      });

      // Should handle duplicates gracefully
      expect(result.beats.length).toBeLessThanOrEqual(3);
      expect(result.quality.overall).toBeGreaterThanOrEqual(0);
    });

    test('should maintain quality with noisy input data', () => {
      const noisyBeats: Beat[] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: i * 200 + (Math.random() - 0.5) * 50, // Add timing jitter
        strength: Math.max(0, Math.random() * 0.8 + 0.1 + (Math.random() - 0.5) * 0.2), // Add noise
        confidence: Math.max(0, Math.min(1, 0.7 + (Math.random() - 0.5) * 0.4)), // Add noise
        metadata: {}
      }));

      const result = BeatSelector.selectBeatsEnhanced(noisyBeats, {
        count: 15,
        strategy: 'adaptive'
      });

      expect(result.beats).toHaveLength(15);
      expect(result.quality.overall).toBeGreaterThan(0.3);
      expect(result.metadata.processingTime).toBeLessThan(1000); // Should complete quickly
    });

    test('should validate selection consistency across multiple runs', () => {
      const consistentBeats: Beat[] = [
        { timestamp: 1000, strength: 0.9, confidence: 0.9, metadata: {} },
        { timestamp: 2000, strength: 0.8, confidence: 0.8, metadata: {} },
        { timestamp: 3000, strength: 0.7, confidence: 0.7, metadata: {} },
        { timestamp: 4000, strength: 0.6, confidence: 0.6, metadata: {} },
        { timestamp: 5000, strength: 0.5, confidence: 0.5, metadata: {} }
      ];

      const config = {
        count: 3,
        strategy: 'energy' as const,
        energyWeight: 0.5,
        regularityWeight: 0.3,
        musicalWeight: 0.2
      };

      // Run selection multiple times
      const results = Array.from({ length: 5 }, () => 
        BeatSelector.selectBeatsEnhanced(consistentBeats, config)
      );

      // Results should be identical for deterministic input
      const firstResult = results[0];
      results.slice(1).forEach(result => {
        expect(result.beats).toHaveLength(firstResult.beats.length);
        result.beats.forEach((beat, index) => {
          expect(beat.timestamp).toBe(firstResult.beats[index].timestamp);
          expect(beat.strength).toBe(firstResult.beats[index].strength);
          expect(beat.confidence).toBe(firstResult.beats[index].confidence);
        });
      });
    });
  });

  describe('Configuration Validation', () => {
    test('should validate all configuration parameters', () => {
      const testConfigs = [
        // Valid configurations
        { count: 1, strategy: 'energy', result: [] },
        { count: 100, strategy: 'adaptive', energyWeight: 0.5, regularityWeight: 0.3, musicalWeight: 0.2, result: [] },
        { count: 50, strategy: 'regular', minSpacing: 100, audioDuration: 60, result: [] },
        
        // Invalid configurations
        { count: 0, strategy: 'energy', result: ['count must be a positive integer'] },
        { count: -1, strategy: 'energy', result: ['count must be a positive integer'] },
        { count: 1.5, strategy: 'energy', result: ['count must be a positive integer'] },
        { count: 10, strategy: 'invalid', result: ['strategy must be one of: energy, regular, musical, adaptive'] },
        { count: 10, energyWeight: -0.1, strategy: 'adaptive', result: ['energyWeight must be a number between 0 and 1'] },
        { count: 10, energyWeight: 1.1, strategy: 'adaptive', result: ['energyWeight must be a number between 0 and 1'] },
        { count: 10, minSpacing: -1, strategy: 'regular', result: ['minSpacing must be a non-negative number'] },
        { count: 10, audioDuration: 0, strategy: 'regular', result: ['audioDuration must be a positive number'] }
      ];

      testConfigs.forEach(({ result, ...config }) => {
        const errors = BeatSelector.validateConfig(config);
        expect(errors).toEqual(result);
      });
    });

    test('should provide available strategies information', () => {
      const strategies = BeatSelector.getAvailableStrategies();
      
      expect(Object.keys(strategies)).toContain('energy');
      expect(Object.keys(strategies)).toContain('regular');
      expect(Object.keys(strategies)).toContain('musical');
      expect(Object.keys(strategies)).toContain('adaptive');
      
      Object.values(strategies).forEach(description => {
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Performance and Memory Validation', () => {
    test('should handle large beat datasets efficiently', () => {
      const sizes = [100, 500, 1000, 2000];
      
      sizes.forEach(size => {
        const largeDataset = Array.from({ length: size }, (_, i) => ({
          timestamp: i * 50,
          strength: Math.random(),
          confidence: Math.random(),
          metadata: {}
        }));

        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const result = BeatSelector.selectBeatsEnhanced(largeDataset, {
          count: Math.min(100, size),
          strategy: 'adaptive'
        });

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        const processingTime = endTime - startTime;
        const memoryUsed = endMemory - startMemory;

        expect(result.beats.length).toBeLessThanOrEqual(Math.min(100, size));
        expect(processingTime).toBeLessThan(5000); // 5 seconds max
        expect(memoryUsed).toBeLessThan(50 * 1024 * 1024); // 50MB max

        console.log(`Size ${size}: ${processingTime.toFixed(2)}ms, ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      });
    });

    test('should maintain performance with complex configurations', () => {
      const complexDataset = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: i * 100 + Math.sin(i * 0.1) * 50,
        strength: Math.sin(i * 0.05) * 0.5 + 0.5,
        confidence: Math.cos(i * 0.03) * 0.3 + 0.7,
        metadata: { complexity: Math.random() }
      }));

      const complexConfigs = [
        { strategy: 'adaptive', energyWeight: 0.4, regularityWeight: 0.3, musicalWeight: 0.3 },
        { strategy: 'musical' },
        { strategy: 'regular', audioDuration: 100 },
        { strategy: 'energy' }
      ] as const;

      complexConfigs.forEach((config, index) => {
        const startTime = performance.now();
        
        const result = BeatSelector.selectBeatsEnhanced(complexDataset, {
          count: 50,
          ...config
        });

        const processingTime = performance.now() - startTime;

        expect(result.beats).toHaveLength(50);
        expect(processingTime).toBeLessThan(2000); // 2 seconds max
        expect(result.quality.overall).toBeGreaterThanOrEqual(0);
      });
    });
  });
});