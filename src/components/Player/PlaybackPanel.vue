<template>
  <div class="playback-panel">
    <div class="playback-panel__row">
      <el-input
        v-model="source"
        clearable
        class="playback-panel__input"
        placeholder="magnet: 或直链 m3u8 / mp4"
        :disabled="playing"
        @keyup.enter="startManual"
      />
      <button class="playback-panel__btn" type="button" :disabled="playing" @click="startManual">
        {{ playing ? '处理中…' : '播放' }}
      </button>
    </div>

    <div v-if="session" class="playback-panel__status">
      <span class="tag">{{ statusLabel }}</span>
      <span v-if="session.playMode" class="mode">{{
        session.playMode === 'stream' ? '流媒体' : 'BT'
      }}</span>
      <span class="meta">{{ progressText }}</span>
      <span v-if="session.fileName" class="file" :title="session.fileName">{{
        session.fileName
      }}</span>
      <span v-if="session.errorMessage" class="err">{{ session.errorMessage }}</span>
    </div>

    <AnimePlayer v-if="playUrl" :url="playUrl" :title="title" />

    <!-- 点集搜源抽屉：有结果即可点，不必等全部搜完 -->
    <el-drawer
      v-model="drawerVisible"
      direction="rtl"
      size="420px"
      :title="drawerTitle"
      class="search-drawer"
      destroy-on-close
      @closed="onDrawerClosed"
    >
      <div class="search-drawer__body">
        <div v-if="searching" class="search-drawer__hint">搜索中，播放会暂停搜索</div>
        <div v-if="!searchRows.length && !searching" class="search-drawer__empty">
          <el-empty description="暂无可用站点" />
        </div>
        <div
          v-for="row in searchRows"
          :key="row.key"
          class="search-row"
          :class="`search-row--${row.status}`"
        >
          <el-avatar :size="36" :src="row.iconUrl || undefined" class="search-row__avatar">
            {{ (row.name || '?').slice(0, 1) }}
          </el-avatar>
          <div class="search-row__main">
            <div class="search-row__head">
              <span class="search-row__kind">{{ row.factoryId === 'rss' ? 'BT' : '流' }}</span>
              <span class="search-row__name" :title="row.name">{{ row.name }}</span>
              <span class="search-row__st">{{ statusText(row.status) }}</span>
            </div>
            <div v-if="row.error" class="search-row__err">{{ row.error }}</div>
            <div v-if="row.candidates.length" class="search-row__hits">
              <button
                v-for="(c, i) in row.candidates.slice(0, 8)"
                :key="i + c.uri"
                type="button"
                class="hit"
                :disabled="playing"
                :title="c.uri"
                @click="playCandidate(c)"
              >
                <span class="hit__kind">{{
                  c.kind === 'bt' ? 'BT' : c.resolved ? '直链' : '线路'
                }}</span>
                <span class="hit__title">{{ c.title || c.channel || c.uri }}</span>
                <span class="hit__play">{{ playing ? '…' : '播放' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import {
  buildPlaybackStreamUrl,
  createPlaybackSession,
  createStreamPlaybackSession,
  getPlaybackSession,
  searchOneSource,
  type PlayCandidate,
  type PlaybackSessionView,
} from '@/api/playback'
import { listMediaSourceCatalog, type MediaCatalogEntry } from '@/api/media-source'
import {
  applyCatalogPrefs,
  isCatalogEnabled,
  loadCatalogCache,
  loadCatalogPrefs,
  saveCatalogCache,
} from '@/utils/media-catalog-cache'
import AnimePlayer from './AnimePlayer.vue'

const props = defineProps<{
  bangumiId: number
  title?: string
  altTitle?: string
}>()

type RowStatus = 'pending' | 'searching' | 'done' | 'empty' | 'error'

type SearchRow = {
  key: string
  name: string
  factoryId: string
  iconUrl: string
  status: RowStatus
  error?: string
  candidates: PlayCandidate[]
  searchConfig: Record<string, any>
  subscriptionName: string
}

const source = ref('')
const episodeSort = ref<number | undefined>(undefined)
/** 正在创建播放会话（点了某个候选） */
const playing = ref(false)
/** 后台仍在搜其它源 */
const searching = ref(false)
const session = ref<PlaybackSessionView | null>(null)
const sessionId = ref('')
const playUrl = ref<string | null>(null)
const drawerVisible = ref(false)
const searchRows = ref<SearchRow[]>([])
const searchingEpisode = ref(0)
let pollTimer: ReturnType<typeof setInterval> | null = null
let searchToken = 0

const drawerTitle = computed(() => {
  const ep = searchingEpisode.value
  const name = props.title || ''
  const base = ep ? `${name} · 第 ${ep} 话` : '搜源'
  return searching.value ? `${base}（搜索中）` : base
})

const statusLabel = computed(() => {
  const m: Record<string, string> = {
    created: '已创建',
    fetching: '获取中',
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
  if (s.playMode === 'stream') return '直链'
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

function statusText(st: RowStatus) {
  const m: Record<RowStatus, string> = {
    pending: '等待',
    searching: '搜索中',
    done: '有结果',
    empty: '无结果',
    error: '失败',
  }
  return m[st]
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
  if (s.status !== 'ready' && s.status !== 'failed') {
    pollTimer = setInterval(refresh, 3000)
  }
}

async function ensureCatalogEntries(): Promise<MediaCatalogEntry[]> {
  const prefs = loadCatalogPrefs()
  let entries = loadCatalogCache()
  if (!entries?.length) {
    const res = await listMediaSourceCatalog()
    entries = res?.entries || []
    if (entries.length) saveCatalogCache(entries)
  }
  const merged = applyCatalogPrefs(entries || [], prefs)
  return merged.filter((e) => isCatalogEnabled(e.key, prefs))
}

async function playCandidate(c: PlayCandidate) {
  if (playing.value) return
  playing.value = true
  // 选中后停止继续搜源，避免占带宽
  searchToken++
  searching.value = false
  playUrl.value = null
  stopPoll()
  try {
    if (c.kind === 'stream') {
      const s = await createStreamPlaybackSession({
        streamUrl: c.uri,
        title: c.title,
        headers: c.headers,
        bangumiId: props.bangumiId,
        episodeSort: episodeSort.value,
      })
      beginSession(s)
    } else {
      const s = await createPlaybackSession({
        uri: c.uri,
        bangumiId: props.bangumiId,
        episodeSort: episodeSort.value,
      })
      beginSession(s)
    }
    drawerVisible.value = false
  } catch {
    /* interceptor */
  } finally {
    playing.value = false
  }
}

/** 点集：打开抽屉，并行搜各启用站点；任一源有结果即可点播放 */
async function playEpisode(sort: number) {
  episodeSort.value = sort
  searchingEpisode.value = sort
  const keyword = (props.title || '').trim()
  if (!keyword) return

  const token = ++searchToken
  drawerVisible.value = true
  searchRows.value = []
  searching.value = true
  playing.value = false

  try {
    const entries = await ensureCatalogEntries()
    if (token !== searchToken) return

    searchRows.value = entries.map((e) => ({
      key: e.key,
      name: e.name,
      factoryId: e.factoryId,
      iconUrl: e.iconUrl,
      status: 'pending' as RowStatus,
      candidates: [],
      searchConfig: e.searchConfig || {},
      subscriptionName: e.subscriptionName,
    }))

    // 并发搜源；每个源完成后立刻写入 candidates，UI 可马上点
    const concurrency = 4
    let idx = 0
    const runNext = async (): Promise<void> => {
      if (token !== searchToken) return
      const i = idx++
      if (i >= searchRows.value.length) return
      const row = searchRows.value[i]
      // 用 splice 触发列表更新更稳
      patchRow(i, { status: 'searching' })
      try {
        const hits =
          (await searchOneSource({
            factoryId: row.factoryId,
            name: row.name,
            searchConfig: row.searchConfig,
            keyword,
            episodeSort: sort,
            altKeyword: props.altTitle,
            subscriptionName: row.subscriptionName,
          })) || []
        if (token !== searchToken) return
        patchRow(i, {
          candidates: hits,
          status: hits.length ? 'done' : 'empty',
          error: undefined,
        })
      } catch (e: any) {
        if (token !== searchToken) return
        patchRow(i, {
          status: 'error',
          error: e?.message || '搜索失败',
        })
      }
      await runNext()
    }

    // 不 await 到全部结束再解锁：有结果即可点；后台继续搜
    void Promise.all(Array.from({ length: concurrency }, () => runNext())).finally(() => {
      if (token === searchToken) searching.value = false
    })
  } catch {
    if (token === searchToken) searching.value = false
  }
}

function patchRow(index: number, patch: Partial<SearchRow>) {
  const cur = searchRows.value[index]
  if (!cur) return
  const next = { ...cur, ...patch }
  searchRows.value.splice(index, 1, next)
}

function onDrawerClosed() {
  searchToken++
  searching.value = false
}

async function startManual() {
  const uri = source.value.trim()
  if (!uri) return
  playing.value = true
  playUrl.value = null
  stopPoll()
  try {
    const isStream =
      /^https?:\/\//i.test(uri) &&
      !/\.torrent(\?|$)/i.test(uri) &&
      (/\.(mp4|m3u8|mkv|webm|m4v|flv)(\?|$)/i.test(uri) || /m3u8/i.test(uri))
    const s = isStream
      ? await createStreamPlaybackSession({
          streamUrl: uri,
          bangumiId: props.bangumiId,
          episodeSort: episodeSort.value,
        })
      : await createPlaybackSession({
          uri,
          bangumiId: props.bangumiId,
          episodeSort: episodeSort.value,
        })
    beginSession(s)
  } catch {
    /* interceptor */
  } finally {
    playing.value = false
  }
}

defineExpose({ playEpisode })

onBeforeUnmount(() => {
  searchToken++
  searching.value = false
  stopPoll()
})
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
    .mode {
      color: var(--primary-color);
      font-size: 12px;
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

.search-drawer {
  &__body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 24px;
  }

  &__hint {
    font-size: 12px;
    color: var(--primary-color);
    padding: 0 2px 4px;
  }

  &__empty {
    padding: 24px 0;
  }
}

.search-row {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.12);

  &--searching {
    border-color: rgba(104, 198, 189, 0.4);
  }
  &--done {
    border-color: rgba(104, 198, 189, 0.55);
  }
  &--error {
    border-color: rgba(245, 108, 108, 0.4);
  }

  &__avatar {
    flex-shrink: 0;
    background: #1e1d2b;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__kind {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
    border: 1px solid rgba(104, 198, 189, 0.4);
    border-radius: 6px;
    padding: 1px 6px;
  }

  &__name {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__st {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__err {
    margin-top: 4px;
    font-size: 12px;
    color: var(--warning-color);
  }

  &__hits {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
}

.hit {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 8px;
  align-items: center;
  text-align: left;
  border: 1px solid rgba(104, 198, 189, 0.25);
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(104, 198, 189, 0.06);
  color: var(--font-color);
  cursor: pointer;
  font-size: 12px;

  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    background: rgba(104, 198, 189, 0.14);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &__kind {
    font-weight: 700;
    color: var(--primary-color);
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__play {
    color: var(--primary-color);
    font-weight: 600;
  }
}
</style>
