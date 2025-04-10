import {
    pcmToPCMU,
    pcmuToPCM,
    playPCMFromInt16,
    downsampleTo8k,
    initAudioContext
  } from './audio';
  
  let socket: WebSocket | null = null;
  let audioContext: AudioContext | null = null;
  let micStream: MediaStream | null = null;
  let processor: ScriptProcessorNode | null = null;
  let isProcessing = false;
  const BUFFER_SIZE = 256; // Minimum power of 2 for ScriptProcessorNode
  const CHUNK_SIZE = 160; // 20ms at 8kHz
  let audioBuffer: Float32Array[] = [];
  
  export const connectStreamingSocket = async (streamingUrl: string) => {
    try {
      socket = new WebSocket(streamingUrl);
  
      socket.onopen = async () => {
        console.log('WebSocket connected to:', streamingUrl);
        await startMicrophoneStream();
      };
  
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.event === 'media' && data.media?.payload) {
            // Handle incoming PCMU audio data
            const pcmuBytes = Uint8Array.from(atob(data.media.payload), c => c.charCodeAt(0));
            
            // Verify chunk size (should be 160 bytes for 20ms of audio at 8kHz)
            if (pcmuBytes.length === CHUNK_SIZE) {
              const pcmSamples = pcmuToPCM(pcmuBytes);
              playPCMFromInt16(pcmSamples);
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
  
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
  
      socket.onclose = () => {
        console.log('WebSocket closed');
        stopMicrophoneStream();
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
    }
  };
  
  export const sendDataToSocket = (data: any) => {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(data));
      } catch (error) {
        console.error('Error sending data to WebSocket:', error);
      }
    }
  };
  
  const startMicrophoneStream = async () => {
    try {
      // Initialize audio context with proper sample rate
      audioContext = initAudioContext();
      
      // Get microphone access with improved settings for 8kHz PCMU
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 8000 // Set to 8kHz for PCMU
        }
      });
  
      const source = audioContext.createMediaStreamSource(micStream);
      
      // Create a gain node to control input volume
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0; // Adjust this value to control input volume (0.0 to 1.0)
      
      // Create a low-pass filter to reduce high-frequency noise
      const lowPassFilter = audioContext.createBiquadFilter();
      lowPassFilter.type = 'lowpass';
      lowPassFilter.frequency.value = 3000; // Adjust this value to control cutoff frequency
      lowPassFilter.Q.value = 0.7; // Adjust this value to control resonance
      
      // Connect the audio nodes
      source.connect(gainNode);
      gainNode.connect(lowPassFilter);
      lowPassFilter.connect(audioContext.destination);
      
      // Create a script processor for audio processing
      processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      lowPassFilter.connect(processor);
      processor.connect(audioContext.destination);
  
      isProcessing = true;
      processor.onaudioprocess = (e) => {
        if (!isProcessing) return;
  
        try {
          // Get input data
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Apply a simple noise gate to reduce background noise
          const noiseGateThreshold = 0.01;
          const gatedData = new Float32Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            gatedData[i] = Math.abs(inputData[i]) > noiseGateThreshold ? inputData[i] : 0;
          }
          
          // Add to buffer
          audioBuffer.push(gatedData);
          
          // Process when we have enough data for a 20ms chunk
          const totalSamples = audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          if (totalSamples >= CHUNK_SIZE) {
            // Concatenate buffers
            const combinedBuffer = new Float32Array(totalSamples);
            let offset = 0;
            for (const buffer of audioBuffer) {
              combinedBuffer.set(buffer, offset);
              offset += buffer.length;
            }
            
            // Keep remaining samples for next chunk
            const remainingSamples = totalSamples - CHUNK_SIZE;
            audioBuffer = remainingSamples > 0 
              ? [combinedBuffer.slice(CHUNK_SIZE)]
              : [];
            
            // Process the 20ms chunk
            const chunkData = combinedBuffer.slice(0, CHUNK_SIZE);
            
            // Downsample to 8kHz and convert to 8-bit PCMU
            const downsampledData = downsampleTo8k(chunkData, audioContext!.sampleRate);
            const pcmuData = pcmToPCMU(downsampledData);
            
            // Convert to base64
            const base64Data = btoa(Array.from(pcmuData, byte => String.fromCharCode(byte)).join(''));
  
            // Send audio data
            sendDataToSocket({
              event: 'media',
              media: {
                payload: base64Data,
                timestamp: Date.now()
              }
            });
          }
        } catch (error) {
          console.error('Error processing audio:', error);
        }
      };
  
      console.log('Microphone stream started');
    } catch (error) {
      console.error('Microphone access error:', error);
      throw error;
    }
  };
  
  const stopMicrophoneStream = () => {
    isProcessing = false;
    audioBuffer = [];
  
    if (processor) {
      processor.disconnect();
      processor = null;
    }
  
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
  
    // Only close the audio context if we're not expecting to play more audio
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
      audioContext = null;
    }
  
    console.log('Microphone stream stopped');
  };
  
  export const closeStreamingSocket = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.close();
    }
    socket = null;
    stopMicrophoneStream();
  };
  