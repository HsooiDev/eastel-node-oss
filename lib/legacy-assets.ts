// Fixed public image compatibility. Never use a catch-all or external target.
const ASSET_ALIASES = [
  // The original .jpg contains AVIF bytes; use the actual format without re-encoding.
  { source: '/images/ASP-Licence.jpg', destination: '/images/asp-licence.avif' },
  // This historical .png contains the same SVG bytes as the canonical white logo.
  { source: '/images/Eastel-logo-white-100x100.png', destination: '/images/eastel-logo-white.svg' },
  // The PHP dark1 file is a six-byte corrupt artifact; use the valid dark logo.
  { source: '/images/eastel-logo-dark1.svg', destination: '/images/eastel-logo-dark.svg' },
] as const

export function getLegacyAssetRewrites(): { source: string; destination: string }[] {
  return ASSET_ALIASES.map(alias => ({ ...alias }))
}

/** Keep the authenticated site-image reader consistent with public image URLs. */
export function resolveLegacyAssetFilename(filename: string): string {
  const alias = ASSET_ALIASES.find(item => item.source.slice('/images/'.length).toLowerCase() === filename.toLowerCase())
  return alias ? alias.destination.slice('/images/'.length) : filename
}
