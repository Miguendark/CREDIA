"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from "@/lib/validations/auth"
import { requestPasswordResetAction } from "@/app/login/actions"

export function ResetPasswordForm() {
  const [sent, setSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(values: RequestPasswordResetInput) {
    setIsSubmitting(true)
    await requestPasswordResetAction(values)
    setIsSubmitting(false)
    setSent(true)
  }

  if (sent) {
    return (
      <Alert className="border-success/30 bg-success/10 text-success-foreground">
        <CheckCircle2 className="size-4 text-success" />
        <AlertDescription className="text-foreground">
          Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo electrónico</FormLabel>
              <FormControl>
                <Input type="email" placeholder="tu@empresa.com" disabled={isSubmitting} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Enviar enlace de recuperación
        </Button>
      </form>
    </Form>
  )
}
