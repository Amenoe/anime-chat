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

/*
 * 图表配色**不在这里** —— 见 `composables/useChartTheme.ts`。
 * 颜色必须跟随主题（亮/暗）并且从 CSS 变量读，硬编码色表会在亮色下糊成一片。
 */

export default echarts
