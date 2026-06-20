'use client'
import Script from 'next/script'

export function ErudaLoader() {
  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/eruda@3.4.0"
      strategy="afterInteractive"
      onLoad={() => {
        ;(window as any).eruda?.init()
      }}
    />
  )
}
