// web/app/contact/page.tsx
'use client'
import { useState } from 'react'
import { Mail, MessageCircle, ExternalLink, Send, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// External community groups
const GROUPS = [
  {
    name: 'Groupe WhatsApp — Parlons Bété',
    platform: 'WhatsApp',
    description: 'Groupe de discussion principal pour la communauté Parlons Bété.',
    url: 'https://chat.whatsapp.com/', // Replace with actual link
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: '💬',
  },
  {
    name: 'TikTok — Parlons Bété',
    platform: 'TikTok',
    description: 'Vidéos courtes sur la langue et la culture bété.',
    url: 'https://www.tiktok.com/', // Replace with actual link
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: '🎵',
  },
]

// Individual instructors / advisors
const INSTRUCTORS: { name: string; role: string; contact: string }[] = [
  // Add real entries here
  // { name: 'Nom Prénom', role: 'Professeur de langue bété', contact: 'email@example.com' },
]

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

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

      <div className="grid lg:grid-cols-2 gap-10 mt-8">

        {/* Contact form */}
        <div>
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

        {/* Groups and instructors */}
        <div className="space-y-8">

          {/* External groups */}
          <div>
            <h2 className="font-heading text-xl font-bold flex items-center gap-2 mb-5">
              <MessageCircle className="w-5 h-5 text-secondary" />
              Groupes de Discussion
            </h2>
            <div className="space-y-3">
              {GROUPS.map(group => (
                <a
                  key={group.name}
                  href={group.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-shadow hover:shadow-md ${group.color}`}
                >
                  <span className="text-2xl shrink-0">{group.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{group.name}</p>
                    <p className="text-xs mt-0.5 opacity-75">{group.description}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 shrink-0 opacity-50" />
                </a>
              ))}
              {GROUPS.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Les liens de groupes seront ajoutés prochainement.
                </p>
              )}
            </div>
          </div>

          {/* Individual instructors */}
          <div>
            <h2 className="font-heading text-xl font-bold flex items-center gap-2 mb-5">
              <Users className="w-5 h-5 text-primary" />
              Enseignants &amp; Conseillers
            </h2>
            <div className="space-y-3">
              {INSTRUCTORS.length > 0 ? INSTRUCTORS.map((person: { name: string; role: string; contact: string }) => (
                <div key={person.name} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-heading font-bold text-primary shrink-0">
                      {person.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.role}</p>
                    </div>
                    <a
                      href={`mailto:${person.contact}`}
                      className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" />
                      Contacter
                    </a>
                  </div>
                </div>
              )) : (
                <div className="bg-muted rounded-xl p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Vous dispensez des cours de bété ou souhaitez être listé ici ?
                  </p>
                  <p className="text-sm text-primary font-semibold mt-2">
                    Contactez-nous via le formulaire ci-contre.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
