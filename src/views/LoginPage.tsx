import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const DEFAULT_USERNAME = import.meta.env.VITE_AUTH_USERNAME || 'admin'
const DEFAULT_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD || 'admin'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (username === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
      localStorage.setItem('synapse-auth', 'true')
      onLogin()
    } else {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <form
        onSubmit={handleSubmit}
        className="w-[320px] bg-gray-900 rounded-xl border border-gray-800 p-6"
      >
        <div className="text-center mb-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-accent mb-2">Synapse</div>
          <h1 className="text-lg font-bold text-accent">{t('app.title')}</h1>
          <p className="text-[10px] text-gray-500">{t('app.subtitle')}</p>
        </div>
        <div className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 outline-none focus:border-accent"
          />
          {error && <div className="text-red-400 text-[10px]">{error}</div>}
          <button
            type="submit"
            className="w-full bg-accent text-white rounded-lg py-2 text-xs font-medium hover:bg-accent/80"
          >
            Login
          </button>
        </div>
      </form>
    </div>
  )
}
