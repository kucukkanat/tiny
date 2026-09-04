/**
 * Why this address won't work, or nothing. Every one of these is a failure the
 * browser reports as an unreadable network error minutes later, so it's worth
 * catching here where there's room to say what to do instead.
 */
export const refuse = (url: string): string | undefined => {
  const trimmed = url.trim()
  if (trimmed.length === 0) return 'Paste the address of an extension.'
  if (!URL.canParse(trimmed, location.href)) return 'That is not an address.'

  const { protocol, hostname, pathname } = new URL(trimmed, location.href)

  if (location.protocol === 'https:' && protocol === 'http:')
    return 'Safari will not load http from an https page. Serve it over https, or run the app on localhost.'

  if (hostname === 'raw.githubusercontent.com' || hostname.startsWith('gist.'))
    return 'GitHub sends these as plain text, which no browser will run. Use jsDelivr or GitHub Pages.'

  // A jsDelivr branch address is cached in the browser for a week, so an update
  // would look like it did nothing at all.
  if (hostname === 'cdn.jsdelivr.net') {
    const ref = /^\/(?:gh|npm)\/[^/]+(?:\/[^/@]+)?@([^/]+)/.exec(pathname)?.[1]
    if (!ref || /^(main|master|latest|next|dev|head)$/i.test(ref))
      return 'Pin a tag or a commit. A branch address is cached in your browser for a week.'
  }

  return undefined
}
