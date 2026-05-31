import { create } from 'zustand'

export interface DebugEntry {
  id: string
  level: 'error' | 'warn' | 'info'
  timestamp: string
  nodeId?: string
  nodeName?: string
  gateway?: string
  message: string
  details?: string
  suggestion?: string[]
}

interface DebugState {
  entries: DebugEntry[]
  activeTab: 'errors' | 'log' | 'trace' | 'metrics'
  filter: 'all' | 'error' | 'warn' | 'info'
  addEntry: (entry: Omit<DebugEntry, 'id' | 'timestamp'>) => void
  clearEntries: () => void
  setActiveTab: (tab: DebugState['activeTab']) => void
  setFilter: (filter: DebugState['filter']) => void
}

export const useDebugStore = create<DebugState>((set, get) => ({
  entries: [],
  activeTab: 'errors',
  filter: 'all',
  addEntry: (entry) =>
    set({
      entries: [
        ...get().entries,
        { ...entry, id: String(Date.now()), timestamp: new Date().toLocaleTimeString() },
      ],
    }),
  clearEntries: () => set({ entries: [] }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setFilter: (filter) => set({ filter }),
}))
