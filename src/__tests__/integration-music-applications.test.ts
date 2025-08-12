/**
 * Music Applications Integration Tests
 * Comprehensive testing of beat-parser integration with music player applications,
 * DJ software, content creation tools, and educational music applications
 */

import { BeatParser } from '../core/BeatParser';
import { ParseResult, Beat } from '../types';
import { 
  TestApplicationFactory, 
  IntegrationTestOrchestrator,
  PerformanceMonitor,
  ResourceMonitor 
} from './integration-testing-utils';

describe('Music Applications Integration Tests', () => {
  let beatParser: BeatParser;
  let testAudioFiles: Map<string, Float32Array>;
  let mockMusicApp: any;

  beforeAll(async () => {
    testAudioFiles = IntegrationTestOrchestrator.generateTestAudioFiles();
    mockMusicApp = await TestApplicationFactory.createReactApp({
      musicPlayer: true,
      visualization: true,
      playlist: true
    });
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
    await mockMusicApp.cleanup();
    ResourceMonitor.clearSnapshots();
  });

  describe('Music Player Integration', () => {
    test('should integrate with playlist beat synchronization', async () => {
      PerformanceMonitor.startMeasurement('playlist-sync');
      
      // Mock playlist data structure
      interface Track {
        id: string;
        title: string;
        artist: string;
        duration: number;
        audioData: Float32Array;
        beats?: Beat[];
        tempo?: number;
        analyzed: boolean;
      }

      interface Playlist {
        id: string;
        name: string;
        tracks: Track[];
        currentTrackIndex: number;
        isPlaying: boolean;
        currentTime: number;
        crossfadeEnabled: boolean;
      }

      // Playlist management class
      class MusicPlaylist {
        private parser: BeatParser;
        private playlist: Playlist;
        private analysisQueue: string[] = [];

        constructor() {
          this.parser = new BeatParser({
            sampleRate: 44100,
            enablePreprocessing: true
          });

          this.playlist = {
            id: 'test-playlist',
            name: 'Integration Test Playlist',
            tracks: [],
            currentTrackIndex: 0,
            isPlaying: false,
            currentTime: 0,
            crossfadeEnabled: true
          };
        }

        addTrack(track: Omit<Track, 'analyzed'>): void {
          const fullTrack: Track = {
            ...track,
            analyzed: false
          };
          
          this.playlist.tracks.push(fullTrack);
          
          // Queue for analysis
          if (!this.analysisQueue.includes(track.id)) {
            this.analysisQueue.push(track.id);
          }
        }

        async analyzeNextTrack(): Promise<boolean> {
          if (this.analysisQueue.length === 0) return false;

          const trackId = this.analysisQueue.shift()!;
          const track = this.playlist.tracks.find(t => t.id === trackId);
          
          if (!track) return false;

          try {
            const result = await this.parser.parseBuffer(track.audioData, {
              targetPictureCount: 50,
              selectionMethod: 'adaptive'
            });

            track.beats = result.beats;
            track.tempo = result.tempo?.bpm;
            track.analyzed = true;

            return true;
          } catch (error) {
            console.error(`Failed to analyze track ${trackId}:`, error);
            return false;
          }
        }

        async analyzeAllTracks(): Promise<void> {
          while (this.analysisQueue.length > 0) {
            await this.analyzeNextTrack();
          }
        }

        getCurrentBeat(time: number): Beat | null {
          const currentTrack = this.getCurrentTrack();
          if (!currentTrack?.beats) return null;

          // Find the beat closest to current playback time
          let closestBeat: Beat | null = null;
          let closestDistance = Infinity;

          for (const beat of currentTrack.beats) {
            const distance = Math.abs(beat.timestamp - time);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestBeat = beat;
            }
          }

          return closestBeat;
        }

        getUpcomingBeats(time: number, lookahead: number = 2000): Beat[] {
          const currentTrack = this.getCurrentTrack();
          if (!currentTrack?.beats) return [];

          return currentTrack.beats.filter(
            beat => beat.timestamp > time && beat.timestamp <= time + lookahead
          );
        }

        findOptimalCrossfadePoint(fromTrack: Track, toTrack: Track): {
          outPoint: number;
          inPoint: number;
          confidence: number;
        } | null {
          if (!fromTrack.beats || !toTrack.beats) return null;

          // Find beats near the end of the first track
          const fromDuration = fromTrack.duration;
          const outCandidates = fromTrack.beats.filter(
            beat => beat.timestamp > fromDuration - 10000 && // Last 10 seconds
                   beat.timestamp < fromDuration - 2000      // But not too close to end
          );

          // Find beats near the beginning of the second track
          const inCandidates = toTrack.beats.filter(
            beat => beat.timestamp < 10000 // First 10 seconds
          );

          if (outCandidates.length === 0 || inCandidates.length === 0) {
            return null;
          }

          // Find best matching beats (similar tempo and strong beats)
          let bestMatch = null;
          let bestScore = 0;

          for (const outBeat of outCandidates) {
            for (const inBeat of inCandidates) {
              // Score based on beat strength and confidence
              const score = (outBeat.strength + outBeat.confidence + 
                           inBeat.strength + inBeat.confidence) / 4;

              if (score > bestScore) {
                bestScore = score;
                bestMatch = {
                  outPoint: outBeat.timestamp,
                  inPoint: inBeat.timestamp,
                  confidence: score
                };
              }
            }
          }

          return bestMatch;
        }

        getCurrentTrack(): Track | null {
          if (this.playlist.currentTrackIndex >= this.playlist.tracks.length) {
            return null;
          }
          return this.playlist.tracks[this.playlist.currentTrackIndex];
        }

        getPlaylistStats() {
          const totalTracks = this.playlist.tracks.length;
          const analyzedTracks = this.playlist.tracks.filter(t => t.analyzed).length;
          const totalBeats = this.playlist.tracks.reduce((sum, track) => 
            sum + (track.beats?.length || 0), 0
          );

          return {
            totalTracks,
            analyzedTracks,
            analysisProgress: analyzedTracks / totalTracks,
            totalBeats,
            averageBeatsPerTrack: totalBeats / analyzedTracks || 0
          };
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      // Test playlist functionality
      const playlist = new MusicPlaylist();

      // Add test tracks
      playlist.addTrack({
        id: 'track1',
        title: 'Short Beat Track',
        artist: 'Test Artist',
        duration: 5000,
        audioData: testAudioFiles.get('short-beat.wav')!
      });

      playlist.addTrack({
        id: 'track2',
        title: 'Complex Rhythm',
        artist: 'Test Artist',
        duration: 60000,
        audioData: testAudioFiles.get('complex-rhythm.wav')!
      });

      // Analyze all tracks
      await playlist.analyzeAllTracks();

      const stats = playlist.getPlaylistStats();
      expect(stats.totalTracks).toBe(2);
      expect(stats.analyzedTracks).toBe(2);
      expect(stats.analysisProgress).toBe(1);
      expect(stats.totalBeats).toBeGreaterThan(0);

      // Test beat synchronization features
      const currentBeat = playlist.getCurrentBeat(1500);
      expect(currentBeat).toBeDefined();
      expect(currentBeat!.timestamp).toBeGreaterThan(0);

      const upcomingBeats = playlist.getUpcomingBeats(1000, 3000);
      expect(upcomingBeats.length).toBeGreaterThan(0);
      upcomingBeats.forEach(beat => {
        expect(beat.timestamp).toBeGreaterThan(1000);
        expect(beat.timestamp).toBeLessThanOrEqual(4000);
      });

      // Test crossfade point detection
      const track1 = playlist.getCurrentTrack()!;
      const track2 = playlist.playlist.tracks[1];
      const crossfadePoint = playlist.findOptimalCrossfadePoint(track1, track2);
      
      if (crossfadePoint) {
        expect(crossfadePoint.outPoint).toBeGreaterThan(0);
        expect(crossfadePoint.inPoint).toBeGreaterThan(0);
        expect(crossfadePoint.confidence).toBeGreaterThan(0);
      }

      await playlist.cleanup();

      const duration = PerformanceMonitor.endMeasurement('playlist-sync');
      expect(duration).toBeLessThan(10000);
    });

    test('should integrate with real-time visualization sync', async () => {
      // Mock visualization system
      interface VisualizationFrame {
        timestamp: number;
        beatActive: boolean;
        beatIntensity: number;
        frequency: number;
        waveform: number[];
      }

      class BeatVisualizer {
        private parser: BeatParser;
        private beats: Beat[] = [];
        private currentTime: number = 0;
        private frameRate: number = 60; // 60 FPS
        private visualizationBuffer: VisualizationFrame[] = [];

        constructor() {
          this.parser = new BeatParser();
        }

        async loadAudio(audioData: Float32Array): Promise<void> {
          const result = await this.parser.parseBuffer(audioData);
          this.beats = result.beats;
        }

        generateVisualizationFrame(timestamp: number): VisualizationFrame {
          const nearestBeat = this.findNearestBeat(timestamp);
          const beatThreshold = 200; // ms tolerance
          
          let beatActive = false;
          let beatIntensity = 0;

          if (nearestBeat && Math.abs(nearestBeat.timestamp - timestamp) < beatThreshold) {
            beatActive = true;
            beatIntensity = nearestBeat.strength;
          }

          // Generate mock waveform data
          const waveform = Array.from({ length: 256 }, (_, i) => {
            const baseWave = Math.sin(timestamp * 0.01 + i * 0.1) * 0.5;
            const beatBoost = beatActive ? beatIntensity * 0.5 : 0;
            return Math.max(0, Math.min(1, baseWave + beatBoost));
          });

          return {
            timestamp,
            beatActive,
            beatIntensity,
            frequency: nearestBeat?.timestamp || 0,
            waveform
          };
        }

        private findNearestBeat(timestamp: number): Beat | null {
          if (this.beats.length === 0) return null;

          let nearest = this.beats[0];
          let minDistance = Math.abs(nearest.timestamp - timestamp);

          for (const beat of this.beats) {
            const distance = Math.abs(beat.timestamp - timestamp);
            if (distance < minDistance) {
              minDistance = distance;
              nearest = beat;
            }
          }

          return nearest;
        }

        startVisualization(duration: number): VisualizationFrame[] {
          const frameInterval = 1000 / this.frameRate;
          const frames: VisualizationFrame[] = [];

          for (let time = 0; time < duration; time += frameInterval) {
            const frame = this.generateVisualizationFrame(time);
            frames.push(frame);
          }

          return frames;
        }

        getVisualizationStats(frames: VisualizationFrame[]) {
          const totalFrames = frames.length;
          const activeFrames = frames.filter(f => f.beatActive).length;
          const averageIntensity = frames.reduce((sum, f) => sum + f.beatIntensity, 0) / totalFrames;
          const maxIntensity = Math.max(...frames.map(f => f.beatIntensity));

          return {
            totalFrames,
            activeFrames,
            activationRate: activeFrames / totalFrames,
            averageIntensity,
            maxIntensity
          };
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const visualizer = new BeatVisualizer();
      
      // Load and analyze audio
      const audioData = testAudioFiles.get('short-beat.wav')!;
      await visualizer.loadAudio(audioData);

      // Generate visualization for 5 seconds
      const frames = visualizer.startVisualization(5000);
      const stats = visualizer.getVisualizationStats(frames);

      expect(frames.length).toBeGreaterThan(250); // ~5 seconds at 60fps
      expect(stats.totalFrames).toBe(frames.length);
      expect(stats.activeFrames).toBeGreaterThan(0);
      expect(stats.activationRate).toBeGreaterThan(0);
      expect(stats.maxIntensity).toBeGreaterThan(0);

      // Verify frame data structure
      frames.slice(0, 10).forEach(frame => {
        expect(frame.timestamp).toBeGreaterThanOrEqual(0);
        expect(frame.waveform).toHaveLength(256);
        expect(frame.beatIntensity).toBeGreaterThanOrEqual(0);
        expect(frame.beatIntensity).toBeLessThanOrEqual(1);
      });

      await visualizer.cleanup();
    });

    test('should handle audio scrubbing with beat navigation', async () => {
      // Mock audio scrubber/seeker
      class AudioScrubber {
        private parser: BeatParser;
        private beats: Beat[] = [];
        private duration: number = 0;
        private currentPosition: number = 0;

        constructor() {
          this.parser = new BeatParser();
        }

        async loadTrack(audioData: Float32Array): Promise<void> {
          this.duration = (audioData.length / 44100) * 1000; // Convert to ms
          
          const result = await this.parser.parseBuffer(audioData);
          this.beats = result.beats.sort((a, b) => a.timestamp - b.timestamp);
        }

        seekToPosition(position: number): void {
          this.currentPosition = Math.max(0, Math.min(position, this.duration));
        }

        seekToNextBeat(): number {
          const nextBeat = this.beats.find(beat => beat.timestamp > this.currentPosition);
          if (nextBeat) {
            this.currentPosition = nextBeat.timestamp;
          }
          return this.currentPosition;
        }

        seekToPreviousBeat(): number {
          // Find beats before current position, take the last one
          const previousBeats = this.beats.filter(beat => beat.timestamp < this.currentPosition);
          if (previousBeats.length > 0) {
            const previousBeat = previousBeats[previousBeats.length - 1];
            this.currentPosition = previousBeat.timestamp;
          }
          return this.currentPosition;
        }

        seekToNearestBeat(): number {
          if (this.beats.length === 0) return this.currentPosition;

          let nearestBeat = this.beats[0];
          let minDistance = Math.abs(nearestBeat.timestamp - this.currentPosition);

          for (const beat of this.beats) {
            const distance = Math.abs(beat.timestamp - this.currentPosition);
            if (distance < minDistance) {
              minDistance = distance;
              nearestBeat = beat;
            }
          }

          this.currentPosition = nearestBeat.timestamp;
          return this.currentPosition;
        }

        getBeatAtPosition(position: number = this.currentPosition): Beat | null {
          const tolerance = 100; // 100ms tolerance
          return this.beats.find(beat => 
            Math.abs(beat.timestamp - position) <= tolerance
          ) || null;
        }

        getBeatsInRange(start: number, end: number): Beat[] {
          return this.beats.filter(beat => 
            beat.timestamp >= start && beat.timestamp <= end
          );
        }

        getCurrentPosition(): number {
          return this.currentPosition;
        }

        getDuration(): number {
          return this.duration;
        }

        getProgress(): number {
          return this.currentPosition / this.duration;
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const scrubber = new AudioScrubber();
      
      // Load audio track
      const audioData = testAudioFiles.get('complex-rhythm.wav')!;
      await scrubber.loadTrack(audioData);

      const duration = scrubber.getDuration();
      expect(duration).toBeGreaterThan(0);

      // Test basic seeking
      scrubber.seekToPosition(5000);
      expect(scrubber.getCurrentPosition()).toBe(5000);
      expect(scrubber.getProgress()).toBeCloseTo(5000 / duration);

      // Test beat navigation
      const initialPosition = scrubber.getCurrentPosition();
      const nextBeatPosition = scrubber.seekToNextBeat();
      expect(nextBeatPosition).toBeGreaterThan(initialPosition);

      const previousBeatPosition = scrubber.seekToPreviousBeat();
      expect(previousBeatPosition).toBeLessThan(nextBeatPosition);

      // Test nearest beat seeking
      scrubber.seekToPosition(3500); // Arbitrary position
      const nearestBeatPosition = scrubber.seekToNearestBeat();
      const beatAtPosition = scrubber.getBeatAtPosition();
      
      expect(beatAtPosition).toBeDefined();
      expect(Math.abs(beatAtPosition!.timestamp - nearestBeatPosition)).toBeLessThan(100);

      // Test range queries
      const beatsInRange = scrubber.getBeatsInRange(2000, 8000);
      expect(beatsInRange.length).toBeGreaterThan(0);
      beatsInRange.forEach(beat => {
        expect(beat.timestamp).toBeGreaterThanOrEqual(2000);
        expect(beat.timestamp).toBeLessThanOrEqual(8000);
      });

      await scrubber.cleanup();
    });
  });

  describe('DJ Software Integration', () => {
    test('should integrate with beat matching and tempo sync', async () => {
      // Mock DJ mixer interface
      interface DJDeck {
        id: string;
        audioData?: Float32Array;
        beats?: Beat[];
        tempo?: number;
        currentPosition: number;
        isPlaying: boolean;
        pitch: number; // -50% to +50%
        gain: number;  // 0 to 1
      }

      class DJMixer {
        private parser: BeatParser;
        private deckA: DJDeck;
        private deckB: DJDeck;
        private crossfader: number = 0; // -1 (A) to 1 (B)

        constructor() {
          this.parser = new BeatParser();
          
          this.deckA = {
            id: 'A',
            currentPosition: 0,
            isPlaying: false,
            pitch: 0,
            gain: 0.8
          };

          this.deckB = {
            id: 'B',
            currentPosition: 0,
            isPlaying: false,
            pitch: 0,
            gain: 0.8
          };
        }

        async loadTrack(deckId: 'A' | 'B', audioData: Float32Array): Promise<void> {
          const deck = deckId === 'A' ? this.deckA : this.deckB;
          
          deck.audioData = audioData;
          
          const result = await this.parser.parseBuffer(audioData);
          deck.beats = result.beats;
          deck.tempo = result.tempo?.bpm;
        }

        calculateRequiredPitchAdjustment(sourceDeck: DJDeck, targetTempo: number): number {
          if (!sourceDeck.tempo) return 0;

          // Calculate pitch adjustment needed to match target tempo
          const currentTempo = sourceDeck.tempo * (1 + sourceDeck.pitch / 100);
          const requiredAdjustment = ((targetTempo - currentTempo) / currentTempo) * 100;
          
          // Clamp to realistic pitch range (-50% to +50%)
          return Math.max(-50, Math.min(50, requiredAdjustment));
        }

        syncDecks(): boolean {
          if (!this.deckA.tempo || !this.deckB.tempo) return false;

          const tempoA = this.deckA.tempo * (1 + this.deckA.pitch / 100);
          const tempoB = this.deckB.tempo * (1 + this.deckB.pitch / 100);

          // Adjust slower deck to match faster one
          if (tempoA > tempoB) {
            const adjustment = this.calculateRequiredPitchAdjustment(this.deckB, tempoA);
            this.deckB.pitch = Math.max(-50, Math.min(50, this.deckB.pitch + adjustment));
          } else if (tempoB > tempoA) {
            const adjustment = this.calculateRequiredPitchAdjustment(this.deckA, tempoB);
            this.deckA.pitch = Math.max(-50, Math.min(50, this.deckA.pitch + adjustment));
          }

          return true;
        }

        findBeatMatchPoint(
          fromDeck: DJDeck, 
          fromPosition: number, 
          toDeck: DJDeck
        ): { position: number; confidence: number } | null {
          if (!fromDeck.beats || !toDeck.beats) return null;

          // Find the beat at the current position on the from deck
          const sourceBeat = this.findNearestBeat(fromDeck.beats, fromPosition);
          if (!sourceBeat) return null;

          // Find a strong beat early in the target deck
          const targetBeats = toDeck.beats
            .filter(beat => beat.timestamp < 30000) // First 30 seconds
            .sort((a, b) => b.strength - a.strength); // Sort by strength

          if (targetBeats.length === 0) return null;

          const targetBeat = targetBeats[0];
          const confidence = (sourceBeat.confidence + targetBeat.confidence) / 2;

          return {
            position: targetBeat.timestamp,
            confidence
          };
        }

        private findNearestBeat(beats: Beat[], position: number): Beat | null {
          if (beats.length === 0) return null;

          let nearest = beats[0];
          let minDistance = Math.abs(nearest.timestamp - position);

          for (const beat of beats) {
            const distance = Math.abs(beat.timestamp - position);
            if (distance < minDistance) {
              minDistance = distance;
              nearest = beat;
            }
          }

          return minDistance < 500 ? nearest : null; // 500ms tolerance
        }

        setCrossfader(position: number): void {
          this.crossfader = Math.max(-1, Math.min(1, position));
        }

        getPlaybackInfo() {
          const effectiveTempoA = this.deckA.tempo ? 
            this.deckA.tempo * (1 + this.deckA.pitch / 100) : 0;
          const effectiveTempoB = this.deckB.tempo ? 
            this.deckB.tempo * (1 + this.deckB.pitch / 100) : 0;

          return {
            deckA: {
              ...this.deckA,
              effectiveTempo: effectiveTempoA
            },
            deckB: {
              ...this.deckB,
              effectiveTempo: effectiveTempoB
            },
            crossfader: this.crossfader,
            tempoMatched: Math.abs(effectiveTempoA - effectiveTempoB) < 0.5
          };
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const mixer = new DJMixer();

      // Load tracks on both decks
      await mixer.loadTrack('A', testAudioFiles.get('short-beat.wav')!);
      await mixer.loadTrack('B', testAudioFiles.get('complex-rhythm.wav')!);

      const info = mixer.getPlaybackInfo();
      expect(info.deckA.tempo).toBeGreaterThan(0);
      expect(info.deckB.tempo).toBeGreaterThan(0);
      expect(info.deckA.beats?.length).toBeGreaterThan(0);
      expect(info.deckB.beats?.length).toBeGreaterThan(0);

      // Test tempo sync
      const syncSuccess = mixer.syncDecks();
      expect(syncSuccess).toBe(true);

      const syncedInfo = mixer.getPlaybackInfo();
      const tempoDifference = Math.abs(
        syncedInfo.deckA.effectiveTempo - syncedInfo.deckB.effectiveTempo
      );
      expect(tempoDifference).toBeLessThan(2); // Within 2 BPM

      // Test beat matching
      mixer.deckA.currentPosition = 3000;
      const matchPoint = mixer.findBeatMatchPoint(
        mixer.deckA, 
        mixer.deckA.currentPosition, 
        mixer.deckB
      );

      if (matchPoint) {
        expect(matchPoint.position).toBeGreaterThan(0);
        expect(matchPoint.confidence).toBeGreaterThan(0);
        expect(matchPoint.confidence).toBeLessThanOrEqual(1);
      }

      // Test crossfader
      mixer.setCrossfader(0.5);
      expect(mixer.getPlaybackInfo().crossfader).toBe(0.5);

      await mixer.cleanup();
    });

    test('should handle live performance looping integration', async () => {
      // Mock live looping system
      interface Loop {
        id: string;
        audioData: Float32Array;
        beats: Beat[];
        duration: number;
        isActive: boolean;
        volume: number;
        quantization: number; // Beat quantization (1, 2, 4, 8 beats)
      }

      class LiveLooper {
        private parser: BeatParser;
        private loops: Map<string, Loop> = new Map();
        private masterTempo: number = 120;
        private isRecording: boolean = false;
        private currentLoop: string | null = null;

        constructor() {
          this.parser = new BeatParser();
        }

        async createLoop(
          loopId: string, 
          audioData: Float32Array, 
          quantization: number = 4
        ): Promise<void> {
          const result = await this.parser.parseBuffer(audioData);
          
          // Find loop length based on quantization
          const beatsInLoop = result.beats.slice(0, quantization);
          const loopDuration = beatsInLoop.length > 0 ? 
            beatsInLoop[beatsInLoop.length - 1].timestamp + 
            (60000 / (result.tempo?.bpm || 120)) : // Add one more beat duration
            audioData.length / 44100 * 1000;

          const loop: Loop = {
            id: loopId,
            audioData,
            beats: result.beats,
            duration: loopDuration,
            isActive: false,
            volume: 1.0,
            quantization
          };

          this.loops.set(loopId, loop);
        }

        toggleLoop(loopId: string): boolean {
          const loop = this.loops.get(loopId);
          if (!loop) return false;

          loop.isActive = !loop.isActive;
          return loop.isActive;
        }

        quantizeLoopStart(loopId: string, currentTime: number): number {
          const loop = this.loops.get(loopId);
          if (!loop) return currentTime;

          // Find the next beat that aligns with master tempo
          const beatInterval = 60000 / this.masterTempo; // ms per beat
          const nextBeat = Math.ceil(currentTime / beatInterval) * beatInterval;
          
          return nextBeat;
        }

        getActiveLoops(): Loop[] {
          return Array.from(this.loops.values()).filter(loop => loop.isActive);
        }

        getLoopPlaybackPosition(loopId: string, masterTime: number): number {
          const loop = this.loops.get(loopId);
          if (!loop || !loop.isActive) return 0;

          // Calculate position within the loop cycle
          return masterTime % loop.duration;
        }

        setLoopVolume(loopId: string, volume: number): void {
          const loop = this.loops.get(loopId);
          if (loop) {
            loop.volume = Math.max(0, Math.min(1, volume));
          }
        }

        setMasterTempo(tempo: number): void {
          this.masterTempo = tempo;
          
          // Adjust all loop quantizations to match new tempo
          for (const loop of this.loops.values()) {
            this.requantizeLoop(loop);
          }
        }

        private requantizeLoop(loop: Loop): void {
          if (loop.beats.length === 0) return;

          // Recalculate loop duration based on new master tempo
          const beatInterval = 60000 / this.masterTempo;
          loop.duration = loop.quantization * beatInterval;
        }

        getPerformanceStats() {
          const totalLoops = this.loops.size;
          const activeLoops = this.getActiveLoops().length;
          const totalBeats = Array.from(this.loops.values())
            .reduce((sum, loop) => sum + loop.beats.length, 0);

          return {
            totalLoops,
            activeLoops,
            masterTempo: this.masterTempo,
            totalBeats,
            averageBeatsPerLoop: totalLoops > 0 ? totalBeats / totalLoops : 0
          };
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
          this.loops.clear();
        }
      }

      const looper = new LiveLooper();

      // Create loops with different audio patterns
      await looper.createLoop('loop1', testAudioFiles.get('short-beat.wav')!, 4);
      await looper.createLoop('loop2', testAudioFiles.get('complex-rhythm.wav')!, 8);

      const stats = looper.getPerformanceStats();
      expect(stats.totalLoops).toBe(2);
      expect(stats.totalBeats).toBeGreaterThan(0);
      expect(stats.activeLoops).toBe(0);

      // Test loop activation
      const loop1Active = looper.toggleLoop('loop1');
      expect(loop1Active).toBe(true);
      expect(looper.getActiveLoops()).toHaveLength(1);

      const loop2Active = looper.toggleLoop('loop2');
      expect(loop2Active).toBe(true);
      expect(looper.getActiveLoops()).toHaveLength(2);

      // Test quantized start timing
      const currentTime = 5432; // Arbitrary time
      const quantizedStart = looper.quantizeLoopStart('loop1', currentTime);
      expect(quantizedStart).toBeGreaterThan(currentTime);
      expect(quantizedStart % (60000 / 120)).toBe(0); // Should align to beat

      // Test loop position calculation
      const masterTime = 10000;
      const loopPosition = looper.getLoopPlaybackPosition('loop1', masterTime);
      expect(loopPosition).toBeGreaterThanOrEqual(0);

      // Test volume control
      looper.setLoopVolume('loop1', 0.5);
      const loop1 = Array.from(looper.loops.values())[0];
      expect(loop1.volume).toBe(0.5);

      // Test tempo change
      looper.setMasterTempo(140);
      expect(looper.getPerformanceStats().masterTempo).toBe(140);

      await looper.cleanup();
    });
  });

  describe('Content Creation Tools Integration', () => {
    test('should integrate with video editing timeline beat sync', async () => {
      // Mock video timeline with beat synchronization
      interface TimelineClip {
        id: string;
        startTime: number;
        duration: number;
        type: 'video' | 'audio' | 'image';
        beatSync: boolean;
        snapToBeats: boolean;
      }

      interface TimelineProject {
        id: string;
        clips: TimelineClip[];
        audioTrack?: {
          audioData: Float32Array;
          beats: Beat[];
          tempo?: number;
        };
        framerate: number;
        duration: number;
      }

      class VideoTimelineEditor {
        private parser: BeatParser;
        private project: TimelineProject;

        constructor(framerate: number = 30) {
          this.parser = new BeatParser();
          this.project = {
            id: 'project-1',
            clips: [],
            framerate,
            duration: 0
          };
        }

        async setAudioTrack(audioData: Float32Array): Promise<void> {
          const result = await this.parser.parseBuffer(audioData);
          
          this.project.audioTrack = {
            audioData,
            beats: result.beats,
            tempo: result.tempo?.bpm
          };

          this.project.duration = (audioData.length / 44100) * 1000;
        }

        addClip(clip: Omit<TimelineClip, 'id'>): string {
          const clipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          
          const newClip: TimelineClip = {
            id: clipId,
            ...clip
          };

          // Snap to beat if enabled and audio track exists
          if (clip.snapToBeats && this.project.audioTrack) {
            newClip.startTime = this.snapToNearestBeat(clip.startTime);
          }

          this.project.clips.push(newClip);
          return clipId;
        }

        snapToNearestBeat(time: number): number {
          if (!this.project.audioTrack?.beats) return time;

          let nearestBeat = this.project.audioTrack.beats[0];
          let minDistance = Math.abs(nearestBeat.timestamp - time);

          for (const beat of this.project.audioTrack.beats) {
            const distance = Math.abs(beat.timestamp - time);
            if (distance < minDistance) {
              minDistance = distance;
              nearestBeat = beat;
            }
          }

          return nearestBeat.timestamp;
        }

        generateBeatBasedCuts(minClipDuration: number = 2000): TimelineClip[] {
          if (!this.project.audioTrack?.beats) return [];

          const cuts: TimelineClip[] = [];
          const beats = this.project.audioTrack.beats.sort((a, b) => a.timestamp - b.timestamp);

          for (let i = 0; i < beats.length - 1; i++) {
            const startTime = beats[i].timestamp;
            const endTime = beats[i + 1].timestamp;
            const duration = endTime - startTime;

            // Only create cuts for reasonable durations
            if (duration >= minClipDuration) {
              cuts.push({
                id: `auto-cut-${i}`,
                startTime,
                duration,
                type: 'video',
                beatSync: true,
                snapToBeats: true
              });
            }
          }

          return cuts;
        }

        applyCutAtBeats(beatIndices: number[]): void {
          if (!this.project.audioTrack?.beats) return;

          const beats = this.project.audioTrack.beats;
          
          // Remove existing clips and create new ones based on beat cuts
          this.project.clips = [];

          for (let i = 0; i < beatIndices.length - 1; i++) {
            const startBeatIndex = beatIndices[i];
            const endBeatIndex = beatIndices[i + 1];

            if (startBeatIndex < beats.length && endBeatIndex < beats.length) {
              const startTime = beats[startBeatIndex].timestamp;
              const endTime = beats[endBeatIndex].timestamp;

              this.addClip({
                startTime,
                duration: endTime - startTime,
                type: 'video',
                beatSync: true,
                snapToBeats: true
              });
            }
          }
        }

        getFrameAtTime(time: number): number {
          return Math.floor((time / 1000) * this.project.framerate);
        }

        getTimeAtFrame(frame: number): number {
          return (frame / this.project.framerate) * 1000;
        }

        getBeatSyncReport() {
          const totalClips = this.project.clips.length;
          const beatSyncClips = this.project.clips.filter(c => c.beatSync).length;
          const snapToBeatsClips = this.project.clips.filter(c => c.snapToBeats).length;
          
          return {
            totalClips,
            beatSyncClips,
            snapToBeatsClips,
            beatSyncPercentage: totalClips > 0 ? (beatSyncClips / totalClips) : 0,
            averageClipDuration: totalClips > 0 ? 
              this.project.clips.reduce((sum, c) => sum + c.duration, 0) / totalClips : 0
          };
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const editor = new VideoTimelineEditor(30);

      // Set audio track for the project
      const audioData = testAudioFiles.get('complex-rhythm.wav')!;
      await editor.setAudioTrack(audioData);

      expect(editor.project.audioTrack).toBeDefined();
      expect(editor.project.audioTrack!.beats.length).toBeGreaterThan(0);
      expect(editor.project.duration).toBeGreaterThan(0);

      // Test manual clip addition with beat snapping
      const clipId = editor.addClip({
        startTime: 3234, // Arbitrary time
        duration: 5000,
        type: 'video',
        beatSync: true,
        snapToBeats: true
      });

      expect(clipId).toBeDefined();
      expect(editor.project.clips).toHaveLength(1);

      const addedClip = editor.project.clips[0];
      expect(addedClip.startTime).not.toBe(3234); // Should be snapped to beat

      // Test automatic beat-based cuts
      const autoCuts = editor.generateBeatBasedCuts(1000);
      expect(autoCuts.length).toBeGreaterThan(0);
      autoCuts.forEach(cut => {
        expect(cut.duration).toBeGreaterThanOrEqual(1000);
        expect(cut.beatSync).toBe(true);
      });

      // Test applying cuts at specific beats
      editor.applyCutAtBeats([0, 2, 4, 6, 8]); // Every other beat
      const report = editor.getBeatSyncReport();
      
      expect(report.totalClips).toBe(4); // 5 beats = 4 clips
      expect(report.beatSyncClips).toBe(report.totalClips);
      expect(report.beatSyncPercentage).toBe(1);

      // Test frame/time conversion
      const frame60 = editor.getFrameAtTime(2000); // 2 seconds at 30fps
      expect(frame60).toBe(60);
      
      const time2000 = editor.getTimeAtFrame(60);
      expect(time2000).toBe(2000);

      await editor.cleanup();
    });

    test('should integrate with rhythm-based effect application', async () => {
      // Mock audio effects system
      interface AudioEffect {
        id: string;
        name: string;
        type: 'filter' | 'distortion' | 'delay' | 'reverb' | 'modulation';
        parameters: Record<string, number>;
        enabled: boolean;
      }

      interface EffectAutomation {
        effectId: string;
        parameter: string;
        keyframes: Array<{
          time: number;
          value: number;
          beatAligned: boolean;
        }>;
      }

      class RhythmBasedEffectProcessor {
        private parser: BeatParser;
        private effects: Map<string, AudioEffect> = new Map();
        private automations: EffectAutomation[] = [];
        private beats: Beat[] = [];

        constructor() {
          this.parser = new BeatParser();
        }

        async loadAudio(audioData: Float32Array): Promise<void> {
          const result = await this.parser.parseBuffer(audioData);
          this.beats = result.beats;
        }

        addEffect(effect: AudioEffect): void {
          this.effects.set(effect.id, effect);
        }

        createBeatSyncedAutomation(
          effectId: string,
          parameter: string,
          beatPattern: 'every' | 'alternate' | 'strong' | 'weak'
        ): void {
          if (!this.effects.has(effectId)) return;

          const keyframes: Array<{
            time: number;
            value: number;
            beatAligned: boolean;
          }> = [];

          for (let i = 0; i < this.beats.length; i++) {
            const beat = this.beats[i];
            let shouldTrigger = false;

            switch (beatPattern) {
              case 'every':
                shouldTrigger = true;
                break;
              case 'alternate':
                shouldTrigger = i % 2 === 0;
                break;
              case 'strong':
                shouldTrigger = beat.strength > 0.7;
                break;
              case 'weak':
                shouldTrigger = beat.strength <= 0.7;
                break;
            }

            if (shouldTrigger) {
              keyframes.push({
                time: beat.timestamp,
                value: beat.strength, // Use beat strength as effect intensity
                beatAligned: true
              });

              // Add off keyframe shortly after
              keyframes.push({
                time: beat.timestamp + 100, // 100ms after beat
                value: 0,
                beatAligned: false
              });
            }
          }

          this.automations.push({
            effectId,
            parameter,
            keyframes
          });
        }

        getEffectValueAtTime(effectId: string, parameter: string, time: number): number {
          const automation = this.automations.find(
            a => a.effectId === effectId && a.parameter === parameter
          );

          if (!automation || automation.keyframes.length === 0) return 0;

          // Find surrounding keyframes
          let beforeFrame = null;
          let afterFrame = null;

          for (const frame of automation.keyframes) {
            if (frame.time <= time) {
              beforeFrame = frame;
            } else if (frame.time > time && !afterFrame) {
              afterFrame = frame;
              break;
            }
          }

          if (!beforeFrame) return automation.keyframes[0].value;
          if (!afterFrame) return beforeFrame.value;

          // Linear interpolation between keyframes
          const progress = (time - beforeFrame.time) / (afterFrame.time - beforeFrame.time);
          return beforeFrame.value + (afterFrame.value - beforeFrame.value) * progress;
        }

        generateEffectSequence(duration: number, timeStep: number = 100): Array<{
          time: number;
          effects: Record<string, Record<string, number>>;
        }> {
          const sequence: Array<{
            time: number;
            effects: Record<string, Record<string, number>>;
          }> = [];

          for (let time = 0; time <= duration; time += timeStep) {
            const effectStates: Record<string, Record<string, number>> = {};

            for (const [effectId] of this.effects) {
              effectStates[effectId] = {};

              const relevantAutomations = this.automations.filter(a => a.effectId === effectId);
              for (const automation of relevantAutomations) {
                effectStates[effectId][automation.parameter] = 
                  this.getEffectValueAtTime(effectId, automation.parameter, time);
              }
            }

            sequence.push({
              time,
              effects: effectStates
            });
          }

          return sequence;
        }

        getAutomationStats() {
          const totalAutomations = this.automations.length;
          const totalKeyframes = this.automations.reduce((sum, a) => sum + a.keyframes.length, 0);
          const beatAlignedKeyframes = this.automations.reduce((sum, a) => 
            sum + a.keyframes.filter(k => k.beatAligned).length, 0
          );

          return {
            totalAutomations,
            totalKeyframes,
            beatAlignedKeyframes,
            averageKeyframesPerAutomation: totalAutomations > 0 ? totalKeyframes / totalAutomations : 0,
            beatAlignmentPercentage: totalKeyframes > 0 ? beatAlignedKeyframes / totalKeyframes : 0
          };
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const processor = new RhythmBasedEffectProcessor();

      // Load audio and setup effects
      const audioData = testAudioFiles.get('complex-rhythm.wav')!;
      await processor.loadAudio(audioData);

      const filterEffect: AudioEffect = {
        id: 'lowpass-filter',
        name: 'Low Pass Filter',
        type: 'filter',
        parameters: { frequency: 1000, resonance: 0.5 },
        enabled: true
      };

      const distortionEffect: AudioEffect = {
        id: 'overdrive',
        name: 'Overdrive',
        type: 'distortion',
        parameters: { drive: 0, tone: 0.5 },
        enabled: true
      };

      processor.addEffect(filterEffect);
      processor.addEffect(distortionEffect);

      // Create beat-synced automations
      processor.createBeatSyncedAutomation('lowpass-filter', 'frequency', 'every');
      processor.createBeatSyncedAutomation('overdrive', 'drive', 'strong');

      const stats = processor.getAutomationStats();
      expect(stats.totalAutomations).toBe(2);
      expect(stats.totalKeyframes).toBeGreaterThan(0);
      expect(stats.beatAlignmentPercentage).toBeGreaterThan(0);

      // Test effect value calculation
      const filterFreqAt2000 = processor.getEffectValueAtTime('lowpass-filter', 'frequency', 2000);
      expect(filterFreqAt2000).toBeGreaterThanOrEqual(0);
      expect(filterFreqAt2000).toBeLessThanOrEqual(1);

      // Generate effect sequence
      const effectSequence = processor.generateEffectSequence(5000, 500);
      expect(effectSequence.length).toBe(11); // 0 to 5000ms in 500ms steps

      effectSequence.forEach(step => {
        expect(step.time).toBeGreaterThanOrEqual(0);
        expect(step.time).toBeLessThanOrEqual(5000);
        expect(step.effects['lowpass-filter']).toBeDefined();
        expect(step.effects['overdrive']).toBeDefined();
      });

      await processor.cleanup();
    });
  });

  describe('Educational Application Integration', () => {
    test('should integrate with rhythm training applications', async () => {
      // Mock rhythm training system
      interface RhythmExercise {
        id: string;
        name: string;
        difficulty: 'beginner' | 'intermediate' | 'advanced';
        targetPattern: Beat[];
        tolerance: number; // timing tolerance in ms
        attempts: Array<{
          timestamp: number;
          accuracy: number;
          userBeats: Beat[];
        }>;
      }

      class RhythmTrainer {
        private parser: BeatParser;
        private exercises: Map<string, RhythmExercise> = new Map();
        private currentExercise: string | null = null;

        constructor() {
          this.parser = new BeatParser();
        }

        async createExerciseFromAudio(
          exerciseId: string,
          audioData: Float32Array,
          difficulty: RhythmExercise['difficulty']
        ): Promise<void> {
          const result = await this.parser.parseBuffer(audioData);
          
          // Select beats based on difficulty
          let targetBeats: Beat[];
          let tolerance: number;

          switch (difficulty) {
            case 'beginner':
              // Only strong beats
              targetBeats = result.beats
                .filter(beat => beat.strength > 0.8)
                .slice(0, 8); // Limit to 8 beats
              tolerance = 300; // 300ms tolerance
              break;
            case 'intermediate':
              // Medium strength beats
              targetBeats = result.beats
                .filter(beat => beat.strength > 0.5)
                .slice(0, 16);
              tolerance = 200; // 200ms tolerance
              break;
            case 'advanced':
              // All detected beats
              targetBeats = result.beats.slice(0, 24);
              tolerance = 100; // 100ms tolerance
              break;
          }

          const exercise: RhythmExercise = {
            id: exerciseId,
            name: `${difficulty} Rhythm Exercise`,
            difficulty,
            targetPattern: targetBeats,
            tolerance,
            attempts: []
          };

          this.exercises.set(exerciseId, exercise);
        }

        startExercise(exerciseId: string): boolean {
          if (!this.exercises.has(exerciseId)) return false;
          this.currentExercise = exerciseId;
          return true;
        }

        submitAttempt(userBeats: Beat[]): {
          accuracy: number;
          feedback: Array<{
            targetBeat: Beat;
            userBeat: Beat | null;
            timing: 'early' | 'late' | 'perfect' | 'missed';
            timingError: number;
          }>;
        } | null {
          if (!this.currentExercise) return null;
          
          const exercise = this.exercises.get(this.currentExercise)!;
          const feedback: Array<{
            targetBeat: Beat;
            userBeat: Beat | null;
            timing: 'early' | 'late' | 'perfect' | 'missed';
            timingError: number;
          }> = [];

          let totalAccuracy = 0;

          for (const targetBeat of exercise.targetPattern) {
            // Find closest user beat
            let closestUserBeat: Beat | null = null;
            let minDistance = Infinity;

            for (const userBeat of userBeats) {
              const distance = Math.abs(userBeat.timestamp - targetBeat.timestamp);
              if (distance < minDistance) {
                minDistance = distance;
                closestUserBeat = userBeat;
              }
            }

            let timing: 'early' | 'late' | 'perfect' | 'missed';
            let timingError: number;
            let beatAccuracy: number;

            if (!closestUserBeat || minDistance > exercise.tolerance * 2) {
              timing = 'missed';
              timingError = Infinity;
              beatAccuracy = 0;
            } else {
              timingError = closestUserBeat.timestamp - targetBeat.timestamp;
              
              if (Math.abs(timingError) <= exercise.tolerance / 3) {
                timing = 'perfect';
                beatAccuracy = 1;
              } else if (Math.abs(timingError) <= exercise.tolerance) {
                timing = timingError < 0 ? 'early' : 'late';
                beatAccuracy = 1 - (Math.abs(timingError) / exercise.tolerance);
              } else {
                timing = timingError < 0 ? 'early' : 'late';
                beatAccuracy = 0.2; // Partial credit
              }
            }

            totalAccuracy += beatAccuracy;
            
            feedback.push({
              targetBeat,
              userBeat: closestUserBeat,
              timing,
              timingError: timingError === Infinity ? 0 : timingError
            });
          }

          const averageAccuracy = totalAccuracy / exercise.targetPattern.length;

          // Record attempt
          exercise.attempts.push({
            timestamp: Date.now(),
            accuracy: averageAccuracy,
            userBeats
          });

          return {
            accuracy: averageAccuracy,
            feedback
          };
        }

        getExerciseProgress(exerciseId: string) {
          const exercise = this.exercises.get(exerciseId);
          if (!exercise) return null;

          const attempts = exercise.attempts;
          if (attempts.length === 0) {
            return {
              totalAttempts: 0,
              averageAccuracy: 0,
              bestAccuracy: 0,
              improvementTrend: 0
            };
          }

          const averageAccuracy = attempts.reduce((sum, a) => sum + a.accuracy, 0) / attempts.length;
          const bestAccuracy = Math.max(...attempts.map(a => a.accuracy));

          // Calculate improvement trend (last 5 vs first 5)
          const recentAttempts = attempts.slice(-5);
          const earlyAttempts = attempts.slice(0, 5);
          
          const recentAverage = recentAttempts.reduce((sum, a) => sum + a.accuracy, 0) / recentAttempts.length;
          const earlyAverage = earlyAttempts.reduce((sum, a) => sum + a.accuracy, 0) / earlyAttempts.length;
          
          const improvementTrend = attempts.length >= 10 ? recentAverage - earlyAverage : 0;

          return {
            totalAttempts: attempts.length,
            averageAccuracy,
            bestAccuracy,
            improvementTrend
          };
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const trainer = new RhythmTrainer();

      // Create exercises of different difficulties
      const audioData = testAudioFiles.get('short-beat.wav')!;
      
      await trainer.createExerciseFromAudio('beginner-1', audioData, 'beginner');
      await trainer.createExerciseFromAudio('intermediate-1', audioData, 'intermediate');
      await trainer.createExerciseFromAudio('advanced-1', audioData, 'advanced');

      expect(trainer.exercises.size).toBe(3);

      // Start and test beginner exercise
      const startSuccess = trainer.startExercise('beginner-1');
      expect(startSuccess).toBe(true);

      const beginnerExercise = trainer.exercises.get('beginner-1')!;
      expect(beginnerExercise.targetPattern.length).toBeGreaterThan(0);
      expect(beginnerExercise.tolerance).toBe(300);

      // Simulate user attempt (perfect timing)
      const perfectUserBeats: Beat[] = beginnerExercise.targetPattern.map(beat => ({
        ...beat,
        timestamp: beat.timestamp + Math.random() * 20 - 10 // Small random variation
      }));

      const perfectAttempt = trainer.submitAttempt(perfectUserBeats);
      expect(perfectAttempt).toBeDefined();
      expect(perfectAttempt!.accuracy).toBeGreaterThan(0.8);

      // Simulate user attempt (late timing)
      const lateUserBeats: Beat[] = beginnerExercise.targetPattern.map(beat => ({
        ...beat,
        timestamp: beat.timestamp + 150 // 150ms late
      }));

      const lateAttempt = trainer.submitAttempt(lateUserBeats);
      expect(lateAttempt).toBeDefined();
      expect(lateAttempt!.accuracy).toBeLessThan(perfectAttempt!.accuracy);
      expect(lateAttempt!.feedback.every(f => f.timing === 'late')).toBe(true);

      // Check progress
      const progress = trainer.getExerciseProgress('beginner-1');
      expect(progress).toBeDefined();
      expect(progress!.totalAttempts).toBe(2);
      expect(progress!.bestAccuracy).toBeGreaterThanOrEqual(progress!.averageAccuracy);

      await trainer.cleanup();
    });

    test('should integrate with music theory instruction tools', async () => {
      // Mock music theory analysis system
      interface MusicalAnalysis {
        timeSignature: {
          numerator: number;
          denominator: number;
          confidence: number;
        };
        rhythmicPatterns: Array<{
          pattern: string;
          frequency: number;
          confidence: number;
        }>;
        complexityMetrics: {
          rhythmicComplexity: number;
          syncopationLevel: number;
          beatRegularity: number;
        };
        educationalNotes: string[];
      }

      class MusicTheoryAnalyzer {
        private parser: BeatParser;

        constructor() {
          this.parser = new BeatParser();
        }

        async analyzeForEducation(audioData: Float32Array): Promise<MusicalAnalysis> {
          const result = await this.parser.parseBuffer(audioData);
          const beats = result.beats.sort((a, b) => a.timestamp - b.timestamp);

          // Analyze time signature
          const timeSignature = this.analyzeTimeSignature(beats);
          
          // Find rhythmic patterns
          const rhythmicPatterns = this.findRhythmicPatterns(beats);
          
          // Calculate complexity metrics
          const complexityMetrics = this.calculateComplexityMetrics(beats);
          
          // Generate educational notes
          const educationalNotes = this.generateEducationalNotes(
            timeSignature, 
            rhythmicPatterns, 
            complexityMetrics
          );

          return {
            timeSignature,
            rhythmicPatterns,
            complexityMetrics,
            educationalNotes
          };
        }

        private analyzeTimeSignature(beats: Beat[]): {
          numerator: number;
          denominator: number;
          confidence: number;
        } {
          if (beats.length < 8) {
            return { numerator: 4, denominator: 4, confidence: 0.3 };
          }

          // Calculate intervals between beats
          const intervals: number[] = [];
          for (let i = 1; i < beats.length; i++) {
            intervals.push(beats[i].timestamp - beats[i - 1].timestamp);
          }

          // Find most common interval (approximate beat duration)
          const sortedIntervals = intervals.sort((a, b) => a - b);
          const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];

          // Look for patterns that suggest different time signatures
          const groupSizes = [3, 4, 5, 6, 7, 8];
          let bestMatch = { numerator: 4, denominator: 4, score: 0 };

          for (const groupSize of groupSizes) {
            const score = this.scoreTimeSignature(beats, groupSize, medianInterval);
            if (score > bestMatch.score) {
              bestMatch = {
                numerator: groupSize,
                denominator: 4, // Assume quarter note gets the beat
                score
              };
            }
          }

          return {
            numerator: bestMatch.numerator,
            denominator: bestMatch.denominator,
            confidence: Math.min(bestMatch.score, 1.0)
          };
        }

        private scoreTimeSignature(beats: Beat[], groupSize: number, expectedInterval: number): number {
          let score = 0;
          let groups = 0;

          for (let i = 0; i < beats.length - groupSize; i += groupSize) {
            const group = beats.slice(i, i + groupSize);
            
            // Check if this group has consistent timing
            let groupScore = 0;
            for (let j = 1; j < group.length; j++) {
              const interval = group[j].timestamp - group[j - 1].timestamp;
              const deviation = Math.abs(interval - expectedInterval) / expectedInterval;
              groupScore += Math.max(0, 1 - deviation);
            }
            
            score += groupScore / (group.length - 1);
            groups++;
          }

          return groups > 0 ? score / groups : 0;
        }

        private findRhythmicPatterns(beats: Beat[]): Array<{
          pattern: string;
          frequency: number;
          confidence: number;
        }> {
          const patterns: Array<{
            pattern: string;
            frequency: number;
            confidence: number;
          }> = [];

          // Define common rhythmic patterns to look for
          const commonPatterns = [
            { name: 'Strong-Weak', test: (strengths: number[]) => 
              strengths[0] > strengths[1] },
            { name: 'Strong-Weak-Medium-Weak', test: (strengths: number[]) => 
              strengths.length >= 4 && strengths[0] > strengths[1] && 
              strengths[2] > strengths[1] && strengths[2] > strengths[3] },
            { name: 'Syncopated', test: (strengths: number[]) =>
              strengths.length >= 4 && strengths[1] > strengths[0] }
          ];

          // Analyze patterns in groups of 4 beats
          const groupSize = 4;
          const patternCounts = new Map<string, number>();

          for (let i = 0; i <= beats.length - groupSize; i += groupSize) {
            const group = beats.slice(i, i + groupSize);
            const strengths = group.map(b => b.strength);

            for (const pattern of commonPatterns) {
              if (pattern.test(strengths)) {
                patternCounts.set(pattern.name, (patternCounts.get(pattern.name) || 0) + 1);
              }
            }
          }

          const totalGroups = Math.floor(beats.length / groupSize);
          
          for (const [patternName, count] of patternCounts) {
            patterns.push({
              pattern: patternName,
              frequency: count / totalGroups,
              confidence: Math.min(count / 3, 1.0) // Need at least 3 occurrences for confidence
            });
          }

          return patterns.sort((a, b) => b.frequency - a.frequency);
        }

        private calculateComplexityMetrics(beats: Beat[]): {
          rhythmicComplexity: number;
          syncopationLevel: number;
          beatRegularity: number;
        } {
          if (beats.length < 4) {
            return {
              rhythmicComplexity: 0,
              syncopationLevel: 0,
              beatRegularity: 0
            };
          }

          // Calculate intervals
          const intervals: number[] = [];
          for (let i = 1; i < beats.length; i++) {
            intervals.push(beats[i].timestamp - beats[i - 1].timestamp);
          }

          // Beat regularity - coefficient of variation of intervals
          const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
          const variance = intervals.reduce((sum, interval) => 
            sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
          const stdDev = Math.sqrt(variance);
          const beatRegularity = 1 - Math.min(stdDev / avgInterval, 1);

          // Rhythmic complexity - based on strength variation
          const strengths = beats.map(b => b.strength);
          const avgStrength = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
          const strengthVariation = strengths.reduce((sum, s) => 
            sum + Math.abs(s - avgStrength), 0) / strengths.length;
          const rhythmicComplexity = Math.min(strengthVariation * 2, 1);

          // Syncopation level - unexpected strong beats
          let syncopationCount = 0;
          const groupSize = 4;
          
          for (let i = 0; i <= beats.length - groupSize; i += groupSize) {
            const group = beats.slice(i, i + groupSize);
            
            // Check for strong beats in weak positions (2nd and 4th positions)
            if (group.length >= 4) {
              if (group[1].strength > group[0].strength || group[3].strength > group[2].strength) {
                syncopationCount++;
              }
            }
          }
          
          const syncopationLevel = syncopationCount / Math.floor(beats.length / groupSize);

          return {
            rhythmicComplexity,
            syncopationLevel: Math.min(syncopationLevel, 1),
            beatRegularity
          };
        }

        private generateEducationalNotes(
          timeSignature: { numerator: number; denominator: number; confidence: number },
          patterns: Array<{ pattern: string; frequency: number; confidence: number }>,
          complexity: { rhythmicComplexity: number; syncopationLevel: number; beatRegularity: number }
        ): string[] {
          const notes: string[] = [];

          // Time signature notes
          if (timeSignature.confidence > 0.6) {
            notes.push(`This piece appears to be in ${timeSignature.numerator}/${timeSignature.denominator} time signature.`);
          } else {
            notes.push(`The time signature is unclear, but likely ${timeSignature.numerator}/${timeSignature.denominator}.`);
          }

          // Pattern recognition notes
          const strongPatterns = patterns.filter(p => p.frequency > 0.3 && p.confidence > 0.5);
          if (strongPatterns.length > 0) {
            notes.push(`Dominant rhythmic pattern: ${strongPatterns[0].pattern}`);
          }

          // Complexity analysis
          if (complexity.rhythmicComplexity > 0.7) {
            notes.push("This rhythm shows high complexity with varied beat strengths.");
          } else if (complexity.rhythmicComplexity < 0.3) {
            notes.push("This rhythm is relatively simple with consistent beat patterns.");
          }

          if (complexity.syncopationLevel > 0.4) {
            notes.push("Notable syncopation present - strong beats occur in unexpected places.");
          }

          if (complexity.beatRegularity > 0.8) {
            notes.push("Very regular beat timing - good for beginner rhythm practice.");
          } else if (complexity.beatRegularity < 0.5) {
            notes.push("Irregular timing - advanced rhythmic concepts present.");
          }

          return notes;
        }

        async cleanup(): Promise<void> {
          await this.parser.cleanup();
        }
      }

      const analyzer = new MusicTheoryAnalyzer();

      // Analyze different audio samples
      const simpleAudio = testAudioFiles.get('short-beat.wav')!;
      const complexAudio = testAudioFiles.get('complex-rhythm.wav')!;

      const simpleAnalysis = await analyzer.analyzeForEducation(simpleAudio);
      const complexAnalysis = await analyzer.analyzeForEducation(complexAudio);

      // Test simple audio analysis
      expect(simpleAnalysis.timeSignature.numerator).toBeGreaterThan(0);
      expect(simpleAnalysis.timeSignature.confidence).toBeGreaterThan(0);
      expect(simpleAnalysis.educationalNotes.length).toBeGreaterThan(0);

      // Test complex audio analysis
      expect(complexAnalysis.rhythmicPatterns).toBeDefined();
      expect(complexAnalysis.complexityMetrics.rhythmicComplexity).toBeGreaterThanOrEqual(0);
      expect(complexAnalysis.complexityMetrics.beatRegularity).toBeGreaterThanOrEqual(0);
      expect(complexAnalysis.complexityMetrics.syncopationLevel).toBeGreaterThanOrEqual(0);

      // Complex audio should generally have higher complexity
      expect(complexAnalysis.complexityMetrics.rhythmicComplexity)
        .toBeGreaterThanOrEqual(simpleAnalysis.complexityMetrics.rhythmicComplexity);

      // Educational notes should be informative
      simpleAnalysis.educationalNotes.forEach(note => {
        expect(note.length).toBeGreaterThan(10);
        expect(note).toMatch(/[.!]/); // Should end with punctuation
      });

      await analyzer.cleanup();
    });
  });
});