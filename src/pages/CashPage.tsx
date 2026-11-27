import { useState } from 'react'
import { Banknote, LockKeyhole, Plus, UnlockKeyhole, Wallet } from 'lucide-react'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, PageHeader, Select, StatCard, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import type { CashMovement, CashShift } from '@/lib/types'
import { errorMessage, formatDateTime, formatMoney } from '@/lib/utils'
import { firstError, minValue, required, runValidators } from '@/lib/validation'

export function CashPage() {
  const { session, can } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [opening, setOpening] = useState('0')
  const [openNotes, setOpenNotes] = useState('')
  const [closing, setClosing] = useState('0')
  const [closeNotes, setCloseNotes] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDescription, setMovementDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const { data: shifts, loading, error, reload: reloadShifts } = useAsync(() => api.listShifts(), [])
  const { data: movements, reload: reloadMovements } = useAsync(() => api.listCashMovements(shiftId || undefined), [shiftId])

  const openShifts = (shifts ?? []).filter((shift) => shift.status === 'open')
  const myOpenShift = openShifts.find((shift) => shift.employee_id === session?.user.id)
  const activeShift = shiftId ? openShifts.find((shift) => shift.id === shiftId) : myOpenShift ?? openShifts[0]

  async function open() {
    const nextErrors = { opening: runValidators(Number(opening), [required('Opening balance'), minValue('Opening balance', 0)]) }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      const result = await api.openShift(Number(opening), openNotes)
      toast.success('Cash shift opened')
      setShiftId(result.shift_id); setOpening('0'); setOpenNotes('')
      await reloadShifts()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function close() {
    if (!activeShift) { toast.error('Select an open shift'); return }
    setBusy(true)
    try {
      await api.closeShift(activeShift.id, Number(closing), closeNotes)
      toast.success('Cash shift closed and variance recorded')
      setClosing('0'); setCloseNotes(''); setShiftId('')
      await Promise.all([reloadShifts(), reloadMovements()])
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function addMovement() {
    if (!activeShift) { toast.error('Open a cash shift first'); return }
    const nextErrors = { amount: runValidators(Number(movementAmount), [required('Amount'), minValue('Amount', 0.01)]) }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      await api.addCashMovement({ shift_id: activeShift.id, movement_type: movementType, amount: Number(movementAmount), description: movementDescription })
      toast.success('Cash movement recorded')
      setMovementAmount(''); setMovementDescription('')
      await reloadMovements()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  const columns: Array<Column<CashMovement>> = [
    { key: 'date', label: 'Time', render: (movement) => formatDateTime(movement.created_at) },
    { key: 'type', label: 'Type', render: (movement) => <Badge tone={movement.movement_type === 'cash_in' ? 'green' : movement.movement_type === 'cash_out' ? 'red' : 'blue'}>{movement.movement_type.replace('_', ' ')}</Badge> },
    { key: 'amount', label: 'Amount', render: (movement) => formatMoney(movement.amount, settings.currency_symbol) },
    { key: 'description', label: 'Description', render: (movement) => movement.description ?? '—' },
  ]

  return (
    <>
      <PageHeader title="Cash Drawer" description="Open and close shifts, record cash in/out and reconcile variances" />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open shifts" value={String(openShifts.length)} icon={<Wallet size={20} />} tone="green" />
        <StatCard label="My shift" value={myOpenShift ? 'Open' : 'Closed'} icon={myOpenShift ? <UnlockKeyhole size={20} /> : <LockKeyhole size={20} />} tone={myOpenShift ? 'green' : 'amber'} />
        <StatCard label="Opening balance" value={formatMoney(activeShift?.opening_balance ?? 0, settings.currency_symbol)} icon={<Banknote size={20} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Open a shift" subtitle="Only one open shift per employee" />
          <div className="space-y-4 p-5">
            <Field label="Opening balance" error={errors.opening}><Input type="number" min="0" step="0.01" value={opening} onChange={(event) => setOpening(event.target.value)} /></Field>
            <Field label="Notes"><Input value={openNotes} onChange={(event) => setOpenNotes(event.target.value)} /></Field>
            <Button variant="primary" loading={busy} disabled={Boolean(myOpenShift) || !can('cash.manage')} onClick={() => void open()} icon={<Plus size={16} />}>Open shift</Button>
            {myOpenShift && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">You already have an open shift. Close it before opening another.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Close a shift" subtitle="Expected closing is calculated from cash payments and movements" />
          <div className="space-y-4 p-5">
            <Field label="Shift">
              <Select value={activeShift?.id ?? ''} onChange={(event) => setShiftId(event.target.value)}>
                <option value="">Select open shift</option>
                {openShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.employee?.full_name ?? shift.employee_id.slice(0, 8)} · {formatDateTime(shift.opened_at)}</option>)}
              </Select>
            </Field>
            <Field label="Actual closing amount"><Input type="number" min="0" step="0.01" value={closing} onChange={(event) => setClosing(event.target.value)} /></Field>
            <Field label="Notes"><Input value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} /></Field>
            <Button variant="primary" loading={busy} disabled={!activeShift || !can('cash.manage')} onClick={() => void close()} icon={<LockKeyhole size={16} />}>Close shift</Button>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Cash movement" subtitle="Cash in/out requires an open shift" />
        <div className="flex flex-wrap items-end gap-3 p-5">
          <Field label="Type"><Select value={movementType} onChange={(event) => setMovementType(event.target.value as 'cash_in' | 'cash_out')}><option value="cash_in">Cash in</option><option value="cash_out">Cash out</option></Select></Field>
          <Field label="Amount" error={errors.amount}><Input type="number" min="0.01" step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} /></Field>
          <Field label="Description"><Input value={movementDescription} onChange={(event) => setMovementDescription(event.target.value)} /></Field>
          <Button loading={busy} disabled={!activeShift || !can('cash.manage')} onClick={() => void addMovement()}>Record movement</Button>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Movements for selected shift" subtitle={activeShift ? `${openShifts.find((s) => s.id === activeShift.id) ? 'Open' : 'Closed'} · ${formatDateTime(activeShift.opened_at)}` : 'No shift selected'} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reloadShifts()} /> : (
          <DataTable columns={columns} rows={movements ?? []} rowKey={(movement) => movement.id} empty="No cash movements for this shift." />
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title={`${shifts?.length ?? 0} shifts`} />
        <DataTable columns={[
          { key: 'open', label: 'Opened', render: (shift: CashShift) => formatDateTime(shift.opened_at) },
          { key: 'employee', label: 'Employee', render: (shift: CashShift) => shift.employee?.full_name ?? shift.employee_id.slice(0, 8) },
          { key: 'opening', label: 'Opening', render: (shift: CashShift) => formatMoney(shift.opening_balance, settings.currency_symbol) },
          { key: 'expected', label: 'Expected', render: (shift: CashShift) => shift.expected_closing == null ? '—' : formatMoney(shift.expected_closing, settings.currency_symbol) },
          { key: 'actual', label: 'Actual', render: (shift: CashShift) => shift.actual_closing == null ? '—' : formatMoney(shift.actual_closing, settings.currency_symbol) },
          { key: 'difference', label: 'Variance', render: (shift: CashShift) => shift.difference == null ? '—' : <Badge tone={shift.difference === 0 ? 'green' : 'red'}>{formatMoney(shift.difference, settings.currency_symbol)}</Badge> },
          { key: 'status', label: 'Status', render: (shift: CashShift) => <Badge tone={shift.status === 'open' ? 'green' : 'slate'}>{shift.status}</Badge> },
        ]} rows={shifts ?? []} rowKey={(shift) => shift.id} empty="No cash shifts recorded." />
      </Card>
    </>
  )
}
