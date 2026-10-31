<template>
  <div class="vod-player">
    <!-- 房主：自己选源 -->
    <template v-if="isHost">
      <div class="vod-player__bar">
        <el-input
          v-model="manualUri"
          class="vod-player__uri"
          clearable
          placeholder="粘贴磁力 / 直链（magnet:、http 的 mp4 / m3u8 / .torrent）"
          :disabled="creating"
          @keyup.enter="playManual"
        />
        <el-button type="primary" :loading="creating" @click="playManual">播放</el-button>
      </div>

      <div class="vod-player__search">
        <el-input
          v-model="keyword"
          class="vod-player__keyword"
          clearable
          placeholder="搜资源：番剧名 / 关键词"
          @keyup.enter="search"
        />
        <el-input-number
          v-model="episodeSort"
          class="vod-player__ep"
          :min="0"
          :max="9999"
          :controls="false"
          placeholder="集"
        />
        <el-button :loading="searching" @click="search">搜源</el-button>
        <span class="vod-player__hint">搜索使用「个人中心 → 数据源」里启用的站点</span>
      </div>

      <div v-if="candidates.length" class="vod-player__hits">
        <div class="vod-player__hits-head">
          <span>找到 {{ candidates.length }} 个资源</span>
          <el-button link size="small" @click="candidates = []">收起</el-button>
        </div>
        <button
          v-for="(c, i) in candidates"
          :key="i + c.uri"
          type="button"
          class="hit"
          :title="c.uri"
          :disabled="creating"
          @click="playCandidate(c)"
        >
          <span class="hit__kind">{{ c.kind === 'bt' ? 'BT' : c.resolved ? '直链' : '线路' }}</span>
          <span class="hit__title">{{ c.title || c.channel || c.uri }}</span>
          <span class="hit__src">{{ c.sourceName }}</span>
        </button>
      </div>
    </template>

    <!-- 成员：跟随房主 -->
    <div v-else class="vod-player__follow">
      <span class="vod-player__follow-dot" />
      {{ activeSessionId ? '正在跟随房主播放（进度以房主为准）' : '房主还没有开播，稍等一下' }}
    </div>

    <div class="vod-player__stage">
      <AnimePlayer
        v-if="playUrl"
        ref="playerRef"
        :url="playUrl"
        :title="title"
        :controlled="!isHost"
        :subtitles="subtitles"
        auto-retry
        @timeupdate="onTimeUpdate"
        @play="onPlay"
        @pause="onPause"
        @seek="onSeek"
      />
      <div v-else class="vod-player__placeholder">
        <template v-if="isHost">
          {{ waitingMeta ? '正在获取种子信息…' : '粘贴磁力/直链，或搜索资源后点一条开始播放' }}
        </template>
        <template v-else>等待房主开播…</template>
      </div>
    </div>

    <div v-if="session" class="vod-player__status">
      <span class="tag">{{ statusLabel }}</span>
      <span v-if="session.remuxRequired" class="mode">转封装</span>
      <span v-if="!isStreamSession" class="meta">{{ progressText }}</span>
      <span v-if="session.fileName" class="file" :title="session.fileName">{{
        session.fileName
      }}</span>
      <span v-if="session.errorMessage" class="err">{{ session.errorMessage }}</span>
    </div>
    <el-progress
      v-if="session && !isStreamSession && progressPercent < 100"
      class="vod-player__progress"
      :percentage="progressPercent"
      :stroke-width="6"
      :show-text="false"
    />
  </div>
</template>

<script setup lang="ts">
import {
  buildHlsPlaylistUrl,
  buildPlaybackStreamUrl,
  buildSubtitleUrl,
  getSessionSubtitles,
  createPlaybackSession,
  createStreamPlaybackSession,
  getPlaybackSession,
  searchPlaybackSources,
  type PlayCandidate,
  type PlaybackSessionView,
} from '@/api/playback'
import { useVodStore } from '@/stores/modules/vod'
import AnimePlayer from '@/components/Player/AnimePlayer.vue'

