<template>
  <div id="admin" class="page admin-page">
    <!-- 非管理员：不发明细的请求，直接给结论。后端也会 403，这里只是少一次无效往返 -->
    <el-empty v-if="!isRoot" description="仅管理员可访问" />

    <template v-else>
      <header class="admin-head">
        <div class="admin-head__title">
          <span class="admin-head__bar"></span>
          <h2>管理看板</h2>
          <span class="admin-head__sub">埋点行为 · AI 助手</span>
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

      <!-- ── AI 助手：访问量 / 消耗 / 使用率 ─────────────────── -->
      <section class="admin-section">
        <h3 class="admin-section__title">AI 助手 · 访问量（近 {{ days }} 天）</h3>
        <div class="stat-grid">
          <div v-for="s in visitCards" :key="s.label" class="stat-card">
            <span class="stat-card__label">{{ s.label }}</span>
            <b class="stat-card__value">{{ s.value }}</b>
            <span class="stat-card__hint">{{ s.hint }}</span>
          </div>
        </div>
      </section>

      <section class="admin-section">
        <h3 class="admin-section__title">AI 助手 · 消耗（近 {{ days }} 天）</h3>
        <div class="stat-grid">
          <div v-for="s in costCards" :key="s.label" class="stat-card">
            <span class="stat-card__label">{{ s.label }}</span>
            <b class="stat-card__value">{{ s.value }}</b>
            <span class="stat-card__hint">{{ s.hint }}</span>
          </div>
        </div>
      </section>

      <!--
        使用率：看板的结论区，每张卡都把**算式**写进 hint。
        只给一个百分比而不给分子分母，读的人没法判断它怎么来的、也没法复核。
      -->
      <section class="admin-section">
        <h3 class="admin-section__title">AI 助手 · 使用率（近 {{ days }} 天）</h3>
        <div class="stat-grid">
          <div
            v-for="s in rateCards"
            :key="s.label"
            class="stat-card"
            :class="{ 'stat-card--hero': s.hero }"
          >
            <span class="stat-card__label">{{ s.label }}</span>
            <b class="stat-card__value" :class="{ 'is-hero': s.hero }">{{ s.value }}</b>
            <span class="stat-card__hint">{{ s.hint }}</span>
          </div>
        </div>
      </section>

      <section class="admin-section chart-grid">
        <div class="admin-panel">
          <h3 class="admin-section__title">AI 请求趋势</h3>
          <el-empty v-if="!hasAiTrend" description="暂无数据" :image-size="60" />
          <AppChart v-else :option="aiTrendOption" :height="300" :loading="loading" />
        </div>
        <div class="admin-panel">
          <h3 class="admin-section__title">找番方式对比</h3>
          <el-empty
            v-if="!engagement.chat_requests && !engagement.search_count"
            description="暂无数据"
            :image-size="60"
          />
          <AppChart v-else :option="methodCompareOption" :height="300" :loading="loading" />
        </div>
      </section>

      <!-- ── 全站埋点 ───────────────────────────────────────── -->
      <section class="admin-section">
        <h3 class="admin-section__title">全站埋点总览（近 {{ days }} 天）</h3>
        <div class="stat-grid">
          <div v-for="s in trackCards" :key="s.label" class="stat-card">
            <span class="stat-card__label">{{ s.label }}</span>
            <b class="stat-card__value">{{ s.value }}</b>
            <span class="stat-card__hint">{{ s.hint }}</span>
          </div>
        </div>
      </section>

      <section class="admin-section chart-grid">
        <div class="admin-panel">
          <h3 class="admin-section__title">事件趋势</h3>
          <el-empty v-if="!hasTrackTrend" description="暂无数据" :image-size="60" />
          <AppChart v-else :option="trackTrendOption" :height="300" :loading="loading" />
        </div>
        <div class="admin-panel">
          <h3 class="admin-section__title">行为排行</h3>
          <el-empty v-if="!trackTop.length" description="暂无数据" :image-size="60" />
          <AppChart v-else :option="trackTopOption" :height="300" :loading="loading" />
        </div>
      </section>

      <!-- ── 用户 ──────────────────────────────────────────── -->
      <section class="admin-section">
        <h3 class="admin-section__title">AI 用量 TOP 用户（近 {{ days }} 天）</h3>
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
          <el-table-column label="对话次数" width="110" align="right">
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
  getAiEngagement,
  getAiTopUsers,
  getTrackDaily,
  getTrackOverview,
  getTrackTopEvents,
  type IAiDaily,
  type IAiEngagement,
  type IAiTopUser,
  type ITrackDaily,
  type ITrackOverview,
  type ITrackTopEvent,
} from '@/api/admin'
import { eventLabel } from '@/constants/track-events'
import { useChartTheme } from '@/composables/useChartTheme'
import { useLoginStore } from '@/stores/modules/login'
import type { EChartsOption } from '@/utils/echarts'
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
const engagement = ref<IAiEngagement>({
  page_views: 0,
  page_users: 0,
  chat_requests: 0,
  chat_users: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  tokens_per_request: 0,
  card_clicks: 0,
  card_click_rate: 0,
  search_count: 0,
  search_users: 0,
  search_card_clicks: 0,
  search_card_click_rate: 0,
  ai_rate: 0,
})
const aiDaily = ref<IAiDaily[]>([])
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
    getTrackTopEvents(days.value, 20),
    getAiEngagement(days.value),
    getAiDaily(days.value),
    getAiTopUsers(days.value),
  ])
  const [ov, daily, top, eng, aiDay, topUsers] = results

  if (ov.status === 'fulfilled') trackOverview.value = ov.value
  if (daily.status === 'fulfilled') trackDaily.value = daily.value
  if (top.status === 'fulfilled') trackTop.value = top.value
  if (eng.status === 'fulfilled') engagement.value = eng.value
  if (aiDay.status === 'fulfilled') aiDaily.value = aiDay.value
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

