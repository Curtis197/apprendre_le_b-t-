'use client'
import { useState, useMemo } from 'react'
import { Mail, Send, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type ContactType = 'group' | 'teacher'
type Canal = 'whatsapp' | 'tiktok' | string

interface ContactEntry {
  name: string
  type: ContactType
  canal: Canal
  description: string
  url: string
  icon: string
  cta: string
  badgeColor: string
  ctaColor: string
  borderColor: string
  iconBg: string
}

const CONTACTS: ContactEntry[] = [
  {
    name: 'Parlons Bété',
    type: 'group',
    canal: 'whatsapp',
    description: 'Groupe de discussion principal',
    url: 'https://chat.whatsapp.com/',
    icon: '💬',
    cta: 'Rejoindre',
    badgeColor: 'bg-green-50 text-green-700',
    ctaColor: 'bg-green-600 hover:bg-green-700',
    borderColor: 'border-green-200',
    iconBg: 'bg-green-100',
  },
  {
    name: 'Parlons Bété',
    type: 'group',
    canal: 'tiktok',
    description: 'Vidéos courtes sur la langue et la culture',
    url: 'https://www.tiktok.com/',
    icon: '🎵',
    cta: 'Suivre',
    badgeColor: 'bg-slate-100 text-slate-600',
    ctaColor: 'bg-slate-800 hover:bg-slate-900',
    borderColor: 'border-slate-200',
    iconBg: 'bg-slate-100',
  },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tout afficher' },
  { value: 'group', label: 'Groupes' },
  { value: 'teacher', label: 'Enseignants' },
]

const CANAL_OPTIONS = [
  { value: 'all', label: 'Tous les canaux' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'tiktok', label: 'TikTok' },
]

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
}

export default function ContactPage() {
  const [typeFilter, setTypeFilter] = useState('all')
  const [canalFilter, setCanalFilter] = useState('all')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const filtered = useMemo(() => {
    return CONTACTS.filter(c => {
      const matchType = typeFilter === 'all' || c.type === typeFilter
      const matchCanal = canalFilter === 'all' || c.canal === canalFilter
      return matchType && matchCanal
    })
  }, [typeFilter, canalFilter])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })
      if (!res.ok) throw new Error()
      setStatus('sent')
      setName(''); setEmail(''); setSubject(''); setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Contact"
        title="Nous Contacter"
        subtitle="Une question, une suggestion ou envie de rejoindre la communauté ? Retrouvez tous nos canaux de contact."
      />

      {/* Dropdowns */}
      <div className="flex flex-wrap items-center gap-4 mt-8 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-foreground whitespace-nowrap">Type :</label>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="appearance-none bg-background border-2 border-primary rounded-lg px-3 py-1.5 text-sm font-semibold text-primary cursor-pointer outline-none focus:ring-2 focus:ring-primary/30"
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-foreground whitespace-nowrap">Canal :</label>
          <select
            value={canalFilter}
            onChange={e => setCanalFilter(e.target.value)}
            className="appearance-none bg-background border-2 border-border rounded-lg px-3 py-1.5 text-sm font-semibold text-foreground cursor-pointer outline-none focus:ring-2 focus:ring-primary/30"
          >
            {CANAL_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
        {filtered.map(entry => (
          <a
            key={`${entry.type}-${entry.canal}-${entry.name}`}
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`bg-card border-2 ${entry.borderColor} rounded-2xl p-5 flex flex-col items-center text-center gap-2 hover:shadow-md transition-shadow`}
          >
            <div className={`w-12 h-12 ${entry.iconBg} rounded-full flex items-center justify-center text-2xl`}>
              {entry.icon}
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{entry.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${entry.badgeColor}`}>
              {CANAL_LABELS[entry.canal] ?? entry.canal}
            </span>
            <div className={`mt-1 text-white text-xs font-semibold px-4 py-1.5 rounded-full ${entry.ctaColor} flex items-center gap-1 transition-colors`}>
              {entry.cta}
              <ExternalLink className="w-3 h-3" />
            </div>
          </a>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full bg-muted rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">Aucun résultat pour ces filtres.</p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border mb-10" />

      {/* Contact form */}
      <div className="max-w-2xl">
        <h2 className="font-heading text-xl font-bold flex items-center gap-2 mb-5">
          <Mail className="w-5 h-5 text-primary" />
          Contacter l&apos;équipe
        </h2>

        {status === 'sent' ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <p className="text-2xl mb-3">✓</p>
            <p className="font-semibold text-green-800">Message envoyé !</p>
            <p className="text-sm text-green-700 mt-1">Nous vous répondrons dans les meilleurs délais.</p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Envoyer un autre message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Nom *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Courriel *</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" required />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Sujet</label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex : Signaler une erreur, Partenariat…" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Message *</label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Votre message…"
                rows={5}
                required
              />
            </div>
            {status === 'error' && (
              <p className="text-sm text-red-600">Une erreur est survenue. Veuillez réessayer.</p>
            )}
            <Button type="submit" disabled={status === 'sending'} className="w-full gap-2">
              <Send className="w-4 h-4" />
              {status === 'sending' ? 'Envoi…' : 'Envoyer le message'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
