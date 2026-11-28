<template>
  <div class="player-pane">
    <AnimePlayer
      v-if="playUrl"
      ref="playerRef"
      :url="playUrl"
      :title="playbackTitle"
      :controlled="!isHost"
      :paused="playbackState?.paused"
      :danmaku="danmakuItems"
      :subtitles="subtitles"
      auto-retry
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @seek="onSeek"
      @error="onPlayerError"
    />
    <div v-else class="player-pane__placeholder">{{ placeholderText }}</div>

    <div class="player-pane__info">
      <div class="player-pane__meta">
        <span v-if="animeTitle" class="player-pane__title">{{ animeTitle }}</span>
        <span v-if="currentEpisodeSort" class="player-pane__ep"
          >第 {{ currentEpisodeSort }} 话</span
        >
      </div>
      <div class="player-pane__actions">
        <el-dropdown
          v-if="bangumiId"
          trigger="click"
          popper-class="room-collect-dropdown"
          @command="onCollectCommand"
        >
          <button
            type="button"
            class="player-pane__source-btn"
            :class="{ 'is-active': !!userAnimeStore.current }"
            :disabled="collectSaving"
          >
            {{ collectBtnText }} ▾
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="wish">想看</el-dropdown-item>
              <el-dropdown-item command="watching">在看</el-dropdown-item>
              <el-dropdown-item command="done">看完</el-dropdown-item>
              <el-dropdown-item v-if="userAnimeStore.current" divided command="cancel">
                取消追番
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button
          class="player-pane__source-btn"
          :disabled="!danmakuItems.length"
          @click="danmakuOpen = true"
        >
          弹幕{{ danmakuItems.length ? ` ${danmakuItems.length}` : '' }}
        </button>
        <button v-if="isHost" class="player-pane__source-btn" @click="openSearchDrawer">
          选源开播
        </button>
        <div class="player-pane__host">
          <span class="player-pane__host-label">身份</span>
          <span class="player-pane__host-badge">{{ isHost ? '房主' : '观众' }}</span>
        </div>
      </div>
    </div>

    <!-- 右侧已有播放列表：左侧不再重复选集，改为本集信息 + 清晰度 + 选源状态 -->
    <div class="player-pane__status">
      <div class="player-pane__ep-line">
        <span class="player-pane__ep-name" :title="currentEpisodeName">
          {{ currentEpisodeName || '未选择集数' }}
        </span>
        <span v-if="currentQuality" class="player-pane__quality">{{ currentQuality }}</span>
      </div>
      <div v-if="session" class="player-pane__status-line">
        <span class="player-pane__tag">{{ statusLabel }}</span>
        <span v-if="session.remuxRequired" class="player-pane__tag">转封装</span>
        <span v-if="!isStreamSession" class="player-pane__meta-text">{{ progressText }}</span>
        <span v-if="session.fileName" class="player-pane__file" :title="session.fileName">
          {{ session.fileName }}
        </span>
        <span v-if="session.errorMessage" class="player-pane__err">
          {{ session.errorMessage }}
        </span>
      </div>
      <el-progress
        v-if="session && !isStreamSession && progressPercent < 100"
        class="player-pane__progress"
        :percentage="progressPercent"
        :stroke-width="6"
        :show-text="false"
      />
      <div v-if="sourceStatusText" class="player-pane__status-line">
        <span class="player-pane__status-text">{{ sourceStatusText }}</span>
      </div>
    </div>

    <!-- 房主搜源抽屉 -->
    <SourceDrawer
      v-model="sourceDrawerVisible"
      :rows="searchRows"
      :searching="sourceSearching"
      :creating="sourceCreating"
      :current-source-key="currentSourceKey"
      :title="drawerTitle"
      @select="onSelectCandidate"
      @closed="onDrawerClosed"
    />

    <DanmakuList v-model="danmakuOpen" :items="danmakuItems" />
  </div>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import { useHomeStore } from '@/stores/modules/home'
