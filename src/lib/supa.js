// src/lib/supa.js
// Supabase client for real donor sign-in (email code, plus Apple and Google
// once those are configured). This is the one place the project talks to
// Supabase Auth.
//
// The anon key below is PUBLIC BY DESIGN. Supabase's anon key is meant to
// ship inside client-side apps - it only lets a visitor do what the sign-in
// screen already lets them do (ask for a login code, start a login). It is
// not a secret and is safe to see in this file or in the built app.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yeptifozaytoglfwxksz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';

// Lazy singleton - created on first use, not at module load, so importing
// this file never has side effects on its own (safe for build tooling and
// any future server-side rendering).
let client = null;

export function getSupabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
