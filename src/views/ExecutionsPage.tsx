import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface ExecutionSummary {
  id: string
  flow_id: string
  status: string
  started_at?: string
  finished_at?: string
  output?: Record<string, ExecutionNodeOutput> | { error?: string } | null
}

interface ExecutionNodeOutput {
  output?: string
  message?: string
  tokens?: number
  elapsed?: number
}

interface ExecutionEvent {
  id: number
  execution_id: string
  event_type: string
  node_id?: string | null
  data?: Record<string, unknown> | null
  created_at?: string
}

const statusColors: Record<string, string> = {
  running: 'bg-green-600 text-white',
  completed: 'bg-blue-600 text-white',
  failed: 'bg-red-600 text-white',
  cancelled: 'bg-yellow-700 text-yellow-100',
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : '-'
}

function compactText(value: unknown) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return JSON.stringify(value, null, 2)
}

function isNodeOutput(value: unknown): value is ExecutionNodeOutput {
  return Boolean(value && typeof value === 'object' && ('output' in value || 'message' in value))
}

export default function ExecutionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [executions, setExecutions] = useState<ExecutionSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [events, setEvents] = useState<ExecutionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const selectedExecution = useMemo(
    () => executions.find((execution) => execution.id === selectedId) || executions[0] || null,
    [executions, selectedId],
  )
  const selectedExecutionId = selectedExecution?.id || null

  const nodeOutputs = useMemo(() => {
    if (!selectedExecution?.output || 'error' in selectedExecution.output) return []
    return Object.entries(selectedExecution.output).filter(([, value]) => isNodeOutput(value)) as [
      string,
      ExecutionNodeOutput,
    ][]
  }, [selectedExecution])

  const fetchExecutions = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/executions')
      if (res.ok) {
        const data = (await res.json()) as ExecutionSummary[]
        setExecutions(data)
        setSelectedId((current) => current || data[0]?.id || null)
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchEvents = async (executionId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/executions/${executionId}/event-log`)
      if (res.ok) setEvents(await res.json())
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    fetchExecutions()
  }, [])

  useEffect(() => {
    if (selectedExecutionId) fetchEvents(selectedExecutionId)
  }, [selectedExecutionId])

  const clearExecutions = async () => {
    setClearing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/executions', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Failed to clear executions: ${res.status}`)
      const remaining = executions.filter((execution) => execution.status === 'running')
      setExecutions(remaining)
      setSelectedId(remaining[0]?.id || null)
      setEvents([])
      setMessage(t('executions.cleared', { count: data.deleted || 0 }))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('executions.clearFailed'))
    } finally {
      setClearing(false)
    }
  }

  const rerunExecution = async () => {
    if (!selectedExecution) return
    setRerunning(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/flows/${selectedExecution.flow_id}/run`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Failed to rerun flow: ${res.status}`)
      setMessage(t('executions.rerunStarted', { id: String(data.executionId).slice(0, 8) }))
      await fetchExecutions()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('executions.rerunFailed'))
    } finally {
      setRerunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{t('nav.executions')}</h1>
          <p className="mt-1 text-xs text-gray-500">{t('executions.hint')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearExecutions}
            disabled={clearing || executions.every((execution) => execution.status === 'running')}
            className="rounded border border-red-900/70 bg-red-950/60 px-4 py-2 text-xs text-red-200 hover:border-red-500 disabled:opacity-50"
          >
            {clearing ? t('executions.clearing') : t('executions.clear')}
          </button>
          <button
            onClick={fetchExecutions}
            className="rounded bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
          >
            {t('executions.refresh')}
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-400">
          {message}
        </div>
      )}

      {executions.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">
          {t('common.noData')}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(420px,1fr)_420px] gap-4">
          <div className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
            <div className="grid grid-cols-[1fr_110px_150px] border-b border-gray-800 bg-gray-950 px-4 py-3 text-[10px] uppercase text-gray-500">
              <div>{t('executions.execution')}</div>
              <div>{t('executions.status')}</div>
              <div>{t('executions.started')}</div>
            </div>
            <div className="max-h-full overflow-y-auto">
              {executions.map((execution) => (
                <button
                  key={execution.id}
                  type="button"
                  onClick={() => setSelectedId(execution.id)}
                  className={`grid w-full grid-cols-[1fr_110px_150px] items-center border-b border-gray-800 px-4 py-3 text-left text-xs transition-colors ${
                    selectedExecution?.id === execution.id ? 'bg-accent/12' : 'hover:bg-gray-800/70'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-gray-200">{execution.id.slice(0, 8)}</div>
                    <div className="mt-1 font-mono text-[10px] text-gray-600">
                      {execution.flow_id.slice(0, 8)}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] ${statusColors[execution.status] || 'bg-gray-700 text-gray-200'}`}
                    >
                      {execution.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {formatDate(execution.started_at)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <aside className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
            {selectedExecution ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-semibold text-white">
                        {selectedExecution.id.slice(0, 8)}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {t('executions.flow')} {selectedExecution.flow_id.slice(0, 8)}
                      </div>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] ${statusColors[selectedExecution.status] || 'bg-gray-700 text-gray-200'}`}
                    >
                      {selectedExecution.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded border border-gray-800 bg-gray-900 p-2">
                      <div className="text-gray-600">{t('executions.started')}</div>
                      <div className="mt-1 text-gray-300">
                        {formatDate(selectedExecution.started_at)}
                      </div>
                    </div>
                    <div className="rounded border border-gray-800 bg-gray-900 p-2">
                      <div className="text-gray-600">{t('executions.finished')}</div>
                      <div className="mt-1 text-gray-300">
                        {formatDate(selectedExecution.finished_at)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/flow/${selectedExecution.flow_id}`)}
                      className="rounded border border-slate-700 px-3 py-1.5 text-[11px] text-slate-200 hover:border-slate-500"
                    >
                      {t('executions.openFlow')}
                    </button>
                    <button
                      type="button"
                      onClick={rerunExecution}
                      disabled={rerunning}
                      className="rounded bg-green-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      {rerunning ? t('common.loading') : t('executions.rerun')}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <section className="mb-5">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                      {t('executions.nodeOutputs')}
                    </h2>
                    {nodeOutputs.length === 0 ? (
                      <div className="rounded border border-dashed border-gray-800 p-4 text-center text-xs text-gray-600">
                        {compactText(
                          (selectedExecution.output as { error?: string } | null)?.error,
                        ) || t('common.noData')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {nodeOutputs.map(([nodeId, item]) => (
                          <div
                            key={nodeId}
                            className="rounded border border-gray-800 bg-gray-900 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="font-mono text-[11px] text-accent-light">
                                {nodeId}
                              </span>
                              <span className="text-[10px] text-gray-600">
                                {typeof item.elapsed === 'number'
                                  ? `${item.elapsed.toFixed(2)}s`
                                  : ''}
                                {typeof item.tokens === 'number' ? ` · ${item.tokens} tok` : ''}
                              </span>
                            </div>
                            {item.message && (
                              <div className="mb-2 text-[11px] text-gray-500">{item.message}</div>
                            )}
                            <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded bg-gray-950 p-2 text-[11px] leading-relaxed text-gray-300">
                              {compactText(item.output)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                      {t('executions.eventTimeline')}
                    </h2>
                    {detailLoading ? (
                      <div className="text-xs text-gray-600">{t('common.loading')}</div>
                    ) : events.length === 0 ? (
                      <div className="rounded border border-dashed border-gray-800 p-4 text-center text-xs text-gray-600">
                        {t('common.noData')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {events.map((event) => (
                          <div
                            key={event.id}
                            className="rounded border border-gray-800 bg-gray-900 p-3"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-gray-300">
                                {event.event_type}
                              </span>
                              <span className="text-[10px] text-gray-600">
                                {formatDate(event.created_at)}
                              </span>
                            </div>
                            {event.node_id && (
                              <div className="mb-1 font-mono text-[10px] text-gray-600">
                                {event.node_id}
                              </div>
                            )}
                            {event.data && (
                              <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-gray-500">
                                {compactText(event.data)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-xs text-gray-600">
                {t('common.noData')}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
