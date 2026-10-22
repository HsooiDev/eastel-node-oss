import { isIP } from 'node:net'

/** One trusted reverse-proxy hop. Direct Node ingress must be private. */
export function clientIp(request: { headers: Headers }): string {
  const chain = request.headers.get('x-forwarded-for')
  if (chain && chain.length <= 1024) {
    const peer = chain.split(',').at(-1)?.trim() ?? ''
    if (isIP(peer)) return peer
  }
  const peer = request.headers.get('x-real-ip')?.trim() ?? ''
  return isIP(peer) ? peer : 'unknown'
}
