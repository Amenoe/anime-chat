<template>
  <div id="admin" class="page admin-page">
    <!-- 非管理员：不发明细的请求，直接给结论。后端也会 403，这里只是少一次无效往返 -->
    <el-empty v-if="!isRoot" description="仅管理员可访问" />

    <template v-else>
      <header class="admin-head">
        <div class="admin-head__title">
          <span class="admin-head__bar"></span>
          <h2>管理看板</h2>
          <span class="admin-head__sub">埋点行为 · AI 用量</span>
        </div>
        <div class="admin-head__ops">
          <el-radio-group
            v-model="days"
            v-track="'admin.range.change'"
            size="small"
            @change="loadAll"
          >
            <el-radio-button v-for="d in DAY_OPTIONS" :key="d" :value="d">
              {{ d }} 天
            </el-radio-button>
          </el-radio-group>
          <el-button
            v-track="'admin.refresh'"
            size="small"
            :icon="Refresh"
            :loading="loading"
            @click="loadAll"
          >
            刷新
          </el-button>
        </div>
      </header>

      <el-alert
        v-if="errorMsg"
        class="admin-alert"
        type="warning"
        show-icon
        :closable="false"
        :title="errorMsg"
      />

      <!-- ── 埋点：总览 ─────────────────────────────────────── -->
      <section class="admin-section">
        <h3 class="admin-section__title">埋点总览（近 {{ days }} 天）</h3>
        <div class="stat-grid">
          <div v-for="s in trackCards" :key="s.label" class="stat-card">
            <span class="stat-card__label">{{ s.label }}</span>
            <b class="stat-card__value">{{ s.value }}</b>
            <span class="stat-card__hint">{{ s.hint }}</span>
          </div>
        </div>
      </section>

      <!-- ── 埋点：趋势 + 排行 ──────────────────────────────── -->
      <section class="admin-section chart-grid">
        <div class="admin-panel">
          <h3 class="admin-section__title">事件趋势</h3>
          <el-empty v-if="!hasTrackTrend" description="暂无数据" :image-size="60" />
          <AppChart v-else :option="trackTrendOption" :height="300" :loading="loading" />
        </div>
        <div class="admin-panel">
          <h3 class="admin-section__title">事件量排行</h3>
          <el-empty v-if="!trackTop.length" description="暂无数据" :image-size="60" />
          <AppChart v-else :option="trackTopOption" :height="300" :loading="loading" />
        </div>
      </section>

      <!-- ── AI：总览 ──────────────────────────────────────── -->
      <section class="admin-section">
        <h3 class="admin-section__title">AI 用量总览（全时段）</h3>
        <div class="stat-grid">
          <div v-for="s in aiCards" :key="s.label" class="stat-card">
            <span class="stat-card__label">{{ s.label }}</span>
            <b class="stat-card__value" :class="{ 'is-danger': s.danger }">
              {{ s.value }}
            </b>
            <span class="stat-card__hint">{{ s.hint }}</span>
          </div>
        </div>
      </section>

      <section class="admin-section chart-grid">
        <div class="admin-panel">
          <h3 class="admin-section__title">AI 请求趋势（近 {{ days }} 天）</h3>
          <el-empty v-if="!hasAiTrend" description="暂无数据" :image-size="60" />
          <AppChart v-else :option="aiTrendOption" :height="300" :loading="loading" />
        </div>
        <div class="admin-panel">
          <h3 class="admin-section__title">工具调用分布</h3>
          <el-empty v-if="!aiTools.length" description="暂无数据" :image-size="60" />
          <AppChart v-else :option="aiToolsOption" :height="300" :loading="loading" />
        </div>
      </section>

      <!-- ── AI：TOP 用户 ──────────────────────────────────── -->
      <section class="admin-section">
        <h3 class="admin-section__title">用量 TOP 用户（近 {{ days }} 天）</h3>
        <el-table v-loading="loading" :data="aiTopUsers" class="admin-table" stripe>
          <el-table-column type="index" label="#" width="52" />
          <el-table-column label="用户" min-width="180">
            <template #default="{ row }">
              <template v-if="row.username || row.nickname">
                <span class="admin-user__name">{{ row.nickname || row.username }}</span>
                <span v-if="row.nickname && row.username" class="admin-user__sub">
                  @{{ row.username }}
                </span>
              </template>
              <!-- 匿名埋点 user_id 为空；用户已注销则 JOIN 不到，两种情况都退化成短 id -->
              <span v-else class="admin-user__sub">
                {{ row.user_id ? `${row.user_id.slice(0, 8)}…（已注销）` : '（匿名）' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="请求数" width="100" align="right">
            <template #default="{ row }">{{ fmt(row.requests) }}</template>
          </el-table-column>
          <el-table-column label="Tokens" width="120" align="right">
            <template #default="{ row }">{{ fmt(row.tokens) }}</template>
          </el-table-column>
        </el-table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import AppChart from '@/components/Chart/AppChart.vue'
import {
  getAiDaily,
  getAiOverview,
  getAiTools,
  getAiTopUsers,
  getTrackDaily,
  getTrackOverview,
  getTrackTopEvents,
  type IAiDaily,
  type IAiOverview,
  type IAiToolStat,
  type IAiTopUser,
  type ITrackDaily,
  type ITrackOverview,
  type ITrackTopEvent,
} from '@/api/admin'
import { useLoginStore } from '@/stores/modules/login'
import { AXIS_BASE, CHART_COLORS, type EChartsOption } from '@/utils/echarts'
import { Refresh } from '@element-plus/icons-vue'

const loginStore = useLoginStore()
const isRoot = computed(() => loginStore.userInfo?.role === 'root')

const DAY_OPTIONS = [7, 14, 30, 90]
/** 与后端 `clampDays` 的上限一致 */
const days = ref(14)
const loading = ref(false)
const errorMsg = ref('')

const trackOverview = ref<ITrackOverview>({
  total_events: 0,
  users: 0,
  event_types: 0,
  today_events: 0,
})
const trackDaily = ref<ITrackDaily[]>([])
const trackTop = ref<ITrackTopEvent[]>([])
const aiOverview = ref<IAiOverview>({
  total_requests: 0,
  ok_requests: 0,
  error_requests: 0,
  aborted_requests: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  tool_calls: 0,
  users: 0,
  avg_latency_ms: 0,
  avg_first_token_ms: 0,
  today_requests: 0,
})
const aiDaily = ref<IAiDaily[]>([])
const aiTools = ref<IAiToolStat[]>([])
const aiTopUsers = ref<IAiTopUser[]>([])

const fmt = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-US')

async function loadAll() {
  if (!isRoot.value) return
  loading.value = true
  errorMsg.value = ''
  // 用 allSettled：某个接口挂了不该让整个看板空白，
  // 已拿到的部分照常展示，只有失败项保持旧值
  const results = await Promise.allSettled([
    getTrackOverview(days.value),
    getTrackDaily(days.value),
    getTrackTopEvents(days.value),
    getAiOverview(),
    getAiDaily(days.value),
    getAiTools(days.value),
    getAiTopUsers(days.value),
  ])
  const [ov, daily, top, aiOv, aiDay, tools, topUsers] = results

  if (ov.status === 'fulfilled') trackOverview.value = ov.value
  if (daily.status === 'fulfilled') trackDaily.value = daily.value
  if (top.status === 'fulfilled') trackTop.value = top.value
  if (aiOv.status === 'fulfilled') aiOverview.value = aiOv.value
  if (aiDay.status === 'fulfilled') aiDaily.value = aiDay.value
  if (tools.status === 'fulfilled') aiTools.value = tools.value
  if (topUsers.status === 'fulfilled') aiTopUsers.value = topUsers.value

  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed) {
    errorMsg.value = `${failed} 个统计接口请求失败，下方数据可能不完整`
  }
  loading.value = false
}

onMounted(loadAll)

/** 后端按天返回是**倒序**（最新在前），画图要正序 */
const ascDaily = computed(() => [...trackDaily.value].reverse())

const hasTrackTrend = computed(() => ascDaily.value.length > 0)
const hasAiTrend = computed(() => aiDaily.value.length > 0)

const trackCards = computed(() => [
  { label: '事件总量', value: fmt(trackOverview.value.total_events), hint: '近 N 天累计' },
  { label: '今日事件', value: fmt(trackOverview.value.today_events), hint: '自然日' },
  { label: '独立用户', value: fmt(trackOverview.value.users), hint: '按 user_id 去重' },
  { label: '事件类型', value: fmt(trackOverview.value.event_types), hint: '去重后的事件名' },
])

const aiCards = computed(() => {
  const o = aiOverview.value
  const total = o.total_requests || 0
  const okRate = total ? ((o.ok_requests / total) * 100).toFixed(1) : '0.0'
  return [
    { label: '总请求', value: fmt(total), hint: '全时段累计' },
    { label: '今日请求', value: fmt(o.today_requests), hint: '自然日' },
    { label: '成功率', value: `${okRate}%`, hint: `成功 ${fmt(o.ok_requests)} 次` },
    {
      label: '错误',
      value: fmt(o.error_requests),
      hint: '上游/系统异常',
      danger: o.error_requests > 0,
    },
    {
      label: '用户中断',
      value: fmt(o.aborted_requests),
      hint: '不计入错误',
    },
    { label: '独立用户', value: fmt(o.users), hint: '按 user_id 去重' },
    { label: '首字延迟', value: `${fmt(o.avg_first_token_ms)} ms`, hint: '体感速度' },
    { label: '平均延迟', value: `${fmt(o.avg_latency_ms)} ms`, hint: '整轮耗时' },
    { label: 'Prompt Tokens', value: fmt(o.prompt_tokens), hint: '输入侧' },
    {
      label: 'Completion Tokens',
      value: fmt(o.completion_tokens),
      hint: '输出侧',
    },
    { label: '工具调用', value: fmt(o.tool_calls), hint: '含一轮多工具' },
  ]
})

/** 折线通用配置；各图只覆盖 xAxis/series */
function lineBase(dates: string[]) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' as const },
    legend: {
      data: [] as string[],
      textStyle: { color: CHART_COLORS.fontDim, fontSize: 11 },
      top: 0,
    },
    grid: { left: 8, right: 16, bottom: 8, top: 36, containLabel: true },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: dates,
      ...AXIS_BASE,
      // 折线图纵轴网格已够密集，横轴网格线是噪音
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      ...AXIS_BASE,
      axisLine: { show: false },
    },
  }
}

