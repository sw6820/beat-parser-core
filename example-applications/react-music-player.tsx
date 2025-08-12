/**
 * React Music Player Example
 * Demonstrates beat-parser integration with a complete React music player
 * Features: playlist management, beat visualization, crossfade detection
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { BeatParser } from '../src/core/BeatParser';
import { ParseResult, Beat } from '../src/types';

// Types for the music player
interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  audioUrl: string;
  audioData?: Float32Array;
  beats?: Beat[];
  tempo?: number;
  analyzed: boolean;
  isLoading: boolean;
}

interface PlaylistState {
  tracks: Track[];
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
}

interface VisualizationProps {
  beats: Beat[];
  currentTime: number;
  isPlaying: boolean;
}

// Beat visualization component
const BeatVisualization: React.FC<VisualizationProps> = ({ 
  beats, 
  currentTime, 
  isPlaying 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw waveform background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    if (beats.length === 0) return;
    
    // Draw beats
    const timeRange = 10000; // Show 10 seconds of beats
    const startTime = Math.max(0, currentTime - timeRange / 2);
    const endTime = startTime + timeRange;
    
    const visibleBeats = beats.filter(beat => 
      beat.timestamp >= startTime && beat.timestamp <= endTime
    );
    
    visibleBeats.forEach(beat => {
      const x = ((beat.timestamp - startTime) / timeRange) * width;
      const beatHeight = beat.strength * height * 0.8;
      const y = height - beatHeight;
      
      // Color based on confidence
      const alpha = Math.max(0.3, beat.confidence);
      ctx.fillStyle = `rgba(0, 255, 100, ${alpha})`;
      ctx.fillRect(x - 2, y, 4, beatHeight);
      
      // Highlight current beat
      if (Math.abs(beat.timestamp - currentTime) < 200) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(x - 3, y - 5, 6, beatHeight + 10);
      }
    });
    
    // Draw playback position
    const playbackX = (width / 2);
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playbackX, 0);
    ctx.lineTo(playbackX, height);
    ctx.stroke();
    
  }, [beats, currentTime, isPlaying]);
  
  return (
    <canvas 
      ref={canvasRef}
      width={800}
      height={200}
      style={{ 
        width: '100%', 
        height: '200px', 
        border: '1px solid #333',
        backgroundColor: '#1a1a1a'
      }}
    />
  );
};

// Track list component
interface TrackListProps {
  tracks: Track[];
  currentTrackIndex: number;
  onTrackSelect: (index: number) => void;
  onAnalyzeTrack: (trackId: string) => void;
}

const TrackList: React.FC<TrackListProps> = ({ 
  tracks, 
  currentTrackIndex, 
  onTrackSelect,
  onAnalyzeTrack
}) => {
  return (
    <div style={{ 
      maxHeight: '300px', 
      overflowY: 'auto',
      border: '1px solid #333',
      backgroundColor: '#2a2a2a'
    }}>
      {tracks.map((track, index) => (
        <div 
          key={track.id}
          style={{
            padding: '12px',
            borderBottom: '1px solid #333',
            backgroundColor: index === currentTrackIndex ? '#4a4a4a' : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          onClick={() => onTrackSelect(index)}
        >
          <div>
            <div style={{ color: '#fff', fontWeight: 'bold' }}>{track.title}</div>
            <div style={{ color: '#ccc', fontSize: '0.9em' }}>{track.artist}</div>
            <div style={{ color: '#999', fontSize: '0.8em' }}>
              {track.analyzed ? `${track.beats?.length || 0} beats` : 'Not analyzed'}
              {track.tempo && ` • ${Math.round(track.tempo)} BPM`}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {track.isLoading && (
              <div style={{ color: '#ffd700' }}>Analyzing...</div>
            )}
            
            {!track.analyzed && !track.isLoading && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyzeTrack(track.id);
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8em'
                }}
              >
                Analyze
              </button>
            )}
            
            {track.analyzed && (
              <div style={{ color: '#00ff66', fontSize: '0.8em' }}>✓</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Main music player component
const MusicPlayer: React.FC = () => {
  const [playlist, setPlaylist] = useState<PlaylistState>({
    tracks: [],
    currentTrackIndex: 0,
    isPlaying: false,
    currentTime: 0,
    volume: 0.8,
    crossfadeEnabled: true,
    crossfadeDuration: 3000
  });
  
  const [beatParser] = useState(() => new BeatParser({
    sampleRate: 44100,
    enablePreprocessing: true,
    enableNormalization: true
  }));
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize with sample tracks
  useEffect(() => {
    const sampleTracks: Track[] = [
      {
        id: 'track-1',
        title: 'Electronic Beat',
        artist: 'Demo Artist',
        duration: 180000, // 3 minutes
        audioUrl: '/sample-audio/electronic-beat.mp3',
        analyzed: false,
        isLoading: false
      },
      {
        id: 'track-2', 
        title: 'Hip Hop Rhythm',
        artist: 'Demo Artist',
        duration: 240000, // 4 minutes
        audioUrl: '/sample-audio/hiphop-rhythm.mp3',
        analyzed: false,
        isLoading: false
      },
      {
        id: 'track-3',
        title: 'House Music',
        artist: 'Demo Artist', 
        duration: 300000, // 5 minutes
        audioUrl: '/sample-audio/house-music.mp3',
        analyzed: false,
        isLoading: false
      }
    ];
    
    setPlaylist(prev => ({ ...prev, tracks: sampleTracks }));
  }, []);
  
  // Current track getter
  const currentTrack = useMemo(() => {
    return playlist.tracks[playlist.currentTrackIndex] || null;
  }, [playlist.tracks, playlist.currentTrackIndex]);
  
  // Analyze track function
  const analyzeTrack = useCallback(async (trackId: string) => {
    const trackIndex = playlist.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;
    
    // Set loading state
    setPlaylist(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => 
        track.id === trackId 
          ? { ...track, isLoading: true }
          : track
      )
    }));
    
    try {
      // In a real application, you would load the audio data here
      // For this demo, we'll simulate audio data
      const simulatedAudioData = generateSimulatedAudioData();
      
      const result = await beatParser.parseBuffer(simulatedAudioData, {
        targetPictureCount: 50,
        selectionMethod: 'adaptive'
      });
      
      // Update track with analysis results
      setPlaylist(prev => ({
        ...prev,
        tracks: prev.tracks.map(track => 
          track.id === trackId
            ? {
                ...track,
                audioData: simulatedAudioData,
                beats: result.beats,
                tempo: result.tempo?.bpm,
                analyzed: true,
                isLoading: false
              }
            : track
        )
      }));
      
    } catch (error) {
      console.error('Failed to analyze track:', error);
      
      // Clear loading state on error
      setPlaylist(prev => ({
        ...prev,
        tracks: prev.tracks.map(track => 
          track.id === trackId 
            ? { ...track, isLoading: false }
            : track
        )
      }));
    }
  }, [beatParser, playlist.tracks]);
  
  // Generate simulated audio data for demo
  const generateSimulatedAudioData = useCallback(() => {
    const duration = 30; // 30 seconds of demo data
    const sampleRate = 44100;
    const samples = duration * sampleRate;
    const audioData = new Float32Array(samples);
    
    // Generate a simple beat pattern
    const beatsPerSecond = 2; // 120 BPM
    const beatInterval = sampleRate / beatsPerSecond;
    
    for (let i = 0; i < samples; i++) {
      const time = i / sampleRate;
      const beatPhase = (i % beatInterval) / beatInterval;
      
      // Create beat pulses
      if (beatPhase < 0.1) {
        audioData[i] = Math.sin(2 * Math.PI * beatPhase * 10) * (1 - beatPhase * 10);
      } else {
        // Background music
        audioData[i] = Math.sin(2 * Math.PI * 220 * time) * 0.1 +
                      Math.sin(2 * Math.PI * 440 * time) * 0.05;
      }
    }
    
    return audioData;
  }, []);
  
  // Playback controls
  const togglePlayback = useCallback(() => {
    if (!currentTrack) return;
    
    setPlaylist(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    
    if (audioRef.current) {
      if (playlist.isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  }, [currentTrack, playlist.isPlaying]);
  
  const selectTrack = useCallback((index: number) => {
    if (index >= 0 && index < playlist.tracks.length) {
      setPlaylist(prev => ({
        ...prev,
        currentTrackIndex: index,
        isPlaying: false,
        currentTime: 0
      }));
      
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [playlist.tracks.length]);
  
  const nextTrack = useCallback(() => {
    const nextIndex = (playlist.currentTrackIndex + 1) % playlist.tracks.length;
    selectTrack(nextIndex);
  }, [playlist.currentTrackIndex, playlist.tracks.length, selectTrack]);
  
  const previousTrack = useCallback(() => {
    const prevIndex = playlist.currentTrackIndex === 0 
      ? playlist.tracks.length - 1 
      : playlist.currentTrackIndex - 1;
    selectTrack(prevIndex);
  }, [playlist.currentTrackIndex, playlist.tracks.length, selectTrack]);
  
  // Update current time
  useEffect(() => {
    if (playlist.isPlaying) {
      intervalRef.current = setInterval(() => {
        setPlaylist(prev => ({
          ...prev,
          currentTime: prev.currentTime + 100
        }));
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [playlist.isPlaying]);
  
  // Seek to beat
  const seekToBeat = useCallback((beatIndex: number) => {
    if (!currentTrack?.beats || beatIndex < 0 || beatIndex >= currentTrack.beats.length) {
      return;
    }
    
    const beat = currentTrack.beats[beatIndex];
    setPlaylist(prev => ({ ...prev, currentTime: beat.timestamp }));
    
    if (audioRef.current) {
      audioRef.current.currentTime = beat.timestamp / 1000;
    }
  }, [currentTrack?.beats]);
  
  // Find crossfade points
  const findCrossfadePoint = useCallback(() => {
    if (!currentTrack?.beats || playlist.currentTrackIndex >= playlist.tracks.length - 1) {
      return null;
    }
    
    const nextTrack = playlist.tracks[playlist.currentTrackIndex + 1];
    if (!nextTrack.beats) return null;
    
    // Find strong beats near the end of current track
    const currentDuration = currentTrack.duration;
    const fadeStartTime = currentDuration - playlist.crossfadeDuration;
    
    const fadeOutBeats = currentTrack.beats.filter(beat => 
      beat.timestamp >= fadeStartTime && beat.strength > 0.7
    );
    
    // Find strong beats near beginning of next track
    const fadeInBeats = nextTrack.beats.filter(beat => 
      beat.timestamp < playlist.crossfadeDuration && beat.strength > 0.7
    );
    
    if (fadeOutBeats.length === 0 || fadeInBeats.length === 0) {
      return null;
    }
    
    // Find best matching beats
    let bestMatch = null;
    let bestScore = 0;
    
    for (const outBeat of fadeOutBeats) {
      for (const inBeat of fadeInBeats) {
        const score = (outBeat.confidence + inBeat.confidence + 
                      outBeat.strength + inBeat.strength) / 4;
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            fadeOutTime: outBeat.timestamp,
            fadeInTime: inBeat.timestamp,
            confidence: score
          };
        }
      }
    }
    
    return bestMatch;
  }, [currentTrack, playlist.tracks, playlist.currentTrackIndex, playlist.crossfadeDuration]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      beatParser.cleanup();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [beatParser]);
  
  const crossfadePoint = findCrossfadePoint();
  
  return (
    <div style={{ 
      maxWidth: '1000px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#1a1a1a',
      color: '#fff',
      borderRadius: '10px'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        Beat-Synchronized Music Player
      </h1>
      
      {/* Current track info */}
      {currentTrack && (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '20px',
          padding: '20px',
          backgroundColor: '#2a2a2a',
          borderRadius: '8px'
        }}>
          <h2>{currentTrack.title}</h2>
          <p style={{ color: '#ccc' }}>{currentTrack.artist}</p>
          {currentTrack.tempo && (
            <p style={{ color: '#00ff66' }}>
              {Math.round(currentTrack.tempo)} BPM • {currentTrack.beats?.length || 0} beats detected
            </p>
          )}
        </div>
      )}
      
      {/* Playback controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '15px',
        marginBottom: '20px'
      }}>
        <button
          onClick={previousTrack}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Previous
        </button>
        
        <button
          onClick={togglePlayback}
          disabled={!currentTrack}
          style={{
            padding: '10px 30px',
            backgroundColor: playlist.isPlaying ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          {playlist.isPlaying ? 'Pause' : 'Play'}
        </button>
        
        <button
          onClick={nextTrack}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Next
        </button>
      </div>
      
      {/* Beat visualization */}
      {currentTrack?.beats && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Beat Visualization</h3>
          <BeatVisualization
            beats={currentTrack.beats}
            currentTime={playlist.currentTime}
            isPlaying={playlist.isPlaying}
          />
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: '10px',
            marginTop: '10px'
          }}>
            <button
              onClick={() => seekToBeat(0)}
              style={{
                padding: '5px 10px',
                backgroundColor: '#ffc107',
                color: 'black',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              First Beat
            </button>
            
            <button
              onClick={() => {
                const currentBeatIndex = currentTrack.beats?.findIndex(beat => 
                  beat.timestamp > playlist.currentTime
                ) || 0;
                seekToBeat(currentBeatIndex);
              }}
              style={{
                padding: '5px 10px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Next Beat
            </button>
          </div>
        </div>
      )}
      
      {/* Crossfade info */}
      {crossfadePoint && (
        <div style={{
          backgroundColor: '#2a2a2a',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h4>Crossfade Point Detected</h4>
          <p>
            Optimal crossfade: {Math.round(crossfadePoint.fadeOutTime / 1000)}s → {' '}
            {Math.round(crossfadePoint.fadeInTime / 1000)}s 
            (Confidence: {Math.round(crossfadePoint.confidence * 100)}%)
          </p>
        </div>
      )}
      
      {/* Track list */}
      <div>
        <h3>Playlist</h3>
        <TrackList
          tracks={playlist.tracks}
          currentTrackIndex={playlist.currentTrackIndex}
          onTrackSelect={selectTrack}
          onAnalyzeTrack={analyzeTrack}
        />
      </div>
      
      {/* Settings */}
      <div style={{ 
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#2a2a2a',
        borderRadius: '8px'
      }}>
        <h4>Settings</h4>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          <input
            type="checkbox"
            checked={playlist.crossfadeEnabled}
            onChange={(e) => setPlaylist(prev => ({ 
              ...prev, 
              crossfadeEnabled: e.target.checked 
            }))}
            style={{ marginRight: '8px' }}
          />
          Enable Crossfade
        </label>
        
        <label style={{ display: 'block', marginBottom: '10px' }}>
          Volume:
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={playlist.volume}
            onChange={(e) => setPlaylist(prev => ({ 
              ...prev, 
              volume: parseFloat(e.target.value)
            }))}
            style={{ marginLeft: '10px', width: '200px' }}
          />
          {Math.round(playlist.volume * 100)}%
        </label>
      </div>
      
      {/* Hidden audio element for actual playback */}
      {currentTrack && (
        <audio
          ref={audioRef}
          src={currentTrack.audioUrl}
          volume={playlist.volume}
          onEnded={nextTrack}
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
};

export default MusicPlayer;