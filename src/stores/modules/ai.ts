import { defineStore } from 'pinia'
import { track } from '@/utils/track'
import {
  AiRequestError,
  deleteAiConversation,
  listAiConversations,
  listAiMessages,
  streamAiChat,
  type IAiAnimeCard,
  type IAiConversation,
  type IAiMessage,
  type AiMessageRole,
} from '@/api/ai'

/**
 * 界面用的消息结构。
 *
 * 与后端的 `IAiMessage` 略有不同：需要 `pending` 标记正在流式输出的那条，
 * 以及 `failed` 标记出错的轮次。落库后再用真实 id 替换。
 */
export interface IAiChatMessage {
  id: string
  role: AiMessageRole
  content: string
  tool_results: IAiAnimeCard[] | null
  /** 正在流式输出中 */
  pending?: boolean
  /** 本轮失败（配额、上游不可用等），内容里是错误文案 */
  failed?: boolean
}

export const useAiStore = defineStore('ai', () => {
  const conversations = ref<IAiConversation[]>([])
  const activeId = ref<string>('')
  const messages = ref<IAiChatMessage[]>([])
  const conversationsLoading = ref(false)
  const historyLoading = ref(false)
  const streaming = ref(false)
  /** 整页级错误（配额用尽 / 上游不可用），与单轮 failed 区分 */
  const errorMsg = ref('')

  let controller: AbortController | null = null
  let tempSeq = 0

  const activeConversation = computed(
    () => conversations.value.find((c) => c.id === activeId.value) || null,
  )

  function nextTempId() {
    tempSeq += 1
    return `local-${Date.now()}-${tempSeq}`
  }

  async function fetchConversations() {
    conversationsLoading.value = true
    try {
      conversations.value = (await listAiConversations()) || []
    } catch {
      // 列表失败不阻塞对话本身，保持静默
      conversations.value = []
    } finally {
      conversationsLoading.value = false
    }
  }

  /** 打开历史会话：从服务端恢复消息与卡片 */
  async function openConversation(id: string) {
    if (streaming.value) return
    activeId.value = id
    errorMsg.value = ''
    historyLoading.value = true
    try {
      const list: IAiMessage[] = (await listAiMessages(id)) || []
      messages.value = list.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_results: m.tool_results ?? null,
      }))
    } catch (e) {
      errorMsg.value = e instanceof Error ? e.message : '加载会话失败'
      messages.value = []
    } finally {
      historyLoading.value = false
    }
  }

  function newConversation() {
    if (streaming.value) return
    activeId.value = ''
    messages.value = []
    errorMsg.value = ''
  }

  /**
   * 发一轮消息。
   *
   * 先乐观插入用户消息与一个空的 assistant 占位，再靠 SSE 回调往里追加文本，
   * 这样首字到达前界面就有反馈；失败时把占位标记为 failed 而不是留一个空气泡。
   */
  async function send(text: string) {
    const content = text.trim()
    if (!content || streaming.value) return

    errorMsg.value = ''
    messages.value.push({
      id: nextTempId(),
      role: 'user',
      content,
      tool_results: null,
    })
    const assistantIndex = messages.value.length
    messages.value.push({
      id: nextTempId(),
      role: 'assistant',
      content: '',
      tool_results: null,
      pending: true,
    })

    streaming.value = true
    controller = new AbortController()
    // 前端埋点与后端 `ai.chat` 事件是**两个视角**，都要有：
    // 后端知道 token/模型/上游耗时，前端知道「用户等了多久、看到几张卡片、是否中途放弃」。
    const startedAt = Date.now()
    track('ai.send', { length: content.length, newConversation: !activeId.value })

    try {
      const result = await streamAiChat(
        { message: content, conversationId: activeId.value || undefined },
        {
          onTextDelta: (delta) => {
            messages.value[assistantIndex].content += delta
          },
          onToolResult: ({ subjects }) => {
            if (!subjects?.length) return
            const current = messages.value[assistantIndex].tool_results || []
            messages.value[assistantIndex].tool_results = [...current, ...subjects]
          },
          onError: (message) => {
            messages.value[assistantIndex].failed = true
            messages.value[assistantIndex].content ||= message
          },
        },
        controller.signal,
      )

      const assistant = messages.value[assistantIndex]
      track('ai.done', {
        elapsedMs: Date.now() - startedAt,
        aborted: result.aborted,
        textLength: assistant.content.length,
        cardCount: assistant.tool_results?.length ?? 0,
        failed: !!assistant.failed,
      })

      if (result.conversationId && !activeId.value) {
        activeId.value = result.conversationId
        // 新建了会话，刷新列表让标题出现
        void fetchConversations()
      }
    } catch (e) {
      const message =
        e instanceof AiRequestError && e.status === 429
          ? e.message
          : e instanceof Error
          ? e.message
          : '发送失败'
      // 429 / 503 这类是整页级问题（配额、上游），用顶部提示更醒目
      if (e instanceof AiRequestError && (e.status === 429 || e.status === 503)) {
        errorMsg.value = message
        messages.value.splice(assistantIndex, 1)
        // 配额用尽与上游故障要能区分开，否则看板上「AI 不可用」无从归因
        track('ai.error', { status: e.status, message })
      } else {
        messages.value[assistantIndex].failed = true
        messages.value[assistantIndex].content ||= message
      }
    } finally {
      messages.value[assistantIndex].pending = false
      streaming.value = false
      controller = null
    }
  }

  /** 停止生成；服务端仍会保留已生成的部分并计费 */
  function stop() {
    if (!controller) return
    track('ai.stop')
    controller.abort()
    controller = null
    streaming.value = false
  }

  async function removeConversation(id: string) {
    await deleteAiConversation(id)
    track('ai.conversation.delete')
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (activeId.value === id) newConversation()
  }

  function clearError() {
    errorMsg.value = ''
  }

  return {
    conversations,
    activeId,
    messages,
    conversationsLoading,
    historyLoading,
    streaming,
    errorMsg,
    activeConversation,
    fetchConversations,
    openConversation,
    newConversation,
    send,
    stop,
    removeConversation,
    clearError,
  }
})
