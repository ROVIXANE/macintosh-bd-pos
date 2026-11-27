import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { classNames } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, kind, message }])
    // Browser-only timers; no critical state depends on them.
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000)
  }, [])

  const value = useMemo<ToastContextValue>(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info
          return (
            <div key={toast.id} className={classNames(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg',
              toast.kind === 'success' ? 'border-emerald-200' : toast.kind === 'error' ? 'border-red-200' : 'border-blue-200',
            )}>
              <Icon size={18} className={toast.kind === 'success' ? 'text-emerald-600' : toast.kind === 'error' ? 'text-red-600' : 'text-blue-600'} />
              <p className="flex-1 text-sm text-slate-700">{toast.message}</p>
              <button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss notification" className="text-slate-400 hover:text-slate-700">
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
