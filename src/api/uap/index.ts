import type { AgentInfo, ChatMessage, Session, GatewayType, GatewayStatus } from '../types'

export interface UAPAdapter {
  listAgents(): Promise<AgentInfo[]>
  createSession(agentId: string): Promise<Session>
  sendMessage(sessionId: string, content: string): AsyncGenerator<ChatMessage>
  getHistory(sessionId: string): Promise<ChatMessage[]>
  getStatus(): Promise<GatewayStatus>
}

export class UAPClient {
  private adapters: Map<GatewayType, UAPAdapter> = new Map()

  registerAdapter(type: GatewayType, adapter: UAPAdapter) {
    this.adapters.set(type, adapter)
  }

  async listAllAgents(): Promise<AgentInfo[]> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([, adapter]) => adapter.listAgents()),
    )
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }

  async sendMessage(gateway: GatewayType, sessionId: string, content: string) {
    const adapter = this.adapters.get(gateway)
    if (!adapter) throw new Error(`No adapter for gateway: ${gateway}`)
    return adapter.sendMessage(sessionId, content)
  }

  async getAllStatuses(): Promise<GatewayStatus[]> {
    return Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([, adapter]) => adapter.getStatus()),
    ).then((results) =>
      results.map((r) =>
        r.status === 'fulfilled'
          ? r.value
          : { type: 'openclaw' as GatewayType, connected: false, url: '', error: 'Failed' },
      ),
    )
  }
}

export const uapClient = new UAPClient()
