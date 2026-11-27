import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3, Boxes, CalendarDays, ClipboardList, CreditCard, FileText, LayoutDashboard,
  LogOut, Menu, Package, ReceiptText, RotateCcw, Settings as SettingsIcon, ShoppingCart,
  ShieldCheck, Store, Truck, Users, Wallet, Wrench, X,
} from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { checkConnection, configHint, type ConnectionState } from '@/lib/supabase'
import { ROLE_LABELS, type Permission } from '@/lib/permissions'
import { classNames } from '@/lib/utils'

interface NavItem { to: string; label: string; icon: ReactNode; permission?: Permission }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, permission: 'dashboard.view' },
  { to: '/pos', label: 'Point of Sale', icon: <ShoppingCart size={18} />, permission: 'pos.access' },
  { to: '/products', label: 'Products', icon: <Package size={18} />, permission: 'products.view' },
  { to: '/inventory', label: 'Inventory', icon: <Boxes size={18} />, permission: 'inventory.view' },
  { to: '/serials', label: 'Serial Numbers', icon: <ClipboardList size={18} />, permission: 'serials.view' },
  { to: '/purchases', label: 'Purchases', icon: <Truck size={18} />, permission: 'purchases.view' },
  { to: '/sales', label: 'Sales', icon: <ReceiptText size={18} />, permission: 'sales.view' },
  { to: '/invoices', label: 'Invoices', icon: <FileText size={18} />, permission: 'invoices.view' },
  { to: '/customers', label: 'Customers', icon: <Users size={18} />, permission: 'customers.view' },
  { to: '/suppliers', label: 'Suppliers', icon: <Store size={18} />, permission: 'suppliers.view' },
  { to: '/returns', label: 'Returns', icon: <RotateCcw size={18} />, permission: 'returns.view' },
  { to: '/warranty', label: 'Warranty & Repairs', icon: <Wrench size={18} />, permission: 'warranty.view' },
  { to: '/expenses', label: 'Expenses', icon: <CreditCard size={18} />, permission: 'expenses.view' },
  { to: '/cash', label: 'Cash Drawer', icon: <Wallet size={18} />, permission: 'cash.view' },
  { to: '/reports', label: 'Reports', icon: <BarChart3 size={18} />, permission: 'reports.view' },
  { to: '/users', label: 'Users & Access', icon: <ShieldCheck size={18} />, permission: 'users.view' },
  { to: '/audit', label: 'Audit Logs', icon: <CalendarDays size={18} />, permission: 'audit.view' },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon size={18} />, permission: 'settings.view' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut, can } = useAuth()
  const { settings } = useSettings()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [connection, setConnection] = useState<{ state: ConnectionState; message: string }>({ state: 'checking', message: configHint })

  useEffect(() => { void checkConnection().then(setConnection) }, [])
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const visible = NAV.filter((item) => !item.permission || can(item.permission))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">M</span>
          <span className="hidden sm:inline">{settings.store_name}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span title={connection.message} className="hidden items-center gap-1.5 sm:flex">
            <span className={classNames('h-2 w-2 rounded-full', {
              'bg-emerald-500': connection.state === 'connected',
              'bg-amber-500': connection.state === 'checking',
              'bg-red-500': ['unauthorized', 'error', 'not_configured'].includes(connection.state),
            })} />
            <span className="text-xs text-slate-500">{connection.state.replace('_', ' ')}</span>
          </span>
          <Badge tone="purple">{profile?.role ? ROLE_LABELS[profile.role] : 'No role'}</Badge>
          <span className="hidden text-sm text-slate-600 md:inline">{profile?.full_name}</span>
          <Button size="sm" variant="ghost" onClick={() => void signOut()} aria-label="Sign out" icon={<LogOut size={16} />}>Sign out</Button>
        </div>
      </header>

      <div className="flex">
        <aside className={classNames(
          'no-print fixed inset-y-14 left-0 z-20 w-64 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}>
          <nav className="space-y-0.5">
            {visible.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => classNames(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
              )}>
                {item.icon}<span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Macintosh BD</p>
            <p>Dhaka, Bangladesh · {settings.currency} ({settings.currency_symbol})</p>
            <p className="mt-1">{connection.message}</p>
          </div>
        </aside>
        {menuOpen && <button className="fixed inset-0 z-10 bg-slate-900/30 lg:hidden" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
