import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client. Uses the anon key by default; swap for the
 * service-role key inside trusted server contexts (route loaders that
 * need to bypass RLS) and pair with row-level policies in your Postgres
 * schema.
 *
 * The server reads SUPABASE_URL / SUPABASE_ANON_KEY from `process.env`.
 * For the browser bundle, expose the SAME values via `publicEnv()` so
 * client-side fetch / realtime subscriptions can connect.
 */
export const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_ANON_KEY ?? '',
  { auth: { persistSession: false, detectSessionInUrl: false } },
)
