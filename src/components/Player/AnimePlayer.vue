<template>
  <div class="anime-player" :class="{ 'anime-player--controlled': controlled }">
    <div ref="elRef" class="anime-player__el" />
    <p v-if="hint" class="anime-player__hint">{{ hint }}</p>
    <div v-if="subtitles?.length" class="anime-player__subs">
      <span class="anime-player__subs-label">字幕</span>
      <el-select v-model="activeSub" size="small" class="anime-player__subs-select">
        <el-option :value="-1" label="关闭" />
        <el-option v-for="s in subtitles" :key="s.index" :value="s.index" :label="s.label" />
      </el-select>
      <span class="anime-player__subs-label">字号</span>
      <el-select v-model="subScale" size="small" class="anime-player__subs-size">
        <el-option v-for="o in subSizeOptions" :key="o.value" :value="o.value" :label="o.label" />
      </el-select>
    </div>
  </div>
</template>

<script setup lang="ts">
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'
import type { Danmu } from 'artplayer-plugin-danmuku'
import { useDanmakuSettings } from '@/composables/useDanmakuSettings'

const props = defineProps<{
  /** 可播放 URL（已含 token 的 stream 或 m3u8） */
  url?: string | null
  /** 标题展示 */
  title?: string
  /** 观众模式：禁用播放器交互控件 */
  controlled?: boolean
  /** 当前房间同步的播放状态，用于播放器首次就绪时决定是否播放 */
  paused?: boolean
  /** 弹幕列表；为空则不显示弹幕 */
  danmaku?: Danmu[]
  /** 内嵌字幕轨（后端把 ASS/SRT 转成 VTT；`-1` 表示关闭） */
  subtitles?: Array<{ index: number; label: string; url: string }>
  /**
   * 缓冲不足时自动重试（点播室用）。
   *
   * 边下边播时服务端在文件还没下到该区间会返回 503，`<video>` 只会触发一次 error，
   * 不会自己重试；这里隔 2s 用带 cache-bust 的同一地址重建播放器并 seek 回原进度，
   * 直到数据够用或超过次数上限。
   */
  autoRetry?: boolean
}>()

const emit = defineEmits<{
  timeupdate: [currentTime: number]
  play: [currentTime: number]
  pause: [currentTime: number]
  seek: [currentTime: number]
  error: []
}>()

const elRef = ref<HTMLDivElement | null>(null)
const hint = ref('')
let player: Artplayer | null = null
/** 当前显示的字幕轨（-1 = 关闭） */
const activeSub = ref<number>(-1)

/**
 * 字幕字号（百分比，相对浏览器默认 cue 字号）。
 *
 * 原生 <track> 的样式只能用 `video::cue` 控制，而 ::cue 读不到 CSS 变量，
 * 所以这里动态维护一条样式规则；偏好存 localStorage，点播室/放映室共用。
 */
const SUB_SIZE_KEY = 'player-subtitle-size'
const subSizeOptions = [
  { label: '小', value: 60 },
  { label: '较小', value: 80 },
  { label: '标准', value: 100 },
  { label: '大', value: 120 },
]
const savedScale = Number(localStorage.getItem(SUB_SIZE_KEY))
const subScale = ref<number>(subSizeOptions.some((o) => o.value === savedScale) ? savedScale : 100)
let cueStyleEl: HTMLStyleElement | null = null

function applyCueStyle() {
  if (!cueStyleEl) {
    cueStyleEl = document.createElement('style')
    document.head.appendChild(cueStyleEl)
  }
  cueStyleEl.textContent = `.anime-player__video::cue { font-size: ${subScale.value}%; }`
}

watch(subScale, (v) => {
  localStorage.setItem(SUB_SIZE_KEY, String(v))
  applyCueStyle()
})
/** 自动重试：第几次、重试后要回跳到的进度、定时器 */
let retryCount = 0
let pendingSeek = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const MAX_RETRY = 60
/** 插件实例（art.plugins.artplayerPluginDanmuku），用于换集热更新弹幕 */
interface DanmakuHandle {
  load: (items: Danmu[]) => void
  show: () => void
  hide: () => void
  config: (option: Record<string, unknown>) => void
}
let danmakuPlugin: DanmakuHandle | null = null

const danmakuSettings = useDanmakuSettings()

