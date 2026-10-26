import request from '@/common/request'

/** 与后端 DanmakuService 的返回契约一致 */
export interface IDanmakuItem {
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
  items: IDanmakuItem[]
  cached: boolean
}

/**
 * 按番剧名 + 集号取弹幕。
 *
 * 走服务端代理：dandanplay 的签名需要 AppSecret，不能下发到浏览器。
 * 查不到时后端返回 null（不是错误），前端表现为「这集没有弹幕」。
 */
export function fetchDanmaku(title: string, episode: number) {
  return request.get<IDanmakuResult | null>({
    url: '/danmaku',
    params: { title, episode },
  })
}
