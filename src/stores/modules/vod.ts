import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import { useLoginStore } from './login'
import type { ChatMessage } from '../types'
import type { OnlineMember, PlaybackAction, PlaybackState } from './room'
import { createVodRoom, type RoomGroup } from '@/api/room'

function normalizeOnlineUsers(raw: unknown): OnlineMember[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { user_id: item, nickname: item, avatar: '' }
      }
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        const user_id = String(o.user_id || '')
        if (!user_id) return null
        return {
          user_id,
          nickname: String(o.nickname || '用户'),
          avatar: String(o.avatar || ''),
        }
      }
      return null
    })
    .filter(Boolean) as OnlineMember[]
}

function socketBaseUrl() {
  const serve = import.meta.env.VITE_SERVE_URL as string | undefined
  return serve && serve.length ? serve : 'http://localhost:3000'
}

/**
 * 点播室（私人房间）。
 *
 * 与放映室共用后端的 `group` / `ChatGateway`：`joinRoom` 进房、`groupMessage` 聊天、
 * `playback:state` / `playback:control` 做**播放同步**、`host:changed` 自动转让房主。
 *
 * 与放映室的差别只有：不绑番剧（`anime_id = 0`，不进详情页房间列表）、
 * 不加载弹幕、入口是邀请链接 `/vod/:seasonId`。
 *
 * 之所以单独一个 store 而不是复用 `room`：两者都是单例，放映室的状态不能被点播室覆盖。
 */
