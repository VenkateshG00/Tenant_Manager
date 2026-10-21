import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppStateProvider, useAppState } from './app/AppState'
import { MonthProvider } from './app/MonthProvider'
import { ToastProvider } from './app/Toast'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui/States'
import { DashboardPage } from './pages/Dashboard'
import { TenantsPage } from './pages/Tenants'
import { MetersPage } from './pages/Meters'
import { BillsPage } from './pages/Bills'
import { StatementsPage } from './pages/Statements'
import { PaymentsPage } from './pages/Payments'
import { RemindersPage } from './pages/Reminders'
import { SettingsPage } from './pages/Settings'
import { LoginPage } from './pages/Login'

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAppState()
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    )
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AppStateProvider>
      <ToastProvider>
        <MonthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="meters" element={<MetersPage />} />
                <Route path="bills" element={<BillsPage />} />
                <Route path="statements" element={<StatementsPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="reminders" element={<RemindersPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </MonthProvider>
      </ToastProvider>
    </AppStateProvider>
  )
}
