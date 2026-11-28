<template>
  <div class="live-rooms">
    <div class="live-rooms__header">
      <div class="live-rooms__left">
        <span class="live-rooms__title">正在放映</span>
        <span class="live-rooms__count">{{ list.length }} 个公开放映室</span>
      </div>
      <router-link class="live-rooms__more" to="/rooms">进入大厅 →</router-link>
    </div>

    <div class="live-rooms__scroll">
      <div v-for="room in list" :key="room.season_id" class="live-card" @click="joinRoom(room)">
        <div class="live-card__cover">
          <img
            v-if="room.cover && !failedCovers[room.season_id]"
            :src="bangumiImage(room.cover)"
            :alt="room.group_name"
            loading="lazy"
            @error="failedCovers[room.season_id] = true"
          />
          <div v-else class="live-card__fallback">{{ room.group_name.slice(0, 1) || '番' }}</div>
          <span
            class="live-card__badge"
            :class="{ 'is-playing': room.playback_status === 'playing' }"
          >
            {{ room.playback_status === 'playing' ? '播放中' : '放映室' }}
          </span>
          <span v-if="room.playback_episode_sort != null" class="live-card__ep">
            第 {{ room.playback_episode_sort }} 话
          </span>
          <span class="live-card__online">
            {{ room.online_count > 0 ? `${room.online_count} 人` : '可加入' }}
          </span>
        </div>
        <div class="live-card__name" :title="room.group_name">{{ room.group_name }}</div>
        <div class="live-card__host">
          <el-avatar :size="16" :src="resolveAvatarUrl(room.host_avatar)" />
          <span>{{ room.host_nickname }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { PublicRoomItem } from '@/api/room'
import { bangumiImage } from '@/utils/bangumi-image'
import { resolveAvatarUrl } from '@/utils/avatar'
import { track } from '@/utils/track'

const router = useRouter()

defineProps({
  list: {
    type: Array as PropType<PublicRoomItem[]>,
    default: () => [],
  },
})

const failedCovers = reactive<Record<string, boolean>>({})

function joinRoom(room: PublicRoomItem) {
  track('room.lobby.join', {
    seasonId: room.season_id,
    animeId: room.anime_id,
    from: 'home',
  })
  void router.push(`/room/${room.season_id}`)
}
</script>

<style scoped lang="less">
.live-rooms {
  margin-bottom: 32px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    padding-left: 12px;
    border-left: 4px solid var(--primary-color);
  }

  &__left {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  &__title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  &__count {
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__more {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-color);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  &__scroll {
    display: flex;
    gap: 14px;
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.live-card {
  flex: 0 0 184px;
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.12);
  transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;

  &:hover {
    transform: translateY(-4px);
    border-color: var(--primary-color);
    box-shadow: 0 0 16px rgba(104, 198, 189, 0.25);
  }

  &__cover {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    background: var(--box-bg-color);

    img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }
  }

  &__fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    color: var(--primary-color);
    background: linear-gradient(135deg, rgba(104, 198, 189, 0.2), rgba(104, 198, 189, 0.05));
  }

  &__badge {
    position: absolute;
    left: 6px;
    top: 6px;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    padding: 1px 6px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.62);

    &.is-playing {
      background: rgba(24, 160, 88, 0.88);
    }
  }

  &__ep {
    position: absolute;
    right: 6px;
    top: 6px;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    padding: 1px 6px;
    border-radius: 5px;
    background: rgba(104, 198, 189, 0.9);
  }

  &__online {
    position: absolute;
    right: 6px;
    bottom: 6px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.92);
    padding: 1px 6px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.58);
  }

  &__name {
    padding: 8px 10px 4px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--font-color);
  }

  &__host {
    padding: 0 10px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--font-unactive-color);

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

@media (max-width: 768px) {
  .live-rooms__title {
    font-size: 18px;
  }

  .live-card {
    flex-basis: 160px;
  }
}
</style>
