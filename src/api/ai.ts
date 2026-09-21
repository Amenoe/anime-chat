import request from '@/common/request'
import localCache from '@/utils/cache'

/** 会话列表项（后端 ai_conversation） */
export interface IAiConversation {
  id: string
  user_id: string
  title: string | null
  create_time: string
  update_time: string
}

/** 番剧卡片（anime-ai 工具返回的精简条目） */
export interface IAiAnimeCard {
  id: number
  name: string
  /** 中文名；无中文名时后端已兜底为原名，可直接展示 */
  nameCn: string | null
  cover: string | null
  score: number | null
  rank: number | null
  date: string | null
  tags: string[]
  summary: string | null
}

export type AiMessageRole = 'user' | 'assistant'

/** 一条消息（后端 ai_message） */
export interface IAiMessage {
  id: string
  conversation_id: string
  role: AiMessageRole
  content: string
  /** 该轮工具返回的番剧卡片；刷新后靠它恢复卡片 */
  tool_results: IAiAnimeCard[] | null
  create_time: string
}

/**
 * SSE 事件名，与 anime-ai 的 SseEvent 一一对应。
 * 前端遇到未知事件**忽略而不报错**，这样后端加事件不会破坏旧前端。
 */
export type AiSseEventName = 'text-delta' | 'tool-call' | 'tool-result' | 'usage' | 'error' | 'done'

export interface IAiSseHandlers {
  onTextDelta?: (text: string) => void
  onToolCall?: (payload: { name: string; args: unknown }) => void
  onToolResult?: (payload: { name: string; subjects?: IAiAnimeCard[] }) => void
  onUsage?: (payload: { promptTokens?: number; completionTokens?: number }) => void
  onError?: (message: string) => void
  onDone?: (payload: { conversationId?: string; finishReason?: string }) => void
}

export interface IAiStreamResult {
  conversationId: string | null
  aborted: boolean
}

/** 会话列表，按更新时间倒序 */
export function listAiConversations() {
  return request.get<IAiConversation[]>({ url: '/ai/conversations' })
}

/** 某会话的全部消息（含卡片），用于刷新后恢复 */
export function listAiMessages(conversationId: string) {
  return request.get<IAiMessage[]>({ url: `/ai/conversations/${conversationId}/messages` })
}

export function deleteAiConversation(conversationId: string) {
  return request.delete<{ deleted: boolean }>({ url: `/ai/conversations/${conversationId}` })
}

/** 业务错误：非 2xx 时抛出，带上 HTTP 状态码供调用方区分 429 / 503 */
export class AiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'AiRequestError'
  }
}

/**
 * 发起一轮对话并消费 SSE 流。
 *
 * **刻意不用 axios**：axios 的 XHR 适配器拿不到增量响应体，
 * 浏览器里只有 `fetch` + `ReadableStream` 能真正逐块读到 token。
 *
 * 注意 POST + SSE：`EventSource` 只能 GET 且不能带 Header，所以必须用 fetch。
 * 请求头里带 Bearer token（后端 JwtStrategy 也支持 `?token=`，但 Header 更安全）。
 *
 * @param signal 用于「停止生成」：中断后服务端仍会保留已生成内容并计费
 */
export async function streamAiChat(
  params: { message: string; conversationId?: string },
  handlers: IAiSseHandlers,
  signal?: AbortSignal,
): Promise<IAiStreamResult> {
  const result: IAiStreamResult = { conversationId: params.conversationId ?? null, aborted: false }

  let response = await postChat(params, signal)

  // accessToken 只有 2h。axios 那边有静默刷新，但裸 fetch 绕过了它，
  // 所以这里自己补一次「401 → 刷新 → 重试」，否则用户聊到一半会突然报错。
  if (response.status === 401) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      response = await postChat(params, signal)
    }
  }

  if (!response.ok) {
    throw new AiRequestError(await readErrorMessage(response), response.status)
  }

  // 新建会话时后端通过响应头回传 id —— 不读它就无法继续追问
  const headerId = response.headers.get('X-Conversation-Id')
  if (headerId) {
    result.conversationId = headerId
  }

  if (!response.body) {
    throw new AiRequestError('当前浏览器不支持流式响应', 0)
  }

  const reader = response.body.getReader()
  // 中文是多字节，跨 chunk 截断时直接 toString 会出乱码；用 TextDecoder 的流式模式
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        dispatchSseBlock(block, handlers)
      }
    }
  } catch (e) {
    // 用户点「停止生成」会以 AbortError 结束，这是正常路径不是错误
    if (isAbortError(e)) {
      result.aborted = true
      return result
    }
    throw e
  } finally {
    reader.releaseLock?.()
  }

  return result
}

function postChat(
  params: { message: string; conversationId?: string },
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${import.meta.env.VITE_BASE_API}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    body: JSON.stringify({ message: params.message, conversationId: params.conversationId }),
    signal,
  })
}

/**
 * 用 refreshToken 换新 accessToken。
 *
 * 走 login store 的 refreshAction（与 axios 层同一套逻辑，store 的 ref 与 localStorage 一起更新），
 * 动态 import 避免 api ↔ store 循环依赖；并发 401 由 refreshPromise 合并成一次刷新。
 */
let refreshPromise: Promise<boolean> | null = null

function tryRefreshToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = import('@/stores/modules/login')
      .then(({ useLoginStore }) => useLoginStore().refreshAction())
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function authHeader(): Record<string, string> {
  // 用 localCache 而不是裸 localStorage：它存的是 JSON，直接 getItem 会拿到带引号的字符串
  const token = localCache.getCache('token')
  return typeof token === 'string' && token ? { Authorization: `Bearer ${token}` } : {}
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** 解析一个 SSE 块并分发给对应回调；未知事件忽略 */
function dispatchSseBlock(block: string, handlers: IAiSseHandlers) {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      // 规范允许 `data: x` 与 `data:x`，两种都要吃
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (!dataLines.length) return

  const raw = dataLines.join('\n')
  let payload: any = null
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = null
  }

  switch (event as AiSseEventName) {
    case 'text-delta':
      if (payload?.text) handlers.onTextDelta?.(String(payload.text))
      break
    case 'tool-call':
      handlers.onToolCall?.({ name: String(payload?.name ?? ''), args: payload?.args })
      break
    case 'tool-result':
      handlers.onToolResult?.({
        name: String(payload?.name ?? ''),
        subjects: Array.isArray(payload?.subjects) ? payload.subjects : undefined,
      })
      break
    case 'usage':
      handlers.onUsage?.(payload ?? {})
      break
    case 'error':
      handlers.onError?.(extractErrorMessage(payload))
      break
    case 'done':
      handlers.onDone?.({
        conversationId: payload?.conversationId,
        finishReason: payload?.finishReason,
      })
      break
    default:
      // 未知事件直接忽略，保证后端新增事件时旧前端不崩
      break
  }
}

/** 错误信封可能是 {message} 或上游原样透传的 OpenAI 错误对象字符串 */
function extractErrorMessage(payload: any): string {
  const message = payload?.message
  if (typeof message !== 'string' || !message.trim()) return 'AI 服务返回了未知错误'
  try {
    const nested = JSON.parse(message)
    const nestedMsg = nested?.error?.message
    if (typeof nestedMsg === 'string') return nestedMsg
  } catch {
    // 不是 JSON 就用原文
  }
  return message
}

/** 从后端的 `{code,message,data}` 信封里取错误文案 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.message === 'string' && body.message.trim()) return body.message
  } catch {
    // 非 JSON（如网关返回的 HTML）就退回状态码文案
  }
  return `请求失败（HTTP ${response.status}）`
}
