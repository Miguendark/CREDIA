"use client"

import { useEffect, useState } from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { searchClientsAction, type ClientOption } from "@/app/(app)/clientes/actions"

export function ClientCombobox({
  value,
  onChange,
  initialLabel,
  disabled,
}: {
  value: string | undefined
  onChange: (clientId: string, client: ClientOption) => void
  initialLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(initialLabel ?? "")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timeout = setTimeout(() => {
      setLoading(true)
      searchClientsAction(query).then((results) => {
        if (cancelled) return
        setOptions(results)
        setLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query, open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? selectedLabel : "Selecciona un cliente..."}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar por nombre, cédula o código..." value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {!loading && <CommandEmpty>No se encontraron clientes.</CommandEmpty>}
            <CommandGroup>
              {options.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.id}
                  onSelect={() => {
                    onChange(client.id, client)
                    setSelectedLabel(`${client.full_name} · ${client.client_code}`)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("size-4", value === client.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span>{client.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {client.client_code}
                      {client.identification_number ? ` · ${client.identification_number}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
