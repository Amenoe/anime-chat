import request from '@/common/request'

/**
 * 管理看板接口。
 *
 * 全部为**全站聚合**数据，后端要求 `role === 'root'`（见 `TrackController.assertRoot`）。
 * 普通用户即使拿到这些 URL 也只会得到 403 —— 前端隐藏入口是体验，不是安全边界。
 */

/** 埋点总览 */
export interface ITrackOverview {
  total_events: number
  users: number
  event_types: number
  today_events: number
}

/** 事件量排行的一项 */
export interface ITrackTopEvent {
  event: string
  count: number
  users: number
}

/** 埋点按天趋势的一项 */
export interface ITrackDaily {
  day: string
  events: number
  users: number
  anonymous: number
}

/** AI 用量总览（**全时段**，不走 days 参数） */
export interface IAiOverview {
  total_requests: number
  ok_requests: number
  error_requests: number
  aborted_requests: number
  prompt_tokens: number
  completion_tokens: number
  tool_calls: number
  users: number
  avg_latency_ms: number
  avg_first_token_ms: number
  today_requests: number
}

/** AI 按天趋势的一项 */
export interface IAiDaily {
  day: string
  requests: number
  users: number
  prompt_tokens: number
  completion_tokens: number
  tool_calls: number
  avg_latency_ms: number
}

/** 工具使用分布的一项；`tools` 是**组合**字符串，如 `browse_anime,search_anime` */
export interface IAiToolStat {
  tools: string
  requests: number
  calls: number
}

/**
 * 用量 TOP 用户。
 * `username`/`nickname` 由后端 LEFT JOIN `user` 带出；
 * 匿名埋点（`user_id` 为空）或用户已注销时会是 `null`。
 */
export interface IAiTopUser {
  user_id: string | null
  username: string | null
  nickname: string | null
  requests: number
  tokens: number
}

export function getTrackOverview(days: number) {
  return request.get<ITrackOverview>({ url: '/track/stats/overview', params: { days } })
}

export function getTrackTopEvents(days: number, limit = 12) {
  return request.get<ITrackTopEvent[]>({
    url: '/track/stats/top-events',
    params: { days, limit },
  })
}

export function getTrackDaily(days: number) {
  return request.get<ITrackDaily[]>({ url: '/track/stats/daily', params: { days } })
}

export function getAiOverview() {
  return request.get<IAiOverview>({ url: '/ai/stats/overview' })
}

export function getAiDaily(days: number) {
  return request.get<IAiDaily[]>({ url: '/ai/stats/daily', params: { days } })
}

export function getAiTools(days: number) {
  return request.get<IAiToolStat[]>({ url: '/ai/stats/tools', params: { days } })
}

export function getAiTopUsers(days: number, limit = 10) {
  return request.get<IAiTopUser[]>({
    url: '/ai/stats/top-users',
    params: { days, limit },
  })
}
