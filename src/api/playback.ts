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
  playMode: 'progressive' | 'hls'
}

export type CreatePlaybackBody = {
  uri: string
  bangumiId?: number
  episodeSort?: number
  fileIndex?: number
}

export type AutoPlaybackBody = {
  keyword: string
  episodeSort: number
  bangumiId?: number
  altKeyword?: string
  fileIndex?: number
}

export type MagnetCandidate = {
  title: string
  uri: string
  source: string
  score: number
}

export function createPlaybackSession(data: CreatePlaybackBody) {
  return request.post<PlaybackSessionView>({
    url: '/playback/sessions',
    data,
  })
}

/** 按番名+集数自动搜磁力并创建会话 */
export function createAutoPlaybackSession(data: AutoPlaybackBody) {
  return request.post<PlaybackSessionView>({
    url: '/playback/sessions/auto',
    data,
  })
}

export function getPlaybackSession(id: string) {
  return request.get<PlaybackSessionView>({
    url: `/playback/sessions/${id}`,
  })
}

export function searchMagnets(keyword: string, episodeSort: number, altKeyword?: string) {
  return request.get<MagnetCandidate[]>({
    url: '/playback/magnets',
    params: { keyword, episodeSort, altKeyword },
  })
}

/** 给 <video>/Artplayer 用的可带 token 的同源流地址 */
export function buildPlaybackStreamUrl(sessionId: string) {
  const token = localCache.getCache('token') || ''
  const base = import.meta.env.VITE_BASE_API || '/api'
  const q = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${base}/playback/sessions/${sessionId}/stream${q}`
}
