import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, PageHeader, Select, type Column } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Sale } from '@/lib/types'
import { downloadFile, errorMessage, formatDate, formatMoney, toCSV, toDateInput } from '@/lib/utils'

export function SalesPage() {
  const { settings } = useSettings()
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const { data: sales, loading, error, reload } = useAsync(() => api.listSales({ from, to, customer_id: customerId }), [from, to, customerId])
  const { data: customers } = useAsync(() => api.listCustomers(), [])

  function exportCSV() {
    if (!sales?.length) { toast.info('No sales to export'); return }
    downloadFile(`sales-${toDateInput(new Date())}.csv`, toCSV(sales.map((sale) => ({
      invoice: sale.invoice_number, date: sale.sale_date, customer: sale.customer?.name ?? 'Walk-in',
      cashier: sale.employee?.full_name ?? '', subtotal: sale.subtotal, discount: sale.discount,
      tax: sale.tax, delivery: sale.delivery, total: sale.total, paid: sale.paid, due: sale.due,
      status: sale.status,
    }))))
    toast.success(`Exported ${sales.length} sales`)
  }

  const columns: Array<Column<Sale>> = [
    { key: 'invoice', label: 'Invoice', render: (sale) => <Link to={`/invoices/${sale.id}`} className="flex items-center gap-1 font-medium text-brand-700 hover:underline"><FileText size={14} />{sale.invoice_number}</Link> },
    { key: 'date', label: 'Date', render: (sale) => formatDate(sale.sale_date) },
    { key: 'customer', label: 'Customer', render: (sale) => sale.customer?.name ?? 'Walk-in' },
    { key: 'cashier', label: 'Cashier', render: (sale) => sale.employee?.full_name ?? '—' },
    { key: 'total', label: 'Total', render: (sale) => <span className="font-semibold">{formatMoney(sale.total, settings.currency_symbol)}</span> },
    { key: 'paid', label: 'Paid', render: (sale) => formatMoney(sale.paid, settings.currency_symbol) },
    { key: 'due', label: 'Due', render: (sale) => sale.due > 0 ? <Badge tone="amber">{formatMoney(sale.due, settings.currency_symbol)}</Badge> : <Badge tone="green">Paid</Badge> },
    { key: 'status', label: 'Status', render: (sale) => <Badge tone={sale.status === 'completed' ? 'green' : sale.status === 'returned' ? 'purple' : 'red'}>{sale.status}</Badge> },
  ]

  return (
    <>
      <PageHeader title="Sales" description="Finalized invoices and outstanding customer dues" actions={<Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>} />
      <Card className="mb-5"><div className="flex flex-wrap gap-3 p-4">
        <Field label="Customer"><Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">All customers</option>{customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></Field>
        <Field label="From"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
      </div></Card>
      <Card>
        <CardHeader title={`${sales?.length ?? 0} invoices`} subtitle="Newest first · direct writes to sales are blocked by RLS" />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
          <DataTable columns={columns} rows={sales ?? []} rowKey={(sale) => sale.id} empty="No sales found for this filter." />
        )}
      </Card>
    </>
  )
}