import { useUserAnimeStore } from '@/stores/modules/userAnime'
import type { UserAnimeStatus } from '@/api/types'
import { track } from '@/utils/track'
import {
  buildHlsPlaylistUrl,
  buildPlaybackStreamUrl,
  buildSubtitleUrl,
  getPlaybackSession,
  getSessionSubtitles,
  type PlayCandidate,
  type PlaybackSessionView,
} from '@/api/playback'
import { extractQuality } from '@/utils/source-quality'
import { addPlayHistory } from '@/utils/play-history'
import AnimePlayer from '@/components/Player/AnimePlayer.vue'
import SourceDrawer from '@/components/Room/SourceDrawer.vue'
import { useSourceSearch } from '@/composables/useSourceSearch'
import { fetchDanmaku } from '@/api/danmaku'
import type { Danmu } from 'artplayer-plugin-danmuku'
import DanmakuList from '@/components/Player/DanmakuList.vue'

const roomStore = useRoomStore()
const homeStore = useHomeStore()
const userAnimeStore = useUserAnimeStore()
const collectSaving = ref(false)

const collectBtnText = computed(() => {
  const cur = userAnimeStore.current
  return cur ? userAnimeStore.labelOf(cur.status) : '追番'
})

async function onCollectCommand(cmd: string) {
  const aid = bangumiId.value
  if (!aid || collectSaving.value) return
  collectSaving.value = true
  try {
    if (cmd === 'cancel') {
      await userAnimeStore.cancel(aid)
      track('room.collect.change', { id: aid, status: 'cancel' })
      ElNotification({ type: 'success', title: '已取消追番' })
      return
    }
    const status = cmd as UserAnimeStatus
    const d = homeStore.animeDetail
    await userAnimeStore.setStatus({
      bangumi_id: aid,
      status,
      title: d?.name,
      name_cn: d?.name_cn,
      cover: d?.images?.large || d?.images?.common,
      total_episodes: d?.eps || episodeList.value.length || 0,
      watched_episode: currentEpisodeSort.value || 0,
    })
    track('room.collect.change', { id: aid, status })
    ElNotification({ type: 'success', title: `已标记为${userAnimeStore.labelOf(status)}` })
  } finally {
    collectSaving.value = false
  }
}

const playerRef = ref<InstanceType<typeof AnimePlayer> | null>(null)

const sourceSearch = useSourceSearch({
  clearPlayerHint: () => playerRef.value?.clearHint(),
})

const {
  sourceDrawerVisible,
  sourceSearching,
  sourceCreating,
  searchRows,
  currentSourceKey,
  drawerTitle,
  sourceStatusText,
  openSearchDrawer,
  onPlayerError,
} = sourceSearch

/** 当前集的弹幕（房主与观众都显示） */
const danmakuItems = ref<Danmu[]>([])
/** 弹幕列表抽屉 */
const danmakuOpen = ref(false)
/** 防止快速切集时旧响应覆盖新集 */
let danmakuToken = 0

const isHost = computed(() => roomStore.role === 'host')
const playbackState = computed(() => roomStore.playbackState)
/** 内嵌字幕轨（与点播室同一套接口，按会话 id 取） */
const subtitles = ref<Array<{ index: number; label: string; url: string }>>([])
const currentEpisodeSort = computed(() => playbackState.value?.episode_sort ?? null)
const episodeList = computed(() => homeStore.episodes)
const bangumiId = computed(() => homeStore.animeDetail?.id ?? 0)

const animeTitle = computed(() => {
  return homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || ''
})

/**
 * 弹幕跟随**房间的播放集**，而不是「谁点了切集」。
 *
 * 监听 `playbackState.episode_sort`：房主切集时 socket 会广播给所有观众，
 * 所以每个人的画面换集时弹幕也跟着换 —— 这正是「一起看」该有的行为。
 * 拉取失败静默：没有弹幕不影响看番。
 */
watch(
  () => currentEpisodeSort.value,
  async (sort) => {
    const token = ++danmakuToken
    danmakuItems.value = []
    const title = animeTitle.value.trim()
    if (!title || !sort || sort <= 0) return
    try {
      const items = await fetchDanmaku(title, sort)
      if (token === danmakuToken) danmakuItems.value = items
    } catch {
      /* 静默 */
    }
  },
  { immediate: true },
)

// 房间播放会话变化时刷新字幕轨（观众也用自己的 token 请求，成员鉴权允许）
watch(
  () => playbackState.value?.session_id,
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
      /* 静默：没有字幕不影响播放 */
    }
  },
  { immediate: true },
)

const playbackTitle = computed(() => {
  return playbackState.value?.title || animeTitle.value || ''
})

