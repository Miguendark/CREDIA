import type { Database } from "./database.types"

export type Client = Database["public"]["Tables"]["clients"]["Row"]
export type Loan = Database["public"]["Tables"]["loans"]["Row"]
export type Installment = Database["public"]["Tables"]["installments"]["Row"]
export type Payment = Database["public"]["Tables"]["payments"]["Row"]
export type CapitalTransaction = Database["public"]["Tables"]["capital_transactions"]["Row"]
export type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"]
export type StaffUser = Database["public"]["Tables"]["users"]["Row"]
export type WhatsappConversation = Database["public"]["Tables"]["whatsapp_conversations"]["Row"]
export type WhatsappMessage = Database["public"]["Tables"]["whatsapp_messages"]["Row"]

export interface WhatsappConversationWithClient extends WhatsappConversation {
  client: Pick<Client, "id" | "full_name" | "client_code"> | null
}

export interface ClientListItem extends Client {
  active_loans_count: number
  outstanding_balance: number
  next_payment_date: string | null
}

export interface LoanWithClient extends Loan {
  client: Pick<Client, "id" | "full_name" | "client_code" | "identification_number" | "phone">
}

export interface PaymentWithRelations extends Payment {
  client: Pick<Client, "id" | "full_name" | "client_code">
  loan: Pick<Loan, "id" | "loan_number">
  created_by_user: Pick<StaffUser, "id" | "name"> | null
}

/** "Vencido" nunca se guarda como estado del préstamo: se deriva en consulta. */
export function isLoanOverdue(loan: Pick<Loan, "status" | "next_payment_date">): boolean {
  if (loan.status !== "activo" || !loan.next_payment_date) return false
  return new Date(loan.next_payment_date) < new Date(new Date().toISOString().slice(0, 10))
}

export function isInstallmentOverdue(
  installment: Pick<Installment, "status" | "due_date">
): boolean {
  if (installment.status !== "pendiente" && installment.status !== "parcial") return false
  return new Date(installment.due_date) < new Date(new Date().toISOString().slice(0, 10))
}

export interface DashboardMetrics {
  availableCapital: number
  lentCapital: number
  totalReceived: number
  totalInterestGenerated: number
  activeLoansCount: number
  activeClientsCount: number
  pendingInstallmentsCount: number
  overdueLoansCount: number
}

export interface PortfolioChartPoint {
  label: string
  lent: number
  recovered: number
  outstanding: number
}

export interface PaymentsChartPoint {
  label: string
  paid: number
  pending: number
  overdue: number
}

export interface LoanStatusChartPoint {
  status: string
  count: number
}
