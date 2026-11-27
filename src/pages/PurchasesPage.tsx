import { useState } from 'react'
import { Download, Plus, Truck } from 'lucide-react'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, StatCard, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Purchase } from '@/lib/types'
import { calculateTotals, downloadFile, errorMessage, formatDate, formatMoney, toCSV, toDateInput, todayInput } from '@/lib/utils'

interface DraftItem { product_id: string; quantity: string; unit_cost: string; serial_numbers: string }
interface DraftSerial { serial_number: string; product_id: string; purchase_price: string; warranty_months: string; location: string }

function newItem(): DraftItem { return { product_id: '', quantity: '1', unit_cost: '0', serial_numbers: '' } }
function newSerial(): DraftSerial { return { serial_number: '', product_id: '', purchase_price: '0', warranty_months: '12', location: '' } }

export function PurchasesPage() {
  const { can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [reference, setReference] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayInput())
  const [paid, setPaid] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [tax, setTax] = useState('0')
  const [items, setItems] = useState<DraftItem[]>([newItem()])
  const [serials, setSerials] = useState<DraftSerial[]>([])

  const { data: purchases, loading, error, reload } = useAsync(() => api.listPurchases(), [])
  const { data: suppliers } = useAsync(() => api.listSuppliers(), [])
  const { data: products } = useAsync(() => api.listProducts(), [])

  const totals = calculateTotals(items.map((item) => ({ quantity: Number(item.quantity) || 0, unit_price: Number(item.unit_cost) || 0 })), Number(discount), 0, Number(tax))
  const due = Math.max(0, totals.total - Number(paid))

  async function receive() {
    if (!supplierId) { toast.error('Select a supplier'); return }
    const validItems = items.filter((item) => item.product_id && Number(item.quantity) > 0 && Number(item.unit_cost) >= 0)
    if (validItems.length === 0) { toast.error('Add at least one purchase item'); return }
    if (serials.some((serial) => !serial.serial_number.trim() || !serial.product_id)) { toast.error('Every serial needs a number and product'); return }
    setBusy(true)
    try {
      await api.receivePurchase({
        supplier_id: supplierId, reference, purchase_date: purchaseDate,
        paid: Number(paid) || 0, discount: Number(discount) || 0, tax: Number(tax) || 0,
        items: validItems.map((item) => ({
          product_id: item.product_id, quantity: Number(item.quantity), unit_cost: Number(item.unit_cost),
          serial_numbers: item.serial_numbers.split(',').map((value) => value.trim()).filter(Boolean),
        })),
        serials: serials.map((serial) => ({
          serial_number: serial.serial_number.trim(), product_id: serial.product_id,
          purchase_price: Number(serial.purchase_price) || 0, purchase_date: purchaseDate,
          supplier_id: supplierId, warranty_months: Number(serial.warranty_months) || 0,
          location: serial.location || null, condition: 'new', status: 'in_stock',
        })),
      })
      toast.success('Stock received; movements and supplier balance recorded')
      setCreating(false); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  function exportCSV() {
    if (!purchases?.length) { toast.info('No purchases to export'); return }
    downloadFile(`purchases-${toDateInput(new Date())}.csv`, toCSV(purchases.map((p) => ({
      reference: p.reference ?? '', date: p.purchase_date, supplier: p.supplier?.name ?? '',
      total: p.total, paid: p.paid, due: p.due, status: p.status,
    }))))
  }

  const columns: Array<Column<Purchase>> = [
    { key: 'reference', label: 'Reference', render: (p) => <span className="font-medium">{p.reference || `PO-${p.id.slice(0, 8)}`}</span> },
    { key: 'supplier', label: 'Supplier', render: (p) => p.supplier?.name ?? '—' },
    { key: 'date', label: 'Date', render: (p) => formatDate(p.purchase_date) },
    { key: 'total', label: 'Total', render: (p) => formatMoney(p.total, settings.currency_symbol) },
    { key: 'paid', label: 'Paid', render: (p) => formatMoney(p.paid, settings.currency_symbol) },
    { key: 'due', label: 'Due', render: (p) => p.due > 0 ? <Badge tone="amber">{formatMoney(p.due, settings.currency_symbol)}</Badge> : <Badge tone="green">Paid</Badge> },
    { key: 'status', label: 'Status', render: (p) => <Badge>{p.status}</Badge> },
  ]

  const totalDue = (purchases ?? []).reduce((sum, purchase) => sum + Number(purchase.due), 0)

  return (
    <>
      <PageHeader title="Purchases" description="Receive stock from suppliers and track balances" actions={
        <><Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>
          {can('purchases.create') && <Button variant="primary" icon={<Truck size={16} />} onClick={() => setCreating(true)}>New purchase</Button>}</>
      } />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Purchase records" value={String(purchases?.length ?? 0)} icon={<Truck size={20} />} />
        <StatCard label="Supplier due" value={formatMoney(totalDue, settings.currency_symbol)} icon={<Badge tone="amber">Due</Badge>} tone="amber" />
        <StatCard label="Received units" value={String((purchases ?? []).reduce((sum, p) => sum + (p.items ?? []).reduce((line, item) => line + Number(item.quantity), 0), 0))} icon={<Plus size={20} />} tone="green" />
      </div>
      <Card>
        <CardHeader title={`${purchases?.length ?? 0} purchases`} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : <DataTable columns={columns} rows={purchases ?? []} rowKey={(p) => p.id} empty="No purchases recorded. Create one to receive stock." />}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Receive purchase" size="xl" footer={
        <><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void receive()}>Receive stock</Button></>
      }>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Supplier" required><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Select supplier</option>{suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice / PO number" /></Field>
            <Field label="Purchase date"><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
            <Field label="Amount paid"><Input type="number" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Products</h3><Button size="sm" icon={<Plus size={14} />} onClick={() => setItems([...items, newItem()])}>Add row</Button></div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="grid items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
                  <Field label="Product"><Select value={item.product_id} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, product_id: e.target.value } : row))}><option value="">Select product</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                  <Field label="Qty"><Input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} /></Field>
                  <Field label="Unit cost"><Input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, unit_cost: e.target.value } : row))} /></Field>
                  <Field label="Serial numbers" hint="Comma separated"><Input value={item.serial_numbers} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, serial_numbers: e.target.value } : row))} /></Field>
                  <Button size="sm" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label="Remove row"><Trash2Icon /></Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Serial units (optional)</h3><Button size="sm" icon={<Plus size={14} />} onClick={() => setSerials([...serials, newSerial()])}>Add serial</Button></div>
            {serials.map((serial, index) => (
              <div key={index} className="mb-2 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-5">
                <Field label="Serial number"><Input value={serial.serial_number} onChange={(e) => setSerials(serials.map((row, i) => i === index ? { ...row, serial_number: e.target.value } : row))} /></Field>
                <Field label="Product"><Select value={serial.product_id} onChange={(e) => setSerials(serials.map((row, i) => i === index ? { ...row, product_id: e.target.value } : row))}><option value="">Select</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Cost"><Input type="number" min="0" value={serial.purchase_price} onChange={(e) => setSerials(serials.map((row, i) => i === index ? { ...row, purchase_price: e.target.value } : row))} /></Field>
                <Field label="Warranty (mo)"><Input type="number" min="0" value={serial.warranty_months} onChange={(e) => setSerials(serials.map((row, i) => i === index ? { ...row, warranty_months: e.target.value } : row))} /></Field>
                <div className="flex items-end gap-2"><Field label="Location"><Input value={serial.location} onChange={(e) => setSerials(serials.map((row, i) => i === index ? { ...row, location: e.target.value } : row))} /></Field><Button size="sm" variant="ghost" onClick={() => setSerials(serials.filter((_, i) => i !== index))}><Trash2Icon /></Button></div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4">
            <p>Subtotal: <strong>{formatMoney(totals.subtotal, settings.currency_symbol)}</strong></p>
            <Field label="Discount"><Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
            <Field label="Tax"><Input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
            <p className="font-semibold">Total: {formatMoney(totals.total, settings.currency_symbol)}<br />Due: {formatMoney(due, settings.currency_symbol)}</p>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Trash2Icon() {
  return <span className="text-red-500" aria-hidden="true">✕</span>
}
