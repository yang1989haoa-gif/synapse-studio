import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFlowStore, type ControlNodeData } from '@/stores/flowStore'

const controlDescriptions: Record<ControlNodeData['controlType'], string> = {
  input: 'node.inputDescription',
  merge: 'node.mergeDescription',
  trigger: 'node.triggerDescription',
}

function isControlNodeData(data: unknown): data is ControlNodeData {
  return Boolean(data && typeof data === 'object' && 'controlType' in data)
}

const fieldClass =
  'w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600'
const labelClass = 'mb-1 block text-[10px] font-medium text-slate-500'

export function PropertiesPanel() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('synapse-properties-panel-collapsed') === '1',
  )
  const selectedNode = useFlowStore((s) => s.selectedNode)
  const nodes = useFlowStore((s) => s.nodes)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const removeNode = useFlowStore((s) => s.removeNode)
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode)

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('synapse-properties-panel-collapsed', next ? '1' : '0')
      return next
    })
  }

  if (collapsed) {
    return (
      <div className="panel-surface flex w-10 shrink-0 flex-col items-center border-l py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={t('common.expand')}
          className="h-8 w-8 rounded-md border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:border-accent hover:text-white"
        >
          ED
        </button>
        <div className="mt-3 rotate-90 whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-slate-600">
          {t('common.edit')}
        </div>
      </div>
    )
  }

  const node = nodes.find((n) => n.id === selectedNode)
  if (!node)
    return (
      <div className="panel-surface w-[250px] shrink-0 border-l p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            {t('common.edit')}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={t('common.collapse')}
            className="rounded-md border border-slate-800 px-2 py-1 text-[10px] text-slate-500 hover:border-slate-600 hover:text-slate-200"
          >
            ›
          </button>
        </div>
        <div className="grid h-24 place-items-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-600">
          {t('common.noData')}
        </div>
      </div>
    )

  const data = node.data as any
  const handleDelete = () => {
    removeNode(node.id)
    setSelectedNode(null)
  }

  return (
    <div className="panel-surface w-[250px] shrink-0 overflow-y-auto border-l p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          {t('common.properties')}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={t('common.collapse')}
            className="rounded-md border border-slate-800 px-2 py-1 text-[10px] text-slate-500 hover:border-slate-600 hover:text-slate-200"
          >
            ›
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200 hover:border-red-400 hover:bg-red-500/16"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>

      {node.type === 'agent' && (
        <div className="soft-card rounded-lg p-3">
          <div
            className="mb-3 truncate text-sm font-semibold"
            style={{ color: data.gateway === 'openclaw' ? '#8bbdff' : '#ff8888' }}
          >
            {data.label}
          </div>

          <label className="mb-2 block">
            <span className={labelClass}>{t('agent.name')}</span>
            <input
              type="text"
              value={data.label ?? ''}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
              className={fieldClass}
            />
          </label>

          <label className="mb-2 block">
            <span className={labelClass}>{t('agent.gateway')}</span>
            <select
              value={data.gateway ?? 'openclaw'}
              onChange={(e) =>
                updateNodeData(node.id, { gateway: e.target.value as 'openclaw' | 'hermes' })
              }
              className={fieldClass}
            >
              <option value="openclaw">openclaw</option>
              <option value="hermes">hermes</option>
            </select>
          </label>

          <label className="mb-2 block">
            <span className={labelClass}>
              {data.gateway === 'openclaw' ? t('agent.modelOptional') : t('agent.model')}
            </span>
            <input
              type="text"
              value={data.model ?? ''}
              onChange={(e) => updateNodeData(node.id, { model: e.target.value })}
              className={fieldClass}
            />
          </label>

          <label className="mb-2 block">
            <span className={labelClass}>
              {data.gateway === 'openclaw' ? t('agent.websocketUrl') : t('agent.apiBaseUrl')}
            </span>
            <input
              type="text"
              value={data.endpoint ?? ''}
              onChange={(e) => updateNodeData(node.id, { endpoint: e.target.value })}
              className={fieldClass}
            />
          </label>

          <label className="mb-2 block">
            <span className={labelClass}>
              {data.gateway === 'openclaw' ? t('agent.authToken') : t('agent.bearerToken')}
            </span>
            <input
              type="password"
              value={data.gateway === 'openclaw' ? (data.token ?? '') : (data.apiKey ?? '')}
              onChange={(e) =>
                updateNodeData(
                  node.id,
                  data.gateway === 'openclaw'
                    ? { token: e.target.value }
                    : { apiKey: e.target.value },
                )
              }
              className={fieldClass}
            />
          </label>

          <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
            <div className={labelClass}>{t('agent.status')}</div>
            <div className="text-xs capitalize text-slate-300">
              {t(`node.${data.status || 'idle'}`)}
            </div>
          </div>
        </div>
      )}

      {node.type === 'control' && isControlNodeData(data) && (
        <div className="soft-card rounded-lg p-3">
          <div className="mb-3 text-sm font-semibold text-yellow-300">{data.label}</div>

          <label className="mb-2 block">
            <span className={labelClass}>{t('agent.name')}</span>
            <input
              type="text"
              value={data.label ?? ''}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
              className={fieldClass}
            />
          </label>

          <label className="mb-2 block">
            <span className={labelClass}>{t('node.controlType')}</span>
            <select
              value={data.controlType}
              onChange={(e) =>
                updateNodeData(node.id, {
                  controlType: e.target.value as ControlNodeData['controlType'],
                })
              }
              className={fieldClass}
            >
              <option value="input">input</option>
              <option value="merge">merge</option>
              <option value="trigger">trigger</option>
            </select>
          </label>

          <div className="mt-3 rounded-md border border-yellow-700/30 bg-yellow-500/8 p-2 text-[11px] leading-relaxed text-yellow-100/80">
            {t(controlDescriptions[data.controlType])}
          </div>

          {data.controlType === 'input' && (
            <label className="mt-3 block">
              <span className={labelClass}>{t('node.inputValue')}</span>
              <textarea
                value={data.value ?? ''}
                onChange={(e) => updateNodeData(node.id, { value: e.target.value })}
                rows={4}
                className={`${fieldClass} resize-none`}
              />
            </label>
          )}

          <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
            <div className={labelClass}>{t('agent.status')}</div>
            <div className="text-xs capitalize text-slate-300">
              {t(`node.${data.status || 'idle'}`)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
