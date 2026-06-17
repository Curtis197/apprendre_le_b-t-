'use client'
import { Suspense, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase-browser'

type Mode = 'signin' | 'signup'

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto py-12 px-4" />}>
      <AuthForm />
    </Suspense>
  )
}

function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const supabase = useMemo(() => createClient(), [])

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push(next)
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() || undefined },
            emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        })
        if (error) throw error
        // Send welcome email via edge function
        fetch('/api/send-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: name.trim() }),
        }).catch(() => {})
        setInfo('Vérifiez votre courriel pour confirmer votre compte.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d\'authentification')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <main className="max-w-md mx-auto py-12 px-4">
      <div className="text-center mb-8">
        <h1 className="font-heading text-3xl font-bold text-primary">Parlons Bhété</h1>
        <p className="text-sm text-muted-foreground mt-1">Plateforme linguistique bhété</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {mode === 'signin' ? 'Se connecter' : 'Créer un compte'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-1">
                <label htmlFor="name" className="text-sm font-medium">Nom d'affichage</label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Ex : Kouamé Bah"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium">Courriel</label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              {mode === 'signup' && (
                <p className="text-xs text-muted-foreground">Minimum 6 caractères</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
            </Button>
          </form>

          <Separator />

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={loading}
          >
            Continuer avec Google
          </Button>

          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setInfo(null)
              setName('')
            }}
          >
            {mode === 'signin'
              ? 'Pas encore de compte ? Créer un compte'
              : 'Déjà un compte ? Se connecter'}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}
        </CardContent>
      </Card>
    </main>
  )
}
