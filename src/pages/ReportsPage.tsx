import { useState } from 'react'
import { Download, FileBarChart } from 'lucide-react'
import { BarChart } from '@/components/Charts'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, PageHeader, StatCard, type Column } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { downloadFile, formatMoney, formatNumber, monthInput, toCSV, toDateInput } from '@/lib/utils'

type Row = Record<string, unknown>
const number = (value: unknown) => Number(value ?? 0)
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value as Row[] : [])
const text = (value: unknown) => String(value ?? '—')

export function ReportsPage() {
  const { settings } = useSettings()
  const toast = useToast()
  const initial = monthInput()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const { data, loading, error, reload } = useAsync(async () => {
    const [sales, inventory] = await Promise.all([api.salesReport(from, to), api.inventoryReport()])
    return { sales, inventory }
  }, [from, to])

  if (loading) return <LoadingState label="Calculating reports from database records…" />
  if (error) return <><PageHeader title="Reports" /><Card><ErrorState message={error} onRetry={() => void reload()} /></Card></>
  if (!data) return null

  const daily = rows(data.sales.daily_totals)
  const topProducts = rows(data.sales.top_products)
  const categories = rows(data.sales.category_totals)
  const employees = rows(data.sales.employee_totals)
  const movements = rows(data.inventory.movement_summary)
  const profitAllowed = data.sales.profit_allowed === true
  const totalSales = daily.reduce((sum, day) => sum + number(day.total), 0)

  function exportDaily() {
    if (!daily.length) { toast.info('No sales in this period'); return }
    downloadFile(`sales-report-${from}-to-${to}.csv`, toCSV(daily.map((day) => ({
      date: text(day.date), sales_count: number(day.sales_count), subtotal: number(day.subtotal),
      discount: number(day.discount), tax: number(day.tax), delivery: number(day.delivery), total: number(day.total),
      profit: profitAllowed ? number(day.profit) : '',
    }))))
  }

  return (
    <>
      <PageHeader title="Reports" description="All figures are computed by the database from live records" actions={<Button icon={<Download size={16} />} onClick={exportDaily}>Export daily CSV</Button>} />
      <Card className="mb-5"><div className="flex flex-wrap gap-3 p-4">
        <Field label="From"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        <div className="flex items-end"><Badge tone="blue"><FileBarChart size={12} className="mr-1" />{from} → {to}</Badge></div>
      </div></Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <StatCard label="Sales in period" value={formatMoney(totalSales, settings.currency_symbol)} icon={<FileBarChart size={20} />} tone="green" />
        <StatCard label="Stock valuation" value={formatMoney(number(data.inventory.valuation), settings.currency_symbol)} icon={<Badge tone="purple">Cost</Badge>} tone="purple" />
        <StatCard label="Retail value" value={formatMoney(number(data.inventory.retail_value), settings.currency_symbol)} icon={<Badge tone="blue">Retail</Badge>} tone="blue" />
        <StatCard label="Active products" value={formatNumber(number(data.inventory.total_products), 0)} icon={<Badge tone="green">SKU</Badge>} />
      </div>

      <Card className="mb-5">
        <CardHeader title="Daily sales" subtitle={`${formatMoney(totalSales, settings.currency_symbol)} total`} />
        <div className="p-5"><BarChart data={daily.map((day) => ({ label: text(day.date).slice(5), value: number(day.total) }))} currency={settings.currency_symbol} /></div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top products" />
          <DataTable columns={[
            { key: 'name', label: 'Product', render: (row: Row) => text(row.name) },
            { key: 'quantity', label: 'Qty', render: (row: Row) => formatNumber(number(row.quantity), 3) },
            { key: 'revenue', label: 'Revenue', render: (row: Row) => formatMoney(number(row.revenue), settings.currency_symbol) },
            ...(profitAllowed ? [{ key: 'profit', label: 'Profit', render: (row: Row) => formatMoney(number(row.profit), settings.currency_symbol) } as Column<Row>] : []),
          ]} rows={topProducts} rowKey={(row) => String(row.product_id ?? row.name ?? 'product')} empty="No sales in this period." />
        </Card>
        <Card>
          <CardHeader title="Category totals" />
          <DataTable columns={[
            { key: 'category', label: 'Category', render: (row: Row) => text(row.category) },
            { key: 'revenue', label: 'Revenue', render: (row: Row) => formatMoney(number(row.revenue), settings.currency_symbol) },
            ...(profitAllowed ? [{ key: 'profit', label: 'Profit', render: (row: Row) => formatMoney(number(row.profit), settings.currency_symbol) } as Column<Row>] : []),
          ]} rows={categories} rowKey={(row) => String(row.category ?? 'category')} empty="No category totals." />
        </Card>
        <Card>
          <CardHeader title="Employee performance" subtitle={profitAllowed ? 'Profit is visible because your role allows reports.profit' : 'Profit is hidden by your role'} />
          <DataTable columns={[
            { key: 'name', label: 'Employee', render: (row: Row) => text(row.name) },
            { key: 'sales_count', label: 'Invoices', render: (row: Row) => formatNumber(number(row.sales_count), 0) },
            { key: 'total', label: 'Sales', render: (row: Row) => formatMoney(number(row.total), settings.currency_symbol) },
            ...(profitAllowed ? [{ key: 'profit', label: 'Profit', render: (row: Row) => formatMoney(number(row.profit), settings.currency_symbol) } as Column<Row>] : []),
          ]} rows={employees} rowKey={(row) => String(row.employee_id ?? row.name ?? 'employee')} empty="No employee sales in this period." />
        </Card>
        <Card>
          <CardHeader title="Stock movement summary" subtitle="Last 30 days" />
          <DataTable columns={[
            { key: 'movement_type', label: 'Type', render: (row: Row) => <Badge>{text(row.movement_type)}</Badge> },
            { key: 'movements', label: 'Count', render: (row: Row) => formatNumber(number(row.movements), 0) },
            { key: 'quantity', label: 'Units', render: (row: Row) => formatNumber(number(row.quantity), 3) },
          ]} rows={movements} rowKey={(row) => String(row.movement_type ?? 'movement')} empty="No stock movements in the last 30 days." />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Low stock" subtitle="Above zero but at or below reorder level" />
          <DataTable columns={[
            { key: 'name', label: 'Product', render: (row: Row) => text(row.name) },
            { key: 'sku', label: 'SKU', render: (row: Row) => text(row.sku) },
            { key: 'stock', label: 'Stock', render: (row: Row) => <Badge tone="amber">{formatNumber(number(row.stock_quantity), 3)}</Badge> },
            { key: 'reorder', label: 'Reorder at', render: (row: Row) => formatNumber(number(row.reorder_level), 3) },
          ]} rows={rows(data.inventory.low_stock_items)} rowKey={(row) => String(row.product_id ?? row.name ?? 'product')} empty="No low-stock products." />
        </Card>
        <Card>
          <CardHeader title="Out of stock" />
          <DataTable columns={[
            { key: 'name', label: 'Product', render: (row: Row) => text(row.name) },
            { key: 'sku', label: 'SKU', render: (row: Row) => text(row.sku) },
          ]} rows={rows(data.inventory.out_of_stock_items)} rowKey={(row) => String(row.product_id ?? row.name ?? 'product')} empty="No out-of-stock products." />
        </Card>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Report generated {toDateInput(new Date())} · Asia/Dhaka</p>
    </>
  )
}
