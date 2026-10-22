import { authorizeCron } from '@/lib/cron-auth'
// ─────────────────────────────────────────────────────────────
// POST /api/media/cleanup — delete WhatsApp media older than 30 days
// Cron: daily 2 AM (see crontab.txt). PHP parity: cron-media-cleanup.php
// Protected by CRON_SECRET header or admin auth
// ─────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'
import type { NextRequest } from 'next/server'
import { success, error } from '@/app/api/auth/_helpers'

const RETENTION_DAYS = 30

function cleanupMedia(dir: string, retentionDays: number): { deletedFiles: number; deletedDirs: number } {
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let deletedFiles = 0
  let deletedDirs = 0

  function traverse(currentDir: string) {
    for (const file of fs.readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, file)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        traverse(fullPath)
        if (fs.readdirSync(fullPath).length === 0) {
          fs.rmdirSync(fullPath)
          deletedDirs++
        }
      } else if (stat.isFile() && stat.mtimeMs < cutoffTime) {
        fs.unlinkSync(fullPath)
        deletedFiles++
      }
    }
  }

  traverse(dir)
  return { deletedFiles, deletedDirs }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) return error('Not authenticated.', 401)

    const mediaDir = path.join(process.cwd(), 'public', 'media', 'wa')
    if (!fs.existsSync(mediaDir)) {
      return success({ message: 'Media directory not found — nothing to clean.', deletedFiles: 0, deletedDirs: 0 })
    }

    const { deletedFiles, deletedDirs } = cleanupMedia(mediaDir, RETENTION_DAYS)
    return success({ message: 'Media cleanup complete.', retentionDays: RETENTION_DAYS, deletedFiles, deletedDirs })
  } catch (e) {
    console.error('[media/cleanup] failed:', e)
    return error('Cleanup failed.', 500)
  }
}
