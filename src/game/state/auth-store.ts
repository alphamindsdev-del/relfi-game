import { create } from 'zustand'
import * as api from '../lib/api'
import type { ApiUser } from '../lib/types'

type AuthState = {
  user: ApiUser | null
  loading: boolean
  initialized: boolean

  signup: (email: string, password: string, displayName: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadSession: () => Promise<void>
  isAdmin: () => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  signup: async (email, password, displayName) => {
    set({ loading: true })
    try {
      const { user } = await api.signup(email, password, displayName)
      set({ user, loading: false })
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },

  login: async (email, password) => {
    set({ loading: true })
    try {
      const { user } = await api.login(email, password)
      set({ user, loading: false })
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },

  logout: () => {
    api.logout()
    set({ user: null })
  },

  loadSession: async () => {
    if (!api.isAuthenticated()) {
      set({ initialized: true })
      return
    }
    set({ loading: true })
    try {
      const user = await api.getMe()
      set({ user, loading: false, initialized: true })
    } catch {
      api.logout()
      set({ loading: false, initialized: true })
    }
  },

  isAdmin: () => get().user?.role === 'admin',
}))
