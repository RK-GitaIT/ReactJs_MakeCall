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
  const BUFFER_SIZE = 2048;
  
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
            
            // Verify chunk size (should be around 160 bytes for 20ms of audio)
            if (pcmuBytes.length > 0) {
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
      
      // Get microphone access with improved settings
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
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
          
          // Downsample to 8kHz
          const downsampledData = downsampleTo8k(gatedData, audioContext!.sampleRate);
          
          // Convert to PCMU
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
  