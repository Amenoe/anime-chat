import bangumiRequest from '@/common/request/bangumi'
import type { IBangumiSearchResult } from './types'

export function searchAnime(keyword: string, limit = 20, offset = 0) {
  return bangumiRequest.post<any, IBangumiSearchResult>('/v0/search/subjects', {
    keyword,
    filter: { type: [2] },
    sort: 'match',
    limit,
    offset,
  })
}
