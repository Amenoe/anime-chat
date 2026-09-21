import type { Directive } from 'vue'

/**
 * 前端埋点。
 *
 * 设计取舍：
 * - **攒批上报**而不是一次点击一个请求。每次点击都发请求会把网络面板刷满、
 *   也让后端埋点接口的 QPS 跟着交互量线性上涨。
 * - **绝不阻断业务**：所有上报失败都吞掉。埋点丢一条可以接受，用户操作失败不可以。
 * - 关闭/切走页面时用 `fetch(keepalive)` 补发最后一批（见 `flushTrack(true)`）。
 *   不用 `sendBeacon` 是因为它无法带 `Authorization` 头，登录用户的事件会被记成匿名。
 * - **刻意不走 `common/request` 的 axios 实例**：那是业务请求层，会解包 `data` 信封、
 *   失败时弹 `ElNotification`、401 还会触发 token 刷新重试 —— 这三件事对埋点全是错的
 *   （用户不该因为埋点上报失败看到报错弹窗）。所以这里直接用 `fetch` 旁路。
 */

/** 一条埋点事件（字段与后端 TrackEventDto 对齐） */
export interface ITrackEventPayload {
  event: string
  page?: string
  target?: string
  props?: Record<string, unknown>
  /** 事件实际发生时间（ISO8601）。前端攒批上报，入库时间会晚于它 */
  clientTs?: string
  /** 未登录访客标识，用于串联匿名行为 */
  anonymousId?: string
}

/** 攒够这么多条就立即上报 */
const FLUSH_SIZE = 20
/** 否则最多等这么久 */
const FLUSH_INTERVAL_MS = 5000
/** 队列硬上限：网络长时间不通时防止内存无限增长 */
const QUEUE_LIMIT = 200
/** 匿名标识的 localStorage key */
const ANON_KEY = 'track_aid'

interface ITrackEvent extends ITrackEventPayload {
  anonymousId: string
}

let queue: ITrackEvent[] = []
let timer: ReturnType<typeof setInterval> | null = null
let currentPage = ''
let initialised = false

/** 匿名标识：未登录时也能把同一访客的行为串起来 */
function anonymousId(): string {
  let id = localStorage.getItem(ANON_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `a-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(ANON_KEY, id)
  }
  return id
}

/** 读取登录态 token。localCache 存的是 JSON，直接 getItem 会拿到带引号的字符串 */
function authToken(): string {
  try {
    const raw = localStorage.getItem('token')
    return raw ? (JSON.parse(raw) as string) : ''
  } catch {
    return ''
  }
}

/**
 * 上报一批事件。失败静默。
 *
 * `keepalive` 用于页面正在关闭的场景：普通请求会被浏览器取消，
 * keepalive 让它在后台发完（这也是不用 sendBeacon 的原因，见文件头注释）。
 */
async function send(events: ITrackEventPayload[], keepalive = false) {
  if (!events.length) return
  const token = authToken()
  try {
    await fetch(`${import.meta.env.VITE_BASE_API}/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ events }),
      keepalive,
    })
  } catch {
    // 故意静默：埋点失败不影响用户
  }
}

/** 立即上报队列里的事件 */
export function flushTrack(keepalive = false) {
  if (!queue.length) return
  const batch = queue
  queue = []
  void send(batch, keepalive)
}

function schedule() {
  if (timer !== null) return
  timer = setInterval(() => {
    flushTrack()
  }, FLUSH_INTERVAL_MS)
}

/**
 * 上报一条事件。
 *
 * @param event 事件名，点号分命名空间：`ai.send`、`ui.click`、`page.view`
 * @param props 自定义属性（自由结构，后端存 JSON）
 * @param target 触发对象，便于区分同一事件的不同来源
 */
export function track(event: string, props?: Record<string, unknown>, target?: string) {
  if (!event) return
  if (queue.length >= QUEUE_LIMIT) {
    // 队列爆了说明网络有问题，丢最旧的而不是无限堆内存
    queue.shift()
  }
  queue.push({
    event,
    page: currentPage || undefined,
    target,
    props,
    clientTs: new Date().toISOString(),
    anonymousId: anonymousId(),
  })
  if (queue.length >= FLUSH_SIZE) {
    flushTrack()
  } else {
    schedule()
  }
}

