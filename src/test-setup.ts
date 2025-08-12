/**
 * Jest test setup file
 */

// Export empty object to make this a module
export {};

// Global test utilities and setup
(global as any).createMockAudioData = (length: number, frequency = 440, sampleRate = 44100): Float32Array => {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return data;
};

// Extend global namespace for TypeScript
declare global {
  var createMockAudioData: (length: number, frequency?: number, sampleRate?: number) => Float32Array;
}