import type { TypedSupabaseClient } from "@/lib/supabase/types"
import { logAudit } from "@/lib/supabase/audit"
import type { ClientStatus } from "@/types/database.types"
import type { Client, ClientListItem } from "@/types/domain"
import type { ClientInput } from "@/lib/validations/client"

export interface ListClientsParams {
  search?: string
  status?: ClientStatus | "todos"
  page?: number
  pageSize?: number
}

export interface ListClientsResult {
  items: ClientListItem[]
  total: number
}

export async function listClients(
  supabase: TypedSupabaseClient,
  params: ListClientsParams = {}
): Promise<ListClientsResult> {
  const { search, status = "todos", page = 1, pageSize = 20 } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from("client_summary").select("*", { count: "exact" })

  if (status !== "todos") {
    query = query.eq("status", status)
  }
  if (search && search.trim() !== "") {
    const term = search.trim()
    query = query.or(
      `full_name.ilike.%${term}%,identification_number.ilike.%${term}%,phone.ilike.%${term}%,client_code.ilike.%${term}%`
    )
  }

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to)
  if (error) throw error

  return { items: data as ClientListItem[], total: count ?? 0 }
}

export async function getClientById(supabase: TypedSupabaseClient, id: string): Promise<ClientListItem | null> {
  const { data, error } = await supabase.from("client_summary").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return data as ClientListItem | null
}

export async function createClient(supabase: TypedSupabaseClient, input: ClientInput): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      full_name: input.full_name,
      identification_number: input.identification_number || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      email: input.email || null,
      address: input.address || null,
      birth_date: input.birth_date || null,
      notes: input.notes || null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe un cliente con esa cédula")
    }
    throw error
  }

  await logAudit(supabase, {
    action: "crear_cliente",
    entity: "clients",
    entity_id: data.id,
    description: `Cliente ${data.full_name} (${data.client_code}) creado`,
  })

  return data
}

export async function updateClient(
  supabase: TypedSupabaseClient,
  id: string,
  input: Partial<ClientInput> & { status?: ClientStatus }
): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .update({
      ...(input.full_name !== undefined && { full_name: input.full_name }),
      ...(input.identification_number !== undefined && { identification_number: input.identification_number || null }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(input.whatsapp !== undefined && { whatsapp: input.whatsapp || null }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(input.address !== undefined && { address: input.address || null }),
      ...(input.birth_date !== undefined && { birth_date: input.birth_date || null }),
      ...(input.notes !== undefined && { notes: input.notes || null }),
      ...(input.status !== undefined && { status: input.status }),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe un cliente con esa cédula")
    }
    throw error
  }

  await logAudit(supabase, {
    action: "editar_cliente",
    entity: "clients",
    entity_id: id,
    description: `Cliente ${data.full_name} (${data.client_code}) actualizado`,
  })

  return data
}