/** 正在把「服务端读回的偏好」应用给插件；期间不要回写，避免无谓请求 */
let applyingRemote = false
/** 用户手动暂停标记：暂停后缓冲触发的 play 事件应忽略 */
let userPaused = false

/**
 * 用户任何一次按下（点播放按钮、点画面、拖进度条）都视为「他想让播放器动起来」，
 * 于是解除 userPaused。
 *
 * 用捕获阶段：pointerdown 必然早于 Artplayer 内部触发的 play，
 * 所以 play 事件到达时标记已是 false，不会被误拦。
 * 缓冲导致的自动 play 没有 pointerdown，标记保持 true，仍会被拦下 —— 正是想要的行为。
 *
 * 这个函数是修「暂停后无法继续播放」的关键：原来标记只由 setPaused() 解除，
 * 而详情页不走放映室同步，于是一次暂停后 play 永远被拦，播放器彻底卡死。
 */
function clearUserPaused() {
  userPaused = false
}

/**
 * 只挂**当前选中**的那一条字幕。
 *
 * 一开始是每条都挂 <track> 再切 mode，但浏览器把多条 subtitle 轨道都置成
 * `showing`（双语字幕会整屏叠字）；改成「同一时刻只存在一个 track 元素」，
 * 行为确定得多。
 */
function mountSubtitle() {
  const video = player?.video
  if (!video) return
  video.querySelectorAll('track').forEach((el) => el.remove())
  const list = props.subtitles || []
  const chosen = list.find((s) => s.index === activeSub.value)
  if (!chosen) return
  const el = document.createElement('track')
  el.kind = 'subtitles'
  el.label = chosen.label
  el.srclang = 'zh'
  el.src = chosen.url
  el.default = true
  video.appendChild(el)
}

/** 字幕轨变化（换源/换会话/拉到新轨）时校正选择 */
function attachSubtitles() {
  const list = props.subtitles || []
  if (!list.length) {
    activeSub.value = -1
    mountSubtitle()
    return
  }
  if (!list.some((s) => s.index === activeSub.value)) activeSub.value = list[0].index
  mountSubtitle()
}

/** 兜底：seek / 重建播放器后浏览器可能把 track 的 mode 重置掉，播放中保持它可见 */
function ensureSubtitleMode() {
  const video = player?.video
  if (!video || activeSub.value === -1) return
  const track = video.textTracks[0]
  if (track && track.mode !== 'showing') track.mode = 'showing'
}

watch(activeSub, () => mountSubtitle())
watch(
  () => props.subtitles,
  () => {
    if (player) attachSubtitles()
  },
  { deep: true },
)

function destroy() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  danmakuPlugin = null
  elRef.value?.removeEventListener('pointerdown', clearUserPaused, true)
  if (player) {
    try {
      player.destroy(false)
    } catch {
      /* ignore */
    }
    player = null
  }
}

