"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WEEKDAY_LABELS } from "@/lib/finance/fixed-days"
import type { LoanFrequency } from "@/types/database.types"

export interface FixedDayValue {
  days: number[]
  weekday: number | null
}

/**
 * "Día fijo" según la frecuencia:
 *  - Mensual: 1 día del mes
 *  - Quincenal: 2 días del mes
 *  - Semanal: 1 día de la semana
 * La validación vive en lib/finance/fixed-days (validateFixedSchedule).
 * Quien lo usa debe darle `key={frequency}` para reiniciarlo al cambiar la frecuencia.
 */
export function FixedDayInput({
  frequency,
  value,
  onChange,
  disabled,
}: {
  frequency: LoanFrequency
  value: FixedDayValue
  onChange: (value: FixedDayValue) => void
  disabled?: boolean
}) {
  const [first, setFirst] = useState(value.days[0] ? String(value.days[0]) : "")
  const [second, setSecond] = useState(value.days[1] ? String(value.days[1]) : "")

  if (frequency === "weekly") {
    return (
      <Select
        value={value.weekday ? String(value.weekday) : ""}
        onValueChange={(v) => onChange({ days: [], weekday: Number(v) })}
        disabled={disabled}
      >
        <SelectTrigger className="w-full" aria-label="Día de la semana">
          <SelectValue placeholder="Elige el día de la semana" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(WEEKDAY_LABELS).map(([n, label]) => (
            <SelectItem key={n} value={n}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  const twoDays = frequency === "biweekly"

  function emit(a: string, b: string) {
    const parts = twoDays ? [a, b] : [a]
    onChange({ days: parts.filter((x) => x.trim() !== "").map(Number), weekday: null })
  }

  const inputProps = {
    type: "number",
    inputMode: "numeric" as const,
    min: 1,
    max: 31,
    placeholder: "Día",
    disabled,
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        {...inputProps}
        aria-label={twoDays ? "Primer día del mes" : "Día del mes"}
        value={first}
        onChange={(e) => {
          setFirst(e.target.value)
          emit(e.target.value, second)
        }}
      />
      {twoDays && (
        <>
          <span className="text-sm text-muted-foreground">y</span>
          <Input
            {...inputProps}
            aria-label="Segundo día del mes"
            value={second}
            onChange={(e) => {
              setSecond(e.target.value)
              emit(first, e.target.value)
            }}
          />
        </>
      )}
    </div>
  )
}
