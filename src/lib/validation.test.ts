import { describe, expect, it } from 'vitest'
import { firstError, minValue, required, runValidators, validEmail, validPhone, validSku } from './validation'

describe('validators', () => {
  it('requires a non-empty value', () => {
    expect(required('Name')('')).toBe('Name is required')
    expect(required('Name')('   ')).toBe('Name is required')
    expect(required('Name')(null)).toBe('Name is required')
    expect(required('Name')('Macintosh BD')).toBeNull()
  })

  it('checks numeric minimums', () => {
    expect(minValue('Amount', 0.01)(0)).toContain('at least 0.01')
    expect(minValue('Amount', 0.01)(5)).toBeNull()
  })

  it('validates email, phone and SKU formats', () => {
    expect(validEmail('owner@macintoshbd.com')).toBeNull()
    expect(validEmail('not-an-email')).toContain('valid email')
    expect(validPhone('01712345678')).toBeNull()
    expect(validPhone('111')).toContain('Bangladesh')
    expect(validSku('LP-001')).toBeNull()
    expect(validSku('bad sku!')).toContain('SKU')
  })

  it('runs validators in order and finds the first error', () => {
    const error = runValidators('', [required('Email'), validEmail])
    expect(error).toBe('Email is required')
    expect(firstError({ name: null, amount: 'Amount is required' })).toBe('Amount is required')
    expect(firstError({ name: null, amount: null })).toBeNull()
  })
})
