'use client'
import { useEffect } from 'react'

export function ErudaLoader() {
  useEffect(() => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/eruda@3.4.0'
    s.onload = () => { (window as any).eruda?.init() }
    document.head.appendChild(s)
  }, [])
  return null
}
