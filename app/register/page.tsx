// app/register/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase, Batch } from '@/lib/supabase';
import { startRegistration } from '@simplewebauthn/browser';

export default function RegisterPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch available batches from Supabase when the page loads
  useEffect(() => {
    async function loadBatches() {
      const { data, error } = await supabase.from('batches').select('*').order('name');
      if (data && !error) setBatches(data);
    }
    loadBatches();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Creating student profile...');
    setIsLoading(true);

    try {
      // 1. Create the student in Supabase to get an ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .insert({ name: studentName, batch_id: selectedBatch })
        .select()
        .single();

      if (studentError || !student) throw new Error('Failed to create student profile.');

      // 2. Ask the server for WebAuthn Registration Options (the challenge)
      setStatus('Prompting biometric scan...');
      const optionsRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-options', studentId: student.id }),
      });
      const options = await optionsRes.json();
      if (options.error) throw new Error(options.error);

      // 3. Trigger the phone's native Fingerprint/Face ID prompt
      let attResp;
      try {
        attResp = await startRegistration(options);
      } catch (err: any) {
        throw new Error('Biometric registration was cancelled or failed.');
      }

      // 4. Send the cryptographically signed response back to the server
      setStatus('Verifying and saving passkey...');
      const verifyRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-response',
          studentId: student.id,
          registrationResponse: attResp,
        }),
      });

      const verification = await verifyRes.json();
      if (verification.verified) {
        setStatus('Success! Your device is now registered for attendance.');
        setStudentName('');
      } else {
        throw new Error(verification.error || 'Verification failed.');
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
        <h2 className="text-2xl font-bold text-center mb-6">Device Registration</h2>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Select Batch</label>
            <select
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
            >
              <option value="">-- Choose a Batch --</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              required
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="e.g., Jane Doe"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !selectedBatch || !studentName}
            className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-400"
          >
            {isLoading ? 'Processing...' : 'Register Fingerprint'}
          </button>
        </form>
        {status && (
          <div className={`mt-4 text-center text-sm ${status.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}