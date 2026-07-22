<template>
  <div class="anime-player">
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

  const isHls = /\.m3u8(\?|$)/i.test(url)

  player = new Artplayer({
    container: elRef.value,
    url,
    volume: 0.7,
    autoplay: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: true,
    setting: true,
    playbackRate: true,
    aspectRatio: true,
    theme: '#68c6bd',
    lang: 'zh-cn',
    moreVideoAttr: {
      crossOrigin: 'anonymous',
    },
    customType: isHls
      ? {
          m3u8(video: HTMLVideoElement, u: string, art: Artplayer) {
            if (Hls.isSupported()) {
              const hls = new Hls()
              hls.loadSource(u)
              hls.attachMedia(video)
              art.on('destroy', () => hls.destroy())
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = u
            } else {
              art.notice.show = '当前浏览器不支持 HLS'
            }
          },
        }
      : undefined,
    type: isHls ? 'm3u8' : undefined,
  })

  player.on('error', () => {
    hint.value = '播放失败：可能仍在缓冲、格式不支持（如 mkv）或源不可用'
  })
}

watch(
  () => props.url,
  (u) => {
    if (u) createPlayer(u)
    else destroy()
  },
)

onMounted(() => {
  if (props.url) createPlayer(props.url)
})

onBeforeUnmount(() => destroy())
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
}
</style>
