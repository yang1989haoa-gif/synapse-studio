import { useTranslation } from 'react-i18next'
import { useDebugStore } from '@/stores/debugStore'
import { useFlowStore } from '@/stores/flowStore'

const levelClass: Record<string, { border: string; text: string; bg: string }> = {
  error: { border: 'border-red-500/70', text: 'text-red-300', bg: 'bg-red-500/10' },
  warn: { border: 'border-amber-500/70', text: 'text-amber-300', bg: 'bg-amber-500/10' },
  info: { border: 'border-emerald-500/70', text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
}

export function DebugPanel() {
  const { t } = useTranslation()
  const { entries, activeTab, filter, setActiveTab, setFilter, clearEntries } = useDebugStore()
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode)

  const tabEntries =
    activeTab === 'errors'
      ? entries.filter((e) => e.level === 'error')
      : activeTab === 'trace'
        ? entries.filter((e) => e.nodeId || e.gateway)
        : activeTab === 'metrics'
          ? entries.filter((e) =>
              /token|tok|elapsed|completed|执行完成|耗时|指标/i.test(
                `${e.message} ${e.details || ''}`,
              ),
            )
          : entries
  const filteredEntries =
    filter === 'all' ? tabEntries : tabEntries.filter((e) => e.level === filter)
  const errorCount = entries.filter((e) => e.level === 'error').length
  const tabs = [
    ['errors', t('debug.errors'), errorCount],
    ['log', t('debug.executionLog'), null],
    ['trace', t('debug.trace'), null],
    ['metrics', t('debug.metrics'), null],
  ] as const

  return (
    <div className="flex h-[220px] flex-col border-t border-slate-800/80 bg-slate-950">
      <div className="flex border-b border-slate-800/80 bg-slate-900/70">
        {tabs.map(([tab, label, count]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab as any)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-[11px] font-medium ${
              activeTab === tab
                ? 'border-accent text-white'
                : 'border-transparent text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
            }`}
          >
            <span className="font-mono text-[10px] text-slate-600">
              {tab.slice(0, 2).toUpperCase()}
            </span>
            {label}
            {count !== null && count > 0 && (
              <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9px] text-white">
                {count}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300"
          >
            <option value="all">All</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
          </select>
          <button
            onClick={clearEntries}
            className="rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            {t('debug.clear')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px]">
        {filteredEntries.length === 0 && (
          <div className="grid h-full place-items-center text-slate-600">
            <div className="rounded-lg border border-dashed border-slate-800 px-6 py-4">
              {t('debug.noEntries')}
            </div>
          </div>
        )}
        {filteredEntries.map((entry) => {
          const tone = levelClass[entry.level] || levelClass.info
          return (
            <div
              key={entry.id}
              onClick={() => {
                if (!entry.nodeId) return
                setSelectedNode(entry.nodeId)
                if (entry.level === 'error') updateNodeData(entry.nodeId, { status: 'error' })
              }}
              className={`mb-2 cursor-pointer rounded-lg border border-l-4 border-slate-800 ${tone.border} ${tone.bg} px-3 py-2 hover:border-slate-600`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`font-semibold ${tone.text}`}>{entry.level.toUpperCase()}</span>
                <span className="text-slate-500">{entry.timestamp}</span>
                {entry.nodeName && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-accent-light">
                    {entry.nodeName}
                  </span>
                )}
                {entry.gateway && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300">
                    {entry.gateway}
                  </span>
                )}
              </div>
              <div className="text-slate-200">{entry.message}</div>
              {entry.details && <div className="mt-1 text-slate-500">{entry.details}</div>}
              {entry.suggestion && (
                <div className="mt-2 rounded border border-emerald-900/50 bg-emerald-950/20 p-2">
                  <div className="mb-1 text-[10px] font-semibold text-emerald-300">
                    {t('debug.suggestedFix')}
                  </div>
                  {entry.suggestion.map((s, i) => (
                    <div key={i} className="text-[10px] text-slate-400">
                      {i + 1}. {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
