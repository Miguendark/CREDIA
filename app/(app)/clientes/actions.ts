"use server"

import { revalidatePath } from "next/cache"
import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { clientSchema, type ClientInput } from "@/lib/validations/client"
import * as clientsService from "@/services/clients.service"

export type ClientActionResult =
  | { success: true; clientId: string }
  | { success: false; message: string }

export async function createClientAction(input: ClientInput): Promise<ClientActionResult> {
  const parsed = clientSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  try {
    const supabase = await createSupabaseClient()
    const client = await clientsService.createClient(supabase, parsed.data)
    revalidatePath("/clientes")
    return { success: true, clientId: client.id }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo crear el cliente" }
  }
}

export async function updateClientAction(id: string, input: ClientInput): Promise<ClientActionResult> {
  const parsed = clientSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  try {
    const supabase = await createSupabaseClient()
    await clientsService.updateClient(supabase, id, parsed.data)
    revalidatePath("/clientes")
    revalidatePath(`/clientes/${id}`)
    return { success: true, clientId: id }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo actualizar el cliente" }
  }
}

export interface ClientOption {
  id: string
  full_name: string
  client_code: string
  identification_number: string | null
}

/** Usado por el combobox de selección de cliente en los formularios de préstamos/pagos. */
export async function searchClientsAction(query: string): Promise<ClientOption[]> {
  const supabase = await createSupabaseClient()
  const { items } = await clientsService.listClients(supabase, {
    search: query,
    status: "activo",
    pageSize: 10,
  })
  return items.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    client_code: c.client_code,
    identification_number: c.identification_number,
  }))
}

export async function toggleClientStatusAction(id: string, activate: boolean): Promise<ClientActionResult> {
  try {
    const supabase = await createSupabaseClient()
    await clientsService.updateClient(supabase, id, { status: activate ? "activo" : "inactivo" })
    revalidatePath("/clientes")
    revalidatePath(`/clientes/${id}`)
    return { success: true, clientId: id }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo actualizar el estado" }
  }
}
