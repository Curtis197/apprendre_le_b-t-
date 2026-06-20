'use client'
// TEMP iOS DIAGNOSTIC — remove with the inline script in layout.tsx once fixed.
// Sets a flag the inline diagnostic script reads to confirm React actually hydrated on the device.
import { useEffect } from 'react'

export function HydrationProbe() {
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', 'yes')
    // @ts-expect-error - global hook for the inline diagnostic script
    if (typeof window !== 'undefined' && window.__iosDiagHydrated) window.__iosDiagHydrated()
  }, [])
  return null
}
