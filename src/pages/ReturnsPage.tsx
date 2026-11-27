import { useEffect, useState } from 'react'
import { CheckCircle2, Plus, RotateCcw } from 'lucide-react'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, Textarea, Toggle, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { ReturnRecord, Sale, SaleItem } from '@/lib/types'
import { errorMessage, formatDate, formatMoney } from '@/lib/utils'

interface ReturnDraftItem { sale_item_id: string; product_id: string; serial_id: string | null; quantity: number; available: number; name: string; condition: string }

export function ReturnsPage() {
  const { can, canAny } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [saleId, setSaleId] = useState('')
  const [sale, setSale] = useState<Sale | null>(null)
  const [items, setItems] = useState<ReturnDraftItem[]>([])
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState('0')
  const [restock, setRestock] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data: returns, loading, error, reload } = useAsync(() => api.listReturns(), [])
  const { data: sales } = useAsync(() => api.listSales(), [])

  useEffect(() => {
    if (!saleId) { setSale(null); setItems([]); return }
    let active = true
    void api.getSale(saleId).then((next) => {
      if (!active) return
      setSale(next)
      setItems((next.items ?? []).map((item: SaleItem) => ({
        sale_item_id: item.id, product_id: item.product_id, serial_id: item.serial_id,
        quantity: item.quantity, available: item.quantity,
        name: item.product_name ?? item.product?.name ?? item.product_id.slice(0, 8), condition: 'new',
      })))
      setRefund(String(next.total ?? 0))
    }).catch((err) => toast.error(errorMessage(err)))
    return () => { active = false }
  }, [saleId, toast])

  async function submit() {
    if (!saleId || items.length === 0) { toast.error('Select a sale with items'); return }
    if (!reason.trim()) { toast.error('A return reason is required'); return }
    const valid = items.filter((item) => item.quantity > 0 && item.quantity <= item.available)
    if (valid.length === 0) { toast.error('Enter a return quantity for at least one item'); return }
    setBusy(true)
    try {
      await api.createReturn({
        sale_id: saleId,
        items: valid.map((item) => ({
          sale_item_id: item.sale_item_id, product_id: item.product_id, serial_id: item.serial_id,
          quantity: item.quantity, condition: item.condition,
        })),
        refund_amount: Number(refund) || 0,
        reason: reason.trim(),
        restock: can('returns.approve') ? restock : false,
      })
      toast.success('Return recorded')
      setCreating(false); setSaleId(''); setReason(''); setRestock(false); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function approve(record: ReturnRecord) {
    if (!window.confirm(`Approve return ${record.id.slice(0, 8)}? Choose OK to restock returned units, or Cancel to approve without restocking.`)) return
    setBusy(true)
    try { await api.approveReturn(record.id, true); toast.success('Return approved and stock restored'); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  const columns: Array<Column<ReturnRecord>> = [
    { key: 'id', label: 'Return', render: (record) => <span className="font-medium">{record.id.slice(0, 8)}</span> },
    { key: 'invoice', label: 'Invoice', render: (record) => record.sale?.invoice_number ?? record.sale_id.slice(0, 8) },
    { key: 'customer', label: 'Customer', render: (record) => record.customer?.name ?? 'Walk-in' },
    { key: 'reason', label: 'Reason', render: (record) => record.reason },
    { key: 'refund', label: 'Refund', render: (record) => formatMoney(record.refund_amount, settings.currency_symbol) },
    { key: 'status', label: 'Status', render: (record) => <Badge tone={record.status === 'approved' ? 'green' : record.status === 'pending' ? 'amber' : 'red'}>{record.status}</Badge> },
    { key: 'items', label: 'Items', render: (record) => record.items?.length ?? 0 },
    { key: 'date', label: 'Date', render: (record) => formatDate(record.created_at) },
    { key: 'action', label: '', className: 'text-right', render: (record) => can('returns.approve') && record.status === 'pending' ? <Button size="sm" variant="primary" icon={<CheckCircle2 size={14} />} onClick={() => void approve(record)}>Approve</Button> : null },
  ]

  return (
    <>
      <PageHeader title="Returns" description="Return requests, approvals, refunds and controlled restocking" actions={
        canAny(['returns.create', 'returns.request']) && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setCreating(true); setSaleId(''); setReason('') }}>New return</Button>
      } />
      <Card>
        <CardHeader title={`${returns?.length ?? 0} returns`} subtitle="Pending requests do not change stock until approved" />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
          <DataTable columns={columns} rows={returns ?? []} rowKey={(record) => record.id} empty="No returns recorded." />
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Create return" size="lg" footer={
        <><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>Submit return</Button></>
      }>
        <div className="space-y-5">
          <Field label="Original invoice" required>
            <Select value={saleId} onChange={(event) => setSaleId(event.target.value)}>
              <option value="">Select an invoice</option>
              {(sales ?? []).map((item) => <option key={item.id} value={item.id}>{item.invoice_number} · {formatDate(item.sale_date)} · {formatMoney(item.total, settings.currency_symbol)}</option>)}
            </Select>
          </Field>
          {sale && <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items to return</p>
            {items.map((item, index) => (
              <div key={item.sale_item_id} className="grid items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
                <div className="sm:col-span-2"><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-slate-500">Sold {item.available} unit(s){item.serial_id ? ' · serialized' : ''}</p></div>
                <Field label="Qty"><Input type="number" min="0" max={item.available} step="0.001" value={item.quantity} onChange={(event) => setItems(items.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) || 0 } : row))} /></Field>
                <Field label="Condition"><Select value={item.condition} onChange={(event) => setItems(items.map((row, i) => i === index ? { ...row, condition: event.target.value } : row))}>{['new', 'used', 'defective'].map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
              </div>
            ))}
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Refund amount"><Input type="number" min="0" step="0.01" value={refund} onChange={(event) => setRefund(event.target.value)} /></Field>
            <Field label="Reason" required><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this being returned?" /></Field>
          </div>
          {can('returns.approve') && <Toggle checked={restock} onChange={setRestock} label="Approve immediately and restore stock" />}
          <p className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800"><RotateCcw size={14} /> Sales staff can request returns; restocking requires returns.approve permission.</p>
        </div>
      </Modal>
    </>
  )
}
