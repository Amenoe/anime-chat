import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from '../group/entities/group.entity';
import { GroupMessage } from '../group/entities/group_message.entity';
import { GroupUserMap } from '../group/entities/group_user_map.entity';
import { User } from '../user/entities/user.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { generateSeasonId } from '../utils/id';
import { clampLimit, escapeLike } from '../core/utils/sql';

export interface PlaybackStateView {
  group_id: string;
  season_id: string;
  status: string;
  episode_id: number | null;
  episode_sort: number | null;
  session_id: string;
  stream_url: string | null;
  position: number;
  paused: boolean;
  title: string;
  host_user_id: string;
  server_time: number;
  updated_at: Date | null;
}

export interface PublicRoomView {
  group_id: string;
  season_id: string;
  anime_id: number;
  group_name: string;
  cover: string | null;
  playback_status: string;
  playback_episode_sort: number | null;
  playback_title: string;
  host_user_id: string;
  host_nickname: string;
  host_avatar: string;
  online_count: number;
  create_time: string;
}

/**
 * 点播室：**私人房间**。
 *
 * 与放映室的区别只有两点：不绑番剧（`anime_id = 0`，不会出现在详情页的房间里）、
 * 不进公开列表，靠邀请链接 `/vod/:seasonId` 进房。播放同步、聊天、房主转让都复用
 * 放映室那套 `group` + `playback:*` 机制。
 */

