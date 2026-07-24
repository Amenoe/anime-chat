import request from '@/common/request'

export type MediaSourceKind = 'rss' | 'web' | 'mixed'

export type MediaSourceItem = {
  id: string
  user_id: string
  name: string
  url: string
  kind: MediaSourceKind
  enabled: number
  sort_order: number
  last_fetched_at: string | null
  last_error: string
  create_time: string
  update_time: string
}

/** 订阅展开后的站点 */
export type MediaCatalogEntry = {
  key: string
  factoryId: string
  name: string
  description: string
  iconUrl: string
  searchUrl: string
  searchConfig: Record<string, any>
  subscriptionUrl: string
  subscriptionName: string
  subscriptionId: string
}

export type MediaCatalogResult = {
  entries: MediaCatalogEntry[]
  errors: string[]
}

export function listMediaSources() {
  return request.get<MediaSourceItem[]>({ url: '/media-sources' })
}

export function listMediaSourceCatalog() {
  return request.get<MediaCatalogResult>({
    url: '/media-sources/catalog',
    timeout: 60000,
  })
}

export function addMediaSource(data: { url: string; name?: string }) {
  return request.post<MediaSourceItem>({ url: '/media-sources', data })
}

export function updateMediaSource(
  id: string,
  data: { name?: string; url?: string; enabled?: boolean; sortOrder?: number },
) {
  return request.patch<MediaSourceItem>({ url: `/media-sources/${id}`, data })
}

export function removeMediaSource(id: string) {
  return request.delete<{ ok: boolean }>({ url: `/media-sources/${id}` })
}

export function reorderMediaSources(ids: string[]) {
  return request.put<MediaSourceItem[]>({
    url: '/media-sources/reorder',
    data: { ids },
  })
}

export function refreshMediaSource(id: string) {
  return request.post<{
    ok: boolean
    count: number
    kind: MediaSourceKind
  }>({ url: `/media-sources/${id}/refresh`, timeout: 60000 })
}
