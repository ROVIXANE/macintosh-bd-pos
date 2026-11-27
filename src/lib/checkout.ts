import { roundMoney, calculateTotals, newIdempotencyKey } from './utils'
import type { CartItem, CheckoutInput, PaymentInput } from './types'

export interface CartValidation { ok: boolean; errors: string[] }

/** Client-side mirror of database checks. The DB (create_sale RPC) is authoritative. */
export function validateCart(items: CartItem[], payments: PaymentInput[], opts: { discount: number; total: number }): CartValidation {
  const errors: string[] = []
  if (items.length === 0) errors.push('Cart is empty')
  for (const item of items) {
    if (!item.product_id) errors.push('Item is missing a product')
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) errors.push(`${item.name}: quantity must be positive`)
    if (!Number.isInteger(item.quantity)) errors.push(`${item.name}: quantity must be a whole number`)
    if (item.quantity > item.available_stock) errors.push(`${item.name}: only ${item.available_stock} in stock`)
    if (item.unit_price < 0) errors.push(`${item.name}: price cannot be negative`)
    if (item.discount < 0) errors.push(`${item.name}: discount cannot be negative`)
    if (item.discount > item.quantity * item.unit_price) errors.push(`${item.name}: discount exceeds line total`)
    if (item.is_serialized && item.quantity !== 1) errors.push(`${item.name}: serialized item quantity must be 1`)
    if (item.is_serialized && !item.serial_id) errors.push(`${item.name}: choose a serial number in stock`)
  }
  if (opts.discount < 0) errors.push('Order discount cannot be negative')
  const paidSum = roundMoney(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0))
  for (const p of payments) { if (p.amount < 0) errors.push('Payment amount cannot be negative') }
  if (paidSum - opts.total > 0.01 && payments.every((p) => p.method !== 'cash')) errors.push('Payment exceeds total for non-cash methods')
  return { ok: errors.length === 0, errors }
}

export function computeCheckout(items: CartItem[], discount = 0, taxRate = 0, delivery = 0, payments: PaymentInput[] = []) {
  const totals = calculateTotals(items, discount, taxRate, delivery)
  const paid = roundMoney(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0))
  const appliedPaid = Math.min(paid, totals.total)
  return { ...totals, paid, appliedPaid, due: roundMoney(Math.max(0, totals.total - appliedPaid)), change: roundMoney(Math.max(0, paid - totals.total)) }
}

export function buildCheckoutPayload(args: { items: CartItem[]; customer_id: string | null; payments: PaymentInput[]; discount: number; tax: number; delivery: number; warranty_months: number; idempotency_key?: string; held_cart_id?: string | null }): CheckoutInput {
  return {
    items: args.items.map((i) => ({ ...i, quantity: Math.trunc(i.quantity), unit_price: roundMoney(i.unit_price), discount: roundMoney(i.discount ?? 0) })),
    customer_id: args.customer_id,
    payments: args.payments.filter((p) => p.amount > 0).map((p) => ({ ...p, amount: roundMoney(p.amount) })),
    discount: roundMoney(args.discount), tax: roundMoney(args.tax), delivery: roundMoney(args.delivery),
    warranty_months: Math.max(0, Math.trunc(args.warranty_months)), idempotency_key: args.idempotency_key ?? newIdempotencyKey(), held_cart_id: args.held_cart_id ?? null,
  }
}
