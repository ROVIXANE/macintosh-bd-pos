import type { Role } from './types'

export type Language = 'en' | 'bn'

export const STRINGS = {
  en: {
    dashboard: 'Dashboard', pos: 'Point of Sale', products: 'Products', inventory: 'Inventory',
    serials: 'Serial Numbers', purchases: 'Purchases', sales: 'Sales', invoices: 'Invoices',
    customers: 'Customers', suppliers: 'Suppliers', returns: 'Returns', warranty: 'Warranty & Repairs',
    expenses: 'Expenses', cash: 'Cash Drawer', reports: 'Reports', users: 'Users & Access',
    audit: 'Audit Logs', settings: 'Settings', signOut: 'Sign out', language: 'Language',
    noRole: 'No role',
  },
  bn: {
    dashboard: 'ড্যাশবোর্ড', pos: 'বিক্রয় কেন্দ্র', products: 'পণ্য', inventory: 'ইনভেন্টরি',
    serials: 'সিরিয়াল নম্বর', purchases: 'ক্রয়', sales: 'বিক্রয়', invoices: 'ইনভয়েস',
    customers: 'গ্রাহক', suppliers: 'সরবরাহকারী', returns: 'রিটার্ন', warranty: 'ওয়ারেন্টি ও মেরামত',
    expenses: 'খরচ', cash: 'ক্যাশ ড্রয়ার', reports: 'রিপোর্ট', users: 'ব্যবহারকারী ও অ্যাক্সেস',
    audit: 'অডিট লগ', settings: 'সেটিংস', signOut: 'প্রস্থান', language: 'ভাষা',
    noRole: 'কোনো ভূমিকা নেই',
  },
} as const

export type StringKey = keyof typeof STRINGS.en

export function translate(language: Language, key: StringKey): string {
  return STRINGS[language][key]
}

const ROLE_LABELS_BN: Record<Role, string> = {
  owner: 'মালিক',
  admin: 'অ্যাডমিন',
  sales: 'বিক্রয় কর্মী',
  inventory: 'ইনভেন্টরি কর্মী',
}

export function localizedRole(role: Role | null | undefined, language: Language, englishLabel: string): string {
  if (!role) return language === 'bn' ? ROLE_LABELS_BN.sales : englishLabel
  return language === 'bn' ? ROLE_LABELS_BN[role] : englishLabel
}
