import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

export interface Config {
  projectDir: string
  projectName: string
  projectDbPath: string
  globalDbPath: string
}

export function resolveConfig(projectArg?: string): Config {
  // --project flag or cwd
  const projectDir = projectArg
    ? path.resolve(projectArg)
    : process.cwd()

  const projectName = path.basename(projectDir)

  // .cacheai/ inside project dir
  const projectCacheDir = path.join(projectDir, '.cacheai')
  if (!fs.existsSync(projectCacheDir)) {
    fs.mkdirSync(projectCacheDir, { recursive: true })
  }

  // ~/.cacheai/ global
  const globalCacheDir = path.join(os.homedir(), '.cacheai')
  if (!fs.existsSync(globalCacheDir)) {
    fs.mkdirSync(globalCacheDir, { recursive: true })
  }

  return {
    projectDir,
    projectName,
    projectDbPath: path.join(projectCacheDir, 'memory.db'),
    globalDbPath: path.join(globalCacheDir, 'memory.db'),
  }
}
