import { defineStore } from 'pinia'
import { getCalendarData, getHotAnime, getSubjectDetail, getEpisodes } from '@/api/home'
import type { IBangumiSubject, IBangumiEpisode, ICalendarItem } from '@/api/types'
import localCache from '@/utils/cache'

export const useHomeStore = defineStore('home', () => {
  const hots = ref<IBangumiSubject[]>([])
  const latest = ref<IBangumiSubject[]>([])
  const calendar = ref<ICalendarItem[]>([])
  /**
   * 两个首页接口分别结算，loading 也分开：
   * 骨架屏按区块显示，等最慢的那个会让快的区块陪跑。
   */
  const hotsLoading = ref(false)
  const calendarLoading = ref(false)

  const animeDetail = ref<IBangumiSubject | null>(null)
  const episodes = ref<IBangumiEpisode[]>([])
  const anime_id = ref<number>()

  async function homeDataAction() {
    // 两个接口各自完成就渲染，互不阻塞：
    // 反代链路上「热门推荐」（POST 搜索、无法缓存）通常比「每日放送」（GET、可缓存）慢，
    // 用 Promise.all 等最慢的那个会让整屏空白到几十秒。
    hotsLoading.value = true
    calendarLoading.value = true

    const calendarTask = getCalendarData()
      .then((calendarData) => {
        calendar.value = calendarData

        const today = new Date().getDay()
        const weekdayId = today === 0 ? 7 : today
        const todayAnime = calendarData.find((item) => item.weekday.id === weekdayId)
        latest.value = todayAnime?.items ?? []
      })
      .catch(() => undefined)
      .finally(() => {
        calendarLoading.value = false
      })

    const hotTask = getHotAnime()
      .then((hotData) => {
        hots.value = hotData.data ?? []
      })
      .catch(() => undefined)
      .finally(() => {
        hotsLoading.value = false
      })

    // 只等待完成，不因单个失败影响另一个
    await Promise.allSettled([calendarTask, hotTask])
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
    hotsLoading,
    calendarLoading,
    animeDetail,
    episodes,
    anime_id,
    detailLoading,
    homeDataAction,
    detailDataAction,
    loadAnimeData,
  }
})
