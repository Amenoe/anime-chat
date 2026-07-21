<template>
  <div id="detail" class="page">
    <!-- 骨架屏 -->
    <div v-if="loading" class="sk">
      <div class="sk__hero">
        <div class="sk__cover sk-shine" />
        <div class="sk__meta">
          <div class="sk-shine" style="width: 200px; height: 26px" />
          <div class="sk-shine" style="width: 140px; height: 14px" />
          <div class="sk__stat-row">
            <div class="sk-shine" style="width: 60px; height: 40px; border-radius: 8px" />
            <div class="sk-shine" style="width: 60px; height: 40px; border-radius: 8px" />
            <div class="sk-shine" style="width: 60px; height: 40px; border-radius: 8px" />
          </div>
          <div class="sk__tag-row">
            <span v-for="i in 5" :key="i" class="sk-shine sk__tag" />
          </div>
          <div class="sk-shine" style="width: 100%; height: 12px" />
          <div class="sk-shine" style="width: 85%; height: 12px" />
          <div class="sk-shine" style="width: 60%; height: 12px" />
        </div>
      </div>
      <div class="sk__section sk-shine" style="width: 80px; height: 20px; margin-top: 28px" />
      <div class="sk__eps">
        <div v-for="i in 8" :key="i" class="sk-shine sk__ep" />
      </div>
    </div>

    <!-- 真实内容 -->
    <template v-else-if="detailData">
      <!-- Hero 区 -->
      <div class="hero">
        <div class="hero__cover">
          <img :src="detailData.images?.large" alt="" />
        </div>
        <div class="hero__meta">
          <h1 class="hero__title">{{ displayName }}</h1>
          <p v-if="detailData.name !== detailData.name_cn" class="hero__subtitle">
            {{ detailData.name }}
          </p>

          <!-- 数据统计卡片 -->
          <div class="stat-row">
            <div class="stat-card">
              <span class="stat-card__value">{{
                detailData.rating?.score?.toFixed(1) ?? '-'
              }}</span>
              <span class="stat-card__label">评分</span>
            </div>
            <div v-if="detailData.rating?.rank" class="stat-card">
              <span class="stat-card__value">#{{ detailData.rating.rank }}</span>
              <span class="stat-card__label">排名</span>
            </div>
            <div class="stat-card">
              <span class="stat-card__value">{{ status }}</span>
              <span class="stat-card__label">集数</span>
            </div>
            <div v-if="detailData.date" class="stat-card">
              <span class="stat-card__value">{{ detailData.date }}</span>
              <span class="stat-card__label">播出日期</span>
            </div>
          </div>

          <!-- 标签 -->
          <div v-if="detailData.tags?.length" class="tag-row">
            <span v-for="tag in detailData.tags.slice(0, 10)" :key="tag.name" class="anime-tag">
              {{ tag.name }}
            </span>
          </div>

          <!-- 收藏统计 -->
          <div v-if="detailData.collection" class="collection-row">
            <span class="collection-item">{{ detailData.collection.doing }} 人在看</span>
            <span class="collection-item">{{ detailData.collection.collect }} 人看过</span>
            <span class="collection-item">{{ detailData.collection.wish }} 人想看</span>
          </div>

          <!-- 制作信息 -->
          <div v-if="infoItems.length" class="info-row">
            <div v-for="item in infoItems" :key="item.key" class="info-item">
              <span class="info-item__label">{{ item.key }}</span>
              <span class="info-item__value">{{ item.val }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 简介 -->
      <section v-if="detailData.summary" class="section">
        <div class="section__header">
          <span class="section__title">简介</span>
        </div>
        <p class="summary">{{ detailData.summary }}</p>
      </section>

      <!-- 剧集列表 -->
      <section v-if="episodes.length" class="section">
        <div class="section__header">
          <span class="section__title">剧集</span>
          <span class="section__count">共 {{ episodes.length }} 话</span>
        </div>
        <div class="ep-grid">
          <div v-for="ep in episodes" :key="ep.id" class="ep-card" :title="ep.name_cn || ep.name">
            <span class="ep-card__num">{{ ep.sort }}</span>
            <div class="ep-card__info">
              <span class="ep-card__name">{{ ep.name_cn || ep.name }}</span>
              <span v-if="ep.airdate" class="ep-card__date">{{ ep.airdate }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 操作按钮 -->
      <div class="action-bar">
        <el-dropdown
          trigger="click"
          popper-class="detail-collect-dropdown"
          @command="onCollectCommand"
        >
          <button class="action-btn action-btn--ghost">
            {{ collectBtnText }}
            <span class="action-btn__caret">▾</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="wish">想看</el-dropdown-item>
              <el-dropdown-item command="watching">在看</el-dropdown-item>
              <el-dropdown-item command="done">看完</el-dropdown-item>
              <el-dropdown-item v-if="userAnimeStore.current" divided command="cancel">
                取消追番
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button class="action-btn action-btn--primary" @click="newChatClick">加入聊天室</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useHomeStore } from '@/stores/modules/home'
import { useLoginStore } from '@/stores/modules/login'
import { useUserAnimeStore } from '@/stores/modules/userAnime'
import type { UserAnimeStatus } from '@/api/types'

const router = useRouter()
const route = useRoute()
const anime_id = Number(route.params.anime_id)

const homeStore = useHomeStore()
const loginStore = useLoginStore()
const userAnimeStore = useUserAnimeStore()

homeStore.detailDataAction(anime_id)

const loading = computed(() => homeStore.detailLoading)
const detailData = computed(() => homeStore.animeDetail)
const episodes = computed(() => homeStore.episodes)
const displayName = computed(() => detailData.value?.name_cn || detailData.value?.name || '')

const status = computed(() => {
  const eps = detailData.value?.eps ?? 0
  const loaded = episodes.value.length
  return eps > 0 ? `${loaded}/${eps}` : `${loaded}`
})

const infoItems = computed(() => {
  const box = detailData.value?.infobox
  if (!box) return []
  const pick = ['导演', '原作', '音乐', '制作', '动画制作', '脚本']
  return box
    .filter((i) => pick.includes(i.key))
    .map((i) => ({
      key: i.key,
      val: typeof i.value === 'string' ? i.value : i.value.map((v) => v.v).join('、'),
    }))
    .slice(0, 4)
})

const collectBtnText = computed(() => {
  const cur = userAnimeStore.current
  if (!cur) return '追番'
  return userAnimeStore.labelOf(cur.status)
})

watch(
  () => [loginStore.token, anime_id] as const,
  ([token]) => {
    if (token) {
      userAnimeStore.fetchOne(anime_id).catch(() => {
        userAnimeStore.current = null
      })
    } else {
      userAnimeStore.current = null
    }
  },
  { immediate: true },
)

const ensureLogin = () => {
  if (loginStore.token === '') {
    ElNotification({ type: 'error', message: '您还没有登录' })
    return false
  }
  return true
}

const newChatClick = () => {
  if (!ensureLogin()) return
  router.push('/chat')
}

async function onCollectCommand(cmd: string) {
  if (!ensureLogin()) return
  if (cmd === 'cancel') {
    await userAnimeStore.cancel(anime_id)
    ElNotification({ type: 'success', title: '已取消追番' })
    return
  }
  const d = detailData.value
  await userAnimeStore.setStatus({
    bangumi_id: anime_id,
    status: cmd as UserAnimeStatus,
    title: d?.name,
    name_cn: d?.name_cn,
    cover: d?.images?.large || d?.images?.common,
  })
  ElNotification({
    type: 'success',
    title: `已标记为${userAnimeStore.labelOf(cmd as UserAnimeStatus)}`,
  })
}
</script>

<style scoped lang="less">
@import '~styles/page';

@accent: var(--primary-color);
@card-bg: var(--aside-bg-color);

// ── 骨架屏 ──
.sk-shine {
  background: linear-gradient(110deg, @card-bg 30%, rgba(104, 198, 189, 0.08) 50%, @card-bg 70%);
  background-size: 200% 100%;
  animation: sk-shimmer 1.6s ease-in-out infinite;
  border-radius: 6px;
}

@keyframes sk-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.sk {
  &__hero {
    display: flex;
    gap: 24px;
  }
  &__cover {
    width: 220px;
    height: 310px;
    border-radius: 12px;
    flex-shrink: 0;
  }
  &__meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 6px;
  }
  &__stat-row {
    display: flex;
    gap: 10px;
  }
  &__tag-row {
    display: flex;
    gap: 8px;
  }
  &__tag {
    width: 50px;
    height: 22px;
    border-radius: 10px;
  }
  &__section {
    border-radius: 4px;
  }
  &__eps {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  &__ep {
    width: 160px;
    height: 52px;
    border-radius: 8px;
  }
}

// ── Hero 区 ──
.hero {
  display: flex;
  gap: 24px;

  &__cover {
    width: 220px;
    flex-shrink: 0;

    img {
      width: 100%;
      border-radius: 12px;
      display: block;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    }
  }

  &__meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__title {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.3;
    margin: 0;
  }

  &__subtitle {
    font-size: 13px;
    color: var(--font-unactive-color);
    margin: -4px 0 0;
  }
}

// ── 数据卡片 ──
.stat-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stat-card {
  background: @card-bg;
  border-radius: 10px;
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 56px;

  &__value {
    font-size: 16px;
    font-weight: 700;
    color: @accent;
    white-space: nowrap;
  }

  &__label {
    font-size: 11px;
    color: var(--font-unactive-color);
  }
}

// ── 标签 ──
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.anime-tag {
  background: @card-bg;
  color: var(--font-color);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid rgba(104, 198, 189, 0.15);
  transition: border-color 0.2s, color 0.2s;

  &:hover {
    border-color: @accent;
    color: @accent;
  }
}

// ── 收藏统计 ──
.collection-row {
  display: flex;
  gap: 16px;
}

.collection-item {
  font-size: 12px;
  color: var(--font-unactive-color);
}

// ── 制作信息 ──
.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}

