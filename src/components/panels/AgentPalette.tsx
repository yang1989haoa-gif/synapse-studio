import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFlowStore, type AgentNodeData, type ControlNodeData } from '@/stores/flowStore'
import { useAgentStore } from '@/stores/agentStore'
import { useDebugStore } from '@/stores/debugStore'
import type { AgentInfo } from '@/api/types'

const controlPrefixes: Record<ControlNodeData['controlType'], string> = {
  input: 'IN',
  merge: 'MG',
  trigger: 'TR',
}

const controlHints: Record<ControlNodeData['controlType'], string> = {
  input: 'node.inputHint',
  merge: 'node.mergeHint',
  trigger: 'node.triggerHint',
}

function isControlNodeData(data: unknown): data is ControlNodeData {
  return Boolean(data && typeof data === 'object' && 'controlType' in data)
}

function agentNodeData(agent: AgentInfo): AgentNodeData {
  return {
    label: agent.name,
    gateway: agent.gateway,
    agentId: agent.gatewayAgentId || agent.id,
    model: agent.model,
    endpoint: typeof agent.config?.endpoint === 'string' ? agent.config.endpoint : '',
    token: typeof agent.config?.token === 'string' ? agent.config.token : '',
    password: typeof agent.config?.password === 'string' ? agent.config.password : '',
    apiKey: typeof agent.config?.apiKey === 'string' ? agent.config.apiKey : '',
    status: 'idle',
  }
}

