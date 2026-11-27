import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translate, type Language, type StringKey } from '@/lib/i18n'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  toggle: () => void
  t: (key: StringKey) => string
}

const STORAGE_KEY = 'macintosh-pos-language'
const LanguageContext = createContext<LanguageContextValue | null>(null)

function initialLanguage(): Language {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'bn' ? 'bn' : 'en'
  } catch {
    return 'en'
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    try { window.localStorage.setItem(STORAGE_KEY, language) } catch { /* storage is optional */ }
  }, [language])

  const setLanguage = useCallback((next: Language) => setLanguageState(next), [])
  const toggle = useCallback(() => setLanguageState((current) => current === 'en' ? 'bn' : 'en'), [])
  const t = useCallback((key: StringKey) => translate(language, key), [language])

  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage, toggle, t }), [language, setLanguage, toggle, t])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')
  return context
}
