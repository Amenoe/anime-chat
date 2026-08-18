<template>
  <div class="player-pane">
    <AnimePlayer
      ref="playerRef"
      :url="streamUrl"
      :title="playbackTitle"
      :controlled="!isHost"
      :paused="playbackState?.paused"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @seek="onSeek"
      @error="onPlayerError"
    />

    <div class="player-pane__info">
      <div class="player-pane__meta">
        <span v-if="animeTitle" class="player-pane__title">{{ animeTitle }}</span>
        <span v-if="currentEpisodeSort" class="player-pane__ep"
          >第 {{ currentEpisodeSort }} 话</span
        >
      </div>
      <div class="player-pane__actions">
        <button v-if="isHost" class="player-pane__source-btn" @click="openSearchDrawer">
          选源开播
        </button>
        <div class="player-pane__host">
          <span class="player-pane__host-label">身份</span>
          <span class="player-pane__host-badge">{{ isHost ? '房主' : '观众' }}</span>
        </div>
      </div>
    </div>

    <!-- 右侧已有播放列表：左侧不再重复选集，改为本集信息 + 清晰度 + 选源状态 -->
    <div class="player-pane__status">
      <div class="player-pane__ep-line">
        <span class="player-pane__ep-name" :title="currentEpisodeName">
          {{ currentEpisodeName || '未选择集数' }}
        </span>
        <span v-if="currentQuality" class="player-pane__quality">{{ currentQuality }}</span>
      </div>
      <div v-if="sourceStatusText" class="player-pane__status-line">
        <span class="player-pane__status-text">{{ sourceStatusText }}</span>
      </div>
    </div>

    <!-- 房主搜源抽屉 -->
    <SourceDrawer
      v-model="sourceDrawerVisible"
      :rows="searchRows"
      :searching="sourceSearching"
      :creating="sourceCreating"
      :current-source-key="currentSourceKey"
      :title="drawerTitle"
      @select="onSelectCandidate"
      @closed="onDrawerClosed"
    />
  </div>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import { useHomeStore } from '@/stores/modules/home'
import { buildPlaybackStreamUrl, type PlayCandidate } from '@/api/playback'
import { extractQuality } from '@/utils/source-quality'
import { addPlayHistory } from '@/utils/play-history'
import AnimePlayer from '@/components/Player/AnimePlayer.vue'
import SourceDrawer from '@/components/Room/SourceDrawer.vue'
import { useSourceSearch } from '@/composables/useSourceSearch'

const roomStore = useRoomStore()
const homeStore = useHomeStore()

const playerRef = ref<InstanceType<typeof AnimePlayer> | null>(null)

const sourceSearch = useSourceSearch({
  clearPlayerHint: () => playerRef.value?.clearHint(),
})

const {
  sourceDrawerVisible,
  sourceSearching,
  sourceCreating,
  searchRows,
  currentSourceKey,
  drawerTitle,
  sourceStatusText,
  openSearchDrawer,
  onPlayerError,
} = sourceSearch

const isHost = computed(() => roomStore.role === 'host')
const playbackState = computed(() => roomStore.playbackState)
const currentEpisodeSort = computed(() => playbackState.value?.episode_sort ?? null)
const episodeList = computed(() => homeStore.episodes)
const bangumiId = computed(() => homeStore.animeDetail?.id ?? 0)

const animeTitle = computed(() => {
  return homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || ''
})

const playbackTitle = computed(() => {
  return playbackState.value?.title || animeTitle.value || ''
})

const currentEpisodeName = computed(() => {
  const sort = currentEpisodeSort.value
  if (sort == null) return ''
  const ep = episodeList.value.find((e) => e.sort === sort)
  const name = ep?.name_cn || ep?.name
  return name ? `第 ${sort} 话 · ${name}` : `第 ${sort} 话`
})

/** 当前播放源清晰度：优先自动/手动选定时记录的 label，回落 playback title */
const currentQuality = computed(() => {
  return extractQuality(sourceSearch.currentSourceLabel.value, playbackState.value?.title || '')
})

const streamUrl = computed(() => {
  const ps = playbackState.value
  if (!ps) return null
  if (ps.stream_url) return ps.stream_url
  if (ps.session_id) return buildPlaybackStreamUrl(ps.session_id)
  return null
})