/**
 * 点播室播放器：房主选源、房间成员同步跟随。
 *
 * - 房主：创建播放会话后只把 `session_id` 广播出去（**不**广播带自己 token 的地址），
 *   成员各自用自己的 token 拉流 —— 否则观众等于拿到了房主的 accessToken。
 * - 成员：`playback:state` 决定播什么、播到哪；播放器 `controlled`，只读跟随。
 * - 无弹幕。
 */
const vodStore = useVodStore()

const manualUri = ref('')
const keyword = ref('')
const episodeSort = ref<number>(1)
const searching = ref(false)
const creating = ref(false)
const candidates = ref<PlayCandidate[]>([])
const session = ref<PlaybackSessionView | null>(null)
const playUrl = ref<string | null>(null)
/** 内嵌字幕轨（后端转 VTT，切换在 AnimePlayer 内部） */
const subtitles = ref<Array<{ index: number; label: string; url: string }>>([])
const waitingMeta = ref(false)
const playerRef = ref<InstanceType<typeof AnimePlayer> | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null
let searchToken = 0
/** 本地轮询的会话 id：房主刚创建的会话可能早于 playback:state 广播到达 */
let pollSessionId = ''

const isHost = computed(() => vodStore.role === 'host')
const playbackState = computed(() => vodStore.playbackState)
/** 当前播的是哪条会话：房主与成员同源（后端把 set_source 广播给房主自己） */
const activeSessionId = computed(() => playbackState.value?.session_id || '')

const title = computed(() => session.value?.fileName || vodStore.group?.group_name || '点播室')
const isStreamSession = computed(() => session.value?.playMode !== 'progressive')
const progressPercent = computed(() =>
  Math.min(100, Math.round((session.value?.progress ?? 0) * 100)),
)

const statusLabel = computed(() => {
  const m: Record<string, string> = {
    created: '已创建',
    fetching: '获取种子信息',
    downloading: '下载中',
    playable: '可播放',
    ready: '已完成',
    failed: '失败',
  }
  return m[session.value?.status || ''] || session.value?.status || '-'
})

