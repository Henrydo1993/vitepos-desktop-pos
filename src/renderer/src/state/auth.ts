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
