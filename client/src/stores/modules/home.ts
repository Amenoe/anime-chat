import { defineStore } from 'pinia'
import { getCalendarData, getHotAnime, getSubjectDetail, getEpisodes } from '@/api/home'
import type { IBangumiSubject, IBangumiEpisode, ICalendarItem } from '@/api/types'
import localCache from '@/utils/cache'

export const useHomeStore = defineStore('home', () => {
  const hots = ref<IBangumiSubject[]>([])
  const latest = ref<IBangumiSubject[]>([])
  const calendar = ref<ICalendarItem[]>([])

  const animeDetail = ref<IBangumiSubject | null>(null)
  const episodes = ref<IBangumiEpisode[]>([])
  const anime_id = ref<number>()

  async function homeDataAction() {
    const [calendarData, hotData] = await Promise.all([getCalendarData(), getHotAnime()])

    calendar.value = calendarData

    const today = new Date().getDay()
    const weekdayId = today === 0 ? 7 : today
    const todayAnime = calendarData.find((item) => item.weekday.id === weekdayId)
    latest.value = todayAnime?.items ?? []

    hots.value = hotData.data ?? []
  }

  const detailLoading = ref(false)

  async function detailDataAction(id: number) {
    animeDetail.value = null
    episodes.value = []
    detailLoading.value = true
    try {
      const [detail, episodeData] = await Promise.all([getSubjectDetail(id), getEpisodes(id)])
      animeDetail.value = detail
      episodes.value = (episodeData.data ?? []).filter((ep) => ep.type === 0)
      anime_id.value = id
      localCache.setCache('anime_id', id)
    } finally {
      detailLoading.value = false
    }
  }

  function loadAnimeData() {
    const _anime_id = localCache.getCache('anime_id')
    if (_anime_id) {
      anime_id.value = _anime_id
    }
  }

  return {
    hots,
    latest,
    calendar,
    animeDetail,
    episodes,
    anime_id,
    detailLoading,
    homeDataAction,
    detailDataAction,
    loadAnimeData,
  }
})
