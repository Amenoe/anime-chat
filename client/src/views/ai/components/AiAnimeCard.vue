<template>
  <div
    v-track="{ event: 'ai.card.click', props: { id: card.id, name: displayName } }"
    class="ai-anime-card"
    @click="goDetail"
  >
    <div class="ai-anime-card__top">
      <div class="ai-anime-card__cover">
        <img
          v-if="card.cover && !coverFailed"
          :src="bangumiImage(card.cover)"
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

    <div class="ai-anime-card__actions" @click.stop>
      <button
        type="button"
        class="ai-anime-card__btn ai-anime-card__btn--watch"
        :disabled="roomLoading"
        @click.stop="onWatchTogether"
      >
        {{ roomLoading ? '进房中…' : '一起看' }}
      </button>

      <el-dropdown v-if="collectStatus" trigger="click" @command="onCollectCommand">
        <button
          type="button"
          class="ai-anime-card__btn ai-anime-card__btn--collected"
          :disabled="collecting"
          @click.stop
        >
          {{ userAnimeStore.labelOf(collectStatus) }} ▾
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="wish">想看</el-dropdown-item>
            <el-dropdown-item command="watching">在看</el-dropdown-item>
            <el-dropdown-item command="done">看完</el-dropdown-item>
            <el-dropdown-item divided command="cancel">取消追番</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button
        v-else
        type="button"
        class="ai-anime-card__btn ai-anime-card__btn--collect"
        :disabled="collecting"
        @click.stop="onQuickWish"
      >
        {{ collecting ? '处理中…' : '+ 想看' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import type { IAiAnimeCard } from '@/api/ai'
import type { UserAnimeStatus } from '@/api/types'
import { useWatchRoom } from '@/composables/useWatchRoom'
import { useLoginStore } from '@/stores/modules/login'
import { useUserAnimeStore } from '@/stores/modules/userAnime'
import { bangumiImage } from '@/utils/bangumi-image'
import { track } from '@/utils/track'

const props = defineProps({
  card: {
    type: Object as PropType<IAiAnimeCard>,
    required: true,
  },
})

const router = useRouter()
const loginStore = useLoginStore()
const userAnimeStore = useUserAnimeStore()
const { roomLoading, enterOrCreateRoom } = useWatchRoom()

/**
 * 封面加载失败标记。
 *
 * Bangumi 的封面 URL 会失效（条目被合并、图片被清理），失败时直接换成
 * **本地**占位块而不是再指一个远端兜底图 —— 兜底图本身也可能挂，那样还是破图。
 */
const coverFailed = ref(false)
const collecting = ref(false)

/** 后端已把空的中文名兜底成原名，这里再兜一层防止两边都没值 */
const displayName = computed(() => props.card.nameCn || props.card.name || '未知条目')
const initial = computed(() => displayName.value.slice(0, 1))
const collectStatus = computed(() => userAnimeStore.statusOf(props.card.id))

/** 卡片是「模型不编造番剧」这条原则的落点：点进去看的就是工具返回的那个 subject_id */
function goDetail() {
  router.push({ name: 'Detail', params: { anime_id: String(props.card.id) } })
}

async function onWatchTogether() {
  const res = await enterOrCreateRoom({
    animeId: props.card.id,
    title: displayName.value,
    cover: props.card.cover,
    directCreate: true,
  })
  if (res) {
    track('ai.card.watch', {
      id: props.card.id,
      name: displayName.value,
      mode: res.mode,
    })
  }
}

function ensureLoggedIn(): boolean {
  if (!loginStore.token) {
    loginStore.requestLogin()
    ElNotification({ type: 'error', message: '您还没有登录' })
    return false
  }
  return true
}

async function onQuickWish() {
  if (!ensureLoggedIn() || collecting.value) return
  collecting.value = true
  try {
    await userAnimeStore.setStatus({
      bangumi_id: props.card.id,
      status: 'wish',
      title: props.card.name,
      name_cn: props.card.nameCn || undefined,
      cover: props.card.cover || undefined,
    })
    track('ai.card.collect', { id: props.card.id, status: 'wish' })
    ElNotification({ type: 'success', title: '已加入想看' })
  } finally {
    collecting.value = false
  }
}

async function onCollectCommand(cmd: string) {
  if (!ensureLoggedIn() || collecting.value) return
  collecting.value = true
  try {
    if (cmd === 'cancel') {
      await userAnimeStore.cancel(props.card.id)
      track('ai.card.collect', { id: props.card.id, status: 'cancel' })
      ElNotification({ type: 'success', title: '已取消追番' })
      return
    }
    const status = cmd as UserAnimeStatus
    await userAnimeStore.setStatus({
      bangumi_id: props.card.id,
      status,
      title: props.card.name,
      name_cn: props.card.nameCn || undefined,
      cover: props.card.cover || undefined,
    })
    track('ai.card.collect', { id: props.card.id, status })
    ElNotification({ type: 'success', title: `已标记为${userAnimeStore.labelOf(status)}` })
  } finally {
    collecting.value = false
  }
}
</script>

<style scoped lang="less">
.ai-anime-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 248px;
  max-width: 100%;
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

  &__top {
    display: flex;
    gap: 10px;
    min-width: 0;
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

  &__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(104, 198, 189, 0.12);
  }

  &__btn {
    height: 24px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, opacity 0.2s;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &--watch {
      flex: 1;
      border: 1px solid var(--primary-color);
      background: rgba(104, 198, 189, 0.14);
      color: var(--primary-color);

      &:hover:not(:disabled) {
        background: rgba(104, 198, 189, 0.26);
      }
    }

    &--collect {
      border: 1px solid rgba(104, 198, 189, 0.28);
      background: transparent;
      color: var(--font-color);

      &:hover:not(:disabled) {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }
    }

    &--collected {
      border: 1px solid rgba(104, 198, 189, 0.45);
      background: rgba(104, 198, 189, 0.08);
      color: var(--primary-color);

      &:hover:not(:disabled) {
        background: rgba(104, 198, 189, 0.18);
      }
    }
  }
}
</style>
