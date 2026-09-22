<template>
  <!--
    包一层 `el-config-provider` 只为中文文案（分页的「共 N 条」「N 条/页」、
    下拉的「无数据」）。它是 **renderless** 的（只 `renderSlot`，不产生额外 DOM），
    所以不会像普通 wrapper 那样把 `.page` 的 `height:100%` 打断 ——
    那种坑本项目踩过（见 CSS 段注释）。
    刻意不改成全局 `app.use(ElementPlus, { locale })`：那会把整个 Element Plus
    拉进首屏，而这个项目是**按需引入**的。
  -->
  <el-config-provider :locale="zhCn">
    <div id="admin" class="page admin-page">
      <!-- 非管理员：不发明细的请求，直接给结论。后端也会 403，这里只是少一次无效往返 -->
      <el-empty v-if="!isRoot" description="仅管理员可访问" />

      <template v-else>
        <header class="admin-head">
          <div class="admin-head__title">
            <span class="admin-head__bar"></span>
            <h2>管理后台</h2>
            <span class="admin-head__sub">数据看板 · 用户管理</span>
          </div>
          <div class="admin-head__ops">
            <!-- 统计区间只对数据看板有意义，放到用户管理 tab 会让人以为它在筛用户 -->
            <el-radio-group
              v-if="activeTab === 'dashboard'"
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
              :loading="busy"
              @click="onRefresh"
            >
              刷新
            </el-button>
          </div>
        </header>

        <el-tabs
          v-model="activeTab"
          class="admin-tabs"
          @tab-click="onTabClick"
          @tab-change="onTabChange"
        >
          <el-tab-pane label="数据看板" name="dashboard">
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
          </el-tab-pane>

          <el-tab-pane label="用户管理" name="users" lazy>
            <!-- ── 筛选 ─────────────────────────────────────── -->
            <div class="user-filter">
              <el-input
                v-model="userQuery.keyword"
                class="user-filter__kw"
                placeholder="搜索用户名或昵称，回车查询"
                clearable
                :prefix-icon="Search"
                @keyup.enter="onUserSearch"
                @clear="onUserSearch"
              />
              <!--
              两个下拉都 `@change` 立即查询：下拉是**离散选择**，选完就是决定了，
              再要求点一次「查询」会让人以为「选了没反应」。
              关键词输入不同 —— 打字需要一个提交边界，所以走回车/按钮。
            -->
              <el-select
                v-model="userQuery.role"
                class="user-filter__sel"
                placeholder="全部角色"
                clearable
                @change="onUserSearch"
                @clear="onUserSearch"
              >
                <el-option label="管理员" value="root" />
                <el-option label="普通用户" value="user" />
              </el-select>
              <el-select
                v-model="userQuery.disabled"
                class="user-filter__sel"
                placeholder="全部状态"
                clearable
                @change="onUserSearch"
                @clear="onUserSearch"
              >
                <el-option label="正常" :value="false" />
                <el-option label="已封禁" :value="true" />
              </el-select>
              <el-button
                v-track="{ event: 'admin.user.search', props: filterTrackProps }"
                type="primary"
                :icon="Search"
                @click="onUserSearch"
              >
                查询
              </el-button>
              <el-button :disabled="!hasUserFilter" @click="onUserReset">重置</el-button>
            </div>

            <!-- ── 列表 ─────────────────────────────────────── -->
            <el-table v-loading="usersLoading" :data="users" class="admin-table user-table" stripe>
              <el-table-column label="用户" min-width="200">
                <template #default="{ row }">
                  <div class="user-cell">
                    <el-avatar :size="30" :src="resolveAvatarUrl(row.avatar)" />
                    <div class="user-cell__text">
                      <span class="user-cell__name">{{ row.nickname || row.username }}</span>
                      <span class="user-cell__sub">@{{ row.username }}</span>
                    </div>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="角色" width="110">
                <template #default="{ row }">
                  <el-tag
                    :type="row.role === 'root' ? 'warning' : 'info'"
                    size="small"
                    effect="dark"
                  >
                    {{ row.role === 'root' ? '管理员' : '普通用户' }}
                  </el-tag>
                </template>
              </el-table-column>

              <el-table-column label="状态" width="120">
                <template #default="{ row }">
                  <span class="user-status">
                    <el-tag v-if="row.disabled_at" type="danger" size="small">已封禁</el-tag>
                    <el-tag v-else type="success" size="small">正常</el-tag>
                    <!-- 封禁原因默认折叠在 tooltip 里：列表要能扫，原因只在关心时看 -->
                    <el-tooltip
                      v-if="row.disabled_at && row.disabled_reason"
                      placement="top"
                      :content="row.disabled_reason"
                    >
                      <el-icon class="user-status__icon"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </template>
              </el-table-column>

              <el-table-column label="注册时间" width="170">
                <template #default="{ row }">{{ formatUtcString(row.create_time) }}</template>
              </el-table-column>

              <el-table-column label="操作" width="286" align="right">
                <template #default="{ row }">
                  <!--
                  自己那一行的封禁 / 改角色 / 删除**提前禁用**：
                  后端会 400 拒绝（防自锁），但让按钮可点再报错是糟糕的体验，
                  而且「点了才知道不行」会让人以为系统坏了。
                  重置密码对自己是允许的（等价改密），所以不禁用。
                -->
                  <el-button
                    link
                    type="warning"
                    size="small"
                    :disabled="isSelf(row)"
                    @click="onBan(row)"
                  >
                    {{ row.disabled_at ? '解封' : '封禁' }}
                  </el-button>
                  <el-button
                    link
                    type="primary"
                    size="small"
                    :disabled="isSelf(row)"
                    @click="onToggleRole(row)"
                  >
                    {{ row.role === 'root' ? '取消管理员' : '设为管理员' }}
                  </el-button>
                  <el-button link size="small" @click="onResetPassword(row)">重置密码</el-button>
                  <el-button
                    link
                    type="danger"
                    size="small"
                    :disabled="isSelf(row)"
                    @click="onDelete(row)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>

              <template #empty>
                <el-empty
                  :description="usersLoading ? '加载中…' : '没有匹配的用户'"
                  :image-size="60"
                />
              </template>
            </el-table>

            <div class="user-pager">
              <el-pagination
                v-model:current-page="userQuery.page"
                v-model:page-size="userQuery.size"
                v-track="'admin.user.page'"
                :total="userTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                background
                @current-change="onPageChange"
                @size-change="onSizeChange"
              />
            </div>

            <!--
            操作日志：这一页的每个操作都能改别人的账号，留痕必须**看得见** ——
            后端为此专门让「审计写失败则操作失败」，前端不给它一个位置就说不过去。
          -->
            <section class="admin-section user-audit">
              <h3 class="admin-section__title user-audit__title">
                <span>最近操作日志</span>
                <el-button
                  v-track="'admin.audit.refresh'"
                  size="small"
                  text
                  :icon="Refresh"
                  :loading="auditLoading"
                  @click="loadAudit"
                >
                  刷新
                </el-button>
              </h3>
              <el-table v-loading="auditLoading" :data="auditLogs" size="small" class="admin-table">
                <el-table-column label="时间" width="165">
                  <template #default="{ row }">{{ formatUtcString(row.create_time) }}</template>
                </el-table-column>
                <el-table-column label="操作者" width="120" prop="actor_username" />
                <el-table-column label="动作" width="110">
                  <template #default="{ row }">{{ auditActionLabel(row.action) }}</template>
                </el-table-column>
                <el-table-column label="目标" width="150">
                  <template #default="{ row }">
                    <span class="user-cell__sub">
                      {{ row.target_type }} · {{ shortId(row.target_id) }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="详情" min-width="200">
                  <template #default="{ row }">
                    <span class="user-cell__sub">{{ detailText(row.detail) }}</span>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty :description="auditLoading ? '加载中…' : '暂无记录'" :image-size="50" />
                </template>
              </el-table>
            </section>
          </el-tab-pane>
        </el-tabs>

        <!-- ── 封禁弹窗 ─────────────────────────────────────── -->
        <el-dialog
          v-model="banDialogVisible"
          title="封禁用户"
          width="460px"
          :close-on-click-modal="false"
        >
          <el-alert
            class="dialog-alert"
            type="warning"
            show-icon
            :closable="false"
            :title="`将封禁「${displayName(banTarget)}」`"
            description="封禁后其无法登录，所有设备上的会话立即失效。原因会原样展示给被封的人。"
          />
          <el-form label-position="top" class="dialog-form">
            <el-form-item label="封禁原因">
              <el-input
                v-model="banReason"
                type="textarea"
                :rows="3"
                maxlength="255"
                show-word-limit
                placeholder="例如：批量刷接口 / 发布违规内容"
              />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="banDialogVisible = false">取消</el-button>
            <el-button
              type="warning"
              :loading="banSubmitting"
              :disabled="!banReason.trim()"
              @click="submitBan"
            >
              确认封禁
            </el-button>
          </template>
        </el-dialog>

        <!-- ── 重置密码弹窗 ─────────────────────────────────── -->
        <el-dialog
          v-model="pwdDialogVisible"
          title="重置密码"
          width="460px"
          :close-on-click-modal="false"
        >
          <el-alert
            class="dialog-alert"
            type="warning"
            show-icon
            :closable="false"
            title="重置后该用户会被登出全部设备"
            :description="
              pwdIsSelf
                ? '这是你自己的账号，等价于修改密码：重置后会立刻用新密码静默重登。'
                : `请把新密码告知「${displayName(pwdTarget)}」，旧密码将立即失效。`
            "
          />
          <el-form
            ref="pwdFormRef"
            :model="pwdForm"
            :rules="pwdRules"
            label-position="top"
            class="dialog-form"
          >
            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="pwdForm.newPassword"
                type="password"
                show-password
                :placeholder="PASSWORD_HINT"
              />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirm">
              <el-input
                v-model="pwdForm.confirm"
                type="password"
                show-password
                @keyup.enter="submitResetPassword"
              />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="pwdDialogVisible = false">取消</el-button>
            <el-button type="primary" :loading="pwdSubmitting" @click="submitResetPassword">
              确认重置
            </el-button>
          </template>
        </el-dialog>
      </template>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import AppChart from '@/components/Chart/AppChart.vue'
import {
  deleteAdminUser,
  getAdminAuditLogs,
  getAdminUserDetail,
  getAiDaily,
  getAiEngagement,
  getAiTopUsers,
  getTrackDaily,
  getTrackOverview,
  getTrackTopEvents,
  listAdminUsers,
  resetAdminUserPassword,
  setAdminUserBanned,
  setAdminUserRole,
  type AdminUserRole,
  type IAdminAuditLog,
  type IAdminUser,
  type IAdminUserStats,
  type IAiDaily,
  type IAiEngagement,
  type IAiTopUser,
  type ITrackDaily,
  type ITrackOverview,
  type ITrackTopEvent,
} from '@/api/admin'
import { eventLabel } from '@/constants/track-events'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useChartTheme } from '@/composables/useChartTheme'
import { useLoginStore } from '@/stores/modules/login'
import { resolveAvatarUrl } from '@/utils/avatar'
import { formatUtcString } from '@/utils/date-format'
import type { EChartsOption } from '@/utils/echarts'
import { PASSWORD_HINT, passwordRule } from '@/utils/password'
import { track } from '@/utils/track'
import { QuestionFilled, Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

const loginStore = useLoginStore()
const isRoot = computed(() => loginStore.userInfo?.role === 'root')

const DAY_OPTIONS = [7, 14, 30, 90]
/** 与后端 `clampDays` 的上限一致 */
const days = ref(14)
const loading = ref(false)
const errorMsg = ref('')

/**
 * 分区。看板在前、用户管理在后 —— 默认停在看板，
 * 这样既有书签/习惯不变，也不会一进管理页就同时打统计与用户两套接口。
 */
type AdminTab = 'dashboard' | 'users'
const activeTab = ref<AdminTab>('dashboard')
/** 用户列表只在**首次**切到该分区时拉取（`el-tab-pane` 的 lazy 只管渲染，不管取数） */
const usersLoaded = ref(false)

/**
 * 用 `tab-click` 而不是 `tab-change` 记埋点：前者只在**用户点击**时触发，
 * 后者在 v-model 被程序改动时也会触发（会多记一条）。
 * 参数类型写宽（`unknown`）是故意的 —— Element Plus 的事件载荷类型没有从根导出，
 * 写死具体类型反而容易随版本改签名而报错。
 */
function onTabClick(pane: unknown) {
  const name = (pane as { paneName?: unknown } | undefined)?.paneName
  track('admin.tab.change', { tab: name === undefined ? 'unknown' : String(name) })
}

function onTabChange(name: unknown) {
  if (String(name) === 'users' && !usersLoaded.value) {
    usersLoaded.value = true
    void loadUsers()
    void loadAudit()
  }
}

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

// ── 用户管理 ──────────────────────────────────────────────────

const users = ref<IAdminUser[]>([])
const usersLoading = ref(false)
const userTotal = ref(0)
const auditLogs = ref<IAdminAuditLog[]>([])
const auditLoading = ref(false)

/**
 * 筛选条件。
 *
 * `role` / `disabled` 的「未选」用 `''` 表示 —— `el-select` 的 clearable 清空后
 * 给的就是空值。**不能把这个空值直接发给后端**：后端 `role` 上有 `@IsEnum`，
 * 收 `role=''` 会直接 400。所以下面 `currentUserParams()` 里逐个判有效值才带上。
 */
const userQuery = reactive<{
  keyword: string
  role: AdminUserRole | ''
  disabled: boolean | ''
  page: number
  size: number
}>({ keyword: '', role: '', disabled: '', page: 1, size: 20 })

/** 只挑后端认得的取值，空值一律不发 */
function currentUserParams() {
  const params: {
    keyword?: string
    role?: AdminUserRole
    disabled?: boolean
    page: number
    size: number
  } = { page: userQuery.page, size: userQuery.size }
  const keyword = (userQuery.keyword || '').trim()
  if (keyword) params.keyword = keyword
  if (userQuery.role === 'root' || userQuery.role === 'user') params.role = userQuery.role
  // 用 typeof 判断而不是真值判断：`false` 是**有效筛选值**（只看正常用户），
  // 写成 `if (userQuery.disabled)` 会把「正常」这个条件静默丢掉
  if (typeof userQuery.disabled === 'boolean') params.disabled = userQuery.disabled
  return params
}

const hasUserFilter = computed(
  () => !!userQuery.keyword.trim() || userQuery.role !== '' || userQuery.disabled !== '',
)

/** 埋点属性：只记「有没有筛、筛什么维度」，不记关键词内容（沿用项目约定） */
const filterTrackProps = computed(() => ({
  hasKeyword: !!userQuery.keyword.trim(),
  role: userQuery.role || 'all',
  status:
    userQuery.disabled === true ? 'disabled' : userQuery.disabled === false ? 'active' : 'all',
}))

async function loadUsers() {
  usersLoading.value = true
  try {
    const res = await listAdminUsers(currentUserParams())
    users.value = res.items
    userTotal.value = res.total
  } catch {
    // 错误提示由拦截器统一弹（避免同一个错误弹两次）；
    // 这里必须吞掉，否则会变成未捕获的 rejection（会在控制台留 error）
  } finally {
    usersLoading.value = false
  }
}

async function loadAudit() {
  auditLoading.value = true
  try {
    auditLogs.value = (await getAdminAuditLogs(20)) || []
  } catch {
    /* 同上：拦截器已提示 */
  } finally {
    auditLoading.value = false
  }
}

/** 写操作成功后统一刷新列表 + 日志（两者都会被这次操作改变） */
async function refreshUserViews() {
  await Promise.all([loadUsers(), loadAudit()])
}

function onUserSearch() {
  userQuery.page = 1
  void loadUsers()
}

function onUserReset() {
  userQuery.keyword = ''
  userQuery.role = ''
  userQuery.disabled = ''
  userQuery.page = 1
  void loadUsers()
}

function onPageChange(page: number) {
  userQuery.page = page
  void loadUsers()
}

function onSizeChange(size: number) {
  userQuery.size = size
  userQuery.page = 1
  void loadUsers()
}

/** 头部刷新按钮：按当前分区决定刷什么，避免在用户管理页刷了半天统计 */
const busy = computed(() =>
  activeTab.value === 'users' ? usersLoading.value || auditLoading.value : loading.value,
)

function onRefresh() {
  if (activeTab.value === 'users') {
    void refreshUserViews()
    return
  }
  void loadAll()
}

// ── 用户管理：操作 ────────────────────────────────────────────

const myUserId = computed(() => loginStore.userInfo?.user_id ?? '')

/**
 * 是不是自己。后端对「封自己 / 改自己角色 / 删自己」一律 400（防自锁），
 * 前端据此**提前禁用**按钮 —— 能点再报错是糟糕的体验，也让人以为系统坏了。
 */
const isSelf = (row: IAdminUser) => row.user_id === myUserId.value

const displayName = (row?: IAdminUser | null) => row?.nickname || row?.username || '该用户'

const shortId = (id: string) => (id ? `${id.slice(0, 8)}…` : '—')

/** 审计动作 → 中文。审计**不是埋点事件**，所以这份映射留在本文件，不进 track-events.ts */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.ban': '封禁/解封',
  'user.role': '修改角色',
  'user.password': '重置密码',
  'user.delete': '删除用户',
  'ai.read': '查看会话',
  'track.export': '导出埋点',
  'config.update': '修改配置',
}
const auditActionLabel = (action: string) => AUDIT_ACTION_LABELS[action] ?? action

