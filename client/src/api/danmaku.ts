import request from '@/common/request'
import type { Danmu } from 'artplayer-plugin-danmuku'

/** 后端返回的单条弹幕（字段名与插件不同：后端用 type，插件用 mode） */
interface IDanmakuItemRaw {
  time: number
  /** 0=滚动 1=顶部 2=底部 */
  type: 0 | 1 | 2
  color: string
  text: string
}

export interface IDanmakuResult {
  matchedTitle: string
  matchedEpisode: string
  episodeId: number
  items: IDanmakuItemRaw[]
  cached: boolean
}

/**
 * 按番剧名 + 集号取弹幕，**直接返回插件可用的格式**。
 *
 * 做这层映射而不是改后端：`type` 是后端契约（已有拉取到的数据）、
 * `mode` 是 artplayer-plugin-danmuku 的字段名，两者只是命名不同，转换放边界最省事。
 */
export async function fetchDanmaku(title: string, episode: number): Promise<Danmu[]> {
  const result = await request.get<IDanmakuResult | null>({
    url: '/danmaku',
    params: { title, episode },
  })
  return (result?.items ?? []).map((item) => ({
    text: item.text,
    time: item.time,
    color: item.color,
    mode: item.type,
    // 不设 border：描边会让弹幕发脏，纯白字更贴近原版观感（插件默认就不描边）
  }))
}
