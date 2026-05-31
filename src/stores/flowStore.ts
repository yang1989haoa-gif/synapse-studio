import { create } from 'zustand'
import type { Node, Edge, OnNodesChange, OnEdgesChange, OnConnect } from 'reactflow'
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow'

export interface AgentNodeData {
  label: string
  gateway: 'openclaw' | 'hermes'
  agentId?: string
  model?: string
  endpoint?: string
  token?: string
  password?: string
  apiKey?: string
  status: 'idle' | 'working' | 'waiting' | 'done' | 'error' | 'blocked'
  elapsed?: number
  tokens?: number
  group?: string
}

export interface ControlNodeData {
  label: string
  controlType: 'input' | 'merge' | 'trigger'
  value?: string
  status?: 'idle' | 'working' | 'waiting' | 'done' | 'error' | 'blocked'
  elapsed?: number
}

export interface GroupNodeData {
  label: string
  pattern: 'pipeline' | 'hierarchy' | 'mesh'
  color: string
}

type FlowNodeData = AgentNodeData | ControlNodeData | GroupNodeData

const defaultControlLabels: Record<ControlNodeData['controlType'], string> = {
  input: 'Input',
  merge: 'Merge',
  trigger: 'Trigger',
}

function normalizeFlowNode(node: Node<FlowNodeData>): Node<FlowNodeData> {
  if (node.type !== 'control') return node
  const data = node.data as Partial<ControlNodeData>
  const controlType = data.controlType || 'input'
  const legacyLabel = typeof data.label === 'string' && /[📥🔀⚡输入]/u.test(data.label)

  return {
    ...node,
    data: {
      ...data,
      controlType,
      label: legacyLabel || !data.label ? defaultControlLabels[controlType] : data.label,
      status: data.status || 'idle',
    } as ControlNodeData,
  }
}

interface FlowState {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  selectedNode: string | null
  flowId: string | null
  flowName: string
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (node: Node<FlowNodeData>) => void
  removeNode: (id: string) => void
  updateNodeData: (id: string, data: Partial<FlowNodeData>) => void
  setSelectedNode: (id: string | null) => void
  setNodes: (nodes: Node<FlowNodeData>[]) => void
  setEdges: (edges: Edge[]) => void
  loadFlow: (flowId: string) => Promise<void>
  saveFlow: () => Promise<void>
  createOrSaveFlow: () => Promise<string>
  resetNodeStatuses: () => void
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  flowId: null,
  flowName: '',
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) =>
    set({
      edges: addEdge({ ...connection, animated: true, style: { stroke: '#7c5cfc' } }, get().edges),
    }),
  addNode: (node) => set({ nodes: [...get().nodes, node] }),
  removeNode: (id) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
    }),
  updateNodeData: (id, data) =>
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
    }),
  setSelectedNode: (id) => set({ selectedNode: id }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  resetNodeStatuses: () =>
    set({
      nodes: get().nodes.map((node) => {
        if (node.type !== 'agent' && node.type !== 'control') return node
        return {
          ...node,
          data: {
            ...node.data,
            status: 'idle',
            elapsed: undefined,
            tokens: undefined,
          },
        }
      }),
    }),
  loadFlow: async (flowId) => {
    try {
      const resp = await fetch(`/api/flows/${flowId}`)
      if (!resp.ok) throw new Error('Flow not found')
      const flow = await resp.json()
      const config = flow.config || {}
      set({
        flowId,
        flowName: flow.name || '',
        nodes: (config.nodes || []).map(normalizeFlowNode),
        edges: config.edges || [],
      })
    } catch (err) {
      console.error('Failed to load flow:', err)
    }
  },
  saveFlow: async () => {
    await get().createOrSaveFlow()
  },
  createOrSaveFlow: async () => {
    const { flowId, flowName, nodes, edges } = get()
    const name = flowName.trim() || 'Untitled Flow'

    if (!flowId) {
      const fallbackName = flowName.trim() || `Untitled Flow ${new Date().toLocaleString()}`
      const resp = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fallbackName,
          config: { nodes, edges },
          status: 'draft',
        }),
      })
      if (!resp.ok) throw new Error(`Failed to create flow: ${resp.status}`)
      const flow = await resp.json()
      set({ flowId: flow.id, flowName: flow.name || fallbackName })
      return flow.id
    }

    const resp = await fetch(`/api/flows/${flowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        config: { nodes, edges },
      }),
    })
    if (!resp.ok) throw new Error(`Failed to save flow: ${resp.status}`)
    const flow = await resp.json()
    set({ flowName: flow.name || name })
    return flowId
  },
}))
