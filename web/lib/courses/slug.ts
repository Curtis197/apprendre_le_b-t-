const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Lowercase ASCII slug, at most 60 characters, no leading/trailing hyphen. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

export function randomSuffix(length = 4, random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += SUFFIX_CHARS[Math.floor(random() * SUFFIX_CHARS.length)]
  }
  return out
}

/** Slug for a new course: slugified title plus a short random suffix (max 65 chars, DB allows 80). */
export function buildSlug(title: string, random: () => number = Math.random): string {
  const base = slugify(title) || 'cours'
  return `${base}-${randomSuffix(4, random)}`
}