const currentEpisodeName = computed(() => {
  const sort = currentEpisodeSort.value
  if (sort == null) return ''
  const ep = episodeList.value.find((e) => e.sort === sort)
  const name = ep?.name_cn || ep?.name
  return name ? `第 ${sort} 话 · ${name}` : `第 ${sort} 话`
})

/** 当前播放源清晰度：优先自动/手动选定时记录的 label，回落 playback title */
const currentQuality = computed(() => {
  return extractQuality(sourceSearch.currentSourceLabel.value, playbackState.value?.title || '')
})

/**
 * 播放会话轮询（与点播室同一套磁力播放体验）：
 * - mkv/HEVC 用 HLS 分片，播放器能拿到真实总时长；
 * - 轮询 `progress / downloadedBytes / sizeBytes` 显示下载进度；
 * - 只有出现 fileName 才挂播放器，避免 metadata 还没解析时黑屏。
 */
const session = ref<PlaybackSessionView | null>(null)
const playUrl = ref<string | null>(null)
const waitingMeta = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let pollSessionId = ''

const activeSessionId = computed(() => playbackState.value?.session_id || '')
const isStreamSession = computed(() => session.value?.playMode !== 'progressive')
const progressPercent = computed(() =>
  Math.min(100, Math.round((session.value?.progress ?? 0) * 100)),
)

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    created: '已创建',
    fetching: '获取种子信息',
    downloading: '下载中',
    playable: '可播放',
    ready: '已完成',
    failed: '失败',
  }
  return map[session.value?.status || ''] || session.value?.status || '-'
})

const progressText = computed(() => {
  const s = session.value
  if (!s) return ''
  const dl = formatBytes(s.downloadedBytes)
  const total = formatBytes(s.sizeBytes)
  return `${progressPercent.value}% · ${dl}${total ? ' / ' + total : ''}`
})

const placeholderText = computed(() => {
  if (session.value?.errorMessage) return session.value.errorMessage
  if (waitingMeta.value) return '正在获取种子信息…'
  if (!activeSessionId.value) return isHost.value ? '选源后开始播放' : '等待房主选源…'
  return isHost.value ? '正在准备播放…' : '等待房主开播…'
})

function formatBytes(n: number) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`
}

/** mkv/HEVC 走 HLS 分片（真实时长 + 可拖动）；其它走原生 Range 流 */
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

async function refreshSession(): Promise<string | null> {
  const id = pollSessionId || activeSessionId.value
  if (!id) return null
  try {
    const s = await getPlaybackSession(id)
    if (activeSessionId.value && activeSessionId.value !== id) return null
    session.value = s
    if (s.fileName && s.status !== 'failed') {
      waitingMeta.value = false
      const url = urlFor(s)
      if (playUrl.value !== url) playUrl.value = url
    }
    if (s.status === 'failed' || s.status === 'ready') stopPoll()
    return s.status
  } catch {
    // 会话接口偶发失败时回退到房主广播的地址，至少别黑屏
    if (!playUrl.value && playbackState.value?.stream_url) {
      playUrl.value = playbackState.value.stream_url
    }
    return null
  }
}

function startPoll(id?: string) {
  stopPoll()
  if (id) pollSessionId = id
  pollTimer = setInterval(refreshSession, 2500)
}

watch(
  activeSessionId,
  async (id) => {
    if (id && session.value?.id === id && playUrl.value) return
    stopPoll()
    pollSessionId = id || ''
    session.value = null
    playUrl.value = null
    waitingMeta.value = !!id
    if (!id) return
    const status = await refreshSession()
    if (!status || (status !== 'ready' && status !== 'failed')) {
      startPoll(id)
    }
  },
  { immediate: true },
)

// ── 播放器控制与同步 ─────────────────────────────────────────

let lastHeartbeat = 0
const HEARTBEAT_INTERVAL = 8000

function onTimeUpdate(currentTime: number) {
  if (!isHost.value) return
  const now = Date.now()
  if (now - lastHeartbeat < HEARTBEAT_INTERVAL) return
  lastHeartbeat = now
  roomStore.sendControl('heartbeat', { position: currentTime })
}

function onPlay(currentTime: number) {
  if (isHost.value) {
    roomStore.sendControl('play', { position: currentTime })
  }
  // 真正开始播：停止自动换源
  sourceSearch.onPlaybackStarted()
}

function onPause(currentTime: number) {
  if (!isHost.value) return
  roomStore.sendControl('pause', { position: currentTime })
}

function onSeek(currentTime: number) {
  if (!isHost.value) return
  roomStore.sendControl('seek', { position: currentTime })
}

watch(playbackState, (ps) => {
  if (!ps || isHost.value) return
  const p = playerRef.value
  if (!p) return
  const art = p.getPlayer()
  if (!art) return

  // 播放中：补偿自 server_time 起的流逝；暂停：对齐到暂停点
  const target =
    !ps.paused && ps.server_time ? ps.position + (Date.now() - ps.server_time) / 1000 : ps.position

  // 先对齐进度，再应用播放/暂停状态，避免 play() 被随后的 seek 打断
  if (Math.abs(art.currentTime - target) > 1.5) {
    p.seekTo(target)
  }
  p.setPaused(ps.paused)
})

// 开播 / 换源 / 切集时记录最近播放（进房即同步已有源，viewer 也会记录）
watch(
  () => playbackState.value?.stream_url || playbackState.value?.session_id,
  (val) => {
    if (!val || !bangumiId.value) return
    addPlayHistory({
      bangumiId: bangumiId.value,
      title: animeTitle.value || `番剧 #${bangumiId.value}`,
      cover: homeStore.animeDetail?.images?.common || '',
      episodeSort: currentEpisodeSort.value ?? null,
      time: Date.now(),
    })
  },
)

