<template>
  <div ref="hostRef" class="app-chart" :style="{ height: cssHeight }"></div>
</template>

<script setup lang="ts">
import echarts, { type EChartsOption } from '@/utils/echarts'

const props = withDefaults(
  defineProps<{
    option: EChartsOption
    /** 容器高度，数字按 px 处理 */
    height?: number | string
    loading?: boolean
  }>(),
  { height: 280, loading: false },
)

const hostRef = ref<HTMLDivElement>()
const cssHeight = computed(() =>
  typeof props.height === 'number' ? `${props.height}px` : props.height,
)

/**
 * 用 `ReturnType<typeof echarts.init>` 而不是具名类型：
 * echarts 在 5.x→6.x 之间把 `ECharts` 改名成了 `EChartsType`（旧名仅保留别名），
 * 推断写法跨版本都不会因改名而挂。
 */
let chart: ReturnType<typeof echarts.init> | null = null
let observer: ResizeObserver | null = null

const LOADING_OPTS = {
  text: '加载中',
  color: 'rgba(104, 198, 189, 1)',
  textColor: 'rgba(255, 255, 255, 0.65)',
  maskColor: 'rgba(34, 36, 51, 0.6)',
}

/**
 * `notMerge: true` 是**必须**的。
 * 默认的合并语义下，切换天数后若新数据系列变少（例如某个事件类型消失），
 * 旧系列会原样留在图上 —— 表现为「明明选了 7 天，却还画着 30 天的线」。
 */
watch(
  () => props.option,
  (opt) => chart?.setOption(opt, { notMerge: true }),
  { deep: true },
)

watch(
  () => props.loading,
  (v) => {
    if (!chart) return
    if (v) {
      chart.showLoading('default', LOADING_OPTS)
    } else {
      chart.hideLoading()
    }
  },
)

onMounted(() => {
  if (!hostRef.value) return
  chart = echarts.init(hostRef.value, undefined, { renderer: 'canvas' })
  chart.setOption(props.option, { notMerge: true })
  if (props.loading) {
    chart.showLoading('default', LOADING_OPTS)
  }

  // 侧边栏折叠、窗口缩放、移动端切布局都会改变容器宽度，
  // 而 echarts 不会自己感知 —— 不 resize 就会「图只画了左半边，右边一片空白」。
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(hostRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  // 必须 dispose：它注册了 window 级监听并持有 canvas，不释放会泄漏
  chart?.dispose()
  chart = null
})
</script>

<style scoped lang="less">
.app-chart {
  width: 100%;
}
</style>