// ── 播放器控制与同步 ─────────────────────────────────────────

let lastHeartbeat = 0
const HEARTBEAT_INTERVAL = 8000

function onTimeUpdate(currentTime: number) {
  if (!isHost.value) return
  const now = Date.now()
  if (now - lastHeartbeat < HEARTBEAT_INTERVAL) return
  lastHeartbeat = now
  roomStore.sendControl('heartbeat', { position: currentTime })
}

function onPlay(currentTime: number) {
  if (isHost.value) {
    roomStore.sendControl('play', { position: currentTime })
  }
  // 真正开始播：停止自动换源
  sourceSearch.onPlaybackStarted()
}

function onPause(currentTime: number) {
  if (!isHost.value) return
  roomStore.sendControl('pause', { position: currentTime })
}

function onSeek(currentTime: number) {
  if (!isHost.value) return
  roomStore.sendControl('seek', { position: currentTime })
}

watch(playbackState, (ps) => {
  if (!ps || isHost.value) return
  const p = playerRef.value
  if (!p) return
  const art = p.getPlayer()
  if (!art) return

  // 播放中：补偿自 server_time 起的流逝；暂停：对齐到暂停点
  const target =
    !ps.paused && ps.server_time ? ps.position + (Date.now() - ps.server_time) / 1000 : ps.position

  // 先对齐进度，再应用播放/暂停状态，避免 play() 被随后的 seek 打断
  if (Math.abs(art.currentTime - target) > 1.5) {
    p.seekTo(target)
  }
  p.setPaused(ps.paused)
})

// 开播 / 换源 / 切集时记录最近播放（进房即同步已有源，viewer 也会记录）
watch(
  () => playbackState.value?.stream_url || playbackState.value?.session_id,
  (val) => {
    if (!val || !bangumiId.value) return
    addPlayHistory({
      bangumiId: bangumiId.value,
      title: animeTitle.value || `番剧 #${bangumiId.value}`,
      cover: homeStore.animeDetail?.images?.common || '',
      episodeSort: currentEpisodeSort.value ?? null,
      time: Date.now(),
    })
  },
)

function onSelectCandidate(c: PlayCandidate) {
  void sourceSearch.selectCandidate(c)
}

function onDrawerClosed() {
  // 关闭抽屉不取消后台搜索、不丢缓存
}

onBeforeUnmount(() => {
  sourceSearch.teardown()
})
</script>

<style scoped lang="less">
.player-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  &__title {
    font-size: 16px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__ep {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--primary-color);
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.12);
    border: 1px solid rgba(104, 198, 189, 0.25);
  }

  &__actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__source-btn {
    border: 1px solid rgba(104, 198, 189, 0.4);
    border-radius: 8px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: rgba(104, 198, 189, 0.1);
    color: var(--primary-color);
    transition: all 0.2s;

    &:hover {
      background: rgba(104, 198, 189, 0.2);
      border-color: var(--primary-color);
      box-shadow: 0 0 8px rgba(104, 198, 189, 0.25);
    }
  }

  &__host {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__host-label {
    color: var(--font-unactive-color);
  }

  &__host-badge {
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.1);
    color: var(--primary-color);
    font-weight: 600;
  }

  &__status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--aside-bg-color);
    border: 1px solid rgba(104, 198, 189, 0.12);
  }

  &__ep-line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__ep-name {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--font-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__quality {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
    padding: 1px 8px;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.12);
    border: 1px solid rgba(104, 198, 189, 0.35);
  }

  &__status-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    font-size: 12px;
  }

  &__status-text {
    color: var(--primary-color);
  }
}

@media (max-width: 768px) {
  .player-pane {
    gap: 0;

    &__info {
      padding: 6px 10px;
      gap: 8px;
    }

    &__title {
      font-size: 14px;
    }

    &__ep {
      font-size: 11px;
      padding: 1px 6px;
    }

    &__source-btn {
      font-size: 12px;
      padding: 4px 12px;
    }

    &__status {
      padding: 8px 10px;
      border-radius: 0;
      border-left: none;
      border-right: none;
    }

    &__ep-name {
      font-size: 13px;
    }
  }
}
</style>
