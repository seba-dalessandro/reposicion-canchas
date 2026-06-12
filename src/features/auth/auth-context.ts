import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Database } from '../../types/database'

export type Profile = Database['public']['Tables']['profiles']['Row']

export type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
