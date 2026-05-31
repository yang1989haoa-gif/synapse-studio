import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentNodeData } from '@/stores/flowStore'
import { useDebugStore } from '@/stores/debugStore'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'cross'
  content: string
  timestamp: string
  meta?: { tool?: string; duration?: number; tokens?: number; from?: string; to?: string }
}

export function AgentChatWindow({
  nodeId,
  data,
  onClose,
  style,
}: {
  nodeId: string
  data: AgentNodeData
  onClose: () => void
  style?: React.CSSProperties
}) {
  const { t } = useTranslation()
  const addDebugEntry = useDebugStore((s) => s.addEntry)
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'interactions'>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(() => ({
    left:
      typeof style?.left === 'number'
        ? style.left
        : typeof style?.left === 'string'
          ? parseInt(style.left, 10) || 100
          : 100,
    top:
      typeof style?.top === 'number'
        ? style.top
        : typeof style?.top === 'string'
          ? parseInt(style.top, 10) || 100
          : 100,
  }))
  const dragRef = useRef<{
    startX: number
    startY: number
    startPosLeft: number
    startPosTop: number
  } | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return
      e.preventDefault()
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosLeft: position.left,
        startPosTop: position.top,
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        setPosition({
          left: dragRef.current.startPosLeft + ev.clientX - dragRef.current.startX,
          top: dragRef.current.startPosTop + ev.clientY - dragRef.current.startY,
        })
      }

      const handleMouseUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [position],
  )

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, userMsg])
    const userInput = input
    setInput('')
    setIsLoading(true)

    try {
      let responseContent = ''
      let tokens: number | undefined
      let duration: number | undefined

      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway: data.gateway,
          message: userInput,
          agentId: data.agentId,
          model: data.model,
          config: {
            endpoint: data.endpoint,
            token: data.token,
            password: data.password,
            apiKey: data.apiKey,
          },
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || `API error: ${res.status}`)
      responseContent =
        json.response || json.message || json.content || JSON.stringify(json.raw ?? json)
      tokens = json.usage?.total_tokens

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        meta: { tokens, duration },
      }
      setMessages((prev) => [...prev, assistantMsg])
      addDebugEntry({
        level: 'info',
        nodeId,
        nodeName: data.label,
        gateway: data.gateway,
        message: `${data.label || nodeId} 已发送消息`,
        details: responseContent,
      })
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `Error: ${err.message ?? 'Failed to reach backend'}`,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
      addDebugEntry({
        level: 'error',
        nodeId,
        nodeName: data.label,
        gateway: data.gateway,
        message: `${data.label || nodeId} 发送失败`,
        details: err.message ?? 'Failed to reach backend',
        suggestion: ['检查该节点的地址、Token 和 Session Key。', '在智能体页面先测试连接。'],
      })
    } finally {
      setIsLoading(false)
    }
  }

  const gatewayColor = data.gateway === 'openclaw' ? '#5b9cf5' : '#f55b5b'
  const gatewayBg =
    data.gateway === 'openclaw' ? 'from-blue-950/95 to-slate-950' : 'from-red-950/95 to-slate-950'
  const shortName = data.label?.replace(/^[^\s]+\s/, '') || nodeId

  return (
    <div
      className="absolute z-50 flex flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 shadow-2xl shadow-black/45"
      style={{ width: 380, height: 420, left: position.left, top: position.top }}
    >
      <div
        className={`flex cursor-move select-none items-center justify-between border-b border-slate-800 bg-gradient-to-r ${gatewayBg} px-3 py-2`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="grid h-6 w-6 place-items-center rounded-md border text-[10px] font-bold"
            style={{
              background: `${gatewayColor}20`,
              borderColor: gatewayColor,
              color: gatewayColor,
            }}
          >
            AG
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold" style={{ color: gatewayColor }}>
              {shortName}
            </div>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="truncate text-[9px] text-slate-500">
                {data.gateway} / {data.model}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="rounded px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          data-no-drag
          onClick={onClose}
        >
          x
        </button>
      </div>

      <div className="flex border-b border-slate-800 bg-slate-900/60">
        {(['chat', 'history', 'interactions'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-3 py-1.5 text-[11px] ${activeTab === tab ? 'font-semibold' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            style={
              activeTab === tab ? { color: gatewayColor, borderColor: gatewayColor } : undefined
            }
          >
            {
              {
                chat: t('agent.chat'),
                history: t('agent.history'),
                interactions: t('agent.interactions'),
              }[tab]
            }
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 ${msg.role === 'user' ? 'rounded-br-sm border border-accent/35 bg-accent/18' : msg.role === 'cross' ? 'rounded-sm border-l-2 border-accent bg-slate-800/50' : 'rounded-bl-sm border border-slate-700/60 bg-slate-800/58'}`}
            >
              {msg.role === 'cross' && msg.meta && (
                <div className="mb-1 flex items-center gap-1.5 text-[9px]">
                  <span className="text-cyan-300">{msg.meta.from}</span>
                  <span className="text-slate-600">to</span>
                  <span className="text-red-300">{msg.meta.to}</span>
                </div>
              )}
              <div className="text-xs leading-relaxed text-slate-200">{msg.content}</div>
              {msg.meta?.duration && (
                <div className="mt-1.5 flex gap-2 border-t border-slate-700/40 pt-1.5">
                  <span className="text-[9px] text-slate-500">{msg.meta.tokens} tok</span>
                  <span className="text-[9px] text-slate-500">{msg.meta.duration}s</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse" />
            {t('agent.thinking')}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-800 bg-slate-900/60 p-2.5">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-slate-500"
            placeholder={t('agent.messagePlaceholder', { name: shortName })}
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: gatewayColor }}
          >
            {isLoading ? '...' : t('agent.send')}
          </button>
        </div>
      </div>
    </div>
  )
}
