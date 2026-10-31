import { useLoginStore } from '@/stores/modules/login'
import {
  PERSISTED_KEYS,
  getDanmakuSettings,
  saveDanmakuSettings,
  type DanmakuSettings,
} from '@/api/user-settings'

/**
 * 弹幕偏好：登录后跟账号走（跨设备），未登录退回 localStorage（本机记住）。
 *
 * <h2>为什么不用 artplayer 自带的 storage</h2>
 * 那是 localStorage，换设备/换浏览器就丢 —— 而这里要的是「跟随账号」。
 */

const LOCAL_KEY = 'anime-chat:danmaku-settings'

/**
 * 保存防抖。用户拖动速度/透明度滑块会连续触发 config 事件，
 * 不合并的话一次拖动就是十几个 PATCH。
 */
const SAVE_DELAY = 800

/** 模块级单例：同一页面多个播放器（比如详情页 + 抽屉预览）共享同一份设置 */
const settings = ref<DanmakuSettings>({})
const loaded = ref(false)
/**
 * 上次加载对应的账号（null = 未登录）。
 * 换账号或登出时必须重新加载，否则会把上一个账号的偏好继续沿用。
 */
let loadedFor: string | null = null
let loading: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
let pending: DanmakuSettings = {}

function pickPersisted(source: Record<string, unknown>): DanmakuSettings {
  const out: DanmakuSettings = {}
  for (const key of PERSISTED_KEYS) {
    if (source[key] !== undefined) {
      // margin 是数组，浅拷贝一下避免外部改动影响缓存
      ;(out as Record<string, unknown>)[key] = Array.isArray(source[key])
        ? [...(source[key] as unknown[])]
        : source[key]
    }
  }
  return out
}

function readLocal(): DanmakuSettings {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as DanmakuSettings) : {}
  } catch {
    return {}
  }
}

function writeLocal(value: DanmakuSettings) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(value))
  } catch {
    /* 隐私模式下可能抛错，忽略：设置记不住不影响播放 */
  }
}

export function useDanmakuSettings() {
  const loginStore = useLoginStore()

  /**
   * 加载设置。只加载一次（loaded 标记），重复调用返回同一个 Promise。
   *
   * 未登录直接用 localStorage；登录后优先用服务端（服务端为空说明没同步过，
   * 此时把本地已有的推上去，避免用户第一次登录后设置「消失」）。
   */
  async function load(force = false): Promise<void> {
    const userId = loginStore.userInfo?.user_id ?? null
    if (loaded.value && !force && loadedFor === userId) return
    if (loading && !force) return loading

    loading = (async () => {
      const local = readLocal()
      if (!loginStore.accessToken) {
        settings.value = local
        loaded.value = true
        return
      }
      try {
        const remote = await getDanmakuSettings()
        if (remote && Object.keys(remote).length) {
          settings.value = pickPersisted(remote)
        } else if (Object.keys(local).length) {
          // 服务端没记录但本机有：把本地推上去，别让用户白调一遍
          settings.value = local
          await saveDanmakuSettings(local)
        } else {
          settings.value = {}
        }
      } catch {
        // 拉取失败就用本地的，弹幕设置不该因为网络问题丢失体验
        settings.value = local
      }
      loadedFor = userId
      loaded.value = true
    })()

    try {
      await loading
    } finally {
      loading = null
    }
  }

  /** 合并保存（防抖）。未登录写 localStorage，登录后写服务端。 */
  function save(partial: DanmakuSettings): void {
    const patch = pickPersisted(partial as Record<string, unknown>)
    if (!Object.keys(patch).length) return

    settings.value = { ...settings.value, ...patch }
    pending = { ...pending, ...patch }

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const payload = pending
      pending = {}
      saveTimer = undefined

      // 无论是否登录都写一份本地：下次未登录打开也有记忆
      writeLocal(settings.value)

      if (!loginStore.accessToken) return
      void saveDanmakuSettings(payload).catch(() => {
        /* 静默：保存失败不该弹提示打断看番，下次改动会再试 */
      })
    }, SAVE_DELAY)
  }

  /** 退出登录时清掉内存态，避免把上一个账号的偏好带给下一个人 */
  function reset(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined
    pending = {}
    settings.value = {}
    loaded.value = false
    loadedFor = null
    loading = null
  }

  return { settings, loaded, load, save, reset }
}
