'use client'
import { createContext, useContext, useState } from 'react'

interface ContributeRefreshContextValue {
  refreshKey: number
  bumpRefresh: () => void
}

const ContributeRefreshContext = createContext<ContributeRefreshContextValue>({
  refreshKey: 0,
  bumpRefresh: () => {},
})

export function ContributeRefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <ContributeRefreshContext.Provider
      value={{ refreshKey, bumpRefresh: () => setRefreshKey(k => k + 1) }}
    >
      {children}
    </ContributeRefreshContext.Provider>
  )
}

export function useContributeRefresh() {
  return useContext(ContributeRefreshContext)
}
