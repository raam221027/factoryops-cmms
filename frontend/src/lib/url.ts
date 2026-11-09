/*
 * Guards for URLs that come from data (attachments, notification links). The API is trusted,
 * but a stored value should never be able to run script or send users off-site.
 */

const SAFE_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,/i

/** Attachment URL safe to show and open, or undefined. Allows raster data URLs, blob: and http(s). */
export function safeAttachmentUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (SAFE_IMAGE.test(url) || url.startsWith('blob:')) return url
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

/** An in-app path (e.g. "/tech/jobs/123"), or undefined for anything that would leave the app. */
export function internalPath(link: string | undefined): string | undefined {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.startsWith('/\\')) return undefined
  return link
}
