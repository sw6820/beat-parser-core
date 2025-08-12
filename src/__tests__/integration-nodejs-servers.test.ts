/**
 * Node.js Server Integration Tests
 * Comprehensive testing of beat-parser integration with Node.js server frameworks
 * Tests Express middleware, API endpoints, streaming, clustering, and production scenarios
 */

import { BeatParser } from '../core/BeatParser';
import { ParseResult, Beat } from '../types';
import { 
  TestApplicationFactory, 
  IntegrationTestOrchestrator,
  LoadTestEngine,
  PerformanceMonitor,
  ResourceMonitor 
} from './integration-testing-utils';

describe('Node.js Server Integration Tests', () => {
  let beatParser: BeatParser;
  let testAudioFiles: Map<string, Float32Array>;
  let mockNodeApp: any;

  beforeAll(async () => {
    testAudioFiles = IntegrationTestOrchestrator.generateTestAudioFiles();
    mockNodeApp = await TestApplicationFactory.createNodeApp();
  });

  beforeEach(async () => {
    beatParser = new BeatParser({
      sampleRate: 44100,
      enablePreprocessing: true,
      enableNormalization: true
    });
    
    ResourceMonitor.takeSnapshot();
  });

  afterEach(async () => {
    await beatParser.cleanup();
    ResourceMonitor.takeSnapshot();
  });

  afterAll(async () => {
    await mockNodeApp.cleanup();
    ResourceMonitor.clearSnapshots();
  });

  describe('Express.js Middleware Integration', () => {
    test('should work as Express middleware for audio processing', async () => {
      PerformanceMonitor.startMeasurement('express-middleware');
      
      // Mock Express-like request/response objects
      interface MockRequest {
        body?: any;
        file?: {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
        };
        files?: Array<{ buffer: Buffer; mimetype: string; originalname: string }>;
        params: Record<string, string>;
        query: Record<string, string>;
      }

      interface MockResponse {
        statusCode: number;
        headers: Record<string, string>;
        data?: any;
        status(code: number): MockResponse;
        json(data: any): MockResponse;
        set(header: string, value: string): MockResponse;
        send(data: any): MockResponse;
      }

      const createMockResponse = (): MockResponse => ({
        statusCode: 200,
        headers: {},
        status: function(code: number) { this.statusCode = code; return this; },
        json: function(data: any) { this.data = data; return this; },
        set: function(header: string, value: string) { this.headers[header] = value; return this; },
        send: function(data: any) { this.data = data; return this; }
      });

      // Audio processing middleware
      const audioProcessingMiddleware = async (
        req: MockRequest, 
        res: MockResponse, 
        next: () => void
      ) => {
        try {
          if (!req.file?.buffer) {
            return res.status(400).json({ error: 'No audio file provided' });
          }

          // Validate audio file type
          const supportedTypes = ['audio/wav', 'audio/mp3', 'audio/flac'];
          if (!supportedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ 
              error: `Unsupported audio format: ${req.file.mimetype}` 
            });
          }

          const parser = new BeatParser();
          
          try {
            // Convert buffer to Float32Array (simplified conversion)
            const audioData = new Float32Array(req.file.buffer.length / 4);
            for (let i = 0; i < audioData.length; i++) {
              audioData[i] = req.file.buffer.readFloatLE(i * 4) || 0;
            }

            const options = {
              targetPictureCount: parseInt(req.query.targetPictureCount as string) || 10,
              minConfidence: parseFloat(req.query.minConfidence as string) || 0.5,
              selectionMethod: (req.query.selectionMethod as any) || 'adaptive'
            };

            const result = await parser.parseBuffer(audioData, options);
            
            res.set('Content-Type', 'application/json');
            res.json({
              success: true,
              filename: req.file.originalname,
              beats: result.beats,
              tempo: result.tempo,
              metadata: result.metadata
            });
          } finally {
            await parser.cleanup();
          }
        } catch (error) {
          res.status(500).json({
            error: error instanceof Error ? error.message : 'Processing failed',
            success: false
          });
        }
      };

      // Test middleware
      const audioBuffer = Buffer.from(testAudioFiles.get('short-beat.wav')!.buffer);
      
      const req: MockRequest = {
        file: {
          buffer: audioBuffer,
          mimetype: 'audio/wav',
          originalname: 'test.wav'
        },
        params: {},
        query: { targetPictureCount: '15', minConfidence: '0.6' }
      };

      const res = createMockResponse();
      
      await audioProcessingMiddleware(req, res, () => {});

      expect(res.statusCode).toBe(200);
      expect(res.data?.success).toBe(true);
      expect(res.data?.beats).toBeDefined();
      expect(res.data?.beats.length).toBeGreaterThan(0);
      expect(res.data?.filename).toBe('test.wav');

      const duration = PerformanceMonitor.endMeasurement('express-middleware');
      expect(duration).toBeLessThan(10000);
    });

    test('should handle file upload validation middleware', async () => {
      // File validation middleware
      const validateAudioUpload = (
        req: any,
        res: any,
        next: () => void
      ) => {
        if (!req.file) {
          return res.status(400).json({ error: 'Audio file is required' });
        }

        // Check file size (10MB limit)
        const maxSize = 10 * 1024 * 1024;
        if (req.file.buffer.length > maxSize) {
          return res.status(413).json({ error: 'File too large. Maximum size: 10MB' });
        }

        // Check file type
        const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/flac', 'audio/ogg'];
        if (!allowedTypes.includes(req.file.mimetype)) {
          return res.status(415).json({ 
            error: `Unsupported media type: ${req.file.mimetype}` 
          });
        }

        // Check audio duration (estimate from file size)
        const estimatedDuration = req.file.buffer.length / (44100 * 2 * 2); // stereo 16-bit
        const maxDuration = 600; // 10 minutes
        if (estimatedDuration > maxDuration) {
          return res.status(413).json({ 
            error: `Audio too long. Maximum duration: ${maxDuration} seconds` 
          });
        }

        next();
      };

      const createMockResponse = () => ({
        statusCode: 200,
        data: null,
        status: function(code: number) { this.statusCode = code; return this; },
        json: function(data: any) { this.data = data; return this; }
      });

      // Test valid file
      const validReq = {
        file: {
          buffer: Buffer.alloc(1000),
          mimetype: 'audio/wav'
        }
      };
      const validRes = createMockResponse();
      let nextCalled = false;

      validateAudioUpload(validReq, validRes, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(validRes.statusCode).toBe(200);

      // Test missing file
      const noFileReq = {};
      const noFileRes = createMockResponse();
      
      validateAudioUpload(noFileReq, noFileRes, () => {});
      expect(noFileRes.statusCode).toBe(400);
      expect(noFileRes.data?.error).toContain('required');

      // Test unsupported type
      const badTypeReq = {
        file: {
          buffer: Buffer.alloc(1000),
          mimetype: 'video/mp4'
        }
      };
      const badTypeRes = createMockResponse();
      
      validateAudioUpload(badTypeReq, badTypeRes, () => {});
      expect(badTypeRes.statusCode).toBe(415);
      expect(badTypeRes.data?.error).toContain('Unsupported');
    });

    test('should handle rate limiting middleware integration', async () => {
      // Rate limiting middleware simulation
      const rateLimiter = (() => {
        const clients = new Map<string, { requests: number; resetTime: number }>();
        const maxRequests = 10;
        const windowMs = 60000; // 1 minute

        return (req: any, res: any, next: () => void) => {
          const clientId = req.ip || 'unknown';
          const now = Date.now();
          
          let client = clients.get(clientId);
          
          if (!client || now > client.resetTime) {
            client = {
              requests: 0,
              resetTime: now + windowMs
            };
            clients.set(clientId, client);
          }
          
          client.requests++;
          
          if (client.requests > maxRequests) {
            return res.status(429).json({
              error: 'Too many requests',
              retryAfter: Math.ceil((client.resetTime - now) / 1000)
            });
          }
          
          res.set('X-RateLimit-Limit', maxRequests.toString());
          res.set('X-RateLimit-Remaining', (maxRequests - client.requests).toString());
          res.set('X-RateLimit-Reset', client.resetTime.toString());
          
          next();
        };
      })();

      const createMockResponse = () => ({
        statusCode: 200,
        headers: {},
        data: null,
        status: function(code: number) { this.statusCode = code; return this; },
        json: function(data: any) { this.data = data; return this; },
        set: function(header: string, value: string) { this.headers[header] = value; return this; }
      });

      // Test normal requests
      for (let i = 1; i <= 5; i++) {
        const req = { ip: '192.168.1.1' };
        const res = createMockResponse();
        let nextCalled = false;

        rateLimiter(req, res, () => { nextCalled = true; });
        
        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBe(200);
        expect(res.headers['X-RateLimit-Remaining']).toBe((10 - i).toString());
      }

      // Test rate limit exceeded
      const req = { ip: '192.168.1.1' };
      
      // Make 6 more requests to exceed limit
      for (let i = 6; i <= 11; i++) {
        const res = createMockResponse();
        let nextCalled = false;
        
        rateLimiter(req, res, () => { nextCalled = true; });
        
        if (i <= 10) {
          expect(nextCalled).toBe(true);
          expect(res.statusCode).toBe(200);
        } else {
          expect(nextCalled).toBe(false);
          expect(res.statusCode).toBe(429);
          expect(res.data?.error).toContain('Too many requests');
        }
      }
    });
  });

  describe('API Endpoint Integration', () => {
    test('should implement RESTful audio processing endpoints', async () => {
      // Mock API router
      const apiRoutes = {
        routes: new Map<string, (req: any, res: any) => Promise<void>>(),
        
        post: function(path: string, handler: (req: any, res: any) => Promise<void>) {
          this.routes.set(`POST ${path}`, handler);
        },
        
        get: function(path: string, handler: (req: any, res: any) => Promise<void>) {
          this.routes.set(`GET ${path}`, handler);
        },
        
        delete: function(path: string, handler: (req: any, res: any) => Promise<void>) {
          this.routes.set(`DELETE ${path}`, handler);
        }
      };

      // In-memory job storage
      const jobs = new Map<string, {
        id: string;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        result?: ParseResult;
        error?: string;
        createdAt: number;
      }>();

      // POST /api/audio/process - Start audio processing job
      apiRoutes.post('/api/audio/process', async (req, res) => {
        try {
          const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          jobs.set(jobId, {
            id: jobId,
            status: 'pending',
            createdAt: Date.now()
          });

          res.status(202).json({
            jobId,
            status: 'accepted',
            statusUrl: `/api/audio/jobs/${jobId}`
          });

          // Simulate async processing
          setTimeout(async () => {
            const job = jobs.get(jobId);
            if (!job) return;

            try {
              job.status = 'processing';
              
              const parser = new BeatParser();
              const audioData = testAudioFiles.get('short-beat.wav')!;
              const result = await parser.parseBuffer(audioData, req.body?.options || {});
              await parser.cleanup();

              job.status = 'completed';
              job.result = result;
            } catch (error) {
              job.status = 'failed';
              job.error = error instanceof Error ? error.message : 'Processing failed';
            }
          }, 100);

        } catch (error) {
          res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal server error'
          });
        }
      });

      // GET /api/audio/jobs/:jobId - Get job status and result
      apiRoutes.get('/api/audio/jobs/:jobId', async (req, res) => {
        const job = jobs.get(req.params.jobId);
        
        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        const response: any = {
          jobId: job.id,
          status: job.status,
          createdAt: job.createdAt
        };

        if (job.status === 'completed' && job.result) {
          response.result = {
            beats: job.result.beats,
            tempo: job.result.tempo,
            metadata: job.result.metadata
          };
        } else if (job.status === 'failed' && job.error) {
          response.error = job.error;
        }

        res.json(response);
      });

      // DELETE /api/audio/jobs/:jobId - Cancel/delete job
      apiRoutes.delete('/api/audio/jobs/:jobId', async (req, res) => {
        if (!jobs.has(req.params.jobId)) {
          return res.status(404).json({ error: 'Job not found' });
        }

        jobs.delete(req.params.jobId);
        res.status(204).send();
      });

      // Test API endpoints
      const createMockResponse = () => ({
        statusCode: 200,
        data: null,
        status: function(code: number) { this.statusCode = code; return this; },
        json: function(data: any) { this.data = data; return this; },
        send: function(data?: any) { this.data = data; return this; }
      });

      // Test job creation
      const createReq = { body: { options: { targetPictureCount: 10 } } };
      const createRes = createMockResponse();
      
      await apiRoutes.routes.get('POST /api/audio/process')!(createReq, createRes);
      
      expect(createRes.statusCode).toBe(202);
      expect(createRes.data?.jobId).toBeDefined();
      expect(createRes.data?.status).toBe('accepted');

      const jobId = createRes.data.jobId;

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Test job status retrieval
      const statusReq = { params: { jobId } };
      const statusRes = createMockResponse();
      
      await apiRoutes.routes.get('GET /api/audio/jobs/:jobId')!(statusReq, statusRes);
      
      expect(statusRes.statusCode).toBe(200);
      expect(statusRes.data?.status).toBe('completed');
      expect(statusRes.data?.result?.beats).toBeDefined();

      // Test job deletion
      const deleteReq = { params: { jobId } };
      const deleteRes = createMockResponse();
      
      await apiRoutes.routes.get('DELETE /api/audio/jobs/:jobId')!(deleteReq, deleteRes);
      
      expect(deleteRes.statusCode).toBe(204);
      
      // Verify job is deleted
      const statusReq2 = { params: { jobId } };
      const statusRes2 = createMockResponse();
      
      await apiRoutes.routes.get('GET /api/audio/jobs/:jobId')!(statusReq2, statusRes2);
      
      expect(statusRes2.statusCode).toBe(404);
    });

    test('should implement GraphQL resolver integration', async () => {
      // Mock GraphQL resolver context
      interface GraphQLContext {
        dataSources: {
          audioProcessor: {
            processAudio: (audioData: Float32Array, options?: any) => Promise<ParseResult>;
            cleanup: () => Promise<void>;
          };
        };
      }

      // GraphQL type definitions (simplified)
      const typeDefs = {
        Beat: ['timestamp', 'confidence', 'strength'],
        Tempo: ['bpm', 'confidence'],
        AudioProcessingResult: ['beats', 'tempo', 'metadata'],
        AudioProcessingInput: ['targetPictureCount', 'minConfidence', 'selectionMethod']
      };

      // GraphQL resolvers
      const resolvers = {
        Query: {
          processAudio: async (
            parent: any,
            args: { audioData: string; options?: any },
            context: GraphQLContext
          ) => {
            try {
              // In real implementation, audioData would be base64 encoded
              const audioData = testAudioFiles.get('short-beat.wav')!;
              
              const result = await context.dataSources.audioProcessor.processAudio(
                audioData,
                args.options
              );
              
              return {
                beats: result.beats.map(beat => ({
                  timestamp: beat.timestamp,
                  confidence: beat.confidence,
                  strength: beat.strength
                })),
                tempo: result.tempo ? {
                  bpm: result.tempo.bpm,
                  confidence: result.tempo.confidence
                } : null,
                metadata: result.metadata
              };
            } catch (error) {
              throw new Error(
                error instanceof Error ? error.message : 'Processing failed'
              );
            }
          }
        },

        Mutation: {
          processAudioAsync: async (
            parent: any,
            args: { audioData: string; options?: any },
            context: GraphQLContext
          ) => {
            const jobId = `gql-job-${Date.now()}`;
            
            // Start async processing
            setTimeout(async () => {
              try {
                const audioData = testAudioFiles.get('short-beat.wav')!;
                await context.dataSources.audioProcessor.processAudio(audioData, args.options);
              } catch (error) {
                console.error('Async processing failed:', error);
              }
            }, 0);

            return {
              jobId,
              status: 'PENDING'
            };
          }
        }
      };

      // Create mock context
      const mockContext: GraphQLContext = {
        dataSources: {
          audioProcessor: {
            processAudio: async (audioData: Float32Array, options?: any) => {
              const parser = new BeatParser();
              try {
                return await parser.parseBuffer(audioData, options);
              } finally {
                await parser.cleanup();
              }
            },
            cleanup: async () => {}
          }
        }
      };

      // Test GraphQL query resolver
      const queryResult = await resolvers.Query.processAudio(
        null,
        { 
          audioData: 'encoded-audio-data',
          options: { targetPictureCount: 8 }
        },
        mockContext
      );

      expect(queryResult.beats).toBeDefined();
      expect(queryResult.beats.length).toBeGreaterThan(0);
      expect(queryResult.tempo).toBeDefined();
      expect(queryResult.metadata).toBeDefined();

      // Test GraphQL mutation resolver
      const mutationResult = await resolvers.Mutation.processAudioAsync(
        null,
        { audioData: 'encoded-audio-data' },
        mockContext
      );

      expect(mutationResult.jobId).toBeDefined();
      expect(mutationResult.status).toBe('PENDING');
    });
  });

  describe('Stream Processing Integration', () => {
    test('should handle real-time audio stream processing', async () => {
      // Mock stream interface
      class MockAudioStream {
        private chunks: Float32Array[] = [];
        private listeners: Array<(chunk: Float32Array) => void> = [];
        private endListeners: Array<() => void> = [];
        private ended = false;

        addChunk(chunk: Float32Array): void {
          this.chunks.push(chunk);
          this.listeners.forEach(listener => listener(chunk));
        }

        end(): void {
          this.ended = true;
          this.endListeners.forEach(listener => listener());
        }

        on(event: 'data' | 'end', listener: any): void {
          if (event === 'data') {
            this.listeners.push(listener);
            // Emit existing chunks
            this.chunks.forEach(chunk => listener(chunk));
          } else if (event === 'end') {
            this.endListeners.push(listener);
            if (this.ended) listener();
          }
        }
      }

      // Streaming audio processor
      class StreamingAudioProcessor {
        private parser: BeatParser;
        private buffer: Float32Array = new Float32Array(0);
        private results: Beat[] = [];
        private chunkSize = 44100; // 1 second chunks

        constructor() {
          this.parser = new BeatParser({
            sampleRate: 44100,
            enablePreprocessing: true
          });
        }

        async processStream(stream: MockAudioStream): Promise<Beat[]> {
          return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Float32Array) => {
              this.addChunk(chunk);
            });

            stream.on('end', async () => {
              try {
                // Process any remaining buffer
                if (this.buffer.length > 0) {
                  await this.processChunk(this.buffer);
                }
                await this.parser.cleanup();
                resolve(this.results);
              } catch (error) {
                reject(error);
              }
            });
          });
        }

        private addChunk(chunk: Float32Array): void {
          // Combine with existing buffer
          const newBuffer = new Float32Array(this.buffer.length + chunk.length);
          newBuffer.set(this.buffer);
          newBuffer.set(chunk, this.buffer.length);
          this.buffer = newBuffer;

          // Process full chunks
          while (this.buffer.length >= this.chunkSize) {
            const chunkToProcess = this.buffer.slice(0, this.chunkSize);
            this.buffer = this.buffer.slice(this.chunkSize);
            
            this.processChunk(chunkToProcess);
          }
        }

        private async processChunk(chunk: Float32Array): Promise<void> {
          try {
            const result = await this.parser.parseBuffer(chunk);
            this.results.push(...result.beats);
          } catch (error) {
            console.error('Chunk processing error:', error);
          }
        }
      }

      // Test streaming processing
      const processor = new StreamingAudioProcessor();
      const mockStream = new MockAudioStream();

      // Start processing
      const processingPromise = processor.processStream(mockStream);

      // Simulate streaming audio data
      const fullAudio = testAudioFiles.get('medium-song.wav')!;
      const chunkSize = 8192; // Small chunks to simulate real-time

      for (let i = 0; i < fullAudio.length; i += chunkSize) {
        const chunk = fullAudio.slice(i, i + chunkSize);
        mockStream.addChunk(chunk);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      mockStream.end();

      // Wait for processing to complete
      const allBeats = await processingPromise;

      expect(allBeats.length).toBeGreaterThan(0);
      
      // Verify beats are in chronological order
      for (let i = 1; i < allBeats.length; i++) {
        expect(allBeats[i].timestamp).toBeGreaterThanOrEqual(allBeats[i - 1].timestamp);
      }
    });

    test('should handle WebSocket audio streaming', async () => {
      // Mock WebSocket interface
      class MockWebSocket {
        private messageHandlers: Array<(data: any) => void> = [];
        private closeHandlers: Array<() => void> = [];
        private isOpen = true;

        on(event: 'message' | 'close', handler: any): void {
          if (event === 'message') {
            this.messageHandlers.push(handler);
          } else if (event === 'close') {
            this.closeHandlers.push(handler);
          }
        }

        send(data: any): void {
          // Simulate sending data back to client
        }

        close(): void {
          this.isOpen = false;
          this.closeHandlers.forEach(handler => handler());
        }

        // Simulate receiving message
        receiveMessage(data: any): void {
          if (this.isOpen) {
            this.messageHandlers.forEach(handler => handler(data));
          }
        }
      }

      // WebSocket audio processor
      class WebSocketAudioProcessor {
        private connections = new Map<string, {
          ws: MockWebSocket;
          parser: BeatParser;
          sessionId: string;
        }>();

        handleConnection(ws: MockWebSocket, sessionId: string): void {
          const parser = new BeatParser();
          
          this.connections.set(sessionId, { ws, parser, sessionId });

          ws.on('message', async (message: any) => {
            try {
              const data = JSON.parse(message);
              
              if (data.type === 'audio-chunk') {
                // Convert received audio data
                const audioData = new Float32Array(data.audioData);
                const result = await parser.parseBuffer(audioData);
                
                ws.send(JSON.stringify({
                  type: 'beat-result',
                  sessionId,
                  beats: result.beats,
                  timestamp: Date.now()
                }));
              }
            } catch (error) {
              ws.send(JSON.stringify({
                type: 'error',
                message: error instanceof Error ? error.message : 'Processing error'
              }));
            }
          });

          ws.on('close', async () => {
            const connection = this.connections.get(sessionId);
            if (connection) {
              await connection.parser.cleanup();
              this.connections.delete(sessionId);
            }
          });
        }

        async cleanup(): Promise<void> {
          for (const connection of this.connections.values()) {
            await connection.parser.cleanup();
            connection.ws.close();
          }
          this.connections.clear();
        }
      }

      const processor = new WebSocketAudioProcessor();
      const mockWs = new MockWebSocket();
      const sessionId = 'test-session';

      let receivedBeats: Beat[] = [];
      
      // Mock client message handler
      mockWs.on('message', (message: string) => {
        const data = JSON.parse(message);
        if (data.type === 'beat-result') {
          receivedBeats.push(...data.beats);
        }
      });

      // Setup connection
      processor.handleConnection(mockWs, sessionId);

      // Simulate client sending audio chunk
      const audioData = testAudioFiles.get('short-beat.wav')!;
      const audioChunk = Array.from(audioData.slice(0, 4096));

      mockWs.receiveMessage(JSON.stringify({
        type: 'audio-chunk',
        audioData: audioChunk
      }));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedBeats.length).toBeGreaterThan(0);

      await processor.cleanup();
    });
  });

  describe('Cluster and Worker Integration', () => {
    test('should work with Node.js cluster module', async () => {
      // Mock cluster interface
      const mockCluster = {
        isMaster: true,
        workers: new Map<number, any>(),
        messageHandlers: [] as Array<(message: any) => void>,
        
        fork(): any {
          const workerId = this.workers.size + 1;
          const worker = {
            id: workerId,
            process: { pid: 1000 + workerId },
            send: (message: any) => {
              // Simulate message to worker
              setTimeout(() => {
                this.handleWorkerMessage(workerId, message);
              }, 10);
            },
            on: (event: string, handler: Function) => {
              if (event === 'message') {
                this.messageHandlers.push(handler);
              }
            }
          };
          
          this.workers.set(workerId, worker);
          return worker;
        },
        
        handleWorkerMessage(workerId: number, message: any): void {
          // Simulate worker processing
          setTimeout(() => {
            const responseMessage = {
              type: 'result',
              workerId,
              result: {
                beats: [
                  { timestamp: 1000, confidence: 0.8, strength: 0.7 },
                  { timestamp: 2000, confidence: 0.9, strength: 0.8 }
                ]
              },
              originalMessage: message
            };
            
            this.messageHandlers.forEach(handler => handler(responseMessage));
          }, 50);
        }
      };

      // Cluster-aware audio processor
      class ClusteredAudioProcessor {
        private workers: any[] = [];
        private currentWorker = 0;
        private pendingJobs = new Map<string, {
          resolve: (result: any) => void;
          reject: (error: Error) => void;
        }>();

        constructor(numWorkers: number = 4) {
          if (mockCluster.isMaster) {
            this.setupMaster(numWorkers);
          }
        }

        private setupMaster(numWorkers: number): void {
          // Fork workers
          for (let i = 0; i < numWorkers; i++) {
            const worker = mockCluster.fork();
            this.workers.push(worker);
            
            worker.on('message', (message: any) => {
              if (message.type === 'result') {
                const job = this.pendingJobs.get(message.originalMessage.jobId);
                if (job) {
                  job.resolve(message.result);
                  this.pendingJobs.delete(message.originalMessage.jobId);
                }
              }
            });
          }
        }

        async processAudio(audioData: Float32Array): Promise<ParseResult> {
          return new Promise((resolve, reject) => {
            const jobId = `job-${Date.now()}-${Math.random()}`;
            
            this.pendingJobs.set(jobId, { resolve, reject });
            
            // Round-robin worker selection
            const worker = this.workers[this.currentWorker];
            this.currentWorker = (this.currentWorker + 1) % this.workers.length;
            
            worker.send({
              type: 'process-audio',
              jobId,
              audioData: Array.from(audioData.slice(0, 1000)) // Send subset for test
            });
            
            // Timeout handling
            setTimeout(() => {
              if (this.pendingJobs.has(jobId)) {
                this.pendingJobs.delete(jobId);
                reject(new Error('Processing timeout'));
              }
            }, 5000);
          });
        }
      }

      const processor = new ClusteredAudioProcessor(2);
      const audioData = testAudioFiles.get('short-beat.wav')!;
      
      // Process audio using cluster
      const result = await processor.processAudio(audioData);
      
      expect(result.beats).toBeDefined();
      expect(result.beats.length).toBeGreaterThan(0);
      expect(mockCluster.workers.size).toBe(2);
    });

    test('should handle worker process failures gracefully', async () => {
      // Mock worker that can fail
      class MockWorkerPool {
        private workers: Array<{
          id: number;
          healthy: boolean;
          processing: boolean;
          parser: BeatParser;
        }> = [];
        private failureCount = 0;

        constructor(size: number) {
          for (let i = 0; i < size; i++) {
            this.workers.push({
              id: i,
              healthy: true,
              processing: false,
              parser: new BeatParser()
            });
          }
        }

        async processWithFailover(audioData: Float32Array): Promise<ParseResult> {
          let lastError: Error | null = null;
          
          // Try each healthy worker
          for (const worker of this.workers) {
            if (!worker.healthy || worker.processing) continue;
            
            try {
              worker.processing = true;
              
              // Simulate random worker failures
              if (Math.random() < 0.3) {
                worker.healthy = false;
                this.failureCount++;
                throw new Error(`Worker ${worker.id} failed`);
              }
              
              const result = await worker.parser.parseBuffer(audioData);
              worker.processing = false;
              return result;
              
            } catch (error) {
              worker.processing = false;
              lastError = error instanceof Error ? error : new Error('Unknown error');
              continue;
            }
          }
          
          // No healthy workers available
          throw new Error(`All workers failed. Last error: ${lastError?.message || 'Unknown'}`);
        }

        getHealthyWorkerCount(): number {
          return this.workers.filter(w => w.healthy).length;
        }

        async restartFailedWorkers(): Promise<void> {
          for (const worker of this.workers) {
            if (!worker.healthy) {
              await worker.parser.cleanup();
              worker.parser = new BeatParser();
              worker.healthy = true;
              worker.processing = false;
            }
          }
        }

        async cleanup(): Promise<void> {
          for (const worker of this.workers) {
            await worker.parser.cleanup();
          }
        }
      }

      const pool = new MockWorkerPool(3);
      const audioData = testAudioFiles.get('short-beat.wav')!;

      let successfulProcesses = 0;
      let failedProcesses = 0;

      // Try multiple processing attempts
      for (let i = 0; i < 10; i++) {
        try {
          const result = await pool.processWithFailover(audioData);
          expect(result.beats.length).toBeGreaterThan(0);
          successfulProcesses++;
        } catch (error) {
          failedProcesses++;
        }
      }

      // Should have some successful processes
      expect(successfulProcesses).toBeGreaterThan(0);
      
      // Restart failed workers and verify recovery
      const healthyBefore = pool.getHealthyWorkerCount();
      await pool.restartFailedWorkers();
      const healthyAfter = pool.getHealthyWorkerCount();
      
      expect(healthyAfter).toBeGreaterThanOrEqual(healthyBefore);
      
      await pool.cleanup();
    });
  });

  describe('Production Load Testing', () => {
    test('should handle production-level concurrent requests', async () => {
      const loadTestConfig = {
        concurrentUsers: 20,
        operationsPerUser: 5,
        duration: 30000, // 30 seconds
        rampUpTime: 5000, // 5 seconds
        targetThroughput: 10 // requests per second
      };

      const loadTestEngine = LoadTestEngine.getInstance();
      
      const result = await loadTestEngine.runLoadTest(beatParser, {
        ...loadTestConfig,
        scenario: {
          name: 'Node.js API Load Test',
          operations: [
            {
              type: 'parse_buffer',
              audioFile: 'api-request.wav',
              options: { quick: true },
              expectedDuration: 500
            }
          ],
          weightDistribution: [1.0]
        }
      });

      // Verify load test results
      expect(result.summary.totalRequests).toBeGreaterThan(50);
      expect(result.summary.successfulRequests).toBeGreaterThan(0);
      expect(result.summary.errorRate).toBeLessThan(0.1); // Less than 10% error rate
      expect(result.summary.averageResponseTime).toBeLessThan(2000); // Under 2 seconds
      expect(result.summary.p95ResponseTime).toBeLessThan(5000); // 95th percentile under 5 seconds
      
      // Performance should be reasonable
      expect(result.performance.peakMemoryUsage).toBeLessThan(500 * 1024 * 1024); // Under 500MB
      expect(result.performance.peakCpuUsage).toBeLessThan(90); // Under 90% CPU
    });

    test('should maintain performance under memory pressure', async () => {
      const initialMemory = ResourceMonitor.getMemoryUsage();
      const results: ParseResult[] = [];
      
      // Process many audio files to create memory pressure
      for (let i = 0; i < 20; i++) {
        const parser = new BeatParser();
        
        try {
          const audioData = testAudioFiles.get('complex-rhythm.wav')!;
          const result = await parser.parseBuffer(audioData, {
            targetPictureCount: 100 // Request many beats
          });
          
          results.push(result);
          ResourceMonitor.takeSnapshot();
          
          // Simulate some processing delay
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } finally {
          await parser.cleanup();
        }
      }

      // Analyze memory trend
      const memoryTrend = ResourceMonitor.analyzeMemoryTrend();
      
      expect(results.length).toBe(20);
      expect(memoryTrend.potentialLeak).toBe(false); // No memory leak
      
      // Memory growth should be controlled
      const finalMemory = ResourceMonitor.getMemoryUsage();
      const memoryGrowth = finalMemory - initialMemory;
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
    });
  });
});