import type { ReactNode } from 'react'

/**
 * Responsive table wrapper: horizontally scrollable on small screens so no
 * column is ever clipped off-screen.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
  className = '',
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  return (
    <th
      scope="col"
      className={[
        'border-b border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  className = '',
  colSpan,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      className={[
        'border-b border-slate-100 px-4 py-3 align-middle text-slate-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </td>
  )
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="hover:bg-slate-50/70">{children}</tr>
}
