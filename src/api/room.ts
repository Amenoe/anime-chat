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
