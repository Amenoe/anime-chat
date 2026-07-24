<template>
  <div class="playlist-pane">
    <div v-if="episodeList.length === 0" class="playlist-pane__empty">
      <el-empty description="暂无集数信息" :image-size="80" />
    </div>
    <div v-else class="playlist-pane__list">
      <button
        v-for="ep in episodeList"
        :key="ep.id"
        class="playlist-pane__item"
        :class="{
          active: ep.sort === currentEpisodeSort,
          clickable: isHost,
        }"
        :disabled="!isHost"
        @click="switchEpisode(ep)"
      >
        <span class="playlist-pane__sort">{{ ep.sort }}</span>
        <span class="playlist-pane__name">{{ ep.name_cn || ep.name || `第 ${ep.sort} 话` }}</span>
        <span v-if="ep.sort === currentEpisodeSort" class="playlist-pane__playing">播放中</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import { useHomeStore } from '@/stores/modules/home'
import type { IBangumiEpisode } from '@/api/types'

const roomStore = useRoomStore()
const homeStore = useHomeStore()

const isHost = computed(() => roomStore.role === 'host')
const currentEpisodeSort = computed(() => roomStore.playbackState?.episode_sort ?? null)
const episodeList = computed(() => homeStore.episodes)

function switchEpisode(ep: IBangumiEpisode) {
  if (!isHost.value) return
  roomStore.sendControl('switch_episode', {
    episode_sort: ep.sort,
    episode_id: ep.id,
  })
}
</script>

<style scoped lang="less">
.playlist-pane {
  height: 100%;
  overflow-y: auto;
  padding: 12px 0;

  scrollbar-width: thin;
  scrollbar-color: rgba(104, 198, 189, 0.45) rgba(255, 255, 255, 0.04);

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(104, 198, 189, 0.4);
    border-radius: 6px;

    &:hover {
      background: rgba(104, 198, 189, 0.65);
    }
  }

  &__empty {
    padding: 40px 0;
  }

  &__list {
    display: flex;
    flex-direction: column;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    background: none;
    border: none;
    border-left: 3px solid transparent;
    color: var(--font-color);
    font-size: 13px;
    text-align: left;
    cursor: default;
    transition: all 0.2s;

    &.clickable {
      cursor: pointer;

      &:hover:not(.active) {
        background: rgba(104, 198, 189, 0.06);
        border-left-color: rgba(104, 198, 189, 0.3);
      }
    }

    &.active {
      background: rgba(104, 198, 189, 0.1);
      border-left-color: var(--primary-color);
    }

    &:disabled:not(.active) {
      opacity: 0.8;
    }
  }

  &__sort {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.1);
    border: 1px solid rgba(104, 198, 189, 0.2);
    font-weight: 700;
    font-size: 12px;
    color: var(--primary-color);

    .active & {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: #fff;
    }
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__playing {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--primary-color);
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(104, 198, 189, 0.12);
  }
}
</style>
