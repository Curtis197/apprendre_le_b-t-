// lib/resources.ts — shared metadata for community resources (list and detail pages).
import { Music, BookOpen, Feather, Quote, Mic, HelpCircle, Layers, Video } from 'lucide-react'
import type { CommunityText } from './types'

export const RESOURCE_TYPES = [
  { value: null,      label: 'Tous',       icon: Layers },
  { value: 'song',    label: 'Chansons',   icon: Music },
  { value: 'story',   label: 'Contes',     icon: BookOpen },
  { value: 'poem',    label: 'Poèmes',     icon: Feather },
  { value: 'proverb', label: 'Proverbes',  icon: Quote },
  { value: 'speech',  label: 'Discours',   icon: Mic },
  { value: 'riddle',  label: 'Devinettes', icon: HelpCircle },
  { value: 'video',   label: 'Vidéos',     icon: Video },
] as const

export const RESOURCE_TYPE_COLORS: Record<string, string> = {
  song:    'bg-pink-100 text-pink-700',
  story:   'bg-amber-100 text-amber-700',
  poem:    'bg-violet-100 text-violet-700',
  proverb: 'bg-emerald-100 text-emerald-700',
  speech:  'bg-blue-100 text-blue-700',
  riddle:  'bg-orange-100 text-orange-700',
  video:   'bg-red-100 text-red-700',
  other:   'bg-muted text-muted-foreground',
}

/** Singular, lower-case type names for sentences and titles ("Chanson bhété"). */
const SINGULAR_LABELS: Record<string, string> = {
  song: 'Chanson',
  story: 'Conte',
  poem: 'Poème',
  proverb: 'Proverbe',
  speech: 'Discours',
  riddle: 'Devinette',
  video: 'Vidéo',
  other: 'Ressource',
}

export function resourceTypeSingular(type: string): string {
  return SINGULAR_LABELS[type] ?? SINGULAR_LABELS.other
}

/**
 * One-paragraph summary for <meta name="description">: the French translation when
 * there is one (the page is read in French), else the Bhété text. Cut on a word boundary.
 */
export function buildResourceDescription(
  text: Pick<CommunityText, 'title' | 'type' | 'content_bete' | 'content_french'>,
  max = 155,
): string {
  const source = (text.content_french?.trim() || text.content_bete.trim()).replace(/\s+/g, ' ')
  const lead = `${resourceTypeSingular(text.type)} bhété « ${text.title.trim()} » : `
  const room = Math.max(max - lead.length, 40)
  if (source.length <= room) return lead + source
  const cut = source.slice(0, room)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lead}${(lastSpace > room * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
