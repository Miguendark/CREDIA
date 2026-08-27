"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

const METHODS = [
  { value: "todos", label: "Todos los métodos" },
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "deposito", label: "Depósito" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
]

export function PaymentsFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams)
    if (!value || value === "todos") params.delete(key)
    else params.set(key, value)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Desde</Label>
        <Input
          type="date"
          defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => updateParam("from", e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Hasta</Label>
        <Input
          type="date"
          defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => updateParam("to", e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Método</Label>
        <Select defaultValue={searchParams.get("method") ?? "todos"} onValueChange={(v) => updateParam("method", v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
