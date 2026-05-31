import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAgentStore, type AgentInput } from '@/stores/agentStore'
import type { AgentInfo } from '@/api/types'

type AgentFormState = AgentInput & { id?: string }

const blankAgent: AgentFormState = {
  name: '',
  gateway: 'hermes',
  gatewayAgentId: 'hermes-agent',
  model: 'hermes-agent',
  status: 'idle',
  config: {
    endpoint: '',
    apiKey: '',
    token: '',
    password: '',
    notes: '',
  },
}

function formFromAgent(agent: AgentInfo): AgentFormState {
  return {
    id: agent.id,
    name: agent.name,
    gateway: agent.gateway,
    gatewayAgentId: agent.gatewayAgentId,
    model: agent.model || '',
    status: agent.status,
    config: {
      endpoint: String(agent.config?.endpoint || ''),
      apiKey: String(agent.config?.apiKey || ''),
      token: String(agent.config?.token || ''),
      password: String(agent.config?.password || ''),
      notes: String(agent.config?.notes || ''),
    },
  }
}

export default function AgentsPage() {
  const { t } = useTranslation()
  const {
    agents,
    loading,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    testAgentConnection,
  } = useAgentStore()
  const [form, setForm] = useState<AgentFormState>(blankAgent)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === form.id) || null,
    [agents, form.id],
  )

  const updateConfig = (key: string, value: string) => {
    setTestResult(null)
    setForm((prev) => ({ ...prev, config: { ...(prev.config || {}), [key]: value } }))
  }

  const handleGatewayChange = (gateway: AgentInfo['gateway']) => {
    setTestResult(null)
    setForm((prev) => {
      const isOpenClaw = gateway === 'openclaw'
      return {
        ...prev,
        gateway,
        gatewayAgentId: isOpenClaw
          ? prev.gateway === 'openclaw'
            ? prev.gatewayAgentId
            : 'agent:main:main'
          : prev.gateway === 'hermes'
            ? prev.gatewayAgentId
            : 'hermes-agent',
        model: isOpenClaw
          ? prev.gateway === 'openclaw'
            ? prev.model
            : ''
          : prev.gateway === 'hermes'
            ? prev.model || 'hermes-agent'
            : 'hermes-agent',
      }
    })
  }

  const handleNew = () => {
    setError(null)
    setTestResult(null)
    setForm({ ...blankAgent, config: { ...blankAgent.config } })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (
      !form.name.trim() ||
      !form.gatewayAgentId.trim() ||
      (form.gateway === 'hermes' && !form.model?.trim())
    ) {
      setError(t('agent.required'))
      return
    }

    setSaving(true)
    try {
      const payload: AgentInput = {
        name: form.name.trim(),
        gateway: form.gateway,
        gatewayAgentId: form.gatewayAgentId.trim(),
        model: form.model?.trim() || undefined,
        status: form.status || 'idle',
        config: form.config,
      }
      const saved = form.id ? await updateAgent(form.id, payload) : await createAgent(payload)
      setForm(formFromAgent(saved))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent.')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (!String(form.config?.endpoint || '').trim()) {
      setError(null)
      setTestResult({
        connected: false,
        message: t('agent.endpointRequired'),
      })
      return
    }

    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const result = await testAgentConnection({ gateway: form.gateway, config: form.config })
      setTestResult({
        connected: result.connected,
        message: result.connected
          ? t('agent.testSuccess', { url: result.url || String(form.config?.endpoint || '') })
          : t('agent.testFailed', { error: result.error || t('common.failed') }),
      })
    } catch (err) {
      setTestResult({
        connected: false,
        message: t('agent.testFailed', {
          error: err instanceof Error ? err.message : t('common.failed'),
        }),
      })
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id) return
    setSaving(true)
    setError(null)
    try {
      await deleteAgent(form.id)
      handleNew()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[360px] border-r border-gray-800 bg-gray-950/40 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-white">{t('nav.agents')}</h1>
            <p className="text-[11px] text-gray-500 mt-1">{t('agent.registryHint')}</p>
          </div>
          <button
            onClick={handleNew}
            className="rounded bg-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-accent/80"
          >
            {t('agent.new')}
          </button>
        </div>

        {loading ? (
          <div className="text-xs text-gray-500">{t('common.loading')}</div>
        ) : agents.length === 0 ? (
          <div className="rounded border border-gray-800 bg-gray-900 p-4 text-xs text-gray-500">
            {t('agent.noAgents')}
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  setError(null)
                  setTestResult(null)
                  setForm(formFromAgent(agent))
                }}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  form.id === agent.id
                    ? 'border-accent bg-accent/10'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-100">{agent.name}</div>
                    <div className="truncate text-[10px] text-gray-500">{agent.gatewayAgentId}</div>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] ${agent.gateway === 'openclaw' ? 'bg-blue-950 text-blue-300' : 'bg-red-950 text-red-300'}`}
                  >
                    {agent.gateway}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">{agent.model || t('agent.modelUnset')}</span>
                  <span className="text-gray-400">{agent.status}</span>
                </div>
                <div className="mt-2 truncate text-[10px] text-gray-600">
                  {agent.config?.endpoint || t('agent.endpointNotSet')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                {form.id ? t('agent.editAgent') : t('agent.newAgent')}
              </h2>
              <p className="mt-1 text-[11px] text-gray-500">{t('agent.pageHint')}</p>
            </div>
            {selectedAgent && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded border border-red-900/70 bg-red-950/30 px-3 py-1.5 text-[11px] font-semibold text-red-300 hover:border-red-500 disabled:opacity-50"
              >
                {t('agent.delete')}
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded border border-red-900/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
          {testResult && (
            <div
              className={`mb-4 rounded border px-3 py-2 text-xs ${
                testResult.connected
                  ? 'border-emerald-700/70 bg-emerald-950/30 text-emerald-200'
                  : 'border-red-900/70 bg-red-950/30 text-red-200'
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                {t('agent.name')}
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                {t('agent.gateway')}
              </span>
              <select
                value={form.gateway}
                onChange={(e) => handleGatewayChange(e.target.value as AgentInfo['gateway'])}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200"
              >
                <option value="hermes">hermes</option>
                <option value="openclaw">openclaw</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                {form.gateway === 'openclaw' ? t('agent.sessionKey') : t('agent.agentId')}
              </span>
              <input
                value={form.gatewayAgentId}
                onChange={(e) => setForm({ ...form, gatewayAgentId: e.target.value })}
                placeholder={form.gateway === 'openclaw' ? 'agent:main:main' : 'hermes-agent'}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                {t('agent.model')}
              </span>
              <input
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder={form.gateway === 'hermes' ? 'hermes-agent' : t('agent.modelOptional')}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200"
              />
            </label>
          </div>

          <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-gray-300">{t('agent.connection')}</div>
              <div className="text-[10px] text-gray-500">
                {form.gateway === 'openclaw'
                  ? t('agent.openclawProtocolHint')
                  : t('agent.hermesProtocolHint')}
              </div>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                  {form.gateway === 'openclaw' ? t('agent.websocketUrl') : t('agent.apiBaseUrl')}
                </span>
                <input
                  value={String(form.config?.endpoint || '')}
                  onChange={(e) => updateConfig('endpoint', e.target.value)}
                  placeholder={
                    form.gateway === 'openclaw' ? 'ws://127.0.0.1:18789' : 'http://localhost:8642'
                  }
                  className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                  {form.gateway === 'openclaw' ? t('agent.authToken') : t('agent.bearerToken')}
                </span>
                <input
                  type="password"
                  value={String(
                    form.gateway === 'openclaw'
                      ? form.config?.token || ''
                      : form.config?.apiKey || '',
                  )}
                  onChange={(e) =>
                    updateConfig(form.gateway === 'openclaw' ? 'token' : 'apiKey', e.target.value)
                  }
                  className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200"
                />
              </label>
              {form.gateway === 'openclaw' && (
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                    {t('agent.authPassword')}
                  </span>
                  <input
                    type="password"
                    value={String(form.config?.password || '')}
                    onChange={(e) => updateConfig('password', e.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                  {t('agent.notes')}
                </span>
                <textarea
                  value={String(form.config?.notes || '')}
                  onChange={(e) => updateConfig('notes', e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50"
            >
              {saving ? t('agent.saving') : t('agent.save')}
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="rounded border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent-light hover:bg-accent/20 disabled:cursor-wait disabled:opacity-50"
            >
              {testing ? t('agent.testing') : t('agent.testConnection')}
            </button>
            <button
              type="button"
              onClick={handleNew}
              className="rounded bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
            >
              {t('agent.reset')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
