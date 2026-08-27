export interface CsvColumn<T> {
  header: string
  accessor: (row: T) => string | number
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (value: string | number) => {
    const str = String(value)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }

  const header = columns.map((c) => escape(c.header)).join(",")
  const body = rows.map((row) => columns.map((c) => escape(c.accessor(row))).join(","))
  return [header, ...body].join("\n")
}

/** Descarga un CSV en el navegador. Excel lo abre nativamente. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
