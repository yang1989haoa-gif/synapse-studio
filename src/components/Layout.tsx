import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGatewayStore } from '@/stores/gatewayStore'

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const statuses = useGatewayStore((s) => s.statuses)
  const details = useGatewayStore((s) => s.details)
  const fetchStatus = useGatewayStore((s) => s.fetchStatus)

  useEffect(() => {
    fetchStatus()
    const timer = window.setInterval(fetchStatus, 30000)
    return () => window.clearInterval(timer)
  }, [fetchStatus])

  const navItems: { path: string; matchPrefix?: string; label: string; icon: string }[] = [
    { path: '/', matchPrefix: '/flow/', label: t('nav.flows'), icon: 'FL' },
    { path: '/agents', label: t('nav.agents'), icon: 'AG' },
    { path: '/executions', label: t('nav.executions'), icon: 'EX' },
  ]

  return (
    <div className="app-shell flex h-screen">
      <nav className="panel-surface flex w-[224px] flex-col border-r">
        <div className="border-b border-slate-800/70 px-4 py-4">
          <div className="text-[15px] font-semibold text-white">Synapse Studio</div>
          <div className="mt-1 max-w-[18ch] text-[10px] leading-relaxed text-slate-500">
            {t('app.subtitle')}
          </div>
        </div>

        <div className="flex-1 py-3">
          <div className="mx-3 mb-4 rounded-lg border border-slate-800/80 bg-slate-950/72 p-2.5 shadow-inner">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
              {t('common.language')}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => i18n.changeLanguage('zh-CN')}
                className={`rounded-md px-2 py-2 text-[11px] font-semibold ${i18n.language === 'zh-CN' ? 'primary-action text-white' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-100'}`}
              >
                ZH
              </button>
              <button
                onClick={() => i18n.changeLanguage('en-US')}
                className={`rounded-md px-2 py-2 text-[11px] font-semibold ${i18n.language === 'en-US' ? 'primary-action text-white' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-100'}`}
              >
                EN
              </button>
            </div>
          </div>

          {navItems.map((item) => {
            const active =
              location.pathname === item.path ||
              (item.matchPrefix && location.pathname.startsWith(item.matchPrefix))
            return (
              <a
                key={item.path}
                href={item.path}
                className={`mx-2 mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-medium ${active ? 'border border-accent/30 bg-accent/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'border border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-800/48 hover:text-slate-100'}`}
              >
                <span
                  className={`grid h-5 w-6 place-items-center rounded text-[9px] font-bold ${active ? 'bg-accent/22 text-accent-light' : 'bg-slate-900 text-slate-500'}`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </a>
            )
          })}
        </div>

        <div className="border-t border-slate-800/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {t('status.title')}
            </span>
            <button
              type="button"
              onClick={fetchStatus}
              className="rounded border border-slate-800 px-2 py-1 text-[9px] text-slate-400 hover:border-slate-600 hover:text-white"
            >
              {t('status.refresh')}
            </button>
          </div>
          <div
            className="mb-2 flex items-center gap-2"
            title={details.openclaw?.error || details.openclaw?.url}
          >
            <div
              className={`h-2 w-2 rounded-full shadow-[0_0_14px_currentColor] ${statuses.openclaw ? 'bg-emerald-400 text-emerald-400' : 'bg-red-400 text-red-400'}`}
            />
            <span className="text-[10px] text-slate-400">OpenClaw</span>
            <span className="ml-auto max-w-[82px] truncate text-[9px] text-slate-600">
              {details.openclaw?.agentName || details.openclaw?.source || '-'}
            </span>
          </div>
          <div
            className="mb-1 flex items-center gap-2"
            title={details.hermes?.error || details.hermes?.url}
          >
            <div
              className={`h-2 w-2 rounded-full shadow-[0_0_14px_currentColor] ${statuses.hermes ? 'bg-emerald-400 text-emerald-400' : 'bg-red-400 text-red-400'}`}
            />
            <span className="text-[10px] text-slate-400">Hermes</span>
            <span className="ml-auto max-w-[82px] truncate text-[9px] text-slate-600">
              {details.hermes?.agentName || details.hermes?.source || '-'}
            </span>
          </div>
        </div>
      </nav>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
