<template>
  <div class="playback-panel">
    <div class="playback-panel__row">
      <el-input
        v-model="magnet"
        clearable
        class="playback-panel__input"
        placeholder="粘贴 magnet: 或种子链接（也可点击下方剧集自动搜源）"
        :disabled="loading"
        @keyup.enter="startManual"
      />
      <button class="playback-panel__btn" type="button" :disabled="loading" @click="startManual">
        {{ loading ? '处理中…' : '播放' }}
      </button>
    </div>

    <div v-if="session" class="playback-panel__status">
      <span class="tag">{{ statusLabel }}</span>
      <span class="meta">{{ progressText }}</span>
      <span v-if="session.fileName" class="file" :title="session.fileName">{{
        session.fileName
      }}</span>
      <span v-if="session.errorMessage" class="err">{{ session.errorMessage }}</span>
    </div>

    <AnimePlayer v-if="playUrl" :url="playUrl" :title="title" />
  </div>
</template>

<script setup lang="ts">
import {
  buildPlaybackStreamUrl,
  createAutoPlaybackSession,
  createPlaybackSession,
  getPlaybackSession,
  type PlaybackSessionView,
} from '@/api/playback'
import AnimePlayer from './AnimePlayer.vue'

const props = defineProps<{
  bangumiId: number
  title?: string
  /** 日文原名等，用于备用搜索 */
  altTitle?: string
}>()

const magnet = ref('')
const episodeSort = ref<number | undefined>(undefined)
const loading = ref(false)
const session = ref<PlaybackSessionView | null>(null)
const sessionId = ref('')
const playUrl = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusLabel = computed(() => {
  const m: Record<string, string> = {
    created: '已创建',
    fetching: '获取种子中',
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
  const pct = Math.round((s.progress || 0) * 100)
  const dl = formatBytes(s.downloadedBytes)
  const total = formatBytes(s.sizeBytes)
  return `${pct}% · ${dl}${total ? ' / ' + total : ''}`
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

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function maybeSetPlayUrl(s: PlaybackSessionView) {
  if (s.status === 'playable' || s.status === 'ready') {
    playUrl.value = buildPlaybackStreamUrl(s.id)
  }
}

async function refresh() {
  if (!sessionId.value) return
  try {
    const s = await getPlaybackSession(sessionId.value)
    session.value = s
    maybeSetPlayUrl(s)
    if (s.status === 'ready' || s.status === 'failed') stopPoll()
  } catch {
    /* interceptor */
  }
}

function beginSession(s: PlaybackSessionView) {
  session.value = s
  sessionId.value = s.id
  playUrl.value = null
  maybeSetPlayUrl(s)
  stopPoll()
  pollTimer = setInterval(refresh, 3000)
}

/** 详情页点击集数：自动搜磁力播放 */
async function playEpisode(sort: number) {
  episodeSort.value = sort
  const keyword = (props.title || '').trim()
  if (!keyword) {
    ElNotification({ type: 'warning', title: '缺少番剧名称，无法自动搜源' })
    return
  }
  loading.value = true
  playUrl.value = null
  stopPoll()
  try {
    const s = await createAutoPlaybackSession({
      keyword,
      episodeSort: sort,
      bangumiId: props.bangumiId,
      altKeyword: props.altTitle,
    })
    beginSession(s)
    ElNotification({ type: 'success', title: `第 ${sort} 话：已找到资源并开始下载` })
  } catch {
    ElNotification({
      type: 'warning',
      title: '自动搜源失败',
      message: '可在上方手动粘贴磁力后点击播放',
    })
  } finally {
    loading.value = false
  }
}

async function startManual() {
  const uri = magnet.value.trim()
  if (!uri) {
    ElNotification({ type: 'warning', title: '请填写磁力或种子链接' })
    return
  }
  loading.value = true
  playUrl.value = null
  stopPoll()
  try {
    const s = await createPlaybackSession({
      uri,
      bangumiId: props.bangumiId,
      episodeSort: episodeSort.value,
    })
    beginSession(s)
    ElNotification({ type: 'success', title: '已创建播放任务' })
  } catch {
    /* interceptor */
  } finally {
    loading.value = false
  }
}

defineExpose({ playEpisode })

onBeforeUnmount(() => stopPoll())
</script>

<style scoped lang="less">
@accent: var(--primary-color);

.playback-panel {
  margin-top: 8px;

  &__row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  &__input {
    flex: 1;
    min-width: 0;
  }

  /* 与详情页「加入聊天室」.action-btn--primary 一致 */
  &__btn {
    flex-shrink: 0;
    border: none;
    border-radius: 10px;
    padding: 10px 28px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    background: @accent;
    color: #fff;
    transition: box-shadow 0.2s, opacity 0.2s, filter 0.2s;

    /* 与输入框同行：不要 translateY，避免错位 */
    &:hover:not(:disabled) {
      box-shadow: 0 0 12px rgba(104, 198, 189, 0.45);
      filter: brightness(1.05);
    }

    &:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
  }

  &__status {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    align-items: center;
    margin-top: 12px;
    font-size: 13px;

    .tag {
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(104, 198, 189, 0.15);
      color: var(--primary-color);
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
}

:deep(.playback-panel__input .el-input__wrapper) {
  min-height: 42px;
  border-radius: 10px;
}
</style>