.info-item {
  font-size: 12px;

  &__label {
    color: var(--font-unactive-color);
    margin-right: 6px;
  }

  &__value {
    color: var(--font-color);
  }
}

// ── Section 通用 ──
.section {
  margin-top: 28px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding-left: 12px;
    border-left: 4px solid @accent;
  }

  &__title {
    font-size: 18px;
    font-weight: 700;
  }

  &__count {
    font-size: 12px;
    color: var(--font-unactive-color);
  }
}

.summary {
  font-size: 13px;
  line-height: 1.8;
  color: var(--font-unactive-color);
  margin: 0;
  white-space: pre-line;
}

// ── 剧集网格 ──
.ep-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.ep-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: @card-bg;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: default;
  transition: background 0.2s, box-shadow 0.2s;
  border: 1px solid transparent;

  &:hover {
    border-color: rgba(104, 198, 189, 0.25);
    box-shadow: 0 0 12px rgba(104, 198, 189, 0.15);
  }

  &__num {
    font-size: 18px;
    font-weight: 700;
    color: @accent;
    width: 28px;
    text-align: center;
    flex-shrink: 0;
  }

  &__info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__name {
    font-size: 12px;
    color: var(--font-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__date {
    font-size: 11px;
    color: var(--font-unactive-color);
  }
}

// ── 操作按钮 ──
.action-bar {
  margin-top: 32px;
  padding-bottom: 12px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.action-btn {
  border: none;
  border-radius: 10px;
  padding: 10px 28px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;

  &--primary {
    background: @accent;
    color: #fff;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(104, 198, 189, 0.4);
    }
  }

  &--ghost {
    background: transparent;
    color: @accent;
    border: 1px solid rgba(104, 198, 189, 0.55);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 12px rgba(104, 198, 189, 0.2);
    }
  }

  &__caret {
    margin-left: 6px;
    opacity: 0.8;
  }
}

