import { useState } from 'react'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, Textarea, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { Expense } from '@/lib/types'
import { downloadFile, errorMessage, formatDate, formatMoney, toCSV, toDateInput, todayInput } from '@/lib/utils'
import { firstError, minValue, required, runValidators } from '@/lib/validation'

const CATEGORIES = ['rent', 'salary', 'electricity', 'internet', 'transport', 'food', 'repair', 'marketing', 'other']

function emptyExpense(): Partial<Expense> {
  return { category: 'other', amount: 0, description: null, expense_date: todayInput(), payment_method: 'cash', receipt_url: null }
}

export function ExpensesPage() {
  const { can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState('')
  const { data: expenses, loading, error, reload } = useAsync(() => api.listExpenses({ from, to, category }), [from, to, category])

  async function save() {
    if (!editing) return
    const nextErrors = {
      amount: runValidators(Number(editing.amount), [required('Amount'), minValue('Amount', 0.01)]),
      category: required('Category')(editing.category),
      expense_date: required('Date')(editing.expense_date),
    }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      await api.saveExpense({
        ...editing,
        amount: Number(editing.amount),
        description: editing.description || null,
        payment_method: editing.payment_method || null,
        receipt_url: editing.receipt_url || null,
      })
      toast.success(editing.id ? 'Expense updated' : 'Expense recorded'); setEditing(null); await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api.deleteExpense(deleting.id); toast.success('Expense deleted'); setDeleting(null); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  function exportCSV() {
    if (!expenses?.length) { toast.info('No expenses to export'); return }
    downloadFile(`expenses-${toDateInput(new Date())}.csv`, toCSV(expenses.map((expense) => ({
      date: expense.expense_date, category: expense.category, amount: expense.amount,
      description: expense.description ?? '', payment_method: expense.payment_method ?? '',
      employee: expense.employee?.full_name ?? '',
    }))))
  }

  const total = (expenses ?? []).reduce((sum, expense) => sum + Number(expense.amount), 0)

  const columns: Array<Column<Expense>> = [
    { key: 'date', label: 'Date', render: (expense) => formatDate(expense.expense_date) },
    { key: 'category', label: 'Category', render: (expense) => <Badge tone="purple">{expense.category}</Badge> },
    { key: 'description', label: 'Description', render: (expense) => expense.description ?? '—' },
    { key: 'method', label: 'Method', render: (expense) => expense.payment_method ?? '—' },
    { key: 'employee', label: 'Recorded by', render: (expense) => expense.employee?.full_name ?? '—' },
    { key: 'amount', label: 'Amount', render: (expense) => <span className="font-semibold">{formatMoney(expense.amount, settings.currency_symbol)}</span> },
    { key: 'actions', label: '', className: 'text-right', render: (expense) => can('expenses.create') ? <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => { setErrors({}); setEditing({ ...expense }) }} aria-label="Edit expense"><Pencil size={15} /></Button>
      <Button size="sm" variant="ghost" onClick={() => setDeleting(expense)} aria-label="Delete expense"><Trash2 size={15} className="text-red-500" /></Button>
    </div> : null },
  ]

  return (
    <>
      <PageHeader title="Expenses" description={`${formatMoney(total, settings.currency_symbol)} in the selected period`} actions={
        <>{can('expenses.view') && <Button icon={<Download size={16} />} onClick={exportCSV}>Export CSV</Button>}
          {can('expenses.create') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setErrors({}); setEditing(emptyExpense()) }}>Add expense</Button>}</>
      } />
      <Card className="mb-5"><div className="flex flex-wrap gap-3 p-4">
        <Field label="Category"><Select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
        <Field label="From"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
      </div></Card>
      <Card>
        <CardHeader title={`${expenses?.length ?? 0} expenses`} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
          <DataTable columns={columns} rows={expenses ?? []} rowKey={(expense) => expense.id} empty="No expenses recorded." />
        )}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit expense' : 'Add expense'} footer={
        <><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save expense</Button></>
      }>
        {editing && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required error={errors.category}><Select value={editing.category ?? 'other'} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>{CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
          <Field label="Amount" required error={errors.amount}><Input type="number" min="0.01" step="0.01" value={editing.amount ?? 0} onChange={(event) => setEditing({ ...editing, amount: Number(event.target.value) })} /></Field>
          <Field label="Date" required error={errors.expense_date}><Input type="date" value={editing.expense_date ?? ''} onChange={(event) => setEditing({ ...editing, expense_date: event.target.value })} /></Field>
          <Field label="Payment method"><Select value={editing.payment_method ?? 'cash'} onChange={(event) => setEditing({ ...editing, payment_method: event.target.value })}>{['cash', 'bank', 'bkash', 'nagad', 'other'].map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
          <Field label="Receipt URL" className="sm:col-span-2"><Input value={editing.receipt_url ?? ''} onChange={(event) => setEditing({ ...editing, receipt_url: event.target.value || null })} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={editing.description ?? ''} onChange={(event) => setEditing({ ...editing, description: event.target.value || null })} /></Field>
        </div>}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete expense?" message={`${formatMoney(deleting?.amount ?? 0, settings.currency_symbol)} expense will be permanently removed.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
    </>
  )
}
