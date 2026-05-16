# Profile Page, Contact Dynamics & Auth Gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user profile page where teachers/groups self-publish to the contact directory, make the contact grid dynamic, add Instagram/Facebook canals, and gate forum posts and votes behind authentication.

**Architecture:** Profile data lives in Supabase `profiles` table (extended with new columns). The contact page queries profiles dynamically instead of using a hardcoded array. Auth gates are enforced in the UI (client-side session check) and at the DB level (RPC check).

**Tech Stack:** Next.js 16 App Router, Supabase SSR (`@supabase/ssr`), TypeScript, Tailwind CSS, shadcn/ui

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260516000003_profile_extensions.sql` | Create |
| `web/app/profile/page.tsx` | Create |
| `web/app/contact/page.tsx` | Modify — dynamic query + Instagram/Facebook canals |
| `web/components/AuthNav.tsx` | Modify — add "Mon profil" link |
| `web/app/forum/page.tsx` | Modify — auth gate on "Nouveau sujet" button |
| `web/app/forum/[id]/page.tsx` | Modify — pass `isAuthed` to reply form |
| `web/components/ForumReplyForm.tsx` | Modify — accept `isAuthed` prop, show banner if false |
| `web/components/VoteButtons.tsx` | Modify — disable + link to /auth for anon users |

---

## Task 1: DB Migration — Extend Profiles + Auth-Gate RPC

**Files:**
- Create: `supabase/migrations/20260516000003_profile_extensions.sql`

- [ ] **Create the migration file**

```sql
-- supabase/migrations/20260516000003_profile_extensions.sql

-- Extend profiles with public directory fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS type         TEXT NOT NULL DEFAULT 'member'
                                        CHECK (type IN ('member', 'group', 'teacher')),
  ADD COLUMN IF NOT EXISTS bio          TEXT,
  ADD COLUMN IF NOT EXISTS contact      TEXT,
  ADD COLUMN IF NOT EXISTS canal        TEXT
                                        CHECK (canal IN ('whatsapp', 'tiktok', 'instagram', 'facebook')),
  ADD COLUMN IF NOT EXISTS whatsapp_url  TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url    TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url  TEXT,
  ADD COLUMN IF NOT EXISTS is_public    BOOLEAN NOT NULL DEFAULT false;

-- Gate increment_upvotes: anonymous callers get an auth error
CREATE OR REPLACE FUNCTION increment_upvotes(
  table_name text,
  row_id     uuid,
  delta      int default 1
)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to vote';
  END IF;
  CASE table_name
    WHEN 'grammar_rules' THEN
      UPDATE grammar_rules
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'expressions' THEN
      UPDATE expressions
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'lexicon' THEN
      UPDATE lexicon
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'forum_threads' THEN
      UPDATE forum_threads
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'forum_posts' THEN
      UPDATE forum_posts
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'community_texts' THEN
      UPDATE community_texts
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    ELSE
      RAISE EXCEPTION 'Unknown table: %', table_name;
  END CASE;
  RETURN new_count;
END;
$$;
```

- [ ] **Apply the migration**

```bash
cd "C:/Users/DELL LATITUDE 7480/traduction bété"
echo Y | supabase db push
```

Expected: `Applying migration 20260516000003_profile_extensions.sql... done`

- [ ] **Commit**

```bash
git add supabase/migrations/20260516000003_profile_extensions.sql
git commit -m "feat: extend profiles table with directory fields, auth-gate increment_upvotes"
```

---

## Task 2: Profile Page `/profile`

**Files:**
- Create: `web/app/profile/page.tsx`

- [ ] **Create the profile page**

```tsx
// web/app/profile/page.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, User } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type ProfileType = 'member' | 'group' | 'teacher'
type Canal = 'whatsapp' | 'tiktok' | 'instagram' | 'facebook'

interface ProfileRow {
  name: string
  avatar_url: string | null
  bio: string | null
  type: ProfileType
  is_public: boolean
  contact: string | null
  canal: Canal | null
  whatsapp_url: string | null
  tiktok_url: string | null
  instagram_url: string | null
  facebook_url: string | null
}

const TYPE_LABELS: Record<ProfileType, string> = {
  member: 'Membre',
  group: 'Groupe',
  teacher: 'Enseignant',
}

