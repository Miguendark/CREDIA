/**
 * Tipos de la base de datos de NEXA, escritos a mano a partir de las
 * migraciones en /database/migrations. Si en el futuro se conecta el
 * proyecto a Supabase CLI, este archivo puede regenerarse con:
 *   supabase gen types typescript --linked > types/database.types.ts
 * y debería seguir siendo compatible con el resto del código.
 *
 * Nota: aunque loans/installments/payments/capital_transactions se
 * escriben en la práctica SOLO a través de las funciones RPC (ver
 * services/*.service.ts y la migración 0006 de RLS), aquí se tipan sus
 * formas de Insert/Update reales — Postgres es quien impide la escritura
 * directa (REVOKE + RLS), no el compilador de TypeScript.
 */

export type UserRole = "admin" | "supervisor" | "cobrador"
export type ClientStatus = "activo" | "inactivo"
export type LoanInterestType = "fixed_capital" | "declining_balance"
export type LoanFrequency = "daily" | "weekly" | "biweekly" | "monthly"
export type LoanStatus = "activo" | "pagado" | "vencido" | "cancelado"
export type InstallmentStatus = "pendiente" | "parcial" | "pagada" | "vencida"
export type PaymentMethod = "efectivo" | "transferencia" | "deposito" | "tarjeta" | "otro"
export type CapitalTransactionType = "aporte" | "retiro" | "prestamo" | "pago" | "ajuste"
export type WhatsappConversationStatus = "pendiente" | "atendida" | "cerrada"
export type WhatsappMessageSender = "cliente" | "agente" | "bot"
export type ReceiptStatus = "activo" | "anulado"

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          email: string
          role: UserRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          email: string
          role?: UserRole
        }
        Update: Partial<{
          name: string
          email: string
          role: UserRole
        }>
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          client_code: string
          full_name: string
          identification_number: string | null
          phone: string | null
          whatsapp: string | null
          email: string | null
          address: string | null
          birth_date: string | null
          status: ClientStatus
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_code?: string
          full_name: string
          identification_number?: string | null
          phone?: string | null
          whatsapp?: string | null
          email?: string | null
          address?: string | null
          birth_date?: string | null
          status?: ClientStatus
          notes?: string | null
        }
        Update: Partial<{
          full_name: string
          identification_number: string | null
          phone: string | null
          whatsapp: string | null
          email: string | null
          address: string | null
          birth_date: string | null
          status: ClientStatus
          notes: string | null
        }>
        Relationships: []
      }
      loans: {
        Row: {
          id: string
          loan_number: string
          client_id: string
          principal_amount: number
          interest_rate: number
          interest_type: LoanInterestType
          total_interest: number
          total_amount: number
          number_of_installments: number
          installment_amount: number
          frequency: LoanFrequency
          start_date: string
          first_payment_date: string
          next_payment_date: string | null
          outstanding_principal: number
          outstanding_interest: number
          total_paid: number
          status: LoanStatus
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          client_id: string
          principal_amount: number
          interest_rate: number
          interest_type: LoanInterestType
          total_interest: number
          total_amount: number
          number_of_installments: number
          installment_amount: number
          frequency: LoanFrequency
          start_date: string
          first_payment_date: string
          next_payment_date?: string | null
          outstanding_principal: number
          outstanding_interest: number
          notes?: string | null
        }
        Update: Partial<{
          notes: string | null
          status: LoanStatus
        }>
        Relationships: []
      }
      installments: {
        Row: {
          id: string
          loan_id: string
          installment_number: number
          due_date: string
          principal_amount: number
          interest_amount: number
          total_amount: number
          amount_paid: number
          remaining_amount: number
          status: InstallmentStatus
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          loan_id: string
          installment_number: number
          due_date: string
          principal_amount: number
          interest_amount: number
          total_amount: number
          remaining_amount: number
        }
        Update: Partial<{
          status: InstallmentStatus
          amount_paid: number
          remaining_amount: number
          paid_at: string | null
        }>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          payment_number: string
          client_id: string
          loan_id: string
          installment_id: string
          amount: number
          principal_applied: number
          interest_applied: number
          payment_method: PaymentMethod
          payment_date: string
          receipt_number: string | null
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          client_id: string
          loan_id: string
          installment_id: string
          amount: number
          principal_applied: number
          interest_applied: number
          payment_method: PaymentMethod
          payment_date: string
          receipt_number?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      capital_transactions: {
        Row: {
          id: string
          type: CapitalTransactionType
          amount: number
          description: string | null
          reference_id: string | null
          transaction_date: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          type: CapitalTransactionType
          amount: number
          description?: string | null
          reference_id?: string | null
          transaction_date?: string
          created_by?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity: string
          entity_id: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          user_id?: string | null
          action: string
          entity: string
          entity_id?: string | null
          description?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          id: string
          client_id: string | null
          phone_number: string
          status: WhatsappConversationStatus
          last_message_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          phone_number: string
          status?: WhatsappConversationStatus
        }
        Update: Partial<{
          status: WhatsappConversationStatus
          last_message_at: string
        }>
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          id: string
          conversation_id: string
          sender: WhatsappMessageSender
          content: string
          created_at: string
        }
        Insert: {
          conversation_id: string
          sender: WhatsappMessageSender
          content: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      // Toda escritura pasa por create_receipt / void_receipt (migración
      // 0010) — igual que loans/installments/payments, Insert/Update directo
      // está revocado a nivel de Postgres, no solo aquí.
      receipts: {
        Row: {
          id: string
          receipt_number: string
          payment_id: string
          covered_payment_ids: string[]
          loan_id: string
          client_id: string
          client_name: string
          client_code: string
          loan_number: string
          amount_paid: number
          installments_covered: unknown
          installments_label: string
          total_installments: number
          installments_paid_count: number
          outstanding_balance: number
          next_payment_date: string | null
          collector_id: string | null
          collector_name: string
          payment_date: string
          status: ReceiptStatus
          void_reason: string | null
          voided_by: string | null
          voided_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: {
      client_summary: {
        Row: Database["public"]["Tables"]["clients"]["Row"] & {
          active_loans_count: number
          outstanding_balance: number
          next_payment_date: string | null
        }
        Relationships: []
      }
      dashboard_metrics: {
        Row: {
          available_capital: number
          lent_capital: number
          total_received: number
          total_interest_generated: number
          active_loans_count: number
          active_clients_count: number
          pending_installments_count: number
          overdue_loans_count: number
        }
        Relationships: []
      }
    }
    Functions: {
      create_loan_with_installments: {
        Args: {
          p_client_id: string
          p_principal_amount: number
          p_interest_rate: number
          p_interest_type: LoanInterestType
          p_number_of_installments: number
          p_installment_amount: number
          p_total_interest: number
          p_total_amount: number
          p_frequency: LoanFrequency
          p_start_date: string
          p_first_payment_date: string
          p_notes: string | null
          p_installments: unknown
        }
        Returns: Database["public"]["Tables"]["loans"]["Row"]
      }
      register_payment: {
        Args: {
          p_loan_id: string
          p_client_id: string
          p_allocations: unknown
          p_payment_method: PaymentMethod
          p_payment_date: string
          p_receipt_number: string | null
          p_notes: string | null
        }
        Returns: Database["public"]["Tables"]["payments"]["Row"][]
      }
      register_capital_movement: {
        Args: {
          p_type: CapitalTransactionType
          p_amount: number
          p_description: string | null
          p_transaction_date: string
        }
        Returns: Database["public"]["Tables"]["capital_transactions"]["Row"]
      }
      create_receipt: {
        Args: {
          p_payment_ids: string[]
        }
        Returns: Database["public"]["Tables"]["receipts"]["Row"]
      }
      void_receipt: {
        Args: {
          p_receipt_id: string
          p_reason: string
        }
        Returns: Database["public"]["Tables"]["receipts"]["Row"]
      }
    }
  }
}
