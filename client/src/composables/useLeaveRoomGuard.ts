import { useRoomStore } from '@/stores/modules/room'
import { appConfirm } from './useConfirm'

/**
 * 放映室离开守卫：仅在放映室页面且已成功进房时拦截，
 * 弹窗二次确认后放行。其它页面直接放行。
 */
export function useLeaveRoomGuard() {
  const route = useRoute()
  const roomStore = useRoomStore()

  async function guardLeaveRoom(): Promise<boolean> {
    if (route.name !== 'Room' || !roomStore.group) return true
    return appConfirm({
      title: '离开放映室',
      message: '确定要离开放映室吗？离开后需重新进入。',
      confirmText: '离开',
      cancelText: '留下',
    })
  }

  return { guardLeaveRoom }
}
