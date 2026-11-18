"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarRange, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/finance/periods"

/** Filtro de período. Se guarda en la URL (?periodo=&desde=&hasta=) para poder compartir el enlace. */
export function PeriodFilter({
  periodKey,
  from,
  to,
  today,
}: {
  periodKey: PeriodKey
  from: string
  to: string
  today: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [key, setKey] = useState<PeriodKey>(periodKey)
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)

  const go = (query: string) => startTransition(() => router.push(`/finanzas?${query}`))
  const rangeInvalid = !customFrom || !customTo || customFrom > customTo

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      <Select
        value={key}
        onValueChange={(value) => {
          const next = value as PeriodKey
          setKey(next)
          if (next !== "rango") go(`periodo=${next}`)
        }}
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Período">
          <CalendarRange className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {key === "rango" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Desde"
            className="w-full sm:w-38"
            value={customFrom}
            max={today}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">a</span>
          <Input
            type="date"
            aria-label="Hasta"
            className="w-full sm:w-38"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
          <Button
            size="sm"
            disabled={rangeInvalid || pending}
            onClick={() => go(`periodo=rango&desde=${customFrom}&hasta=${customTo}`)}
          >
            Aplicar
          </Button>
        </div>
      )}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando" />}
    </div>
  )
}
