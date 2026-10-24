export type CsvValue = string | number | null | undefined

function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  const negativeNumber = /^-\d+(?:\.\d+)?$/.test(text)
  if (typeof value === 'string' && !negativeNumber && /^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`
  }
  return `"${text.replaceAll('"', '""')}"`
}

export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: readonly (readonly CsvValue[])[]): void {
  const blob = new Blob(['\uFEFF', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
