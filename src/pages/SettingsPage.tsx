import { useEffect, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, Toggle } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { api } from '@/lib/api'
import type { StoreSettings } from '@/lib/types'
import { errorMessage } from '@/lib/utils'
import { firstError, required, runValidators } from '@/lib/validation'

export function SettingsPage() {
  const { can } = useAuth()
  const { settings, error: loadError, refresh } = useSettings()
  const toast = useToast()
  const [draft, setDraft] = useState<Partial<StoreSettings>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { setDraft({ ...settings }) }, [settings])

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setDraft((current) => ({ ...current, [key]: value }))

  async function save() {
    const nextErrors = {
      store_name: required('Store name')(draft.store_name),
      currency_symbol: required('Currency symbol')(draft.currency_symbol),
      invoice_prefix: required('Invoice prefix')(draft.invoice_prefix),
    }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      await api.saveSettings({
        ...draft,
        tax_rate: Number(draft.tax_rate) || 0,
        warranty_default_months: Number(draft.warranty_default_months) || 0,
      })
      await refresh()
      toast.success('Store settings saved')
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  const editable = can('settings.edit')

  return (
    <>
      <PageHeader title="Settings" description="Store identity, currency, tax and invoice preferences" actions={
        editable && <Button variant="primary" loading={busy} onClick={() => void save()} icon={<SettingsIcon size={16} />}>Save settings</Button>
      } />
      {loadError && <Card className="mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</Card>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Store identity" subtitle="Appears on invoices and receipts" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Store name" required error={errors.store_name}><Input disabled={!editable} value={draft.store_name ?? ''} onChange={(event) => set('store_name', event.target.value)} /></Field>
            <Field label="Phone"><Input disabled={!editable} value={draft.phone ?? ''} onChange={(event) => set('phone', event.target.value || null)} /></Field>
            <Field label="Email"><Input disabled={!editable} value={draft.email ?? ''} onChange={(event) => set('email', event.target.value || null)} /></Field>
            <Field label="Logo URL"><Input disabled={!editable} value={draft.logo_url ?? ''} onChange={(event) => set('logo_url', event.target.value || null)} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea disabled={!editable} value={draft.address ?? ''} onChange={(event) => set('address', event.target.value || null)} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Regional and invoice" subtitle="Bangladesh · BDT · Asia/Dhaka" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Currency"><Input disabled={!editable} value={draft.currency ?? ''} onChange={(event) => set('currency', event.target.value)} /></Field>
            <Field label="Currency symbol" required error={errors.currency_symbol}><Input disabled={!editable} value={draft.currency_symbol ?? ''} onChange={(event) => set('currency_symbol', event.target.value)} /></Field>
            <Field label="Default tax rate (%)"><Input disabled={!editable} type="number" min="0" step="0.01" value={draft.tax_rate ?? 0} onChange={(event) => set('tax_rate', Number(event.target.value))} /></Field>
            <Field label="Invoice prefix" required error={errors.invoice_prefix} hint="1–10 letters, numbers, dash or underscore"><Input disabled={!editable} value={draft.invoice_prefix ?? ''} onChange={(event) => set('invoice_prefix', event.target.value)} /></Field>
            <Field label="Default warranty (months)"><Input disabled={!editable} type="number" min="0" value={draft.warranty_default_months ?? 12} onChange={(event) => set('warranty_default_months', Number(event.target.value))} /></Field>
            <Field label="Invoice layout"><Select disabled={!editable} value={draft.invoice_layout ?? 'a4'} onChange={(event) => set('invoice_layout', event.target.value)}><option value="a4">A4</option><option value="80mm">80 mm thermal</option><option value="58mm">58 mm thermal</option></Select></Field>
            <Field label="Timezone"><Input disabled={!editable} value={draft.timezone ?? 'Asia/Dhaka'} onChange={(event) => set('timezone', event.target.value)} /></Field>
            <Field label="Receipt footer" className="sm:col-span-2"><Textarea disabled={!editable} value={draft.receipt_footer ?? ''} onChange={(event) => set('receipt_footer', event.target.value || null)} /></Field>
          </div>
        </Card>
      </div>
      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Badge tone={editable ? 'green' : 'slate'}>{editable ? 'Editing enabled' : 'Read-only'}</Badge>
          <Toggle checked={draft.currency === 'BDT'} onChange={() => toast.info('Currency is fixed to BDT for this deployment')} label="BDT (৳) — Bangladesh Taka" />
          <p className="text-xs text-slate-500">Settings are stored in the singleton database row; no secrets are kept here.</p>
        </div>
      </Card>
    </>
  )
}
