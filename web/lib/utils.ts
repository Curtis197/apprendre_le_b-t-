import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Extract YouTube video ID from any standard YouTube URL format.
// Handles: youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

// Strip leading apostrophes/quotation marks and trailing punctuation from
// raw Bible phonetic forms (e.g. "'bɔgʋ," → "bɔgʋ")
export function cleanBeteWord(word: string): string {
  return word
    .replace(/^['''ʼ‑‐‒]+/, '')
    .replace(/[.,;:!?]+$/, '')
    .trim()
}
