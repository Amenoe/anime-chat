import request from '@/common/request'
import localCache from '@/utils/cache'

export type PlaybackStatus =
  | 'created'
  | 'fetching'
  | 'downloading'
  | 'playable'
  | 'ready'
  | 'failed'

export type PlaybackSessionView = {
  id: string
  status: PlaybackStatus
  progress: number
  sizeBytes: number
  downloadedBytes: number
  fileName: string
  fileIndex: number
  infoHash: string
  errorMessage?: string
  bangumiId: number | null
  episodeSort: number | null
  playUrl: string | null
  playMode: 'progressive' | 'stream' | 'hls'
}

export type CreatePlaybackBody = {
  uri: string
  bangumiId?: number
  episodeSort?: number
  fileIndex?: number
}

export type StreamPlaybackBody = {
  streamUrl: string
  title?: string
  headers?: Record<string, string>
  bangumiId?: number
  episodeSort?: number
}

export type AutoPlaybackBody = {
  keyword: string
  episodeSort: number
  bangumiId?: number
  altKeyword?: string
  fileIndex?: number
}

export type PlayCandidate = {
  kind: 'bt' | 'stream'
  title: string
  uri: string
  sourceName: string
  subscriptionName: string
  score: number
  headers?: Record<string, string>
  episodeSort?: number
}

export function createPlaybackSession(data: CreatePlaybackBody) {
  return request.post<PlaybackSessionView>({
    url: '/playback/sessions',
    data,
  })
}

export function createStreamPlaybackSession(data: StreamPlaybackBody) {
  return request.post<PlaybackSessionView>({
    url: '/playback/sessions/stream',
    data,
  })
}

/** 数据源搜索 → 优先流媒体，否则 BT */
export function createAutoPlaybackSession(data: AutoPlaybackBody) {
  return request.post<PlaybackSessionView>({
    url: '/playback/sessions/auto',
    data,
    // 搜源可能跨多个外网站点，需长于默认 10s
    timeout: 60000,
  })
}

export function getPlaybackSession(id: string) {
  return request.get<PlaybackSessionView>({
    url: `/playback/sessions/${id}`,
  })
}

export function searchPlaybackSources(keyword: string, episodeSort: number, altKeyword?: string) {
  return request.get<PlayCandidate[]>({
    url: '/playback/search',
    params: { keyword, episodeSort, altKeyword },
    timeout: 60000,
  })
}

/** 单站点搜索（抽屉） */
export function searchOneSource(data: {
  factoryId: string
  name: string
  searchConfig: Record<string, any>
  keyword: string
  episodeSort: number
  altKeyword?: string
  subscriptionName?: string
}) {
  return request.post<PlayCandidate[]>({
    url: '/playback/search-one',
    data,
    timeout: 30000,
  })
}

export function buildPlaybackStreamUrl(sessionId: string) {
  const token = localCache.getCache('token') || ''
  const base = import.meta.env.VITE_BASE_API || '/api'
  const q = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${base}/playback/sessions/${sessionId}/stream${q}`
}
