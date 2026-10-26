<template>
  <div class="anime-player" :class="{ 'anime-player--controlled': controlled }">
    <div ref="elRef" class="anime-player__el" />
    <p v-if="hint" class="anime-player__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import { DanmakuLayer, type DanmakuItem } from './danmaku'

const props = defineProps<{
  /** 可播放 URL（已含 token 的 stream 或 m3u8） */
  url?: string | null
  /** 标题展示 */
  title?: string
  /** 观众模式：禁用播放器交互控件 */
  controlled?: boolean
  /** 当前房间同步的播放状态，用于播放器首次就绪时决定是否播放 */
  paused?: boolean
  /** 弹幕列表；为空则不渲染弹幕层 */
  danmaku?: DanmakuItem[]
  /** 弹幕开关（父组件持有状态，播放器只负责呈现） */
  danmakuEnabled?: boolean
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
let danmakuLayer: DanmakuLayer | null = null
/** 用户手动暂停标记：暂停后缓冲触发的 play 事件应忽略 */
let userPaused = false

function destroy() {
  if (danmakuLayer) {
    danmakuLayer.destroy()
    danmakuLayer = null
  }
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

  player = new Artplayer(options)

  /*
   * 弹幕层挂在播放器容器内、控件之下：
   * 挂到外层容器会盖住全屏时的控件，挂进 .art-layers 则跟随 Artplayer 的层级管理。
   */
  const layerHost = elRef.value?.querySelector('.art-video-player') as HTMLElement | null
  if (layerHost) {
    danmakuLayer = new DanmakuLayer(layerHost)
    danmakuLayer.setItems(props.danmaku ?? [])
    danmakuLayer.setEnabled(props.danmakuEnabled !== false)
  }

  // 手动触发首次播放（autoplay:false 避免暂停后缓冲自动续播）
  player.on('ready', () => {
    if (player && !props.controlled && !props.paused) {
      player.play?.()
    }
  })

  player.on('video:timeupdate', () => {
    if (player) emit('timeupdate', player.currentTime)
  })
  // 弹幕由 timeupdate 驱动：它是唯一能保证「时间轴推进」的事件
  player.on('video:timeupdate', () => {
    if (player && danmakuLayer) danmakuLayer.update(player.currentTime)
  })
  player.on('play', () => {
    // 缓冲区就绪后浏览器可能自动触发 play，若用户手动暂停过则忽略
    if (userPaused && player) {
      player.pause()
      return
    }
    danmakuLayer?.setPaused(false)
    if (player) emit('play', player.currentTime)
  })
  player.on('pause', () => {
    userPaused = true
    // 暂停时冻结在飞的弹幕（只停发射的话，屏幕上那批会继续跑完，很怪）
    danmakuLayer?.setPaused(true)
    if (player) emit('pause', player.currentTime)
  })
  player.on('seek', () => {
    if (player) {
      // 拖进度条后必须重置游标，否则往回拖时后面的弹幕永远不再出现
      danmakuLayer?.reset(player.currentTime)
      emit('seek', player.currentTime)
    }
  })

  player.on('error', () => {
    hint.value = '播放失败：请更换数据源重试'
    emit('error')
  })
}

/** 弹幕数据换集时整体替换（父组件拉到新弹幕后调用） */
watch(
  () => props.danmaku,
  (items) => {
    danmakuLayer?.setItems(items ?? [])
    // 换集后游标必须回到 0，否则新弹幕一条都不会发射
    if (player) danmakuLayer?.reset(player.currentTime)
  },
)

/** 弹幕开关 */
watch(
  () => props.danmakuEnabled,
  (on) => danmakuLayer?.setEnabled(on !== false),
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
