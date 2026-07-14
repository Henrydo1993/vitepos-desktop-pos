import { create } from 'zustand'

export interface Staff {
  id: number
  name: string
  role: string
}

interface AuthState {
  staff: Staff | null
  setStaff: (s: Staff | null) => void
}

// Who is signed in on this terminal right now (cleared on logout / idle lock).
export const useAuth = create<AuthState>((set) => ({
  staff: null,
  setStaff: (staff) => set({ staff }),
}))

// Role ranks — must match ROLE_RANK in the main process (channels.ts). Used to hide UI a
// staff member can't use; the main process enforces the same rule so it can't be bypassed.
const ROLE_RANK: Record<string, number> = { staff: 0, cashier: 0, server: 0, manager: 1, admin: 2, owner: 2 }
export const roleRank = (role?: string | null): number => ROLE_RANK[role ?? ''] ?? -1
export const canVoid = (staff: Staff | null): boolean => roleRank(staff?.role) >= 1
export const canManage = (staff: Staff | null): boolean => roleRank(staff?.role) >= 2 // settings + staff