// ── 指标卡 ────────────────────────────────────────────────────

const visitCards = computed(() => {
  const e = engagement.value
  return [
    { label: 'AI 页面访问', value: fmt(e.page_views), hint: '打开 AI 助手页的次数' },
    { label: '访问人数', value: fmt(e.page_users), hint: '按登录用户去重' },
    { label: '对话次数', value: fmt(e.chat_requests), hint: '实际发起的提问轮次' },
    { label: '对话人数', value: fmt(e.chat_users), hint: '用过 AI 的去重人数' },
  ]
})

const costCards = computed(() => {
  const e = engagement.value
  return [
    { label: '总 Tokens', value: fmt(e.total_tokens), hint: '输入 + 输出' },
    { label: '输入 Tokens', value: fmt(e.prompt_tokens), hint: '提问与历史上下文' },
    { label: '输出 Tokens', value: fmt(e.completion_tokens), hint: '模型生成的回答' },
    {
      label: '单次对话 Tokens',
      value: fmt(e.tokens_per_request),
      hint: '总 Tokens / 对话次数',
    },
  ]
})

const rateCards = computed(() => {
  const e = engagement.value
  return [
    {
      label: 'AI 使用率',
      value: `${e.ai_rate}%`,
      hint: `AI ${fmt(e.chat_requests)} 次 / 找番共 ${fmt(
        e.chat_requests + e.search_count,
      )} 次（AI + 手动搜索）`,
      hero: true,
    },
    {
      label: 'AI 推荐跳转率',
      value: `${e.card_click_rate}%`,
      hint: `${fmt(e.card_clicks)} 次卡片点击 / ${fmt(e.chat_requests)} 次对话`,
    },
    {
      label: '手动搜索次数',
      value: fmt(e.search_count),
      hint: `${fmt(e.search_users)} 人在搜索页提交过`,
    },
    {
      label: '搜索跳转率',
      value: `${e.search_card_click_rate}%`,
      hint: `${fmt(e.search_card_clicks)} 次结果点击 / ${fmt(e.search_count)} 次搜索`,
    },
  ]
})

const trackCards = computed(() => [
  { label: '事件总量', value: fmt(trackOverview.value.total_events), hint: '近 N 天累计' },
  { label: '今日事件', value: fmt(trackOverview.value.today_events), hint: '自然日' },
  { label: '独立用户', value: fmt(trackOverview.value.users), hint: '按 user_id 去重' },
  { label: '事件类型', value: fmt(trackOverview.value.event_types), hint: '去重后的事件名' },
])

// ── 图表 ──────────────────────────────────────────────────────

const { colors, axisBase, legendTextStyle, tooltipStyle } = useChartTheme()

const fmtCount = (n: number) => `${fmt(n)} 次`

/** 折线通用配置；各图只覆盖 yAxis/series */
function lineBase(dates: string[]) {
  const axis = axisBase.value
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' as const, ...tooltipStyle.value },
    legend: { data: [] as string[], textStyle: legendTextStyle.value, top: 0 },
    grid: { left: 8, right: 16, bottom: 8, top: 36, containLabel: true },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: dates,
      ...axis,
      // 纵轴网格已够密集，横轴网格线是噪音
      splitLine: { show: false },
    },
    yAxis: { type: 'value' as const, ...axis, axisLine: { show: false } },
  }
}

/** 横向柱状的通用骨架 */
function barBase(labels: string[]) {
  const axis = axisBase.value
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 56, bottom: 8, top: 12, containLabel: true },
    xAxis: { type: 'value' as const, ...axis, axisLine: { show: false } },
    yAxis: {
      type: 'category' as const,
      data: labels,
      ...axis,
      splitLine: { show: false },
    },
  }
}

