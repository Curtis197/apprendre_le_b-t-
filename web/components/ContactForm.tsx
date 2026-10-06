// web/components/ContactForm.tsx
'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'
import { CONTACT_LIMITS } from '@/lib/contact'

export function ContactForm() {
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot, must stay empty
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error' | 'rate-limited'>('idle')
  const confirmRef = useRef<HTMLDivElement>(null)

  // Prefill name/email for signed-in visitors (never overwrites what they already typed).
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (!user) return
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const fullName = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : ''
      setName(prev => prev || fullName)
      setEmail(prev => prev || user.email || '')
    }).catch(() => {})
  }, [supabase])

  useEffect(() => {
    if (status === 'sent') confirmRef.current?.focus()
  }, [status])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message, website }),
      })
      if (res.status === 429) { setStatus('rate-limited'); return }
      if (!res.ok) throw new Error()
      setStatus('sent')
      setSubject(''); setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-heading text-xl font-bold flex items-center gap-2 mb-2">
        <Mail className="w-5 h-5 text-primary" />
        Contacter l&apos;équipe
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Des suggestions, des questions ? Aidez nous à améliorer le projet.
      </p>
      {status === 'sent' ? (
        <div ref={confirmRef} tabIndex={-1} role="status" className="bg-green-50 border border-green-200 rounded-xl p-8 text-center outline-none">
          <p className="text-2xl mb-3">✓</p>
          <p className="font-semibold text-green-800">Message envoyé !</p>
          <p className="text-sm text-green-700 mt-1">Nous vous répondrons dans les meilleurs délais.</p>
          <button onClick={() => setStatus('idle')} className="mt-4 text-sm text-primary hover:underline">
            Envoyer un autre message
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="relative space-y-4 bg-card border border-border rounded-xl p-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="contact-name" className="text-sm font-medium">Nom *</label>
              <Input id="contact-name" name="name" autoComplete="name" maxLength={CONTACT_LIMITS.name} value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom" required />
            </div>
            <div className="space-y-1">
              <label htmlFor="contact-email" className="text-sm font-medium">Courriel *</label>
              <Input id="contact-email" name="email" autoComplete="email" maxLength={CONTACT_LIMITS.email} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" required />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="contact-subject" className="text-sm font-medium">Sujet</label>
            <Input id="contact-subject" name="subject" maxLength={CONTACT_LIMITS.subject} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex : Signaler une erreur, Partenariat…" />
          </div>
          <div className="space-y-1">
            <label htmlFor="contact-message" className="text-sm font-medium">Message *</label>
            <Textarea id="contact-message" name="message" maxLength={CONTACT_LIMITS.message} value={message} onChange={e => setMessage(e.target.value)} placeholder="Votre message…" rows={5} required />
          </div>
          {/* Honeypot: hidden from people and assistive tech, bots fill it in */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="contact-website">Ne pas remplir</label>
            <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
          {status === 'error' && <p role="alert" className="text-sm text-red-600">Une erreur est survenue. Veuillez réessayer.</p>}
          {status === 'rate-limited' && <p role="alert" className="text-sm text-red-600">Trop de messages envoyés aujourd&apos;hui. Veuillez réessayer demain.</p>}
          <Button type="submit" disabled={status === 'sending'} className="w-full gap-2">
            <Send className="w-4 h-4" />
            {status === 'sending' ? 'Envoi…' : 'Envoyer le message'}
          </Button>
        </form>
      )}
    </div>
  )
}