const trackTrendOption = computed<EChartsOption>(() => {
  const rows = ascDaily.value
  const base = lineBase(rows.map((r) => r.day.slice(5)))
  return {
    ...base,
    legend: { ...base.legend, data: ['事件数', '独立用户', '匿名访客'] },
    series: [
      {
        name: '事件数',
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.12 },
        itemStyle: { color: CHART_COLORS.primary },
        data: rows.map((r) => r.events),
      },
      {
        name: '独立用户',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: CHART_COLORS.purple },
        data: rows.map((r) => r.users),
      },
      {
        name: '匿名访客',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: CHART_COLORS.warn },
        data: rows.map((r) => r.anonymous),
      },
    ],
  }
})

const trackTopOption = computed<EChartsOption>(() => {
  // 横向柱状：事件名是长字符串，横放才排得下（竖放会挤成斜排标签）
  const rows = [...trackTop.value].reverse()
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 40, bottom: 8, top: 12, containLabel: true },
    xAxis: { type: 'value', ...AXIS_BASE, axisLine: { show: false } },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.event),
      ...AXIS_BASE,
      splitLine: { show: false },
    },
    series: [
      {
        name: '事件数',
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: { color: CHART_COLORS.primary, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: CHART_COLORS.fontDim,
          fontSize: 11,
        },
        data: rows.map((r) => r.count),
      },
    ],
  }
})

