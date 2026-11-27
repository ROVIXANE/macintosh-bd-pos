import { useState } from 'react'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { ProductSerial, SerialStatus } from '@/lib/types'
import { downloadFile, errorMessage, formatDate, formatMoney, toCSV, toDateInput } from '@/lib/utils'

const STATUSES: SerialStatus[] = ['in_stock', 'reserved', 'sold', 'returned', 'repair', 'defective']

function emptySerial(): Partial<ProductSerial> {
  return { serial_number: '', product_id: '', status: 'in_stock', condition: 'new', purchase_price: 0, warranty_months: 12, location: '', notes: '' }
}

export function SerialsPage() {
  const { can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [editing, setEditing] = useState<Partial<ProductSerial> | null>(null)
  const [deleting, setDeleting] = useState<ProductSerial | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const { data: serials, loading, error, reload } = useAsync(() => api.listSerials(), [])
  const { data: products } = useAsync(() => api.listProducts(), [])

  async function save() {
    if (!editing?.serial_number?.trim() || !editing.product_id) { toast.error('Serial number and product are required'); return }
    setBusy(true)
    try {
      await api.saveSerial({ ...editing, serial_number: editing.serial_number.trim(), purchase_date: editing.purchase_date || null })
      toast.success('Serial saved'); setEditing(null); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api.deleteSerial(deleting.id); toast.success('Serial deleted'); setDeleting(null); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  function exportCSV() {
    if (!serials?.length) { toast.info('No serials to export'); return }
    downloadFile(`serials-${toDateInput(new Date())}.csv`, toCSV(serials.map((s) => ({
      serial: s.serial_number, product: s.product?.name ?? '', status: s.status,
      purchase_price: s.purchase_price ?? 0, purchase_date: s.purchase_date ?? '',
      warranty_expiry: s.warranty_expiry ?? '', location: s.location ?? '', notes: s.notes ?? '',
    }))))
  }

  const filtered = (serials ?? []).filter((serial) => {
    const term = search.trim().toLowerCase()
    return (!term || serial.serial_number.toLowerCase().includes(term) || (serial.product?.name ?? '').toLowerCase().includes(term)) && (!status || serial.status === status)
  })

  const columns: Array<Column<ProductSerial>> = [
    { key: 'serial', label: 'Serial number', render: (s) => <span className="font-medium">{s.serial_number}</span> },
    { key: 'product', label: 'Product', render: (s) => s.product?.name ?? s.product_id.slice(0, 8) },
    { key: 'status', label: 'Status', render: (s) => <Badge tone={s.status === 'in_stock' ? 'green' : s.status === 'sold' ? 'blue' : s.status === 'defective' || s.status === 'repair' ? 'red' : 'amber'}>{s.status.replace('_', ' ')}</Badge> },
    { key: 'purchase', label: 'Purchase', render: (s) => <div><p>{formatMoney(s.purchase_price ?? 0, settings.currency_symbol)}</p><p className="text-xs text-slate-500">{formatDate(s.purchase_date)}</p></div> },
    { key: 'warranty', label: 'Warranty expiry', render: (s) => formatDate(s.warranty_expiry) },
    { key: 'location', label: 'Location', render: (s) => s.location ?? '—' },
    { key: 'actions', label: '', className: 'text-right', render: (s) => <div className="flex justify-end gap-1">
      {can('serials.manage') && <Button size="sm" variant="ghost" onClick={() => setEditing({ ...s })} aria-label="Edit serial"><Pencil size={15} /></Button>}
      {can('serials.manage') && <Button size="sm" variant="ghost" onClick={() => setDeleting(s)} aria-label="Delete serial"><Trash2 size={15} className="text-red-500" /></Button>}
    </div> },
  ]

  return (
    <>
      <PageHeader title="Serial Numbers" description="Track individual units, warranty dates and condition" actions={
        <><Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>
          {can('serials.manage') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing(emptySerial())}>Add serial</Button>}</>
      } />
      <Card className="mb-5"><div className="flex flex-wrap gap-3 p-4">
        <Field label="Search"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Serial or product" /></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</Select></Field>
      </div></Card>
      <Card>
        <CardHeader title={`${filtered.length} serial numbers`} subtitle="New units are normally created by purchases" />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : <DataTable columns={columns} rows={filtered} rowKey={(s) => s.id} empty="No serial numbers recorded." />}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit serial' : 'Add serial'} footer={
        <><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save serial</Button></>
      }>
        {editing && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Serial number" required><Input value={editing.serial_number ?? ''} onChange={(e) => setEditing({ ...editing, serial_number: e.target.value })} /></Field>
          <Field label="Product" required><Select value={editing.product_id ?? ''} onChange={(e) => setEditing({ ...editing, product_id: e.target.value })}><option value="">Select product</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Status"><Select value={editing.status ?? 'in_stock'} onChange={(e) => setEditing({ ...editing, status: e.target.value as SerialStatus })}>{STATUSES.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</Select></Field>
          <Field label="Condition"><Select value={editing.condition ?? 'new'} onChange={(e) => setEditing({ ...editing, condition: e.target.value as ProductSerial['condition'] })}>{['new', 'used', 'refurbished'].map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
          <Field label="Purchase price"><Input type="number" min="0" step="0.01" value={editing.purchase_price ?? 0} onChange={(e) => setEditing({ ...editing, purchase_price: Number(e.target.value) })} /></Field>
          <Field label="Purchase date"><Input type="date" value={editing.purchase_date ?? ''} onChange={(e) => setEditing({ ...editing, purchase_date: e.target.value })} /></Field>
          <Field label="Warranty (months)"><Input type="number" min="0" value={editing.warranty_months ?? 0} onChange={(e) => setEditing({ ...editing, warranty_months: Number(e.target.value) })} /></Field>
          <Field label="Location"><Input value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value || null })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} /></Field>
        </div>}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete serial?" message={`${deleting?.serial_number ?? ''} will be permanently removed. This does not change product stock.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
    </>
  )
}
