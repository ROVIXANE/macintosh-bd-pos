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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function toDateInput(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }
  const headers = parseLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseLine(line)
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']))
  })
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
