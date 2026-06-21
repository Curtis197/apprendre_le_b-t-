import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private / non-content routes — keep crawlers off auth, profile, and submission forms.
      disallow: ['/auth', '/profile', '/forum/new', '/resources/new', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
