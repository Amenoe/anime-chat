import bangumiRequest from '@/common/request/bangumi'
import type {
  ICalendarItem,
  IBangumiSearchResult,
  IBangumiSubject,
  IBangumiEpisodeResult,
} from './types'

export function getCalendarData() {
  return bangumiRequest.get<any, ICalendarItem[]>('/calendar')
}

export function getHotAnime(limit = 20, offset = 0) {
  return bangumiRequest.post<any, IBangumiSearchResult>('/v0/search/subjects', {
    filter: { type: [2] },
    sort: 'heat',
    limit,
    offset,
  })
}

export function getSubjectDetail(id: number) {
  return bangumiRequest.get<any, IBangumiSubject>(`/v0/subjects/${id}`)
}

export function getEpisodes(subjectId: number, limit = 100, offset = 0) {
  return bangumiRequest.get<any, IBangumiEpisodeResult>('/v0/episodes', {
    params: { subject_id: subjectId, limit, offset },
  })
}
