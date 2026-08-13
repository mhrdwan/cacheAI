import { z } from 'zod'
import { deleteMemory } from '../store/memory-store.js'

export const forgetSchema = z.object({
  id: z.string().min(1).describe('The memory ID to delete (get IDs from recall or list_memories)'),
})

export type ForgetInput = z.infer<typeof forgetSchema>

export function forgetHandler() {
  return (input: ForgetInput) => {
    const deleted = deleteMemory(input.id)
    return {
      content: [{
        type: 'text' as const,
        text: deleted
          ? `Memory deleted: ${input.id}`
          : `Memory not found: ${input.id}`,
      }],
    }
  }
}