const progressText = computed(() => {
  const s = session.value
  if (!s) return ''
  const dl = formatBytes(s.downloadedBytes)
  const total = formatBytes(s.sizeBytes)
  return `${progressPercent.value}% · ${dl}${total ? ' / ' + total : ''}`
})

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`
}

/** 用**当前用户自己**的 token 生成播放地址（mkv/HEVC 走 HLS 分片） */
function urlFor(s: PlaybackSessionView) {
  return s.remuxRequired
    ? buildHlsPlaylistUrl(s.id)
    : buildPlaybackStreamUrl(s.id, { hls: s.playMode === 'hls' })
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function refresh() {
  const id = pollSessionId || activeSessionId.value
  if (!id) return
  try {
    const s = await getPlaybackSession(id)
    if (activeSessionId.value && activeSessionId.value !== id) return
    session.value = s
    if (!playUrl.value && s.fileName && s.status !== 'failed') {
      waitingMeta.value = false
      playUrl.value = urlFor(s)
    }
    if (s.status === 'failed' || s.status === 'ready') stopPoll()
  } catch {
    /* 拦截器已提示 */
  }
}

function startPoll(id?: string) {
  stopPoll()
  if (id) pollSessionId = id
  pollTimer = setInterval(refresh, 2500)
}

/** 会话切换（房主换源 / 成员进房 / 成员收到 set_source）→ 重新加载 */
watch(
  () => activeSessionId.value,
  async (id) => {
    if (id && session.value?.id === id && playUrl.value) return
    stopPoll()
    pollSessionId = id || ''
    session.value = null
    playUrl.value = null
    waitingMeta.value = !!id && isHost.value
    if (!id) return
    await refresh()
    const current = session.value as PlaybackSessionView | null
    if (!current || (current.status !== 'ready' && current.status !== 'failed')) {
      startPoll(id)
    }
  },
  { immediate: true },
)

// ── 房主控制 → 广播 ──────────────────────────────────────────
let lastHeartbeat = 0
const HEARTBEAT_INTERVAL = 8000

function onTimeUpdate(currentTime: number) {
  if (!isHost.value) return
  const now = Date.now()
  if (now - lastHeartbeat < HEARTBEAT_INTERVAL) return
  lastHeartbeat = now
  vodStore.sendControl('heartbeat', { position: currentTime })
}

function onPlay(currentTime: number) {
  if (isHost.value) vodStore.sendControl('play', { position: currentTime })
}

function onPause(currentTime: number) {
  if (isHost.value) vodStore.sendControl('pause', { position: currentTime })
}

function onSeek(currentTime: number) {
  if (isHost.value) vodStore.sendControl('seek', { position: currentTime })
}

// ── 成员跟随 ────────────────────────────────────────────────
function applyPlaybackState() {
  const ps = playbackState.value
  const p = playerRef.value
  if (!ps || !p || isHost.value) return
  const art = p.getPlayer()
  if (!art) return
  const target =
    !ps.paused && ps.server_time ? ps.position + (Date.now() - ps.server_time) / 1000 : ps.position
  if (Math.abs(art.currentTime - target) > 1.5) p.seekTo(target)
  p.setPaused(ps.paused)
}

watch(playbackState, () => {
  if (isHost.value) return
  applyPlaybackState()
})

// 会话确定后拉一次字幕轨（失败静默：没有字幕不影响播放）
watch(
  () => session.value?.id,
  async (id) => {
    subtitles.value = []
    if (!id) return
    try {
      const tracks = await getSessionSubtitles(id)
      subtitles.value = (tracks || []).map((t) => ({
        index: t.index,
        label: t.label,
        url: buildSubtitleUrl(id, t.index),
      }))
    } catch {
      /* 静默 */
    }
  },
)

// 播放器创建/换源后，等它 ready 再对齐一次（AnimePlayer 的 controlled 模式不会自动播）
watch(playUrl, () => {
  if (isHost.value) return
  window.setTimeout(applyPlaybackState, 1200)
})

// ── 房主选源 ────────────────────────────────────────────────
function isStreamUri(uri: string) {
  return (
    /^https?:\/\//i.test(uri) &&
    !/\.torrent(\?|$)/i.test(uri) &&
    (/\.(mp4|m3u8|mkv|webm|m4v|flv)(\?|$)/i.test(uri) || /m3u8/i.test(uri))
  )
}

async function beginSession(kind: 'bt' | 'stream', uri: string, titleText?: string) {
  if (creating.value) return
  creating.value = true
  candidates.value = []
  try {
    // 必须带 groupId：成员拉流时后端靠 group_user_map 鉴权，会话不带房间就 404
    const groupId = vodStore.group?.group_id
    const s =
      kind === 'stream'
        ? await createStreamPlaybackSession({ streamUrl: uri, title: titleText, groupId })
        : await createPlaybackSession({ uri, groupId })
    // 只广播 session_id：成员用自己的 token 拉流
    vodStore.sendControl('set_source', {
      session_id: s.id,
      stream_url: '',
      title: titleText || s.fileName || '',
    })
    session.value = null
    playUrl.value = null
    waitingMeta.value = true
    await refreshById(s.id)
  } catch (e: any) {
    waitingMeta.value = false
    ElNotification({
      type: 'error',
      title: '创建播放失败',
      message: e?.message || '请稍后重试',
    })
  } finally {
    creating.value = false
  }
}

/** 房主本地加载（广播回到自己身上有延迟，这里先兜底一次） */
async function refreshById(id: string) {
  try {
    const s = await getPlaybackSession(id)
    if (activeSessionId.value && activeSessionId.value !== id) return
    session.value = s
    if (s.fileName && s.status !== 'failed') {
      waitingMeta.value = false
      playUrl.value = urlFor(s)
    }
    startPoll(id)
  } catch {
    /* 广播回来后会再加载 */
  }
}

function playManual() {
  const uri = manualUri.value.trim()
  if (!uri) return
  void beginSession(isStreamUri(uri) ? 'stream' : 'bt', uri)
}

function playCandidate(c: PlayCandidate) {
  void beginSession(c.kind === 'stream' ? 'stream' : 'bt', c.uri, c.title)
}

async function search() {
  const kw = keyword.value.trim()
  if (!kw) {
    ElNotification({ type: 'warning', title: '请输入要搜索的番剧名或关键词' })
    return
  }
  const token = ++searchToken
  searching.value = true
  try {
    const hits = await searchPlaybackSources(kw, Number(episodeSort.value) || 1)
    if (token !== searchToken) return
    candidates.value = hits || []
    if (!candidates.value.length) {
      ElNotification({
        type: 'info',
        title: '没有搜到资源',
        message: '确认「个人中心 → 数据源」里有启用的站点，或换个关键词',
      })
    }
  } catch (e: any) {
    if (token !== searchToken) return
    ElNotification({
      type: 'error',
      title: '搜源失败',
      message: e?.message || '请稍后重试',
    })
  } finally {
    if (token === searchToken) searching.value = false
  }
}

onBeforeUnmount(() => {
  searchToken++
  stopPoll()
})
</script>

<style scoped lang="less">
@accent: var(--primary-color);

.vod-player {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__bar,
  &__search {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  &__uri {
    flex: 1;
    min-width: 220px;
  }

  &__keyword {
    flex: 1;
    min-width: 180px;
    max-width: 320px;
  }

  &__ep {
    width: 84px;
  }

  &__hint {
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__follow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    color: @accent;
    background: rgba(104, 198, 189, 0.08);
    border: 1px solid rgba(104, 198, 189, 0.25);
  }

  &__follow-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: @accent;
    box-shadow: 0 0 8px rgba(104, 198, 189, 0.7);
  }

  &__hits {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--aside-bg-color);
    border: 1px solid rgba(104, 198, 189, 0.12);
    max-height: 220px;
    overflow-y: auto;
  }

  &__hits-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__stage {
    border-radius: 12px;
    overflow: hidden;
  }

  &__placeholder {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 62vh;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 24px;
    box-sizing: border-box;
    border-radius: 12px;
    background: var(--aside-bg-color);
    border: 1px dashed rgba(104, 198, 189, 0.3);
    color: var(--font-unactive-color);
    font-size: 13px;
  }

  &__status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    font-size: 13px;

    .tag {
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(104, 198, 189, 0.15);
      color: @accent;
    }
    .mode {
      font-size: 12px;
      color: @accent;
      border: 1px solid rgba(104, 198, 189, 0.4);
      border-radius: 6px;
      padding: 1px 6px;
    }
    .meta {
      color: var(--font-unactive-color);
    }
    .file {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--font-color);
    }
    .err {
      color: var(--warning-color);
    }
  }

  &__progress {
    :deep(.el-progress-bar__outer) {
      background: rgba(104, 198, 189, 0.12);
    }
  }
}

.hit {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 8px;
  align-items: center;
  text-align: left;
  border: 1px solid rgba(104, 198, 189, 0.25);
  border-radius: 8px;
  padding: 7px 9px;
  background: rgba(104, 198, 189, 0.06);
  color: var(--font-color);
  cursor: pointer;
  font-size: 12px;

  &:hover:not(:disabled) {
    border-color: @accent;
    background: rgba(104, 198, 189, 0.14);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &__kind {
    font-weight: 700;
    color: @accent;
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__src {
    color: var(--font-unactive-color);
    font-size: 11px;
  }
}

@media (max-width: 768px) {
  .vod-player {
    &__keyword,
    &__uri {
      min-width: 100%;
      max-width: none;
    }
  }
}
</style>
