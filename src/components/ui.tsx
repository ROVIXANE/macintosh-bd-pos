import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react'
import { classNames } from '@/lib/utils'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={classNames('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>{children}</section>
}

export function CardHeader({ title, subtitle, description, action }: {
  title: string; subtitle?: string; description?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {(subtitle ?? description) && <p className="mt-0.5 text-xs text-slate-500">{subtitle ?? description}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, description, subtitle, actions }: {
  title: string; description?: string; subtitle?: string; actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {(description ?? subtitle) && <p className="mt-1 text-sm text-slate-500">{description ?? subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'secondary', size = 'md', loading = false, icon, children, className = '', disabled, type = 'button', ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 border border-brand-600',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-base' }
  return (
    <button
      type={type}
      className={classNames(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function Field({ label, hint, error, required = false, children, className = '' }: {
  label: string; hint?: string; error?: string | null; required?: boolean; children: ReactNode; className?: string
}) {
  return (
    <label className={classNames('block', className)}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  )
}

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 placeholder:text-slate-400 disabled:bg-slate-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={classNames(inputClass, className)} {...props} />
})

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classNames(inputClass, className)} {...props}>{children}</select>
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classNames(inputClass, 'min-h-20 resize-y', className)} {...props} />
}

export function Badge({ children, tone = 'slate' }: {
  children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'purple'
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
  }
  return <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 py-8" role="dialog" aria-modal="true" aria-label={title}>
      <div className={classNames('w-full rounded-xl bg-white shadow-2xl', widths[size])}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onClose, danger = true }: {
  open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void; danger?: boolean
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm" footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </>
    }>
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  )
}

export function EmptyState({ title, description, message, action }: {
  title: string; description?: string; message?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <Inbox size={32} className="mb-3 text-slate-300" />
      <p className="font-medium text-slate-700">{title}</p>
      {(description ?? message) && <p className="mt-1 max-w-md text-sm text-slate-500">{description ?? message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading records…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 size={18} className="animate-spin" /> {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">Unable to load data</p>
        <p className="mt-1 text-red-700">{message}</p>
      </div>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export interface Column<T> {
  key: string
  label: string
  render?: (row: T, index: number) => ReactNode
  className?: string
}

export function DataTable<T>({ columns, rows, rowKey, empty = 'No records found.', onRowClick, dense = false }: {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T, index: number) => string
  empty?: string
  onRowClick?: (row: T) => void
  dense?: boolean
}) {
  if (rows.length === 0) return <EmptyState title="Nothing here yet" description={empty} />
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column.key} className={classNames('whitespace-nowrap px-4 py-3 font-semibold', column.className)}>{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={classNames('transition-colors hover:bg-slate-50', onRowClick && 'cursor-pointer')}>
              {columns.map((column) => (
                <td key={column.key} className={classNames('px-4 text-slate-700', dense ? 'py-2' : 'py-3', column.className)}>
                  {column.render ? column.render(row, index) : String((row as Record<string, unknown>)[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StatCard({ label, value, icon, tone = 'blue', hint }: {
  label: string; value: string; icon: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' | 'purple'; hint?: string
}) {
  const tones = {
    blue: 'bg-blue-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xl font-bold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <span className={classNames('rounded-lg p-2', tones[tone])}>{icon}</span>
      </div>
    </Card>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
      {label}
    </label>
  )
}
