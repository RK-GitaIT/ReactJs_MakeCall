// services/Audio.ts

let audioContext: AudioContext | null = null;
const SAMPLE_RATE = 8000; // PCMU standard sample rate

// Initialize audio context with proper settings
export const initAudioContext = () => {
  if (!audioContext || audioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioCtx({ 
      sampleRate: 48000,
      latencyHint: 'interactive'
    });
  }
  return audioContext;
};

// Convert Float32Array to Int16Array with improved precision
export const float32ToPCM = (float32Array: Float32Array): Int16Array => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Apply a soft clip to prevent harsh distortion
    const sample = Math.tanh(float32Array[i] * 0.8);
    int16Array[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  }
  return int16Array;
};

// Convert Int16Array to Float32Array with improved precision
export const pcmToFloat32 = (pcmData: Int16Array): Float32Array => {
  const float32Array = new Float32Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    float32Array[i] = pcmData[i] / 32767.0;
  }
  return float32Array;
};

// Decode base64 PCMU and play audio
export const playPCMFromBase64 = (base64Payload: string) => {
  const pcmuData = Uint8Array.from(atob(base64Payload), c => c.charCodeAt(0));
  const pcmData = pcmuToPCM(pcmuData);
  playPCMFromInt16(pcmData);
};

// Play PCM data using Web Audio API with improved buffering
export const playPCMFromInt16 = (pcmData: Int16Array) => {
  try {
    // Check if context exists and is not closed
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = initAudioContext();
    }
    
    // If still no context, return
    if (!audioContext) return;

    const float32Data = pcmToFloat32(pcmData);
    const audioBuffer = audioContext.createBuffer(1, float32Data.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(float32Data, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Add a gain node to control volume
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0; // Adjust this value to control volume (0.0 to 1.0)
    
    // Connect through gain node
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start();
  } catch (error) {
    console.error('Error playing PCM data:', error);
  }
};

// PCMU to PCM conversion with improved quality
export const pcmuToPCM = (pcmuData: Uint8Array): Int16Array => {
  const pcmData = new Int16Array(pcmuData.length);
  for (let i = 0; i < pcmuData.length; i++) {
    pcmData[i] = uLawToPCM(pcmuData[i]);
  }
  return pcmData;
};

// PCM to PCMU conversion with improved quality
export const pcmToPCMU = (pcmData: Int16Array): Uint8Array => {
  const pcmuData = new Uint8Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    pcmuData[i] = pcmToULaw(pcmData[i]);
  }
  return pcmuData;
};

// μ-law to linear PCM conversion with improved precision
const uLawToPCM = (ulaw: number): number => {
  ulaw = ~ulaw;
  const sign = (ulaw & 0x80) ? -1 : 1;
  const exponent = ((ulaw & 0x70) >>> 4) & 0x07;
  const mantissa = ulaw & 0x0F;
  let sample = mantissa << (exponent + 3);
  sample += 132 >>> (exponent + 3);
  return sign * sample;
};

// Linear PCM to μ-law conversion with improved precision
const pcmToULaw = (pcm: number): number => {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = (pcm >> 8) & 0x80;
  
  if (sign) pcm = -pcm;
  if (pcm > CLIP) pcm = CLIP;
  pcm += BIAS;

  let exponent = 7;
  for (let i = 0x4000; i > 0 && (pcm & i) === 0; i >>= 1) {
    exponent--;
  }

  const mantissa = (pcm >> (exponent + 3)) & 0x0F;
  const ulawByte = ~(sign | (exponent << 4) | mantissa);
  
  return ulawByte & 0xFF;
};

// Downsample audio to 8kHz with improved quality
export const downsampleTo8k = (buffer: Float32Array, inputSampleRate: number): Int16Array => {
  const ratio = inputSampleRate / SAMPLE_RATE;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Int16Array(newLength);

  // Apply a simple low-pass filter before downsampling
  const filteredBuffer = new Float32Array(buffer.length);
  for (let i = 1; i < buffer.length - 1; i++) {
    filteredBuffer[i] = (buffer[i-1] + buffer[i] * 2 + buffer[i+1]) / 4;
  }
  filteredBuffer[0] = buffer[0];
  filteredBuffer[buffer.length - 1] = buffer[buffer.length - 1];

  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;

    for (let j = start; j < end && j < filteredBuffer.length; j++) {
      sum += filteredBuffer[j];
      count++;
    }

    const average = sum / count;
    result[i] = Math.max(-32768, Math.min(32767, Math.round(average * 32767)));
  }

  return result;
};

// Get audio worklet for processing
export const getAudioWorklet = async () => {
  if (!audioContext) initAudioContext();
  if (!audioContext) return null;

  await audioContext.audioWorklet.addModule('audio-worklet.js');
  return new AudioWorkletNode(audioContext, 'pcm-processor');
};
