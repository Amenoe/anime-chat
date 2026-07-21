import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import { useLoginStore } from './login'
import { useHomeStore } from './home'

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

export interface ChatGroup {
  group_id: string
  anime_id: number
  group_name: string
  notice?: string
  create_time?: string
}

function socketBaseUrl() {
  const serve = import.meta.env.VITE_SERVE_URL as string | undefined
  return serve && serve.length ? serve : 'http://localhost:3000'
}

export const useChatStore = defineStore('chat', () => {
  const loginStore = useLoginStore()
  const homeStore = useHomeStore()

  const messageList = ref<ChatMessage[]>([])
  const group = ref<ChatGroup | null>(null)
  const activeUser = ref(0)
  const connected = ref(false)
  const joining = ref(false)

  let socket: Socket | null = null
  let listenersBound = false
  /** 等待 addGroup 回包 */
  let joinResolver: ((g: ChatGroup) => void) | null = null
  let joinRejecter: ((e: Error) => void) | null = null

  function getSocket() {
    return socket
  }

  function ensureSocket() {
    const userId = loginStore.userInfo?.user_id
    if (!userId) {
      throw new Error('未登录，无法进入聊天室')
    }

    if (socket) {
      const currentQuery = socket.io.opts.query as { user_id?: string } | undefined
      if (currentQuery?.user_id !== userId) {
        teardownSocket()
      }
    }

    if (!socket) {
      socket = io(socketBaseUrl(), {
        query: { user_id: userId },
        autoConnect: false,
        reconnection: true,
        transports: ['websocket', 'polling'],
      })
      bindListeners(socket)
    }
    return socket
  }

  function appendMessage(msg: ChatMessage) {
    const exists = messageList.value.some((m) => m.id === msg.id)
    if (exists) return
    // 用同内容 pending 消息替换
    const pendingIdx = messageList.value.findIndex(
      (m) =>
        m.pending &&
        m.user_id === msg.user_id &&
        m.message === msg.message &&
        Math.abs(m.time - msg.time) < 60_000,
    )
    if (pendingIdx >= 0) {
      const next = messageList.value.slice()
      next[pendingIdx] = { ...msg, pending: false }
      messageList.value = next
      return
    }
    messageList.value = [...messageList.value, msg]
  }

  function bindListeners(s: Socket) {
    if (listenersBound) return
    listenersBound = true

    s.on('connect', () => {
      connected.value = true
    })

    s.on('disconnect', () => {
      connected.value = false
    })

    s.on('connect_error', (err) => {
      connected.value = false
      console.error('[chat] connect_error', err?.message || err)
    })

    s.on('addGroup', (res: ChatGroup | { code: number; message: string; data: null }) => {
      if (res && typeof res === 'object' && 'group_id' in res && res.group_id) {
        group.value = res as ChatGroup
        joinResolver?.(res as ChatGroup)
      } else {
        const err = new Error((res as { message?: string })?.message || '加入聊天室失败')
        joinRejecter?.(err)
      }
      joinResolver = null
      joinRejecter = null
    })

    s.on('chatData', (res: ChatMessage[] | string) => {
      if (Array.isArray(res)) {
        messageList.value = res.map((m) => ({ ...m, pending: false }))
      } else {
        messageList.value = []
      }
    })

    s.on('groupMessage', (res: any) => {
      // 兼容 {code,data} 或直接消息体
      if (res && typeof res === 'object' && 'code' in res) {
        if (res.code !== 200 || !res.data) {
          ElNotification({
            type: 'error',
            title: '发送失败',
            message: res.message || '消息未被服务器接受',
          })
          return
        }
        const msg = res.data as ChatMessage
        if (group.value && msg.group_id && msg.group_id !== group.value.group_id) {
          return
        }
        appendMessage({ ...msg, pending: false })
        return
      }
      if (res && res.id && res.message) {
        appendMessage({ ...(res as ChatMessage), pending: false })
      }
    })

    s.on('activeGroupUser', (res: { code: number; data: number; group_id?: string }) => {
      if (res?.code !== 200) return
      if (res.group_id && group.value && res.group_id !== group.value.group_id) {
        return
      }
      activeUser.value = Number(res.data) || 0
    })
  }

  function waitConnected(s: Socket, timeoutMs = 8000): Promise<void> {
    if (s.connected) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        s.off('connect', onOk)
        s.off('connect_error', onErr)
        reject(new Error('连接聊天服务器超时'))
      }, timeoutMs)
      const onOk = () => {
        window.clearTimeout(timer)
        s.off('connect_error', onErr)
        resolve()
      }
      const onErr = (err: Error) => {
        window.clearTimeout(timer)
        s.off('connect', onOk)
        reject(err || new Error('连接聊天服务器失败'))
      }
      s.once('connect', onOk)
      s.once('connect_error', onErr)
    })
  }

  /**
   * 进入番剧聊天室：连接 → 加入/创建房间 → 拉历史
   */
  async function enterChat(animeId?: number, groupName?: string) {
    const id = animeId ?? homeStore.anime_id
    if (!id) {
      throw new Error('缺少番剧 id，请从详情页进入聊天室')
    }

    joining.value = true
    try {
      const s = ensureSocket()
      if (!s.connected) {
        s.connect()
        await waitConnected(s)
      }

      const title =
        groupName || homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || undefined

      const joined = await new Promise<ChatGroup>((resolve, reject) => {
        joinResolver = resolve
        joinRejecter = reject
        s.emit('addGroup', { anime_id: id, group_name: title })
        window.setTimeout(() => {
          if (joinResolver) {
            joinRejecter?.(new Error('加入聊天室超时'))
            joinResolver = null
            joinRejecter = null
          }
        }, 8000)
      })

      group.value = joined
      messageList.value = []
      s.emit('chatData', joined.group_id)
      return joined
    } finally {
      joining.value = false
    }
  }

  function sendMessage(text: string) {
    const content = text.trim()
    if (!content) return false
    if (!socket?.connected) {
      ElNotification({ type: 'error', title: '未连接聊天服务器' })
      return false
    }
    if (!group.value?.group_id) {
      ElNotification({ type: 'error', title: '尚未加入聊天室' })
      return false
    }
    const user = loginStore.userInfo
    if (!user?.user_id) {
      ElNotification({ type: 'error', title: '请先登录' })
      return false
    }

    // 乐观更新：先上屏，服务端确认后替换
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: ChatMessage = {
      id: tempId,
      group_id: group.value.group_id,
      user_id: user.user_id,
      message: content,
      message_type: 'text',
      time: Date.now(),
      nickname: user.nickname || user.username || '我',
      avatar: user.avatar,
      pending: true,
    }
    appendMessage(optimistic)

    socket.emit('groupMessage', {
      group_id: group.value.group_id,
      user_id: user.user_id,
      message: content,
      message_type: 'text',
    })
    return true
  }

  function leaveChat() {
    joinResolver = null
    joinRejecter = null
    if (socket) {
      socket.disconnect()
    }
    messageList.value = []
    group.value = null
    activeUser.value = 0
    connected.value = false
  }

  function teardownSocket() {
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socket = null
    }
    listenersBound = false
  }

  async function connectSocketAction() {
    return enterChat()
  }

  async function chatMessageAction() {
    if (group.value?.group_id && socket?.connected) {
      socket.emit('chatData', group.value.group_id)
    }
  }

  return {
    messageList,
    group,
    activeUser,
    connected,
    joining,
    getSocket,
    enterChat,
    sendMessage,
    leaveChat,
    connectSocketAction,
    chatMessageAction,
  }
})
