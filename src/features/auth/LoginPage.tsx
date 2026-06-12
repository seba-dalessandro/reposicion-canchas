import { type FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LockKeyhole, Moon, Sun } from 'lucide-react'
import { useAuth } from './useAuth'
import { useTheme } from '../theme/useTheme'
import { env, isSupabaseConfigured } from '../../lib/env'

type LocationState = {
  from?: { pathname?: string }
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, signIn } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? '/'

  if (session) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signIn(email.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesion.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-50 text-slate-950 lg:grid-cols-[1fr_520px] dark:bg-slate-950 dark:text-white">
      <section className="hidden bg-[linear-gradient(145deg,#0f766e,#1f2937_48%,#7f1d1d)] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white/15">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="mt-8 max-w-xl text-4xl font-semibold tracking-normal">{env.appName}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-100">
            Registro seguro de reposiciones de canchas de picking, con roles, auditoria operativa y RLS desde la base.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm text-slate-100">
          <div className="rounded-md border border-white/15 bg-white/10 p-4">
            <strong className="block text-white">Supabase Auth</strong>
            Sesion persistente
          </div>
          <div className="rounded-md border border-white/15 bg-white/10 p-4">
            <strong className="block text-white">RLS</strong>
            Permisos por rol
          </div>
          <div className="rounded-md border border-white/15 bg-white/10 p-4">
            <strong className="block text-white">Vercel</strong>
            Build estatico
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700 dark:text-teal-300">{env.appName}</p>
              <h2 className="mt-1 text-2xl font-semibold">Iniciar sesion</h2>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Cambiar tema"
              title="Cambiar tema"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>

          {!isSupabaseConfigured ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY antes de iniciar sesion.
            </div>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium">
              Email
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none ring-teal-600 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Contrasena
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none ring-teal-600 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !isSupabaseConfigured}
              className="h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
