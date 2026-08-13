export type MemoryType =
  | 'decision'
  | 'preference'
  | 'fact'
  | 'bug'
  | 'architecture'
  | 'session'
  | 'general'

export interface Memory {
  id: string
  content: string
  type: MemoryType
  tags: string[]
  project: string
  scope: 'project' | 'global'
  created_at: number
  updated_at: number
  access_count: number
  last_accessed: number | null
}

export interface Session {
  id: string
  project: string
  summary: string
  started_at: number
  ended_at: number
}

export interface RecallResult {
  id: string
  content: string
  type: MemoryType
  tags: string[]
  scope: 'project' | 'global'
  created_at: number
  relevance_hint?: string
}

export interface StoreConfig {
  dbPath: string
  project: string
}
