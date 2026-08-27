import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number
  pageSize: number
  total: number
  buildHref: (page: number) => string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between border-t border-border px-1 pt-4">
      <p className="text-sm text-muted-foreground">
        Página {page} de {totalPages} · {total} resultados
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
          {page > 1 ? (
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="size-4" />
              Anterior
            </Link>
          ) : (
            <span>
              <ChevronLeft className="size-4" />
              Anterior
            </span>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
          {page < totalPages ? (
            <Link href={buildHref(page + 1)}>
              Siguiente
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span>
              Siguiente
              <ChevronRight className="size-4" />
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}
