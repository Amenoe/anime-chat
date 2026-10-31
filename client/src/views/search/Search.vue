<template>
  <div id="search" class="page search-page">
    <div class="search-sticky">
      <div class="search-bar">
        <el-input
          v-model="searchText"
          class="search-input"
          clearable
          placeholder="请输入搜索的动漫名称，回车搜索"
          @keyup.enter="onSearch"
          @clear="onClear"
        >
          <template #append>
            <el-button :icon="Search" :loading="loading" @click="onSearch" />
          </template>
        </el-input>
      </div>

      <div class="search-toolbar">
        <div class="toolbar-row">
          <span class="toolbar-label">排序</span>
          <el-radio-group v-model="sortMode" size="small" @change="onSortChange">
            <el-radio-button v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div class="toolbar-row filters">
          <span class="toolbar-label">筛选</span>
          <el-select
            v-for="cat in tagCategories"
            :key="cat.key"
            v-model="selectedTags[cat.key]"
            clearable
            filterable
            :placeholder="cat.label"
            class="filter-chip"
          >
            <el-option v-for="tag in cat.options" :key="tag" :label="tag" :value="tag" />
          </el-select>
          <el-button v-if="hasActiveTags" size="small" class="filter-reset" @click="resetFilters">
            重置
          </el-button>
        </div>

        <p v-if="sortMode === 'date'" class="toolbar-hint">
          「发布日期」接口无对应 sort，当前对已返回结果按放送日前端排序
        </p>
      </div>
    </div>

    <div v-loading="loading" class="search-body">
      <transition name="search-fade" mode="out-in">
        <div v-if="loading && !searchList.length" key="skeleton" class="search-grid">
          <div v-for="n in 8" :key="n" class="anime-card anime-card--skeleton">
            <div class="anime-card__cover skeleton-block" />
            <div class="anime-card__name skeleton-line" />
          </div>
        </div>

        <div v-else-if="searched && !searchList.length" key="empty" class="search-empty">
          <el-empty description="没有找到相关动漫，换个关键词或标签试试" />
        </div>

        <div v-else-if="searchList.length" key="list" class="search-grid">
          <div
            v-for="item in displayList"
            :key="item.id"
            v-track="{ event: 'search.result.click', props: { id: item.id } }"
            class="anime-card"
            @click="animeClick(item.id)"
          >
            <div class="anime-card__cover">
              <img :src="item.images?.common || defaultCover" :alt="item.name_cn || item.name" />
              <div class="anime-card__overlay">
                <span v-if="item.rating?.score" class="anime-card__score">
                  {{ item.rating.score.toFixed(1) }}
                </span>
              </div>
            </div>
            <div class="anime-card__name" :title="item.name_cn || item.name">
              {{ item.name_cn || item.name }}
            </div>
            <div class="anime-card__meta">
              <span v-if="item.date">{{ item.date }}</span>
              <span v-if="item.rating?.rank">#{{ item.rating.rank }}</span>
            </div>
          </div>
        </div>

        <div v-else key="idle" class="search-empty">
          <el-empty description="输入关键词或选择标签开始搜索" />
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import { searchAnime, type BangumiSearchSort } from '@/api/search'
import type { IBangumiSubject } from '@/api/types'
import { SEARCH_META_TAG_CATEGORIES } from '@/constants/bangumi-meta-tags'
import { track } from '@/utils/track'

defineOptions({ name: 'Search' })

type SortMode = BangumiSearchSort | 'date'

const defaultCover = 'https://bgm.tv/img/no_icon_subject.png'
const tagCategories = SEARCH_META_TAG_CATEGORIES

const searchText = ref('')
const searchList = ref<IBangumiSubject[]>([])
const loading = ref(false)
const searched = ref(false)
const sortMode = ref<SortMode>('match')

/** 各分类下选中的公共标签（每类单选） */
const selectedTags = reactive(
  Object.fromEntries(SEARCH_META_TAG_CATEGORIES.map((c) => [c.key, ''])) as Record<string, string>,
)

const sortOptions: Array<{ label: string; value: SortMode }> = [
  { label: '最佳匹配', value: 'match' },
  { label: '最高排名', value: 'rank' },
  { label: '最多收藏', value: 'heat' },
  { label: '发布日期', value: 'date' },
]

const activeTagList = computed(() =>
  Object.values(selectedTags).filter((t): t is string => Boolean(t && t.trim())),
)

const hasActiveTags = computed(() => activeTagList.value.length > 0)

/** 发布日期为前端排序；其余走 Bangumi sort */
const displayList = computed(() => {
  if (sortMode.value !== 'date') return searchList.value
  return [...searchList.value].sort((a, b) => {
    const da = a.date || ''
    const db = b.date || ''
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return db.localeCompare(da)
  })
})

function buildFilter() {
  const meta_tags = activeTagList.value
  return {
    type: [2],
    nsfw: false as boolean,
    ...(meta_tags.length ? { meta_tags } : {}),
  }
}