/** 路由切换时更新当前页面名，后续事件自动带上 */
export function setTrackPage(page: string) {
  currentPage = page
}

/** 初始化：注册关闭页面时的补发。在 main.ts 里调用一次 */
export function initTrack() {
  if (initialised) return
  initialised = true
  schedule()

  // pagehide 比 unload 更可靠（移动端 Safari 不触发 unload）
  window.addEventListener('pagehide', () => flushTrack(true))
  // 切到后台时也补发一次，避免用户长时间不回来导致数据延迟
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTrack(true)
  })
}

// ── v-track 自定义指令 ────────────────────────────────────────

/**
 * 指令绑定值：
 * - 字符串：`v-track="'ai.send'"`，最简单
 * - 对象：`v-track="{ event: 'anime.card.click', props: { id: 1 }, target: 'card' }"`
 */
export type TrackBinding =
  | string
  | { event: string; props?: Record<string, unknown>; target?: string }

interface NormalizedBinding {
  event: string
  props?: Record<string, unknown>
  target?: string
}

function normalize(value: TrackBinding | undefined): NormalizedBinding | null {
  if (!value) return null
  if (typeof value === 'string') return { event: value }
  if (typeof value === 'object' && value.event) {
    return { event: value.event, props: value.props, target: value.target }
  }
  return null
}

type Cleanup = () => void

/**
 * 元素上的清理函数，卸载时调用（事件解绑 / 观察器断开）。
 *
 * 用具名 `Cleanup` 而不是直接写 `() => void`：后者写在泛型参数里会让
 * ESLint 的 `no-spaced-func` 误报（`VoidFunction` 也行，但别名更可读）。
 */
const cleanups = new WeakMap<HTMLElement, Cleanup>()

/**
 * `v-track` —— 让埋点贴着模板写，不用在每个处理函数里手写 `track()`。
 *
 * ```
 * <el-button v-track="'ai.send'">发送</el-button>
 * <el-button v-track.once="'ai.send'">只上报一次</el-button>
 * <div v-track.view="'ai.welcome'">进入视口时上报曝光</div>
 * ```
 *
 * 修饰符：
 * - `.view` 曝光埋点（IntersectionObserver），默认 click
 * - `.once` 只上报一次
 *
 * 事件名建议单独传，`props` 里的值可以引用响应式数据 —— 指令在**触发时**才读
 * `binding.value`，所以拿到的是最新值。
 */
export const vTrack: Directive<HTMLElement, TrackBinding> = {
  mounted(el, binding) {
    const cfg = normalize(binding.value)
    if (!cfg) return

    let fired = false

    if (binding.modifiers.view) {
      // 曝光埋点：进入视口即上报，默认只报一次（否则滚动会刷出大量重复事件）
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            if (!fired || !binding.modifiers.once) {
              fired = true
              track(cfg.event, cfg.props, cfg.target)
            }
            observer.disconnect()
            break
          }
        },
        { threshold: 0.5 },
      )
      observer.observe(el)
      cleanups.set(el, () => observer.disconnect())
      return
    }

    const onClick = () => {
      if (fired && binding.modifiers.once) return
      fired = true
      // 触发时才读，保证拿到最新的响应式值
      const latest = normalize(binding.value) ?? cfg
      track(latest.event, latest.props, latest.target)
    }
    // ⚠️ 必须用**捕获阶段**注册，不能默认冒泡。
    //
    // 踩过的坑：chip 上同时有 `@click="onSuggest"` 与 `v-track`。冒泡阶段 Vue 的处理器先执行，
    // 它把 `streaming` 置真触发重渲染；Vue 在**微任务**里刷新，而 DOM 规范允许微任务检查点
    // 插在「每个监听器调用之间」—— 于是重渲染把元素卸载、`unmounted` 摘掉了我们的监听，
    // 浏览器继续派发本次事件时已经没有它，**点击事件静默丢失**。
    // 捕获阶段在目标处理器之前执行，天然免疫这个问题，语义上也更对：
    // 「用户点了 X」应该在业务反应之前就记下来。
    el.addEventListener('click', onClick, { capture: true, passive: true })
    cleanups.set(el, () => el.removeEventListener('click', onClick, { capture: true }))
  },

  unmounted(el) {
    cleanups.get(el)?.()
    cleanups.delete(el)
  },
}
