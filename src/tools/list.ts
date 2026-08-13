import { z } from 'zod'
import { listMemories } from '../store/memory-store.js'
import type { MemoryType } from '../types.js'

export const listMemoriesSchema = z.object({
  type: z.enum(['decision', 'preference', 'fact', 'bug', 'architecture', 'session', 'general'])
    .optional()
    .describe('Filter by memory type'),
  tag: z.string().optional().describe('Filter by tag'),
  scope: z.enum(['project', 'global', 'all']).default('all').describe('Filter by scope'),
  limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
})

export type ListMemoriesInput = z.infer<typeof listMemoriesSchema>

export function listMemoriesHandler(project: string) {
  return (input: ListMemoriesInput) => {
    const memories = listMemories({
      project,
      type: input.type as MemoryType | undefined,
      tag: input.tag,
      scope: input.scope === 'all' ? 'all' : input.scope as 'project' | 'global',
      limit: input.limit,
    })

    if (memories.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: 'No memories stored yet.',
        }],
      }
    }

    // group by type
    const grouped = memories.reduce<Record<string, typeof memories>>((acc, m) => {
      acc[m.type] = acc[m.type] ?? []
      acc[m.type].push(m)
      return acc
    }, {})

    const sections = Object.entries(grouped).map(([type, items]) => {
      const lines = items.map(m => {
        const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : ''
        const date = new Date(m.created_at).toISOString().split('T')[0]
        return `  • (${date}${tags}) ${m.content}\n    ID: ${m.id}`
      })
      return `### ${type.toUpperCase()}\n${lines.join('\n')}`
    })

    return {
      content: [{
        type: 'text' as const,
        text: `## Memories for project: ${project} (${memories.length} total)\n\n${sections.join('\n\n')}`,
      }],
    }
  }
}
