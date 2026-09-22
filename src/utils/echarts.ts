/**
 * ECharts 按需注册。
 *
 * **只在这一处**注册图表类型与组件。为什么不直接 `import * as echarts from 'echarts'`：
 * 全量入口会把所有图表类型、坐标系、地图都打进包里（压缩后仍有数百 KB），
 * 而看板只用到折线/柱状两种图。
 *
 * ⚠️ 新增图表类型（饼图、散点…）或组件（工具栏、数据缩放…）时**必须回到这里补注册**，
 * 否则运行时报 `Series xxx is not exists` / `Component xxx is not exists`，
 * 而类型检查是过的 —— 这个坑只在真实渲染时才暴露。
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

/** 与本项目注册范围一致的精简 option 类型 */
export type EChartsOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>

/**
 * 看板配色：与全局 CSS 变量（`--primary-color` 等）保持一致。
 *
 * ECharts 画在 canvas 上，**读不到** CSS 变量，只能在这里硬编码一份；
 * 改主题色时这里要跟着改，否则图表会与旁边的卡片脱色。
 */
export const CHART_COLORS = {
  primary: 'rgba(104, 198, 189, 1)',
  warn: 'rgba(240, 173, 78, 1)',
  danger: 'rgba(245, 108, 108, 1)',
  purple: 'rgba(150, 130, 230, 1)',
  font: 'rgba(255, 255, 255, 0.85)',
  fontDim: 'rgba(255, 255, 255, 0.45)',
  split: 'rgba(255, 255, 255, 0.08)',
} as const

/** 深色底下的通用坐标轴/网格样式，各图表展开复用 */
export const AXIS_BASE = {
  axisLine: { lineStyle: { color: CHART_COLORS.split } },
  axisLabel: { color: CHART_COLORS.fontDim, fontSize: 11 },
  splitLine: { lineStyle: { color: CHART_COLORS.split } },
} as const

export default echarts
