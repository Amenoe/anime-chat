<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    size="420px"
    :title="title"
    class="search-drawer"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <div class="search-drawer__body">
      <div v-if="searching" class="search-drawer__hint">搜索中，有结果可直接选定（后台继续搜）</div>
      <div v-if="!rows.length && !searching" class="search-drawer__empty">
        <el-empty description="暂无可用站点" />
      </div>
      <div
        v-for="row in rows"
        :key="row.key"
        class="search-row"
        :class="`search-row--${row.status}`"
      >
        <el-avatar :size="36" :src="row.iconUrl || undefined" class="search-row__avatar">
          {{ (row.name || '?').slice(0, 1) }}
        </el-avatar>
        <div class="search-row__main">
          <div class="search-row__head">
            <span class="search-row__kind">{{ row.factoryId === 'rss' ? 'BT' : '流' }}</span>
            <span class="search-row__name" :title="row.name">{{ row.name }}</span>
            <span class="search-row__st">{{ statusText(row.status) }}</span>
          </div>
          <div v-if="row.error" class="search-row__err">{{ row.error }}</div>
          <div v-if="row.candidates.length" class="search-row__hits">
            <button
              v-for="(c, i) in row.candidates.slice(0, 8)"
              :key="i + c.uri"
              :ref="(el) => setHitRef(candidateKey(c), el)"
              type="button"
              class="hit"
              :class="{ 'is-active': candidateKey(c) === currentSourceKey }"
              :disabled="creating || candidateKey(c) === currentSourceKey"
              :title="c.uri"
              @click="emit('select', c)"
            >
              <span class="hit__kind">{{
                c.kind === 'bt' ? 'BT' : c.resolved ? '直链' : '线路'
              }}</span>
              <span class="hit__title">{{ c.title || c.channel || c.uri }}</span>
              <span v-if="qualityOf(c)" class="hit__quality">{{ qualityOf(c) }}</span>
              <span class="hit__play">{{
                candidateKey(c) === currentSourceKey ? '已选定' : creating ? '…' : '选定'
              }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import type { PlayCandidate } from '@/api/playback'
import type { SearchRow, RowStatus } from '@/composables/useSourceSearch'
import { qualityOf } from '@/utils/source-quality'

const props = defineProps<{
  modelValue: boolean
  rows: SearchRow[]
  searching: boolean
  creating: boolean
  currentSourceKey: string
  title: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [c: PlayCandidate]
  closed: []
}>()

function candidateKey(c: PlayCandidate) {
  return `${c.kind}::${c.uri}`
}

function statusText(st: RowStatus) {
  const m: Record<RowStatus, string> = {
    pending: '等待',
    searching: '搜索中',
    done: '有结果',
    empty: '无结果',
    error: '失败',
  }
  return m[st]
}

/** hit 元素引用：candidateKey → element，用于滚动定位当前源 */
const hitEls = new Map<string, HTMLElement | null>()

function setHitRef(key: string, el: unknown) {
  if (el) hitEls.set(key, el as HTMLElement)
  else hitEls.delete(key)
}

function scrollToActiveSource(): boolean {
  const key = props.currentSourceKey
  if (!key) return false
  const el = hitEls.get(key)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return true
}

/** 打开抽屉后滚动到当前源：元素已渲染则立即滚；否则轮询等待候选出现（不阻塞搜索完成） */
let pendingScrollTimer: ReturnType<typeof setInterval> | null = null
let pendingScrollDeadline = 0

function scheduleScrollToActive() {
  if (pendingScrollTimer) {
    clearInterval(pendingScrollTimer)
    pendingScrollTimer = null
  }
  if (!props.modelValue || !props.currentSourceKey) return
  pendingScrollDeadline = Date.now() + 30_000
  pendingScrollTimer = setInterval(() => {
    if (!props.modelValue || !props.currentSourceKey) {
      clearPendingScrollTimer()
      return
    }
    if (scrollToActiveSource()) {
      clearPendingScrollTimer()
      return
    }
    if (Date.now() > pendingScrollDeadline) {
      clearPendingScrollTimer()
    }
  }, 200)
}

function clearPendingScrollTimer() {
  if (pendingScrollTimer) {
    clearInterval(pendingScrollTimer)
    pendingScrollTimer = null
  }
}

// 抽屉打开 / 当前源变化 / 搜索状态变化 → 调度滚动定位
watch([() => props.modelValue, () => props.currentSourceKey, () => props.searching], () =>
  scheduleScrollToActive(),
)

onBeforeUnmount(() => {
  clearPendingScrollTimer()
  hitEls.clear()
})
</script>

<style scoped lang="less">
.search-drawer {
  &__body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 24px;
  }

  &__hint {
    font-size: 12px;
    color: var(--primary-color);
    padding: 0 2px 4px;
  }

  &__empty {
    padding: 24px 0;
  }
}

.search-row {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.12);

  &--searching {
    border-color: rgba(104, 198, 189, 0.4);
  }
  &--done {
    border-color: rgba(104, 198, 189, 0.55);
  }
  &--error {
    border-color: rgba(245, 108, 108, 0.4);
  }

  &__avatar {
    flex-shrink: 0;
    background: #1e1d2b;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__kind {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
    border: 1px solid rgba(104, 198, 189, 0.4);
    border-radius: 6px;
    padding: 1px 6px;
  }

  &__name {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__st {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__err {
    margin-top: 4px;
    font-size: 12px;
    color: var(--warning-color);
  }

  &__hits {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
}

.hit {
  display: grid;
  grid-template-columns: 28px 1fr auto auto;
  gap: 8px;
  align-items: center;
  text-align: left;
  border: 1px solid rgba(104, 198, 189, 0.25);
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(104, 198, 189, 0.06);
  color: var(--font-color);
  cursor: pointer;
  font-size: 12px;

  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    background: rgba(104, 198, 189, 0.14);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &.is-active {
    opacity: 1;
    border-color: var(--primary-color);
    background: rgba(104, 198, 189, 0.18);
    cursor: default;

    .hit__play {
      color: var(--primary-color);
    }
  }

  &__kind {
    font-weight: 700;
    color: var(--primary-color);
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__quality {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
    padding: 0 6px;
    border-radius: 5px;
    background: rgba(104, 198, 189, 0.14);
  }

  &__play {
    color: var(--primary-color);
    font-weight: 600;
  }
}

@media (max-width: 768px) {
  .search-drawer {
    :deep(.el-drawer) {
      width: 100% !important;
    }
  }
}
</style>
