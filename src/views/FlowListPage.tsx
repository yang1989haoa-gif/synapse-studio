import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface FlowSummary {
  id: string
  name: string
  description: string
  status: string
  updated_at: string
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-600 text-gray-200',
  active: 'bg-green-600 text-white',
  archived: 'bg-yellow-700 text-yellow-100',
  error: 'bg-red-600 text-white',
}

export default function FlowListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFlows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/flows')
      if (res.ok) {
        setFlows(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFlows()
  }, [])

  const handleNew = async () => {
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: t('flow.new'),
        description: '',
        config: { nodes: [], edges: [], groups: [] },
      }),
    })
    if (res.ok) {
      const flow = await res.json()
      navigate(`/flow/${flow.id}`)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const res = await fetch(`/api/flows/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setFlows((prev) => prev.filter((f) => f.id !== id))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">{t('dashboard.title')}</h1>
            <span className="rounded-md border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-[11px] text-slate-400">
              {t('dashboard.flowCount', { count: flows.length })}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/agents')}
            className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-800"
          >
            {t('dashboard.manageAgents')}
          </button>
          <button
            onClick={handleNew}
            className="rounded-md bg-accent px-4 py-2 text-xs text-white hover:bg-accent/80"
          >
            + {t('flow.new')}
          </button>
        </div>
      </div>

      {flows.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-20">{t('common.noData')}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {flows.map((flow) => (
            <div
              key={flow.id}
              onClick={() => navigate(`/flow/${flow.id}`)}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 cursor-pointer hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-200 truncate flex-1 mr-2">
                  {flow.name || flow.id}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] shrink-0 ${statusColors[flow.status] || statusColors.draft}`}
                >
                  {flow.status}
                </span>
              </div>
              {flow.description && (
                <p className="text-[11px] text-gray-500 mb-3 line-clamp-2">{flow.description}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600">
                  {flow.updated_at ? new Date(flow.updated_at).toLocaleString() : ''}
                </span>
                <button
                  onClick={(e) => handleDelete(e, flow.id)}
                  className="text-[10px] text-gray-500 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-800"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
