/**
 * Picture Count Selection Test Runner
 * 
 * Comprehensive test runner for the picture count selection system.
 * Executes all related test suites and provides detailed reporting.
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TestSuite {
  name: string;
  file: string;
  description: string;
  estimatedTime: number; // in seconds
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

class PictureCountTestRunner {
  private testSuites: TestSuite[] = [
    {
      name: 'Picture Count Selection',
      file: 'picture-count-selection.test.ts',
      description: 'Core picture count selection functionality with edge cases',
      estimatedTime: 120
    },
    {
      name: 'Selection Quality Metrics',
      file: 'selection-quality-metrics.test.ts',
      description: 'Quality validation, timing accuracy, and musical coherence',
      estimatedTime: 90
    },
    {
      name: 'Synthetic Beat Generation',
      file: 'synthetic-beat-generation.test.ts',
      description: 'Intelligent beat interpolation when N > available beats',
      estimatedTime: 80
    },
    {
      name: 'Performance Benchmarks',
      file: 'picture-count-performance-benchmarks.test.ts',
      description: 'Large-scale performance testing and memory optimization',
      estimatedTime: 150
    }
  ];

  private results: TestResult[] = [];
  private reportPath: string;

  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reportPath = path.join(__dirname, `picture-count-test-report-${timestamp}.json`);
  }

  /**
   * Run all picture count selection test suites
   */
  async runAllTests(): Promise<void> {
    console.log('🎯 Picture Count Selection Test Suite Runner');
    console.log('=' .repeat(60));
    console.log();

    const totalEstimatedTime = this.testSuites.reduce((sum, suite) => sum + suite.estimatedTime, 0);
    console.log(`📊 Total Test Suites: ${this.testSuites.length}`);
    console.log(`⏱️  Estimated Total Time: ${Math.round(totalEstimatedTime / 60)} minutes`);
    console.log();

    const overallStartTime = Date.now();

    for (let i = 0; i < this.testSuites.length; i++) {
      const suite = this.testSuites[i];
      console.log(`🚀 Running Suite ${i + 1}/${this.testSuites.length}: ${suite.name}`);
      console.log(`   Description: ${suite.description}`);
      console.log(`   Estimated time: ${suite.estimatedTime}s`);
      
      const result = await this.runTestSuite(suite);
      this.results.push(result);
      
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      const duration = `${result.duration.toFixed(2)}s`;
      console.log(`   Result: ${status} in ${duration}`);
      
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      console.log();
    }

    const overallDuration = (Date.now() - overallStartTime) / 1000;
    
    await this.generateReport(overallDuration);
    this.printSummary(overallDuration);
  }

  /**
   * Run individual test suite
   */
  private async runTestSuite(suite: TestSuite): Promise<TestResult> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const jestProcess = spawn('npx', ['jest', suite.file, '--verbose'], {
        cwd: path.join(__dirname, '../..'),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      jestProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      jestProcess.stderr?.on('data', (data) => {
        error += data.toString();
      });

      jestProcess.on('close', (code) => {
        const duration = (Date.now() - startTime) / 1000;
        
        resolve({
          suite: suite.name,
          passed: code === 0,
          duration,
          output: output || error,
          error: code !== 0 ? error || 'Test suite failed' : undefined
        });
      });

      jestProcess.on('error', (err) => {
        const duration = (Date.now() - startTime) / 1000;
        
        resolve({
          suite: suite.name,
          passed: false,
          duration,
          output: '',
          error: err.message
        });
      });
    });
  }

  /**
   * Generate detailed test report
   */
  private async generateReport(overallDuration: number): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      overallDuration,
      totalSuites: this.testSuites.length,
      passedSuites: this.results.filter(r => r.passed).length,
      failedSuites: this.results.filter(r => !r.passed).length,
      suites: this.results.map((result, index) => ({
        ...result,
        estimatedTime: this.testSuites[index].estimatedTime,
        efficiency: result.duration / this.testSuites[index].estimatedTime,
        description: this.testSuites[index].description
      })),
      summary: {
        successRate: (this.results.filter(r => r.passed).length / this.results.length) * 100,
        averageDuration: this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length,
        totalTestTime: this.results.reduce((sum, r) => sum + r.duration, 0),
        fastestSuite: this.results.reduce((min, r) => r.duration < min.duration ? r : min),
        slowestSuite: this.results.reduce((max, r) => r.duration > max.duration ? r : max)
      }
    };

    try {
      await fs.writeFile(this.reportPath, JSON.stringify(report, null, 2));
      console.log(`📄 Detailed report saved to: ${this.reportPath}`);
    } catch (err) {
      console.warn(`⚠️  Failed to save report: ${err}`);
    }
  }

  /**
   * Print summary results
   */
  private printSummary(overallDuration: number): void {
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const successRate = (passed / this.results.length) * 100;
    
    console.log(`Total Suites: ${this.results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`Total Duration: ${overallDuration.toFixed(2)}s`);
    
    console.log();
    console.log('SUITE PERFORMANCE:');
    this.results.forEach((result, index) => {
      const suite = this.testSuites[index];
      const status = result.passed ? '✅' : '❌';
      const efficiency = ((suite.estimatedTime / result.duration) * 100).toFixed(0);
      console.log(`${status} ${result.suite}: ${result.duration.toFixed(2)}s (${efficiency}% of estimated)`);
    });

    if (failed > 0) {
      console.log();
      console.log('FAILED SUITES:');
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`❌ ${result.suite}: ${result.error}`);
        });
    }

    console.log();
    console.log('🎯 Picture Count Selection Testing Complete!');
    
    if (successRate === 100) {
      console.log('🌟 All tests passed! The picture count selection system is working perfectly.');
    } else if (successRate >= 75) {
      console.log('⚠️  Some tests failed. Please review the failing test suites.');
    } else {
      console.log('🚨 Many tests failed. Critical issues detected in picture count selection system.');
    }
  }

  /**
   * Run specific test categories
   */
  async runCategory(category: 'core' | 'performance' | 'quality' | 'synthetic'): Promise<void> {
    const categoryMap = {
      core: ['picture-count-selection.test.ts'],
      performance: ['picture-count-performance-benchmarks.test.ts'],
      quality: ['selection-quality-metrics.test.ts'],
      synthetic: ['synthetic-beat-generation.test.ts']
    };

    const filesToRun = categoryMap[category];
    const suitesToRun = this.testSuites.filter(suite => filesToRun.includes(suite.file));

    console.log(`🎯 Running ${category.toUpperCase()} category tests`);
    console.log(`📊 Suites in category: ${suitesToRun.length}`);
    console.log();

    for (const suite of suitesToRun) {
      console.log(`🚀 Running: ${suite.name}`);
      const result = await this.runTestSuite(suite);
      this.results.push(result);
      
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`   Result: ${status} in ${result.duration.toFixed(2)}s`);
      console.log();
    }

    this.printSummary(this.results.reduce((sum, r) => sum + r.duration, 0));
  }

  /**
   * Run quick smoke test
   */
  async runSmokeTest(): Promise<void> {
    console.log('🔥 Running Picture Count Selection Smoke Test');
    console.log('This will run a subset of tests to quickly validate core functionality');
    console.log();

    // Run core functionality test only
    await this.runCategory('core');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  const runner = new PictureCountTestRunner();

  try {
    switch (command) {
      case 'all':
        await runner.runAllTests();
        break;
      case 'core':
      case 'performance':
      case 'quality':
      case 'synthetic':
        await runner.runCategory(command as any);
        break;
      case 'smoke':
        await runner.runSmokeTest();
        break;
      case 'help':
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log('Picture Count Selection Test Runner');
  console.log();
  console.log('Commands:');
  console.log('  all         Run all picture count selection test suites (default)');
  console.log('  core        Run core functionality tests only');
  console.log('  performance Run performance benchmark tests only');
  console.log('  quality     Run quality metrics validation tests only');
  console.log('  synthetic   Run synthetic beat generation tests only');
  console.log('  smoke       Run quick smoke test for core functionality');
  console.log('  help        Show this help message');
  console.log();
  console.log('Examples:');
  console.log('  npm run test:picture-count');
  console.log('  npx ts-node src/__tests__/run-picture-count-tests.ts all');
  console.log('  npx ts-node src/__tests__/run-picture-count-tests.ts performance');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { PictureCountTestRunner };