import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FlowCanvas } from '@/components/canvas/FlowCanvas'
import { AgentPalette } from '@/components/panels/AgentPalette'
import { PropertiesPanel } from '@/components/panels/PropertiesPanel'
import { DebugPanel } from '@/components/debug/DebugPanel'
import { AgentChatWindow } from '@/components/windows/AgentChatWindow'
import { useFlowStore, type AgentNodeData } from '@/stores/flowStore'
import { useDebugStore } from '@/stores/debugStore'
import { useExecutionStore } from '@/stores/executionStore'

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
}

export default function FlowEditorPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [openWindows, setOpenWindows] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const nodes = useFlowStore((s) => s.nodes)
  const loadFlow = useFlowStore((s) => s.loadFlow)
  const createOrSaveFlow = useFlowStore((s) => s.createOrSaveFlow)
  const resetNodeStatuses = useFlowStore((s) => s.resetNodeStatuses)
  const flowName = useFlowStore((s) => s.flowName)
  const selectedNode = useFlowStore((s) => s.selectedNode)
  const removeNode = useFlowStore((s) => s.removeNode)
  const addNode = useFlowStore((s) => s.addNode)
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode)
  const addDebugEntry = useDebugStore((s) => s.addEntry)
  const clearDebugEntries = useDebugStore((s) => s.clearEntries)
  const currentExecution = useExecutionStore((s) => s.current)
  const startingExecution = useExecutionStore((s) => s.starting)
  const startExecution = useExecutionStore((s) => s.startExecution)
  const cancelExecution = useExecutionStore((s) => s.cancelExecution)
  const resetExecution = useExecutionStore((s) => s.resetExecution)

  useEffect(() => {
    resetExecution()
    clearDebugEntries()
    if (id) loadFlow(id)
  }, [id, loadFlow, resetExecution, clearDebugEntries])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedNode || (event.key !== 'Delete' && event.key !== 'Backspace')) return
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName.toLowerCase()
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable
      )
        return

      const node = nodes.find((n) => n.id === selectedNode)
      if (!node) return
      removeNode(selectedNode)
      setSelectedNode(null)
      setContextMenu(null)
      addDebugEntry({
        level: 'info',
        message: `${String(node.data?.label || selectedNode)} deleted`,
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, nodes, removeNode, setSelectedNode, addDebugEntry])

  const handleCloseWindow = (nodeId: string) => {
    setOpenWindows((prev) => {
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
  }

  const handleNodeDoubleClick = (_: any, node: any) => {
    if (node.type === 'agent') {
      setOpenWindows((prev) => new Set(prev).add(node.id))
    }
  }

  const handleNodeContextMenu = (event: React.MouseEvent, node: any) => {
    event.preventDefault()
    setSelectedNode(node.id)
    setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleOpenChat = () => {
    if (!contextMenu) return
    const node = nodes.find((n) => n.id === contextMenu.nodeId)
    if (node?.type === 'agent') {
      setOpenWindows((prev) => new Set(prev).add(node.id))
    }
    closeContextMenu()
  }

  const handleDuplicateNode = () => {
    if (!contextMenu) return
    const node = nodes.find((n) => n.id === contextMenu.nodeId)
    if (!node) return
    const id = `${node.type}-${Date.now()}`
    addNode({
      ...node,
      id,
      selected: false,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data, label: `${String(node.data?.label || node.type)} Copy` } as any,
    })
    setSelectedNode(id)
    addDebugEntry({
      level: 'info',
      message: `${String(node.data?.label || node.id)} duplicated`,
      nodeId: id,
    })
    closeContextMenu()
  }

  const handleDeleteNode = () => {
    if (!contextMenu) return
    const node = nodes.find((n) => n.id === contextMenu.nodeId)
    if (!node) return
    removeNode(node.id)
    setSelectedNode(null)
    addDebugEntry({ level: 'info', message: `${String(node.data?.label || node.id)} deleted` })
    closeContextMenu()
  }

  const handleSave = async () => {
    try {
      const savedId = await createOrSaveFlow()
      addDebugEntry({ level: 'info', message: t('flow.saved', { id: savedId.slice(0, 8) }) })
    } catch (err) {
      addDebugEntry({
        level: 'error',
        message: err instanceof Error ? err.message : 'Failed to save flow',
      })
    }
  }

  const handleRun = async () => {
    if (nodes.length === 0) {
      addDebugEntry({ level: 'warn', message: t('flow.emptyRun') })
      return
    }
    try {
      clearDebugEntries()
      resetNodeStatuses()
      const savedId = await createOrSaveFlow()
      await startExecution(savedId)
    } catch (err) {
      if ((err as { debugLogged?: boolean })?.debugLogged) return
      addDebugEntry({
        level: 'error',
        message: err instanceof Error ? err.message : 'Failed to run flow',
      })
    }
  }

  const handleCancel = async () => {
    if (!currentExecution) return
    try {
      await cancelExecution(currentExecution.id)
    } catch (err) {
      addDebugEntry({
        level: 'error',
        message: err instanceof Error ? err.message : 'Failed to cancel execution',
      })
    }
  }

  return (
    <div className="flex flex-col h-screen" onClick={closeContextMenu}>
      <div className="flex items-center justify-between border-b border-slate-800/70 bg-slate-950/86 px-4 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{flowName || t('flow.untitled')}</span>
          {id && (
            <span className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
              #{id.slice(0, 8)}
            </span>
          )}
          {currentExecution && (
            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
              {currentExecution.status}
              {currentExecution.totalDuration
                ? ` | ${(currentExecution.totalDuration / 1000).toFixed(1)}s`
                : ''}
              {currentExecution.totalTokens ? ` | ${currentExecution.totalTokens} tok` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="primary-action rounded-md px-3.5 py-1.5 text-[11px] font-semibold text-white"
          >
            {t('flow.save')}
          </button>
          {currentExecution?.status === 'running' ? (
            <button
              onClick={handleCancel}
              className="rounded-md border border-red-500/40 bg-red-500/16 px-3.5 py-1.5 text-[11px] font-semibold text-red-100 hover:bg-red-500/24"
            >
              {t('flow.cancel')}
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={startingExecution || nodes.length === 0}
              className="success-action rounded-md px-3.5 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {startingExecution ? t('common.loading') : t('flow.run')}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <AgentPalette />
        <FlowCanvas
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeContextMenu={handleNodeContextMenu}
        />
        <PropertiesPanel />
      </div>
      {contextMenu &&
        (() => {
          const node = nodes.find((n) => n.id === contextMenu.nodeId)
          if (!node) return null
          return (
            <div
              className="fixed z-50 w-40 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/96 py-1 shadow-2xl shadow-black/40 backdrop-blur"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleDuplicateNode}
                className="block w-full px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-slate-800"
              >
                {t('common.duplicate')}
              </button>
              {node.type === 'agent' && (
                <button
                  type="button"
                  onClick={handleOpenChat}
                  className="block w-full px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-slate-800"
                >
                  {t('common.openChat')}
                </button>
              )}
              <button
                type="button"
                onClick={handleDeleteNode}
                className="block w-full px-3 py-2 text-left text-[11px] text-red-300 hover:bg-red-950/50"
              >
                {t('common.delete')}
              </button>
            </div>
          )
        })()}
      <DebugPanel />
      {Array.from(openWindows).map((nodeId, index) => {
        const node = nodes.find((n) => n.id === nodeId)
        if (!node || node.type !== 'agent') return null
        return (
          <AgentChatWindow
            key={nodeId}
            nodeId={nodeId}
            data={node.data as AgentNodeData}
            onClose={() => handleCloseWindow(nodeId)}
            style={{ left: 80 + index * 30, top: 80 + index * 20 }}
          />
        )
      })}
    </div>
  )
}
