import { z } from 'zod'
import { createSession, listSessions } from '../store/memory-store.js'

export const sessionSummarySchema = z.object({
  summary: z.string().min(1).describe(
    'A concise summary of what was done/decided this session. ' +
    'Include: main tasks completed, decisions made, issues found, next steps.'
  ),
  started_at: z.number().optional().describe(
    'Unix timestamp (ms) when this session started. Defaults to now - 1 hour if not provided.'
  ),
})

export type SessionSummaryInput = z.infer<typeof sessionSummarySchema>

export function sessionSummaryHandler(project: string) {
  return (input: SessionSummaryInput) => {
    const started_at = input.started_at ?? (Date.now() - 60 * 60 * 1000)

    const id = createSession({
      project,
      summary: input.summary,
      started_at,
    })

    const recent = listSessions(project, 3)
    const recentStr = recent.length > 1
      ? `\n\nRecent sessions:\n${recent.slice(1).map((s: any) => `  • ${new Date(s.ended_at).toISOString().split('T')[0]}: ${s.summary.slice(0, 80)}...`).join('\n')}`
      : ''

    return {
      content: [{
        type: 'text' as const,
        text: `Session saved (ID: ${id})\nProject: ${project}\nSummary: ${input.summary}${recentStr}`,
      }],
    }
  }
}
