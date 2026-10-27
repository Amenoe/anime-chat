<template>
  <el-drawer
    v-model="open"
    direction="rtl"
    :size="drawerSize"
    :title="`弹幕 · ${items.length} 条`"
    class="danmaku-drawer"
    destroy-on-close
  >
    <p v-if="!items.length" class="danmaku-list__empty">本集暂无弹幕</p>

    <div v-else ref="scrollRef" class="danmaku-list" @scroll.passive="onScroll">
      <!--
        虚拟列表：只渲染可视区域内的行。
        单集实测可达 3213 条，全量渲染会明显卡顿 —— 而弹幕行高固定，
        「scrollTop ÷ 行高」就能算出窗口，不需要引入虚拟滚动库。
      -->
      <!--
        虚拟列表：上下用占位 div 撑出滚动高度，中间只渲染可视区域。
        占位与行数据全程留在文档流内（不用 absolute + translateY），
        这样 scrollHeight 恒等于「总条数 × 行高」，不依赖重排时机。
      -->
      <div :style="{ height: `${offsetY}px` }" />
      <div v-for="row in visibleRows" :key="row.key" class="danmaku-list__row">
        <span class="danmaku-list__time">{{ row.timeLabel }}</span>
        <span class="danmaku-list__text" :style="{ color: row.color }" :title="row.text">
          {{ row.text }}
        </span>
      </div>
      <div :style="{ height: `${restHeight}px` }" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import type { Danmu } from 'artplayer-plugin-danmuku'

const props = defineProps<{
  modelValue: boolean
  /** 当前集的弹幕（与播放器同源） */
  items: Danmu[]
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

/** 单行固定高度：虚拟列表靠它算窗口，改这里要同步样式 */
const ROW_HEIGHT = 32
/** 上下各多渲染几行，滚动时不至于露出空白 */
const OVERSCAN = 6

const scrollRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)

/** 450px：比搜源抽屉(420)略宽，长弹幕能多显示几个字 */
const drawerSize = computed(() => (window.innerWidth <= 768 ? '100%' : 450))

interface Row {
  key: string
  timeLabel: string
  text: string
  color: string
}

/** mm:ss，超过一小时才补上小时位 */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * 行数据预先算好。
 * 不用 index 当 key：同一集内弹幕内容可能重复，时间+下标才唯一。
 */
const rows = computed<Row[]>(() =>
  props.items.map((item, index) => ({
    key: `${item.time ?? 0}-${index}`,
    timeLabel: formatTime(item.time ?? 0),
    text: item.text,
    color: item.color || 'inherit',
  })),
)

const totalHeight = computed(() => rows.value.length * ROW_HEIGHT)

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN))

const offsetY = computed(() => startIndex.value * ROW_HEIGHT)

/** 底部占位：总高 - 已渲染部分，保证滚动条长度始终等于总条数 */
const restHeight = computed(() => {
  const rendered = visibleRows.value.length * ROW_HEIGHT
  return Math.max(0, totalHeight.value - offsetY.value - rendered)
})

const visibleRows = computed(() => {
  const total = rows.value.length
  if (!total) return []
  const count = Math.ceil(viewportHeight.value / ROW_HEIGHT) + OVERSCAN * 2
  return rows.value.slice(startIndex.value, Math.min(total, startIndex.value + count))
})

function onScroll(event: Event) {
  scrollTop.value = (event.target as HTMLElement).scrollTop
}

/*
 * 抽屉是 destroy-on-close，每次打开都是新节点，
 * 所以要在打开后重新量一次可视高度（否则首屏按默认 600 算，行数可能不够铺满）。
 */
let observer: ResizeObserver | null = null

function measure() {
  const el = scrollRef.value
  if (!el) return
  viewportHeight.value = el.clientHeight || 600
}

watch(open, (value) => {
  if (!value) {
    observer?.disconnect()
    observer = null
    scrollTop.value = 0
    return
  }
  // 等抽屉动画与内容挂载完成再量
  void nextTick(() => {
    measure()
    const el = scrollRef.value
    if (!el) return
    observer = new ResizeObserver(measure)
    observer.observe(el)
  })
})

/** 换集时回到顶部，否则会停在上一集的滚动位置 */
watch(
  () => props.items,
  () => {
    scrollTop.value = 0
    if (scrollRef.value) scrollRef.value.scrollTop = 0
  },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<style scoped lang="less">
.danmaku-list {
  height: 100%;
  overflow-y: auto;

  &__empty {
    padding: 40px 0;
    color: var(--font-unactive-color);
    text-align: center;
  }

  &__row {
    display: flex;
    gap: 10px;
    align-items: center;
    height: 32px;
    padding: 0 4px;
    font-size: 13px;
    border-radius: 4px;

    &:hover {
      background: rgb(255 255 255 / 4%);
    }
  }

  // 时间轴等宽，让弹幕文本左边缘对齐
  &__time {
    flex: 0 0 auto;
    font-family: var(--el-font-family-mono, monospace);
    font-size: 12px;
    color: var(--font-unactive-color);
    font-variant-numeric: tabular-nums;
  }

  &__text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
