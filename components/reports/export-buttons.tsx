"use client"

import { FileSpreadsheet, FileText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { buildCsv, downloadCsv, type CsvColumn } from "@/lib/reports/csv"

export function ExportButtons<T>({
  rows,
  columns,
  filename,
}: {
  rows: T[]
  columns: CsvColumn<T>[]
  filename: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadCsv(filename, buildCsv(rows, columns))}
        disabled={rows.length === 0}
      >
        <FileSpreadsheet className="size-4" />
        Exportar Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => toast.info("Exportación a PDF disponible próximamente")}
      >
        <FileText className="size-4" />
        Exportar PDF
      </Button>
    </div>
  )
}