export function AgentPalette() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('synapse-agent-palette-collapsed') === '1',
  )
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const [agentSearch, setAgentSearch] = useState('')
  const addNode = useFlowStore((s) => s.addNode)
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const setEdges = useFlowStore((s) => s.setEdges)
  const selectedNode = useFlowStore((s) => s.selectedNode)
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode)
  const addDebugEntry = useDebugStore((s) => s.addEntry)
  const { agents, fetchAgents } = useAgentStore()

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('synapse-agent-palette-collapsed', next ? '1' : '0')
      return next
    })
  }

  const handleControlDragStart = (
    e: React.DragEvent,
    controlType: ControlNodeData['controlType'],
  ) => {
    e.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type: 'control',
        data: getControlData(controlType),
      }),
    )
    e.dataTransfer.effectAllowed = 'move'
  }

  const getControlData = (controlType: ControlNodeData['controlType']): ControlNodeData => ({
    label: t(`node.${controlType}`),
    controlType,
    value: controlType === 'input' ? t('node.inputDescription') : '',
    status: 'idle',
  })

  const handleAddControl = (controlType: ControlNodeData['controlType']) => {
    const id = `${controlType}-${Date.now()}`
    const selected = nodes.find((node) => node.id === selectedNode)
    const sameTypeCount = nodes.filter(
      (node) =>
        node.type === 'control' &&
        isControlNodeData(node.data) &&
        node.data.controlType === controlType,
    ).length
    const position = {
      x: selected ? selected.position.x + 220 : 80 + sameTypeCount * 36,
      y: selected ? selected.position.y + 12 : 120 + sameTypeCount * 28,
    }

    addNode({ id, type: 'control', position, data: getControlData(controlType) })
    if (selected) {
      setEdges([
        ...edges,
        {
          id: `${selected.id}-${id}`,
          source: selected.id,
          target: id,
          animated: true,
          style: { stroke: '#cfb55b' },
        },
      ])
    }
    setSelectedNode(id)
    addDebugEntry({
      level: 'info',
      message: selected
        ? t('node.addedConnected', {
            type: t(`node.${controlType}`),
            label: String(selected.data?.label || selected.id),
          })
        : t('node.addedToCanvas', { type: t(`node.${controlType}`) }),
      nodeId: id,
    })
  }

  const handleAddAgent = (agent: AgentInfo) => {
    const id = `agent-${Date.now()}`
    const selected = nodes.find((node) => node.id === selectedNode)
    const sameGatewayCount = nodes.filter((node) => {
      if (node.type !== 'agent') return false
      return (node.data as AgentNodeData).gateway === agent.gateway
    }).length
    const position = {
      x: selected ? selected.position.x + 240 : 180 + sameGatewayCount * 42,
      y: selected ? selected.position.y + 8 : 120 + sameGatewayCount * 42,
    }

    addNode({ id, type: 'agent', position, data: agentNodeData(agent) })
    if (selected) {
      setEdges([
        ...edges,
        {
          id: `${selected.id}-${id}`,
          source: selected.id,
          target: id,
          animated: true,
          style: { stroke: agent.gateway === 'openclaw' ? '#5b9cf5' : '#f55b5b' },
        },
      ])
    }
    setSelectedNode(id)
    setAgentPickerOpen(false)
    addDebugEntry({
      level: 'info',
      message: selected
        ? t('agent.addedConnected', {
            name: agent.name,
            label: String(selected.data?.label || selected.id),
          })
        : t('agent.addedToCanvas', { name: agent.name }),
      nodeId: id,
    })
  }

  const openclawAgents = agents.filter((a) => a.gateway === 'openclaw')
  const hermesAgents = agents.filter((a) => a.gateway === 'hermes')
  const normalizedSearch = agentSearch.trim().toLowerCase()
  const filteredAgents = agents.filter((agent) => {
    if (!normalizedSearch) return true
    return `${agent.name} ${agent.gateway} ${agent.gatewayAgentId} ${agent.model || ''}`
      .toLowerCase()
      .includes(normalizedSearch)
  })

  if (collapsed) {
    return (
      <div className="panel-surface flex w-10 shrink-0 flex-col items-center border-r py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={t('common.expand')}
          className="h-8 w-8 rounded-md border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:border-accent hover:text-white"
        >
          TL
        </button>
        <div className="mt-3 rotate-90 whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-slate-600">
          {t('flow.toolbox')}
        </div>
      </div>
    )
  }

  return (
    <div className="panel-surface w-[172px] shrink-0 overflow-y-auto border-r p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          {t('flow.toolbox')}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={t('common.collapse')}
          className="rounded-md border border-slate-800 px-2 py-1 text-[10px] text-slate-500 hover:border-slate-600 hover:text-slate-200"
        >
          -
        </button>
      </div>

      <div className="mb-4">
        {agents.length === 0 ? (
          <div className="soft-card mb-3 rounded-lg p-3">
            <div className="text-xs text-slate-300">{t('agent.noAgents')}</div>
            <a
              href="/agents"
              className="primary-action mt-2 inline-flex rounded-md px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              {t('agent.newAgent')}
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAgentPickerOpen(true)}
            className="primary-action flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-xs font-semibold text-white"
          >
            + {t('agent.addAgent')}
          </button>
        )}
        <a
          href="/agents"
          className="mt-2 flex w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400 hover:border-slate-600 hover:text-white"
        >
          {t('dashboard.manageAgents')}
        </a>
      </div>

      {agentPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/42 backdrop-blur-[2px]"
          onClick={() => setAgentPickerOpen(false)}
        >
          <div
            className="absolute left-[300px] top-24 w-[360px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{t('agent.pickAgent')}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    {t('agent.pickAgentHint')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAgentPickerOpen(false)}
                  className="rounded-md border border-slate-800 px-2 py-1 text-[10px] text-slate-500 hover:border-slate-600 hover:text-white"
                >
                  {t('common.close')}
                </button>
              </div>
              <input
                value={agentSearch}
                onChange={(event) => setAgentSearch(event.target.value)}
                placeholder={t('common.search')}
                className="mt-3 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
                autoFocus
              />
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {filteredAgents.length === 0 ? (
                <div className="grid h-28 place-items-center text-xs text-slate-600">
                  {t('common.noData')}
                </div>
              ) : (
                filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => handleAddAgent(agent)}
                    className={`mb-1.5 w-full rounded-lg border p-3 text-left transition-colors ${
                      agent.gateway === 'openclaw'
                        ? 'border-openclaw/30 bg-openclaw/8 hover:border-openclaw/70'
                        : 'border-hermes/30 bg-hermes/8 hover:border-hermes/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-100">
                          {agent.name}
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
                          {agent.model || t('agent.modelUnset')}
                        </div>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] ${
                          agent.gateway === 'openclaw'
                            ? 'bg-openclaw/20 text-openclaw-light'
                            : 'bg-hermes/20 text-hermes-light'
                        }`}
                      >
                        {agent.gateway}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        {t('node.controls')}
      </div>
      {(['input', 'merge', 'trigger'] as const).map((type) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => handleControlDragStart(e, type)}
          onClick={() => handleAddControl(type)}
          title={t('node.addHint')}
          className="mb-1.5 cursor-grab rounded-lg border border-yellow-700/38 bg-yellow-500/8 p-2 transition-colors hover:border-yellow-500/70 hover:bg-yellow-500/12"
        >
          <div className="text-xs font-medium text-yellow-300">
            <span className="mr-2 font-mono text-[9px] text-yellow-500/80">
              {controlPrefixes[type]}
            </span>
            {t(`node.${type}`)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-600">{t(controlHints[type])}</div>
        </div>
      ))}
      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] leading-relaxed text-slate-600">
        {t('agent.paletteHint', {
          openclaw: openclawAgents.length,
          hermes: hermesAgents.length,
        })}
      </div>
    </div>
  )
}
