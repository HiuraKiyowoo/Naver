import { db } from './firebase'

export const cache = {
  blacklist:            new Set<string>(),
  disabledEndpoints:    new Set<string>(),
  requireKeyEndpoints:  new Set<string>(),
  apikeys:              new Set<string>(),
}

export async function reloadCache() {
  try {
    const [blSnap, epSnap, rkSnap, akSnap] = await Promise.all([
      db.collection('blacklist').get(),
      db.collection('endpoints_status').where('enabled', '==', false).get(),
      db.collection('endpoints_status').where('requireKey', '==', true).get(),
      db.collection('apikeys').where('active', '==', true).get(),
    ])
    cache.blacklist           = new Set(blSnap.docs.map(d => d.id))
    cache.disabledEndpoints   = new Set(epSnap.docs.map(d => d.id))
    cache.requireKeyEndpoints = new Set(rkSnap.docs.map(d => d.id))
    cache.apikeys             = new Set(akSnap.docs.map(d => d.id))
    console.log(`[cache] refreshed — ${cache.blacklist.size} blocked, ${cache.apikeys.size} keys`)
  } catch (e: any) {
    console.warn('[cache] reload failed:', e.message)
  }
}

setInterval(reloadCache, 30_000)
