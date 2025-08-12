/**
 * Performance Scalability Tests
 * Load testing and scaling validation under various conditions
 */

import { BeatParser, BeatParserConfig } from '../core/BeatParser';
import { WorkerClient } from '../worker/WorkerClient';
import { PerformanceUtils, AudioPerformanceUtils } from './performance-testing-utils';
import type { ParseOptions, ParseResult } from '../types';

describe('Performance Scalability Tests', () => {
  let parser: BeatParser;
  let workerPool: WorkerClient[] = [];

  // Scalability test parameters
  const concurrencyLevels = [1, 2, 4, 8, 16];
  const fileSizes = [
    { duration: 5, label: 'Small (5s)' },
    { duration: 30, label: 'Medium (30s)' },
    { duration: 120, label: 'Large (2min)' },
    { duration: 300, label: 'XLarge (5min)' }
  ];
  const batchSizes = [1, 5, 10, 25, 50, 100];

  beforeAll(async () => {
    console.log('🚀 Initializing scalability test suite...');
    
    parser = new BeatParser({
      sampleRate: 44100,
      frameSize: 2048,
      hopSize: 512,
      confidenceThreshold: 0.6
    });

    // Initialize worker pool for concurrent testing
    const maxWorkers = Math.min(8, concurrencyLevels[concurrencyLevels.length - 1]);
    for (let i = 0; i < maxWorkers; i++) {
      try {
        const worker = new WorkerClient();
        await worker.initialize();
        workerPool.push(worker);
      } catch (error) {
        console.warn(`Failed to initialize worker ${i}:`, error);
        break;
      }
    }

    console.log(`✅ Scalability suite initialized (${workerPool.length} workers available)`);
  }, 120000);

  afterAll(async () => {
    await parser.cleanup();
    
    for (const worker of workerPool) {
      try {
        await worker.terminate();
      } catch (error) {
        console.warn('Worker cleanup error:', error);
      }
    }
    
    console.log('🧹 Scalability test suite completed');
  });

  describe('Concurrent Processing Scalability', () => {
    test('Concurrent parser instances performance', async () => {
      const results: Array<{
        concurrency: number;
        totalDuration: number;
        avgLatency: number;
        throughput: number;
        efficiency: number;
      }> = [];

      for (const concurrency of concurrencyLevels) {
        if (concurrency > workerPool.length && concurrency > 1) {
          console.warn(`Skipping concurrency ${concurrency} - insufficient workers (${workerPool.length})`);
          continue;
        }

        const testAudio = AudioPerformanceUtils.generateTestAudio(10, 44100, 'medium');
        
        const loadTestResult = await PerformanceUtils.loadTest(
          () => {
            if (concurrency === 1) {
              return () => parser.parseBuffer(testAudio, { targetPictureCount: 20 });
            } else {
              const workerIndex = Math.floor(Math.random() * Math.min(concurrency, workerPool.length));
              const worker = workerPool[workerIndex];
              return () => worker.parseBuffer(testAudio, { targetPictureCount: 20 });
            }
          },
          `Concurrency Level ${concurrency}`,
          {
            concurrency,
            duration: 30000, // 30 seconds
            rampUpTime: 5000, // 5 seconds
            rampDownTime: 2000, // 2 seconds
            maxOperations: concurrency * 10 // Limit operations
          }
        );

        const efficiency = loadTestResult.throughput / concurrency; // Throughput per worker
        
        results.push({
          concurrency,
          totalDuration: 30000,
          avgLatency: loadTestResult.averageLatency,
          throughput: loadTestResult.throughput,
          efficiency
        });

        // Validate concurrent performance
        expect(loadTestResult.successfulOperations).toBeGreaterThan(0);
        expect(loadTestResult.failedOperations / loadTestResult.totalOperations).toBeLessThan(0.1); // <10% failure rate
        expect(loadTestResult.averageLatency).toBeLessThan(60000); // <60s average latency
      }

      console.log('Concurrent Processing Scalability Results:');
      results.forEach(result => {
        console.log(`  ${result.concurrency} workers: ${result.throughput.toFixed(3)} ops/sec, ${result.avgLatency.toFixed(0)}ms latency, ${result.efficiency.toFixed(3)} efficiency`);
      });

      // Analyze scaling efficiency
      if (results.length > 1) {
        const baselineThroughput = results[0].throughput;
        const baselineEfficiency = results[0].efficiency;
        
        results.forEach((result, index) => {
          if (index === 0) return;
          
          const expectedThroughput = baselineThroughput * result.concurrency;
          const actualThroughput = result.throughput;
          const scalingEfficiency = actualThroughput / expectedThroughput;
          
          console.log(`    Scaling efficiency at ${result.concurrency}x: ${(scalingEfficiency * 100).toFixed(1)}%`);
          
          // Scaling efficiency should be reasonable (diminishing returns expected)
          if (result.concurrency <= 4) {
            expect(scalingEfficiency).toBeGreaterThan(0.5); // >50% efficiency up to 4x
          } else {
            expect(scalingEfficiency).toBeGreaterThan(0.2); // >20% efficiency beyond 4x
          }
        });
      }
    }, 300000);

    test('Memory scaling under concurrent load', async () => {
      const maxConcurrency = Math.min(8, workerPool.length);
      if (maxConcurrency < 2) {
        console.warn('Insufficient workers for concurrent memory testing');
        return;
      }

      const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'medium');
      
      // Test memory usage scaling
      const memoryResults: Array<{
        concurrency: number;
        peakMemory: number;
        memoryPerWorker: number;
      }> = [];

      for (let concurrency = 1; concurrency <= maxConcurrency; concurrency *= 2) {
        const memoryProfile = await PerformanceUtils.profileMemoryUsage(
          async () => {
            const operations = [];
            for (let i = 0; i < concurrency; i++) {
              const worker = workerPool[i % workerPool.length];
              operations.push(worker.parseBuffer(testAudio, { targetPictureCount: 10 }));
            }
            return Promise.all(operations);
          },
          `Memory scaling at ${concurrency}x concurrency`,
          100 // 100ms intervals
        );

        const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
        
        memoryResults.push({
          concurrency,
          peakMemory: peakMemoryMB,
          memoryPerWorker: peakMemoryMB / concurrency
        });

        console.log(`${concurrency}x concurrency: ${peakMemoryMB.toFixed(2)}MB peak (${(peakMemoryMB / concurrency).toFixed(2)}MB per worker)`);
      }

      // Validate memory scaling
      memoryResults.forEach((result, index) => {
        if (index === 0) return;
        
        const previous = memoryResults[index - 1];
        const memoryGrowthRatio = result.peakMemory / previous.peakMemory;
        const concurrencyGrowthRatio = result.concurrency / previous.concurrency;
        
        // Memory growth should be sub-linear (shared resources, caching, etc.)
        expect(memoryGrowthRatio).toBeLessThan(concurrencyGrowthRatio * 1.5);
        expect(memoryGrowthRatio).toBeGreaterThan(concurrencyGrowthRatio * 0.3);
      });

      // Peak memory should be reasonable even at high concurrency
      const maxPeakMemory = Math.max(...memoryResults.map(r => r.peakMemory));
      expect(maxPeakMemory).toBeLessThan(500); // <500MB peak for concurrent processing
    }, 180000);
  });

  describe('Large File Handling', () => {
    test('File size scaling performance', async () => {
      const scalingResults: Array<{
        size: string;
        duration: number;
        processingTime: number;
        realTimeRatio: number;
        memoryUsed: number;
        efficiency: string;
      }> = [];

      for (const fileSize of fileSizes) {
        console.log(`Testing ${fileSize.label} file processing...`);
        
        const testAudio = AudioPerformanceUtils.generateTestAudio(
          fileSize.duration,
          44100,
          'medium'
        );

        const { result, metrics } = await PerformanceUtils.measureOperation(
          () => parser.parseBuffer(testAudio, { 
            targetPictureCount: Math.floor(fileSize.duration / 3)
          }),
          `Large file: ${fileSize.label}`,
          { iterations: 1, warmupIterations: 0 }
        );

        const efficiency = AudioPerformanceUtils.calculateAudioEfficiency(
          fileSize.duration,
          metrics.duration,
          Math.max(0, metrics.memoryUsage.heapUsed),
          44100
        );

        scalingResults.push({
          size: fileSize.label,
          duration: fileSize.duration,
          processingTime: metrics.duration,
          realTimeRatio: efficiency.realTimeRatio,
          memoryUsed: Math.max(0, metrics.memoryUsage.heapUsed),
          efficiency: efficiency.efficiency
        });

        // Validate results
        expect(result.beats).toBeDefined();
        expect(result.beats.length).toBeGreaterThan(0);
        expect(metrics.duration).toBeLessThan(fileSize.duration * 30000); // <30s per second of audio

        console.log(`  ${fileSize.label}: ${metrics.duration.toFixed(0)}ms (${efficiency.realTimeRatio.toFixed(2)}x real-time), ${efficiency.efficiency}`);
      }

      // Analyze file size scaling
      console.log('File Size Scaling Analysis:');
      for (let i = 1; i < scalingResults.length; i++) {
        const current = scalingResults[i];
        const previous = scalingResults[i - 1];
        
        const sizeRatio = current.duration / previous.duration;
        const timeRatio = current.processingTime / previous.processingTime;
        const memoryRatio = current.memoryUsed / previous.memoryUsed;
        
        console.log(`  ${previous.size} → ${current.size}:`);
        console.log(`    Size ratio: ${sizeRatio.toFixed(2)}x`);
        console.log(`    Time ratio: ${timeRatio.toFixed(2)}x`);
        console.log(`    Memory ratio: ${memoryRatio.toFixed(2)}x`);
        
        // Scaling should be reasonable
        expect(timeRatio).toBeLessThan(sizeRatio * 2); // At most 2x worse than linear
        expect(memoryRatio).toBeLessThan(sizeRatio * 1.5); // Memory should scale sub-linearly
      }

      // Largest file should still be processable
      const largestResult = scalingResults[scalingResults.length - 1];
      expect(largestResult.realTimeRatio).toBeLessThan(100); // <100x real-time even for largest file
      expect(largestResult.memoryUsed / 1024 / 1024).toBeLessThan(1000); // <1GB memory
    }, 600000);

    test('Memory efficiency with large files', async () => {
      const memoryTestSizes = [60, 120, 300]; // seconds
      
      for (const duration of memoryTestSizes) {
        console.log(`Memory efficiency test: ${duration}s file...`);
        
        const testAudio = AudioPerformanceUtils.generateTestAudio(duration, 44100, 'medium');
        const audioSizeMB = (testAudio.length * 4) / 1024 / 1024; // Float32Array size in MB

        const memoryProfile = await PerformanceUtils.profileMemoryUsage(
          () => parser.parseBuffer(testAudio, { targetPictureCount: Math.floor(duration / 4) }),
          `Memory profile: ${duration}s`,
          200 // 200ms intervals for detailed tracking
        );

        const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
        const memoryDeltaMB = memoryProfile.memoryDelta.heapUsed / 1024 / 1024;
        const memoryMultiplier = peakMemoryMB / audioSizeMB;

        console.log(`  Audio size: ${audioSizeMB.toFixed(2)}MB`);
        console.log(`  Peak memory: ${peakMemoryMB.toFixed(2)}MB (${memoryMultiplier.toFixed(1)}x audio size)`);
        console.log(`  Memory delta: ${memoryDeltaMB.toFixed(2)}MB`);

        // Memory usage should be reasonable relative to input size
        expect(memoryMultiplier).toBeLessThan(15); // <15x audio size
        expect(peakMemoryMB).toBeLessThan(audioSizeMB + 500); // <500MB overhead

        // Memory should be cleaned up properly
        if (memoryDeltaMB > 0) {
          expect(memoryDeltaMB).toBeLessThan(audioSizeMB * 0.5); // <50% of audio size retained
        }
      }
    }, 300000);
  });

  describe('Batch Processing Performance', () => {
    test('Batch size optimization', async () => {
      const batchResults: Array<{
        batchSize: number;
        totalTime: number;
        avgTimePerFile: number;
        throughput: number;
        memoryEfficiency: number;
      }> = [];

      for (const batchSize of batchSizes) {
        console.log(`Testing batch size: ${batchSize} files...`);
        
        // Generate test files
        const testFiles = Array.from({ length: batchSize }, (_, i) => 
          AudioPerformanceUtils.generateTestAudio(3, 44100, 'medium')
        );

        const batchBenchmark = await PerformanceUtils.benchmarkOperation(
          async () => {
            const results = [];
            for (const audio of testFiles) {
              results.push(await parser.parseBuffer(audio, { targetPictureCount: 6 }));
            }
            return results;
          },
          `Batch processing: ${batchSize} files`,
          { iterations: 3, warmupIterations: 1 }
        );

        const avgTimePerFile = batchBenchmark.analysis.mean / batchSize;
        const throughput = batchSize / (batchBenchmark.analysis.mean / 1000); // files per second
        const memoryEfficiency = batchBenchmark.aggregatedMetrics.averageMemoryUsed / batchSize; // bytes per file

        batchResults.push({
          batchSize,
          totalTime: batchBenchmark.analysis.mean,
          avgTimePerFile,
          throughput,
          memoryEfficiency
        });

        console.log(`  Batch ${batchSize}: ${batchBenchmark.analysis.mean.toFixed(0)}ms total, ${avgTimePerFile.toFixed(0)}ms/file, ${throughput.toFixed(3)} files/sec`);

        // Validate batch processing
        expect(batchBenchmark.results[0]).toHaveLength(batchSize);
        batchBenchmark.results[0].forEach(result => {
          expect(result.beats).toBeDefined();
          expect(result.beats.length).toBeGreaterThan(0);
        });
      }

      // Analyze batch processing efficiency
      console.log('Batch Processing Efficiency:');
      const baselineTimePerFile = batchResults[0]?.avgTimePerFile || 0;
      
      batchResults.forEach((result, index) => {
        if (index === 0) return;
        
        const efficiencyRatio = baselineTimePerFile / result.avgTimePerFile;
        const memoryRatio = result.memoryEfficiency / batchResults[0].memoryEfficiency;
        
        console.log(`  Batch ${result.batchSize}: ${efficiencyRatio.toFixed(2)}x time efficiency, ${memoryRatio.toFixed(2)}x memory ratio`);
        
        // Larger batches should generally be more time-efficient
        if (result.batchSize >= 10) {
          expect(efficiencyRatio).toBeGreaterThan(0.8); // Should be at least 80% as efficient
        }
        
        // Memory usage should not grow linearly with batch size (caching, reuse)
        expect(memoryRatio).toBeLessThan(result.batchSize * 0.8); // Sub-linear memory growth
      });

      // Find optimal batch size
      const bestThroughput = Math.max(...batchResults.map(r => r.throughput));
      const optimalBatch = batchResults.find(r => r.throughput === bestThroughput);
      
      if (optimalBatch) {
        console.log(`Optimal batch size: ${optimalBatch.batchSize} files (${optimalBatch.throughput.toFixed(3)} files/sec)`);
        expect(optimalBatch.batchSize).toBeGreaterThanOrEqual(5); // Should benefit from batching
      }
    }, 600000);

    test('Parallel batch processing with workers', async () => {
      if (workerPool.length < 2) {
        console.warn('Insufficient workers for parallel batch testing');
        return;
      }

      const parallelBatchSizes = [4, 8, 16];
      const workersToUse = Math.min(4, workerPool.length);
      
      for (const batchSize of parallelBatchSizes) {
        if (batchSize < workersToUse) continue;
        
        console.log(`Parallel batch test: ${batchSize} files with ${workersToUse} workers...`);
        
        // Generate test files
        const testFiles = Array.from({ length: batchSize }, () => 
          AudioPerformanceUtils.generateTestAudio(2, 44100, 'medium')
        );

        // Sequential processing (baseline)
        const sequentialBench = await PerformanceUtils.measureOperation(
          async () => {
            const results = [];
            for (const audio of testFiles) {
              results.push(await parser.parseBuffer(audio, { targetPictureCount: 4 }));
            }
            return results;
          },
          `Sequential batch: ${batchSize} files`
        );

        // Parallel processing with workers
        const parallelBench = await PerformanceUtils.measureOperation(
          async () => {
            const chunks = [];
            const chunkSize = Math.ceil(batchSize / workersToUse);
            
            for (let i = 0; i < batchSize; i += chunkSize) {
              chunks.push(testFiles.slice(i, i + chunkSize));
            }

            const promises = chunks.map(async (chunk, index) => {
              const worker = workerPool[index % workersToUse];
              const results = [];
              for (const audio of chunk) {
                results.push(await worker.parseBuffer(audio, { targetPictureCount: 4 }));
              }
              return results;
            });

            const chunkResults = await Promise.all(promises);
            return chunkResults.flat();
          },
          `Parallel batch: ${batchSize} files`
        );

        const speedup = sequentialBench.metrics.duration / parallelBench.metrics.duration;
        const efficiency = speedup / workersToUse;

        console.log(`  Sequential: ${sequentialBench.metrics.duration.toFixed(0)}ms`);
        console.log(`  Parallel: ${parallelBench.metrics.duration.toFixed(0)}ms`);
        console.log(`  Speedup: ${speedup.toFixed(2)}x (${(efficiency * 100).toFixed(1)}% efficiency)`);

        // Validate parallel processing benefits
        expect(speedup).toBeGreaterThan(1.2); // At least 20% speedup
        expect(efficiency).toBeGreaterThan(0.3); // At least 30% efficiency
        expect(parallelBench.result).toHaveLength(batchSize);
        
        // Results should be equivalent
        expect(sequentialBench.result).toHaveLength(batchSize);
        for (let i = 0; i < batchSize; i++) {
          expect(sequentialBench.result[i].beats.length).toBeGreaterThan(0);
          expect(parallelBench.result[i].beats.length).toBeGreaterThan(0);
          // Allow some variance in beat detection between sequential and parallel
          const beatCountDiff = Math.abs(sequentialBench.result[i].beats.length - parallelBench.result[i].beats.length);
          expect(beatCountDiff).toBeLessThanOrEqual(2);
        }
      }
    }, 400000);
  });

  describe('Resource Contention Testing', () => {
    test('CPU intensive workload scaling', async () => {
      const cpuIntensiveConfigs = [
        { label: 'Light CPU', frameSize: 1024, multiPass: false },
        { label: 'Medium CPU', frameSize: 2048, multiPass: false },
        { label: 'Heavy CPU', frameSize: 4096, multiPass: true },
        { label: 'Maximum CPU', frameSize: 8192, multiPass: true }
      ];

      const cpuScalingResults: Array<{
        config: string;
        singleThreadTime: number;
        multiThreadTime: number;
        scalingEfficiency: number;
      }> = [];

      for (const config of cpuIntensiveConfigs) {
        console.log(`CPU scaling test: ${config.label}...`);
        
        const testParser = new BeatParser({
          sampleRate: 44100,
          frameSize: config.frameSize,
          hopSize: config.frameSize / 4,
          multiPassEnabled: config.multiPass
        });

        const testAudio = AudioPerformanceUtils.generateTestAudio(8, 44100, 'high');

        try {
          // Single thread processing
          const singleThreadBench = await PerformanceUtils.measureOperation(
            () => testParser.parseBuffer(testAudio, { targetPictureCount: 16 }),
            `${config.label} - Single Thread`
          );

          // Multi-thread processing (using workers if available)
          let multiThreadTime = singleThreadBench.metrics.duration;
          if (workerPool.length >= 2) {
            const parallelBench = await PerformanceUtils.measureOperation(
              async () => {
                const chunkSize = Math.floor(testAudio.length / 2);
                const chunk1 = testAudio.slice(0, chunkSize + 1000); // Overlap
                const chunk2 = testAudio.slice(chunkSize - 1000);

                const [result1, result2] = await Promise.all([
                  workerPool[0].parseBuffer(chunk1, { targetPictureCount: 8 }),
                  workerPool[1].parseBuffer(chunk2, { targetPictureCount: 8 })
                ]);

                // Simple merge (in practice would need more sophisticated merging)
                return {
                  beats: [...result1.beats, ...result2.beats].sort((a, b) => a.time - b.time),
                  metadata: result1.metadata
                };
              },
              `${config.label} - Multi Thread`
            );
            
            multiThreadTime = parallelBench.metrics.duration;
          }

          const scalingEfficiency = singleThreadBench.metrics.duration / multiThreadTime;
          
          cpuScalingResults.push({
            config: config.label,
            singleThreadTime: singleThreadBench.metrics.duration,
            multiThreadTime,
            scalingEfficiency
          });

          console.log(`  Single: ${singleThreadBench.metrics.duration.toFixed(0)}ms`);
          console.log(`  Multi: ${multiThreadTime.toFixed(0)}ms`);
          console.log(`  Scaling: ${scalingEfficiency.toFixed(2)}x`);
        } finally {
          await testParser.cleanup();
        }
      }

      // Validate CPU scaling characteristics
      cpuScalingResults.forEach(result => {
        // More CPU-intensive configs should benefit more from parallelization
        if (result.config.includes('Heavy') || result.config.includes('Maximum')) {
          expect(result.scalingEfficiency).toBeGreaterThan(1.1); // At least 10% improvement
        }
        
        // All configs should complete in reasonable time
        expect(result.singleThreadTime).toBeLessThan(120000); // <2 minutes
        expect(result.multiThreadTime).toBeLessThan(120000);
      });
    }, 600000);

    test('Memory pressure handling', async () => {
      // Simulate memory pressure by processing multiple large files simultaneously
      const memoryPressureTest = async (simultaneousFiles: number) => {
        console.log(`Memory pressure test: ${simultaneousFiles} simultaneous files...`);
        
        const testFiles = Array.from({ length: simultaneousFiles }, () => 
          AudioPerformanceUtils.generateTestAudio(30, 44100, 'high') // 30s high-complexity audio
        );

        const memoryProfile = await PerformanceUtils.profileMemoryUsage(
          async () => {
            if (simultaneousFiles === 1 || workerPool.length === 0) {
              // Sequential processing
              const results = [];
              for (const audio of testFiles) {
                results.push(await parser.parseBuffer(audio, { targetPictureCount: 60 }));
              }
              return results;
            } else {
              // Concurrent processing with available workers
              const promises = testFiles.map((audio, index) => {
                const worker = workerPool[index % workerPool.length];
                return worker.parseBuffer(audio, { targetPictureCount: 60 });
              });
              return Promise.all(promises);
            }
          },
          `Memory pressure: ${simultaneousFiles} files`,
          50 // Frequent memory snapshots
        );

        const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
        const memoryPerFile = peakMemoryMB / simultaneousFiles;
        
        return {
          simultaneousFiles,
          peakMemoryMB,
          memoryPerFile,
          processingTime: memoryProfile.snapshots[memoryProfile.snapshots.length - 1].timestamp - 
                         memoryProfile.snapshots[0].timestamp,
          successful: memoryProfile.result.length === simultaneousFiles
        };
      };

      const pressureResults = [];
      const testCounts = [1, 2, 4, Math.min(8, workerPool.length || 2)];
      
      for (const count of testCounts) {
        try {
          const result = await memoryPressureTest(count);
          pressureResults.push(result);
          
          console.log(`  ${count} files: ${result.peakMemoryMB.toFixed(2)}MB peak (${result.memoryPerFile.toFixed(2)}MB/file), ${result.processingTime.toFixed(0)}ms`);
          
          // Validate memory usage under pressure
          expect(result.successful).toBe(true);
          expect(result.peakMemoryMB).toBeLessThan(1000 * count); // <1GB per file (very generous)
          expect(result.memoryPerFile).toBeLessThan(200); // <200MB per file average
        } catch (error) {
          console.warn(`Memory pressure test with ${count} files failed:`, error);
          // If we hit memory limits, that's actually useful information
          if (error.message?.includes('memory') || error.message?.includes('heap')) {
            pressureResults.push({
              simultaneousFiles: count,
              peakMemoryMB: 0,
              memoryPerFile: 0,
              processingTime: 0,
              successful: false
            });
          } else {
            throw error;
          }
        }
      }

      // Analyze memory scaling under pressure
      const successfulResults = pressureResults.filter(r => r.successful);
      if (successfulResults.length > 1) {
        console.log('Memory Pressure Scaling:');
        for (let i = 1; i < successfulResults.length; i++) {
          const current = successfulResults[i];
          const previous = successfulResults[i - 1];
          
          const memoryScaling = current.peakMemoryMB / previous.peakMemoryMB;
          const fileScaling = current.simultaneousFiles / previous.simultaneousFiles;
          const efficiency = memoryScaling / fileScaling;
          
          console.log(`  ${previous.simultaneousFiles} → ${current.simultaneousFiles} files: ${efficiency.toFixed(2)} memory efficiency`);
          
          // Memory should scale sub-linearly (shared resources, caching)
          expect(efficiency).toBeLessThan(1.5); // Better than 1.5x memory increase per file increase
        }
      }

      // At least single file processing should always work
      expect(successfulResults.length).toBeGreaterThanOrEqual(1);
    }, 600000);
  });

  describe('Performance Degradation Analysis', () => {
    test('Long-running performance stability', async () => {
      console.log('Long-running performance stability test...');
      
      const testDuration = 120000; // 2 minutes
      const testInterval = 10000;  // 10 seconds
      const iterations = testDuration / testInterval;
      
      const stabilityResults: Array<{
        iteration: number;
        processingTime: number;
        memoryUsed: number;
        beatsFound: number;
      }> = [];

      for (let i = 0; i < iterations; i++) {
        const testAudio = AudioPerformanceUtils.generateTestAudio(5, 44100, 'medium');
        
        const { result, metrics } = await PerformanceUtils.measureOperation(
          () => parser.parseBuffer(testAudio, { targetPictureCount: 10 }),
          `Stability iteration ${i + 1}`,
          { iterations: 1, forceGC: false } // Don't force GC to see natural behavior
        );

        stabilityResults.push({
          iteration: i + 1,
          processingTime: metrics.duration,
          memoryUsed: Math.max(0, metrics.memoryUsage.heapUsed),
          beatsFound: result.beats.length
        });

        console.log(`  Iteration ${i + 1}/${iterations}: ${metrics.duration.toFixed(2)}ms, ${result.beats.length} beats`);
        
        // Wait for next iteration
        if (i < iterations - 1) {
          await new Promise(resolve => setTimeout(resolve, testInterval - metrics.duration));
        }
      }

      // Analyze stability metrics
      const processingTimes = stabilityResults.map(r => r.processingTime);
      const memoryUsages = stabilityResults.map(r => r.memoryUsed);
      const beatCounts = stabilityResults.map(r => r.beatsFound);

      const timeStats = PerformanceUtils.calculateStatistics(processingTimes);
      const memoryStats = PerformanceUtils.calculateStatistics(memoryUsages);
      const beatStats = PerformanceUtils.calculateStatistics(beatCounts);

      console.log('Stability Analysis:');
      console.log(`  Processing time: ${timeStats.mean.toFixed(2)}ms ± ${timeStats.stdDev.toFixed(2)}ms (CV: ${(timeStats.stdDev / timeStats.mean * 100).toFixed(1)}%)`);
      console.log(`  Memory usage: ${(memoryStats.mean / 1024 / 1024).toFixed(2)}MB ± ${(memoryStats.stdDev / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Beat detection: ${beatStats.mean.toFixed(1)} ± ${beatStats.stdDev.toFixed(1)} beats`);

      // Validate stability
      const timeCV = timeStats.stdDev / timeStats.mean;
      const memoryCV = memoryStats.stdDev / memoryStats.mean;
      const beatCV = beatStats.stdDev / beatStats.mean;

      expect(timeCV).toBeLessThan(0.5); // <50% coefficient of variation
      expect(memoryCV).toBeLessThan(1.0); // <100% coefficient of variation
      expect(beatCV).toBeLessThan(0.3); // <30% coefficient of variation for beat detection

      // No significant performance degradation over time
      const firstHalf = processingTimes.slice(0, Math.floor(iterations / 2));
      const secondHalf = processingTimes.slice(Math.floor(iterations / 2));
      
      const firstHalfAvg = firstHalf.reduce((sum, t) => sum + t, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, t) => sum + t, 0) / secondHalf.length;
      const degradationRatio = secondHalfAvg / firstHalfAvg;

      console.log(`  Performance degradation ratio: ${degradationRatio.toFixed(3)} (1.0 = no degradation)`);
      expect(degradationRatio).toBeLessThan(1.5); // <50% degradation
      expect(degradationRatio).toBeGreaterThan(0.7); // Not significantly faster (suspicious)
    }, 180000);

    test('Resource cleanup verification', async () => {
      console.log('Resource cleanup verification test...');
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const initialMemory = process.memoryUsage();
      
      // Create and destroy multiple parsers with heavy workloads
      const cleanupResults: Array<{
        cycle: number;
        peakMemory: number;
        finalMemory: number;
        memoryLeak: number;
      }> = [];

      for (let cycle = 0; cycle < 5; cycle++) {
        const testParser = new BeatParser({
          sampleRate: 44100,
          frameSize: 4096,
          hopSize: 1024
        });

        try {
          // Heavy workload
          const testAudio = AudioPerformanceUtils.generateTestAudio(15, 44100, 'high');
          const memoryProfile = await PerformanceUtils.profileMemoryUsage(
            () => testParser.parseBuffer(testAudio, { targetPictureCount: 30 }),
            `Cleanup cycle ${cycle + 1}`
          );

          const peakMemoryMB = memoryProfile.peakMemory.heapUsed / 1024 / 1024;
          
          // Cleanup parser
          await testParser.cleanup();
          
          // Force garbage collection
          if (global.gc) {
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          const finalMemory = process.memoryUsage();
          const finalMemoryMB = finalMemory.heapUsed / 1024 / 1024;
          const memoryLeak = finalMemory.heapUsed - initialMemory.heapUsed;

          cleanupResults.push({
            cycle: cycle + 1,
            peakMemory: peakMemoryMB,
            finalMemory: finalMemoryMB,
            memoryLeak
          });

          console.log(`  Cycle ${cycle + 1}: Peak ${peakMemoryMB.toFixed(2)}MB, Final ${finalMemoryMB.toFixed(2)}MB, Leak ${(memoryLeak / 1024 / 1024).toFixed(2)}MB`);
        } finally {
          await testParser.cleanup();
        }
      }

      // Analyze cleanup effectiveness
      const totalLeak = cleanupResults[cleanupResults.length - 1].memoryLeak;
      const totalLeakMB = totalLeak / 1024 / 1024;
      const avgPeakMemory = cleanupResults.reduce((sum, r) => sum + r.peakMemory, 0) / cleanupResults.length;

      console.log(`Total memory leak after ${cleanupResults.length} cycles: ${totalLeakMB.toFixed(2)}MB`);
      console.log(`Average peak memory usage: ${avgPeakMemory.toFixed(2)}MB`);

      // Validate cleanup effectiveness
      expect(totalLeakMB).toBeLessThan(50); // <50MB total leak after multiple cycles
      expect(totalLeakMB / cleanupResults.length).toBeLessThan(10); // <10MB leak per cycle

      // Memory usage should not grow unbounded
      const finalResult = cleanupResults[cleanupResults.length - 1];
      const firstResult = cleanupResults[0];
      expect(finalResult.finalMemory).toBeLessThan(firstResult.finalMemory + 30); // <30MB net growth
    }, 300000);
  });
});