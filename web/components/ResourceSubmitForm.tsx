'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const TYPES = [
  { value: 'song',    label: 'Chanson' },
  { value: 'story',   label: 'Conte' },
  { value: 'poem',    label: 'Poème' },
  { value: 'proverb', label: 'Proverbe' },
  { value: 'speech',  label: 'Discours' },
  { value: 'riddle',  label: 'Devinette' },
  { value: 'other',   label: 'Autre' },
]

export function ResourceSubmitForm() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [title, setTitle] = useState('')
  const [type, setType] = useState('proverb')
  const [contentBete, setContentBete] = useState('')
  const [contentFrench, setContentFrench] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [region, setRegion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    if (!title.trim() || !contentBete.trim()) return
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      if (!user) { setError('Connectez-vous pour contribuer.'); return }
      const { error: err } = await supabaseRef.current.from('community_texts').insert({
        title: title.trim(),
        type,
        content_bete: contentBete.trim(),
        content_french: contentFrench.trim() || null,
        author_name: authorName.trim() || user.user_metadata?.full_name || user.email?.split('@')[0] || null,
        region: region.trim() || null,
        created_by: user.id,
      })
      if (err) throw err
      setSubmitted(true)
    } catch {
      setError('Erreur lors de l\'envoi. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return (
    <div className="text-center space-y-3 py-8">
      <p className="text-2xl">✓</p>
      <p className="font-semibold">Ressource soumise avec succès !</p>
      <p className="text-sm text-muted-foreground">Elle sera visible après validation par la communauté.</p>
      <div className="flex gap-3 justify-center pt-2">
        <Button variant="outline" onClick={() => { setSubmitted(false); setTitle(''); setContentBete(''); setContentFrench('') }}>
          Soumettre une autre
        </Button>
        <Button onClick={() => router.push('/resources')}>Voir les ressources</Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Input placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
        >
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <Textarea
        placeholder="Texte en bété *"
        value={contentBete}
        onChange={e => setContentBete(e.target.value)}
        rows={6}
        className="font-mono"
      />
      <Textarea
        placeholder="Traduction en français (optionnel)"
        value={contentFrench}
        onChange={e => setContentFrench(e.target.value)}
        rows={4}
      />
      <div className="grid md:grid-cols-2 gap-4">
        <Input placeholder="Auteur / source (optionnel)" value={authorName} onChange={e => setAuthorName(e.target.value)} />
        <Input placeholder="Région (ex: Gagnoa, Daloa…)" value={region} onChange={e => setRegion(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleSubmit}
        disabled={loading || !title.trim() || !contentBete.trim()}
        className="w-full"
      >
        {loading ? 'Envoi…' : 'Soumettre la ressource'}
      </Button>
    </div>
  )
}
