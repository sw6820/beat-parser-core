#!/usr/bin/env node

/**
 * Unified Test Runner for Beat Parser
 * Runs all test suites and provides a comprehensive report
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

// Test configurations
const tests = [
  {
    name: 'Audio Decode Demo',
    file: '../demos/audio-decode-demo.js',
    description: 'Basic audio decoding functionality'
  },
  {
    name: 'Music Analysis',
    file: '../integration/music-analysis.js',
    description: 'Comprehensive music file analysis'
  },
  {
    name: 'Beat Parser Integration',
    file: '../integration/beat-parser-integration.js',
    args: ['./music/summer-vibes-158665.mp3'],
    description: 'Complete beat parser with real audio files'
  }
];

// Run a single test
function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n${colors.bright}${colors.blue}Running: ${test.name}${colors.reset}`);
    console.log(`${colors.yellow}${test.description}${colors.reset}`);
    console.log('─'.repeat(60));

    const testPath = path.join(__dirname, test.file);
    const args = test.args || [];
    
    const child = spawn('node', [testPath, ...args], {
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      output += text;
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      process.stderr.write(text);
      errorOutput += text;
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`${colors.green}✅ ${test.name} completed successfully${colors.reset}`);
        resolve({ test: test.name, status: 'passed', output });
      } else {
        console.log(`${colors.red}❌ ${test.name} failed with code ${code}${colors.reset}`);
        resolve({ test: test.name, status: 'failed', code, output, errorOutput });
      }
    });

    child.on('error', (err) => {
      console.error(`${colors.red}❌ Failed to run ${test.name}: ${err.message}${colors.reset}`);
      resolve({ test: test.name, status: 'error', error: err.message });
    });
  });
}

// Main test runner
async function main() {
  console.log(`${colors.bright}${colors.magenta}🚀 BEAT PARSER TEST SUITE${colors.reset}`);
  console.log('═'.repeat(60));
  console.log(`Running ${tests.length} test suites...`);

  const startTime = Date.now();
  const results = [];

  // Run tests sequentially
  for (const test of tests) {
    try {
      const result = await runTest(test);
      results.push(result);
    } catch (error) {
      console.error(`${colors.red}Unexpected error in ${test.name}: ${error.message}${colors.reset}`);
      results.push({ test: test.name, status: 'error', error: error.message });
    }
  }

  const duration = Date.now() - startTime;

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`${colors.bright}${colors.blue}📊 TEST SUMMARY${colors.reset}`);
  console.log('─'.repeat(60));

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const errors = results.filter(r => r.status === 'error').length;

  results.forEach(result => {
    const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
    const color = result.status === 'passed' ? colors.green : result.status === 'failed' ? colors.red : colors.yellow;
    console.log(`  ${icon} ${result.test}: ${color}${result.status.toUpperCase()}${colors.reset}`);
  });

  console.log('─'.repeat(60));
  console.log(`Total: ${tests.length} | ${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset} | ${colors.yellow}Errors: ${errors}${colors.reset}`);
  console.log(`Duration: ${colors.blue}${(duration / 1000).toFixed(2)}s${colors.reset}`);

  // Generate report file
  const report = {
    timestamp: new Date().toISOString(),
    duration: duration + 'ms',
    summary: {
      total: tests.length,
      passed,
      failed,
      errors
    },
    results: results.map(r => ({
      test: r.test,
      status: r.status,
      error: r.error || r.errorOutput || null
    }))
  };

  const reportPath = path.join(__dirname, '..', 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📝 Report saved to: ${colors.yellow}${reportPath}${colors.reset}`);

  // Exit code
  if (failed > 0 || errors > 0) {
    console.log(`\n${colors.red}❌ Test suite failed${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}✅ All tests passed!${colors.reset}`);
    process.exit(0);
  }
}

// Handle interruption
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Test suite interrupted${colors.reset}`);
  process.exit(130);
});

// Run tests
main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});