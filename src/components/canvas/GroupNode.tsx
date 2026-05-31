import { memo } from 'react'
import { type NodeProps } from 'reactflow'
import type { GroupNodeData } from '@/stores/flowStore'

const patternLabels: Record<string, string> = {
  pipeline: '→ Pipeline',
  hierarchy: '👑 Hierarchy',
  mesh: '↔ Mesh',
}

function GroupNodeComponent({ data }: NodeProps<GroupNodeData>) {
  return (
    <div
      className="w-full h-full rounded-2xl relative"
      style={{ background: `${data.color}08`, border: `2px dashed ${data.color}44` }}
    >
      <div className="absolute -top-3 left-4 px-2" style={{ background: '#0d0d1a' }}>
        <span className="text-xs font-semibold" style={{ color: data.color }}>
          📁 {data.label}
        </span>
        <span className="text-[10px] text-gray-500 ml-2">{patternLabels[data.pattern]}</span>
      </div>
      <div className="absolute top-1 right-3 text-sm cursor-pointer" style={{ color: data.color }}>
        ⚙
      </div>
    </div>
  )
}

export const GroupNode = memo(GroupNodeComponent)
