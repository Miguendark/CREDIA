"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateUserRoleAction } from "@/app/(app)/configuracion/actions"
import type { UserRole } from "@/types/database.types"

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  cobrador: "Cobrador",
}

export function UserRoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string
  role: UserRole
  disabled: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(role)
  const [isPending, startTransition] = useTransition()

  function handleChange(next: string) {
    const nextRole = next as UserRole
    setValue(nextRole)
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, nextRole)
      if (!result.success) {
        toast.error(result.message)
        setValue(role)
        return
      }
      toast.success("Rol actualizado")
      router.refresh()
    })
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ROLE_LABELS).map(([roleValue, label]) => (
          <SelectItem key={roleValue} value={roleValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