const aiTrendOption = computed<EChartsOption>(() => {
  const rows = [...aiDaily.value].reverse()
  const base = lineBase(rows.map((r) => r.day.slice(5)))
  const c = colors.value
  return {
    ...base,
    legend: { ...base.legend, data: ['对话次数', 'Tokens'] },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, ...tooltipStyle.value },
    // 双轴：对话次数（个位数）与 token（万级）差太多，
    // 共用一根轴会让对话次数的折线贴死在 x 轴上
    yAxis: [
      { ...base.yAxis, name: '次数', nameTextStyle: { color: c.fontDim } },
      {
        ...base.yAxis,
        name: 'Tokens',
        nameTextStyle: { color: c.fontDim },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '对话次数',
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.12 },
        itemStyle: { color: c.primary },
        data: rows.map((r) => r.requests),
      },
      {
        name: 'Tokens',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: c.accent },
        data: rows.map((r) => r.prompt_tokens + r.completion_tokens),
      },
    ],
  }
})

/** 找番方式对比：AI 与手动搜索的用量 + 各自的跳转率 */
const methodCompareOption = computed<EChartsOption>(() => {
  const e = engagement.value
  const c = colors.value
  const rows = [
    { name: 'AI 对话', count: e.chat_requests, rate: e.card_click_rate },
    { name: '手动搜索', count: e.search_count, rate: e.search_card_click_rate },
  ]
  const base = barBase(rows.map((r) => r.name))
  return {
    ...base,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipStyle.value,
      formatter: (params: unknown) => {
        const p = (params as Array<{ dataIndex: number }>)[0]
        const r = rows[p.dataIndex]
        return `${r.name}<br/>使用 ${fmt(r.count)} 次<br/>点开番剧的比例 ${r.rate}%`
      },
    },
    series: [
      {
        name: '使用次数',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          // 两根柱子分色，一眼分清哪根是 AI
          color: (p: { dataIndex: number }) => (p.dataIndex === 0 ? c.primary : c.accent),
        },
        label: {
          show: true,
          position: 'right',
          color: c.fontDim,
          fontSize: 11,
          formatter: (p: { dataIndex: number }) => fmtCount(rows[p.dataIndex].count),
        },
        data: rows.map((r) => r.count),
      },
    ],
  }
})

const trackTrendOption = computed<EChartsOption>(() => {
  const rows = ascDaily.value
  const base = lineBase(rows.map((r) => r.day.slice(5)))
  const c = colors.value
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
        itemStyle: { color: c.primary },
        data: rows.map((r) => r.events),
      },
      {
        name: '独立用户',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: c.accent },
        data: rows.map((r) => r.users),
      },
      {
        name: '匿名访客',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: c.warn },
        data: rows.map((r) => r.anonymous),
      },
    ],
  }
})

const trackTopOption = computed<EChartsOption>(() => {
  const c = colors.value
  // 横向柱状：中文行为名较长，横放才排得下（竖放会挤成斜排标签）
  const rows = [...trackTop.value].reverse()
  const base = barBase(rows.map((r) => eventLabel(r.event, r.page)))
  return {
    ...base,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipStyle.value,
      // tooltip 里补上原始事件代号：中文名给人看，代号给排查问题的人对照代码
      formatter: (params: unknown) => {
        const p = (params as Array<{ dataIndex: number }>)[0]
        const r = rows[p.dataIndex]
        return `${eventLabel(r.event, r.page)}<br/>${fmt(r.count)} 次 · ${fmt(
          r.users,
        )} 人<br/><span style="opacity:.6">${r.event}</span>`
      },
    },
    series: [
      {
        name: '次数',
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: { color: c.primary, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: c.fontDim, fontSize: 11 },
        data: rows.map((r) => r.count),
      },
    ],
  }
})
</script>

<style scoped lang="less">
/*
 * 必须显式 @import：`.page` 不是全局样式，每个 view 各自引入（见其它 views/*.vue）。
 * 漏了它的后果很隐蔽 —— 类型检查、构建全过，但 `.page` 的 `height:100%` 与
 * `overflow-y:auto` 都不生效，页面高度变成内容高度，被父容器
 * `.app-container__main` 的 `overflow:hidden` 直接裁掉且**滚不动**。
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

  /* 「AI 使用率」是看板的结论性指标，给它额外分量。
     color-mix 让高亮块跟随主题主色，不用为亮/暗各写一套。 */
  &--hero {
    grid-column: span 2;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 20%, var(--aside-bg-color)),
      var(--aside-bg-color)
    );
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

    &.is-hero {
      font-size: 32px;
    }
  }

  &__hint {
    font-size: 11px;
    color: var(--font-unactive-color);
    opacity: 0.75;
    line-height: 1.5;
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

/* 窄屏：hero 卡不再横跨两列，否则内容被挤成两三行 */
@media (max-width: 560px) {
  .stat-card--hero {
    grid-column: span 1;
  }
}
</style>
