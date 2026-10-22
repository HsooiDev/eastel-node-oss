import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { getMarketingPosterDirectory } from './marketing-share-path'
import { getReviewUploadRoots, readReviewPhoto } from './review-upload-path'
import { resolveLegacyAssetFilename } from './legacy-assets'

type GallerySource = 'poster' | 'site' | 'review' | 'legacy-review'
const RASTER_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
}

function sourceDirectories(): Record<GallerySource, string[]> {
  const publicRoot = path.join(process.cwd(), 'public')
  const reviewRoots = getReviewUploadRoots()
  return {
    poster: [getMarketingPosterDirectory()],
    site: [path.join(publicRoot, 'images')],
    review: reviewRoots,
    'legacy-review': reviewRoots.map(root => path.join(root, 'reviews')),
  }
}

function imageType(source: GallerySource, filename: string): string | undefined {
  if (!filename || filename.startsWith('.') || /[\\/\0]/.test(filename) || filename.includes('..')) return
  const extension = path.extname(filename).toLowerCase()
  if (source === 'site' && extension === '.svg') return 'image/svg+xml'
  if (source === 'site' && extension === '.avif') return 'image/avif'
  return RASTER_TYPES[extension]
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

export async function listMarketingGallery(): Promise<{ filename: string; url: string }[]> {
  const images: { filename: string; url: string; modified: number }[] = []
  const seen = new Set<string>()
  for (const [source, directories] of Object.entries(sourceDirectories()) as [GallerySource, string[]][]) {
    for (const directory of directories) {
      try {
        const root = await lstat(directory)
        if (!root.isDirectory() || root.isSymbolicLink()) continue
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (!entry.isFile() || !imageType(source, entry.name)) continue
          try {
            const info = await lstat(path.join(directory, entry.name))
            if (!info.isFile() || info.isSymbolicLink()) continue
            const filename = entry.name
            const url = source === 'poster'
              ? `/api/admin/posters/${encodeURIComponent(filename)}`
              : `/api/admin/marketing-images/${source}/${encodeURIComponent(filename)}`
            if (seen.has(url)) continue
            seen.add(url)
            images.push({ filename, url, modified: info.mtimeMs })
          } catch (error) { if (!isMissing(error)) throw error }
        }
      } catch (error) { if (!isMissing(error)) throw error }
    }
  }
  return images.sort((a, b) => b.modified - a.modified || a.url.localeCompare(b.url))
    .slice(0, 50).map(({ filename, url }) => ({ filename, url }))
}

/** Only fixed gallery sources are addressable; clients cannot supply a directory. */
export async function readMarketingGalleryImage(source: string, filename: string): Promise<{
  bytes: Buffer; contentType: string
} | null> {
  if (!['site', 'review', 'legacy-review'].includes(source)) return null
  const kind = source as GallerySource
  // Validate the original input before mapping a finite legacy site asset name.
  if (!imageType(kind, filename)) return null
  if (kind === 'site') filename = resolveLegacyAssetFilename(filename)
  const contentType = imageType(kind, filename)
  if (!contentType) return null
  if (kind !== 'site') return readReviewPhoto(`uploads/${kind === 'legacy-review' ? 'reviews/' : ''}${filename}`)
  const directory = sourceDirectories()[kind][0]
  try {
    const root = await lstat(directory)
    if (!root.isDirectory() || root.isSymbolicLink()) return null
    const filePath = path.join(directory, filename)
    const file = await lstat(filePath)
    if (!file.isFile() || file.isSymbolicLink()) return null
    return { bytes: await readFile(filePath), contentType }
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}
