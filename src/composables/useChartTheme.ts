import { computed, ref } from 'vue'

/**
 * 图表配色 —— **从 CSS 变量实时读取**，而不是在 JS 里再抄一份色表。
 *
 * ECharts 画在 canvas 上读不到 CSS 变量，早期版本只好把颜色硬编码成暗色一套，
 * 结果亮色主题下坐标轴文字和网格线几乎看不见（图表背景是透明的，
 * 深浅两套色全糊在一起）。修法不是再抄一份亮色表 ——
 * 那样品牌色一改就要同步两处、必然漏 —— 而是运行时读令牌。
 *
 * 响应式的关键：`getComputedStyle` **本身不响应式**，所以 computed 里显式读一下
 * `themeVersion` 建立依赖。
 */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function currentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/**
 * 主题版本号：`<html data-theme>` 一变就 +1。
 *
 * 为什么监听 DOM，而不是复用 `useTheme()` 的 `mode`：
 * CSS 令牌挂在 `[data-theme]` 选择器上，**DOM 才是唯一事实来源**。
 * 只听 `mode` ref 的话，任何绕过 `useTheme` 改属性的路径
 * （index.html 的首屏内联脚本、将来可能有的设置页、外部脚本）
 * 都会让图表停在旧配色上，而且**完全静默** ——
 * 实测过：直接改属性时亮色主色像素命中 0，旧暗色仍有 1307 个。
 * MutationObserver 让这里与 CSS 永远同步，代价只是一个模块级 observer。
 */
const themeVersion = ref(0)
if (typeof window !== 'undefined') {
  new MutationObserver(() => {
    themeVersion.value += 1
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}

/** 图表用的一套语义色 */
export interface IChartColors {
  primary: string
  warn: string
  danger: string
  /** 第三个系列色。没有对应令牌，只能按主题给两档 */
  accent: string
  font: string
  fontDim: string
  split: string
  /** 面板底色，用于 tooltip 背景 */
  surface: string
}

export function useChartTheme() {
  // 读 themeVersion 建立响应式依赖；真实取值仍以 DOM 属性为准
  const isLight = computed(() => {
    void themeVersion.value
    return currentTheme() === 'light'
  })

  const colors = computed<IChartColors>(() => {
    // 显式建立对 themeVersion 的依赖：否则主题切换后读到的还是旧变量值
    void themeVersion.value
    return {
      primary: cssVar('--primary-color', '#68c6bd'),
      warn: cssVar('--warning-color', 'rgba(240, 173, 78, 1)'),
      danger: cssVar('--el-color-danger', 'rgba(245, 108, 108, 1)'),
      /*
       * 第三个系列色没有设计令牌，只能硬编码两档。
       * 亮色底上必须用更深的紫，否则和浅色背景的对比度不足（原亮色下就是这个问题）。
       */
      accent: isLight.value ? '#6b4fc7' : 'rgba(150, 130, 230, 1)',
      font: cssVar('--font-color', '#ffffff'),
      fontDim: cssVar('--font-unactive-color', 'rgba(255, 255, 255, 0.6)'),
      split: cssVar('--surface-strong', 'rgba(255, 255, 255, 0.08)'),
      surface: cssVar('--aside-bg-color', '#2f3042'),
    }
  })

  /** 折线与柱状通用的坐标轴样式 */
  const axisBase = computed(() => {
    const c = colors.value
    return {
      axisLine: { lineStyle: { color: c.split } },
      axisLabel: { color: c.fontDim, fontSize: 11 },
      splitLine: { lineStyle: { color: c.split } },
    }
  })

  /** 图例文字样式（两种主题都要显式给，默认色是给浅色底设计的） */
  const legendTextStyle = computed(() => ({
    color: colors.value.fontDim,
    fontSize: 11,
  }))

  /** tooltip 样式：默认是白底黑字，暗色主题下非常刺眼 */
  const tooltipStyle = computed(() => {
    const c = colors.value
    return {
      backgroundColor: c.surface,
      borderColor: c.split,
      borderWidth: 1,
      textStyle: { color: c.font, fontSize: 12 },
    }
  })

  return { isLight, colors, axisBase, legendTextStyle, tooltipStyle }
}
