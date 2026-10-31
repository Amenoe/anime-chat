import localCache from '@/utils/cache'
import type { MediaCatalogEntry } from '@/api/media-source'

const CATALOG_KEY = 'media_catalog_entries'
const PREF_KEY = 'media_catalog_prefs'
/** 缓存 12 小时 */
const TTL_MS = 12 * 60 * 60 * 1000

export type CatalogPrefs = {
  /** key → 是否启用（默认 true） */
  enabled: Record<string, boolean>
  /** 自定义排序的 key 列表 */
  order: string[]
  /** 用户改过的显示名 */
  names: Record<string, string>
}

type CatalogCachePayload = {
  at: number
  entries: MediaCatalogEntry[]
}

const defaultPrefs = (): CatalogPrefs => ({
  enabled: {},
  order: [],
  names: {},
})

export function loadCatalogCache(): MediaCatalogEntry[] | null {
  try {
    const raw = localCache.getCache(CATALOG_KEY) as CatalogCachePayload | undefined
    if (!raw?.entries?.length || !raw.at) return null
    if (Date.now() - raw.at > TTL_MS) return null
    return raw.entries
  } catch {
    return null
  }
}

export function saveCatalogCache(entries: MediaCatalogEntry[]) {
  localCache.setCache(CATALOG_KEY, {
    at: Date.now(),
    entries,
  } satisfies CatalogCachePayload)
}

export function clearCatalogCache() {
  localCache.delCache(CATALOG_KEY)
}

export function loadCatalogPrefs(): CatalogPrefs {
  try {
    const p = localCache.getCache(PREF_KEY) as CatalogPrefs | undefined
    if (!p) return defaultPrefs()
    return {
      enabled: p.enabled || {},
      order: Array.isArray(p.order) ? p.order : [],
      names: p.names || {},
    }
  } catch {
    return defaultPrefs()
  }
}

export function saveCatalogPrefs(prefs: CatalogPrefs) {
  localCache.setCache(PREF_KEY, prefs)
}

/** 合并缓存条目 + 本地偏好（排序 / 启停 / 改名） */
export function applyCatalogPrefs(
  entries: MediaCatalogEntry[],
  prefs: CatalogPrefs,
): MediaCatalogEntry[] {
  const map = new Map(entries.map((e) => [e.key, e]))
  const ordered: MediaCatalogEntry[] = []
  for (const k of prefs.order) {
    const e = map.get(k)
    if (e) {
      ordered.push(e)
      map.delete(k)
    }
  }
  for (const e of map.values()) ordered.push(e)

  return ordered.map((e) => ({
    ...e,
    name: prefs.names[e.key] || e.name,
  }))
}

export function isCatalogEnabled(key: string, prefs: CatalogPrefs) {
  if (key in prefs.enabled) return !!prefs.enabled[key]
  return true
}