export const useVodStore = defineStore('vod', () => {
  const loginStore = useLoginStore()

  const seasonId = ref('')
  const group = ref<RoomGroup | null>(null)
  const role = ref<'host' | 'viewer'>('viewer')
  const playbackState = ref<PlaybackState | null>(null)
  const messages = ref<ChatMessage[]>([])
  const onlineUsers = ref<OnlineMember[]>([])
  const connected = ref(false)
  const joining = ref(false)
  /** 房间被销毁（最后一人离开 / 房主解散）时置真，由页面提示并跳转 */
  const roomDestroyed = ref(false)

  let socket: Socket | null = null
  let listenersBound = false
  let joinResolver: ((data: any) => void) | null = null
  let joinRejecter: ((e: Error) => void) | null = null

  function connectSocket() {
    const uid = loginStore.userInfo?.user_id
    if (!uid) throw new Error('未登录，无法进入点播室')

    if (socket) {
      const currentQuery = socket.io.opts.query as { user_id?: string } | undefined
      if (currentQuery?.user_id !== uid) teardown()
    }

    if (!socket) {
      socket = io(socketBaseUrl(), {
        query: { user_id: uid },
        autoConnect: false,
        reconnection: true,
        transports: ['websocket', 'polling'],
      })
      bindListeners(socket)
    }
    if (!socket.connected) socket.connect()
    return socket
  }

  function bindListeners(s: Socket) {
    if (listenersBound) return
    listenersBound = true

    s.on('connect', () => {
      connected.value = true
      // 断线重连后 socket 已不在房里，需要重新 join
      if (seasonId.value) void joinRoom(seasonId.value).catch(() => undefined)
    })
    s.on('disconnect', () => {
      connected.value = false
    })
    s.on('connect_error', (err) => {
      connected.value = false
      console.error('[vod] connect_error', err?.message || err)
    })

    s.on('joinRoom', (res: { code: number; message: string; data: any }) => {
      if (res?.code === 200 && res.data) {
        applyJoinPayload(res.data)
        joinResolver?.(res.data)
      } else {
        joinRejecter?.(new Error(res?.message || '进入点播室失败'))
      }
      joinResolver = null
      joinRejecter = null
    })

    s.on('playback:state', (state: PlaybackState) => {
      if (state.group_id && group.value?.group_id && state.group_id !== group.value.group_id) return
      playbackState.value = state
    })

    s.on('host:changed', (data: { season_id: string; host_user_id: string }) => {
      if (group.value) {
        group.value = { ...group.value, host_user_id: data.host_user_id }
      }
      const userId = loginStore.userInfo?.user_id
      role.value = userId && data.host_user_id === userId ? 'host' : 'viewer'
    })

    s.on('room:destroyed', () => {
      // 先清房间状态，再置标记：resetState 会把 roomDestroyed 归 false
      resetState()
      roomDestroyed.value = true
    })

    s.on('groupMessage', (res: any) => {
      if (res && typeof res === 'object' && 'code' in res) {
        if (res.code !== 200 || !res.data) return
        const msg = res.data as ChatMessage
        if (group.value?.group_id && msg.group_id && msg.group_id !== group.value.group_id) return
        appendMessage({ ...msg, pending: false })
        return
      }
      if (res && res.id && res.message) {
        appendMessage({ ...(res as ChatMessage), pending: false })
      }
    })

    s.on(
      'activeGroupUser',
      (res: { code: number; data: number; members?: OnlineMember[]; group_id?: string }) => {
        if (res?.code !== 200) return
        if (res.group_id && group.value?.group_id && res.group_id !== group.value.group_id) {
          return
        }
        if (Array.isArray(res.members)) {
          onlineUsers.value = normalizeOnlineUsers(res.members)
        }
      },
    )

    s.on(
      'roomNotice',
      (res: { type: 'join' | 'leave'; user_id: string; nickname: string; time: number }) => {
        if (!res?.type) return
        const name = res.nickname || '用户'
        const text = res.type === 'join' ? `${name} 进入了点播室` : `${name} 离开了点播室`
        appendMessage({
          id: `notice-${res.type}-${res.user_id}-${res.time || Date.now()}`,
          group_id: group.value?.group_id || '',
          user_id: res.user_id || '',
          message: text,
          message_type: 'system',
          time: res.time || Date.now(),
          nickname: name,
          pending: false,
        })
      },
    )
  }

  function applyJoinPayload(data: {
    group: RoomGroup
    role: 'host' | 'viewer'
    playback_state?: PlaybackState
    recent_messages?: ChatMessage[]
    online_users?: unknown[]
  }) {
    if (data.group) {
      group.value = data.group
      seasonId.value = data.group.season_id
    }
    role.value = data.role || 'viewer'
    if (data.playback_state) playbackState.value = data.playback_state
    if (Array.isArray(data.recent_messages)) messages.value = data.recent_messages
    if (data.online_users) onlineUsers.value = normalizeOnlineUsers(data.online_users)
  }

  function appendMessage(msg: ChatMessage) {
    if (messages.value.some((m) => m.id === msg.id)) return
    const pendingIdx = messages.value.findIndex(
      (m) =>
        m.pending &&
        m.user_id === msg.user_id &&
        m.message === msg.message &&
        Math.abs(m.time - msg.time) < 60_000,
    )
    if (pendingIdx >= 0) {
      const next = messages.value.slice()
      next[pendingIdx] = { ...msg, pending: false }
      messages.value = next
      return
    }
    messages.value = [...messages.value, msg]
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

  /** 进入某个点播室房间（邀请链接里的 seasonId） */
  async function joinRoom(id: string) {
    if (joining.value) return
    joining.value = true
    roomDestroyed.value = false
    try {
      const s = connectSocket()
      await waitConnected(s)

      await new Promise<void>((resolve, reject) => {
        joinResolver = () => resolve()
        joinRejecter = reject
        s.emit('joinRoom', { season_id: id })
        window.setTimeout(() => {
          if (joinResolver) {
            joinRejecter?.(new Error('进入点播室超时'))
            joinResolver = null
            joinRejecter = null
          }
        }, 8000)
      })
      seasonId.value = id
    } finally {
      joining.value = false
    }
  }

  /** 新建点播室并进入（房主是我） */
  async function createRoom(name?: string) {
    const room = await createVodRoom(name)
    await joinRoom(room.season_id)
    return room
  }

  function sendMessage(text: string) {
    const content = text.trim()
    if (!content) return false
    if (!socket?.connected) {
      ElNotification({ type: 'error', title: '未连接房间服务器' })
      return false
    }
    if (!group.value?.group_id) {
      ElNotification({ type: 'error', title: '尚未进入点播室' })
      return false
    }
    const user = loginStore.userInfo
    if (!user?.user_id) {
      ElNotification({ type: 'error', title: '请先登录' })
      return false
    }

    appendMessage({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      group_id: group.value.group_id,
      user_id: user.user_id,
      message: content,
      message_type: 'text',
      time: Date.now(),
      nickname: user.nickname || user.username || '我',
      avatar: user.avatar,
      pending: true,
    })
    socket.emit('groupMessage', {
      group_id: group.value.group_id,
      user_id: user.user_id,
      message: content,
      message_type: 'text',
    })
    return true
  }

  /** 播放控制（仅房主生效；后端会再校验一次 host） */
  function sendControl(
    action: PlaybackAction,
    payload?: {
      position?: number
      session_id?: string
      stream_url?: string
      title?: string
      paused?: boolean
    },
  ) {
    if (!socket?.connected || !group.value?.group_id) return false
    socket.emit('playback:control', {
      group_id: group.value.group_id,
      action,
      ...payload,
    })
    return true
  }

  function leaveRoom() {
    joinResolver = null
    joinRejecter = null
    if (socket?.connected) socket.emit('leaveRoom')
    resetState()
  }

  function resetState() {
    seasonId.value = ''
    group.value = null
    role.value = 'viewer'
    playbackState.value = null
    messages.value = []
    onlineUsers.value = []
    // 房间级标记也要清：否则「已解散」会泄漏到下一次进入的房间
    roomDestroyed.value = false
  }

  function teardown() {
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socket = null
    }
    listenersBound = false
    resetState()
    connected.value = false
  }

  return {
    seasonId,
    group,
    role,
    playbackState,
    messages,
    onlineUsers,
    connected,
    joining,
    roomDestroyed,
    createRoom,
    joinRoom,
    sendMessage,
    sendControl,
    leaveRoom,
    resetState,
    teardown,
  }
})