function onSelectCandidate(c: PlayCandidate) {
  void sourceSearch.selectCandidate(c)
}

function onDrawerClosed() {
  // 关闭抽屉不取消后台搜索、不丢缓存
}

onBeforeUnmount(() => {
  stopPoll()
  sourceSearch.teardown()
})
</script>

<style scoped lang="less">
.player-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  &__title {
    font-size: 16px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__ep {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--primary-color);
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.12);
    border: 1px solid rgba(104, 198, 189, 0.25);
  }

  &__actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__source-btn {
    border: 1px solid rgba(104, 198, 189, 0.4);
    border-radius: 8px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: rgba(104, 198, 189, 0.1);
    color: var(--primary-color);
    transition: all 0.2s;

    &:hover {
      background: rgba(104, 198, 189, 0.2);
      border-color: var(--primary-color);
      box-shadow: 0 0 8px rgba(104, 198, 189, 0.25);
    }

    &.is-active {
      background: rgba(104, 198, 189, 0.22);
      border-color: var(--primary-color);
    }
  }

  &__host {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__host-label {
    color: var(--font-unactive-color);
  }

  &__host-badge {
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.1);
    color: var(--primary-color);
    font-weight: 600;
  }

  &__status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--aside-bg-color);
    border: 1px solid rgba(104, 198, 189, 0.12);
  }

  &__ep-line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__ep-name {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--font-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__quality {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
    padding: 1px 8px;
    border-radius: 6px;
    background: rgba(104, 198, 189, 0.12);
    border: 1px solid rgba(104, 198, 189, 0.35);
  }

  &__status-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    font-size: 12px;
  }

  &__status-text {
    color: var(--primary-color);
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16 / 9;
    min-height: 220px;
    border-radius: 10px;
    background: #000;
    color: var(--font-unactive-color);
    font-size: 13px;
  }

  &__tag {
    flex-shrink: 0;
    padding: 1px 8px;
    border-radius: 6px;
    font-size: 11px;
    color: var(--primary-color);
    background: rgba(104, 198, 189, 0.1);
    border: 1px solid rgba(104, 198, 189, 0.28);
  }

  &__meta-text {
    color: var(--font-unactive-color);
  }

  &__file {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--font-unactive-color);
  }

  &__err {
    color: var(--warning-color);
  }

  &__progress {
    margin-top: 2px;

    :deep(.el-progress-bar__outer) {
      background: rgba(104, 198, 189, 0.12);
    }

    :deep(.el-progress-bar__inner) {
      background: var(--primary-color);
    }
  }
}

@media (max-width: 768px) {
  .player-pane {
    gap: 0;

    &__info {
      padding: 6px 10px;
      gap: 8px;
    }

    &__title {
      font-size: 14px;
    }

    &__ep {
      font-size: 11px;
      padding: 1px 6px;
    }

    &__source-btn {
      font-size: 12px;
      padding: 4px 12px;
    }

    &__status {
      padding: 8px 10px;
      border-radius: 0;
      border-left: none;
      border-right: none;
    }

    &__ep-name {
      font-size: 13px;
    }
  }
}
</style>