function createPlayer(url: string) {
  if (!elRef.value) return
  destroy()
  hint.value = ''
  userPaused = false

  // 代理 stream 路径无 .m3u8：必须靠 type=m3u8 query（BT progressive 不带此参数）
  const isHls = /\.m3u8(\?|$)/i.test(url) || /[?&]type=m3u8\b/i.test(url)
  const readonly = !!props.controlled

  const options: ConstructorParameters<typeof Artplayer>[0] = {
    container: elRef.value,
    url,
    volume: 0.7,
    autoplay: false,
    pip: !readonly,
    fullscreen: true,
    fullscreenWeb: true,
    setting: !readonly,
    playbackRate: !readonly,
    aspectRatio: !readonly,
    // Artplayer 内部把 theme 写进元素行内样式变量 --art-theme（setProperty），
    // 因此这里传 var() 可由浏览器解析并跟随主题切换，避免写死主题色。
    theme: 'var(--primary-color)',
    lang: 'zh-cn',
    moreVideoAttr: {
      crossOrigin: 'anonymous',
    },
  }

  if (isHls) {
    options.type = 'm3u8'
    options.customType = {
      m3u8(video: HTMLVideoElement, u: string, art: Artplayer) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            // 分片是服务端按需转码的（第一次请求约 1s），给足缓冲与重试
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            fragLoadPolicy: {
              default: {
                maxTimeToFirstByteMs: 20000,
                maxLoadTimeMs: 120000,
                timeoutRetry: {
                  maxNumRetry: 8,
                  retryDelayMs: 1000,
                  maxRetryDelayMs: 8000,
                },
                errorRetry: {
                  maxNumRetry: 8,
                  retryDelayMs: 1000,
                  maxRetryDelayMs: 8000,
                },
              },
            },
            xhrSetup(xhr) {
              xhr.withCredentials = false
            },
          })
          hls.loadSource(u)
          hls.attachMedia(video)
          art.on('destroy', () => {
            try {
              hls.destroy()
            } catch {
              /* ignore */
            }
          })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = u
        } else {
          art.notice.show = '当前浏览器不支持 HLS'
        }
      },
    }
  }

  /*
   * 弹幕用 artplayer-plugin-danmuku。
   *
   * `mount` 不传 = 默认挂在**播放器控制栏中部**，开关也在控制栏上（要求如此）。
   * `emitter: false`：本站没有弹幕发送接口，摆一个发不出去的输入框只会误导人。
   */
  options.plugins = [
    artplayerPluginDanmuku({
      danmuku: props.danmaku ?? [],
      // 默认值；用户保存过的偏好覆盖它们（见下面的 config 应用）
      speed: 8,
      opacity: 1,
      fontSize: 25,
      antiOverlap: true,
      synchronousPlayback: true,
      emitter: false,
      visible: true,
      margin: [10, '25%'],
      ...danmakuSettings.settings.value,
    }),
  ]

  player = new Artplayer(options)
  // ::cue 只能作用在 video 元素上，加个 class 让字号规则精确命中
  player.video.classList.add('anime-player__video')
  danmakuPlugin =
    (player.plugins as Record<string, DanmakuHandle> | undefined)?.artplayerPluginDanmuku ?? null

  /*
   * 应用用户已保存的弹幕偏好。
   *
   * 必须显式 load()：`settings` 是模块级单例，只有 load 过才有值；
   * 上面 `...danmakuSettings.settings.value` 展开的是**上一次 load 的结果**，
   * 首次进站时它是空的 —— 这也是「换了部番设置就重置」的根因：
   * 换番会重建播放器，若从未 load 过就永远拿默认值。
   */
  void danmakuSettings.load().then(() => {
    const saved = danmakuSettings.settings.value
    if (!danmakuPlugin || !Object.keys(saved).length) return
    // 应用期间不要回写：插件的 config() 内部会 emit 一次 config，
    // 不挡住的话刚读回来的值又被存一遍，纯属多余请求。
    applyingRemote = true
    try {
      danmakuPlugin.config(saved as Record<string, unknown>)
    } finally {
      applyingRemote = false
    }
  })

  // 用户在控制栏开关 / 设置面板里改动 → 记下来
  // 插件自定义事件不在 Artplayer 的类型声明里，用 any 承接（值仍是插件的完整 option）
  player.on(
    'artplayerPluginDanmuku:config' as never,
    ((option: unknown) => {
      if (applyingRemote) return
      danmakuSettings.save(option as Parameters<typeof danmakuSettings.save>[0])
    }) as never,
  )
  // 开关走的是 hide/show 而不是 config（插件里 visible 由这两个方法维护），单独记
  player.on('artplayerPluginDanmuku:hide', () => {
    if (!applyingRemote) danmakuSettings.save({ visible: false })
  })
  player.on('artplayerPluginDanmuku:show', () => {
    if (!applyingRemote) danmakuSettings.save({ visible: true })
  })

  // 手动触发首次播放（autoplay:false 避免暂停后缓冲自动续播）
  player.on('ready', () => {
    if (!player) return
    if (pendingSeek > 0.5) {
      try {
        player.currentTime = pendingSeek
      } catch {
        /* seek 失败就从头播 */
      }
      pendingSeek = 0
    }
    if (!props.controlled && !props.paused) {
      player.play?.()
    }
  })

  player.on('video:timeupdate', () => {
    if (!player) return
    ensureSubtitleMode()
    if (player.currentTime > 0.5) pendingSeek = player.currentTime
    emit('timeupdate', player.currentTime)
  })
  player.on('play', () => {
    /*
     * 忽略「非用户发起」的自动播放：用户手动暂停后，缓冲就绪时浏览器可能自己 play。
     *
     * ⚠️ `userPaused` 必须能被用户操作解除，否则一次暂停就再也播不了 ——
     * 这里靠下面的 pointerdown 解除（用户点播放按钮时先触发 pointerdown）。
     */
    if (userPaused && player) {
      player.pause()
      return
    }
    if (player) emit('play', player.currentTime)
  })

  // 用户一按下就解除暂停标记（说明见模块级 clearUserPaused）
  elRef.value?.addEventListener('pointerdown', clearUserPaused, true)
  player.on('pause', () => {
    userPaused = true
    if (player) emit('pause', player.currentTime)
  })
  player.on('seek', () => {
    if (player) emit('seek', player.currentTime)
  })

  // 字幕：把 <track> 挂到播放器自己的 video 上（换源重建播放器后会再挂一次）
  attachSubtitles()

  player.on('error', () => {
    emit('error')
    if (!props.autoRetry || !props.url) {
      hint.value = '播放失败：请更换数据源重试'
      return
    }
    if (retryCount >= MAX_RETRY) {
      hint.value = '长时间缓冲不足，请换源或等下载完成'
      return
    }
    retryCount += 1
    pendingSeek = Math.max(pendingSeek, player?.currentTime || 0)
    hint.value = `缓冲中，正在重试（${retryCount}/${MAX_RETRY}）…`
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      retryTimer = null
      const base = props.url
      if (!base) return
      const sep = base.includes('?') ? '&' : '?'
      createPlayer(`${base}${sep}_r=${retryCount}`)
    }, 2000)
  })
}

