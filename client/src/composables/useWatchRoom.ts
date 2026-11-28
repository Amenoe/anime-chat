import { createRoom, listRooms, type RoomGroup } from '@/api/room'
import { appConfirm } from '@/composables/useConfirm'
import { useLoginStore } from '@/stores/modules/login'

export interface EnterOrCreateRoomOptions {
  animeId: number
  title: string
  cover?: string | null
  episodeId?: number
  episodeSort?: number
  /** 为 true 时若暂无活跃放映室则跳过二次确认直接新建并跳转（如 AI 卡片「一起看」） */
  directCreate?: boolean
}

export interface EnterOrCreateRoomResult {
  mode: 'join' | 'create'
  room: RoomGroup
}

/**
 * 统一的「进入或新建放映室」交互逻辑：
 * 详情页、AI 推荐卡片、我的追番卡片共用同一套防重复建房与提示流程。
 */
export function useWatchRoom() {
  const router = useRouter()
  const loginStore = useLoginStore()
  const roomLoading = ref(false)

  async function enterOrCreateRoom(
    opts: EnterOrCreateRoomOptions,
  ): Promise<EnterOrCreateRoomResult | null> {
    if (!loginStore.token) {
      loginStore.requestLogin()
      ElNotification({ type: 'error', message: '您还没有登录' })
      return null
    }
    if (roomLoading.value) return null
    roomLoading.value = true

    try {
      const allRooms = await listRooms({ anime_id: opts.animeId })
      const rooms = allRooms.filter((r) => r.season_id)

      if (rooms.length > 0) {
        const room = rooms[0]
        const epInfo = room.playback_episode_sort ? ` · 当前第${room.playback_episode_sort}话` : ''
        const ok = await appConfirm({
          title: '已有放映室',
          message: `${room.group_name}${epInfo}\n是否进入？`,
          confirmText: '进入',
          cancelText: '取消',
        })
        if (!ok) return null
        await router.push(`/room/${room.season_id}`)
        return { mode: 'join', room }
      }

      const displayTitle = opts.title?.trim() || `番剧 #${opts.animeId}`
      const label = opts.episodeSort != null ? ` 第${opts.episodeSort}话` : ''

      if (!opts.directCreate) {
        const ok = await appConfirm({
          title: '创建放映室',
          message: `是否为「${displayTitle}${label}」创建放映室？`,
          confirmText: '创建',
          cancelText: '取消',
        })
        if (!ok) return null
      }

      const cleanCover = opts.cover?.trim()
      const room = await createRoom({
        anime_id: opts.animeId,
        episode_id: opts.episodeId,
        episode_sort: opts.episodeSort,
        group_name: `${displayTitle}${label}`,
        cover: cleanCover ? cleanCover.slice(0, 512) : undefined,
      })
      await router.push(`/room/${room.season_id}`)
      return { mode: 'create', room }
    } catch (err: any) {
      ElNotification({
        type: 'error',
        title: '进入放映室失败',
        message: err?.message || '请稍后重试',
      })
      return null
    } finally {
      roomLoading.value = false
    }
  }

  return {
    roomLoading,
    enterOrCreateRoom,
  }
}
