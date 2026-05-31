import { create } from 'zustand'
import type { AgentInfo } from '@/api/types'

export interface AgentInput {
  name: string
  gateway: AgentInfo['gateway']
  gatewayAgentId: string
  model?: string
  status?: AgentInfo['status']
  config?: AgentInfo['config']
}

interface AgentState {
  agents: AgentInfo[]
  loading: boolean
  fetchAgents: () => Promise<void>
  createAgent: (agent: AgentInput) => Promise<AgentInfo>
  updateAgent: (id: string, agent: Partial<AgentInput>) => Promise<AgentInfo>
  deleteAgent: (id: string) => Promise<void>
  testAgentConnection: (
    agent: Pick<AgentInput, 'gateway' | 'config'>,
  ) => Promise<{ connected: boolean; error?: string; url?: string }>
  setAgents: (agents: AgentInfo[]) => void
}

function fromApi(agent: any): AgentInfo {
  return {
    id: agent.id,
    name: agent.name,
    gateway: agent.gateway,
    gatewayAgentId: agent.gatewayAgentId ?? agent.gateway_agent_id ?? agent.id,
    model: agent.model ?? undefined,
    status: agent.status ?? 'idle',
    config: agent.config ?? null,
  }
}

function toApi(agent: Partial<AgentInput>) {
  return {
    name: agent.name,
    gateway: agent.gateway,
    gateway_agent_id: agent.gatewayAgentId,
    model: agent.model,
    status: agent.status,
    config: agent.config,
  }
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  loading: false,
  fetchAgents: async () => {
    set({ loading: true })
    try {
      const resp = await fetch('/api/agents')
      const data = await resp.json()
      set({ agents: data.map(fromApi), loading: false })
    } catch {
      set({ loading: false })
    }
  },
  createAgent: async (agent) => {
    const resp = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toApi({ ...agent, status: agent.status || 'idle' })),
    })
    if (!resp.ok) throw new Error(`Failed to create agent: ${resp.status}`)
    const created = fromApi(await resp.json())
    set((state) => ({ agents: [created, ...state.agents] }))
    return created
  },
  updateAgent: async (id, agent) => {
    const resp = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toApi(agent)),
    })
    if (!resp.ok) throw new Error(`Failed to update agent: ${resp.status}`)
    const updated = fromApi(await resp.json())
    set((state) => ({ agents: state.agents.map((item) => (item.id === id ? updated : item)) }))
    return updated
  },
  deleteAgent: async (id) => {
    const resp = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    if (!resp.ok) throw new Error(`Failed to delete agent: ${resp.status}`)
    set((state) => ({ agents: state.agents.filter((agent) => agent.id !== id) }))
  },
  testAgentConnection: async (agent) => {
    const resp = await fetch('/api/agents/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateway: agent.gateway, config: agent.config || {} }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data?.error || `Failed to test agent: ${resp.status}`)
    return { connected: Boolean(data.connected), error: data.error, url: data.url }
  },
  setAgents: (agents) => set({ agents }),
}))