/** 弹幕数据换集时整体替换（父组件拉到新弹幕后调用） */
/**
 * 换集时热更新弹幕。
 *
 * 用插件的 load() 而不是重建播放器：重建会丢播放进度、并让观众端重新同步一次。
 * 插件内部会把游标重置到当前时间，不需要我们再算。
 */
watch(
  () => props.danmaku,
  (items) => {
    // 兜底重新取一次：插件在 `new Artplayer()` 后即可用（实测），
    // 但若将来它在 ready 之后才挂载，这里的重取能避免「换集后弹幕不更新」。
    if (!danmakuPlugin && player) {
      danmakuPlugin =
        (player.plugins as Record<string, DanmakuHandle> | undefined)?.artplayerPluginDanmuku ??
        null
    }
    danmakuPlugin?.load(items ?? [])
  },
)

function seekTo(time: number) {
  if (player) player.currentTime = time
}

function setPaused(paused: boolean) {
  if (!player) return
  if (paused) {
    userPaused = true
    player.pause()
  } else {
    userPaused = false
    // play() 返回 promise，seek 缓冲 / 自动播放策略下可能 reject，需兜住
    const r = player.play?.()
    if (r && typeof (r as Promise<void>).catch === 'function') {
      ;(r as Promise<void>).catch(() => {})
    }
  }
}

function getPlayer(): Artplayer | null {
  return player
}

function clearHint() {
  hint.value = ''
}

watch(
  () => props.url,
  (u) => {
    hint.value = ''
    retryCount = 0
    pendingSeek = 0
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (u) createPlayer(u)
    else destroy()
  },
)

onMounted(() => {
  applyCueStyle()
  if (props.url) createPlayer(props.url)
})

onBeforeUnmount(() => {
  cueStyleEl?.remove()
  cueStyleEl = null
  destroy()
})

defineExpose({ seekTo, setPaused, getPlayer, clearHint })
</script>

<style scoped lang="less">
/*
 * 弹幕样式必须是**全局**的：节点由 danmaku.ts 动态创建，拿不到 scoped 的 data-v 属性，
 * 写在 scoped 里会完全不生效（踩过）。
 */

.anime-player {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  border: 1px solid rgba(104, 198, 189, 0.15);

  &__el {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 70vh;
  }

  &__hint {
    margin: 0;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--font-unactive-color);
    background: var(--aside-bg-color);
  }

  &__subs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--aside-bg-color);
    border-top: 1px solid rgba(104, 198, 189, 0.12);

    &-label {
      font-size: 12px;
      color: var(--font-unactive-color);
    }

    &-select {
      width: 160px;
    }

    &-size {
      width: 96px;
    }
  }

  &--controlled &__el {
    pointer-events: none;
  }
}

@media (max-width: 768px) {
  .anime-player {
    border-radius: 0;

    &__el {
      max-height: 50vh;
    }
  }
}
</style>
