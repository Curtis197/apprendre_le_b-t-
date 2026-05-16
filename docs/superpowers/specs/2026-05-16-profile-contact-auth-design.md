# Profile Page, Contact Page Dynamics & Auth Gates

**Date:** 2026-05-16
**Status:** Approved

---

## Overview

Three coordinated changes:

1. Extend the `profiles` table so teachers and groups can publish themselves
2. Add a `/profile` page where any logged-in user manages their info; teachers/groups opt into the contact directory
3. Make the contact page grid dynamic (driven by profiles), add Instagram/Facebook canals
4. Gate forum posting and upvotes behind authentication in the UI

---

## 1. Database Migration

**File:** `supabase/migrations/20260516000003_profile_extensions.sql`

Add columns to the existing `profiles` table:

```sql
ALTER TABLE profiles
  ADD COLUMN type      TEXT NOT NULL DEFAULT 'member'
                       CHECK (type IN ('member', 'group', 'teacher')),
  ADD COLUMN bio       TEXT,
  ADD COLUMN contact   TEXT,
  ADD COLUMN canal     TEXT
                       CHECK (canal IN ('whatsapp', 'tiktok', 'instagram', 'facebook')),
  ADD COLUMN whatsapp_url  TEXT,
  ADD COLUMN tiktok_url    TEXT,
  ADD COLUMN instagram_url TEXT,
  ADD COLUMN facebook_url  TEXT,
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
```

No RLS changes needed — existing policies already allow each user to update their own row.

Also update the `increment_upvotes` RPC to silently no-op for anonymous callers:

```sql
CREATE OR REPLACE FUNCTION increment_upvotes(table_name text, row_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  -- existing logic unchanged
END;
$$;
```

---

## 2. Profile Page — `/profile`

**File:** `web/app/profile/page.tsx`

### Auth gate
If no session, redirect to `/auth?next=/profile`.

### Sections

**Basic info**
- Name (text input, pre-filled from `profiles.name`)
- Avatar URL (text input, pre-filled from `profiles.avatar_url`)
- Bio (textarea, optional)

**Visibilité sur la page Contact**
- Type selector: `Membre` / `Groupe` / `Enseignant` (select or radio pills)
- Toggle "Apparaître sur la page Contact" (`is_public`) — only rendered when type is `group` or `teacher`

**Contact & réseaux** (rendered only when `is_public = true`)
- Canal principal (select): WhatsApp / TikTok / Instagram / Facebook
- Contact (text): phone, email, or link shown on the contact card
- Four URL fields: WhatsApp, TikTok, Instagram, Facebook

### Save behaviour
Single "Enregistrer" button → `upsert` into `profiles` on `id`. Show success toast / inline confirmation. No optimistic update needed.

### Data loading
On mount: `supabase.from('profiles').select('*').eq('id', session.user.id).single()` — pre-fill all fields.

---

## 3. Contact Page — Dynamic Grid

**File:** `web/app/contact/page.tsx`

### Replace hardcoded CONTACTS array
Query on page load (client-side, no caching needed):
```ts
supabase
  .from('profiles')
  .select('name, type, canal, contact, bio, avatar_url, whatsapp_url, tiktok_url, instagram_url, facebook_url')
  .eq('is_public', true)
  .in('type', ['group', 'teacher'])
```

Map each row to a card in the existing grid. If no results, show an empty state.

### Add Instagram and Facebook canals
- Canal dropdown options: Tous / WhatsApp / TikTok / Instagram / Facebook
- Type dropdown options: Tout afficher / Groupes / Enseignants (unchanged)
- Card badges use the `canal` field from the profile row

### Contact card display
Each card shows: icon (derived from `canal`), name, bio/description, canal badge, contact link (using `contact` field), and relevant social URL buttons.

---

## 4. Auth Gates — Forum & Votes

### Forum (`/forum/page.tsx`, `/forum/[id]/page.tsx`)
- Read session via `supabase.auth.getSession()` on mount
- If no session: replace the "Nouveau sujet" button and reply form with a banner:
  > *Connectez-vous pour participer à la discussion →* (links to `/auth?next=<current-path>`)
- Forum thread/post reading remains public (no change)

### Contribution vote buttons (`web/components/PendingContributions.tsx` or wherever vote buttons live)
- Same session check: if anon, disable vote buttons and show tooltip "Connectez-vous pour voter"
- DB-level: `increment_upvotes` RPC updated (see migration) to silently ignore anon calls as a defence-in-depth measure

### Lexicon upvotes
- Already RLS-gated (`lexicon upvote` policy requires `authenticated`) — add UI disable for anon to match

---

## File Checklist

| File | Action |
|------|--------|
| `supabase/migrations/20260516000003_profile_extensions.sql` | Create |
| `web/app/profile/page.tsx` | Create |
| `web/app/contact/page.tsx` | Modify (dynamic query, new canals) |
| `web/app/forum/page.tsx` | Modify (auth gate on new thread) |
| `web/app/forum/[id]/page.tsx` | Modify (auth gate on reply form) |
| `web/components/ForumNewThreadForm.tsx` | May not need changes if gate is in page |
| `web/app/layout.tsx` or `AuthNav` | Add profile link in nav (logged-in state) |