function apiSort(): BangumiSearchSort {
  if (sortMode.value === 'date') return 'match'
  return sortMode.value
}

/** 仅当有关键词时才允许发起搜索（标签/排序只作条件，确认搜索后生效） */
function canQuery() {
  return Boolean(searchText.value.trim())
}

/**
 * 真正执行搜索（**不计数**）。
 *
 * 与 `onSearch` 拆开是为了消除一个很隐蔽的坑：
 * 模板里写 `@click="onSearch"` 时，Vue 会把**事件对象**当第一个实参传进去，
 * 所以「用参数区分是否计数」的写法必然失效 —— 事件对象是真值。
 * 实测后果：`search.submit` 一次都没上报，看板上「手动搜索次数」永远是 0、
 * 「AI 使用率」永远是 100%，而且完全不报错。
 * 现在改成两个入口函数各自决定要不要计数，不存在「参数被事件对象顶掉」的可能。
 */
async function runSearch() {
  const keyword = searchText.value.trim()
  if (!keyword) {
    searchList.value = []
    searched.value = false
    return
  }

  loading.value = true
  searched.value = true
  try {
    const res = await searchAnime({
      keyword,
      sort: apiSort(),
      filter: buildFilter(),
      limit: 24,
      offset: 0,
    })
    searchList.value = res.data ?? []
  } catch {
    searchList.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 用户主动发起搜索（按钮 / 回车）—— 计一次「手动搜索」。
 *
 * 埋点**不记关键词**：项目既有约定是不把业务内容写进埋点表
 * （`page.view` 也只记路由名不记完整 URL）。这里只记是否用了标签/排序条件，
 * 够回答「高级筛选有没有人用」，又不至于变成一份搜索词流水。
 *
 * 计数发生在**请求之前**：口径要和后端的 `ai.chat` 对齐 ——
 * 那个事件是「发起了一轮对话」就算，不看成功与否，
 * 否则网络抖动会让「AI 使用率」凭空偏高。
 */
async function onSearch() {
  if (canQuery()) {
    track('search.submit', {
      filtered: Object.values(selectedTags).some(Boolean) || sortMode.value !== 'match',
    })
  }
  await runSearch()
}

function onClear() {
  searchText.value = ''
  searchList.value = []
  searched.value = false
}

/** 已有结果时切换排序才重搜；未搜过不因排序单独请求 */
function onSortChange() {
  if (!searched.value || !canQuery()) return
  if (sortMode.value === 'date' && searchList.value.length) return
  // 换排序是**重发**而不是新的搜索意图：若计进 search.submit，
  // 分母会被灌水、看板的「AI 使用率」凭空偏低。所以走 runSearch 而不是 onSearch。
  void runSearch()
}

/** 只清空标签条件，不请求接口 */
function resetFilters() {
  for (const key of Object.keys(selectedTags)) {
    selectedTags[key] = ''
  }
}

const router = useRouter()
const animeClick = (id: number) => {
  router.push('/detail/' + id)
}
</script>

<style scoped lang="less">
/* 固定在 main 可视区内：顶栏不滚，结果区独立滚动 */
.search-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.search-sticky {
  flex-shrink: 0;
}

.search-bar {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.search-input {
  width: min(520px, 100%);
  height: 40px;
}

.search-toolbar {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.12);
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;

  & + & {
    margin-top: 12px;
  }
}

.toolbar-label {
  flex-shrink: 0;
  width: 36px;
  font-size: 13px;
  color: var(--font-unactive-color);
  border-left: 3px solid var(--primary-color);
  padding-left: 8px;
}

.filters {
  .filter-chip {
    width: 118px;
  }

  .filter-reset {
    margin-left: 4px;
  }
}

.toolbar-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--font-unactive-color);
  line-height: 1.4;
}

.search-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 12px;
}

.search-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  width: 100%;
}

.anime-card {
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.25s ease;
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
    background: linear-gradient(transparent 55%, rgba(0, 0, 0, 0.65));
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 8px;
  }

  &__score {
    background: var(--primary-color);
    color: #1e1d2b;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  &__name {
    padding: 8px 10px 2px;
    font-size: 13px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 0 10px 10px;
    font-size: 11px;
    color: var(--font-unactive-color);
  }

  &--skeleton {
    pointer-events: none;
    cursor: default;

    &:hover {
      transform: none;
      box-shadow: none;
    }
  }
}

.skeleton-block {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(
    90deg,
    var(--skeleton-base) 25%,
    var(--skeleton-shine) 37%,
    var(--skeleton-base) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-shine 1.4s ease infinite;
}

.skeleton-line {
  height: 14px;
  margin: 12px 10px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--skeleton-base) 25%,
    var(--skeleton-shine) 37%,
    var(--skeleton-base) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-shine 1.4s ease infinite;
}

@keyframes skeleton-shine {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

.search-empty {
  padding: 48px 0;
}

.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 768px) {
  .search-toolbar {
    padding: 12px;
  }
  .filters .filter-chip {
    width: calc(50% - 6px);
    min-width: 110px;
  }
}
</style>
