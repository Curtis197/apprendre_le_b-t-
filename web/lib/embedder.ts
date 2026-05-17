import 'server-only'
// lib/embedder.ts
// Produces 384-dim vectors compatible with lexicon.embedding (same model as pipeline/vectorize.py)

const HF_URL =
  'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'

function meanPool(tokenEmbeddings: number[][]): number[] {
  const dim = tokenEmbeddings[0].length
  const pooled = new Array<number>(dim).fill(0)
  for (const tok of tokenEmbeddings) {
    for (let i = 0; i < dim; i++) pooled[i] += tok[i]
  }
  return pooled.map(v => v / tokenEmbeddings.length)
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(HF_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  })
  if (!res.ok) {
    throw new Error(`Embedding API error ${res.status}: ${await res.text()}`)
  }
  const raw: number[] | number[][] | number[][][] = await res.json()

  // HF returns flat [384], [seq][384], or [1][seq][384] depending on model/version
  if (typeof raw[0] === 'number') return raw as number[]
  if (typeof (raw as number[][])[0][0] === 'number') return meanPool(raw as number[][])
  return meanPool((raw as number[][][])[0])
}
