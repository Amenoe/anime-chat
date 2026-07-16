import { defineStore } from 'pinia'
import type { IUserAnime, UserAnimeStatus } from '@/api/types'
import {
  getUserAnime,
  listUserAnime,
  removeUserAnime,
  upsertUserAnime,
} from '@/api/user-anime'

const STATUS_LABEL: Record<UserAnimeStatus, string> = {
  wish: '想看',
  watching: '在看',
  done: '看完',
}

export const useUserAnimeStore = defineStore('userAnime', () => {
  const list = ref<IUserAnime[]>([])
  const loading = ref(false)
  /** 详情页当前番的追番记录 */
  const current = ref<IUserAnime | null>(null)

  async function fetchList(status?: UserAnimeStatus) {
    loading.value = true
    try {
      list.value = (await listUserAnime(status)) || []
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(bangumiId: number) {
    current.value = (await getUserAnime(bangumiId)) || null
    return current.value
  }

  async function setStatus(
    payload: {
      bangumi_id: number
      status: UserAnimeStatus
      title?: string
      name_cn?: string
      cover?: string
    },
  ) {
    const row = await upsertUserAnime(payload)
    current.value = row
    // 同步列表中的同 id
    const idx = list.value.findIndex((i) => i.bangumi_id === payload.bangumi_id)
    if (idx >= 0) {
      list.value[idx] = row
    } else {
      list.value.unshift(row)
    }
    return row
  }

  async function cancel(bangumiId: number) {
    await removeUserAnime(bangumiId)
    if (current.value?.bangumi_id === bangumiId) {
      current.value = null
    }
    list.value = list.value.filter((i) => i.bangumi_id !== bangumiId)
  }

  function labelOf(status: UserAnimeStatus) {
    return STATUS_LABEL[status]
  }

  return {
    list,
    loading,
    current,
    fetchList,
    fetchOne,
    setStatus,
    cancel,
    labelOf,
  }
})
