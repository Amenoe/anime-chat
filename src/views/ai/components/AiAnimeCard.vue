<template>
  <div
    v-track="{ event: 'ai.card.click', props: { id: card.id, name: displayName } }"
    class="ai-anime-card"
    @click="goDetail"
  >
    <div class="ai-anime-card__cover">
      <img
        v-if="card.cover && !coverFailed"
        :src="card.cover"
        :alt="displayName"
        loading="lazy"
        @error="coverFailed = true"
      />
      <!-- 封面缺失/加载失败时的本地占位，不依赖网络（远端兜底图同样可能挂） -->
      <span v-else class="ai-anime-card__cover-fallback">{{ initial }}</span>
      <span v-if="card.score" class="ai-anime-card__score">{{ card.score.toFixed(1) }}</span>
    </div>
    <div class="ai-anime-card__body">
      <div class="ai-anime-card__name" :title="displayName">{{ displayName }}</div>
      <div class="ai-anime-card__meta">
        <span v-if="card.date">{{ card.date }}</span>
        <span v-if="card.rank">#{{ card.rank }}</span>
      </div>
      <div v-if="card.tags?.length" class="ai-anime-card__tags">
        <span v-for="tag in card.tags.slice(0, 3)" :key="tag" class="ai-anime-card__tag">
          {{ tag }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import type { IAiAnimeCard } from '@/api/ai'

const props = defineProps({
  card: {
    type: Object as PropType<IAiAnimeCard>,
    required: true,
  },
})

const router = useRouter()

/**
 * 封面加载失败标记。
 *
 * Bangumi 的封面 URL 会失效（条目被合并、图片被清理），失败时直接换成
 * **本地**占位块而不是再指一个远端兜底图 —— 兜底图本身也可能挂，那样还是破图。
 */
const coverFailed = ref(false)

/** 后端已把空的中文名兜底成原名，这里再兜一层防止两边都没值 */
const displayName = computed(() => props.card.nameCn || props.card.name || '未知条目')
const initial = computed(() => displayName.value.slice(0, 1))

/** 卡片是「模型不编造番剧」这条原则的落点：点进去看的就是工具返回的那个 subject_id */
function goDetail() {
  router.push({ name: 'Detail', params: { anime_id: String(props.card.id) } })
}
</script>

<style scoped lang="less">
.ai-anime-card {
  display: flex;
  gap: 10px;
  width: 240px;
  padding: 8px;
  border-radius: 10px;
  background: var(--aside-bg-color);
  border: 1px solid transparent;
  cursor: pointer;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;

  &:hover {
    border-color: var(--primary-color);
    box-shadow: 0 0 12px rgba(104, 198, 189, 0.15);
    transform: translateY(-2px);
  }

  &__cover {
    position: relative;
    flex: 0 0 56px;
    width: 56px;
    height: 76px;
    border-radius: 6px;
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 20px;
    font-weight: 600;
    color: var(--primary-color);
    background: linear-gradient(135deg, rgba(104, 198, 189, 0.16), rgba(104, 198, 189, 0.05));
  }

  &__score {
    position: absolute;
    right: 2px;
    bottom: 2px;
    padding: 0 4px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 16px;
    color: #fff;
    background: rgba(0, 0, 0, 0.65);
  }

  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__name {
    .p-truncate(2);

    font-size: 13px;
    line-height: 1.35;
    color: var(--font-color);
  }

  &__meta {
    display: flex;
    gap: 8px;
    font-size: 11px;
    color: var(--font-unactive-color);
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  &__tag {
    padding: 0 4px;
    border-radius: 3px;
    font-size: 10px;
    line-height: 14px;
    color: var(--primary-color);
    border: 1px solid rgba(104, 198, 189, 0.4);
  }
}
</style>
