import { createContext } from 'react'

export type Theme = 'light' | 'dark'

export type ThemeState = {
  theme: Theme
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeState | null>(null)