// ── 响应式 ──
@media (max-width: 768px) {
  .hero {
    flex-direction: column;
    align-items: center;
    text-align: center;

    &__cover {
      width: 160px;
    }
    &__title {
      font-size: 20px;
    }
  }

  .stat-row {
    justify-content: center;
  }
  .tag-row {
    justify-content: center;
  }
  .collection-row {
    justify-content: center;
  }
  .info-row {
    justify-content: center;
  }
  .ep-grid {
    grid-template-columns: 1fr 1fr;
  }

  .sk {
    &__hero {
      flex-direction: column;
      align-items: center;
    }
    &__cover {
      width: 160px;
      height: 220px;
    }
  }
}
</style>

<!-- 下拉挂载到 body，需非 scoped 才能命中 popper-class -->
<style lang="less">
.detail-collect-dropdown {
  background-color: var(--aside-bg-color) !important;
  border: 1px solid rgba(104, 198, 189, 0.2) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;

  .el-dropdown-menu {
    background-color: transparent;
    border: none;
    padding: 4px 0;
  }

  .el-dropdown-menu__item {
    color: #fff;
    background-color: transparent;

    &:hover,
    &:focus {
      background-color: var(--bg-color) !important;
      color: var(--primary-color) !important;
    }

    &.is-disabled {
      color: var(--font-unactive-color);
    }
  }

  .el-dropdown-menu__item--divided {
    border-top: 1px solid rgba(104, 198, 189, 0.2);
    margin-top: 4px;

    &::before {
      background-color: transparent;
      height: 0;
    }
  }

  .el-popper__arrow::before {
    background: var(--aside-bg-color) !important;
    border: 1px solid rgba(104, 198, 189, 0.2) !important;
  }
}
</style>
