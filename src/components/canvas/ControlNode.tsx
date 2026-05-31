import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, NodeResizer, Position, type NodeProps } from 'reactflow'
import type { ControlNodeData } from '@/stores/flowStore'

const labels: Record<string, string> = { input: 'IN', merge: 'MG', trigger: 'TR' }
const descriptions: Record<string, string> = {
  input: 'node.starterText',
  merge: 'node.mergedOutput',
  trigger: 'node.branchTrigger',
}

const statusColors: Record<string, string> = {
  idle: '#cfb55b',
  working: '#5b9cf5',
  waiting: '#cfb55b',
  done: '#4caf50',
  error: '#f44336',
  blocked: '#6b7280',
}

function ControlNodeComponent({ data, selected }: NodeProps<ControlNodeData>) {
  const { t } = useTranslation()
  const status = data.status || 'idle'
  const accent = statusColors[status] || '#cfb55b'

  return (
    <div
      className="relative h-full min-h-[54px] w-full min-w-[120px] cursor-pointer rounded-lg px-3 py-2 shadow-[0_16px_36px_rgba(2,6,23,0.24)] transition-all hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(180deg, rgba(46, 42, 24, 0.96), rgba(17, 18, 14, 0.98))',
        border: `1px solid ${selected ? '#f6d96a' : `${accent}99`}`,
        boxShadow: selected
          ? '0 0 0 1px rgba(246,217,106,0.38), 0 18px 42px rgba(2,6,23,0.34)'
          : '0 16px 36px rgba(2,6,23,0.24)',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={54}
        lineClassName="!border-yellow-500"
        handleClassName="!h-2.5 !w-2.5 !border-yellow-500 !bg-gray-950"
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: accent, width: 8, height: 8 }}
      />
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: accent }}>
        <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 font-mono text-[9px] text-yellow-300/80">
          {labels[data.controlType]}
        </span>
        <span className="truncate text-slate-100">{data.label}</span>
      </div>
      <div className="mt-1 truncate text-[9px] uppercase tracking-[0.12em] text-yellow-100/45">
        {status === 'idle' ? t(descriptions[data.controlType]) : t(`node.${status}`)}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: accent, width: 8, height: 8 }}
      />
    </div>
  )
}

export const ControlNode = memo(ControlNodeComponent)
