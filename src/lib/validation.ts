import { isValidBangladeshPhone } from './utils'

export type Validator<T> = (value: T) => string | null

export const required = (label: string): Validator<string | number | null | undefined> => (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return `${label} is required`
  return null
}

export const minValue = (label: string, min: number): Validator<number> => (value) =>
  Number(value) >= min ? null : `${label} must be at least ${min}`

export const validEmail: Validator<string> = (value) => {
  if (!value) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Enter a valid email address'
}

export const validPhone: Validator<string> = (value) => {
  if (!value) return null
  return isValidBangladeshPhone(value)
    ? null
    : 'Use a valid Bangladesh mobile number (e.g. 01712345678)'
}

export const validSku: Validator<string> = (value) =>
  /^[A-Za-z0-9._-]{2,40}$/.test(value) ? null : 'SKU must be 2–40 letters, numbers, dots, dashes or underscores'

export function runValidators<T>(value: T, validators: Array<Validator<T>>): string | null {
  for (const validate of validators) {
    const error = validate(value)
    if (error) return error
  }
  return null
}

export function firstError(errors: Record<string, string | null>): string | null {
  return Object.values(errors).find(Boolean) ?? null
}
