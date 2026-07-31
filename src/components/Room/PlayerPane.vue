<template>
  <div class="player-pane">
    <AnimePlayer
      ref="playerRef"
      :url="streamUrl"
      :title="playbackTitle"
      :controlled="!isHost"
      :paused="playbackState?.paused"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @seek="onSeek"
      @error="onPlayerError"
    />

    <div class="player-pane__info">
      <div class="player-pane__meta">
        <span v-if="animeTitle" class="player-pane__title">{{ animeTitle }}</span>
        <span v-if="currentEpisodeSort" class="player-pane__ep"
          >第 {{ currentEpisodeSort }} 话</span
        >
      </div>
      <div class="player-pane__actions">
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
      <div v-if="sourceStatusText" class="player-pane__status-line">
        <span class="player-pane__status-text">{{ sourceStatusText }}</span>
      </div>
    </div>

    <!-- 房主搜源抽屉 -->
    <el-drawer
      v-model="sourceDrawerVisible"
      direction="rtl"
      size="420px"
      :title="drawerTitle"
      class="search-drawer"
      destroy-on-close
      @closed="onDrawerClosed"
    >
      <div class="search-drawer__body">
        <div v-if="sourceSearching" class="search-drawer__hint">
          搜索中，有结果可直接选定（后台继续搜）
        </div>
        <div v-if="!searchRows.length && !sourceSearching" class="search-drawer__empty">
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
                :disabled="sourceCreating"
                :title="c.uri"
                @click="selectCandidate(c)"
              >
                <span class="hit__kind">{{
                  c.kind === 'bt' ? 'BT' : c.resolved ? '直链' : '线路'
                }}</span>
                <span class="hit__title">{{ c.title || c.channel || c.uri }}</span>
                <span v-if="qualityOf(c)" class="hit__quality">{{ qualityOf(c) }}</span>
                <span class="hit__play">{{ sourceCreating ? '…' : '选定' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import { useHomeStore } from '@/stores/modules/home'
import {
  buildPlaybackStreamUrl,
  createPlaybackSession,
  createStreamPlaybackSession,
  searchOneSource,
  type PlayCandidate,
} from '@/api/playback'
import { listMediaSourceCatalog, type MediaCatalogEntry } from '@/api/media-source'
import {
  applyCatalogPrefs,
  isCatalogEnabled,
  loadCatalogCache,
  loadCatalogPrefs,
  saveCatalogCache,
} from '@/utils/media-catalog-cache'
import AnimePlayer from '@/components/Player/AnimePlayer.vue'

const roomStore = useRoomStore()
const homeStore = useHomeStore()

const isHost = computed(() => roomStore.role === 'host')
const playbackState = computed(() => roomStore.playbackState)
const currentEpisodeSort = computed(() => playbackState.value?.episode_sort ?? null)
const episodeList = computed(() => homeStore.episodes)
const bangumiId = computed(() => homeStore.animeDetail?.id ?? 0)

const animeTitle = computed(() => {
  return homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || ''
})

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

/** 从线路/标题文本中解析清晰度标记（源站不提供独立字段） */
function extractQuality(...texts: (string | undefined)[]): string {
  const text = texts.filter(Boolean).join(' ')
  if (!text) return ''
  const m = /(蓝光|4K|2160P?|1080P?|超清|720P?|高清|480P?|标清|原盘|杜比|HDR)/i.exec(text)
  if (!m) return ''
  const raw = m[1].toUpperCase()
  // 数字分辨率统一补 P
  if (/^\d+$/.test(raw)) return `${raw}P`
  if (/^\d+P$/.test(raw)) return raw
  return m[1]
}

function qualityOf(c: PlayCandidate): string {
  return extractQuality(c.channel, c.title, c.uri)
}

/** 当前播放源清晰度：优先自动/手动选定时记录的 label，回落 playback title */
const currentQuality = computed(() => {
  return extractQuality(currentSourceLabel.value, playbackState.value?.title || '')
})

const streamUrl = computed(() => {
  const ps = playbackState.value
  if (!ps) return null
  if (ps.stream_url) return ps.stream_url
  if (ps.session_id) return buildPlaybackStreamUrl(ps.session_id)
  return null
})

const hasActiveSource = computed(() => {
  const ps = playbackState.value
  return !!(ps?.stream_url || ps?.session_id)
})

const playerRef = ref<InstanceType<typeof AnimePlayer> | null>(null)

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
  if (autoMode.value && autoPlayingUri.value) {
    stopAutoMode()
    autoStatus.value = ''
  }
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

const sourceDrawerVisible = ref(false)
const sourceSearching = ref(false)
const sourceCreating = ref(false)
const searchRows = ref<SearchRow[]>([])
const searchingEpisode = ref(0)
let searchToken = 0
const searchCache = new Map<string, { rows: SearchRow[]; searching: boolean; token: number }>()

/** 自动选源：按站点/线路顺序试播，失败换下一个 */
const autoMode = ref(false)
const autoQueue = ref<PlayCandidate[]>([])
const autoTried = new Set<string>()
const autoPlayingUri = ref('')
const autoStatus = ref('')
const currentSourceLabel = ref('')
let autoPlayGen = 0
let playWatchTimer: ReturnType<typeof setTimeout> | null = null
let autoBootstrapped = false

function cacheKey(keyword: string, sort: number) {
  return `${keyword}::${sort}`
}

function candidateKey(c: PlayCandidate) {
  return `${c.kind}::${c.uri}`
}

const drawerTitle = computed(() => {
  const ep = searchingEpisode.value
  const name = animeTitle.value || playbackTitle.value
  const base = ep ? `${name} · 第 ${ep} 话` : '搜源'
  return sourceSearching.value ? `${base}（搜索中）` : base
})

const sourceStatusText = computed(() => {
  if (autoStatus.value) return autoStatus.value
  if (currentSourceLabel.value) return `当前源 · ${currentSourceLabel.value}`
  if (hasActiveSource.value && playbackState.value?.title) {
    return `播放中 · ${playbackState.value.title}`
  }
  if (sourceSearching.value) return '正在搜索可用线路…'
  return ''
})

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

function patchRow(index: number, patch: Partial<SearchRow>) {
  const cur = searchRows.value[index]
  if (!cur) return
  searchRows.value.splice(index, 1, { ...cur, ...patch })
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

function enqueueCandidates(hits: PlayCandidate[], siteName: string) {
  const ordered = [
    ...hits.filter((h) => h.kind === 'stream'),
    ...hits.filter((h) => h.kind !== 'stream'),
  ]
  for (const c of ordered) {
    const key = candidateKey(c)
    if (autoTried.has(key)) continue
    if (autoQueue.value.some((q) => candidateKey(q) === key)) continue
    autoQueue.value.push({
      ...c,
      title: c.title || c.channel || siteName,
      sourceName: c.sourceName || siteName,
    })
  }
  if (autoMode.value) void drainAutoQueue()
}

function clearPlayWatch() {
  if (playWatchTimer) {
    clearTimeout(playWatchTimer)
    playWatchTimer = null
  }
}

function stopAutoMode(reason?: string) {
  autoMode.value = false
  clearPlayWatch()
  if (reason) autoStatus.value = reason
}

async function drainAutoQueue() {
  if (!autoMode.value || !isHost.value) return
  if (sourceCreating.value) return
  if (autoPlayingUri.value) return

  while (autoQueue.value.length) {
    const next = autoQueue.value.shift()!
    const key = candidateKey(next)
    if (autoTried.has(key)) continue
    autoTried.add(key)
    await tryAutoCandidate(next)
    return
  }

  if (!sourceSearching.value && !hasActiveSource.value) {
    stopAutoMode('未找到可播放线路，可手动「选源开播」')
  }
}

async function tryAutoCandidate(c: PlayCandidate) {
  if (!autoMode.value || !isHost.value) return
  const gen = ++autoPlayGen
  const label = c.title || c.channel || c.sourceName || '线路'
  autoStatus.value = `正在尝试 · ${label}`
  autoPlayingUri.value = c.uri
  currentSourceLabel.value = label

  const ok = await selectCandidate(c, { fromAuto: true })
  if (gen !== autoPlayGen) return

  if (!ok) {
    autoPlayingUri.value = ''
    autoStatus.value = `失败 · ${label}，尝试下一路…`
    void drainAutoQueue()
    return
  }

  clearPlayWatch()
  playWatchTimer = setTimeout(() => {
    if (!autoMode.value) return
    if (gen !== autoPlayGen) return
    if (autoPlayingUri.value === c.uri) {
      autoStatus.value = `超时 · ${label}，尝试下一路…`
      autoPlayingUri.value = ''
      void drainAutoQueue()
    }
  }, 18000)
}

function onPlayerError() {
  if (!autoMode.value || !isHost.value) return
  if (!autoPlayingUri.value) return
  const label = currentSourceLabel.value || '当前源'
  autoStatus.value = `播放失败 · ${label}，尝试下一路…`
  autoPlayingUri.value = ''
  clearPlayWatch()
  void drainAutoQueue()
}

function startSearch(sort: number, opts?: { openDrawer?: boolean }) {
  searchingEpisode.value = sort
  const keyword = (homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || '').trim()
  if (!keyword) {
    if (opts?.openDrawer) {
      ElNotification({ type: 'warning', title: '番剧名称未知，无法搜源' })
    }
    return
  }

  if (opts?.openDrawer) {
    sourceDrawerVisible.value = true
    sourceCreating.value = false
  }

  const key = cacheKey(keyword, sort)
  const cached = searchCache.get(key)
  if (cached && (cached.rows.length > 0 || cached.searching)) {
    searchRows.value = cached.rows
    sourceSearching.value = cached.searching
    searchToken = cached.token
    if (autoMode.value) {
      for (const row of cached.rows) {
        if (row.candidates?.length) enqueueCandidates(row.candidates, row.name)
      }
    }
    return
  }

  const token = ++searchToken
  searchRows.value = []
  sourceSearching.value = true
  searchCache.set(key, { rows: searchRows.value, searching: true, token })

  void (async () => {
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
      searchCache.set(key, {
        rows: searchRows.value,
        searching: true,
        token,
      })

      const concurrency = 4
      let idx = 0
      const runNext = async (): Promise<void> => {
        if (token !== searchToken) return
        const i = idx++
        if (i >= searchRows.value.length) return
        const row = searchRows.value[i]
        patchRow(i, { status: 'searching' })
        try {
          const hits =
            (await searchOneSource({
              factoryId: row.factoryId,
              name: row.name,
              searchConfig: row.searchConfig,
              keyword,
              episodeSort: sort,
              altKeyword: homeStore.animeDetail?.name,
              subscriptionName: row.subscriptionName,
            })) || []
          if (token !== searchToken) return
          patchRow(i, {
            candidates: hits,
            status: hits.length ? 'done' : 'empty',
            error: undefined,
          })
          searchCache.set(key, {
            rows: searchRows.value,
            searching: true,
            token,
          })
          if (hits.length && autoMode.value) {
            enqueueCandidates(hits, row.name)
          }
        } catch (e: any) {
          if (token !== searchToken) return
          patchRow(i, { status: 'error', error: e?.message || '搜索失败' })
          searchCache.set(key, {
            rows: searchRows.value,
            searching: true,
            token,
          })
        }
        await runNext()
      }

      void Promise.all(Array.from({ length: concurrency }, () => runNext())).finally(() => {
        if (token === searchToken) {
          sourceSearching.value = false
          searchCache.set(key, {
            rows: searchRows.value,
            searching: false,
            token,
          })
          if (autoMode.value) void drainAutoQueue()
        }
      })
    } catch {
      if (token === searchToken) {
        sourceSearching.value = false
        searchCache.set(key, {
          rows: searchRows.value,
          searching: false,
          token,
        })
        if (autoMode.value) void drainAutoQueue()
      }
    }
  })()
}

function openSearchDrawer() {
  stopAutoMode()
  autoPlayingUri.value = ''
  const sort = currentEpisodeSort.value || 1
  startSearch(sort, { openDrawer: true })
}

function beginAutoSelect() {
  if (!isHost.value) return
  if (hasActiveSource.value) return
  const sort = currentEpisodeSort.value || 1
  autoMode.value = true
  autoQueue.value = []
  autoTried.clear()
  autoPlayingUri.value = ''
  autoStatus.value = '自动选源中…'
  startSearch(sort, { openDrawer: false })
}

async function selectCandidate(c: PlayCandidate, opts?: { fromAuto?: boolean }): Promise<boolean> {
  if (sourceCreating.value) return false
  sourceCreating.value = true
  if (!opts?.fromAuto) {
    stopAutoMode()
    autoPlayingUri.value = ''
    currentSourceLabel.value = c.title || c.channel || c.sourceName || ''
  }
  try {
    const groupId = roomStore.group?.group_id
    const epSort = searchingEpisode.value || currentEpisodeSort.value || undefined
    let sessionId: string

    let playMode: 'progressive' | 'stream' | 'hls' = 'progressive'
    if (c.kind === 'stream') {
      const s = await createStreamPlaybackSession({
        streamUrl: c.uri,
        title: c.title,
        headers: c.headers,
        bangumiId: bangumiId.value || undefined,
        episodeSort: epSort,
        groupId,
      })
      sessionId = s.id
      playMode = s.playMode || 'stream'
    } else {
      const s = await createPlaybackSession({
        uri: c.uri,
        bangumiId: bangumiId.value || undefined,
        episodeSort: epSort,
        groupId,
      })
      sessionId = s.id
      playMode = s.playMode || 'progressive'
    }

    playerRef.value?.clearHint()

    roomStore.sendControl('set_source', {
      session_id: sessionId,
      stream_url: buildPlaybackStreamUrl(sessionId, { hls: playMode === 'hls' }),
      episode_sort: epSort,
      title: c.title || playbackTitle.value,
    })

    if (!opts?.fromAuto) {
      sourceDrawerVisible.value = false
      autoStatus.value = ''
    }
    return true
  } catch {
    return false
  } finally {
    sourceCreating.value = false
  }
}

function onDrawerClosed() {
  // 关闭抽屉不取消后台搜索、不丢缓存
}

// 房主进房且尚无片源 → 自动选源
watch(
  [isHost, () => homeStore.animeDetail?.id, hasActiveSource],
  ([host, animeId, hasSrc]) => {
    if (!host || !animeId || hasSrc || autoBootstrapped) return
    autoBootstrapped = true
    nextTick(() => beginAutoSelect())
  },
  { immediate: true },
)

// 房主切集后若无源，自动再选
watch(
  () => playbackState.value?.episode_sort,
  (sort, prev) => {
    if (!isHost.value) return
    if (sort == null || sort === prev) return
    if (hasActiveSource.value) return
    beginAutoSelect()
  },
)

onBeforeUnmount(() => {
  searchToken++
  sourceSearching.value = false
  searchCache.clear()
  stopAutoMode()
  autoPlayGen++
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
  grid-template-columns: 28px 1fr auto auto;
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

  &__quality {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
    padding: 0 6px;
    border-radius: 5px;
    background: rgba(104, 198, 189, 0.14);
  }

  &__play {
    color: var(--primary-color);
    font-weight: 600;
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

  .search-drawer {
    :deep(.el-drawer) {
      width: 100% !important;
    }
  }
}
</style>
