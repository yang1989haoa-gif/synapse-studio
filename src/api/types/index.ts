export type GatewayType = 'openclaw' | 'hermes'

export interface AgentInfo {
  id: string
  name: string
  gateway: GatewayType
  gatewayAgentId: string
  model?: string
  status: 'idle' | 'working' | 'waiting' | 'error' | 'offline'
  config?: {
    endpoint?: string
    token?: string
    password?: string
    apiKey?: string
    notes?: string
    [key: string]: unknown
  } | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
  metadata?: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
  result?: string
}

export interface Session {
  id: string
  agentId: string
  gateway: GatewayType
  title?: string
  createdAt: string
  messageCount: number
}

export interface GatewayStatus {
  type: GatewayType
  connected: boolean
  url: string
  version?: string
  error?: string
}
