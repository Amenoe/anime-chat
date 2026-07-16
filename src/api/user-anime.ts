import request from '@/common/request'
import type { IUserAnime, IUserAnimePayload, UserAnimeStatus } from './types'

/** 新增或覆盖追番状态 */
export function upsertUserAnime(data: IUserAnimePayload) {
  return request.post<IUserAnime>({
    url: '/user-anime',
    data,
  })
}

/** 修改追番状态 / 元数据 */
export function updateUserAnime(
  bangumiId: number,
  data: Partial<Pick<IUserAnimePayload, 'status' | 'title' | 'name_cn' | 'cover'>>,
) {
  return request.patch<IUserAnime>({
    url: `/user-anime/${bangumiId}`,
    data,
  })
}

/** 取消追番 */
export function removeUserAnime(bangumiId: number) {
  return request.delete<{ affected: number }>({
    url: `/user-anime/${bangumiId}`,
  })
}

/** 我的追番列表，可按 status 筛选 */
export function listUserAnime(status?: UserAnimeStatus) {
  return request.get<IUserAnime[]>({
    url: '/user-anime',
    params: status ? { status } : undefined,
  })
}

/** 查询某番当前追番状态，无记录返回 null */
export function getUserAnime(bangumiId: number) {
  return request.get<IUserAnime | null>({
    url: `/user-anime/${bangumiId}`,
  })
}
