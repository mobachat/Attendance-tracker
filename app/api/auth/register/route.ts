// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// In production, these should match your Vercel domain (e.g., 'your-school.vercel.app')
const rpName = 'Vercel Attendance System';
const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost'; 
const expectedOrigin = process.env.NEXT_PUBLIC_ORIGIN || `http://${rpID}:3000`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, studentId } = body;
    const supabase = getSupabaseAdmin(); // Use the admin client to bypass RLS for secure updates

    // 1. Ensure the student exists in our Supabase database
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    // ==========================================
    // STEP 1: Generate Registration Options
    // ==========================================
    if (action === 'generate-options') {
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: isoBase64URL.fromString(student.id), // SimpleWebAuthn requires a Uint8Array ID
        userName: student.name,
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred', // Triggers the biometric prompt on the phone
        },
      });

      // Save the generated challenge string temporarily to the student's record
      await supabase
        .from('students')
        .update({ current_challenge: options.challenge })
        .eq('id', student.id);

      return NextResponse.json(options);
    }

    // ==========================================
    // STEP 2: Verify and Save the Passkey
    // ==========================================
    if (action === 'verify-response') {
      const { registrationResponse } = body;
      const expectedChallenge = student.current_challenge;

      if (!expectedChallenge) {
        return NextResponse.json({ error: 'No active registration challenge found.' }, { status: 400 });
      }

      // Verify the cryptographic signature returned by the phone
      const verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });

      if (verification.verified && verification.registrationInfo) {
        const { registrationInfo } = verification;
        const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

        // Save the phone's public key and credential ID to our authenticators table
        const { error: insertError } = await supabase
          .from('authenticators')
          .insert({
            credential_id: credential.id,
            student_id: student.id,
            // Convert the Uint8Array public key back to a storable Base64 string
            public_key: isoBase64URL.fromBuffer(credential.publicKey), 
            counter: credential.counter,
            device_type: credentialDeviceType,
            backed_up: credentialBackedUp,
            transports: credential.transports,
          });

        if (insertError) {
          throw new Error('Failed to save authenticator public key to Supabase.');
        }

        // Clear the challenge now that registration is complete
        await supabase
          .from('students')
          .update({ current_challenge: null })
          .eq('id', student.id);

        return NextResponse.json({ verified: true });
      } else {
        return NextResponse.json({ verified: false, error: 'Biometric verification failed.' }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Invalid action provided.' }, { status: 400 });
  } catch (error: any) {
    console.error('Registration API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}