import { useState } from 'react'
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, Textarea, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Customer, ProductSerial, WarrantyClaim } from '@/lib/types'
import { errorMessage, formatDate, formatMoney, todayInput } from '@/lib/utils'

function emptyClaim(): Partial<WarrantyClaim> {
  return { serial_id: null, product_id: '', customer_id: null, sale_id: null, claim_date: todayInput(), issue: '', status: 'open', resolution: null, repair_cost: 0 }
}

export function WarrantyPage() {
  const { can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [editing, setEditing] = useState<Partial<WarrantyClaim> | null>(null)
  const [deleting, setDeleting] = useState<WarrantyClaim | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const { data: claims, loading, error, reload } = useAsync(() => api.listClaims(), [])
  const { data: products } = useAsync(() => api.listProducts(), [])
  const { data: customers } = useAsync(() => api.listCustomers(), [])
  const { data: serials } = useAsync(() => api.listSerials(), [])
  const { data: sales } = useAsync(() => api.listSales(), [])

  async function save() {
    if (!editing?.product_id || !editing.issue?.trim()) { toast.error('Product and issue are required'); return }
    setBusy(true)
    try {
      await api.saveClaim({
        ...editing,
        serial_id: editing.serial_id || null,
        customer_id: editing.customer_id || null,
        sale_id: editing.sale_id || null,
        repair_cost: Number(editing.repair_cost) || 0,
      })
      toast.success('Warranty claim saved'); setEditing(null); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api.deleteClaim(deleting.id); toast.success('Claim deleted'); setDeleting(null); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  const filtered = (claims ?? []).filter((claim) => {
    const term = search.trim().toLowerCase()
    return (!term || claim.issue.toLowerCase().includes(term) || (claim.product?.name ?? '').toLowerCase().includes(term) || (claim.serial?.serial_number ?? '').toLowerCase().includes(term))
      && (!status || claim.status === status)
  })

  const columns: Array<Column<WarrantyClaim>> = [
    { key: 'id', label: 'Claim', render: (claim) => <span className="font-medium">{claim.id.slice(0, 8)}</span> },
    { key: 'product', label: 'Product / serial', render: (claim) => <div><p>{claim.product?.name ?? claim.product_id.slice(0, 8)}</p><p className="text-xs text-slate-500">{claim.serial?.serial_number ?? 'No serial'}</p></div> },
    { key: 'customer', label: 'Customer', render: (claim) => claim.customer?.name ?? 'Walk-in' },
    { key: 'issue', label: 'Issue', render: (claim) => <span className="line-clamp-2">{claim.issue}</span> },
    { key: 'date', label: 'Claim date', render: (claim) => formatDate(claim.claim_date) },
    { key: 'cost', label: 'Repair cost', render: (claim) => formatMoney(claim.repair_cost, settings.currency_symbol) },
    { key: 'status', label: 'Status', render: (claim) => <Badge tone={claim.status === 'resolved' ? 'green' : claim.status === 'rejected' ? 'red' : claim.status === 'in_progress' ? 'blue' : 'amber'}>{claim.status.replace('_', ' ')}</Badge> },
    { key: 'actions', label: '', className: 'text-right', render: (claim) => can('warranty.manage') ? <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditing({ ...claim })} aria-label="Edit claim"><Pencil size={15} /></Button>
      <Button size="sm" variant="ghost" onClick={() => setDeleting(claim)} aria-label="Delete claim"><Trash2 size={15} className="text-red-500" /></Button>
    </div> : null },
  ]

  return (
    <>
      <PageHeader title="Warranty & Repairs" description="Track serial-linked warranty claims and repair costs" actions={
        can('warranty.manage') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing(emptyClaim())}>New claim</Button>
      } />
      <Card className="mb-5"><div className="flex flex-wrap gap-3 p-4">
        <Field label="Search"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Issue, product or serial" /></Field>
        <Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['open', 'in_progress', 'resolved', 'rejected'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</Select></Field>
      </div></Card>
      <Card>
        <CardHeader title={`${filtered.length} warranty claims`} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
          <DataTable columns={columns} rows={filtered} rowKey={(claim) => claim.id} empty="No warranty claims recorded." />
        )}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit warranty claim' : 'New warranty claim'} size="lg" footer={
        <><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save claim</Button></>
      }>
        {editing && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product" required><Select value={editing.product_id ?? ''} onChange={(event) => setEditing({ ...editing, product_id: event.target.value })}><option value="">Select product</option>{products?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</Select></Field>
          <Field label="Serial number"><Select value={editing.serial_id ?? ''} onChange={(event) => setEditing({ ...editing, serial_id: event.target.value || null })}><option value="">No serial</option>{(serials as ProductSerial[] | undefined)?.map((serial) => <option key={serial.id} value={serial.id}>{serial.serial_number}</option>)}</Select></Field>
          <Field label="Customer"><Select value={editing.customer_id ?? ''} onChange={(event) => setEditing({ ...editing, customer_id: event.target.value || null })}><option value="">Walk-in</option>{(customers as Customer[] | undefined)?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></Field>
          <Field label="Original invoice"><Select value={editing.sale_id ?? ''} onChange={(event) => setEditing({ ...editing, sale_id: event.target.value || null })}><option value="">None</option>{(sales ?? []).map((sale) => <option key={sale.id} value={sale.id}>{sale.invoice_number}</option>)}</Select></Field>
          <Field label="Claim date"><Input type="date" value={editing.claim_date ?? ''} onChange={(event) => setEditing({ ...editing, claim_date: event.target.value })} /></Field>
          <Field label="Status"><Select value={editing.status ?? 'open'} onChange={(event) => setEditing({ ...editing, status: event.target.value as WarrantyClaim['status'] })}>{['open', 'in_progress', 'resolved', 'rejected'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</Select></Field>
          <Field label="Repair cost"><Input type="number" min="0" step="0.01" value={editing.repair_cost ?? 0} onChange={(event) => setEditing({ ...editing, repair_cost: Number(event.target.value) })} /></Field>
          <Field label="Issue" className="sm:col-span-2" required><Textarea value={editing.issue ?? ''} onChange={(event) => setEditing({ ...editing, issue: event.target.value })} /></Field>
          <Field label="Resolution" className="sm:col-span-2"><Textarea value={editing.resolution ?? ''} onChange={(event) => setEditing({ ...editing, resolution: event.target.value || null })} /></Field>
        </div>}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete warranty claim?" message={`${deleting?.issue ?? ''} will be permanently removed.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-400"><Wrench size={13} /> Claims use database-backed records; no demo data is shown.</p>
    </>
  )
}
