<template>
  <div class="anime-player" :class="{ 'anime-player--controlled': controlled }">
    <div ref="elRef" class="anime-player__el" />
    <p v-if="hint" class="anime-player__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import Artplayer from 'artplayer'
import Hls from 'hls.js'

const props = defineProps<{
  /** 可播放 URL（已含 token 的 stream 或 m3u8） */
  url?: string | null
  /** 标题展示 */
  title?: string
  /** 观众模式：禁用播放器交互控件 */
  controlled?: boolean
}>()

const emit = defineEmits<{
  timeupdate: [currentTime: number]
  play: [currentTime: number]
  pause: [currentTime: number]
  seek: [currentTime: number]
}>()

const elRef = ref<HTMLDivElement | null>(null)
const hint = ref('')
let player: Artplayer | null = null

function destroy() {
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

  const isHls = /\.m3u8(\?|$)/i.test(url) || /[?&]type=m3u8\b/i.test(url)
  const readonly = !!props.controlled

  const options: ConstructorParameters<typeof Artplayer>[0] = {
    container: elRef.value,
    url,
    volume: 0.7,
    autoplay: true,
    pip: !readonly,
    fullscreen: true,
    fullscreenWeb: true,
    setting: !readonly,
    playbackRate: !readonly,
    aspectRatio: !readonly,
    theme: '#68c6bd',
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

  player.on('video:timeupdate', () => {
    if (player) emit('timeupdate', player.currentTime)
  })
  player.on('play', () => {
    if (player) emit('play', player.currentTime)
  })
  player.on('pause', () => {
    if (player) emit('pause', player.currentTime)
  })
  player.on('seek', () => {
    if (player) emit('seek', player.currentTime)
  })

  player.on('error', () => {
    hint.value = '播放失败：请更换数据源重试'
  })
}

function seekTo(time: number) {
  if (player) player.currentTime = time
}

function setPaused(paused: boolean) {
  if (!player) return
  if (paused) player.pause()
  else player.play()
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
</style>
