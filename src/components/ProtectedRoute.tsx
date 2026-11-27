import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Card, LoadingState } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import type { Permission } from '@/lib/permissions'

export function ProtectedRoute({ children, permission, anyOf }: {
  children: ReactNode; permission?: Permission; anyOf?: Permission[]
}) {
  const { session, profile, loading, can, canAny } = useAuth()
  const location = useLocation()

  if (loading) return <div className="p-10"><LoadingState label="Restoring session…" /></div>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) return <Navigate to="/setup" replace />
  if (profile.is_active === false) return <Navigate to="/login" replace />

  const allowed = (!permission || can(permission)) && (!anyOf || canAny(anyOf))
  if (!allowed) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <ShieldAlert size={36} className="mx-auto mb-3 text-amber-500" />
        <h1 className="text-lg font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">Your role does not have permission to open this section. Ask the owner or admin if you need access.</p>
      </Card>
    )
  }
  return <>{children}</>
}
