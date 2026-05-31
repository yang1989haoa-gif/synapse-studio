import { create } from 'zustand'
import { useDebugStore } from './debugStore'
import { useFlowStore, type AgentNodeData, type ControlNodeData } from './flowStore'

export interface ExecutionStatus {
  id: string
  flowId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  nodeStatuses: Record<string, { status: string; elapsed?: number }>
  totalTokens: number
  totalDuration: number
}

interface ExecutionErrorDetail {
  nodeId?: string
  nodeName?: string
  message?: string
  suggestion?: string | string[]
}

interface ExecutionState {
  current: ExecutionStatus | null
  starting: boolean
  error: string | null
  startExecution: (flowId: string) => Promise<string>
  cancelExecution: (executionId: string) => Promise<void>
  connectSSE: (executionId: string) => void
  disconnectSSE: () => void
  resetExecution: () => void
}

export const useExecutionStore = create<ExecutionState>((set, get) => {
  let eventSource: EventSource | null = null

  return {
    current: null,
    starting: false,
    error: null,

    startExecution: async (flowId) => {
      get().disconnectSSE()
      set({ current: null, starting: true, error: null })
      const resp = await fetch(`/api/flows/${flowId}/run`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok) {
        const message = data?.error || `Failed to start execution: ${resp.status}`
        const details = Array.isArray(data?.details) ? (data.details as ExecutionErrorDetail[]) : []
        if (details.length > 0) {
          for (const detail of details) {
            const suggestion = Array.isArray(detail.suggestion)
              ? detail.suggestion
              : detail.suggestion
                ? [detail.suggestion]
                : undefined
            useDebugStore.getState().addEntry({
              level: 'error',
              nodeId: detail.nodeId,
              nodeName: detail.nodeName,
              message: detail.message || message,
              suggestion,
            })
          }
        } else {
          useDebugStore.getState().addEntry({ level: 'error', message })
        }
        set({ starting: false, error: message })
        throw Object.assign(new Error(message), { debugLogged: true })
      }
      const { executionId } = data
      set({
        current: {
          id: executionId,
          flowId,
          status: 'running',
          nodeStatuses: {},
          totalTokens: 0,
          totalDuration: 0,
        },
      })
      set({ starting: false })
      useDebugStore
        .getState()
        .addEntry({ level: 'info', message: `Execution ${executionId.slice(0, 8)} started` })
      get().connectSSE(executionId)
      return executionId
    },

    cancelExecution: async (executionId) => {
      const resp = await fetch(`/api/executions/${executionId}/cancel`, { method: 'POST' })
      if (!resp.ok) {
        const data = await resp.json().catch(() => null)
        const message = data?.error || `Failed to cancel execution: ${resp.status}`
        useDebugStore.getState().addEntry({ level: 'error', message })
        throw new Error(message)
      }
      set((state) => (state.current ? { current: { ...state.current, status: 'cancelled' } } : {}))
      useDebugStore
        .getState()
        .addEntry({ level: 'info', message: `Execution ${executionId.slice(0, 8)} cancelled` })
    },

    connectSSE: (executionId) => {
      get().disconnectSSE()
      eventSource = new EventSource(`/api/executions/${executionId}/events`)
      let terminalEventHandled = false

      eventSource.addEventListener('node-status', (e) => {
        const { nodeId, status, elapsed } = JSON.parse(e.data)
        set((state) => {
          if (!state.current) return {}
          return {
            current: {
              ...state.current,
              nodeStatuses: { ...state.current.nodeStatuses, [nodeId]: { status, elapsed } },
            },
          }
        })
        useFlowStore
          .getState()
          .updateNodeData(nodeId, { status, elapsed } as Partial<AgentNodeData & ControlNodeData>)
      })

      eventSource.addEventListener('control-output', (e) => {
        const data = JSON.parse(e.data)
        useDebugStore.getState().addEntry({
          level: 'info',
          nodeId: data.nodeId,
          message: data.message || 'Control node processed',
          details: data.output || '',
        })
      })

      eventSource.addEventListener('output', (e) => {
        const data = JSON.parse(e.data)
        const metrics = [
          typeof data.tokens === 'number' ? `${data.tokens} tok` : null,
          typeof data.elapsed === 'number' ? `${data.elapsed.toFixed(2)}s` : null,
        ]
          .filter(Boolean)
          .join(' / ')
        useDebugStore.getState().addEntry({
          level: 'info',
          nodeId: data.nodeId,
          message: 'Node output',
          details: metrics ? `${data.output || ''}\n${metrics}` : data.output || '',
        })
        if (data.nodeId && typeof data.tokens === 'number') {
          useFlowStore
            .getState()
            .updateNodeData(data.nodeId, { tokens: data.tokens } as Partial<AgentNodeData>)
        }
      })

      eventSource.addEventListener('error', (e) => {
        const rawData = (e as MessageEvent).data
        if (!rawData) return
        const data = JSON.parse(rawData)
        useDebugStore.getState().addEntry({
          level: 'error',
          nodeId: data.nodeId,
          message: data.message || 'Node execution failed',
          suggestion: [
            'Check gateway connectivity.',
            'Review the node input and model configuration.',
          ],
        })
      })

      eventSource.addEventListener('flow-complete', (e) => {
        if (terminalEventHandled) return
        terminalEventHandled = true
        const { duration, totalTokens } = JSON.parse(e.data)
        set((state) =>
          state.current
            ? {
                current: {
                  ...state.current,
                  status: 'completed',
                  totalDuration: duration,
                  totalTokens,
                },
              }
            : {},
        )
        useDebugStore.getState().addEntry({
          level: 'info',
          message: `Execution completed in ${(duration / 1000).toFixed(1)}s with ${totalTokens} tokens`,
        })
        get().disconnectSSE()
      })

      const handleCancelled = () => {
        if (terminalEventHandled) return
        terminalEventHandled = true
        set((state) =>
          state.current ? { current: { ...state.current, status: 'cancelled' } } : {},
        )
        useDebugStore.getState().addEntry({ level: 'info', message: 'Execution cancelled' })
        get().disconnectSSE()
      }

      eventSource.addEventListener('cancelled', handleCancelled)
      eventSource.addEventListener('flow-cancelled', handleCancelled)

      eventSource.addEventListener('flow-error', (e) => {
        if (terminalEventHandled) return
        terminalEventHandled = true
        const data = JSON.parse(e.data)
        const message = data.error || 'Flow execution failed'
        set((state) => (state.current ? { current: { ...state.current, status: 'failed' } } : {}))
        set({ error: message })
        useDebugStore.getState().addEntry({
          level: 'error',
          message,
          suggestion: [
            'Check node errors in the debug log.',
            'Verify agent connection config before retrying.',
          ],
        })
        get().disconnectSSE()
      })

      eventSource.onerror = () => {
        window.setTimeout(() => {
          if (terminalEventHandled || !eventSource || eventSource.readyState === EventSource.CLOSED)
            return
          useDebugStore.getState().addEntry({
            level: 'warn',
            message: 'Execution event stream disconnected',
          })
        }, 500)
      }
    },

    disconnectSSE: () => {
      eventSource?.close()
      eventSource = null
    },

    resetExecution: () => {
      get().disconnectSSE()
      set({ current: null, starting: false, error: null })
    },
  }
})
