import { Subject, Observable } from 'rxjs';

export class EventSocket {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<any>();
  private callStateSubject = new Subject<'connected' | 'disconnected' | 'error'>();

  // Expose observables
  get message$(): Observable<any> {
    return this.messageSubject.asObservable();
  }

  get callState$(): Observable<'connected' | 'disconnected' | 'error'> {
    return this.callStateSubject.asObservable();
  }

  // Connect to the WebSocket using the provided URL
  connect(url: string): void {
    if (this.socket) {
      this.disconnect();
    }

    console.log(`Connecting to WebSocket: ${url}`);
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('WebSocket connected.');
      this.callStateSubject.next('connected');
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.messageSubject.next(data);
        
        // Handle specific call-related events
        if (data.event === 'call.ended' || data.event === 'call.hangup') {
          this.callStateSubject.next('disconnected');
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.callStateSubject.next('error');
    };

    this.socket.onclose = (event) => {
      console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
      this.socket = null;
      this.callStateSubject.next('disconnected');
    };
  }

  // Disconnect the WebSocket
  disconnect(): void {
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        console.log('Disconnecting WebSocket...');
        this.socket.close(1000, 'Manual disconnect');
      } else {
        console.log('WebSocket already disconnected or not open.');
      }
      this.socket = null;
      this.callStateSubject.next('disconnected');
    } else {
      console.log('No active WebSocket connection to disconnect.');
    }
  }

  // Check if WebSocket is connected
  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  // Send data through the WebSocket
  send(data: any): void {
    if (this.isConnected()) {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket?.send(message);
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('Cannot send message: WebSocket is not connected');
    }
  }

  // Send call-specific commands
  sendCallCommand(command: string, params: any = {}): void {
    const message = {
      event: `call.${command}`,
      ...params
    };
    this.send(message);
  }
}