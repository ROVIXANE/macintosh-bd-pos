import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, Pencil, Search, Trash2, UserPlus } from 'lucide-react'
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Textarea, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Customer } from '@/lib/types'
import { downloadFile, errorMessage, formatDate, formatMoney, toCSV, toDateInput } from '@/lib/utils'
import { firstError, required, runValidators, validEmail, validPhone } from '@/lib/validation'

function emptyCustomer(): Partial<Customer> {
  return { name: '', phone: '', email: null, address: null, notes: null, credit_limit: 0 }
}

export function CustomersPage() {
  const { can } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Customer> | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const { data: customers, loading, error, reload } = useAsync(() => api.listCustomers(), [])

  async function save() {
    if (!editing) return
    const nextErrors = { name: required('Name')(editing.name), phone: runValidators(editing.phone ?? '', [validPhone]), email: runValidators(editing.email ?? '', [validEmail]) }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      await api.saveCustomer({ ...editing, phone: editing.phone || null })
      toast.success(editing.id ? 'Customer updated' : 'Customer added'); setEditing(null); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api.deleteCustomer(deleting.id); toast.success('Customer deleted'); setDeleting(null); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  function exportCSV() {
    if (!customers?.length) { toast.info('No customers to export'); return }
    downloadFile(`customers-${toDateInput(new Date())}.csv`, toCSV(customers.map((c) => ({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '', created: c.created_at }))))
  }

  const filtered = (customers ?? []).filter((c) => {
    const term = search.trim().toLowerCase()
    return !term || c.name.toLowerCase().includes(term) || (c.phone ?? '').includes(term) || (c.email ?? '').toLowerCase().includes(term)
  })

  const columns: Array<Column<Customer>> = [
    { key: 'name', label: 'Customer', render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'phone', label: 'Phone', render: (c) => c.phone ?? '—' },
    { key: 'email', label: 'Email', render: (c) => c.email ?? '—' },
    { key: 'address', label: 'Address', render: (c) => c.address ?? '—' },
    { key: 'created', label: 'Added', render: (c) => formatDate(c.created_at) },
    { key: 'actions', label: '', className: 'text-right', render: (c) => <div className="flex justify-end gap-1">
      <Link to={`/customers/${c.id}`}><Button size="sm" variant="ghost" aria-label="Customer history"><Eye size={15} /></Button></Link>
      {can('customers.edit') && <Button size="sm" variant="ghost" onClick={() => { setErrors({}); setEditing({ ...c }) }} aria-label="Edit customer"><Pencil size={15} /></Button>}
      {can('customers.delete') && <Button size="sm" variant="ghost" onClick={() => setDeleting(c)} aria-label="Delete customer"><Trash2 size={15} className="text-red-500" /></Button>}
    </div> },
  ]

  return (
    <>
      <PageHeader title="Customers" description="Customer profiles and purchase history" actions={
        <><Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>
          {can('customers.create') && <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => { setErrors({}); setEditing(emptyCustomer()) }}>Add customer</Button>}</>
      } />
      <Card className="mb-5"><div className="p-4"><Field label="Search"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone or email" /></div></Field></div></Card>
      <Card>
        <CardHeader title={`${filtered.length} customers`} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : <DataTable columns={columns} rows={filtered} rowKey={(c) => c.id} empty="No customers added yet." />}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit customer' : 'Add customer'} footer={
        <><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save customer</Button></>
      }>
        {editing && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="Phone" hint="Bangladesh mobile number" error={errors.phone}><Input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
          <Field label="Email" error={errors.email}><Input type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value || null })} /></Field>
          <Field label="Credit limit"><Input type="number" min="0" step="0.01" value={editing.credit_limit ?? 0} onChange={(e) => setEditing({ ...editing, credit_limit: Number(e.target.value) })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value || null })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} /></Field>
        </div>}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete customer?" message={`${deleting?.name ?? ''} will be removed. Historical invoices keep their customer snapshot where available.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
    </>
  )
}

export function CustomerHistoryPage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const { data, loading, error, reload } = useAsync(() => api.getCustomerHistory(id ?? ''), [id])
  if (loading) return <LoadingState label="Loading customer history…" />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (!data) return null
  return (
    <>
      <PageHeader title={data.customer.name} description={`${data.customer.phone ?? 'No phone'} · ${data.customer.email ?? 'No email'}`} actions={<Link to="/customers"><Button icon={<ArrowLeft size={16} />}>Back to customers</Button></Link>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Invoices</p><p className="text-xl font-bold">{data.sales.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total purchases</p><p className="text-xl font-bold">{formatMoney(data.sales.reduce((sum, sale) => sum + Number(sale.total), 0), settings.currency_symbol)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Open dues</p><p className="text-xl font-bold text-amber-600">{formatMoney(data.sales.reduce((sum, sale) => sum + Number(sale.due), 0), settings.currency_symbol)}</p></Card>
      </div>
      <Card>
        <CardHeader title="Purchase history" />
        <DataTable columns={[
          { key: 'invoice', label: 'Invoice', render: (sale) => <Link className="text-brand-600 hover:underline" to={`/invoices/${sale.id}`}>{sale.invoice_number}</Link> },
          { key: 'date', label: 'Date', render: (sale) => formatDate(sale.sale_date) },
          { key: 'total', label: 'Total', render: (sale) => formatMoney(sale.total, settings.currency_symbol) },
          { key: 'due', label: 'Due', render: (sale) => sale.due > 0 ? <Badge tone="amber">{formatMoney(sale.due, settings.currency_symbol)}</Badge> : <Badge tone="green">Paid</Badge> },
        ]} rows={data.sales} rowKey={(sale) => sale.id} empty="This customer has no invoices." />
      </Card>
      {data.returns.length > 0 && <Card className="mt-5"><CardHeader title="Returns" /><DataTable columns={[
        { key: 'id', label: 'Return', render: (r) => r.id.slice(0, 8) },
        { key: 'reason', label: 'Reason', render: (r) => r.reason },
        { key: 'refund', label: 'Refund', render: (r) => formatMoney(r.refund_amount, settings.currency_symbol) },
      ]} rows={data.returns} rowKey={(r) => r.id} /></Card>}
    </>
  )
}
