<template>
  <div class="home-list">
    <div class="home-list__header">
      <span class="home-list__title">{{ title }}</span>
    </div>
    <div class="home-list__grid">
      <div v-for="item in listData" :key="item.id" class="anime-card" @click="animeClick(item.id)">
        <div class="anime-card__cover">
          <img :src="item.images?.common" alt="" />
          <div class="anime-card__overlay">
            <span v-if="item.rating?.score" class="anime-card__score">
              {{ item.rating.score.toFixed(1) }}
            </span>
          </div>
        </div>
        <div class="anime-card__name">{{ item.name_cn || item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IBangumiSubject } from '@/api/types'
import type { PropType } from 'vue'

const router = useRouter()

defineProps({
  title: {
    type: String,
    default: '',
  },
  listData: {
    type: Array as PropType<IBangumiSubject[]>,
    default: () => [],
  },
})

const animeClick = (id: number) => {
  router.push('/detail/' + id)
}
</script>

<style scoped lang="less">
.home-list {
  margin-bottom: 32px;

  &__header {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
    padding-left: 12px;
    border-left: 4px solid var(--primary-color);
  }

  &__title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
  }
}

.anime-card {
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  border-radius: 10px;
  overflow: hidden;
  background: var(--aside-bg-color);

  &:hover {
    transform: scale(1.05) translateY(-4px);
    box-shadow: 0 0 20px rgba(104, 198, 189, 0.35);
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

  &__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.7) 0%, transparent 50%);
    pointer-events: none;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 8px;
  }

  &__score {
    background: var(--primary-color);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
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
  .home-list__grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }
  .home-list__title {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .home-list__grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
}
</style>
