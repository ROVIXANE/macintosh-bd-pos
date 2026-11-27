import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Banknote, CircleDollarSign, PackageCheck, ReceiptText, ShoppingCart, TrendingUp, Truck } from 'lucide-react'
import { BarChart } from '@/components/Charts'
import { Badge, Button, Card, CardHeader, ErrorState, LoadingState, PageHeader, StatCard } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney, monthInput } from '@/lib/utils'

type Stats = Record<string, unknown>
const number = (value: unknown) => Number(value ?? 0)

export function DashboardPage() {
  const { settings } = useSettings()
  const range = monthInput()
  const { data, loading, error, reload } = useAsync(async () => {
    const [stats, report, inventory, recent] = await Promise.all([
      api.dashboardStats(), api.salesReport(range.from, range.to), api.inventoryReport(), api.listSales(),
    ])
    return { stats: stats as Stats, report: report as Stats, inventory: inventory as Stats, recent }
  }, [range.from, range.to])

  if (loading) return <LoadingState label="Loading dashboard…" />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (!data) return null

  const stats = data.stats
  const daily = (Array.isArray(data.report.daily_totals) ? data.report.daily_totals : []) as Array<Record<string, unknown>>
  const lowStock = (Array.isArray(data.inventory.low_stock_items) ? data.inventory.low_stock_items : []) as Array<Record<string, unknown>>

  return (
    <>
      <PageHeader title="Dashboard" description={`Live performance for ${settings.store_name}`} subtitle={`Asia/Dhaka · ${formatDateTime(new Date())}`} actions={
        <Link to="/pos"><Button variant="primary" icon={<ShoppingCart size={16} />}>Open POS</Button></Link>
      } />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value={formatMoney(number(stats.today_sales_sum), settings.currency_symbol)} icon={<CircleDollarSign size={20} />} tone="green" hint={`${number(stats.today_sales_count)} invoices`} />
        <StatCard label="This month" value={formatMoney(number(stats.month_sales_sum), settings.currency_symbol)} icon={<TrendingUp size={20} />} hint={`${number(stats.products_sold)} units sold`} />
        <StatCard label="Inventory value" value={formatMoney(number(stats.inventory_value), settings.currency_symbol)} icon={<PackageCheck size={20} />} tone="purple" />
        <StatCard label="Today's expenses" value={formatMoney(number(stats.today_expenses), settings.currency_symbol)} icon={<Banknote size={20} />} tone="red" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily sales" subtitle="Current month" />
          <div className="p-5"><BarChart data={daily.map((day) => ({ label: String(day.date ?? '').slice(5), value: number(day.total) }))} currency={settings.currency_symbol} /></div>
        </Card>
        <Card>
          <CardHeader title="Attention needed" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Low stock items</span><strong>{number(stats.low_stock_count)}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" /> Out of stock</span><strong>{number(stats.out_of_stock_count)}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><ReceiptText size={16} className="text-brand-500" /> Customer dues</span><strong>{formatMoney(number(stats.customer_due_sum), settings.currency_symbol)}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><Truck size={16} className="text-purple-500" /> Supplier dues</span><strong>{formatMoney(number(stats.supplier_due_sum), settings.currency_symbol)}</strong></div>
            <Link to="/inventory" className="flex items-center justify-end gap-1 pt-2 text-xs font-medium text-brand-600 hover:underline">Review inventory <ArrowRight size={14} /></Link>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent invoices" subtitle="Most recent finalized sales" />
          <div className="divide-y divide-slate-100">
            {data.recent.slice(0, 6).map((sale) => (
              <Link key={sale.id} to={`/invoices/${sale.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <div><p className="font-medium text-brand-700">{sale.invoice_number}</p><p className="text-xs text-slate-500">{formatDateTime(sale.sale_date)} · {sale.customer?.name ?? 'Walk-in'}</p></div>
                <div className="text-right"><p className="font-semibold">{formatMoney(sale.total, settings.currency_symbol)}</p>{sale.due > 0 && <p className="text-xs text-amber-600">Due {formatMoney(sale.due, settings.currency_symbol)}</p>}</div>
              </Link>
            ))}
            {data.recent.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No sales recorded yet.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Low stock watchlist" subtitle="Below reorder level" />
          <div className="divide-y divide-slate-100">
            {lowStock.slice(0, 8).map((item, index) => (
              <div key={`${item.product_id}-${index}`} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{String(item.name ?? 'Product')}</span>
                <Badge tone="amber">{number(item.stock_quantity)} / {number(item.reorder_level)}</Badge>
              </div>
            ))}
            {lowStock.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No products below reorder level.</p>}
          </div>
        </Card>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Report date {formatDate(new Date())} · figures are calculated by database functions</p>
    </>
  )
}
