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
  data: Partial<
    Pick<
      IUserAnimePayload,
      'status' | 'title' | 'name_cn' | 'cover' | 'watched_episode' | 'total_episodes'
    >
  >,
) {
  return request.patch<IUserAnime>({
    url: `/user-anime/${bangumiId}`,
    data,
  })
}

/**
 * 播放页上报「看到第几集」。
 *
 * **静默**（X-Silent）：这部没收藏时 PATCH 会 404，那是正常情况而不是错误 ——
 * 每次点集都弹一个红色提示会让人以为坏了。
 */
export function reportWatchedEpisode(bangumiId: number, watched_episode: number) {
  return request.patch<IUserAnime>({
    url: `/user-anime/${bangumiId}`,
    data: { watched_episode },
    headers: { 'X-Silent': '1' },
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
