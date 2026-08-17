import localCache from '@/utils/cache'

/** 最近播放记录（localStorage，单设备） */
export interface PlayHistoryItem {
  bangumiId: number
  title: string
  cover: string
  episodeSort: number | null
  /** 集标题（可选，如「第 3 话 · 标题」） */
  episodeName?: string
  /** 最近播放时间戳（ms） */
  time: number
}

const HISTORY_KEY = 'playHistory'
const HISTORY_MAX = 20

export function getPlayHistory(): PlayHistoryItem[] {
  const raw = localCache.getCache(HISTORY_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((item) => item && typeof item.bangumiId === 'number').slice(0, HISTORY_MAX)
}

/** 记录一次播放：同番剧去重（保留最新集），新记录置顶，上限 20 条 */
export function addPlayHistory(item: PlayHistoryItem): PlayHistoryItem[] {
  if (!item || typeof item.bangumiId !== 'number') return getPlayHistory()
  const rest = getPlayHistory().filter((it) => it.bangumiId !== item.bangumiId)
  const next = [
    {
      bangumiId: item.bangumiId,
      title: item.title || `番剧 #${item.bangumiId}`,
      cover: item.cover || '',
      episodeSort: item.episodeSort ?? null,
      episodeName: item.episodeName,
      time: item.time || Date.now(),
    },
    ...rest,
  ].slice(0, HISTORY_MAX)
  localCache.setCache(HISTORY_KEY, next)
  return next
}
