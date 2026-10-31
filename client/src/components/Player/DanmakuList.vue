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
        <span class="danmaku-list__text" :style="row.style" :title="row.text">
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

/*
 * 主题判断**直接读 DOM 属性**，不用 useTheme().isDark。
 *
 * 踩过：CSS 令牌挂在 `[data-theme]` 选择器上，DOM 才是唯一事实来源；
 * 任何绕过 useTheme 改属性的路径（首屏内联脚本、将来的设置页、测试脚本）
 * 都会让 ref 停在旧值，表现为「切了亮色主题但颜色没适配」。
 */
const themeAttr = ref(document.documentElement.getAttribute('data-theme') || 'dark')
const isDark = computed(() => themeAttr.value === 'dark')

let themeObserver: MutationObserver | null = null

onMounted(() => {
  const sync = () => {
    themeAttr.value = document.documentElement.getAttribute('data-theme') || 'dark'
  }
  sync()
  themeObserver = new MutationObserver(sync)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

/**
 * WCAG 相对亮度（含 sRGB 线性化）。
 *
 * 不能用 `0.299R+0.587G+0.114B` 这种简化式：它算出的亮度和实际对比度对不上，
 * 实测过亮色主题下纯黄 `#ffdd00` 被判成「够亮可以保留」，而它和白底对比只有 1.3:1。
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function parseHex(color: string): [number, number, number] | null {
  const matched = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!matched) return null
  const value = parseInt(matched[1], 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** 与背景的 WCAG 对比度（白底 L=1，暗底取 0） */
function contrastRatio(rgb: [number, number, number], dark: boolean): number {
  const l = relativeLuminance(rgb)
  return dark ? (l + 0.05) / 0.05 : 1.05 / (l + 0.05)
}

/** 目标：正文级可读性的下限（WCAG AA 对普通文本是 4.5，这里取 3 兼顾彩色弹幕的辨识度） */
const MIN_CONTRAST = 3

/**
 * 把弹幕原始颜色适配到当前主题。
 *
 * 弹幕颜色是为「视频画面 + 黑描边」设计的，绝大多数是纯白 ——
 * 搬进亮色抽屉（白底）就彻底看不见了。
 *
 * 做法是**压暗/提亮但保留色相**，而不是一律换成主题色：
 * 全换成主题色会让列表变成一片单色，而弹幕颜色本身是用户给自己打的标记。
 * 已经达标的颜色原样返回，不动它。
 */
function adaptColor(color: string | undefined, dark: boolean): string | undefined {
  if (!color) return undefined
  const original = parseHex(color)
  if (!original) return undefined
  if (contrastRatio(original, dark) >= MIN_CONTRAST) return undefined // undefined = 用原色

  let current: [number, number, number] = original
  for (let i = 0; i < 16; i++) {
    const scale = dark
      ? current.map((v) => Math.min(255, v * 1.22 + 14))
      : current.map((v) => v * 0.84)
    current = [scale[0], scale[1], scale[2]]
    if (contrastRatio(current, dark) >= MIN_CONTRAST) break
  }
  return toHex(current)
}

interface Row {
  key: string
  timeLabel: string
  text: string
  /** 为空表示原色已达标，交给内联样式；否则是适配后的颜色 */
  style?: Record<string, string>
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
    // isDark 也是依赖：切主题时要重新计算每条弹幕颜色的适配值
    style: adaptColor(item.color, isDark.value)
      ? { color: adaptColor(item.color, isDark.value)! }
      : undefined,
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
    // 兜底：弹幕原始颜色不可读时（内联 style 缺失）用当前主题的文字色
    color: var(--font-color);
  }
}
</style>
