import { z } from 'zod'
import { createMemory } from '../store/memory-store.js'
import type { MemoryType } from '../types.js'

export const rememberSchema = z.object({
  content: z.string().min(1).describe(
    'The fact, decision, preference, or information to remember. Be specific and complete.'
  ),
  type: z.enum(['decision', 'preference', 'fact', 'bug', 'architecture', 'session', 'general'])
    .default('general')
    .describe(
      'Type: decision (architectural/technical choices), preference (user/project preferences), ' +
      'fact (concrete facts like URLs, names, configs), bug (known bugs/issues), ' +
      'architecture (system design), session (session summary), general (anything else)'
    ),
  tags: z.array(z.string()).default([]).describe(
    'Optional tags, e.g. ["auth", "database", "frontend"]'
  ),
  scope: z.enum(['project', 'global']).default('project').describe(
    'project = only this project, global = visible across all projects'
  ),
})

export type RememberInput = z.infer<typeof rememberSchema>

export function rememberHandler(project: string) {
  return async (input: RememberInput) => {
    const result = await createMemory({
      content: input.content,
      type: input.type as MemoryType,
      tags: input.tags,
      project,
      scope: input.scope,
    })

    const tagsStr = result.memory.tags.length > 0
      ? ` [${result.memory.tags.join(', ')}]`
      : ''

    if (result.deduplicated) {
      return {
        content: [{
          type: 'text' as const,
          text: `Updated existing memory (${result.memory.type}${tagsStr}): "${result.memory.content}"\nID: ${result.memory.id} (deduplicated — merged with similar existing memory)`,
        }],
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: `Remembered (${result.memory.type}${tagsStr}): "${result.memory.content}"\nID: ${result.memory.id}`,
      }],
    }
  }
}
