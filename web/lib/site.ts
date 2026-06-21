// Central site constants for SEO / metadata. Override the URL in production via
// NEXT_PUBLIC_SITE_URL if the canonical domain ever changes.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://apprendre-le-bhete.com'
).replace(/\/+$/, '')

export const SITE_NAME = 'Apprendre le bhété'
export const SITE_TAGLINE = 'Plateforme linguistique bhété'

export const SITE_DESCRIPTION =
  'Lexique, traducteur, grammaire et ressources pour apprendre et préserver la langue ' +
  'bhété (bété) de Côte d’Ivoire — une plateforme collaborative et communautaire.'

export const SITE_KEYWORDS = [
  'bhété', 'bété', 'langue bété', 'langue bhété', 'dictionnaire bété',
  'traduction bété français', 'lexique bété', 'grammaire bété',
  'apprendre le bété', 'apprendre le bhété', 'Côte d’Ivoire', 'langue kru',
]

// Default social-share image (served from /public). Replace with a dedicated
// 1200×630 opengraph-image later for cleaner cards.
export const SITE_OG_IMAGE = '/patrimoine-vivant.jpg'
