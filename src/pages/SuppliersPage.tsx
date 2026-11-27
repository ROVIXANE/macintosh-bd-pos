import { useState } from 'react'
import { Download, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Textarea, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Supplier } from '@/lib/types'
import { downloadFile, errorMessage, formatDate, formatMoney, toCSV, toDateInput } from '@/lib/utils'
import { firstError, required, runValidators, validEmail, validPhone } from '@/lib/validation'

function emptySupplier(): Partial<Supplier> {
  return { name: '', company: null, phone: '', email: null, address: null, notes: null }
}

export function SuppliersPage() {
  const { can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)
  const [paying, setPaying] = useState<Supplier | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const { data: suppliers, loading, error, reload } = useAsync(() => api.listSuppliers(), [])
  const { data: purchases } = useAsync(() => api.listPurchases(), [])

  async function save() {
    if (!editing) return
    const nextErrors = { name: required('Name')(editing.name), phone: runValidators(editing.phone ?? '', [validPhone]), email: runValidators(editing.email ?? '', [validEmail]) }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      await api.saveSupplier({ ...editing, phone: editing.phone || null })
      toast.success(editing.id ? 'Supplier updated' : 'Supplier added'); setEditing(null); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api.deleteSupplier(deleting.id); toast.success('Supplier deleted'); setDeleting(null); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function pay() {
    if (!paying || !(Number(paymentAmount) > 0)) { toast.error('Enter a payment amount'); return }
    setBusy(true)
    try {
      await api.addSupplierPayment({ supplier_id: paying.id, amount: Number(paymentAmount), method: 'cash', reference: paymentReference || null })
      toast.success('Supplier payment recorded'); setPaying(null); setPaymentAmount(''); setPaymentReference('')
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  function exportCSV() {
    if (!suppliers?.length) { toast.info('No suppliers to export'); return }
    downloadFile(`suppliers-${toDateInput(new Date())}.csv`, toCSV(suppliers.map((s) => ({ name: s.name, company: s.company ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '' }))))
  }

  const columns: Array<Column<Supplier>> = [
    { key: 'name', label: 'Supplier', render: (s) => <div><p className="font-medium">{s.name}</p><p className="text-xs text-slate-500">{s.company ?? ''}</p></div> },
    { key: 'phone', label: 'Phone', render: (s) => s.phone ?? '—' },
    { key: 'email', label: 'Email', render: (s) => s.email ?? '—' },
    { key: 'purchases', label: 'Purchases', render: (s) => (purchases ?? []).filter((p) => p.supplier_id === s.id).length },
    { key: 'due', label: 'Due', render: (s) => {
      const due = (purchases ?? []).filter((p) => p.supplier_id === s.id).reduce((sum, p) => sum + Number(p.due), 0)
      return due > 0 ? <Badge tone="amber">{formatMoney(due, settings.currency_symbol)}</Badge> : <Badge tone="green">Clear</Badge>
    } },
    { key: 'created', label: 'Added', render: (s) => formatDate(s.created_at) },
    { key: 'actions', label: '', className: 'text-right', render: (s) => <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => { setPaying(s); setPaymentAmount(''); setPaymentReference('') }} aria-label="Record supplier payment"><Wallet size={15} /></Button>
      {can('suppliers.edit') && <Button size="sm" variant="ghost" onClick={() => { setErrors({}); setEditing({ ...s }) }} aria-label="Edit supplier"><Pencil size={15} /></Button>}
      {can('suppliers.edit') && <Button size="sm" variant="ghost" onClick={() => setDeleting(s)} aria-label="Delete supplier"><Trash2 size={15} className="text-red-500" /></Button>}
    </div> },
  ]

  return (
    <>
      <PageHeader title="Suppliers" description="Vendors, purchase history and outstanding balances" actions={
        <><Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>
          {can('suppliers.create') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setErrors({}); setEditing(emptySupplier()) }}>Add supplier</Button>}</>
      } />
      <Card>
        <CardHeader title={`${suppliers?.length ?? 0} suppliers`} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : <DataTable columns={columns} rows={suppliers ?? []} rowKey={(s) => s.id} empty="No suppliers added yet." />}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit supplier' : 'Add supplier'} footer={
        <><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save supplier</Button></>
      }>
        {editing && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="Company"><Input value={editing.company ?? ''} onChange={(e) => setEditing({ ...editing, company: e.target.value || null })} /></Field>
          <Field label="Phone" error={errors.phone}><Input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value || null })} /></Field>
          <Field label="Email" error={errors.email}><Input type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value || null })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value || null })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} /></Field>
        </div>}
      </Modal>

      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title={`Pay ${paying?.name ?? 'supplier'}`} size="sm" footer={
        <><Button onClick={() => setPaying(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void pay()}>Record payment</Button></>
      }>
        <div className="space-y-4">
          <Field label="Amount" required><Input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></Field>
          <Field label="Reference"><Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></Field>
        </div>
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete supplier?" message={`${deleting?.name ?? ''} will be removed. Purchase history remains intact.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
    </>
  )
}
