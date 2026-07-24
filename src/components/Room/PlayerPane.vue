<template>
  <div class="player-pane">
    <AnimePlayer :url="streamUrl" :title="playbackTitle" />

    <div class="player-pane__info">
      <div class="player-pane__meta">
        <span v-if="playbackTitle" class="player-pane__title">{{ playbackTitle }}</span>
        <span v-if="currentEpisodeSort" class="player-pane__ep"
          >第 {{ currentEpisodeSort }} 话</span
        >
      </div>
      <div class="player-pane__host">
        <span class="player-pane__host-label">房主</span>
        <span class="player-pane__host-badge">{{ isHost ? '你' : '观众模式' }}</span>
      </div>
    </div>

    <div v-if="episodeList.length" class="player-pane__episodes">
      <span class="player-pane__episodes-label">选集</span>
      <div class="player-pane__episode-bar">
        <button
          v-for="ep in episodeList"
          :key="ep.id"
          class="player-pane__episode-btn"
          :class="{
            active: ep.sort === currentEpisodeSort,
            clickable: isHost,
          }"
          :disabled="!isHost"
          :title="ep.name_cn || ep.name || `第 ${ep.sort} 话`"
          @click="switchEpisode(ep)"
        >
          {{ ep.sort }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import { useHomeStore } from '@/stores/modules/home'
import { buildPlaybackStreamUrl } from '@/api/playback'
import AnimePlayer from '@/components/Player/AnimePlayer.vue'
import type { IBangumiEpisode } from '@/api/types'

const roomStore = useRoomStore()
const homeStore = useHomeStore()

const isHost = computed(() => roomStore.role === 'host')
const playbackState = computed(() => roomStore.playbackState)
const currentEpisodeSort = computed(() => playbackState.value?.episode_sort ?? null)
const episodeList = computed(() => homeStore.episodes)

const playbackTitle = computed(() => {
  return (
    playbackState.value?.title ||
    homeStore.animeDetail?.name_cn ||
    homeStore.animeDetail?.name ||
    ''
  )
})

const streamUrl = computed(() => {
  const ps = playbackState.value
  if (!ps) return null
  if (ps.stream_url) return ps.stream_url
  if (ps.session_id) return buildPlaybackStreamUrl(ps.session_id)
  return null
})

function switchEpisode(ep: IBangumiEpisode) {
  if (!isHost.value) return
  roomStore.sendControl('switch_episode', {
    episode_sort: ep.sort,
    episode_id: ep.id,
  })
}
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

  &__episodes {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__episodes-label {
    font-size: 14px;
    font-weight: 600;
    padding-left: 10px;
    border-left: 3px solid var(--primary-color);
  }

  &__episode-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__episode-btn {
    min-width: 40px;
    height: 36px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(104, 198, 189, 0.2);
    background: var(--aside-bg-color);
    color: var(--font-color);
    font-size: 13px;
    font-weight: 600;
    cursor: default;
    transition: all 0.2s;

    &.clickable {
      cursor: pointer;

      &:hover:not(.active) {
        border-color: rgba(104, 198, 189, 0.5);
        background: rgba(104, 198, 189, 0.08);
      }
    }

    &.active {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: #fff;
      box-shadow: 0 0 10px rgba(104, 198, 189, 0.3);
    }

    &:disabled:not(.active) {
      opacity: 0.7;
    }
  }
}
</style>
