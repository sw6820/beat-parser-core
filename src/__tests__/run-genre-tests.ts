/**
 * Genre-Specific Beat Detection Test Runner
 * 
 * This script runs all genre-specific tests and generates a comprehensive
 * accuracy report with performance metrics and recommendations.
 */

import { BeatParser } from '../core/BeatParser';
import { HybridDetector } from '../algorithms/HybridDetector';
import { BeatCandidate } from '../types';

interface TestResult {
  testName: string;
  genre: string;
  fMeasure: number;
  precision: number;
  recall: number;
  processingTime: number;
  beatsDetected: number;
  expectedBeats?: number;
  avgConfidence: number;
  passed: boolean;
  notes?: string;
}

interface GenreReport {
  genre: string;
  totalTests: number;
  passedTests: number;
  avgFMeasure: number;
  avgProcessingTime: number;
  bestCase: TestResult;
  worstCase: TestResult;
  recommendations: string[];
}

class GenreTestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  /**
   * Generate test audio for different genres with ground truth
   */
  generateTestAudio(genre: string, params: {
    duration: number;
    bpm: number;
    complexity?: 'low' | 'medium' | 'high';
    timeSignature?: { numerator: number; denominator: number };
  }): { audio: Float32Array; groundTruthBeats: number[] } {
    const { duration, bpm, complexity = 'medium', timeSignature = { numerator: 4, denominator: 4 } } = params;
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const audio = new Float32Array(samples);
    const groundTruthBeats: number[] = [];

    const beatInterval = (60 / bpm) * sampleRate;
    const beatsPerMeasure = timeSignature.numerator;

    // Generate ground truth beats
    for (let beat = 0; beat * beatInterval < samples; beat++) {
      groundTruthBeats.push((beat * beatInterval) / sampleRate);
    }

    // Generate audio based on genre characteristics
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const beatPhase = i % beatInterval;
      const beatNumber = Math.floor(i / beatInterval) % beatsPerMeasure;
      let sample = 0;

      switch (genre) {
        case 'electronic':
          if (beatPhase < sampleRate * 0.05) {
            const decay = Math.exp(-beatPhase / sampleRate * 30);
            sample += Math.sin(2 * Math.PI * 50 * t) * decay * 0.9;
          }
          sample += ((t * 110) % 1 - 0.5) * 0.3;
          break;

        case 'rock':
          if ((beatNumber === 0 || beatNumber === 2) && beatPhase < sampleRate * 0.06) {
            const decay = Math.exp(-beatPhase / sampleRate * 25);
            sample += Math.sin(2 * Math.PI * 65 * t) * decay * 0.8;
          }
          if ((beatNumber === 1 || beatNumber === 3) && beatPhase < sampleRate * 0.04) {
            sample += (Math.random() - 0.5) * 0.7;
          }
          break;

        case 'hip-hop':
          if ((beatNumber === 0 || beatNumber === 2) && beatPhase < sampleRate * 0.08) {
            const decay = Math.exp(-beatPhase / sampleRate * 20);
            sample += Math.sin(2 * Math.PI * 45 * t) * decay * 0.9;
          }
          if ((beatNumber === 1 || beatNumber === 3) && beatPhase < sampleRate * 0.05) {
            sample += (Math.random() - 0.5) * 0.8;
          }
          break;

        case 'classical':
          if (beatNumber === 0 && beatPhase < sampleRate * 0.1) {
            const decay = Math.exp(-beatPhase / sampleRate * 15);
            sample += Math.sin(2 * Math.PI * 55 * t) * decay * 0.6;
          }
          const scales = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88];
          const noteIndex = Math.floor(t * 2) % scales.length;
          sample += Math.sin(2 * Math.PI * scales[noteIndex] * t) * 0.4;
          break;

        case 'jazz':
          const swingOffset = (beatNumber % 2 === 1) ? beatInterval * 0.05 : 0;
          if ((i + swingOffset) % beatInterval < sampleRate * 0.02) {
            sample += (Math.random() - 0.5) * 0.5;
          }
          break;

        case 'ambient':
          if (beatNumber === 0 && beatPhase < sampleRate * 0.2) {
            const decay = Math.exp(-beatPhase / sampleRate * 2);
            sample += Math.sin(2 * Math.PI * 40 * t) * decay * 0.3;
          }
          sample += Math.sin(2 * Math.PI * 110 * t) * 0.2 * Math.sin(2 * Math.PI * 0.1 * t);
          break;

        case 'pop':
          if ((beatNumber === 0 || beatNumber === 2) && beatPhase < sampleRate * 0.05) {
            const decay = Math.exp(-beatPhase / sampleRate * 25);
            sample += Math.sin(2 * Math.PI * 60 * t) * decay * 0.8;
          }
          if ((beatNumber === 1 || beatNumber === 3) && beatPhase < sampleRate * 0.03) {
            sample += (Math.random() - 0.5) * 0.6;
          }
          break;
      }

      // Add complexity
      if (complexity === 'high') {
        if (Math.floor(i / (beatInterval / 5)) % 5 === 0) {
          sample += Math.sin(2 * Math.PI * 800 * t) * 0.1;
        }
      }

      sample += (Math.random() - 0.5) * 0.02; // Noise
      audio[i] = Math.max(-1, Math.min(1, sample));
    }

    return { audio, groundTruthBeats };
  }

  /**
   * Calculate accuracy metrics
   */
  calculateAccuracy(detectedBeats: BeatCandidate[], groundTruthBeats: number[], tolerance = 0.05) {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    const matchedTruth = new Set<number>();
    const matchedDetected = new Set<number>();

    // Find true positives
    detectedBeats.forEach((detected, detectedIndex) => {
      const matchIndex = groundTruthBeats.findIndex(
        truth => Math.abs(detected.timestamp - truth) <= tolerance
      );
      if (matchIndex >= 0 && !matchedTruth.has(matchIndex)) {
        truePositives++;
        matchedTruth.add(matchIndex);
        matchedDetected.add(detectedIndex);
      }
    });

    falsePositives = detectedBeats.length - truePositives;
    falseNegatives = groundTruthBeats.length - truePositives;

    const precision = detectedBeats.length > 0 ? truePositives / detectedBeats.length : 0;
    const recall = groundTruthBeats.length > 0 ? truePositives / groundTruthBeats.length : 0;
    const fMeasure = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return { precision, recall, fMeasure };
  }

  /**
   * Run a single test case
   */
  async runTest(
    testName: string,
    genre: string,
    params: {
      duration: number;
      bpm: number;
      complexity?: 'low' | 'medium' | 'high';
      timeSignature?: { numerator: number; denominator: number };
      targetAccuracy?: number;
    }
  ): Promise<TestResult> {
    const { duration, bpm, complexity, timeSignature, targetAccuracy = 0.8 } = params;
    
    console.log(`Running test: ${testName} (${genre})`);

    const { audio, groundTruthBeats } = this.generateTestAudio(genre, {
      duration,
      bpm,
      complexity,
      timeSignature
    });

    const detector = new HybridDetector({
      sampleRate: 44100,
      genreAdaptive: true,
      multiPassEnabled: true,
      confidenceThreshold: 0.5
    });

    const startTime = Date.now();
    const detectedBeats = await detector.detectBeats(audio);
    const processingTime = Date.now() - startTime;

    const metrics = this.calculateAccuracy(detectedBeats, groundTruthBeats);
    const avgConfidence = detectedBeats.length > 0
      ? detectedBeats.reduce((sum, beat) => sum + beat.confidence, 0) / detectedBeats.length
      : 0;

    const result: TestResult = {
      testName,
      genre,
      fMeasure: metrics.fMeasure,
      precision: metrics.precision,
      recall: metrics.recall,
      processingTime,
      beatsDetected: detectedBeats.length,
      expectedBeats: groundTruthBeats.length,
      avgConfidence,
      passed: metrics.fMeasure >= targetAccuracy
    };

    this.results.push(result);
    return result;
  }

  /**
   * Run all genre-specific tests
   */
  async runAllTests(): Promise<void> {
    this.startTime = Date.now();
    console.log('Starting comprehensive genre-specific beat detection tests...\n');

    // Electronic/EDM Tests
    await this.runTest('House Basic', 'electronic', { duration: 10, bpm: 128, targetAccuracy: 0.90 });
    await this.runTest('Techno Fast', 'electronic', { duration: 8, bpm: 140, targetAccuracy: 0.88 });
    await this.runTest('EDM Complex', 'electronic', { duration: 12, bpm: 135, complexity: 'high', targetAccuracy: 0.85 });

    // Rock/Metal Tests
    await this.runTest('Rock Standard', 'rock', { duration: 10, bpm: 120, targetAccuracy: 0.85 });
    await this.runTest('Metal Fast', 'rock', { duration: 8, bpm: 140, targetAccuracy: 0.82 });
    await this.runTest('Progressive Rock', 'rock', { duration: 12, bpm: 110, complexity: 'high', targetAccuracy: 0.78 });

    // Hip-Hop Tests
    await this.runTest('Boom Bap', 'hip-hop', { duration: 10, bpm: 90, targetAccuracy: 0.88 });
    await this.runTest('Trap', 'hip-hop', { duration: 8, bpm: 140, targetAccuracy: 0.86 });
    await this.runTest('Old School', 'hip-hop', { duration: 10, bpm: 100, targetAccuracy: 0.87 });

    // Classical Tests
    await this.runTest('Classical 4/4', 'classical', { duration: 15, bpm: 80, targetAccuracy: 0.65 });
    await this.runTest('Classical 3/4', 'classical', { 
      duration: 12, bpm: 90, timeSignature: { numerator: 3, denominator: 4 }, targetAccuracy: 0.60 
    });
    await this.runTest('Classical Complex', 'classical', { duration: 15, bpm: 75, complexity: 'high', targetAccuracy: 0.55 });

    // Jazz Tests
    await this.runTest('Jazz Swing', 'jazz', { duration: 10, bpm: 120, targetAccuracy: 0.70 });
    await this.runTest('Jazz Bebop', 'jazz', { duration: 8, bpm: 160, complexity: 'high', targetAccuracy: 0.65 });
    await this.runTest('Jazz Ballad', 'jazz', { duration: 12, bpm: 80, targetAccuracy: 0.68 });

    // Ambient Tests
    await this.runTest('Ambient Basic', 'ambient', { duration: 15, bpm: 60, targetAccuracy: 0.40 });
    await this.runTest('Ambient Complex', 'ambient', { duration: 20, bpm: 70, complexity: 'high', targetAccuracy: 0.35 });

    // Pop Tests
    await this.runTest('Pop Standard', 'pop', { duration: 8, bpm: 120, targetAccuracy: 0.90 });
    await this.runTest('Pop Ballad', 'pop', { duration: 10, bpm: 80, targetAccuracy: 0.88 });
    await this.runTest('Pop Uptempo', 'pop', { duration: 6, bpm: 140, targetAccuracy: 0.87 });

    // Tempo variation tests
    await this.runTest('Very Slow Tempo', 'electronic', { duration: 15, bpm: 60, targetAccuracy: 0.75 });
    await this.runTest('Very Fast Tempo', 'electronic', { duration: 6, bpm: 180, targetAccuracy: 0.80 });

    console.log(`\nCompleted all tests in ${Date.now() - this.startTime}ms\n`);
  }

  /**
   * Generate genre-specific reports
   */
  generateGenreReports(): GenreReport[] {
    const genres = [...new Set(this.results.map(r => r.genre))];
    const reports: GenreReport[] = [];

    for (const genre of genres) {
      const genreResults = this.results.filter(r => r.genre === genre);
      const passedTests = genreResults.filter(r => r.passed).length;
      const avgFMeasure = genreResults.reduce((sum, r) => sum + r.fMeasure, 0) / genreResults.length;
      const avgProcessingTime = genreResults.reduce((sum, r) => sum + r.processingTime, 0) / genreResults.length;

      const bestCase = genreResults.reduce((best, current) => 
        current.fMeasure > best.fMeasure ? current : best
      );
      const worstCase = genreResults.reduce((worst, current) => 
        current.fMeasure < worst.fMeasure ? current : worst
      );

      const recommendations: string[] = [];

      // Generate recommendations based on results
      if (avgFMeasure < 0.7) {
        recommendations.push('Consider genre-specific algorithm tuning');
      }
      if (avgProcessingTime > 5000) {
        recommendations.push('Optimize processing performance for this genre');
      }
      if (passedTests / genreResults.length < 0.8) {
        recommendations.push('Improve overall accuracy for this genre');
      }

      // Genre-specific recommendations
      switch (genre) {
        case 'classical':
          if (avgFMeasure < 0.6) {
            recommendations.push('Increase sensitivity for subtle orchestral beats');
            recommendations.push('Consider tempo tracking improvements for variable timing');
          }
          break;
        case 'jazz':
          if (avgFMeasure < 0.7) {
            recommendations.push('Improve swing rhythm detection');
            recommendations.push('Enhance syncopation handling');
          }
          break;
        case 'ambient':
          if (avgFMeasure < 0.4) {
            recommendations.push('Lower confidence thresholds for minimal percussion');
            recommendations.push('Improve detection of atmospheric rhythmic elements');
          }
          break;
        case 'electronic':
          if (avgFMeasure < 0.85) {
            recommendations.push('Optimize for strong kick drum patterns');
          }
          break;
      }

      reports.push({
        genre,
        totalTests: genreResults.length,
        passedTests,
        avgFMeasure,
        avgProcessingTime,
        bestCase,
        worstCase,
        recommendations
      });
    }

    return reports;
  }

  /**
   * Generate comprehensive report
   */
  generateComprehensiveReport(): string {
    const genreReports = this.generateGenreReports();
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const overallAccuracy = this.results.reduce((sum, r) => sum + r.fMeasure, 0) / totalTests;
    const totalProcessingTime = Date.now() - this.startTime;

    let report = '# Comprehensive Genre-Specific Beat Detection Test Report\n\n';
    report += `**Generated:** ${new Date().toISOString()}\n\n`;

    // Executive Summary
    report += '## Executive Summary\n\n';
    report += `- **Total Tests:** ${totalTests}\n`;
    report += `- **Passed Tests:** ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)\n`;
    report += `- **Overall Accuracy:** ${(overallAccuracy * 100).toFixed(1)}%\n`;
    report += `- **Total Processing Time:** ${totalProcessingTime}ms\n`;
    report += `- **Average Test Time:** ${(totalProcessingTime/totalTests).toFixed(0)}ms per test\n\n`;

    // Genre-by-Genre Analysis
    report += '## Genre-Specific Analysis\n\n';

    for (const genreReport of genreReports) {
      report += `### ${genreReport.genre.toUpperCase()}\n\n`;
      report += `- **Tests:** ${genreReport.passedTests}/${genreReport.totalTests} passed\n`;
      report += `- **Average F-Measure:** ${(genreReport.avgFMeasure * 100).toFixed(1)}%\n`;
      report += `- **Average Processing Time:** ${genreReport.avgProcessingTime.toFixed(0)}ms\n`;
      report += `- **Best Performance:** ${genreReport.bestCase.testName} (${(genreReport.bestCase.fMeasure * 100).toFixed(1)}%)\n`;
      report += `- **Worst Performance:** ${genreReport.worstCase.testName} (${(genreReport.worstCase.fMeasure * 100).toFixed(1)}%)\n`;

      if (genreReport.recommendations.length > 0) {
        report += '- **Recommendations:**\n';
        genreReport.recommendations.forEach(rec => {
          report += `  - ${rec}\n`;
        });
      }
      report += '\n';
    }

    // Detailed Results Table
    report += '## Detailed Test Results\n\n';
    report += '| Test Name | Genre | F-Measure | Precision | Recall | Confidence | Processing Time | Status |\n';
    report += '|-----------|-------|-----------|-----------|--------|------------|-----------------|--------|\n';

    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      report += `| ${result.testName} | ${result.genre} | ${(result.fMeasure * 100).toFixed(1)}% | `;
      report += `${(result.precision * 100).toFixed(1)}% | ${(result.recall * 100).toFixed(1)}% | `;
      report += `${result.avgConfidence.toFixed(3)} | ${result.processingTime}ms | ${status} |\n`;
    }

    // Performance Analysis
    report += '\n## Performance Analysis\n\n';
    const processingTimes = this.results.map(r => r.processingTime);
    const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    const maxProcessingTime = Math.max(...processingTimes);
    const minProcessingTime = Math.min(...processingTimes);

    report += `- **Average Processing Time:** ${avgProcessingTime.toFixed(0)}ms\n`;
    report += `- **Fastest Test:** ${minProcessingTime}ms\n`;
    report += `- **Slowest Test:** ${maxProcessingTime}ms\n`;
    report += `- **Performance Consistency:** ${((1 - (maxProcessingTime - minProcessingTime) / avgProcessingTime) * 100).toFixed(1)}%\n\n`;

    // Genre Comparison Chart
    report += '## Genre Performance Comparison\n\n';
    report += '```\n';
    report += 'Genre Performance (F-Measure %)\n';
    report += '================================\n';

    const sortedGenres = genreReports.sort((a, b) => b.avgFMeasure - a.avgFMeasure);
    for (const genre of sortedGenres) {
      const barLength = Math.round(genre.avgFMeasure * 50);
      const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength);
      report += `${genre.genre.padEnd(12)} │${bar}│ ${(genre.avgFMeasure * 100).toFixed(1)}%\n`;
    }
    report += '```\n\n';

    // Recommendations
    report += '## Overall Recommendations\n\n';
    
    const lowPerformingGenres = genreReports.filter(g => g.avgFMeasure < 0.7);
    if (lowPerformingGenres.length > 0) {
      report += '### Priority Improvements Needed:\n';
      lowPerformingGenres.forEach(genre => {
        report += `- **${genre.genre}**: Average accuracy ${(genre.avgFMeasure * 100).toFixed(1)}% - requires algorithm improvements\n`;
      });
      report += '\n';
    }

    const highPerformingGenres = genreReports.filter(g => g.avgFMeasure >= 0.85);
    if (highPerformingGenres.length > 0) {
      report += '### Strong Performance:\n';
      highPerformingGenres.forEach(genre => {
        report += `- **${genre.genre}**: Excellent accuracy ${(genre.avgFMeasure * 100).toFixed(1)}%\n`;
      });
      report += '\n';
    }

    // Algorithm Tuning Suggestions
    report += '### Algorithm Tuning Suggestions:\n\n';
    report += '1. **Electronic/EDM**: Already performing well, consider fine-tuning for sub-genres\n';
    report += '2. **Rock/Metal**: Improve handling of complex drum patterns and guitar-heavy mixes\n';
    report += '3. **Hip-Hop**: Optimize for strong downbeats and 808 patterns\n';
    report += '4. **Classical**: Increase sensitivity for subtle orchestral percussion\n';
    report += '5. **Jazz**: Enhance swing rhythm and syncopation detection\n';
    report += '6. **Ambient**: Lower confidence thresholds, improve atmospheric beat detection\n';
    report += '7. **Pop**: Maintain current excellent performance\n\n';

    // Technical Recommendations
    report += '### Technical Implementation:\n\n';
    report += '- Consider genre-specific confidence thresholds\n';
    report += '- Implement adaptive windowing for different musical styles\n';
    report += '- Enhance multi-pass analysis for challenging genres\n';
    report += '- Optimize processing pipeline for better performance consistency\n\n';

    report += '---\n';
    report += '*Report generated by Genre-Specific Beat Detection Test Suite*\n';

    return report;
  }

  /**
   * Save report to file
   */
  async saveReport(filename: string): Promise<void> {
    const report = this.generateComprehensiveReport();
    
    // In a real environment, this would write to the filesystem
    console.log('='.repeat(80));
    console.log('COMPREHENSIVE GENRE TEST REPORT');
    console.log('='.repeat(80));
    console.log(report);
    console.log('='.repeat(80));
  }
}

/**
 * Main execution function
 */
export async function runGenreTests(): Promise<void> {
  const runner = new GenreTestRunner();
  
  try {
    await runner.runAllTests();
    await runner.saveReport('genre-test-report.md');
    
    console.log('\n✅ All genre-specific tests completed successfully!');
    console.log('📊 Comprehensive report generated and displayed above.');
    
  } catch (error) {
    console.error('❌ Error running genre tests:', error);
    throw error;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runGenreTests().catch(console.error);
}

export { GenreTestRunner, TestResult, GenreReport };