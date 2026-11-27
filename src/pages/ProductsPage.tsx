import { useRef, useState } from 'react'
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, ErrorState, Field, Input,
  LoadingState, Modal, PageHeader, Select, Textarea, Toggle, type Column,
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Brand, Category, Product, ProductInput, Supplier } from '@/lib/types'
import { downloadFile, errorMessage, formatMoney, parseCSV, toCSV, toDateInput } from '@/lib/utils'
import { firstError, required, runValidators, validSku } from '@/lib/validation'

type Draft = Partial<Product> & { id?: string }

function emptyDraft(): Draft {
  return {
    name: '', sku: '', barcode: null, model: null, description: null,
    category_id: null, brand_id: null, supplier_id: null, condition: 'new',
    product_type: null, purchase_price: 0, selling_price: 0, min_selling_price: 0,
    reorder_level: 0, warranty_months: 12, image_url: null, is_serialized: false,
    is_active: true, cpu: null, cpu_generation: null, ram: null, ram_type: null,
    storage_capacity: null, storage_type: null, gpu: null, display_size: null,
    resolution: null, refresh_rate: null, touchscreen: false, operating_system: null,
  }
}

export function ProductsPage() {
  const { can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)
  const { data: products, loading, error, reload } = useAsync(() => api.listProducts(), [])
  const { data: categories } = useAsync(() => api.listCategories(), [])
  const { data: brands } = useAsync(() => api.listBrands(), [])
  const { data: suppliers } = useAsync(() => api.listSuppliers(), [])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current)

  function openNew() { setErrors({}); setDraft(emptyDraft()) }
  function openEdit(product: Product) {
    const { id, created_at: _c, updated_at: _u, stock_quantity: _s, is_archived: _a, ...rest } = product
    void _c; void _u; void _s; void _a
    setErrors({}); setDraft({ ...rest, id })
  }

  async function save() {
    if (!draft) return
    const nextErrors = { name: required('Product name')(draft.name), sku: runValidators(draft.sku ?? '', [required('SKU'), validSku]) }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      const { id, ...payload } = draft
      // Stock is intentionally omitted: it changes only through purchases, adjustments, returns and sales.
      await api.saveProduct({ ...payload, id } as ProductInput)
      toast.success(id ? 'Product updated' : 'Product created with zero stock')
      setDraft(null); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api.deleteProduct(deleting.id); toast.success('Product archived'); setDeleting(null); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  function exportCSV() {
    if (!products?.length) { toast.info('No products to export'); return }
    downloadFile(`products-${toDateInput(new Date())}.csv`, toCSV(products.map((product) => ({
      name: product.name, sku: product.sku, barcode: product.barcode ?? '', model: product.model ?? '',
      category: categories?.find((c) => c.id === product.category_id)?.name ?? '',
      brand: brands?.find((b) => b.id === product.brand_id)?.name ?? '',
      purchase_price: product.purchase_price, selling_price: product.selling_price,
      min_selling_price: product.min_selling_price, reorder_level: product.reorder_level,
      warranty_months: product.warranty_months, condition: product.condition,
      is_serialized: product.is_serialized, cpu: product.cpu ?? '', ram: product.ram ?? '',
      storage_capacity: product.storage_capacity ?? '', operating_system: product.operating_system ?? '',
      description: product.description ?? '',
    }))))
    toast.success(`Exported ${products.length} products`)
  }

  async function importCSV(file: File) {
    const rows = parseCSV(await file.text())
    if (!rows.length) { toast.error('CSV has no data rows'); return }
    let imported = 0
    for (const row of rows) {
      const sku = (row.sku ?? '').trim()
      if (!sku || !row.name) continue
      try {
        await api.saveProduct({
          ...emptyDraft(), name: row.name.trim(), sku, barcode: row.barcode || null,
          selling_price: Number(row.selling_price) || 0, purchase_price: Number(row.purchase_price) || 0,
          min_selling_price: Number(row.min_selling_price) || 0, reorder_level: Number(row.reorder_level) || 0,
          warranty_months: Number(row.warranty_months) || 12, condition: (row.condition || 'new') as Product['condition'],
          is_serialized: /true|yes|1/i.test(row.is_serialized ?? ''), cpu: row.cpu || null, ram: row.ram || null,
          storage_capacity: row.storage_capacity || null, operating_system: row.operating_system || null,
          description: row.description || null,
        } as ProductInput)
        imported += 1
      } catch (err) { toast.error(`${sku}: ${errorMessage(err)}`) }
    }
    toast.success(`Imported ${imported} products`)
    await reload()
  }

  const columns: Array<Column<Product>> = [
    { key: 'name', label: 'Product', render: (p) => <div><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.sku}{p.model ? ` · ${p.model}` : ''}</p></div> },
    { key: 'category', label: 'Category', render: (p) => categories?.find((c) => c.id === p.category_id)?.name ?? '—' },
    { key: 'stock', label: 'Stock', render: (p) => <Badge tone={p.stock_quantity <= 0 ? 'red' : p.stock_quantity <= p.reorder_level ? 'amber' : 'green'}>{p.stock_quantity}</Badge> },
    { key: 'price', label: 'Selling price', render: (p) => formatMoney(p.selling_price, settings.currency_symbol) },
    { key: 'serialized', label: 'Type', render: (p) => p.is_serialized ? <Badge tone="purple">Serialized</Badge> : <Badge>Bulk</Badge> },
    { key: 'status', label: 'Status', render: (p) => <Badge tone={p.is_active && !p.is_archived ? 'green' : 'slate'}>{p.is_archived ? 'Archived' : p.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: '', className: 'text-right', render: (p) => <div className="flex justify-end gap-1">
      {can('products.edit') && <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label="Edit product"><Pencil size={15} /></Button>}
      {can('products.delete') && <Button size="sm" variant="ghost" onClick={() => setDeleting(p)} aria-label="Archive product"><Trash2 size={15} className="text-red-500" /></Button>}
    </div> },
  ]

  return (
    <>
      <PageHeader title="Products" description="Catalog and computer specifications — stock is never edited here" actions={
        <>
          <Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>
          {can('products.create') && <Button icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>Import CSV</Button>}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCSV(file); event.target.value = '' }} />
          {can('products.create') && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>New product</Button>}
        </>
      } />
      <Card>
        <CardHeader title={`${products?.length ?? 0} products`} subtitle="CSV import creates products with zero stock" />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : <DataTable columns={columns} rows={products ?? []} rowKey={(p) => p.id} empty="No products yet. Add one or apply the SQL migrations." />}
      </Card>

      <Modal open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? 'Edit product' : 'New product'} size="xl" footer={
        <><Button onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save product</Button></>
      }>
        {draft && <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Product name" required error={errors.name}><Input value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="SKU" required error={errors.sku}><Input value={draft.sku ?? ''} onChange={(e) => set('sku', e.target.value)} /></Field>
            <Field label="Barcode"><Input value={draft.barcode ?? ''} onChange={(e) => set('barcode', e.target.value || null)} /></Field>
            <Field label="Model"><Input value={draft.model ?? ''} onChange={(e) => set('model', e.target.value || null)} /></Field>
            <Field label="Category"><Select value={draft.category_id ?? ''} onChange={(e) => set('category_id', e.target.value || null)}><option value="">—</option>{categories?.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Brand"><Select value={draft.brand_id ?? ''} onChange={(e) => set('brand_id', e.target.value || null)}><option value="">—</option>{brands?.map((b: Brand) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="Supplier"><Select value={draft.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value || null)}><option value="">—</option>{suppliers?.map((s: Supplier) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Condition"><Select value={draft.condition ?? 'new'} onChange={(e) => set('condition', e.target.value as Product['condition'])}>{['new', 'used', 'refurbished'].map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
            <Field label="Purchase price"><Input type="number" min="0" step="0.01" value={draft.purchase_price ?? 0} onChange={(e) => set('purchase_price', Number(e.target.value))} /></Field>
            <Field label="Selling price"><Input type="number" min="0" step="0.01" value={draft.selling_price ?? 0} onChange={(e) => set('selling_price', Number(e.target.value))} /></Field>
            <Field label="Minimum selling price"><Input type="number" min="0" step="0.01" value={draft.min_selling_price ?? 0} onChange={(e) => set('min_selling_price', Number(e.target.value))} /></Field>
            <Field label="Reorder level"><Input type="number" min="0" step="0.001" value={draft.reorder_level ?? 0} onChange={(e) => set('reorder_level', Number(e.target.value))} /></Field>
            <Field label="Warranty (months)"><Input type="number" min="0" value={draft.warranty_months ?? 0} onChange={(e) => set('warranty_months', Number(e.target.value))} /></Field>
            <Field label="Image URL"><Input value={draft.image_url ?? ''} onChange={(e) => set('image_url', e.target.value || null)} /></Field>
          </div>
          <div className="flex flex-wrap gap-6 rounded-lg bg-slate-50 p-3">
            <Toggle checked={Boolean(draft.is_serialized)} onChange={(value) => set('is_serialized', value)} label="Track individual serial numbers" />
            <Toggle checked={draft.is_active !== false} onChange={(value) => set('is_active', value)} label="Active" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Computer specifications</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {([['cpu', 'CPU'], ['cpu_generation', 'CPU generation'], ['ram', 'RAM'], ['ram_type', 'RAM type'], ['storage_capacity', 'Storage'], ['storage_type', 'Storage type'], ['gpu', 'GPU'], ['display_size', 'Display'], ['resolution', 'Resolution'], ['refresh_rate', 'Refresh rate'], ['operating_system', 'OS']] as const).map(([key, label]) => (
                <Field key={key} label={label}><Input value={String(draft[key] ?? '')} onChange={(e) => set(key, e.target.value || null)} /></Field>
              ))}
            </div>
            <div className="mt-3"><Toggle checked={Boolean(draft.touchscreen)} onChange={(value) => set('touchscreen', value)} label="Touchscreen" /></div>
          </div>
          <Field label="Description"><Textarea value={draft.description ?? ''} onChange={(e) => set('description', e.target.value || null)} /></Field>
          {draft.id && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Current stock: {products?.find((p) => p.id === draft.id)?.stock_quantity ?? 0}. Use purchases, stock adjustments, returns or sales to change it.</p>}
        </div>}
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Archive product?" message={`${deleting?.name ?? ''} will be hidden from POS and reports. Historical invoice lines remain intact.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
    </>
  )
}
