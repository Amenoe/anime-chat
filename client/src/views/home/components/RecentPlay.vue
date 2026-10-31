<template>
  <div class="recent-play">
    <div class="recent-play__header">
      <span class="recent-play__title">最近播放</span>
      <span class="recent-play__tip">继续上次的观看</span>
    </div>
    <div class="recent-play__scroll">
      <div
        v-for="item in list"
        :key="item.bangumiId"
        class="recent-card"
        @click="goDetail(item.bangumiId)"
      >
        <div class="recent-card__cover">
          <img :src="item.cover || defaultCover" :alt="item.title" />
          <div v-if="item.episodeSort != null" class="recent-card__ep">
            第 {{ item.episodeSort }} 话
          </div>
          <div class="recent-card__time">{{ relativeTime(item.time) }}</div>
        </div>
        <div class="recent-card__name" :title="item.title">{{ item.title }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlayHistoryItem } from '@/utils/play-history'
import type { PropType } from 'vue'
import empty from '@/assets/images/empty.png'

const router = useRouter()

defineProps({
  list: {
    type: Array as PropType<PlayHistoryItem[]>,
    default: () => [],
  },
})

const defaultCover = empty

function goDetail(id: number) {
  router.push('/detail/' + id)
}

function relativeTime(time: number) {
  if (!time) return ''
  const diff = Date.now() - time
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  const d = new Date(time)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<style scoped lang="less">
.recent-play {
  margin-bottom: 32px;

  &__header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
    padding-left: 12px;
    border-left: 4px solid var(--primary-color);
  }

  &__title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  &__tip {
    font-size: 12px;
    color: var(--font-unactive-color);
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

.recent-card {
  flex: 0 0 140px;
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  background: var(--aside-bg-color);
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 0 16px rgba(104, 198, 189, 0.3);
  }

  &__cover {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 4;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }
  }

  &__ep {
    position: absolute;
    left: 8px;
    top: 8px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.9);
  }

  &__time {
    position: absolute;
    right: 6px;
    bottom: 6px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.9);
    padding: 1px 6px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.55);
  }

  &__name {
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--font-color);
  }
}

@media (max-width: 768px) {
  .recent-play {
    &__title {
      font-size: 18px;
    }
  }

  .recent-card {
    flex-basis: 120px;
  }
}
</style>
