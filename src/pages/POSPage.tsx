import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Save, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { buildCheckoutPayload, computeCheckout, validateCart } from '@/lib/checkout'
import type { CartItem, HeldCart, PaymentInput, Product, ProductSerial } from '@/lib/types'
import { changeDue, errorMessage, formatMoney, newIdempotencyKey } from '@/lib/utils'

const DRAFT_KEY = 'macintosh-pos-draft'
interface DraftCart { items: CartItem[]; customer_id: string | null; discount: number; tax: number; delivery: number; payments: PaymentInput[] }

function loadDraft(): DraftCart {
  const fallback: DraftCart = { items: [], customer_id: null, discount: 0, tax: 0, delivery: 0, payments: [] }
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<DraftCart>
    return { ...fallback, ...parsed, items: parsed.items ?? [], payments: parsed.payments ?? [] }
  } catch { return fallback }
}

export function POSPage() {
  const { session } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const initial = useMemo(loadDraft, [])
  const [items, setItems] = useState<CartItem[]>(initial.items)
  const [customerId, setCustomerId] = useState(initial.customer_id ?? '')
  const [discount, setDiscount] = useState(initial.discount)
  const [tax, setTax] = useState(initial.tax || Number(settings.tax_rate ?? 0))
  const [delivery, setDelivery] = useState(initial.delivery)
  const [payments, setPayments] = useState<PaymentInput[]>(initial.payments)
  const [search, setSearch] = useState('')
  const [payModal, setPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentInput['method']>('cash')
  const [payReference, setPayReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey())

  const { data: products } = useAsync(() => api.listProducts(), [])
  const { data: customers } = useAsync(() => api.listCustomers(), [])
  const { data: serials } = useAsync(() => api.listSerials(), [])
  const { data: heldCarts, reload: reloadHeld } = useAsync(() => api.listHeldCarts(), [])

  useEffect(() => {
    const draft: DraftCart = { items, customer_id: customerId || null, discount, tax, delivery, payments }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [items, customerId, discount, tax, delivery, payments])

  const totals = useMemo(() => computeCheckout(items, discount, tax, delivery, payments), [items, discount, tax, delivery, payments])
  const paid = totals.paid
  const validation = validateCart(items, payments, { discount, total: totals.total })

  function addProduct(product: Product) {
    if (product.stock_quantity <= 0) { toast.error(`${product.name} is out of stock`); return }
    if (product.is_serialized) {
      const serial = serials?.find((s) => s.product_id === product.id && s.status === 'in_stock')
      if (!serial) { toast.error('No in-stock serial number for this product'); return }
      setItems((current) => [...current, {
        product_id: product.id, name: product.name, sku: product.sku, quantity: 1,
        unit_price: product.selling_price, discount: 0, serial_id: serial.id,
        serial_number: serial.serial_number, warranty_months: product.warranty_months,
        available_stock: 1, is_serialized: true,
      }])
      return
    }
    setItems((current) => {
      const existing = current.find((item) => item.product_id === product.id && !item.is_serialized)
      if (existing) return current.map((item) => item === existing ? { ...item, quantity: Math.min(item.available_stock, item.quantity + 1) } : item)
      return [...current, {
        product_id: product.id, name: product.name, sku: product.sku, quantity: 1,
        unit_price: product.selling_price, discount: 0, serial_id: null, serial_number: null,
        warranty_months: product.warranty_months, available_stock: product.stock_quantity, is_serialized: false,
      }]
    })
  }

  function updateItem(index: number, patch: Partial<CartItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function removeItem(index: number) { setItems((current) => current.filter((_, i) => i !== index)) }

  function addPayment() {
    const amount = Number(payAmount)
    if (!(amount > 0)) { toast.error('Enter a payment amount'); return }
    setPayments((current) => [...current, { method: payMethod, amount, reference: payReference }])
    setPayAmount(''); setPayReference(''); setPayModal(false)
  }

  async function checkout() {
    if (!validation.ok) { toast.error(validation.errors[0]); return }
    setBusy(true)
    try {
      const payload = buildCheckoutPayload({
        items, customer_id: customerId || null, payments, discount,
        tax: totals.tax, delivery, warranty_months: items[0]?.warranty_months ?? 0,
        idempotency_key: idempotencyKey,
      })
      const result = await api.checkout(payload)
      localStorage.removeItem(DRAFT_KEY)
      setItems([]); setPayments([]); setDiscount(0); setTax(0); setDelivery(0); setCustomerId('')
      setIdempotencyKey(newIdempotencyKey())
      toast.success(`${result.invoice_number} created${result.due > 0 ? ` · due ${formatMoney(result.due, settings.currency_symbol)}` : ''}`)
      navigate(`/invoices/${result.sale_id}`)
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function holdCart() {
    if (items.length === 0) { toast.info('Cart is empty'); return }
    const name = window.prompt('Name this held cart')
    if (!name) return
    try {
      await api.saveHeldCart({
        name, customer_id: customerId || null, items, discount, tax, delivery,
        created_by: session?.user.id ?? '',
      })
      toast.success('Cart held')
      await reloadHeld()
    } catch (err) { toast.error(errorMessage(err)) }
  }

  async function resumeCart(cart: HeldCart) {
    setItems(cart.items); setCustomerId(cart.customer_id ?? ''); setDiscount(Number(cart.discount)); setTax(Number(cart.tax)); setDelivery(Number(cart.delivery)); setPayments([])
    try { await api.deleteHeldCart(cart.id); await reloadHeld(); toast.success(`Resumed ${cart.name}`) }
    catch (err) { toast.error(errorMessage(err)) }
  }

  const matches = (products ?? []).filter((product) => {
    const term = search.trim().toLowerCase()
    return !term || product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term) || (product.barcode ?? '').toLowerCase().includes(term)
  }).slice(0, 30)

  return (
    <>
      <PageHeader title="Point of Sale" description="Create a finalized invoice with split payments and controlled stock deduction" actions={
        <><Button icon={<Save size={16} />} onClick={() => void holdCart()}>Hold cart</Button><Button variant="primary" icon={<ShoppingCart size={16} />} loading={busy} onClick={() => void checkout()} disabled={items.length === 0}>Checkout</Button></>
      } />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Products" subtitle="Search by name, SKU or barcode" />
          <div className="p-4">
            <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type product name, SKU or barcode…" /></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {matches.map((product) => (
                <button key={product.id} onClick={() => addProduct(product)} className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/40">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.sku} · stock {product.stock_quantity}</p>
                  <p className="mt-1 font-semibold text-brand-700">{formatMoney(product.selling_price, settings.currency_symbol)}</p>
                </button>
              ))}
              {matches.length === 0 && <p className="col-span-full py-8 text-center text-sm text-slate-500">No matching products in stock.</p>}
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Current cart" subtitle={`${items.reduce((sum, item) => sum + item.quantity, 0)} units`} />
            <div className="space-y-2 p-4">
              <Field label="Customer"><Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              {items.map((item, index) => (
                <div key={`${item.product_id}-${item.serial_id ?? index}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-slate-500">{item.sku} · {formatMoney(item.unit_price, settings.currency_symbol)}</p></div>
                    <Button size="sm" variant="ghost" onClick={() => removeItem(index)} aria-label="Remove item"><Trash2 size={15} className="text-red-500" /></Button>
                  </div>
                  {item.is_serialized && (
                    <Select className="mt-2" value={item.serial_id ?? ''} onChange={(e) => {
                      const serial = serials?.find((s) => s.id === e.target.value)
                      updateItem(index, { serial_id: serial?.id ?? null, serial_number: serial?.serial_number ?? null })
                    }}>
                      {(serials ?? []).filter((s: ProductSerial) => s.product_id === item.product_id && (s.status === 'in_stock' || s.id === item.serial_id)).map((s) => <option key={s.id} value={s.id}>{s.serial_number}</option>)}
                    </Select>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Input type="number" min="1" max={item.available_stock} value={item.quantity} disabled={item.is_serialized} onChange={(e) => updateItem(index, { quantity: Math.min(item.available_stock, Number(e.target.value) || 1) })} />
                    <Input type="number" min="0" value={item.discount} onChange={(e) => updateItem(index, { discount: Number(e.target.value) || 0 })} />
                    <p className="self-center text-right text-sm font-semibold">{formatMoney(item.quantity * item.unit_price - item.discount, settings.currency_symbol)}</p>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Cart is empty. Choose a product to begin.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Totals & payments" />
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Discount"><Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} /></Field>
                <Field label="Tax"><Input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value) || 0)} /></Field>
                <Field label="Delivery"><Input type="number" min="0" step="0.01" value={delivery} onChange={(e) => setDelivery(Number(e.target.value) || 0)} /></Field>
              </div>
              <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(totals.subtotal, settings.currency_symbol)}</span></div>
                <div className="flex justify-between"><span>Total</span><strong>{formatMoney(totals.total, settings.currency_symbol)}</strong></div>
                <div className="flex justify-between"><span>Paid</span><span>{formatMoney(paid, settings.currency_symbol)}</span></div>
                <div className="flex justify-between text-amber-700"><span>Due</span><strong>{formatMoney(totals.due, settings.currency_symbol)}</strong></div>
                {changeDue(paid, totals.total) > 0 && <div className="flex justify-between text-emerald-700"><span>Change</span><strong>{formatMoney(changeDue(paid, totals.total), settings.currency_symbol)}</strong></div>}
              </div>
              <Button className="w-full" icon={<CreditCard size={16} />} onClick={() => setPayModal(true)}>Add payment</Button>
              {payments.map((payment, index) => (
                <div key={index} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="capitalize">{payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</span>
                  <span className="flex items-center gap-2"><strong>{formatMoney(payment.amount, settings.currency_symbol)}</strong><button onClick={() => setPayments(payments.filter((_, i) => i !== index))} aria-label="Remove payment"><Trash2 size={14} className="text-red-500" /></button></span>
                </div>
              ))}
              {(heldCarts?.length ?? 0) > 0 && <div className="border-t border-slate-200 pt-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">Held carts</p>
                {heldCarts?.map((cart) => <button key={cart.id} onClick={() => void resumeCart(cart)} className="mb-1 flex w-full justify-between rounded bg-slate-50 px-2 py-1 text-left text-xs hover:bg-slate-100"><span>{cart.name}</span><Badge>{cart.items.length} items</Badge></button>)}
              </div>}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Add payment" size="sm" footer={
        <><Button onClick={() => setPayModal(false)}>Cancel</Button><Button variant="primary" onClick={addPayment}>Add payment</Button></>
      }>
        <div className="space-y-4">
          <Field label="Method"><Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentInput['method'])}>{['cash', 'card', 'bkash', 'nagad', 'rocket', 'bank'].map((method) => <option key={method} value={method}>{method.toUpperCase()}</option>)}</Select></Field>
          <Field label="Amount" required><Input type="number" min="0.01" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></Field>
          <Field label="Reference"><Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="Transaction ID (optional)" /></Field>
          <p className="text-xs text-slate-500">Partial payments create customer dues. Cash overpayment is recorded as change.</p>
        </div>
      </Modal>
    </>
  )
}
