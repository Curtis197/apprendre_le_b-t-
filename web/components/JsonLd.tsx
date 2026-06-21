// Renders JSON-LD structured data. Escapes "<" to < to prevent breaking out
// of the <script> tag with user-supplied strings (per Next.js JSON-LD guidance).
type JsonLdObject = Record<string, unknown>

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
