import { useState } from 'react'
import { Download, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, StatCard, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Product, StockMovement } from '@/lib/types'
import { downloadFile, errorMessage, formatDateTime, formatNumber, toCSV, toDateInput } from '@/lib/utils'

export function InventoryPage() {
  const { can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [productId, setProductId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const [delta, setDelta] = useState('')
  const [movementType, setMovementType] = useState('adjustment')
  const [reason, setReason] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: movements, loading, error, reload } = useAsync(() => api.listMovements({ from, to, product_id: productId }), [from, to, productId])
  const { data: products } = useAsync(() => api.listProducts(), [])
  const { data: report } = useAsync(() => api.inventoryReport(), [])

  async function adjust() {
    if (!adjusting || !Number(delta)) { toast.error('Enter a non-zero quantity change'); return }
    if (!reason.trim()) { toast.error('A reason is required'); return }
    setBusy(true)
    try {
      await api.adjustStock({ product_id: adjusting.id, quantity: Number(delta), movement_type: movementType, reason: reason.trim(), location: location || null })
      toast.success('Stock adjusted and movement recorded')
      setAdjusting(null); setDelta(''); setReason(''); setLocation('')
      await Promise.all([reload()])
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  function exportCSV() {
    if (!movements?.length) { toast.info('No movements to export'); return }
    downloadFile(`stock-movements-${toDateInput(new Date())}.csv`, toCSV(movements.map((m) => ({
      date: m.created_at, product: m.product?.name ?? m.product_id, type: m.movement_type,
      quantity: m.quantity, previous: m.previous_quantity, new: m.new_quantity, reason: m.reason ?? '',
    }))))
    toast.success(`Exported ${movements.length} movements`)
  }

  const columns: Array<Column<StockMovement>> = [
    { key: 'date', label: 'Date', render: (m) => formatDateTime(m.created_at) },
    { key: 'product', label: 'Product', render: (m) => m.product?.name ?? m.product_id.slice(0, 8) },
    { key: 'type', label: 'Type', render: (m) => <Badge tone={m.quantity > 0 ? 'green' : 'red'}>{m.movement_type}</Badge> },
    { key: 'quantity', label: 'Change', render: (m) => <span className={m.quantity > 0 ? 'text-emerald-700' : 'text-red-700'}>{m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity, 3)}</span> },
    { key: 'balance', label: 'Balance', render: (m) => `${formatNumber(m.previous_quantity, 3)} → ${formatNumber(m.new_quantity, 3)}` },
    { key: 'reason', label: 'Reason', render: (m) => m.reason ?? '—' },
    { key: 'employee', label: 'By', render: (m) => m.employee?.full_name ?? 'system' },
  ]

  return (
    <>
      <PageHeader title="Inventory" description="Every stock change is recorded as a movement" actions={<Button icon={<Download size={16} />} onClick={exportCSV}>Export movements</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock value" value={formatMoney(Number((report as Record<string, unknown> | null)?.valuation ?? 0), settings.currency_symbol)} icon={<SlidersHorizontal size={20} />} tone="green" />
        <StatCard label="Low stock items" value={String(((report as Record<string, unknown> | null)?.low_stock_items as unknown[] | undefined)?.length ?? 0)} icon={<Badge tone="amber">Low</Badge>} tone="amber" />
        <StatCard label="Out of stock items" value={String(((report as Record<string, unknown> | null)?.out_of_stock_items as unknown[] | undefined)?.length ?? 0)} icon={<Badge tone="red">Zero</Badge>} tone="red" />
      </div>

      <Card className="mb-5">
        <CardHeader title="Stock on hand" subtitle="Adjustments require a reason and are audit logged" />
        <div className="w-full overflow-x-auto p-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">Product</th><th className="p-2 text-left">SKU</th><th className="p-2 text-right">Stock</th><th className="p-2 text-right">Reorder at</th><th className="p-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(products ?? []).map((product) => <tr key={product.id}>
                <td className="p-2 font-medium">{product.name}</td><td className="p-2 text-slate-500">{product.sku}</td>
                <td className="p-2 text-right"><Badge tone={product.stock_quantity <= 0 ? 'red' : product.stock_quantity <= product.reorder_level ? 'amber' : 'green'}>{formatNumber(product.stock_quantity, 3)}</Badge></td>
                <td className="p-2 text-right">{formatNumber(product.reorder_level, 3)}</td>
                <td className="p-2 text-right">{can('inventory.adjust') && <Button size="sm" variant="ghost" onClick={() => { setAdjusting(product); setDelta(''); setReason(''); setLocation('') }}>Adjust</Button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-5"><div className="flex flex-wrap gap-3 p-4">
        <Field label="Product"><Select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">All products</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div></Card>

      <Card>
        <CardHeader title={`${movements?.length ?? 0} stock movements`} subtitle="Newest first" />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : <DataTable columns={columns} rows={movements ?? []} rowKey={(m) => m.id} empty="No stock movements recorded yet." />}
      </Card>

      <Modal open={Boolean(adjusting)} onClose={() => setAdjusting(null)} title={`Adjust stock — ${adjusting?.name ?? ''}`} size="sm" footer={
        <><Button onClick={() => setAdjusting(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void adjust()}>Record adjustment</Button></>
      }>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Current stock: <strong>{formatNumber(adjusting?.stock_quantity ?? 0, 3)}</strong></p>
          <Field label="Quantity delta" hint="Use a negative number to reduce stock" required><Input type="number" step="0.001" value={delta} onChange={(e) => setDelta(e.target.value)} /></Field>
          <Field label="Movement type"><Select value={movementType} onChange={(e) => setMovementType(e.target.value)}>{['adjustment', 'damage', 'audit', 'return'].map((type) => <option key={type} value={type}>{type}</option>)}</Select></Field>
          <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  )
}
