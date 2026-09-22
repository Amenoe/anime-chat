/**
 * 埋点事件名的**中文直白名**映射。
 *
 * 为什么要有这一层：看板上直接摆 `page.view` / `ai.card.click` 这种内部代号，
 * 只有写埋点的人看得懂；管理员想知道的是「用户都在干什么」。
 *
 * 为什么放在前端而不是后端：
 * 事件的**采集**是前后端共用的（同一张 `track_event` 表），但「怎么念给管理员听」
 * 是展示层的事。放在前端改一次就生效、不用发后端，也不给统计接口加一个纯展示字段。
 * 代价是这张表要与 `utils/track.ts` 的调用处保持同步 —— 所以命名**照抄**事件名，
 * 这样 grep 事件名就能同时找到采集点和这里。
 *
 * 兜底策略：表里没有的事件名**原样返回**，而不是显示「未知事件」。
 * 新加埋点时看板会直接露出原始代号 —— 这比一个含糊的「未知」更有用，
 * 也让人一眼看出「这里少了一条映射」。
 */

/** 路由名 → 页面中文名。键与 `router/index.ts` 的 `name` 一致 */
const PAGE_LABELS: Record<string, string> = {
  Home: '首页',
  Search: '搜索页',
  Ai: 'AI 助手',
  User: '个人中心',
  Admin: '管理看板',
  Detail: '番剧详情',
  Room: '放映室',
}

/** 事件名 → 中文名 */
const EVENT_LABELS: Record<string, string> = {
  // ── 通用 ──────────────────────────────────────────
  // page.view 的文案由 PAGE_LABELS 拼出来，见 eventLabel()
  'page.view': '页面访问',

  // ── AI 助手 ───────────────────────────────────────
  'ai.chat': 'AI 对话请求',
  'ai.send.click': 'AI 发送提问',
  'ai.done': 'AI 回答完成',
  'ai.error': 'AI 回答失败',
  'ai.stop': '用户中断回答',
  'ai.suggest.click': '点击示例问题',
  'ai.conversation.new': '新建对话',
  'ai.conversation.open': '打开历史对话',
  'ai.conversation.delete': '删除对话',
  'ai.welcome.view': 'AI 欢迎页曝光',
  'ai.card.click': 'AI 推荐卡片点击',

  // ── 搜索 ──────────────────────────────────────────
  'search.submit': '提交搜索',
  'search.result.click': '搜索结果点击',

  // ── 管理看板 ──────────────────────────────────────
  'admin.range.change': '切换统计区间',
  'admin.refresh': '刷新看板',
  'admin.tab.change': '切换管理分区',

  // ── 管理端 · 用户管理 ─────────────────────────────
  'admin.user.search': '搜索用户',
  'admin.user.page': '用户列表翻页',
  'admin.user.ban': '封禁用户',
  'admin.user.unban': '解封用户',
  'admin.user.role': '修改用户角色',
  'admin.user.password': '重置用户密码',
  'admin.user.delete': '删除用户',
  'admin.audit.refresh': '刷新操作日志',
}

/**
 * 事件的可读名。
 *
 * `page.view` 是**唯一**需要看 `page` 才能念准的事件（同一个事件名出现在所有页面），
 * 所以这里不是纯字典查表。
 */
export function eventLabel(event: string, page?: string | null): string {
  if (event === 'page.view') {
    const name = page ? PAGE_LABELS[page] : ''
    // 页面名认不出来时退回事件本名，别拼出「访问」这种半截文案
    return name ? `${name}访问` : EVENT_LABELS['page.view']
  }
  return EVENT_LABELS[event] ?? event
}

/** 事件是否已有中文映射（看板据此决定要不要把原始代号一起显示出来） */
export function hasEventLabel(event: string): boolean {
  return event in EVENT_LABELS
}
