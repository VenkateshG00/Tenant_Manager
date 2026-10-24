import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

interface ElementWithChildren {
  children?: ReactNode
}

interface TableCellProps {
  align?: 'left' | 'right' | 'center'
  children?: ReactNode
  className?: string
  colSpan?: number
  mobileLabel?: string
}

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (isValidElement<ElementWithChildren>(node)) return textContent(node.props.children)
  return ''
}

function collectHeaders(node: ReactNode): string[] {
  const labels: string[] = []
  Children.forEach(node, (child) => {
    if (!isValidElement<ElementWithChildren>(child)) return
    if (child.type === Th) {
      labels.push(textContent(child.props.children).trim())
      return
    }
    labels.push(...collectHeaders(child.props.children))
  })
  return labels
}

function labelCells(node: ReactNode, labels: string[]): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement<ElementWithChildren>(child)) return child
    if (child.type === Tr) {
      let index = 0
      const cells = Children.map(child.props.children, (cell) => {
        if (!isValidElement<TableCellProps>(cell) || cell.type !== Td) return cell
        const mobileLabel = labels[index] || `Column ${index + 1}`
        index += 1
        return cloneElement(cell as ReactElement<TableCellProps>, { mobileLabel })
      })
      return cloneElement(child, undefined, cells)
    }
    return cloneElement(child, undefined, labelCells(child.props.children, labels))
  })
}

/**
 * Tables become labeled record cards on phones and retain their full layout on
 * larger screens.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  const labels = collectHeaders(children)
  return (
    <div className="responsive-table">
      <table className="w-full border-collapse text-sm md:min-w-[640px]">
        {labelCells(children, labels)}
      </table>
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
  mobileLabel,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  colSpan?: number
  mobileLabel?: string
}) {
  return (
    <td
      colSpan={colSpan}
      data-label={mobileLabel}
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
