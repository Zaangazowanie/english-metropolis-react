// Per-school subdomain resolution. conversa.englishmetro.com -> "conversa".
// Returns null for the apex / www / non-subdomain hosts (and localhost / IPs),
// so the default English Metropolis branding is used there.

export function extractSubdomainOrg(hostname) {
  if (!hostname) return null
  const host = String(hostname).toLowerCase()
  // bare IPs and localhost never carry a school subdomain
  if (host === 'localhost' || /^[0-9.]+$/.test(host)) return null
  const parts = host.split('.')
  if (parts.length < 3) return null               // englishmetro.com / x.com -> none
  const sub = parts[0]
  if (sub === 'www' || sub === 'staging' || sub === 'admin') return null
  // only treat *.englishmetro.com as a school subdomain
  if (!host.endsWith('englishmetro.com')) return null
  return sub
}
