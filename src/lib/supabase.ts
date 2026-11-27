import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && key && /^https?:\/\//.test(url))

export const configHint = isSupabaseConfigured
  ? 'Supabase credentials found. Check that the project is reachable and migrations are applied.'
  : 'Supabase is not configured. Copy .env.example to .env and add your project URL and publishable key.'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.')
  }
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'macintosh-bd-pos-auth' },
      global: { headers: { 'x-application-name': 'macintosh-bd-pos' } },
    })
  }
  return client
}

/** Separate non-persisting client for operations (e.g. employee sign-up) that must not touch the owner session. No service-role key is used. */
export function getEphemeralClient(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export type ConnectionState = 'checking' | 'connected' | 'unauthorized' | 'error' | 'not_configured'

/** Classify a PostgREST/auth error without leaking credentials. */
export function classifySupabaseError(message: string, code?: string): { state: ConnectionState; message: string } {
  const text = `${message} ${code ?? ''}`.toLowerCase()
  if (text.includes('jwt') || text.includes('auth') || text.includes('invalid api key') || code === '401') {
    return { state: 'unauthorized', message: 'Supabase rejected the publishable key. Verify the key and that RLS policies allow reads.' }
  }
  if (
    text.includes('relation') || text.includes('does not exist') || text.includes('could not find the table') ||
    text.includes('schema cache') || code === '42P01' || code === 'PGRST204' || code === 'PGRST205'
  ) {
    return { state: 'error', message: 'Supabase is reachable, but the database schema is missing. Apply the SQL migrations.' }
  }
  return { state: 'error', message: `Supabase connection failed: ${message}` }
}

export async function checkConnection(): Promise<{ state: ConnectionState; message: string }> {
  if (!isSupabaseConfigured) return { state: 'not_configured', message: configHint }
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('store_settings').select('id').limit(1)
    if (!error) return { state: 'connected', message: 'Connected to Supabase.' }
    return classifySupabaseError(error.message, error.code)
  } catch (error) {
    return { state: 'error', message: error instanceof Error ? error.message : 'Supabase connection failed.' }
  }
}
