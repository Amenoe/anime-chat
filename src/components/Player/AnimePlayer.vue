<template>
  <div class="anime-player" :class="{ 'anime-player--controlled': controlled }">
    <div ref="elRef" class="anime-player__el" />
    <p v-if="hint" class="anime-player__hint">{{ hint }}</p>
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
/** 插件实例（art.plugins.artplayerPluginDanmuku），用于换集热更新弹幕 */
interface DanmakuHandle {
  load: (items: Danmu[]) => void
  show: () => void
  hide: () => void
  config: (option: Record<string, unknown>) => void
}
let danmakuPlugin: DanmakuHandle | null = null

const danmakuSettings = useDanmakuSettings()
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

function destroy() {
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
  danmakuPlugin =
    (player.plugins as Record<string, DanmakuHandle> | undefined)?.artplayerPluginDanmuku ?? null

  // 手动触发首次播放（autoplay:false 避免暂停后缓冲自动续播）
  player.on('ready', () => {
    if (player && !props.controlled && !props.paused) {
      player.play?.()
    }
  })

  player.on('video:timeupdate', () => {
    if (player) emit('timeupdate', player.currentTime)
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

  player.on('error', () => {
    hint.value = '播放失败：请更换数据源重试'
    emit('error')
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
    if (u) createPlayer(u)
    else destroy()
  },
)

onMounted(() => {
  if (props.url) createPlayer(props.url)
})

onBeforeUnmount(() => destroy())

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
