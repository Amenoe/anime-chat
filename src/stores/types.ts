import type * as apiType from '@/api/types'

export type { apiType }

/** 聊天/放映室消息模型（服务端 groupMessage 视图） */
export interface ChatMessage {
  id: string
  group_id: string
  user_id: string
  message: string
  message_type: string
  time: number
  nickname: string
  avatar?: string
  /** 本地乐观消息，尚未被服务端确认 */
  pending?: boolean
}
