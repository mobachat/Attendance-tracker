import { createClient } from '@supabase/supabase-js';

// Define core entity interfaces
export interface Batch {
  id: string;
  name: string;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  batch_id: string;
  current_challenge?: string | null;
  created_at: string;
}

export interface Authenticator {
  credential_id: string;
  student_id: string;
  public_key: string;
  counter: number;
  device_type?: string | null;
  backed_up: boolean;
  transports?: string[] | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  batch_id: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  distance_meters: number | null;
  photo_url: string | null;
  is_manual: boolean;
  marked_by: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase public environment variables.');
}

// Client for browser-side queries (fetching batch lists, public queries)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Privileged client for Serverless API Route Handlers (bypasses RLS for secure updates)
export const getSupabaseAdmin = () => {
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};