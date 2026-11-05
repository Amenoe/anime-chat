import { useRoomStore } from '@/stores/modules/room'
import { useVodStore } from '@/stores/modules/vod'
import { appConfirm } from './useConfirm'

/**
 * 房间离开守卫：放映室与点播室共用。
 *
 * 只在对应房间页且已成功进房时拦截，弹窗二次确认后放行；其它页面直接放行。
 * 点播室的房主离开会直接解散房间（后端 `room:destroyed`），所以文案要说得更重。
 */
export function useLeaveRoomGuard() {
  const route = useRoute()
  const roomStore = useRoomStore()
  const vodStore = useVodStore()

  async function guardLeaveRoom(): Promise<boolean> {
    if (route.name === 'Room') {
      if (!roomStore.group) return true
      return appConfirm({
        title: '离开放映室',
        message: '确定要离开放映室吗？离开后需重新进入。',
        confirmText: '离开',
        cancelText: '留下',
      })
    }

    if (route.name === 'VodRoom') {
      if (!vodStore.group) return true
      const isHost = vodStore.role === 'host'
      return appConfirm({
        title: '离开点播室',
        message: isHost
          ? '你是房主，离开后房间会立即解散，其他成员也会被请出。'
          : '确定要离开点播室吗？离开后需通过邀请链接重新进入。',
        confirmText: '离开',
        cancelText: '留下',
        type: isHost ? 'danger' : 'primary',
      })
    }

    return true
  }

  return { guardLeaveRoom }
}
