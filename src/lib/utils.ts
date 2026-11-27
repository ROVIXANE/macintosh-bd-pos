export const DEFAULT_SETTINGS = {
  store_name: 'Macintosh BD',
  currency: 'BDT',
  currency_symbol: '৳',
  tax_rate: 0,
  invoice_prefix: 'MB',
  warranty_default_months: 12,
  invoice_layout: 'a4',
  timezone: 'Asia/Dhaka',
  receipt_footer: 'Thank you for shopping with Macintosh BD',
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

export function formatMoney(value: number | null | undefined, symbol = '৳'): string {
  const amount = roundMoney(value ?? 0)
  return `${symbol}${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  return (Number(value) || 0).toLocaleString('en-BD', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const TIMEZONE = 'Asia/Dhaka'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateParts(value: string | Date): Record<string, string> | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const parts = dateParts(value)
  if (!parts) return '—'
  return `${parts.day}/${parts.month}/${parts.year}`
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const parts = dateParts(value)
  if (!parts) return '—'
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

export function toDateInput(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parts = dateParts(value)
  if (!parts) return ''
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function todayInput(): string {
  return toDateInput(new Date())
}

export function monthInput(): { from: string; to: string } {
  const now = new Date()
  return {
    from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    to: todayInput(),
  }
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export interface Totals {
  subtotal: number
  discount: number
  tax: number
  delivery: number
  total: number
}

export function calculateTotals(
  items: Array<{ quantity: number; unit_price: number; discount?: number }>,
  discount = 0,
  taxRate = 0,
  delivery = 0,
): Totals {
  const subtotal = roundMoney(
    items.reduce((acc, item) => acc + item.quantity * item.unit_price - (item.discount ?? 0), 0),
  )
  const orderDiscount = roundMoney(discount)
  const taxable = Math.max(0, subtotal - orderDiscount)
  const tax = roundMoney((taxable * taxRate) / 100)
  const total = roundMoney(Math.max(0, taxable) + tax + roundMoney(delivery))
  return { subtotal, discount: orderDiscount, tax, delivery: roundMoney(delivery), total }
}

export function changeDue(paid: number, total: number): number {
  return roundMoney(Math.max(0, paid - total))
}

export function newIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `pos-${Date.now()}-${random}`
}

export function isValidBangladeshPhone(phone: string): boolean {
  return /^(?:\+88|88)?01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, ''))
}

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function toCSV(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [headers.join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))].join('\r\n')
}

export function parseCSV(text: string): Array<Record<string, string>> {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (char === '"') {
      if (inQuotes && source[i + 1] === '"') {
        field += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      row.push(field.trim())
      field = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(field.trim())
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }

  row.push(field.trim())
  if (row.some((value) => value !== '')) rows.push(row)
  if (rows.length < 2) return []

  const [headers, ...values] = rows
  return values.map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ''])))
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
