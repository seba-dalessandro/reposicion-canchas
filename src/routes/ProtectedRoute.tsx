import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { isSupabaseConfigured } from '../lib/env'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { session, isLoading } = useAuth()

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-950 dark:bg-slate-950 dark:text-white">
        <div className="w-full max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <h1 className="text-lg font-semibold">Faltan variables de entorno</h1>
          <p className="mt-2 text-sm">
            Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local para iniciar la app.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}
