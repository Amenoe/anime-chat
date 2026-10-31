import request from '@/common/request'

export interface RoomGroup {
  group_id: string
  user_id: string
  anime_id: number
  group_name: string
  notice: string
  create_time: string
  season_id: string
  host_user_id: string
  is_public: number
  episode_id: number | null
  episode_sort: number | null
  playback_status: string
  playback_episode_sort: number | null
  playback_episode_id: number | null
  playback_session_id: string
  playback_stream_url: string | null
  playback_position: number
  playback_updated_at: string | null
  playback_title: string
}

export function listRooms(params: { anime_id: number; episode_sort?: number }) {
  return request.get<RoomGroup[]>({
    url: '/rooms',
    params,
  })
}

export function createRoom(data: {
  anime_id: number
  episode_id?: number
  episode_sort?: number
  group_name?: string
}) {
  return request.post<RoomGroup>({
    url: '/rooms',
    data,
  })
}

export function getRoomByKey(seasonId: string) {
  return request.get<RoomGroup>({
    url: `/rooms/by-key/${seasonId}`,
  })
}

/**
 * 新建私人点播室。
 *
 * 不绑番剧（`anime_id = 0`）、不进公开列表，靠返回的 `season_id` 生成邀请链接
 * `/vod/:seasonId`；播放同步与聊天复用放映室那套 `playback:*` / `groupMessage`。
 */
export function createVodRoom(name?: string) {
  return request.post<RoomGroup>({
    url: '/rooms/vod',
    data: { name },
  })
}