/** 审计详情压成一行可读文本 */
function detailText(detail: Record<string, unknown> | null): string {
  if (!detail) return '—'
  return Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join('  ')
}

// 封禁
const banDialogVisible = ref(false)
const banSubmitting = ref(false)
const banTarget = ref<IAdminUser | null>(null)
const banReason = ref('')

function onBan(row: IAdminUser) {
  if (isSelf(row)) return
  if (row.disabled_at) {
    void unban(row)
    return
  }
  banTarget.value = row
  banReason.value = ''
  banDialogVisible.value = true
}

async function unban(row: IAdminUser) {
  try {
    await ElMessageBox.confirm(`确认解除「${displayName(row)}」的封禁？`, '解封用户', {
      type: 'info',
      confirmButtonText: '解封',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消：ElMessageBox 用 reject 表示取消，不是错误
  }
  try {
    await setAdminUserBanned(row.user_id, false)
    track('admin.user.unban', { userId: row.user_id })
    ElMessage.success(`已解封「${displayName(row)}」`)
    await refreshUserViews()
  } catch {
    /* 拦截器已提示 */
  }
}

async function submitBan() {
  const row = banTarget.value
  const reason = banReason.value.trim()
  // 原因**必填**（后端是可选的，这里收紧）：它会原样展示给被封的人，
  // 留空等于让人莫名其妙登不进来还不知道为什么
  if (!row || !reason || banSubmitting.value) return
  banSubmitting.value = true
  try {
    await setAdminUserBanned(row.user_id, true, reason)
    // 只记原因长度，不记原因内容（埋点表不写业务文本，沿用项目约定）
    track('admin.user.ban', { userId: row.user_id, reasonLength: reason.length })
    ElMessage.success(`已封禁「${displayName(row)}」`)
    banDialogVisible.value = false
    await refreshUserViews()
  } catch {
    /* 拦截器已提示 */
  } finally {
    banSubmitting.value = false
  }
}

// 改角色
async function onToggleRole(row: IAdminUser) {
  if (isSelf(row)) return
  const next: AdminUserRole = row.role === 'root' ? 'user' : 'root'
  const promote = next === 'root'
  try {
    await ElMessageBox.confirm(
      promote
        ? `将「${displayName(
            row,
          )}」设为管理员。管理员可以查看全站数据、封禁与删除任何用户，请确认是你信任的人。`
        : `取消「${displayName(row)}」的管理员权限，其将无法再进入管理后台。`,
      promote ? '授予管理员' : '取消管理员',
      {
        type: 'warning',
        confirmButtonText: promote ? '确认授予' : '确认取消',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  try {
    await setAdminUserRole(row.user_id, next)
    track('admin.user.role', { userId: row.user_id, role: next })
    ElMessage.success(promote ? '已授予管理员' : '已取消管理员')
    await refreshUserViews()
  } catch {
    /* 拦截器已提示 */
  }
}

// 重置密码
const pwdDialogVisible = ref(false)
const pwdSubmitting = ref(false)
const pwdTarget = ref<IAdminUser | null>(null)
const pwdFormRef = ref<FormInstance>()
const pwdForm = reactive({ newPassword: '', confirm: '' })
const pwdIsSelf = computed(() => !!pwdTarget.value && isSelf(pwdTarget.value))

const pwdRules: FormRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    // 复用注册/改密同一套规则，避免这里和别处对密码强度的判断漂移
    passwordRule(false),
  ],
  confirm: [
    { required: true, message: '请再输入一次', trigger: 'blur' },
    {
      /*
       * 强制二次输入：这个密码是给**别人**用的，打错了对方直接登不进来，
       * 而且管理员当场看不出来（后端没有「确认密码」这个约束，是前端加的）。
       */
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        callback(value === pwdForm.newPassword ? undefined : new Error('两次输入的密码不一致'))
      },
      trigger: 'blur',
    },
  ],
}

function onResetPassword(row: IAdminUser) {
  pwdTarget.value = row
  pwdForm.newPassword = ''
  pwdForm.confirm = ''
  pwdDialogVisible.value = true
  // 打开时清掉上一次残留的校验红字（表单实例要等下一次 DOM 更新才在）
  void nextTick(() => pwdFormRef.value?.clearValidate())
}

async function submitResetPassword() {
  const row = pwdTarget.value
  if (!row || pwdSubmitting.value) return
  try {
    await pwdFormRef.value?.validate()
  } catch {
    return // 校验不过：表单自己会显示哪里错了
  }
  pwdSubmitting.value = true
  try {
    await resetAdminUserPassword(row.user_id, pwdForm.newPassword)
    track('admin.user.password', { userId: row.user_id, self: isSelf(row) })
    pwdDialogVisible.value = false
    if (pwdIsSelf.value) {
      /*
       * 重置自己 = 改密，而改密会吊销**该用户全部 refreshToken（含本机）**。
       * 不静默重登的话，当前 accessToken 一到期就被踢出去，用户会一脸茫然。
       * 与 `User.vue` 改密后的处理保持一致。
       */
      try {
        await loginStore.loginAction({
          username: loginStore.userInfo!.username,
          password: pwdForm.newPassword,
        })
        ElMessage.success('密码已重置')
      } catch {
        ElNotification({
          type: 'warning',
          title: '请重新登录',
          message: '密码已重置，请使用新密码重新登录',
        })
      }
    } else {
      ElMessage.success(`已重置「${displayName(row)}」的密码，其全部设备已被登出`)
    }
    await refreshUserViews()
  } catch {
    /* 拦截器已提示 */
  } finally {
    pwdSubmitting.value = false
  }
}

// 删除
async function onDelete(row: IAdminUser) {
  if (isSelf(row)) return
  // 先取数据规模：把「不可恢复」从形容词变成具体数字，确认框才有决策价值
  let stats: IAdminUserStats
  try {
    stats = (await getAdminUserDetail(row.user_id)).stats
  } catch {
    return // 拦截器已提示
  }
  try {
    /*
     * 文案写在一个段落里，不用 `\n` 分行 —— ElMessageBox 的 message 默认按纯文本渲染，
     * 换行会被 CSS 折叠掉（想真换行得开 `dangerouslyUseHTMLString`，
     * 那就要把用户昵称拼进 HTML，为了排版引入注入口不值得）。
     */
    await ElMessageBox.confirm(
      `${displayName(row)} 现有 ${stats.conversations} 个 AI 会话、${stats.messages} 条消息、` +
        `${stats.animes} 条追番、${stats.events} 条埋点记录。删除将级联清除其全部数据（含 AI 会话与消息），且不可恢复。`,
      `删除用户「${displayName(row)}」？`,
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  try {
    const res = await deleteAdminUser(row.user_id)
    track('admin.user.delete', {
      userId: row.user_id,
      // 实际清掉的行数：能看出「删一个人」到底动了多少数据
      removedRows: Object.values(res.counts || {}).reduce((a, b) => a + b, 0),
    })
    ElMessage.success('已删除')
    // 删掉的可能是本页最后一条：回退一页，避免停在空页上
    if (users.value.length === 1 && userQuery.page > 1) {
      userQuery.page -= 1
    }
    await refreshUserViews()
  } catch {
    /* 拦截器已提示 */
  }
}
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

/* ── 分区 ─────────────────────────────────────────────────── */
.admin-tabs {
  /*
   * el-tabs 默认给 header 一段较大的下边距和一条浅色底边；
   * 这里把它压紧一点，让「分区」看起来仍属于同一个页面。
   * 颜色用令牌，暗/亮两套主题都会跟着走。
   */
  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }

  :deep(.el-tabs__item) {
    font-size: 14px;
  }
}

/* ── 用户管理 ─────────────────────────────────────────────── */
.user-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;

  &__kw {
    width: 260px;
    max-width: 100%;
  }

  &__sel {
    width: 140px;
  }
}

.user-table {
  width: 100%;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;

  &__text {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
    min-width: 0;
  }

  &__name {
    color: var(--font-color);
  }

  &__sub {
    font-size: 12px;
    color: var(--font-unactive-color);
  }
}

.user-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  /* 封禁原因 icon：做成可点的观感（有 tooltip），但不要抢状态标签的注意力 */
  &__icon {
    cursor: help;
    color: var(--font-unactive-color);
    font-size: 14px;
  }
}

.user-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.user-audit {
  margin-top: 28px;
  /* 日志是次要信息：与上面的用户列表拉开层次，但不要抢视觉重心 */
  padding-top: 20px;
  border-top: 1px solid var(--surface-strong, rgba(128, 128, 128, 0.18));

  &__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
}

/* ── 弹窗 ─────────────────────────────────────────────────── */
.dialog-alert {
  margin-bottom: 16px;
}

.dialog-form {
  :deep(.el-form-item:last-child) {
    margin-bottom: 0;
  }
}

/* 窄屏：筛选控件纵向铺满，否则输入框和两个下拉会挤成两行半 */
@media (max-width: 700px) {
  .user-filter {
    &__kw,
    &__sel {
      width: 100%;
    }
  }
}
</style>
