// app/attend/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, Student } from '@/lib/supabase';
import { startAuthentication } from '@simplewebauthn/browser';

export default function AttendPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Refs for silent selfie capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function loadStudents() {
      // In a production app with many students, you'd want a searchable dropdown here
      const { data, error } = await supabase.from('students').select('*').order('name');
      if (data && !error) setStudents(data);
    }
    loadStudents();
  }, []);

  const captureSelfieAndLocation = async (): Promise<{ photoBase64: string; lat: number; lon: number }> => {
    return new Promise((resolve, reject) => {
      // 1. Get Location
      if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by your browser.'));
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          try {
            // 2. Start Camera (Front-facing)
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            if (videoRef.current && canvasRef.current) {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              
              video.srcObject = stream;
              await video.play();

              // Give the camera half a second to adjust exposure
              await new Promise((res) => setTimeout(res, 500));

              // 3. Snap photo onto canvas
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              // 4. Convert to Base64 and stop camera
              const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
              stream.getTracks().forEach(track => track.stop());

              resolve({ photoBase64, lat, lon });
            }
          } catch (camError) {
            reject(new Error('Camera access denied. We need a selfie to mark attendance.'));
          }
        },
        (geoError) => reject(new Error('Location access denied. We must verify you are in class.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleAttend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus('Verifying location and capturing selfie...');

    try {
      // 1. Get GPS and Selfie
      const { photoBase64, lat, lon } = await captureSelfieAndLocation();

      // 2. Request WebAuthn Challenge from Server
      setStatus('Prompting biometric scan...');
      const optionsRes = await fetch('/api/auth/attend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-options', studentId: selectedStudent }),
      });
      const options = await optionsRes.json();
      if (options.error) throw new Error(options.error);

      // 3. Trigger Fingerprint/Face ID
      let authResp;
      try {
        authResp = await startAuthentication(options);
      } catch (err) {
        throw new Error('Biometric scan was cancelled or failed.');
      }

      // 4. Send everything to the server for verification
      setStatus('Verifying and marking attendance...');
      const verifyRes = await fetch('/api/auth/attend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-response',
          studentId: selectedStudent,
          authenticationResponse: authResp,
          latitude: lat,
          longitude: lon,
          photoBase64: photoBase64,
        }),
      });

      const verification = await verifyRes.json();
      if (verification.verified) {
        setStatus(`Success! Attendance marked. (Distance: ${verification.distance}m)`);
      } else {
        throw new Error(verification.error || 'Check-in failed.');
      }
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Daily Check-in</h2>
        <form onSubmit={handleAttend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Select Your Name</label>
            <select
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
            >
              <option value="">-- Choose Name --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isLoading || !selectedStudent}
            className="w-full bg-green-600 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-400"
          >
            {isLoading ? 'Processing...' : 'Mark Attendance'}
          </button>
        </form>
        {status && (
          <div className={`mt-4 text-center text-sm font-medium ${status.startsWith('Error') ? 'text-red-600' : 'text-blue-600'}`}>
            {status}
          </div>
        )}
      </div>

      {/* Hidden elements for selfie capture */}
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}