const aiTrendOption = computed<EChartsOption>(() => {
  const rows = [...aiDaily.value].reverse()
  const base = lineBase(rows.map((r) => r.day.slice(5)))
  return {
    ...base,
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: {
      ...base.legend,
      data: ['请求数', '工具调用', 'Tokens'],
    },
    // 双轴：请求数量级（个位数）与 token 数量级（百万）差太多，
    // 共用一根轴会让请求数的折线贴死在 x 轴上
    yAxis: [
      { ...base.yAxis, name: '请求', nameTextStyle: { color: CHART_COLORS.fontDim } },
      {
        ...base.yAxis,
        name: 'Tokens',
        nameTextStyle: { color: CHART_COLORS.fontDim },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '请求数',
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.12 },
        itemStyle: { color: CHART_COLORS.primary },
        data: rows.map((r) => r.requests),
      },
      {
        name: '工具调用',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: CHART_COLORS.warn },
        data: rows.map((r) => r.tool_calls),
      },
      {
        name: 'Tokens',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: CHART_COLORS.purple },
        data: rows.map((r) => r.prompt_tokens + r.completion_tokens),
      },
    ],
  }
})

const aiToolsOption = computed<EChartsOption>(() => {
  const rows = [...aiTools.value].reverse()
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = (params as Array<{ dataIndex: number }>)[0]
        const row = rows[p.dataIndex]
        return `${toolLabel(row.tools)}<br/>请求 ${row.requests} 次 / 调用 ${row.calls} 次`
      },
    },
    grid: { left: 8, right: 40, bottom: 8, top: 12, containLabel: true },
    xAxis: { type: 'value', ...AXIS_BASE, axisLine: { show: false } },
    yAxis: {
      type: 'category',
      data: rows.map((r) => toolLabel(r.tools)),
      ...AXIS_BASE,
      splitLine: { show: false },
    },
    series: [
      {
        name: '请求数',
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: { color: CHART_COLORS.purple, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: CHART_COLORS.fontDim,
          fontSize: 11,
        },
        data: rows.map((r) => r.requests),
      },
    ],
  }
})

