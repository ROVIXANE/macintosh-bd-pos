import { describe, expect, it } from 'vitest'
import { classifySupabaseError } from './supabase'

describe('classifySupabaseError', () => {
  it('maps invalid API key to unauthorized', () => {
    expect(classifySupabaseError('Invalid API key').state).toBe('unauthorized')
    expect(classifySupabaseError('JWT expired').state).toBe('unauthorized')
    expect(classifySupabaseError('boom', '401').state).toBe('unauthorized')
  })

  it('maps missing schema variants to schema-missing error', () => {
    const schemaMsg = 'Supabase is reachable, but the database schema is missing. Apply the SQL migrations.'
    expect(classifySupabaseError('relation "public.store_settings" does not exist', '42P01').message).toBe(schemaMsg)
    expect(classifySupabaseError("Could not find the table 'public.store_settings' in the schema cache", 'PGRST205').message).toBe(schemaMsg)
    expect(classifySupabaseError('missing', 'PGRST204').message).toBe(schemaMsg)
    expect(classifySupabaseError('missing').state).toBe('error')
  })

  it('falls back to a generic error without echoing credentials', () => {
    const result = classifySupabaseError('some other failure')
    expect(result.state).toBe('error')
    expect(result.message).toContain('some other failure')
  })
})
