import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CartItem, CheckoutInput, PaymentInput } from './types'

const rpc = vi.hoisted(() => vi.fn())

vi.mock('./supabase', () => ({
  getSupabase: () => ({ rpc }),
  getEphemeralClient: () => ({ auth: { signUp: vi.fn() } }),
  isSupabaseConfigured: true,
}))

import { api } from './api'

const productId = '11111111-1111-1111-1111-111111111111'
const saleItem: CartItem = {
  product_id: productId, name: 'Laptop', sku: 'LP-001', quantity: 1, unit_price: 1000,
  discount: 0, serial_id: null, serial_number: null, warranty_months: 12, available_stock: 3,
  is_serialized: false,
}
const payment: PaymentInput = { method: 'bkash', amount: 1000, reference: 'TXN-1' }

describe('api RPC argument mapping', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { sale_id: 'sale-1', invoice_number: 'MB-1', total: 1000, paid: 1000, due: 0 }, error: null })
  })

  it('sends checkout fields under the SQL parameter names', async () => {
    const input: CheckoutInput = {
      items: [saleItem], customer_id: null, payments: [payment], discount: 10,
      tax: 5, delivery: 20, warranty_months: 12, idempotency_key: 'key-1', held_cart_id: null,
    }
    await api.checkout(input)
    expect(rpc).toHaveBeenCalledWith('checkout', {
      p_items: [{ product_id: productId, quantity: 1, unit_price: 1000, discount: 0, serial_id: null }],
      p_customer_id: null,
      p_payments: [{ method: 'bkash', amount: 1000, reference: 'TXN-1' }],
      p_discount: 10,
      p_tax: 5,
      p_delivery: 20,
      p_idempotency_key: 'key-1',
      p_warranty_months: 12,
      p_held_cart_id: null,
    })
  })

  it('maps receive_purchase items and serials', async () => {
    await api.receivePurchase({
      supplier_id: 'supplier-1', reference: 'PO-1', purchase_date: '2026-01-05',
      paid: 100, discount: 5, tax: 2,
      items: [{ product_id: productId, quantity: 2, unit_cost: 500, serial_numbers: ['SN1', 'SN2'] }],
      serials: [{ serial_number: 'SN1', product_id: productId }],
    })
    expect(rpc).toHaveBeenCalledWith('receive_purchase', expect.objectContaining({
      p_supplier_id: 'supplier-1',
      p_reference: 'PO-1',
      p_purchase_date: '2026-01-05',
      p_paid: 100,
      p_discount: 5,
      p_tax: 2,
      p_items: [{ product_id: productId, quantity: 2, unit_cost: 500, serial_numbers: ['SN1', 'SN2'] }],
      p_serials: [{ serial_number: 'SN1', product_id: productId }],
    }))
  })

  it('maps return approval, cash shifts and role changes', async () => {
    await api.approveReturn('return-1', true)
    expect(rpc).toHaveBeenCalledWith('approve_return', { p_return_id: 'return-1', p_restock: true })

    await api.openShift(500, 'Opening notes')
    expect(rpc).toHaveBeenCalledWith('create_cash_shift', { p_opening_balance: 500, p_notes: 'Opening notes' })

    await api.closeShift('shift-1', 450, 'Closing notes')
    expect(rpc).toHaveBeenCalledWith('close_cash_shift', { p_shift_id: 'shift-1', p_actual_closing: 450, p_notes: 'Closing notes' })

    await api.applyRole('user-1', 'admin')
    expect(rpc).toHaveBeenCalledWith('apply_role', { p_user: 'user-1', p_role: 'admin' })
  })

  it('throws the Supabase error message', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    await expect(api.bootstrapOwner()).rejects.toThrow('permission denied')
  })
})
