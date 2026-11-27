import { useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { Badge, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, PageHeader, type Column } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { AuditLog } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

function preview(value: unknown): string {
  if (value == null) return '—'
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text.length > 140 ? `${text.slice(0, 140)}…` : text
  } catch { return '—' }
}

export function AuditPage() {
  const [search, setSearch] = useState('')
  const { data: logs, loading, error, reload } = useAsync(() => api.listAudit(), [])

  const filtered = (logs ?? []).filter((log) => {
    const term = search.trim().toLowerCase()
    return !term || log.action.toLowerCase().includes(term) || (log.table_name ?? '').toLowerCase().includes(term) || (log.user_id ?? '').toLowerCase().includes(term)
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))

  const columns: Array<Column<AuditLog>> = [
    { key: 'date', label: 'Time', render: (log) => formatDateTime(log.created_at) },
    { key: 'action', label: 'Action', render: (log) => <Badge tone="blue">{log.action}</Badge> },
    { key: 'table', label: 'Table', render: (log) => log.table_name ?? '—' },
    { key: 'record', label: 'Record', render: (log) => log.record_id?.slice(0, 8) ?? '—' },
    { key: 'user', label: 'User', render: (log) => log.user_id?.slice(0, 8) ?? 'system' },
    { key: 'before', label: 'Before', render: (log) => <span className="block max-w-64 truncate text-xs text-slate-500" title={preview(log.old_data)}>{preview(log.old_data)}</span> },
    { key: 'after', label: 'After', render: (log) => <span className="block max-w-64 truncate text-xs text-slate-500" title={preview(log.new_data)}>{preview(log.new_data)}</span> },
  ]

  return (
    <>
      <PageHeader title="Audit Logs" description="Database triggers and privileged RPCs record sensitive changes" />
      <Card className="mb-5"><div className="p-4"><Field label="Search"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Action, table or user" /></div></Field></div></Card>
      <Card>
        <CardHeader title={`${filtered.length} audit entries`} subtitle="Newest first" />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
          <DataTable columns={columns} rows={filtered} rowKey={(log) => log.id} empty="No audit entries recorded." />
        )}
      </Card>
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-400"><ShieldCheck size={13} /> Audit logs are read-only from this application.</p>
    </>
  )
}
