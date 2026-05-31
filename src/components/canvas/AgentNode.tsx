import { memo } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from 'reactflow'
import type { AgentNodeData } from '@/stores/flowStore'
import { useFlowStore } from '@/stores/flowStore'

const statusColors: Record<string, string> = {
  idle: '#64748b',
  working: '#22c55e',
  waiting: '#eab308',
  done: '#22c55e',
  error: '#ef4444',
  blocked: '#64748b',
}

function AgentNodeComponent({ id, data, selected }: NodeProps<AgentNodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode)
  const gatewayColor = data.gateway === 'openclaw' ? '#5b9cf5' : '#f55b5b'
  const gatewayBg =
    data.gateway === 'openclaw'
      ? 'linear-gradient(180deg, rgba(28, 43, 73, 0.96), rgba(12, 18, 32, 0.98))'
      : 'linear-gradient(180deg, rgba(57, 25, 32, 0.94), rgba(18, 13, 20, 0.98))'
  const status = data.status || 'idle'
  const statusColor = statusColors[status] || statusColors.idle

  return (
    <div
      onClick={() => setSelectedNode(id)}
      className="relative h-full min-h-[54px] w-full min-w-[130px] cursor-pointer rounded-lg px-3 py-2 shadow-[0_16px_36px_rgba(2,6,23,0.28)] transition-all hover:-translate-y-0.5"
      style={{
        background: gatewayBg,
        border: `1px solid ${status === 'error' ? '#ef4444' : selected ? '#a08aff' : `${gatewayColor}88`}`,
        boxShadow:
          status === 'error'
            ? '0 0 24px rgba(239,68,68,0.34)'
            : selected
              ? '0 0 0 1px rgba(124,92,252,0.44), 0 18px 42px rgba(2,6,23,0.36)'
              : '0 16px 36px rgba(2,6,23,0.28)',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={130}
        minHeight={54}
        lineClassName="!border-accent"
        handleClassName="!h-2.5 !w-2.5 !border-accent !bg-gray-950"
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: gatewayColor, width: 8, height: 8 }}
      />
      <div className="mb-1 flex items-center gap-1.5">
        <div
          className="h-2 w-2 rounded-full shadow-[0_0_12px_currentColor]"
          style={{
            background: statusColor,
            color: statusColor,
            animation: status === 'working' ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span className="truncate text-xs font-semibold text-slate-100">{data.label}</span>
      </div>
      <div className="truncate font-mono text-[10px] text-slate-500">
        {data.gateway}
        {data.model ? ` / ${data.model}` : ''}
      </div>
      {status === 'working' && data.elapsed !== undefined && (
        <div className="mt-0.5 text-[10px] text-emerald-300">
          Working... {data.elapsed.toFixed(1)}s
        </div>
      )}
      {status === 'done' && (
        <div className="mt-0.5 text-[10px] text-emerald-300">
          Done / {data.elapsed?.toFixed(1)}s / {data.tokens?.toLocaleString()} tok
        </div>
      )}
      {status === 'error' && (
        <div className="absolute -right-2 -top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
          !
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: gatewayColor, width: 8, height: 8 }}
      />
    </div>
  )
}

export const AgentNode = memo(AgentNodeComponent)
