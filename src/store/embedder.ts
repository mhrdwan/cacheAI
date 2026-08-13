import { env, pipeline } from '@xenova/transformers'
import os from 'node:os'
import path from 'node:path'

// Simpan model cache di tempat yang konsisten
env.cacheDir = path.join(os.homedir(), '.cacheai', 'models')
// Matikan remote fetch error spam jika offline (bisa fallback ke cache)
env.allowLocalModels = true

let embedderPromise: Promise<any> | null = null

export async function getEmbedder() {
  if (!embedderPromise) {
    // Model kecil, cepat, standar untuk RAG (all-MiniLM-L6-v2) ~22MB
    embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true, // pakai INT8 biar ringan di RAM/CPU
    })
  }
  return embedderPromise
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbedder()
  // Generate embeddings
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

// Cosine similarity (karena output normalize=true, ini sama dengan dot product)
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0
  let dotProduct = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
  }
  return dotProduct
}
