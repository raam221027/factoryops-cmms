export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | boolean | null | undefined
}

function escape(value: unknown): string {
  if (value == null) return ''
  let s = String(value)
  // Neutralise spreadsheet formula injection from user-entered text.
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escape(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => escape(c.value(row))).join(','))
  return lines.join('\r\n')
}

/** Downloads rows as a UTF-8 CSV (with BOM so Excel detects the encoding). */
export function downloadCsv<T>(fileName: string, rows: T[], columns: CsvColumn<T>[]) {
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
