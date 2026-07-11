/**
 * Bangumi API 数据类型
 */

export interface IBangumiImages {
  large: string
  common: string
  medium: string
  small: string
  grid: string
}

export interface IBangumiRating {
  rank: number
  total: number
  count: Record<string, number>
  score: number
}

export interface IBangumiSubject {
  id: number
  type: number
  name: string
  name_cn: string
  summary: string
  date: string
  images: IBangumiImages
  eps: number
  rating: IBangumiRating
  tags: Array<{ name: string; count: number }>
  collection: {
    wish: number
    collect: number
    doing: number
    on_hold: number
    dropped: number
  }
  infobox?: Array<{ key: string; value: string | Array<{ v: string }> }>
  volumes: number
  locked: boolean
  nsfw: boolean
  platform: string
  total_episodes: number
}

export interface IBangumiEpisode {
  id: number
  type: number
  name: string
  name_cn: string
  sort: number
  ep: number
  airdate: string
  duration: string
  desc: string
  subject_id: number
}

export interface ICalendarItem {
  weekday: { en: string; cn: string; ja: string; id: number }
  items: IBangumiSubject[]
}

export interface IBangumiSearchResult {
  total: number
  limit: number
  offset: number
  data: IBangumiSubject[]
}

export interface IBangumiEpisodeResult {
  total: number
  limit: number
  offset: number
  data: IBangumiEpisode[]
}

/**
 * 用户认证相关类型（使用自建后端）
 */

export interface ILogin {
  username: string
  password: string
}

export interface IRegister {
  username: string
  nickname: string
  password: string
}

export interface ILoginData {
  user_id: string
  username: string
  token: string
}

export interface IUserInfo {
  user_id: string
  username: string
  nickname: string
  avatar: string
  role: string
  status: number
  create_time: string
}
