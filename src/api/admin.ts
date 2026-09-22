import request from '@/common/request'

/**
 * 管理端接口（数据看板 + 用户管理）。
 *
 * 后端一律要求 `role === 'root'`（`@UseGuards(AuthGuard('jwt'), RootGuard)`）。
 * 普通用户即使拿到这些 URL 也只会得到 403 —— 前端隐藏入口是体验，不是安全边界。
 *
 * 响应信封（`{ data, code, message }`）已由 `common/request` 的拦截器解包，
 * 所以下面这些函数拿到的**直接是业务数据**；出错时 reject 且拦截器已经弹过提示，
 * 调用方**不要再弹一次**，但必须处理 loading 与「操作后刷新」。
 */

/** 埋点总览 */
export interface ITrackOverview {
  total_events: number
  users: number
  event_types: number
  today_events: number
}

/** 事件量排行的一项。`page` 由后端按 (event, page) 分组带出 */
export interface ITrackTopEvent {
  event: string
  page: string | null
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

/**
 * AI 助手的**访问量 / 消耗 / 使用率**（看板核心指标）。
 *
 * 口径由后端统一定义（`AiService.statsEngagement`），前端只负责展示 ——
 * 尤其 `ai_rate` 是跨功能口径，散在前端拼装迟早会和别处对不上。
 */
export interface IAiEngagement {
  // 访问量
  page_views: number
  page_users: number
  chat_requests: number
  chat_users: number
  // 消耗
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  /** 单次对话平均 token */
  tokens_per_request: number
  // 推荐转化
  card_clicks: number
  /** 卡片点击 / 对话次数（%），一轮可能返回多张卡，**可能大于 100** */
  card_click_rate: number
  // 与手动搜索对比
  search_count: number
  search_users: number
  search_card_clicks: number
  search_card_click_rate: number
  /** AI 对话次数 /（AI + 手动搜索次数）（%），即「找番方式里 AI 占多少」 */
  ai_rate: number
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

export function getAiEngagement(days: number) {
  return request.get<IAiEngagement>({ url: '/ai/stats/engagement', params: { days } })
}

export function getAiDaily(days: number) {
  return request.get<IAiDaily[]>({ url: '/ai/stats/daily', params: { days } })
}

export function getAiTopUsers(days: number, limit = 10) {
  return request.get<IAiTopUser[]>({
    url: '/ai/stats/top-users',
    params: { days, limit },
  })
}

// ── 用户管理（`/api/admin/users`）────────────────────────────────
//
// 后端对这些接口有**显式的字段白名单**，`password` 等敏感列不会出现在响应里，
// 所以下面这个 `IAdminUser` 就是全部字段（不要照着 user 实体去补字段）。

/** 角色取值，与后端 `USER_ROLES` 一致 */
export type AdminUserRole = 'root' | 'user'

/** 用户对象（无 password） */
export interface IAdminUser {
  user_id: string
  username: string
  nickname: string
  avatar: string
  role: AdminUserRole
  /** ⚠️ **在线状态**（0/1），不是封禁状态 —— 封禁看 `disabled_at` */
  status: number
  /** 非空即已封禁 */
  disabled_at: string | null
  /** 封禁原因，展示给被封的人 */
  disabled_reason: string | null
  create_time: string
}

/** 列表筛选条件。空值不传（axios 会丢掉 `undefined`，但 `false` 会保留） */
export interface IAdminUserQuery {
  keyword?: string
  role?: AdminUserRole
  /** `true` 只看已封禁 / `false` 只看正常 */
  disabled?: boolean
  page?: number
  size?: number
}

export interface IAdminUserList {
  items: IAdminUser[]
  total: number
  page: number
  size: number
}

/** 该用户的数据规模，用于删号前把「不可恢复」变成具体数字 */
export interface IAdminUserStats {
  conversations: number
  messages: number
  events: number
  animes: number
}

export interface IAdminUserDetail {
  user: IAdminUser
  stats: IAdminUserStats
}

/** 审计记录。`detail` 只记「改了哪个字段、从什么变成什么」，不含密码/令牌 */
export interface IAdminAuditLog {
  id: string
  actor_user_id: string
  /** 操作者用户名**快照**（本人被删号后仍能读出是谁干的） */
  actor_username: string
  /** 固定取值之一：`user.ban` / `user.role` / `user.password` / `user.delete` / … */
  action: string
  target_type: string
  target_id: string
  detail: Record<string, unknown> | null
  ip: string
  user_agent: string
  create_time: string
}

/** 删号结果。`counts` 的键是表名（`ai_message` / `user_anime` / …） */
export interface IAdminDeleteResult {
  deleted: boolean
  counts: Record<string, number>
}

export function listAdminUsers(params: IAdminUserQuery) {
  return request.get<IAdminUserList>({ url: '/admin/users', params })
}

export function getAdminUserDetail(id: string) {
  return request.get<IAdminUserDetail>({ url: `/admin/users/${id}` })
}

/** 封禁 / 解封。解封时 `reason` 会被后端忽略 */
export function setAdminUserBanned(id: string, banned: boolean, reason?: string) {
  return request.patch<IAdminUserDetail>({
    url: `/admin/users/${id}/ban`,
    data: { banned, ...(reason ? { reason } : {}) },
  })
}

export function setAdminUserRole(id: string, role: AdminUserRole) {
  return request.patch<IAdminUserDetail>({
    url: `/admin/users/${id}/role`,
    data: { role },
  })
}

/** 重置密码。后端会 hash 并**吊销该用户全部会话**（所有设备强制登出） */
export function resetAdminUserPassword(id: string, newPassword: string) {
  return request.post<{ reset: boolean }>({
    url: `/admin/users/${id}/password`,
    data: { newPassword },
  })
}

export function deleteAdminUser(id: string) {
  return request.delete<IAdminDeleteResult>({ url: `/admin/users/${id}` })
}

/** 审计记录，倒序 */
export function getAdminAuditLogs(limit = 30) {
  return request.get<IAdminAuditLog[]>({
    url: '/admin/users/audit',
    params: { limit },
  })
}