@Injectable()
export class RoomService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMessage)
    private readonly groupMessageRepository: Repository<GroupMessage>,
    @InjectRepository(GroupUserMap)
    private readonly groupUserMapRepository: Repository<GroupUserMap>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /** 新建一个点播室（房主 = 创建者，房间 key 随机、只能靠邀请链接进） */
  async createVodRoom(userId: string, name?: string): Promise<Group> {
    const group = this.groupRepository.create({
      season_id: generateSeasonId(),
      host_user_id: userId,
      user_id: userId,
      // 0 = 不绑定番剧，因此不会出现在「详情页 → 该番的放映室」列表里
      anime_id: 0,
      group_name: (name?.trim() || '我的点播室').slice(0, 40),
      notice: '邀请链接进入；房主控制进度，文明聊天',
      playback_status: 'idle',
      is_public: 0,
      create_time: String(Date.now()),
    });
    return this.groupRepository.save(group);
  }

  async createRoom(userId: string, dto: CreateRoomDto): Promise<Group> {
    const group = this.groupRepository.create({
      season_id: generateSeasonId(),
      host_user_id: userId,
      user_id: userId,
      anime_id: dto.anime_id,
      episode_id: dto.episode_id ?? null,
      episode_sort: dto.episode_sort ?? null,
      group_name:
        dto.group_name ??
        (dto.episode_sort != null
          ? `番剧 #${dto.anime_id} 第 ${dto.episode_sort} 话`
          : `番剧 #${dto.anime_id}`),
      cover: dto.cover?.trim() || null,
      playback_episode_id: dto.episode_id ?? null,
      playback_episode_sort: dto.episode_sort ?? null,
      playback_status: 'idle',
      create_time: String(Date.now()),
    });
    return this.groupRepository.save(group);
  }

  /**
   * 公开放映室大厅列表：
   * - 仅返回绑定番剧（`anime_id > 0`）且公开（`is_public = 1`）的房间；私人点播室永不露出
   * - 按「在线人数 → 正在播放优先 → 创建时间倒序」排序，支持按房间名/当前播放标题筛选
   */
  async listPublic(limit = 20, keyword?: string): Promise<PublicRoomView[]> {
    const safeLimit = clampLimit(limit, 20, 50);
    const qb = this.groupRepository
      .createQueryBuilder('g')
      .where('g.anime_id > 0')
      .andWhere('g.is_public = 1')
      .andWhere("g.season_id IS NOT NULL AND g.season_id != ''");

    const trimmed = keyword?.trim();
    if (trimmed) {
      const kw = `%${escapeLike(trimmed)}%`;
      qb.andWhere(
        "(g.group_name LIKE :kw ESCAPE '!' OR g.playback_title LIKE :kw ESCAPE '!')",
        { kw },
      );
    }

    const groups = await qb.getMany();
    if (!groups.length) return [];

    const groupIds = groups.map((g) => g.group_id);
    const countRows = await this.groupUserMapRepository
      .createQueryBuilder('m')
      .select('m.group_id', 'group_id')
      .addSelect('COUNT(DISTINCT m.user_id)', 'cnt')
      .where('m.group_id IN (:...groupIds)', { groupIds })
      .groupBy('m.group_id')
      .getRawMany<{ group_id: string; cnt: string }>();

    const onlineCountMap = new Map<string, number>();
    for (const row of countRows) {
      onlineCountMap.set(row.group_id, Number(row.cnt) || 0);
    }

    const hostIds = Array.from(
      new Set(groups.map((g) => g.host_user_id).filter(Boolean)),
    );
    const hostMap = new Map<string, { nickname: string; avatar: string }>();
    if (hostIds.length) {
      const hosts = await this.userRepository
        .createQueryBuilder('u')
        .select(['u.user_id', 'u.nickname', 'u.avatar'])
        .where('u.user_id IN (:...hostIds)', { hostIds })
        .getMany();
      for (const h of hosts) {
        hostMap.set(h.user_id, {
          nickname: h.nickname || '用户',
          avatar: h.avatar || '',
        });
      }
    }

    const views: PublicRoomView[] = groups.map((g) => {
      const host = hostMap.get(g.host_user_id);
      return {
        group_id: g.group_id,
        season_id: g.season_id,
        anime_id: g.anime_id,
        group_name: g.group_name,
        cover: g.cover ?? null,
        playback_status: g.playback_status,
        playback_episode_sort: g.playback_episode_sort,
        playback_title: g.playback_title,
        host_user_id: g.host_user_id,
        host_nickname: host?.nickname || '房主',
        host_avatar: host?.avatar || '',
        online_count: onlineCountMap.get(g.group_id) ?? 0,
        create_time: g.create_time,
      };
    });

    views.sort((a, b) => {
      if (b.online_count !== a.online_count) {
        return b.online_count - a.online_count;
      }
      const aPlaying = a.playback_status === 'playing' ? 1 : 0;
      const bPlaying = b.playback_status === 'playing' ? 1 : 0;
      if (bPlaying !== aPlaying) {
        return bPlaying - aPlaying;
      }
      return (Number(b.create_time) || 0) - (Number(a.create_time) || 0);
    });

    return views.slice(0, safeLimit);
  }

  async listByAnime(animeId: number, episodeSort?: number): Promise<Group[]> {
    const qb = this.groupRepository
      .createQueryBuilder('g')
      .where('g.anime_id = :animeId', { animeId })
      .andWhere("g.season_id IS NOT NULL AND g.season_id != ''");
    if (episodeSort != null) {
      qb.andWhere('g.episode_sort = :episodeSort', { episodeSort });
    }
    return qb.getMany();
  }

  async findBySeasonId(seasonId: string): Promise<Group | null> {
    const group = await this.groupRepository.findOne({
      where: { season_id: seasonId },
    });
    return group ?? null;
  }

  toPlaybackState(group: Group): PlaybackStateView {
    return {
      group_id: group.group_id,
      season_id: group.season_id,
      status: group.playback_status,
      episode_id: group.playback_episode_id,
      episode_sort: group.playback_episode_sort,
      session_id: group.playback_session_id,
      stream_url: group.playback_stream_url,
      position: group.playback_position,
      paused: group.playback_status === 'paused',
      title: group.playback_title,
      host_user_id: group.host_user_id,
      server_time: Date.now(),
      updated_at: group.playback_updated_at,
    };
  }

  async updatePlayback(
    groupId: string,
    hostUserId: string,
    patch: Partial<
      Pick<
        Group,
        | 'playback_status'
        | 'playback_episode_id'
        | 'playback_episode_sort'
        | 'playback_session_id'
        | 'playback_stream_url'
        | 'playback_position'
        | 'playback_title'
      >
    >,
  ): Promise<Group> {
    const group = await this.groupRepository.findOne({
      where: { group_id: groupId },
    });
    if (!group) throw new NotFoundException('房间不存在');
    if (group.host_user_id !== hostUserId) {
      throw new ForbiddenException('只有房主可以控制播放');
    }
    Object.assign(group, patch, { playback_updated_at: new Date() });
    return this.groupRepository.save(group);
  }

  async transferHost(groupId: string, newHostUserId: string): Promise<Group> {
    const group = await this.groupRepository.findOne({
      where: { group_id: groupId },
    });
    if (!group) throw new NotFoundException('房间不存在');
    group.host_user_id = newHostUserId;
    return this.groupRepository.save(group);
  }

  async destroyRoom(groupId: string): Promise<void> {
    const messages = await this.groupMessageRepository.find({
      where: { group_id: groupId },
    });
    if (messages.length) {
      await this.groupMessageRepository.remove(messages);
    }

    const maps = await this.groupUserMapRepository.find({
      where: { group_id: groupId },
    });
    if (maps.length) {
      await this.groupUserMapRepository.remove(maps);
    }

    const group = await this.groupRepository.findOne({
      where: { group_id: groupId },
    });
    if (group) {
      await this.groupRepository.remove(group);
    }
  }
}
