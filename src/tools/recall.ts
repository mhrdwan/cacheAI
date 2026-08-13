import { z } from 'zod'
import { searchMemories, listMemories } from '../store/memory-store.js'
import type { MemoryType } from '../types.js'

export const recallSchema = z.object({
  query: z.string().min(1).describe(
    'What to search for. Use natural language — e.g. "tech stack", "auth approach", "database choice"'
  ),
  limit: z.number().int().min(1).max(50).default(10).describe(
    'Max number of memories to return'
  ),
  scope: z.enum(['project', 'global', 'all']).default('all').describe(
    'Search scope: project (current project + global), global (global only), all (everything)'
  ),
  type: z.enum(['decision', 'preference', 'fact', 'bug', 'architecture', 'session', 'general'])
    .optional()
    .describe('Filter by memory type'),
})

export type RecallInput = z.infer<typeof recallSchema>

export function recallHandler(project: string) {
  return async (input: RecallInput) => {
    const results = await searchMemories({
      query: input.query,
      project,
      scope: input.scope,
      limit: input.limit,
    })

    // if FTS returns nothing, fall back to list with type filter
    const memories = results.length > 0
      ? results
      : listMemories({
          project,
          type: input.type as MemoryType | undefined,
          scope: input.scope === 'all' ? 'all' : input.scope as 'project' | 'global',
          limit: input.limit,
        }).map(m => ({ ...m, relevance_hint: 'fallback-list' }))

    if (memories.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No memories found for: "${input.query}"`,
        }],
      }
    }

    const lines = memories.map((m, i) => {
      const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : ''
      const date = new Date(m.created_at).toISOString().split('T')[0]
      return `${i + 1}. [${m.type}${tags}] (${m.scope}, ${date}) ${m.content}\n   ID: ${m.id}`
    })

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'} for "${input.query}":\n\n${lines.join('\n\n')}`,
      }],
    }
  }
}
