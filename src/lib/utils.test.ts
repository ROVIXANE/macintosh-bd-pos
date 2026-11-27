import { describe, expect, it } from 'vitest'
import {
  calculateTotals, changeDue, classNames, formatDate, formatDateTime, formatMoney,
  isValidBangladeshPhone, parseCSV, roundMoney, toCSV, toDateInput,
} from './utils'

describe('money and number helpers', () => {
  it('rounds money to two decimals', () => {
    expect(roundMoney(12.345)).toBe(12.35)
    expect(roundMoney(Number.NaN)).toBe(0)
  })

  it('formats BDT money with the taka symbol', () => {
    expect(formatMoney(1234.5, '৳')).toContain('৳')
    expect(formatMoney(1234.5, '৳')).toContain('1,234.50')
  })

  it('calculates line discounts, order discount, tax and delivery', () => {
    const totals = calculateTotals([
      { quantity: 2, unit_price: 100, discount: 10 },
      { quantity: 1, unit_price: 50 },
    ], 20, 10, 30)
    expect(totals.subtotal).toBe(240)
    expect(totals.discount).toBe(20)
    expect(totals.tax).toBe(22)
    expect(totals.delivery).toBe(30)
    expect(totals.total).toBe(272)
  })

  it('computes change due', () => {
    expect(changeDue(500, 372.5)).toBe(127.5)
    expect(changeDue(100, 200)).toBe(0)
  })
})

describe('date helpers', () => {
  it('formats dates as DD/MM/YYYY in Asia/Dhaka', () => {
    expect(formatDate('2026-01-05T18:30:00Z')).toBe('06/01/2026')
    expect(formatDate('bad-date')).toBe('—')
  })

  it('formats date-times in Asia/Dhaka', () => {
    expect(formatDateTime('2026-01-05T18:30:00Z')).toBe('06/01/2026 00:30')
  })

  it('produces date inputs in YYYY-MM-DD and preserves existing values', () => {
    expect(toDateInput('2026-01-05T18:30:00Z')).toBe('2026-01-06')
    expect(toDateInput('2026-01-05')).toBe('2026-01-05')
  })
})

describe('CSV helpers', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCSV([{ name: 'Laptop, Pro', note: 'Line 1\nLine 2' }])
    expect(csv).toContain('"Laptop, Pro"')
    expect(csv).toContain('"Line 1\nLine 2"')
    expect(parseCSV(csv)).toEqual([{ name: 'Laptop, Pro', note: 'Line 1\nLine 2' }])
  })

  it('returns nothing for empty input', () => {
    expect(toCSV([])).toBe('')
    expect(parseCSV('')).toEqual([])
  })
})

describe('small utilities', () => {
  it('joins truthy class names only', () => {
    expect(classNames('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('validates Bangladesh mobile numbers', () => {
    expect(isValidBangladeshPhone('01712345678')).toBe(true)
    expect(isValidBangladeshPhone('+8801712345678')).toBe(true)
    expect(isValidBangladeshPhone('12345')).toBe(false)
  })
})
