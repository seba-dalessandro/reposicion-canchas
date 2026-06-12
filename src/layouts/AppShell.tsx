import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { useTheme } from '../features/theme/useTheme'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/reposiciones', label: 'Reposiciones', icon: ClipboardList },
  { to: '/maestros', label: 'Maestros', icon: Database },
  { to: '/usuarios', label: 'Usuarios', icon: Users },
]

export function AppShell() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-white transition-transform lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-700 text-sm font-bold text-white">
            RC
          </div>
          <div className="ml-3 min-w-0">
            <p className="truncate text-sm font-semibold">Reposicion</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">Picking operativo</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setIsSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                  isActive && 'bg-teal-50 text-teal-800 dark:bg-teal-400/10 dark:text-teal-200',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {isSidebarOpen ? (
        <button
          className="fixed inset-0 z-20 bg-slate-950/40 lg:hidden"
          type="button"
          aria-label="Cerrar menu"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 lg:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              aria-label="Abrir menu"
              title="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-sm font-semibold">{profile?.full_name ?? profile?.email ?? 'Usuario'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.role ?? 'Sin perfil'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Cambiar tema"
              title="Cambiar tema"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Cerrar sesion"
              title="Cerrar sesion"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
