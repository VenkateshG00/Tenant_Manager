import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { isDemoMode } from '../app/env'

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/tenants', label: 'Tenants', icon: 'tenants' },
  { to: '/meters', label: 'Electricity Meters', icon: 'meters' },
  { to: '/bills', label: 'Electricity Bills', icon: 'bills' },
  { to: '/statements', label: 'Monthly Statements', icon: 'statements' },
  { to: '/payments', label: 'Payments', icon: 'payments' },
  { to: '/reminders', label: 'Reminder History', icon: 'reminders' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

type NavIconName = (typeof NAV)[number]['icon']

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
    tenants: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14a5 5 0 0 1 3 4.6V20" /></>,
    meters: <><path d="M13 2 4 13h7l-1 9 10-13h-7l1-7Z" /></>,
    bills: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></>,
    statements: <><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" /></>,
    payments: <><path d="M12 3v18M17 7H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" /></>,
    reminders: <><path d="M5 4h4l2 5-2.5 1.5a15 15 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1L11 7.4h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px]"
    >
      {paths[name]}
    </svg>
  )
}

export function Layout() {
  const { email, signOut } = useAppState()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 pt-[env(safe-area-inset-top)] shadow-[0_8px_24px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="shrink-0 rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="primary-nav"
              aria-label="Toggle navigation menu"
            >
              ☰
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-700 to-slate-900 text-sm font-bold text-white shadow-md shadow-indigo-950/15">
              T
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold tracking-tight text-slate-950 sm:text-base">
                Tenant Manager
              </p>
              <p className="truncate text-[11px] font-medium tracking-wide text-slate-500">
                RENT &amp; UTILITIES <span className="px-1 text-indigo-400">·</span> TELANGANA
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {email && <span className="hidden max-w-48 truncate text-xs text-slate-500 md:inline">{email}</span>}
            {!isDemoMode && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-950"
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
            'border-t border-slate-100/80 bg-white/80',
            open ? 'block' : 'hidden',
            'md:block',
          ].join(' ')}
        >
          <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-2 py-2 md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-1.5 md:px-4 md:py-2">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors',
                      isActive || (item.to !== '/' && location.pathname.startsWith(item.to))
                        ? 'bg-indigo-950 text-white shadow-md shadow-indigo-950/10'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-950',
                    ].join(' ')
                  }
                >
                  <span aria-hidden="true" className="flex w-4 items-center justify-center opacity-80">
                    <NavIcon name={item.icon} />
                  </span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] text-xs text-slate-400 sm:px-6 lg:px-8">
        Amounts in INR (₹) · Dates in Asia/Kolkata · WhatsApp reminders are sent manually by the
        administrator.
      </footer>
    </div>
  )
}
