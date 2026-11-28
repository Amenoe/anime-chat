import { defineStore } from 'pinia'
import type { IUserAnime, UserAnimeStatus } from '@/api/types'
import { getUserAnime, listUserAnime, removeUserAnime, upsertUserAnime } from '@/api/user-anime'
import { useLoginStore } from './login'

const STATUS_LABEL: Record<UserAnimeStatus, string> = {
  wish: '想看',
  watching: '在看',
  done: '看完',
}

export const useUserAnimeStore = defineStore('userAnime', () => {
  const loginStore = useLoginStore()
  const list = ref<IUserAnime[]>([])
  const loading = ref(false)
  /** 详情页/放映室当前番的追番记录 */
  const current = ref<IUserAnime | null>(null)
  /** 全量追番索引（按 bangumi_id）：独立于 User.vue 的按状态 list，供 AI 卡片等全局读状态 */
  const itemsById = ref<Record<number, IUserAnime>>({})
  const indexLoaded = ref(false)
  let indexPromise: Promise<void> | null = null

  function syncRow(row: IUserAnime) {
    itemsById.value = { ...itemsById.value, [row.bangumi_id]: row }
    if (current.value?.bangumi_id === row.bangumi_id) {
      current.value = row
    }
    const idx = list.value.findIndex((i) => i.bangumi_id === row.bangumi_id)
    if (idx >= 0) {
      list.value[idx] = row
    }
  }

  async function ensureStatusIndex(force = false) {
    if (!loginStore.token) return
    if (indexLoaded.value && !force) return
    if (indexPromise) return indexPromise
    indexPromise = (async () => {
      try {
        const rows = (await listUserAnime()) || []
        const map: Record<number, IUserAnime> = {}
        for (const r of rows) {
          map[r.bangumi_id] = r
        }
        itemsById.value = map
        indexLoaded.value = true
      } finally {
        indexPromise = null
      }
    })()
    return indexPromise
  }

  function statusOf(bangumiId: number): UserAnimeStatus | null {
    return itemsById.value[bangumiId]?.status ?? null
  }

  async function fetchList(status?: UserAnimeStatus) {
    loading.value = true
    try {
      const rows = (await listUserAnime(status)) || []
      list.value = rows
      if (!status) {
        const map: Record<number, IUserAnime> = {}
        for (const r of rows) map[r.bangumi_id] = r
        itemsById.value = map
        indexLoaded.value = true
      } else {
        const next = { ...itemsById.value }
        for (const r of rows) next[r.bangumi_id] = r
        itemsById.value = next
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(bangumiId: number) {
    const row = (await getUserAnime(bangumiId)) || null
    current.value = row
    if (row) {
      itemsById.value = { ...itemsById.value, [bangumiId]: row }
    } else if (bangumiId in itemsById.value) {
      const next = { ...itemsById.value }
      delete next[bangumiId]
      itemsById.value = next
    }
    return current.value
  }

  async function setStatus(payload: {
    bangumi_id: number
    status: UserAnimeStatus
    title?: string
    name_cn?: string
    cover?: string
    /** 总集数：追番时从详情带上，供追番页显示进度 */
    total_episodes?: number
    watched_episode?: number
  }) {
    const row = await upsertUserAnime(payload)
    current.value = row
    itemsById.value = { ...itemsById.value, [payload.bangumi_id]: row }
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
    if (bangumiId in itemsById.value) {
      const next = { ...itemsById.value }
      delete next[bangumiId]
      itemsById.value = next
    }
    list.value = list.value.filter((i) => i.bangumi_id !== bangumiId)
  }

  function labelOf(status: UserAnimeStatus) {
    return STATUS_LABEL[status]
  }

  // 登出后清掉追番缓存，避免切号看到上一位用户的追番状态
  watch(
    () => loginStore.token,
    (token) => {
      if (!token) {
        list.value = []
        current.value = null
        itemsById.value = {}
        indexLoaded.value = false
      }
    },
  )

  return {
    list,
    loading,
    current,
    itemsById,
    indexLoaded,
    ensureStatusIndex,
    statusOf,
    syncRow,
    fetchList,
    fetchOne,
    setStatus,
    cancel,
    labelOf,
  }
})