/** 工具组合名转中文；后端按「组合」分组，所以可能是 `a,b` */
function toolLabel(tools: string) {
  if (tools === '(无工具)') return '未调用工具'
  const map: Record<string, string> = {
    browse_anime: '排行浏览',
    search_anime: '关键词搜索',
  }
  return tools
    .split(',')
    .map((t) => map[t.trim()] ?? t.trim())
    .join(' + ')
}
</script>

<style scoped lang="less">
/*
 * 必须显式 @import：`.page` 不是全局样式，每个 view 各自引入（见其它 views/*.vue）。
 * 漏了它的后果很隐蔽 —— 类型检查、构建全过，但 `.page` 的 `height:100%` 与
 * `overflow-y:auto` 都不生效，页面高度变成内容高度（实测 1347px），
 * 被父容器 `.app-container__main` 的 `overflow:hidden` 直接裁掉且**滚不动**，
 * 看板下半部分根本够不着。这个坑只有真实浏览器渲染才能发现。
 */
@import '~styles/page';

.admin-page {
  // .page 自带上下透明边框（给滚动条让位）与左右 padding，这里只补一点内边距
  padding: 16px 24px;
}

.admin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;

  &__title {
    display: flex;
    align-items: center;
    gap: 10px;

    h2 {
      margin: 0;
      font-size: 20px;
      color: var(--font-color);
    }
  }

  /* 与全站 section 标题一致的语言：左侧 4px 主色条 */
  &__bar {
    width: 4px;
    height: 20px;
    border-radius: 2px;
    background: var(--primary-color);
  }

  &__sub {
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__ops {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}

.admin-alert {
  margin-bottom: 16px;
}

.admin-section {
  margin-bottom: 24px;

  &__title {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--font-color);
    padding-left: 10px;
    border-left: 4px solid var(--primary-color);
    line-height: 1.2;
  }
}

/* 两块图表并排；窄屏塌成一列 */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
}

.admin-panel {
  background: var(--aside-bg-color);
  border-radius: var(--df-radius);
  padding: 16px;
  box-sizing: border-box;
  min-width: 0; /* 不设的话 grid 子项会被 canvas 撑破，右侧溢出 */

  .admin-section__title {
    margin-bottom: 8px;
  }
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: var(--aside-bg-color);
  border-radius: var(--df-radius);
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 0 12px rgba(104, 198, 189, 0.15);
  }

  &__label {
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__value {
    font-size: 22px;
    line-height: 1.2;
    color: var(--primary-color);
    word-break: break-all;

    &.is-danger {
      color: var(--el-color-danger);
    }
  }

  &__hint {
    font-size: 11px;
    color: var(--font-unactive-color);
    opacity: 0.7;
  }
}

.admin-table {
  width: 100%;
}

.admin-user {
  &__name {
    color: var(--font-color);
  }

  &__sub {
    margin-left: 6px;
    font-size: 12px;
    color: var(--font-unactive-color);
  }
}
</style>
