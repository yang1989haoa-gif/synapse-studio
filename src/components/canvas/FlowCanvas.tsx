import { useCallback, useRef } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, type NodeTypes } from 'reactflow'
import 'reactflow/dist/style.css'
import { useFlowStore } from '@/stores/flowStore'
import { AgentNode } from './AgentNode'
import { ControlNode } from './ControlNode'
import { GroupNode } from './GroupNode'

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  control: ControlNode,
  group: GroupNode,
}

interface FlowCanvasProps {
  onNodeDoubleClick?: (event: MouseEvent, node: any) => void
  onNodeContextMenu?: (event: MouseEvent, node: any) => void
}

export function FlowCanvas({ onNodeDoubleClick, onNodeContextMenu }: FlowCanvasProps = {}) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, setSelectedNode } =
    useFlowStore()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const data = event.dataTransfer.getData('application/reactflow')
      if (!data) return
      const { type, data: nodeData } = JSON.parse(data)
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const id = `${type}-${Date.now()}`
      addNode({ id, type, position, data: nodeData })
      setSelectedNode(id)
    },
    [screenToFlowPosition, addNode, setSelectedNode],
  )

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  return (
    <div className="h-full flex-1 border-x border-slate-800/70 bg-slate-950" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        zoomOnScroll
        zoomOnPinch
        panOnScroll={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
        className="bg-canvas"
      >
        <Background color="#23304f" gap={22} size={1} />
        <Controls className="canvas-controls" />
        <MiniMap
          className="!border-slate-700/70 !bg-slate-950/90"
          nodeColor={(n) =>
            n.type === 'agent' ? (n.data.gateway === 'openclaw' ? '#5b9cf5' : '#f55b5b') : '#cfb55b'
          }
          maskColor="rgba(2,6,23,0.68)"
        />
      </ReactFlow>
    </div>
  )
}