const CANAL_LABELS: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bio, setBio] = useState('')
  const [type, setType] = useState<ProfileType>('member')
  const [isPublic, setIsPublic] = useState(false)
  const [contact, setContact] = useState('')
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [whatsappUrl, setWhatsappUrl] = useState('')
  const [tiktokUrl, setTiktokUrl] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [facebookUrl, setFacebookUrl] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/auth?next=/profile')
        return
      }
      setUserId(data.user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profile) {
        setName(profile.name ?? '')
        setAvatarUrl(profile.avatar_url ?? '')
        setBio(profile.bio ?? '')
        setType((profile.type as ProfileType) ?? 'member')
        setIsPublic(profile.is_public ?? false)
        setContact(profile.contact ?? '')
        setCanal((profile.canal as Canal) ?? 'whatsapp')
        setWhatsappUrl(profile.whatsapp_url ?? '')
        setTiktokUrl(profile.tiktok_url ?? '')
        setInstagramUrl(profile.instagram_url ?? '')
        setFacebookUrl(profile.facebook_url ?? '')
      }
      setLoading(false)
    })
  }, [supabase, router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    setError(null)

    const showDirectory = isPublic && type !== 'member'

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        name,
        avatar_url: avatarUrl || null,
        bio: bio || null,
        type,
        is_public: showDirectory,
        contact: showDirectory ? contact || null : null,
        canal: showDirectory ? canal : null,
        whatsapp_url: showDirectory ? whatsappUrl || null : null,
        tiktok_url: showDirectory ? tiktokUrl || null : null,
        instagram_url: showDirectory ? instagramUrl || null : null,
        facebook_url: showDirectory ? facebookUrl || null : null,
        updated_at: new Date().toISOString(),
      })

    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-muted-foreground">Chargement…</div>
  }

  const showDirectoryFields = type !== 'member'

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Profil"
        title="Mon Profil"
        subtitle="Gérez vos informations et votre visibilité sur la page Contact."
      />

      <form onSubmit={handleSave} className="space-y-8 mt-8">

        {/* Basic info */}
        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-heading font-bold text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            Informations de base
          </h2>
          <div className="space-y-1">
            <label className="text-sm font-medium">Nom d&apos;affichage</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Kouamé Bah" required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">URL de l&apos;avatar</label>
            <Input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…" type="url" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Bio</label>
            <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Quelques mots sur vous…" rows={3} />
          </div>
        </section>

        {/* Visibility */}
        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-heading font-bold text-base">Visibilité</h2>
          <div className="space-y-1">
            <label className="text-sm font-medium">Type de profil</label>
            <select
              value={type}
              onChange={e => {
                setType(e.target.value as ProfileType)
                if (e.target.value === 'member') setIsPublic(false)
              }}
              className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              {(Object.entries(TYPE_LABELS) as [ProfileType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {showDirectoryFields && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-primary"
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
              />
              <span className="text-sm font-medium">Apparaître sur la page Contact</span>
            </label>
          )}
        </section>

        {/* Contact & social — only when opted in */}
        {showDirectoryFields && isPublic && (
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-bold text-base">Contact &amp; Réseaux</h2>

            <div className="space-y-1">
              <label className="text-sm font-medium">Canal principal</label>
              <select
                value={canal}
                onChange={e => setCanal(e.target.value as Canal)}
                className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                {(Object.entries(CANAL_LABELS) as [Canal, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Contact affiché <span className="text-muted-foreground font-normal">(téléphone, email ou lien)</span></label>
              <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="+225 07 00 00 00 00" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">WhatsApp URL</label>
                <Input value={whatsappUrl} onChange={e => setWhatsappUrl(e.target.value)} placeholder="https://chat.whatsapp.com/…" type="url" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">TikTok URL</label>
                <Input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} placeholder="https://tiktok.com/@…" type="url" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Instagram URL</label>
                <Input value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/…" type="url" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Facebook URL</label>
                <Input value={facebookUrl} onChange={e => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/…" type="url" />
              </div>
            </div>
          </section>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={saving} className="w-full gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add web/app/profile/page.tsx
git commit -m "feat: add profile page with directory opt-in for teachers and groups"
```

---

## Task 3: Contact Page — Dynamic Grid + Instagram/Facebook

**Files:**
- Modify: `web/app/contact/page.tsx`

- [ ] **Rewrite contact page with dynamic Supabase query**

Replace the entire file:

```tsx
// web/app/contact/page.tsx
'use client'
import { useState, useMemo, useEffect } from 'react'
import { Mail, Send, ExternalLink, Phone } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'

type Canal = 'whatsapp' | 'tiktok' | 'instagram' | 'facebook'
type ContactType = 'group' | 'teacher'

interface DirectoryEntry {
  id: string
  name: string
  type: ContactType
  canal: Canal
  bio: string | null
  contact: string | null
  avatar_url: string | null
  whatsapp_url: string | null
  tiktok_url: string | null
  instagram_url: string | null
  facebook_url: string | null
}

const CANAL_META: Record<Canal, { label: string; icon: string; iconBg: string; badgeColor: string; ctaColor: string; borderColor: string }> = {
  whatsapp:  { label: 'WhatsApp',  icon: '💬', iconBg: 'bg-green-100',   badgeColor: 'bg-green-50 text-green-700',    ctaColor: 'bg-green-600 hover:bg-green-700',   borderColor: 'border-green-200' },
  tiktok:    { label: 'TikTok',    icon: '🎵', iconBg: 'bg-slate-100',   badgeColor: 'bg-slate-100 text-slate-600',   ctaColor: 'bg-slate-800 hover:bg-slate-900',   borderColor: 'border-slate-200' },
  instagram: { label: 'Instagram', icon: '📸', iconBg: 'bg-pink-100',    badgeColor: 'bg-pink-50 text-pink-700',      ctaColor: 'bg-pink-600 hover:bg-pink-700',     borderColor: 'border-pink-200'  },
  facebook:  { label: 'Facebook',  icon: '📘', iconBg: 'bg-blue-100',    badgeColor: 'bg-blue-50 text-blue-700',      ctaColor: 'bg-blue-600 hover:bg-blue-700',     borderColor: 'border-blue-200'  },
}

function canalUrl(entry: DirectoryEntry): string {
  if (entry.canal === 'whatsapp')  return entry.whatsapp_url  ?? '#'
  if (entry.canal === 'tiktok')    return entry.tiktok_url    ?? '#'
  if (entry.canal === 'instagram') return entry.instagram_url ?? '#'
  return entry.facebook_url ?? '#'
}

const TYPE_OPTIONS = [
  { value: 'all',     label: 'Tout afficher' },
  { value: 'group',   label: 'Groupes' },
  { value: 'teacher', label: 'Enseignants' },
]

const CANAL_OPTIONS = [
  { value: 'all',       label: 'Tous les canaux' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook' },
]

export default function ContactPage() {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loadingDir, setLoadingDir] = useState(true)

  const [typeFilter, setTypeFilter] = useState('all')
  const [canalFilter, setCanalFilter] = useState('all')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, name, type, canal, bio, contact, avatar_url, whatsapp_url, tiktok_url, instagram_url, facebook_url')
      .eq('is_public', true)
      .in('type', ['group', 'teacher'])
      .then(({ data }) => {
        setEntries((data as DirectoryEntry[]) ?? [])
        setLoadingDir(false)
      })
  }, [supabase])

  const filtered = useMemo(() => entries.filter(e => {
    const matchType  = typeFilter  === 'all' || e.type  === typeFilter
    const matchCanal = canalFilter === 'all' || e.canal === canalFilter
    return matchType && matchCanal
  }), [entries, typeFilter, canalFilter])

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
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-foreground whitespace-nowrap">Canal :</label>
          <select
            value={canalFilter}
            onChange={e => setCanalFilter(e.target.value)}
            className="appearance-none bg-background border-2 border-border rounded-lg px-3 py-1.5 text-sm font-semibold text-foreground cursor-pointer outline-none focus:ring-2 focus:ring-primary/30"
          >
            {CANAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {loadingDir ? '…' : `${filtered.length} résultat${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
        {loadingDir ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted animate-pulse rounded-2xl h-44" />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full bg-muted rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">Aucun résultat pour ces filtres.</p>
          </div>
        ) : (
          filtered.map(entry => {
            const meta = CANAL_META[entry.canal]
            const url  = canalUrl(entry)
            return (
              <div key={entry.id} className={`bg-card border-2 ${meta.borderColor} rounded-2xl p-5 flex flex-col items-center text-center gap-2`}>
                <div className={`w-12 h-12 ${meta.iconBg} rounded-full flex items-center justify-center text-2xl`}>
                  {entry.avatar_url
                    ? <img src={entry.avatar_url} alt={entry.name} className="w-12 h-12 rounded-full object-cover" />
                    : meta.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{entry.name}</p>
                  {entry.bio && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.bio}</p>}
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.badgeColor}`}>
                  {meta.label}
                </span>
                {entry.contact && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />{entry.contact}
                  </p>
                )}
                {url !== '#' && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-1 text-white text-xs font-semibold px-4 py-1.5 rounded-full ${meta.ctaColor} flex items-center gap-1 transition-colors`}
                  >
                    {entry.type === 'group' ? 'Rejoindre' : 'Contacter'}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )
          })
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
            <button onClick={() => setStatus('idle')} className="mt-4 text-sm text-primary hover:underline">
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
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Votre message…" rows={5} required />
            </div>
            {status === 'error' && <p className="text-sm text-red-600">Une erreur est survenue. Veuillez réessayer.</p>}
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
```

- [ ] **Commit**

```bash
git add web/app/contact/page.tsx
git commit -m "feat: dynamic contact grid from profiles, add Instagram/Facebook canals"
```

---

## Task 4: AuthNav — Add Profile Link

**Files:**
- Modify: `web/components/AuthNav.tsx`

- [ ] **Add "Mon profil" link when user is logged in**

In `web/components/AuthNav.tsx`, replace the logged-in return block (lines 51–62):

```tsx
  return (
    <div className="ml-auto flex items-center gap-3">
      <Link
        href="/profile"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Mon profil
      </Link>
      <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={email}>
        {email}
      </span>
      <button
        onClick={handleSignOut}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Se déconnecter
      </button>
    </div>
  )
```

- [ ] **Commit**

```bash
git add web/components/AuthNav.tsx
git commit -m "feat: add Mon profil link in AuthNav for logged-in users"
```

---

## Task 5: Forum Auth Gates

**Files:**
- Modify: `web/app/forum/page.tsx`
- Modify: `web/app/forum/[id]/page.tsx`
- Modify: `web/components/ForumReplyForm.tsx`

- [ ] **Gate "Nouveau sujet" on forum list page**

In `web/app/forum/page.tsx`, read the session server-side and replace the button with a login link for anon users.

At the top of the file, the supabase client is already created. Add a session check after line 35 (`const threads = await getThreads(...)`):

```tsx
  const { data: { user } } = await supabase.auth.getUser()
  const isAuthed = !!user
```

Then replace the "Nouveau sujet" `<Link>` (lines 68–75) with:

```tsx
        {isAuthed ? (
          <Link
            href="/forum/new"
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 h-9 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            Nouveau sujet
          </Link>
        ) : (
          <Link
            href="/auth?next=/forum/new"
            className="inline-flex items-center gap-2 border border-primary text-primary text-sm font-semibold px-4 h-9 rounded-lg hover:bg-primary/10 transition-colors shrink-0"
          >
            Connectez-vous pour poster
          </Link>
        )}
```

Also replace the empty-state link (lines 81–89) so it respects auth:

```tsx
          <Link
            href={isAuthed ? '/forum/new' : '/auth?next=/forum/new'}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-9 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            {isAuthed ? 'Créer un sujet' : 'Se connecter pour créer un sujet'}
          </Link>
```

- [ ] **Gate reply form on thread detail page**

In `web/app/forum/[id]/page.tsx`, add session check after `const [t, replies] = await Promise.all(...)`:

```tsx
  const { data: { user } } = await supabase.auth.getUser()
  const isAuthed = !!user
```

Then replace `<ForumReplyForm threadId={id} />` with:

```tsx
      <ForumReplyForm threadId={id} isAuthed={isAuthed} />
```

- [ ] **Update ForumReplyForm to accept isAuthed prop**

In `web/components/ForumReplyForm.tsx`, add the prop and render a banner when not authenticated.

Add the prop to the component signature. First read the current file to find the exact signature, then add `isAuthed` prop:

```tsx
// Add to props:
interface ForumReplyFormProps {
  threadId: string
  isAuthed: boolean
}

export function ForumReplyForm({ threadId, isAuthed }: ForumReplyFormProps) {
```

Then at the very top of the return statement, before the form, add:

```tsx
  if (!isAuthed) {
    return (
      <div className="bg-muted rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          Connectez-vous pour participer à la discussion.
        </p>
        <a
          href={`/auth?next=/forum/${threadId}`}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-9 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Se connecter
        </a>
      </div>
    )
  }
```

- [ ] **Commit**

```bash
git add web/app/forum/page.tsx web/app/forum/[id]/page.tsx web/components/ForumReplyForm.tsx
git commit -m "feat: gate forum posting and replies behind authentication"
```

---

## Task 6: VoteButtons Auth Gate

**Files:**
- Modify: `web/components/VoteButtons.tsx`

- [ ] **Check session on mount and disable buttons for anon users**

Replace the full content of `web/components/VoteButtons.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'

type VoteableTable = 'lexicon' | 'grammar_rules' | 'expressions'
  | 'forum_threads' | 'forum_posts' | 'community_texts'

interface VoteButtonsProps {
  table: VoteableTable
  id: string
  upvotes: number
}

export function VoteButtons({ table, id, upvotes: initialUpvotes }: VoteButtonsProps) {
  const [upvotes, setUpvotes] = useState(initialUpvotes)
  const [voted, setVoted] = useState<'up' | 'down' | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => {
      setIsAuthed(!!data.user)
    })
  }, [])

  async function vote(direction: 'up' | 'down') {
    if (voted === direction || !isAuthed) return
    const delta = direction === 'up'
      ? (voted === 'down' ? 2 : 1)
      : (voted === 'up' ? -2 : -1)

    setUpvotes(v => Math.max(0, v + delta))
    setVoted(direction)

    const { data, error } = await supabaseRef.current
      .rpc('increment_upvotes', { table_name: table, row_id: id, delta })

    if (error) {
      setUpvotes(initialUpvotes)
      setVoted(null)
    } else if (typeof data === 'number') {
      setUpvotes(data)
    }
  }

  if (isAuthed === null) {
    return <div className="h-9 w-20" />
  }

  if (!isAuthed) {
    return (
      <Link
        href="/auth"
        className="text-xs text-muted-foreground hover:text-primary transition-colors"
        title="Connectez-vous pour voter"
      >
        ▲ {upvotes}
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={voted === 'up' ? 'default' : 'outline'}
        size="sm"
        aria-label="Voter pour"
        onClick={() => vote('up')}
      >
        ▲ {upvotes}
      </Button>
      <Button
        variant={voted === 'down' ? 'default' : 'outline'}
        size="sm"
        aria-label="Voter contre"
        onClick={() => vote('down')}
      >
        ▼
      </Button>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add web/components/VoteButtons.tsx
git commit -m "feat: disable vote buttons for unauthenticated users"
```

---

## Task 7: Add Profile to MobileSidebar + Push

**Files:**
- Modify: `web/components/MobileSidebar.tsx`

- [ ] **Add profile link to mobile nav (shown only when logged in)**

The MobileSidebar currently has a static `links` array. The profile link should be conditional on auth. Since MobileSidebar is a client component, read the session with `useEffect`.

Add this import at the top:
```tsx
import { useEffect, useState } from 'react' // already imported
import { createClient } from '@/lib/supabase-browser'
```

Inside the `MobileSidebar` function, add after the existing state:
```tsx
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user))
  }, [])
```

Then in the nav links list, after the last static link, add conditionally:
```tsx
          {isAuthed && (
            <Link
              key="/profile"
              href="/profile"
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 px-6 py-4 text-base transition-colors border-l-4',
                pathname === '/profile'
                  ? 'bg-primary/10 text-primary border-primary font-semibold'
                  : 'text-foreground hover:bg-muted border-transparent'
              )}
            >
              <User className="w-5 h-5 shrink-0" />
              Mon Profil
            </Link>
          )}
```

Add `User` to the lucide-react import at the top.

- [ ] **Push all commits**

```bash
git push origin master
```

Expected: All 6 commits pushed, Vercel build triggered automatically.
