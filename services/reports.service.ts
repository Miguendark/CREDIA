import type { TypedSupabaseClient } from "@/lib/supabase/types"

export interface InterestReportRow {
  loanNumber: string
  clientName: string
  interestPactado: number
  interestCobrado: number
  status: string
}

/** Interés pactado vs. efectivamente cobrado, por préstamo. */
export async function getInterestReport(supabase: TypedSupabaseClient): Promise<InterestReportRow[]> {
  const { data: loans, error: loansError } = await supabase
    .from("loans")
    .select("id, loan_number, total_interest, status, client:clients!loans_client_id_fkey(full_name)")
  if (loansError) throw loansError

  const { data: payments, error: paymentsError } = await supabase.from("payments").select("loan_id, interest_applied")
  if (paymentsError) throw paymentsError

  const collectedByLoan = new Map<string, number>()
  for (const payment of payments) {
    collectedByLoan.set(payment.loan_id, (collectedByLoan.get(payment.loan_id) ?? 0) + payment.interest_applied)
  }

  return (loans as unknown as Array<{
    id: string
    loan_number: string
    total_interest: number
    status: string
    client: { full_name: string }
  }>).map((loan) => ({
    loanNumber: loan.loan_number,
    clientName: loan.client.full_name,
    interestPactado: loan.total_interest,
    interestCobrado: collectedByLoan.get(loan.id) ?? 0,
    status: loan.status,
  }))
}
