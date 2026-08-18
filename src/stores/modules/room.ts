import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import { useLoginStore } from './login'
import type { ChatMessage } from '../types'
import type { RoomGroup } from '@/api/room'

export interface PlaybackState {
  group_id: string
  season_id: string
  status: string
  episode_id: number | null
  episode_sort: number | null
  session_id: string
  stream_url: string | null
  position: number
  paused: boolean
  title: string
  host_user_id: string
  server_time: number
  updated_at: string | null
}

export type PlaybackAction =
  | 'play'
  | 'pause'
  | 'seek'
  | 'switch_episode'
  | 'set_source'
  | 'heartbeat'

/** 放映室在线成员（头像条） */
export type OnlineMember = {
  user_id: string
  nickname: string
  avatar: string
}

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

export const useRoomStore = defineStore('room', () => {
  const loginStore = useLoginStore()

  const seasonId = ref('')
  const group = ref<RoomGroup | null>(null)
  const role = ref<'host' | 'viewer'>('viewer')
  const playbackState = ref<PlaybackState | null>(null)
  const messages = ref<ChatMessage[]>([])
  const onlineUsers = ref<OnlineMember[]>([])
  const connected = ref(false)
  const joining = ref(false)

  let socket: Socket | null = null
  let listenersBound = false
  let joinResolver: ((data: any) => void) | null = null
  let joinRejecter: ((e: Error) => void) | null = null

  function getSocket() {
    return socket
  }

  function connectSocket(userId?: string) {
    const uid = userId || loginStore.userInfo?.user_id
    if (!uid) {
      throw new Error('未登录，无法进入放映室')
    }

    if (socket) {
      const currentQuery = socket.io.opts.query as { user_id?: string } | undefined
      if (currentQuery?.user_id !== uid) {
        teardownSocket()
      }
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

    if (!socket.connected) {
      socket.connect()
    }

    return socket
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
      console.error('[room] connect_error', err?.message || err)
    })

    s.on('joinRoom', (res: { code: number; message: string; data: any }) => {
      if (res?.code === 200 && res.data) {
        joinResolver?.(res.data)
      } else {
        joinRejecter?.(new Error(res?.message || '进房失败'))
      }
      joinResolver = null
      joinRejecter = null
    })

    s.on('playback:state', (state: PlaybackState) => {
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
      resetState()
    })

    s.on('groupMessage', (res: any) => {
      if (res && typeof res === 'object' && 'code' in res) {
        if (res.code !== 200 || !res.data) return
        const msg = res.data as ChatMessage
        if (group.value && msg.group_id && msg.group_id !== group.value.group_id) return
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
        const text = res.type === 'join' ? `${name} 进入了放映室` : `${name} 离开了放映室`
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

  function appendMessage(msg: ChatMessage) {
    const exists = messages.value.some((m) => m.id === msg.id)
    if (exists) return
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
        reject(new Error('连接放映室服务器超时'))
      }, timeoutMs)
      const onOk = () => {
        window.clearTimeout(timer)
        s.off('connect_error', onErr)
        resolve()
      }
      const onErr = (err: Error) => {
        window.clearTimeout(timer)
        s.off('connect', onOk)
        reject(err || new Error('连接放映室服务器失败'))
      }
      s.once('connect', onOk)
      s.once('connect_error', onErr)
    })
  }

  async function joinRoom(opts: { seasonId: string }) {
    joining.value = true
    try {
      const s = connectSocket()
      await waitConnected(s)

      const data = await new Promise<{
        group: RoomGroup
        role: 'host' | 'viewer'
        playback_state: PlaybackState
        recent_messages: ChatMessage[]
        online_users: OnlineMember[] | string[]
      }>((resolve, reject) => {
        joinResolver = resolve
        joinRejecter = reject
        s.emit('joinRoom', { season_id: opts.seasonId })
        window.setTimeout(() => {
          if (joinResolver) {
            joinRejecter?.(new Error('进房超时'))
            joinResolver = null
            joinRejecter = null
          }
        }, 8000)
      })

      seasonId.value = opts.seasonId
      group.value = data.group
      role.value = data.role
      playbackState.value = data.playback_state
      messages.value = data.recent_messages || []
      onlineUsers.value = normalizeOnlineUsers(data.online_users)
      console.log('[src-debug] joinRoom 回包', {
        season_id: opts.seasonId,
        group_episode_sort: data.group?.episode_sort,
        group_playback_episode_sort: data.group?.playback_episode_sort,
        ps_episode_sort: data.playback_state?.episode_sort,
        ps_episode_id: data.playback_state?.episode_id,
        ps_session_id: data.playback_state?.session_id,
        ps_status: data.playback_state?.status,
      })
      return data
    } finally {
      joining.value = false
    }
  }

  async function createAndJoin(dto: {
    anime_id: number
    episode_id?: number
    episode_sort?: number
    group_name?: string
  }) {
    joining.value = true
    try {
      const s = connectSocket()
      await waitConnected(s)

      const data = await new Promise<{
        group: RoomGroup
        role: 'host' | 'viewer'
        playback_state: PlaybackState
        recent_messages: ChatMessage[]
        online_users: OnlineMember[] | string[]
      }>((resolve, reject) => {
        joinResolver = resolve
        joinRejecter = reject
        s.emit('joinRoom', { create: true, ...dto })
        window.setTimeout(() => {
          if (joinResolver) {
            joinRejecter?.(new Error('创建房间超时'))
            joinResolver = null
            joinRejecter = null
          }
        }, 8000)
      })

      seasonId.value = data.group.season_id
      group.value = data.group
      role.value = data.role
      playbackState.value = data.playback_state
      messages.value = data.recent_messages || []
      onlineUsers.value = normalizeOnlineUsers(data.online_users)
      console.log('[src-debug] createAndJoin 回包', {
        season_id: data.group.season_id,
        group_episode_sort: data.group?.episode_sort,
        group_playback_episode_sort: data.group?.playback_episode_sort,
        ps_episode_sort: data.playback_state?.episode_sort,
        ps_episode_id: data.playback_state?.episode_id,
      })
      return data
    } finally {
      joining.value = false
    }
  }

  function sendMessage(text: string) {
    const content = text.trim()
    if (!content) return false
    if (!socket?.connected) {
      ElNotification({ type: 'error', title: '未连接放映室服务器' })
      return false
    }
    if (!group.value?.group_id) {
      ElNotification({ type: 'error', title: '尚未加入放映室' })
      return false
    }
    const user = loginStore.userInfo
    if (!user?.user_id) {
      ElNotification({ type: 'error', title: '请先登录' })
      return false
    }

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

  function sendControl(
    action: PlaybackAction,
    payload?: {
      position?: number
      episode_sort?: number
      episode_id?: number
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
    if (socket?.connected) {
      socket.emit('leaveRoom')
    }
    resetState()
  }

  function resetState() {
    seasonId.value = ''
    group.value = null
    role.value = 'viewer'
    playbackState.value = null
    messages.value = []
    onlineUsers.value = []
  }

  function teardownSocket() {
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
    getSocket,
    connectSocket,
    joinRoom,
    createAndJoin,
    sendMessage,
    sendControl,
    leaveRoom,
    teardownSocket,
  }
})
