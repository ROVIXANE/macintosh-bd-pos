import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuditPage } from '@/pages/AuditPage'
import { CashPage } from '@/pages/CashPage'
import { CustomerHistoryPage, CustomersPage } from '@/pages/CustomersPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { InvoiceDetailPage, InvoicesPage } from '@/pages/InvoicesPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { POSPage } from '@/pages/POSPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { PurchasesPage } from '@/pages/PurchasesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ReturnsPage } from '@/pages/ReturnsPage'
import { SalesPage } from '@/pages/SalesPage'
import { SerialsPage } from '@/pages/SerialsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SetupPage } from '@/pages/SetupPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { UsersPage } from '@/pages/UsersPage'
import { WarrantyPage } from '@/pages/WarrantyPage'

function ProtectedLayout() {
  return <ProtectedRoute><AppShell><Outlet /></AppShell></ProtectedRoute>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="pos" element={<ProtectedRoute permission="pos.access"><POSPage /></ProtectedRoute>} />
        <Route path="products" element={<ProtectedRoute permission="products.view"><ProductsPage /></ProtectedRoute>} />
        <Route path="inventory" element={<ProtectedRoute permission="inventory.view"><InventoryPage /></ProtectedRoute>} />
        <Route path="serials" element={<ProtectedRoute permission="serials.view"><SerialsPage /></ProtectedRoute>} />
        <Route path="customers" element={<ProtectedRoute permission="customers.view"><CustomersPage /></ProtectedRoute>} />
        <Route path="customers/:id" element={<ProtectedRoute permission="customers.view"><CustomerHistoryPage /></ProtectedRoute>} />
        <Route path="suppliers" element={<ProtectedRoute permission="suppliers.view"><SuppliersPage /></ProtectedRoute>} />
        <Route path="purchases" element={<ProtectedRoute permission="purchases.view"><PurchasesPage /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute permission="sales.view"><SalesPage /></ProtectedRoute>} />
        <Route path="invoices" element={<ProtectedRoute permission="invoices.view"><InvoicesPage /></ProtectedRoute>} />
        <Route path="invoices/:id" element={<ProtectedRoute permission="invoices.view"><InvoiceDetailPage /></ProtectedRoute>} />
        <Route path="returns" element={<ProtectedRoute permission="returns.view"><ReturnsPage /></ProtectedRoute>} />
        <Route path="warranty" element={<ProtectedRoute permission="warranty.view"><WarrantyPage /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute permission="expenses.view"><ExpensesPage /></ProtectedRoute>} />
        <Route path="cash" element={<ProtectedRoute permission="cash.view"><CashPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute permission="reports.view"><ReportsPage /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute permission="users.view"><UsersPage /></ProtectedRoute>} />
        <Route path="audit" element={<ProtectedRoute permission="audit.view"><AuditPage /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute permission="settings.view"><SettingsPage /></ProtectedRoute>} />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  )
}
