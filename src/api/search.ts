import bangumiRequest from '@/common/request/bangumi'
import type { IBangumiSearchResult } from './types'

/** Bangumi 官方 sort：match / heat / rank / score（无 date） */
export type BangumiSearchSort = 'match' | 'heat' | 'rank' | 'score'

/** 与 OpenAPI filter 对齐的可选条件（且关系） */
export type BangumiSearchFilter = {
  type?: number[]
  tag?: string[]
  meta_tags?: string[]
  air_date?: string[]
  rating?: string[]
  rating_count?: string[]
  rank?: string[]
  nsfw?: boolean
}

export type SearchAnimeParams = {
  keyword: string
  limit?: number
  offset?: number
  sort?: BangumiSearchSort
  filter?: BangumiSearchFilter
}

/**
 * Bangumi 条目搜索
 * POST /v0/search/subjects?limit&offset
 * body: { keyword, sort, filter }
 */
export function searchAnime(params: SearchAnimeParams | string) {
  // 兼容旧调用 searchAnime(keyword)
  const p: SearchAnimeParams = typeof params === 'string' ? { keyword: params } : params

  const keyword = (p.keyword || '').trim()
  const limit = p.limit ?? 20
  const offset = p.offset ?? 0
  const sort = p.sort ?? 'match'
  // 默认动画 + 非 NSFW；调用方可覆盖，但 type 缺省时强制 [2]
  const filter: BangumiSearchFilter = {
    nsfw: false,
    ...p.filter,
    type: p.filter?.type?.length ? p.filter.type : [2],
  }

  return bangumiRequest.post<any, IBangumiSearchResult>(
    '/v0/search/subjects',
    {
      keyword,
      sort,
      filter,
    },
    {
      params: { limit, offset },
    },
  )
}
