import { lstat, readFile, realpath, rmdir, unlink } from 'node:fs/promises'
import * as path from 'node:path'
import { getReviewUploadDirectory } from '@/lib/marketing-share-path'

export function normalizeReviewPhotoPath(storedPath: unknown): { url: string; relativePath: string } | null {
  const raw = String(storedPath ?? '')
  if (/[\\:?#]/.test(raw)) return null
  const normalized = raw.replace(/^\/+/, '')
  if (!/^uploads\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(normalized)) return null
  return { url: `/${normalized}`, relativePath: normalized.slice('uploads/'.length) }
}

/** Persistent files win. The current release's old directory is read/cleanup compatibility only. */
export function getReviewUploadRoots(): string[] {
  return [...new Set([
    path.resolve(getReviewUploadDirectory()),
    path.resolve(process.cwd(), 'public', 'uploads'),
  ])]
}

export async function assertReviewUploadRoot(root: string): Promise<string> {
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Review upload storage is unavailable.')
  const actual = await realpath(root)
  // Also reject a configured path whose ancestor link resolves inside a release.
  if (process.env.NODE_ENV === 'production' && path.resolve(root) === path.resolve(getReviewUploadDirectory())) {
    getReviewUploadDirectory({ ...process.env, REVIEW_UPLOAD_DIR: actual })
  }
  return actual
}

function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT' }

function safeRelativePath(value: string): boolean {
  const segments = value.split('/')
  const filename = segments.pop() || ''
  return segments.every(segment => /^[A-Za-z0-9_-]+$/.test(segment))
    && !filename.startsWith('.') && !filename.includes('..') && !/[\\/:?#\0]/.test(filename)
    && /\.(?:jpg|jpeg|png|webp)$/i.test(filename)
}

export async function resolveReviewPhotoFile(root: string, relativePath: string): Promise<string | null> {
  if (!safeRelativePath(relativePath)) return null
  try {
    const actualRoot = await assertReviewUploadRoot(root)
    let file = root
    const segments = relativePath.split('/')
    for (let index = 0; index < segments.length; index++) {
      file = path.join(file, segments[index])
      const info = await lstat(file)
      if (info.isSymbolicLink() || (index < segments.length - 1 ? !info.isDirectory() : !info.isFile())) return null
    }
    const fromRoot = path.relative(actualRoot, await realpath(file))
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) return null
    return file
  } catch (error) {
    if (missing(error)) return null
    throw error
  }
}

export async function readReviewPhoto(storedPath: unknown): Promise<{ bytes: Buffer; contentType: string } | null> {
  const url = String(storedPath ?? '').replace(/^\/+/, '')
  if (!url.startsWith('uploads/')) return null
  const relativePath = url.slice('uploads/'.length)
  if (!safeRelativePath(relativePath)) return null
  for (const root of getReviewUploadRoots()) {
    const file = await resolveReviewPhotoFile(root, relativePath)
    if (!file) continue
    const extension = path.extname(file).toLowerCase()
    return { bytes: await readFile(file), contentType: extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg' }
  }
  return null
}

/** Called only after the existing admin delete transaction commits; never delete recursively. */
export async function removeReviewPhotoFiles(paths: string[]): Promise<number> {
  let roots: string[]
  try { roots = getReviewUploadRoots() } catch { return paths.filter(normalizeReviewPhotoPath).length }
  let failures = 0
  const directories = new Set<string>()
  for (const storedPath of paths) {
    const photo = normalizeReviewPhotoPath(storedPath)
    if (!photo) continue
    for (const root of roots) {
      try {
        const file = await resolveReviewPhotoFile(root, photo.relativePath)
        if (!file) {
          // Missing files are fine; a rejected existing path must surface a cleanup warning.
          try { await lstat(path.join(root, photo.relativePath)); failures++ } catch (error) { if (!missing(error)) throw error }
          continue
        }
        await unlink(file)
        if (path.resolve(path.dirname(file)) !== path.resolve(root)) directories.add(path.dirname(file))
      } catch (error) { if (!missing(error)) failures++ }
    }
  }
  for (const directory of directories) {
    try { await rmdir(directory) } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code || '')) failures++
    }
  }
  return failures
}
