"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function ClientsFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [, startTransition] = useTransition()

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (search) params.set("q", search)
      else params.delete("q")
      params.delete("page")
      startTransition(() => router.push(`${pathname}?${params.toString()}`))
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function updateStatus(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value === "todos") params.delete("status")
    else params.set("status", value)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, cédula, teléfono o código..."
          className="pl-9"
        />
      </div>
      <Select defaultValue={searchParams.get("status") ?? "todos"} onValueChange={updateStatus}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los estados</SelectItem>
          <SelectItem value="activo">Activos</SelectItem>
          <SelectItem value="inactivo">Inactivos</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
