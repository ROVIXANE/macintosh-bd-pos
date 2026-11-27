import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { DEFAULT_SETTINGS, errorMessage } from '@/lib/utils'
import type { StoreSettings } from '@/lib/types'

type EffectiveSettings = typeof DEFAULT_SETTINGS & Partial<StoreSettings>

interface SettingsContextValue {
  settings: EffectiveSettings
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EffectiveSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!api.isConfigured()) { setLoading(false); return }
    try {
      const remote = await api.getSettings()
      setSettings({ ...DEFAULT_SETTINGS, ...remote })
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo(() => ({ settings, loading, error, refresh }), [settings, loading, error, refresh])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside SettingsProvider')
  return context
}
