'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { type DialectKey, DEFAULT_DIALECT, DIALECT_KEYS } from '@/lib/dialect'

interface DialectContextValue {
  dialect: DialectKey
  setDialect: (d: DialectKey) => void
}

const DialectContext = createContext<DialectContextValue>({
  dialect: DEFAULT_DIALECT,
  setDialect: () => {},
})

export function DialectProvider({ children }: { children: React.ReactNode }) {
  const [dialect, setDialectState] = useState<DialectKey>(DEFAULT_DIALECT)

  useEffect(() => {
    const stored = localStorage.getItem('bete-dialect')
    if (stored && DIALECT_KEYS.includes(stored as DialectKey)) {
      setDialectState(stored as DialectKey)
    }
  }, [])

  function setDialect(d: DialectKey) {
    setDialectState(d)
    localStorage.setItem('bete-dialect', d)
  }

  return (
    <DialectContext.Provider value={{ dialect, setDialect }}>
      {children}
    </DialectContext.Provider>
  )
}

export function useDialect() {
  return useContext(DialectContext)
}
