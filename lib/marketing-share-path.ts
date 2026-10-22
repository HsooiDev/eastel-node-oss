import * as path from 'node:path'

/** Resolve at request time: standalone servers change cwd to their release folder. */
export function getMarketingShareDirectory(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): string {
  return getStorageDirectory('MARKETING_SHARE_DIR', 'marketing-shares', env, cwd)
}

export function getMarketingPosterDirectory(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): string {
  return getStorageDirectory('MARKETING_POSTER_DIR', 'posters', env, cwd)
}

export function getReviewUploadDirectory(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): string {
  if (!env.REVIEW_UPLOAD_DIR?.trim() && env.NODE_ENV !== 'production') return path.join(cwd, 'public', 'uploads')
  return getStorageDirectory('REVIEW_UPLOAD_DIR', 'uploads', env, cwd)
}

export function getWhatsAppMediaDirectory(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): string {
  const directory = getStorageDirectory('WHATSAPP_MEDIA_DIR', 'whatsapp-media', env, cwd)
  if (directory.split(/[\\/]/).some(part => ['public', 'public_html', '.next', 'hbuilds'].includes(part.toLowerCase()))) {
    throw new Error('WHATSAPP_MEDIA_DIR must be outside public and build directories.')
  }
  for (const key of ['MARKETING_SHARE_DIR', 'MARKETING_POSTER_DIR', 'REVIEW_UPLOAD_DIR']) {
    const configured = env[key]?.trim()
    if (!configured || !path.isAbsolute(configured)) continue
    const other = path.resolve(configured)
    const overlaps = [path.relative(other, directory), path.relative(directory, other)].some(relative =>
      relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))
    if (overlaps) throw new Error('WHATSAPP_MEDIA_DIR must be separate from public image storage.')
  }
  return directory
}

function getStorageDirectory(
  key: string,
  localFolder: string,
  env: Record<string, string | undefined>,
  cwd: string,
): string {
  const configured = env[key]?.trim()
  if (!configured) {
    if (env.NODE_ENV === 'production') throw new Error(`${key} must name persistent storage.`)
    return path.join(cwd, 'storage', localFolder)
  }
  if (!path.isAbsolute(configured)) throw new Error(`${key} must be an absolute path.`)
  const directory = path.resolve(configured)
  const resolvedCwd = path.resolve(cwd)
  const roots = [resolvedCwd]
  const nextSegment = `${path.sep}.next${path.sep}`
  const nextIndex = resolvedCwd.lastIndexOf(nextSegment)
  if (nextIndex >= 0) roots.push(resolvedCwd.slice(0, nextIndex))
  const insideRelease = roots.some(root => {
    const relative = path.relative(root, directory)
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  })
  if (directory === path.parse(directory).root || insideRelease) {
    throw new Error(`${key} must be outside the application release directory.`)
  }
  return directory
}
