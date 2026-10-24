import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { isDemoMode } from '../app/env'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▤', end: true },
  { to: '/tenants', label: 'Tenants', icon: '☺' },
  { to: '/meters', label: 'Electricity Meters', icon: '⚡' },
  { to: '/bills', label: 'Electricity Bills', icon: '▦' },
  { to: '/statements', label: 'Monthly Statements', icon: '☰' },
  { to: '/payments', label: 'Payments', icon: '₹' },
  { to: '/reminders', label: 'Reminder History', icon: '✆' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export function Layout() {
  const { email, signOut } = useAppState()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="primary-nav"
              aria-label="Toggle navigation menu"
            >
              ☰
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-900">Rent &amp; Electricity Manager</p>
              <p className="text-xs text-slate-500">Telangana · TGNPDCL · INR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {email && <span className="hidden text-xs text-slate-500 sm:inline">{email}</span>}
            {!isDemoMode && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        {isDemoMode && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
            DEMO MODE — Supabase is not configured. All data below is fictional sample data and is
            not saved anywhere.
          </div>
        )}

        <nav
          id="primary-nav"
          aria-label="Primary navigation"
          className={[
            'border-t border-slate-100 bg-white',
            open ? 'block' : 'hidden',
            'md:block',
          ].join(' ')}
        >
          <ul className="mx-auto flex max-w-7xl flex-col gap-0.5 px-2 py-2 md:flex-row md:flex-wrap md:items-center md:justify-start md:gap-1 md:py-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive || (item.to !== '/' && location.pathname.startsWith(item.to))
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    ].join(' ')
                  }
                >
                  <span aria-hidden="true" className="w-4 text-center">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] text-xs text-slate-400 sm:px-6 lg:px-8">
        Amounts in INR (₹) · Dates in Asia/Kolkata · WhatsApp reminders are sent manually by the
        administrator.
      </footer>
    </div>
  )
}
