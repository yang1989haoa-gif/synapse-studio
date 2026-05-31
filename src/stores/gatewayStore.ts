import { create } from 'zustand'

export interface GatewayConfig {
  openclaw: { url: string; token: string }
  hermes: { webUrl: string; apiUrl: string; apiKey: string }
}

export interface GatewayStatusDetail {
  type: 'openclaw' | 'hermes'
  connected: boolean
  url: string
  source?: 'agent' | 'env'
  agentId?: string
  agentName?: string
  error?: string
  detail?: unknown
}

interface GatewayState {
  config: GatewayConfig
  statuses: { openclaw: boolean; hermes: boolean }
  details: { openclaw: GatewayStatusDetail | null; hermes: GatewayStatusDetail | null }
  loading: boolean
  lastChecked: string | null
  updateConfig: (config: Partial<GatewayConfig>) => void
  testConnection: (gateway: 'openclaw' | 'hermes') => Promise<boolean>
  fetchStatus: () => Promise<void>
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  config: {
    openclaw: {
      url: localStorage.getItem('oc-url') || 'ws://localhost:18789',
      token: localStorage.getItem('oc-token') || '',
    },
    hermes: {
      webUrl: localStorage.getItem('h-web-url') || 'http://localhost:9119',
      apiUrl: localStorage.getItem('h-api-url') || 'http://localhost:8642',
      apiKey: localStorage.getItem('h-api-key') || '',
    },
  },
  statuses: { openclaw: false, hermes: false },
  details: { openclaw: null, hermes: null },
  loading: false,
  lastChecked: null,

  updateConfig: (partial) => {
    const newConfig = { ...get().config, ...partial }
    if (partial.openclaw) {
      localStorage.setItem('oc-url', partial.openclaw.url ?? get().config.openclaw.url)
      localStorage.setItem('oc-token', partial.openclaw.token ?? get().config.openclaw.token)
    }
    if (partial.hermes) {
      localStorage.setItem('h-web-url', partial.hermes.webUrl ?? get().config.hermes.webUrl)
      localStorage.setItem('h-api-url', partial.hermes.apiUrl ?? get().config.hermes.apiUrl)
      localStorage.setItem('h-api-key', partial.hermes.apiKey ?? get().config.hermes.apiKey)
    }
    set({ config: newConfig })
  },

  testConnection: async (gateway) => {
    try {
      const resp = await fetch('/api/gateways/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: gateway }),
      })
      const data = await resp.json()
      set((state) => ({
        statuses: { ...state.statuses, [gateway]: Boolean(data.connected) },
        details: { ...state.details, [gateway]: data },
        lastChecked: new Date().toISOString(),
      }))
      return Boolean(data.connected)
    } catch {
      return false
    }
  },

  fetchStatus: async () => {
    set({ loading: true })
    try {
      const resp = await fetch('/api/gateways/status')
      const data = await resp.json()
      set({
        statuses: {
          openclaw: data.openclaw?.connected || false,
          hermes: data.hermes?.connected || false,
        },
        details: {
          openclaw: data.openclaw || null,
          hermes: data.hermes || null,
        },
        lastChecked: new Date().toISOString(),
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },
}))
