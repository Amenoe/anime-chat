import type { PlayCandidate } from '@/api/playback'

/** 从线路/标题文本中解析清晰度标记（源站不提供独立字段） */
export function extractQuality(...texts: (string | undefined)[]): string {
  const text = texts.filter(Boolean).join(' ')
  if (!text) return ''
  const m = /(蓝光|4K|2160P?|1080P?|超清|720P?|高清|480P?|标清|原盘|杜比|HDR)/i.exec(text)
  if (!m) return ''
  const raw = m[1].toUpperCase()
  // 数字分辨率统一补 P
  if (/^\d+$/.test(raw)) return `${raw}P`
  if (/^\d+P$/.test(raw)) return raw
  return m[1]
}

export function qualityOf(c: PlayCandidate): string {
  return extractQuality(c.channel, c.title, c.uri)
}
