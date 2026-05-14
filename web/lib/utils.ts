import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Strip leading apostrophes/quotation marks and trailing punctuation from
// raw Bible phonetic forms (e.g. "'bɔgʋ," → "bɔgʋ")
export function cleanBeteWord(word: string): string {
  return word
    .replace(/^['''ʼ‑‐‒]+/, '')
    .replace(/[.,;:!?]+$/, '')
    .trim()
}
