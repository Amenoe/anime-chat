<template>
  <div id="room-lobby" class="page room-lobby">
    <header class="room-lobby__head">
      <div class="room-lobby__title-wrap">
        <h2 class="room-lobby__title">放映大厅</h2>
        <span class="room-lobby__subtitle">公开放映室，点击卡片直接加入同步观看</span>
      </div>

      <div class="room-lobby__toolbar">
        <el-input
          v-model="keyword"
          class="room-lobby__search"
          placeholder="搜索房间名或正在播放的内容…"
          clearable
          @keyup.enter="loadRooms"
          @clear="loadRooms"
        />
        <el-button type="primary" :loading="loading" @click="loadRooms">搜索</el-button>
        <el-button :loading="loading" @click="loadRooms">刷新</el-button>
      </div>
    </header>

    <div v-loading="loading" class="room-lobby__body">
      <div v-if="rooms.length" class="room-lobby__grid">
        <article
          v-for="room in rooms"
          :key="room.season_id"
          class="lobby-card"
          @click="joinRoom(room)"
        >
          <div class="lobby-card__cover">
            <img
              v-if="room.cover && !failedCovers[room.season_id]"
              :src="bangumiImage(room.cover)"
              :alt="room.group_name"
              loading="lazy"
              @error="failedCovers[room.season_id] = true"
            />
            <div v-else class="lobby-card__cover-fallback">
              {{ room.group_name.slice(0, 1) || '番' }}
            </div>

            <span class="lobby-card__status" :class="`is-${statusTone(room.playback_status)}`">
              <span v-if="room.playback_status === 'playing'" class="lobby-card__pulse" />
              {{ statusLabel(room.playback_status) }}
            </span>

            <span v-if="room.playback_episode_sort != null" class="lobby-card__ep">
              第 {{ room.playback_episode_sort }} 话
            </span>

            <span class="lobby-card__online">
              {{ room.online_count > 0 ? `${room.online_count} 人在线` : '等待加入' }}
            </span>
          </div>

          <div class="lobby-card__body">
            <h3 class="lobby-card__name" :title="room.group_name">{{ room.group_name }}</h3>
            <p class="lobby-card__playing" :title="room.playback_title || '房主暂未开播'">
              {{ room.playback_title || '房主暂未开播' }}
            </p>
            <div class="lobby-card__footer">
              <div class="lobby-card__host">
                <el-avatar :size="22" :src="resolveAvatarUrl(room.host_avatar)" />
                <span class="lobby-card__host-name">{{ room.host_nickname }}</span>
              </div>
              <span class="lobby-card__join">加入放映室 →</span>
            </div>
          </div>
        </article>
      </div>

      <el-empty v-else-if="!loading" description="当前还没有正在进行的公开放映室">
        <div class="room-lobby__empty-actions">
          <el-button type="primary" @click="router.push('/ai')">去番剧助手找番</el-button>
          <el-button @click="router.push('/home')">逛逛首页</el-button>
        </div>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { listPublicRooms, type PublicRoomItem } from '@/api/room'
import { bangumiImage } from '@/utils/bangumi-image'
import { resolveAvatarUrl } from '@/utils/avatar'
import { track } from '@/utils/track'

const router = useRouter()

const rooms = ref<PublicRoomItem[]>([])
const loading = ref(false)
const keyword = ref('')
const failedCovers = reactive<Record<string, boolean>>({})

function statusLabel(status: string): string {
  if (status === 'playing') return '播放中'
  if (status === 'paused') return '已暂停'
  return '选源中'
}

function statusTone(status: string): 'playing' | 'paused' | 'idle' {
  if (status === 'playing') return 'playing'
  if (status === 'paused') return 'paused'
  return 'idle'
}

async function loadRooms() {
  loading.value = true
  try {
    rooms.value = (await listPublicRooms({ limit: 40, q: keyword.value.trim() || undefined })) || []
  } catch {
    rooms.value = []
  } finally {
    loading.value = false
  }
}

function joinRoom(room: PublicRoomItem) {
  track('room.lobby.join', {
    seasonId: room.season_id,
    animeId: room.anime_id,
    onlineCount: room.online_count,
  })
  void router.push(`/room/${room.season_id}`)
}

onMounted(() => {
  void loadRooms()
})
</script>

<style scoped lang="less">
@import '~styles/page';

.room-lobby {
  display: flex;
  flex-direction: column;
  gap: 22px;

  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px 20px;
  }

  &__title-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 12px;
    border-left: 4px solid var(--primary-color);
  }

  &__title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--font-color);
    letter-spacing: 0.5px;
  }

  &__subtitle {
    font-size: 13px;
    color: var(--font-unactive-color);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__search {
    width: 260px;
  }

  &__body {
    min-height: 220px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }

  &__empty-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
  }
}

.lobby-card {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.14);
  cursor: pointer;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;

  &:hover {
    transform: translateY(-3px);
    border-color: var(--primary-color);
    box-shadow: 0 8px 22px rgba(104, 198, 189, 0.18);
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
      object-fit: cover;
      display: block;
    }
  }

  &__cover-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 34px;
    font-weight: 700;
    color: var(--primary-color);
    background: linear-gradient(135deg, rgba(104, 198, 189, 0.22), rgba(104, 198, 189, 0.05));
  }

  &__status {
    position: absolute;
    left: 8px;
    top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: rgba(0, 0, 0, 0.65);

    &.is-playing {
      background: rgba(24, 160, 88, 0.88);
    }
    &.is-paused {
      background: rgba(217, 119, 6, 0.85);
    }
  }

  &__pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
    animation: lobby-pulse 1.4s infinite ease-in-out;
  }

  &__ep {
    position: absolute;
    right: 8px;
    top: 8px;
    padding: 2px 7px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: rgba(104, 198, 189, 0.9);
  }

  &__online {
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: 2px 7px;
    border-radius: 6px;
    font-size: 11px;
    color: #fff;
    background: rgba(0, 0, 0, 0.62);
  }

  &__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
  }

  &__name {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--font-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__playing {
    margin: 0;
    font-size: 12px;
    color: var(--font-unactive-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__footer {
    margin-top: auto;
    padding-top: 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__host {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  &__host-name {
    font-size: 12px;
    color: var(--font-unactive-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__join {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
  }
}

@keyframes lobby-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (max-width: 768px) {
  .room-lobby {
    &__search {
      width: 100%;
    }
  }
}
</style>
