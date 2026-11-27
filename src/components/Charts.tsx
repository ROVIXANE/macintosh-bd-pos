import { formatMoney } from '@/lib/utils'

export function BarChart({ data, currency = '৳' }: { data: Array<{ label: string; value: number }>; currency?: string }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-slate-500">No data for this period.</p>
  const max = Math.max(...data.map((item) => Math.abs(item.value)), 1)
  return (
    <div className="flex h-56 items-end gap-1 overflow-x-auto pb-2">
      {data.map((item, index) => (
        <div key={`${item.label}-${index}`} className="group flex min-w-8 flex-1 flex-col items-center gap-2">
          <div className="relative flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-brand-500 transition-all group-hover:bg-brand-700"
              style={{ height: `${Math.max(3, (Math.abs(item.value) / max) * 100)}%` }}
              title={formatMoney(item.value, currency)}
            />
          </div>
          <span className="max-w-16 truncate text-[10px] text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
