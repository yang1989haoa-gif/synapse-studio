import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import { Layout } from '@/components/Layout'
import FlowListPage from '@/views/FlowListPage'
import FlowEditorPage from '@/views/FlowEditorPage'
import LoginPage from '@/views/LoginPage'
import AgentsPage from '@/views/AgentsPage'
import ExecutionsPage from '@/views/ExecutionsPage'

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('synapse-auth') === 'true')

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  return (
    <BrowserRouter>
      <ReactFlowProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<FlowListPage />} />
            <Route path="/flow/:id" element={<FlowEditorPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/executions" element={<ExecutionsPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      </ReactFlowProvider>
    </BrowserRouter>
  )
}
