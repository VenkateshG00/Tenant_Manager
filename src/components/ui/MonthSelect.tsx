import { useMonth } from '../../app/MonthProvider'
import { formatMonth } from '../../lib/dates'

/** Billing-month selector used on the dashboard, statements and bills pages. */
export function MonthSelect({ label = 'Billing month' }: { label?: string }) {
  const { month, setMonth, months } = useMonth()
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="whitespace-nowrap font-medium">{label}</span>
      <select
        value={month}
        onChange={(event) => setMonth(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
