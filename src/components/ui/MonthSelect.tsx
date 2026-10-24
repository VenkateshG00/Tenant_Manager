import { useMonth } from '../../app/MonthProvider'
import { formatMonth } from '../../lib/dates'

/** Billing-month selector used on the dashboard, statements and bills pages. */
export function MonthSelect({ label = 'Billing month' }: { label?: string }) {
  const { month, setMonth, months } = useMonth()
  return (
    <label className="flex w-full max-w-full flex-wrap items-center gap-2 text-sm text-slate-600 sm:w-auto sm:flex-nowrap">
      <span className="whitespace-nowrap font-medium">{label}</span>
      <select
        value={month}
        onChange={(event) => setMonth(event.target.value)}
        className="min-w-0 max-w-full flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:flex-none"
      >
        {months.map((key) => (
          <option key={key} value={key}>
            {formatMonth(key)}
          </option>
        ))}
      </select>
    </label>
  )
}
