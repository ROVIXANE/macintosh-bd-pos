import { useState } from 'react'
import { Copy, KeyRound, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, type Column } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { ROLE_LABELS, type Permission } from '@/lib/permissions'
import type { Profile, Role } from '@/lib/types'
import { errorMessage, formatDate } from '@/lib/utils'
import { firstError, required, runValidators, validEmail, validPhone } from '@/lib/validation'

const ASSIGNABLE: Role[] = ['admin', 'sales', 'inventory']

export function UsersPage() {
  const { can, profile: currentProfile } = useAuth()
  const toast = useToast()
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('sales')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null)
  const { data: users, loading, error, reload } = useAsync(() => api.listUsers(), [])

  async function invite() {
    const nextErrors = {
      fullName: required('Full name')(fullName),
      email: runValidators(email, [required('Email'), validEmail]),
      phone: runValidators(phone, [validPhone]),
    }
    setErrors(nextErrors)
    if (firstError(nextErrors)) return
    setBusy(true)
    try {
      const result = await api.inviteEmployee(email, fullName, role)
      setOneTimePassword(result.password)
      toast.success(result.roleAssigned ? 'Employee created and role assigned' : 'Employee created; assign their role manually')
      setEmail(''); setFullName(''); setPhone('')
      await reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function changeRole(user: Profile, nextRole: Role) {
    setBusy(true)
    try { await api.applyRole(user.id, nextRole); toast.success(`${user.full_name} is now ${ROLE_LABELS[nextRole]}`); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  async function toggleActive(user: Profile) {
    setBusy(true)
    try { await api.setActive(user.id, !user.is_active); toast.success(user.is_active ? 'Account deactivated' : 'Account activated'); await reload() }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  const columns: Array<Column<Profile>> = [
    { key: 'name', label: 'User', render: (user) => <div><p className="font-medium">{user.full_name}</p><p className="text-xs text-slate-500">{user.id.slice(0, 8)}</p></div> },
    { key: 'phone', label: 'Phone', render: (user) => user.phone ?? '—' },
    { key: 'role', label: 'Role', render: (user) => can('users.manage') && user.role !== 'owner' && user.id !== currentProfile?.id ? (
      <Select className="w-40" value={user.role} onChange={(event) => void changeRole(user, event.target.value as Role)}>
        {[...ASSIGNABLE, ...(user.role === 'owner' ? ['owner' as Role] : [])].map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
      </Select>
    ) : <Badge tone={user.role === 'owner' ? 'purple' : 'blue'}>{ROLE_LABELS[user.role]}</Badge> },
    { key: 'status', label: 'Status', render: (user) => <Badge tone={user.is_active ? 'green' : 'red'}>{user.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'created', label: 'Added', render: (user) => formatDate(user.created_at) },
    { key: 'actions', label: '', className: 'text-right', render: (user) => can('users.manage') && user.id !== currentProfile?.id ? (
      <Button size="sm" variant="ghost" loading={busy} onClick={() => void toggleActive(user)} icon={user.is_active ? <UserX size={15} /> : <UserCheck size={15} />}>
        {user.is_active ? 'Deactivate' : 'Activate'}
      </Button>
    ) : null },
  ]

  return (
    <>
      <PageHeader title="Users & Access" description="Staff accounts, roles and activation — owners are protected by database rules" actions={
        can('users.manage') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setErrors({}); setOneTimePassword(null); setInviting(true) }}>Add employee</Button>
      } />
      <Card>
        <CardHeader title={`${users?.length ?? 0} staff accounts`} subtitle={can('users.manage') ? 'Roles are applied with a security-definer RPC' : 'Read-only access'} />
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
          <DataTable columns={columns} rows={users ?? []} rowKey={(user) => user.id} empty="No staff accounts found." />
        )}
      </Card>
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-400"><ShieldCheck size={13} /> First authenticated user can claim owner access once from the setup page.</p>

      <Modal open={inviting} onClose={() => setInviting(false)} title="Add employee" footer={
        <><Button onClick={() => setInviting(false)}>Close</Button><Button variant="primary" loading={busy} onClick={() => void invite()}>Create account</Button></>
      }>
        {oneTimePassword ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><KeyRound size={16} /> One-time password</p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded bg-white p-3">
                <code className="break-all text-sm">{oneTimePassword}</code>
                <Button size="sm" icon={<Copy size={14} />} onClick={() => { void navigator.clipboard?.writeText(oneTimePassword); toast.info('Password copied') }}>Copy</Button>
              </div>
            </div>
            <p className="text-sm text-slate-600">Share this password privately. It is shown only now and is not stored in the browser. Ask the employee to change it after signing in.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.fullName}><Input value={fullName} onChange={(event) => setFullName(event.target.value)} /></Field>
            <Field label="Email" required error={errors.email}><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label="Phone" error={errors.phone}><Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01712345678" /></Field>
            <Field label="Role"><Select value={role} onChange={(event) => setRole(event.target.value as Role)}>{ASSIGNABLE.map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}</Select></Field>
            <p className="text-xs text-slate-500 sm:col-span-2">The account is created through a temporary auth client so the signed-in owner session is not replaced. If email confirmation is enabled in Supabase, the employee must confirm before signing in.</p>
          </div>
        )}
      </Modal>
    </>
  )
}
