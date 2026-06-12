import { createClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from './env'
import type { Database } from '../types/database'

const fallbackSupabaseUrl = 'https://not-configured.supabase.co'
const fallbackSupabaseAnonKey = 'not-configured'

export const supabase = createClient<Database>(
  isSupabaseConfigured ? env.supabaseUrl : fallbackSupabaseUrl,
  isSupabaseConfigured ? env.supabaseAnonKey : fallbackSupabaseAnonKey,
  {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  },
)
