import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer, Search } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, PageHeader, Select } from '@/components/ui'
import { InvoiceSheet } from '@/components/InvoicePrint'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Sale } from '@/lib/types'
import { downloadFile, formatDate, formatMoney, toCSV, toDateInput } from '@/lib/utils'

export function InvoicesPage() {
  const { settings } = useSettings()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const { data: sales, loading, error, reload } = useAsync(() => api.listSales({ customer_id: customerId }), [customerId])
  const { data: customers } = useAsync(() => api.listCustomers(), [])

  const filtered = (sales ?? []).filter((sale) => {
    const term = search.trim().toLowerCase()
    return !term || sale.invoice_number.toLowerCase().includes(term) || (sale.customer?.name ?? '').toLowerCase().includes(term)
  })

  function exportCSV() {
    if (!filtered.length) { toast.info('No invoices to export'); return }
    downloadFile(`invoices-${toDateInput(new Date())}.csv`, toCSV(filtered.map((sale) => ({
      invoice: sale.invoice_number, date: sale.sale_date, customer: sale.customer?.name ?? 'Walk-in',
      total: sale.total, paid: sale.paid, due: sale.due,
    }))))
  }

  return (
    <>
      <PageHeader title="Invoices" description="View and print finalized invoices" actions={<Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>} />
      <Card className="mb-5"><div className="flex flex-wrap gap-3 p-4">
        <Field label="Search invoice"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice number or customer" /></div></Field>
        <Field label="Customer"><Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">All customers</option>{customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></Field>
      </div></Card>
      <Card>
        <CardHeader title={`${filtered.length} invoices`} subtitle={`Print layout: ${settings.invoice_layout ?? 'a4'}`} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
          <DataTable columns={[
            { key: 'invoice', label: 'Invoice', render: (sale: Sale) => <Link className="font-medium text-brand-700 hover:underline" to={`/invoices/${sale.id}`}>{sale.invoice_number}</Link> },
            { key: 'date', label: 'Date', render: (sale: Sale) => formatDate(sale.sale_date) },
            { key: 'customer', label: 'Customer', render: (sale: Sale) => sale.customer?.name ?? 'Walk-in' },
            { key: 'total', label: 'Total', render: (sale: Sale) => formatMoney(sale.total, settings.currency_symbol) },
            { key: 'due', label: 'Due', render: (sale: Sale) => sale.due > 0 ? formatMoney(sale.due, settings.currency_symbol) : '—' },
            { key: 'print', label: '', className: 'text-right', render: (sale: Sale) => <Link to={`/invoices/${sale.id}`}><Button size="sm" icon={<Printer size={14} />}>Print</Button></Link> },
          ]} rows={filtered} rowKey={(sale) => sale.id} empty="No invoices found." />
        )}
      </Card>
    </>
  )
}

export function InvoiceDetailPage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const { data: sale, loading, error, reload } = useAsync(() => api.getSale(id ?? ''), [id])

  if (loading) return <LoadingState label="Loading invoice…" />
  if (error) return <Card><ErrorState message={error} onRetry={() => void reload()} /></Card>
  if (!sale) return null

  const layout = settings.invoice_layout === '80mm' || settings.invoice_layout === '58mm' ? settings.invoice_layout : 'a4'

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{sale.invoice_number}</h1>
          <p className="mt-1 text-sm text-slate-500">Finalized invoice · {formatDate(sale.sale_date)} · {sale.customer?.name ?? 'Walk-in customer'}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/invoices"><Button icon={<ArrowLeft size={16} />}>Back</Button></Link>
          <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>Print / Save PDF</Button>
        </div>
      </div>
      <Card className="no-print mb-5 grid gap-4 p-4 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-slate-500">Subtotal</p><p className="font-semibold">{formatMoney(sale.subtotal, settings.currency_symbol)}</p></div>
        <div><p className="text-xs text-slate-500">Discount / Tax</p><p className="font-semibold">{formatMoney(sale.discount, settings.currency_symbol)} / {formatMoney(sale.tax, settings.currency_symbol)}</p></div>
        <div><p className="text-xs text-slate-500">Total</p><p className="font-semibold">{formatMoney(sale.total, settings.currency_symbol)}</p></div>
        <div><p className="text-xs text-slate-500">Due</p><p className="font-semibold text-amber-700">{formatMoney(sale.due, settings.currency_symbol)}</p></div>
      </Card>
      <Card className="p-2 sm:p-6"><InvoiceSheet sale={sale} settings={settings} layout={layout} /></Card>
    </>
  )
}
