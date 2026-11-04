import localCache from '@/utils/cache'
import type { MediaCatalogEntry } from '@/api/media-source'

const CATALOG_KEY = 'media_catalog_entries'
const PREF_KEY = 'media_catalog_prefs'
/** 缓存 12 小时 */
const TTL_MS = 12 * 60 * 60 * 1000

/**
 * 站点缓存按用户隔离。
 *
 * 旧版 key 是固定的 `media_catalog_entries`，同一浏览器换账号（尤其注册新号）
 * 会直接读到上一个账号的站点列表；若那份缓存是「某次只拉到 bt1」的不完整结果，
 * 新用户就会在「数据源 → 站点」里只看到两个 BT 源，而且 12 小时内不会自愈。
 */
function catalogKey(userId: string) {
  return `${CATALOG_KEY}:${userId}`
}

/** 清掉旧版无用户维度的缓存，避免它继续被当成当前账号的数据 */
function dropLegacyCache() {
  try {
    localCache.delCache(CATALOG_KEY)
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

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

export function loadCatalogCache(userId?: string): MediaCatalogEntry[] | null {
  dropLegacyCache()
  if (!userId) return null
  try {
    const raw = localCache.getCache(catalogKey(userId)) as CatalogCachePayload | undefined
    if (!raw?.entries?.length || !raw.at) return null
    if (Date.now() - raw.at > TTL_MS) return null
    return raw.entries
  } catch {
    return null
  }
}

export function saveCatalogCache(entries: MediaCatalogEntry[], userId?: string) {
  if (!userId) return
  localCache.setCache(catalogKey(userId), {
    at: Date.now(),
    entries,
  } satisfies CatalogCachePayload)
}

export function clearCatalogCache() {
  dropLegacyCache()
  // 订阅增删后所有账号的站点缓存都可能过期，直接清掉全部用户维度 key
  try {
    const prefix = `${CATALOG_KEY}:`
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    /* localStorage 不可用时忽略 */
  }
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
