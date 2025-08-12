#!/usr/bin/env node

/**
 * Audio Input Test Runner
 * Executes all comprehensive audio input tests and generates summary report
 */

import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import path from 'path';

const TEST_FILES = [
  'audio-input-comprehensive.test.ts',
  'audio-corrupted-edge-cases.test.ts',
  'audio-performance-benchmarks.test.ts',
  'audio-memory-streaming.test.ts'
];

interface TestResult {
  testFile: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

async function runTest(testFile: string): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = '';
    let errorOutput = '';

    console.log(`\n🚀 Running ${testFile}...`);

    const testProcess = spawn('npm', ['test', testFile], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true
    });

    testProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    testProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    testProcess.on('close', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;

      console.log(`${passed ? '✅' : '❌'} ${testFile} ${passed ? 'PASSED' : 'FAILED'} (${duration}ms)`);

      resolve({
        testFile,
        passed,
        duration,
        output,
        error: passed ? undefined : errorOutput
      });
    });
  });
}

function generateSummaryReport(results: TestResult[]): string {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  let report = `# Audio Input Test Execution Summary

## Overview
- **Total Test Files**: ${totalTests}
- **Passed**: ${passedTests}
- **Failed**: ${failedTests}
- **Success Rate**: ${((passedTests / totalTests) * 100).toFixed(1)}%
- **Total Duration**: ${(totalDuration / 1000).toFixed(2)}s

## Test Results

| Test File | Status | Duration | Notes |
|-----------|--------|----------|-------|
`;

  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const duration = `${(result.duration / 1000).toFixed(2)}s`;
    const notes = result.passed ? 'All tests passed' : 'Some tests failed';
    
    report += `| ${result.testFile} | ${status} | ${duration} | ${notes} |\n`;
  });

  if (failedTests > 0) {
    report += `\n## Failed Test Details\n\n`;
    
    results.filter(r => !r.passed).forEach(result => {
      report += `### ${result.testFile}\n`;
      report += `\`\`\`\n${result.error || 'Unknown error'}\n\`\`\`\n\n`;
    });
  }

  report += `\n## Recommendations\n\n`;

  if (passedTests === totalTests) {
    report += `🎉 **All tests passed!** The audio input handling is working correctly across all scenarios.\n\n`;
    report += `### Next Steps:\n`;
    report += `- Review performance benchmarks for optimization opportunities\n`;
    report += `- Consider implementing suggested improvements from the test report\n`;
    report += `- Add these tests to your CI/CD pipeline for continuous validation\n`;
  } else {
    report += `⚠️ **Some tests failed.** Please review the failed test details above.\n\n`;
    report += `### Immediate Actions Required:\n`;
    report += `- Fix failing tests before deploying to production\n`;
    report += `- Review error messages for root cause analysis\n`;
    report += `- Consider adding additional error handling for edge cases\n`;
  }

  report += `\n---\n*Generated on ${new Date().toISOString()}*\n`;

  return report;
}

async function main() {
  console.log('🎯 Starting comprehensive audio input testing...\n');
  console.log('This may take several minutes to complete all tests.\n');

  const results: TestResult[] = [];

  // Run each test file sequentially
  for (const testFile of TEST_FILES) {
    try {
      const result = await runTest(testFile);
      results.push(result);
    } catch (error) {
      console.error(`Failed to run ${testFile}:`, error);
      results.push({
        testFile,
        passed: false,
        duration: 0,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Generate and save summary report
  console.log('\n📊 Generating summary report...');
  
  const summaryReport = generateSummaryReport(results);
  const reportPath = path.join(process.cwd(), 'AUDIO_INPUT_TEST_SUMMARY.md');
  
  try {
    await writeFile(reportPath, summaryReport);
    console.log(`✅ Summary report saved to: ${reportPath}`);
  } catch (error) {
    console.error('❌ Failed to save summary report:', error);
  }

  // Print final summary
  const passedCount = results.filter(r => r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('\n' + '='.repeat(60));
  console.log('🎯 AUDIO INPUT TESTING COMPLETE');
  console.log('='.repeat(60));
  console.log(`Results: ${passedCount}/${results.length} test files passed`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(2)} seconds`);
  console.log(`Success Rate: ${((passedCount / results.length) * 100).toFixed(1)}%`);

  if (passedCount === results.length) {
    console.log('🎉 All audio input tests passed successfully!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the summary report for details.');
    process.exit(1);
  }
}

// Handle process interruption
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test execution interrupted by user');
  process.exit(1);
});

// Run the test suite
main().catch((error) => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});