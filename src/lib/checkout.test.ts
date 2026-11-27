import { describe, expect, it } from 'vitest'
import { buildCheckoutPayload, computeCheckout, validateCart } from './checkout'
import type { CartItem, PaymentInput } from './types'

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    product_id: '11111111-1111-1111-1111-111111111111',
    name: 'ThinkPad Laptop', sku: 'LP-001', quantity: 1, unit_price: 1000,
    discount: 0, serial_id: null, serial_number: null, warranty_months: 12,
    available_stock: 5, is_serialized: false, ...overrides,
  }
}

function payment(overrides: Partial<PaymentInput> = {}): PaymentInput {
  return { method: 'cash', amount: 1000, ...overrides }
}

describe('validateCart', () => {
  it('rejects an empty cart', () => {
    const result = validateCart([], [payment()], { discount: 0, total: 1000 })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Cart is empty')
  })

  it('rejects over-stock and fractional quantities', () => {
    const result = validateCart(
      [item({ quantity: 2.5, available_stock: 1 })],
      [],
      { discount: 0, total: 2500 },
    )
    expect(result.errors.join(' ')).toMatch(/whole number/)
    expect(result.errors.join(' ')).toMatch(/only 1 in stock/)
  })

  it('requires a serial for serialized products', () => {
    const result = validateCart(
      [item({ is_serialized: true, serial_id: null, quantity: 1 })],
      [],
      { discount: 0, total: 1000 },
    )
    expect(result.errors.join(' ')).toMatch(/choose a serial number/)
  })

  it('rejects negative payments and non-cash overpayment', () => {
    const negative = validateCart([item()], [payment({ amount: -5 })], { discount: 0, total: 1000 })
    expect(negative.errors.join(' ')).toMatch(/Payment amount cannot be negative/)

    const overpaid = validateCart([item()], [payment({ method: 'bkash', amount: 1200 })], { discount: 0, total: 1000 })
    expect(overpaid.errors.join(' ')).toMatch(/Payment exceeds total/)
  })

  it('accepts a valid cart with cash change', () => {
    const result = validateCart([item()], [payment({ amount: 1200 })], { discount: 0, total: 1000 })
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe('computeCheckout', () => {
  it('derives paid, due and change from totals', () => {
    const result = computeCheckout([item({ unit_price: 500, quantity: 2 })], 50, 5, 20, [payment({ amount: 1000 })])
    expect(result.subtotal).toBe(1000)
    expect(result.tax).toBe(47.5)
    expect(result.total).toBe(1017.5)
    expect(result.paid).toBe(1000)
    expect(result.due).toBe(17.5)
    expect(result.change).toBe(0)
  })
})

describe('buildCheckoutPayload', () => {
  it('maps fields to the database checkout RPC arguments', () => {
    const payload = buildCheckoutPayload({
      items: [item({ quantity: 2.9, unit_price: 100.126, discount: 0.126 })],
      customer_id: null,
      payments: [payment({ amount: 250.126 }), payment({ method: 'bkash', amount: 0 })],
      discount: 5.126,
      tax: 2,
      delivery: 10,
      warranty_months: 12.9,
      idempotency_key: 'test-key',
    })
    expect(payload.items[0]).toMatchObject({ quantity: 2, unit_price: 100.13, discount: 0.13 })
    expect(payload.payments).toHaveLength(1)
    expect(payload.payments[0].amount).toBe(250.13)
    expect(payload.discount).toBe(5.13)
    expect(payload.tax).toBe(2)
    expect(payload.delivery).toBe(10)
    expect(payload.warranty_months).toBe(12)
    expect(payload.idempotency_key).toBe('test-key')
  })

  it('generates an idempotency key when none is supplied', () => {
    const payload = buildCheckoutPayload({
      items: [item()], customer_id: null, payments: [], discount: 0,
      tax: 0, delivery: 0, warranty_months: 12,
    })
    expect(payload.idempotency_key).toMatch(/^pos-/)
  })
})
