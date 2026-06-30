// web/app/profile/page.tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, User } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type ProfileType = 'member' | 'group' | 'teacher'
type Canal = 'whatsapp' | 'tiktok' | 'instagram' | 'facebook'

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
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    console.log('[ProfilePage] mount — calling getUser()')
    supabase.auth.getUser().then(async ({ data, error: userError }) => {
      console.log('[ProfilePage] getUser resolved — user:', data.user?.id ?? 'none', '| error:', userError?.message ?? 'none')
      if (!data.user) {
        setLoading(false)
        console.warn('[ProfilePage] no user — redirecting to /auth')
        router.replace('/auth?next=/profile')
        return
      }
      setUserId(data.user.id)

      console.log('[ProfilePage] fetching profiles row for id:', data.user.id)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      console.log('[ProfilePage] profiles fetch resolved — profile:', profile, '| error:', profileError)

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

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
    }).catch((err) => {
      console.error('[ProfilePage] unhandled error in getUser/profile chain:', err)
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
      setLoading(false)
    })
  }, [supabase, router])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

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
      savedTimerRef.current = setTimeout(() => setSaved(false), 3000)
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
