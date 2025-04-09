// services/callController.ts
import axios from 'axios';
import { EventSocket } from './EventesScocket';
import { connectStreamingSocket, closeStreamingSocket } from './streamingSocket';

const API_BASE_URL = 'https://api.telnyx.com/v2'; 
const API_KEY = 'KEY01961A4A775D23BC587C184B5909D9AB_ZU8rMkiI3BMeTllxV30xbb';
const TELNYX_NUMBER = '+17043681266';
const TELNYX_CONNECTION_ID = '2633537397060536109';
const webhookUrl = "https://gitait.com/telnyx/api/webhook";
const wsUrl = "wss://gitait.com/telnyx/ws";
const ws_stream_url = "wss://gitait.com/telnyx/ws-audio-stream";

// Define the Call interface
interface Call {
  connection_id: string;
  call_control_id: string;
  client_state: string;
  call_session_id: string;
  call_leg_id: string;
}

// Create a singleton instance of EventSocket
const eventSocket = new EventSocket();

// Create a singleton instance of CallController
class CallController {
  private currentCall: Call | null = null;
  private subscription: any;

  constructor() {
    // Load current call from localStorage on initialization
    this.loadCurrentCallFromStorage();
    this.setupWebSocketSubscription();
  }

  // Load current call from localStorage
  private loadCurrentCallFromStorage(): void {
    try {
      const storedCall = localStorage.getItem('currentCall');
      if (storedCall) {
        this.currentCall = JSON.parse(storedCall);
        console.log('Loaded call from storage:', this.currentCall);
      }
    } catch (error) {
      console.error('Error loading call from storage:', error);
    }
  }

  // Save current call to localStorage
  private saveCurrentCallToStorage(): void {
    try {
      if (this.currentCall) {
        localStorage.setItem('currentCall', JSON.stringify(this.currentCall));
        console.log('Saved call to storage:', this.currentCall);
      } else {
        localStorage.removeItem('currentCall');
        console.log('Removed call from storage');
      }
    } catch (error) {
      console.error('Error saving call to storage:', error);
    }
  }

  // Setup WebSocket subscription
  private setupWebSocketSubscription(): void {
    this.subscription = eventSocket.message$.subscribe((data: any) => {
      console.log('Received WebSocket message:', data);
      // Handle different types of messages here
      if (data.data.event_type === 'call.started') {
        console.log('Call started:', data);
        // Connect to streaming socket when call starts
      } else if (data.data.event_type === 'call.ended') {
        console.log('Call ended:', data);
        // Close streaming socket when call ends
        closeStreamingSocket();
      } else if (data.data.event_type === 'call.answered') {
        console.log('Call answered:', data);
        this.startCallRecording(this.currentCall?.call_control_id || '');
      }
    });
  }

  async makeCall(phoneNumber: string): Promise<any> {
    try {
      // Connect to WebSocket before making the call
      eventSocket.connect(wsUrl);
      connectStreamingSocket(ws_stream_url).catch(error => {
        console.error('Failed to connect to streaming socket:', error);
      });
      
      const payload = {
        to: phoneNumber,
        from: TELNYX_NUMBER,
        from_display_name: "GitaIT",
        connection_id: TELNYX_CONNECTION_ID,
        timeout_secs: 60,
        timeout_limit_secs: 60,
        webhook_url: webhookUrl,
        webhook_url_method: "POST",
        media_encryption: "disabled",
        stream_url: ws_stream_url,  
        stream_track: "both_tracks",
        stream_bidirectional_mode: "rtp",
        stream_bidirectional_codec: "PCMU",
        stream_bidirectional_sampling_rate: 8000,
        send_silence_when_idle: true,
      };

      const response = await axios.post(`${API_BASE_URL}/calls`, payload, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      // Telnyx API returns data in a nested structure
      if (response.data.data && response.data.data.call_control_id) {
        this.currentCall = {
          connection_id: TELNYX_CONNECTION_ID,
          call_control_id: response.data.data.call_control_id,
          client_state: response.data.data.client_state || '',
          call_session_id: response.data.data.call_session_id || '',
          call_leg_id: response.data.data.call_leg_id || ''
        };
        
        // Save to localStorage
        this.saveCurrentCallToStorage();
      }

      return response.data;
    } catch (error) {
      console.error('Failed to make call:', error);
      // Disconnect WebSocket if call fails
      eventSocket.disconnect();
      closeStreamingSocket();
      throw error;
    }
  }

  async hangupCall(callControlId: string): Promise<any> {
    try {
      const response = await axios.post(`${API_BASE_URL}/calls/${callControlId}/actions/hangup`, {}, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      // Disconnect WebSocket after hanging up
      eventSocket.disconnect();
      // Close streaming socket after hanging up
      closeStreamingSocket();
      
      // Clear the current call
      this.currentCall = null;
      
      // Remove from localStorage
      this.saveCurrentCallToStorage();

      return response.data;
    } catch (error) {
      console.error('Failed to hang up call:', error);
      // Still try to disconnect WebSocket even if hangup fails
      eventSocket.disconnect();
      closeStreamingSocket();
      throw error;
    }
  }

  getCurrentCall(): Call | null {
    if (!this.currentCall) {
      this.loadCurrentCallFromStorage();
    }
    return this.currentCall;
  }

  async startCallRecording(callControlId: string): Promise<void> {
    const requestBody = {
      format: "mp3",
      channels: "dual",
      play_beep: true,
      max_length: 0,
      timeout_secs: 0
    };

    try {
      const response = await axios.post(`${API_BASE_URL}/calls/${callControlId}/actions/record_start`, requestBody, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      console.log("Recording started successfully:", response);
    } catch (error) {
      console.error("Error starting call recording:", error);
      throw error;
    }
  }
}

// Create and export a singleton instance
const callController = new CallController();
export default callController;

// Export the eventSocket instance for external use if needed
export const getEventSocket = () => eventSocket;

