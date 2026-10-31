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
  /** true = mkv/HEVC 等，需要服务端 ffmpeg 转封装后再播 */
  remuxRequired?: boolean
}

export type CreatePlaybackBody = {
  uri: string
  bangumiId?: number
  episodeSort?: number
  fileIndex?: number
  groupId?: string
}

export type StreamPlaybackBody = {
  streamUrl: string
  title?: string
  headers?: Record<string, string>
  bangumiId?: number
  episodeSort?: number
  groupId?: string
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
  channel?: string
  /** 是否已是 m3u8/mp4；false 表示剧集播放页，点播放时后端再解析 */
  resolved?: boolean
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

export type SubtitleTrackView = {
  /** 全局 stream index，取字幕时原样带回 */
  index: number
  label: string
  language?: string
  codec?: string
}

/** 当前会话的内嵌字幕轨（外挂字幕文件目前不下载） */
export function getSessionSubtitles(sessionId: string) {
  return request.get<SubtitleTrackView[]>({
    url: `/playback/sessions/${sessionId}/subtitles`,
  })
}

/** `<track>` 无法带 Authorization 头，字幕地址和 stream 一样走 ?token= */
export function buildSubtitleUrl(sessionId: string, trackIndex: number) {
  const token = localCache.getCache('token') || ''
  const base = import.meta.env.VITE_BASE_API || '/api'
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  const q = params.toString()
  return `${base}/playback/sessions/${sessionId}/subtitle/${trackIndex}.vtt${q ? `?${q}` : ''}`
}

/**
 * mkv/HEVC 的 HLS 播放列表地址。
 *
 * 与 `stream` 的区别：m3u8 里带全部 EXTINF + ENDLIST，播放器能算出**真实总时长**
 * 并支持拖动进度（拖动时只请求对应分片，服务端按需转码）。
 */
export function buildHlsPlaylistUrl(sessionId: string) {
  const token = localCache.getCache('token') || ''
  const base = import.meta.env.VITE_BASE_API || '/api'
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  const q = params.toString()
  return `${base}/playback/sessions/${sessionId}/hls.m3u8${q ? `?${q}` : ''}`
}

/**
 * 播放器拉流 URL。
 * - token：video/hls 无法自定义 Authorization
 * - type=m3u8：仅流媒体/HLS 会话需要（代理 path 不含 .m3u8，靠 query 触发 hls.js）
 *   BT progressive 不要带 type=m3u8
 */
export function buildPlaybackStreamUrl(
  sessionId: string,
  opts?: { hls?: boolean; remux?: boolean },
) {
  const token = localCache.getCache('token') || ''
  const base = import.meta.env.VITE_BASE_API || '/api'
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  if (opts?.hls) params.set('type', 'm3u8')
  // mkv / HEVC：让服务端走 ffmpeg 转封装（fMP4）
  if (opts?.remux) params.set('format', 'fmp4')
  const q = params.toString()
  return `${base}/playback/sessions/${sessionId}/stream${q ? `?${q}` : ''}`
}
