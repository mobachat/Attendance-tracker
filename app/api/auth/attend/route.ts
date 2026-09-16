// app/api/auth/attend/route.ts
import { NextResponse } from 'next/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getDistanceInMeters } from '@/lib/geo';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid

const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';
const expectedOrigin = process.env.NEXT_PUBLIC_ORIGIN || `http://${rpID}:3000`;
const CLASSROOM_LAT = parseFloat(process.env.NEXT_PUBLIC_SCHOOL_LAT || '0');
const CLASSROOM_LON = parseFloat(process.env.NEXT_PUBLIC_SCHOOL_LON || '0');
const MAX_DISTANCE_METERS = 50; // Maximum allowed distance from the classroom

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, studentId } = body;
    const supabase = getSupabaseAdmin();

    // Ensure student exists
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (studentError || !student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

    // ==========================================
    // STEP 1: Generate Authentication Challenge
    // ==========================================
    if (action === 'generate-options') {
      // Get the student's registered devices (authenticators)
      const { data: authenticators } = await supabase
        .from('authenticators')
        .select('*')
        .eq('student_id', student.id);

      if (!authenticators || authenticators.length === 0) {
        return NextResponse.json({ error: 'No registered biometric devices found for this student.' }, { status: 400 });
      }

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: authenticators.map((auth) => ({
          id: isoBase64URL.fromString(auth.credential_id),
          type: 'public-key',
          transports: auth.transports as any,
        })),
        userVerification: 'preferred',
      });

      // Save the challenge temporarily
      await supabase.from('students').update({ current_challenge: options.challenge }).eq('id', student.id);

      return NextResponse.json(options);
    }

    // ==========================================
    // STEP 2: Verify Biometrics, Location, & Photo
    // ==========================================
    if (action === 'verify-response') {
      const { authenticationResponse, latitude, longitude, photoBase64 } = body;
      const expectedChallenge = student.current_challenge;

      if (!expectedChallenge) return NextResponse.json({ error: 'No active challenge.' }, { status: 400 });

      // 1. Verify Geolocation (Geofence Constraint)
      const distance = getDistanceInMeters(CLASSROOM_LAT, CLASSROOM_LON, latitude, longitude);
      if (distance > MAX_DISTANCE_METERS) {
        return NextResponse.json({ error: `Location rejected. You are ${Math.round(distance)}m away.` }, { status: 403 });
      }

      // 2. Find the authenticator matching the credential ID sent by the phone
      const { data: authenticator } = await supabase
        .from('authenticators')
        .select('*')
        .eq('credential_id', authenticationResponse.id)
        .single();

      if (!authenticator) return NextResponse.json({ error: 'Device not recognized.' }, { status: 400 });

      // 3. Verify the biometric cryptographic signature
      const verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        authenticator: {
          credentialID: isoBase64URL.fromString(authenticator.credential_id),
          credentialPublicKey: isoBase64URL.fromString(authenticator.public_key),
          counter: Number(authenticator.counter),
        },
      });

      if (!verification.verified || !verification.authenticationInfo) {
        return NextResponse.json({ error: 'Biometric verification failed.' }, { status: 401 });
      }

      // 4. Upload the selfie to Supabase Storage
      let photoUrl = null;
      if (photoBase64) {
        const buffer = Buffer.from(photoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const fileName = `${student.id}/${uuidv4()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('attendance_photos')
          .upload(fileName, buffer, { contentType: 'image/jpeg' });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('attendance_photos').getPublicUrl(fileName);
          photoUrl = publicUrlData.publicUrl;
        }
      }

      // 5. Log the attendance in the database
      const { error: attendanceError } = await supabase.from('attendance').insert({
        student_id: student.id,
        batch_id: student.batch_id,
        latitude,
        longitude,
        distance_meters: distance,
        photo_url: photoUrl,
        is_manual: false,
      });

      if (attendanceError) throw new Error('Failed to save attendance record.');

      // 6. Cleanup challenge and update the device counter (WebAuthn security requirement)
      await supabase.from('students').update({ current_challenge: null }).eq('id', student.id);
      await supabase.from('authenticators').update({ counter: verification.authenticationInfo.newCounter }).eq('credential_id', authenticator.credential_id);

      return NextResponse.json({ verified: true, distance: Math.round(distance) });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Attendance API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}