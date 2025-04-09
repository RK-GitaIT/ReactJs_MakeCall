import React, { useState, useEffect } from 'react';
import callController from '../services/callController';
import { getEventSocket } from '../services/callController';

const CallController: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [callStatus, setCallStatus] = useState('');

  useEffect(() => {
    // Check if there's an active call when component mounts
    const currentCall = callController.getCurrentCall();
    if (currentCall) {
      setCallStatus('Call in progress');
    }

    // Subscribe to WebSocket events
    const subscription = getEventSocket().message$.subscribe(data => {
      console.log('WebSocket event received:', data);
      
      if (data.event === 'call.started') {
        setCallStatus('Call connected');
      } else if (data.event === 'call.ended' || data.event === 'call.hangup') {
        setCallStatus('Call ended');
      } else if (data.event === 'call.answered') {
        setCallStatus('Call answered');
      } else if (data.event === 'call.ringing') {
        setCallStatus('Call ringing');
      }
    });

    // Cleanup subscription on component unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleMakeCall = async () => {
    setError('');
    setCallStatus('Initiating call...');
    
    try {
      const result = await callController.makeCall(phoneNumber);
      console.log('Call initiated:', result);
      
      // Check if call was successfully created
      if (result.data && result.data.call_control_id) {
        setCallStatus('Call initiated');
      } else {
        setError('Failed to initiate call. Please try again.');
        setCallStatus('Call failed');
      }
    } catch (error) {
      console.error('Failed to make call:', error);
      setError('Failed to make call. Please try again.');
      setCallStatus('Call failed');
    }
  };

  const handleHangupCall = async () => {
    try {
      const currentCall = callController.getCurrentCall();
      if (currentCall) {
        setCallStatus('Hanging up...');
        const result = await callController.hangupCall(currentCall.call_control_id);
        console.log('Call hung up:', result);
        setCallStatus('Call ended');
      } else {
        setError('No active call to hang up');
      }
    } catch (error) {
      console.error('Failed to hang up call:', error);
      setError('Failed to hang up call. Please try again.');
    }
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    if (error) {
      setError('');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="space-y-4">
        <div>
          <input
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneNumberChange}
            placeholder="Enter phone number (e.g., +1234567890)"
            className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {error && (
            <p className="mt-1 text-sm text-red-500">{error}</p>
          )}
        </div>

        {callStatus && (
          <div className="text-center">
            <p className={`text-sm font-medium ${
              callStatus.includes('connected') || callStatus.includes('answered') 
                ? 'text-green-500' 
                : callStatus.includes('failed') 
                  ? 'text-red-500' 
                  : 'text-blue-500'
            }`}>
              {callStatus}
            </p>
          </div>
        )}

        <div className="flex justify-center space-x-4">
          <button
            onClick={handleMakeCall}
            className="px-6 py-2 text-white bg-green-500 rounded-md transition-colors hover:bg-green-600"
          >
            Make Call
          </button>
          <button
            onClick={handleHangupCall}
            className="px-6 py-2 text-white bg-red-500 rounded-md transition-colors hover:bg-red-600"
          >
            Hang Up
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallController;
