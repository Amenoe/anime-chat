<template>
  <div class="player-pane">
    <AnimePlayer
      ref="playerRef"
      :url="streamUrl"
      :title="playbackTitle"
      :controlled="!isHost"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @seek="onSeek"
    />

    <div class="player-pane__info">
      <div class="player-pane__meta">
        <span v-if="playbackTitle" class="player-pane__title">{{ playbackTitle }}</span>
        <span v-if="currentEpisodeSort" class="player-pane__ep"
          >第 {{ currentEpisodeSort }} 话</span
        >
      </div>
      <div class="player-pane__actions">
        <button v-if="isHost" class="player-pane__source-btn" @click="openSearchDrawer">
          选源开播
        </button>
        <div class="player-pane__host">
          <span class="player-pane__host-label">房主</span>
          <span class="player-pane__host-badge">{{ isHost ? '你' : '观众模式' }}</span>
        </div>
      </div>
    </div>

    <div v-if="episodeList.length" class="player-pane__episodes">
      <span class="player-pane__episodes-label">选集</span>
      <div class="player-pane__episode-bar">
        <button
          v-for="ep in episodeList"
          :key="ep.id"
          class="player-pane__episode-btn"
          :class="{
            active: ep.sort === currentEpisodeSort,
            clickable: isHost,
          }"
          :disabled="!isHost"
          :title="ep.name_cn || ep.name || `第 ${ep.sort} 话`"
          @click="switchEpisode(ep)"
        >
          {{ ep.sort }}
        </button>
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
import type { IBangumiEpisode } from '@/api/types'

const roomStore = useRoomStore()
const homeStore = useHomeStore()

const isHost = computed(() => roomStore.role === 'host')
const playbackState = computed(() => roomStore.playbackState)
const currentEpisodeSort = computed(() => playbackState.value?.episode_sort ?? null)
const episodeList = computed(() => homeStore.episodes)
const bangumiId = computed(() => homeStore.animeDetail?.id ?? 0)

const playbackTitle = computed(() => {
  return (
    playbackState.value?.title ||
    homeStore.animeDetail?.name_cn ||
    homeStore.animeDetail?.name ||
    ''
  )
})

const streamUrl = computed(() => {
  const ps = playbackState.value
  if (!ps) return null
  if (ps.stream_url) return ps.stream_url
  if (ps.session_id) return buildPlaybackStreamUrl(ps.session_id)
  return null
})

// --- AnimePlayer ref ---
const playerRef = ref<InstanceType<typeof AnimePlayer> | null>(null)

// --- Host heartbeat ---
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
  if (!isHost.value) return
  roomStore.sendControl('play', { position: currentTime })
}

function onPause(currentTime: number) {
  if (!isHost.value) return
  roomStore.sendControl('pause', { position: currentTime })
}

function onSeek(currentTime: number) {
  if (!isHost.value) return
  roomStore.sendControl('seek', { position: currentTime })
}

// --- Viewer sync ---
watch(playbackState, (ps) => {
  if (!ps || isHost.value) return
  const p = playerRef.value
  if (!p) return

  p.setPaused(ps.paused)

  if (!ps.paused && ps.server_time) {
    const target = ps.position + (Date.now() - ps.server_time) / 1000
    const art = p.getPlayer()
    if (art && Math.abs(art.currentTime - target) > 1.5) {
      p.seekTo(target)
    }
  } else if (ps.paused) {
    p.seekTo(ps.position)
  }
})

// --- Episode switching ---
function switchEpisode(ep: IBangumiEpisode) {
  if (!isHost.value) return
  roomStore.sendControl('switch_episode', {
    episode_sort: ep.sort,
    episode_id: ep.id,
  })
}

// --- Host search source ---
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
/** 会话内搜源缓存：同 keyword+集数 不重复请求 */
const searchCache = new Map<string, { rows: SearchRow[]; searching: boolean; token: number }>()

function cacheKey(keyword: string, sort: number) {
  return `${keyword}::${sort}`
}

const drawerTitle = computed(() => {
  const ep = searchingEpisode.value
  const name = playbackTitle.value
  const base = ep ? `${name} · 第 ${ep} 话` : '搜源'
  return sourceSearching.value ? `${base}（搜索中）` : base
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

function openSearchDrawer() {
  const sort = currentEpisodeSort.value || 1
  searchingEpisode.value = sort
  const keyword = (homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || '').trim()
  if (!keyword) {
    ElNotification({ type: 'warning', title: '番剧名称未知，无法搜源' })
    return
  }

  sourceDrawerVisible.value = true
  sourceCreating.value = false

  const key = cacheKey(keyword, sort)
  const cached = searchCache.get(key)
  // 会话内缓存：同关键词+集数已有结果或正在搜 → 直接展示，不重搜
  if (cached && (cached.rows.length > 0 || cached.searching)) {
    searchRows.value = cached.rows
    sourceSearching.value = cached.searching
    searchToken = cached.token
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
          // 同步缓存引用（patchRow 已替换数组项）
          searchCache.set(key, {
            rows: searchRows.value,
            searching: true,
            token,
          })
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
      }
    }
  })()
}

async function selectCandidate(c: PlayCandidate) {
  if (sourceCreating.value) return
  sourceCreating.value = true
  // 不中断搜索：不改 searchToken，不清 sourceSearching
  try {
    const groupId = roomStore.group?.group_id
    const epSort = searchingEpisode.value || undefined
    let sessionId: string

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
    } else {
      const s = await createPlaybackSession({
        uri: c.uri,
        bangumiId: bangumiId.value || undefined,
        episodeSort: epSort,
        groupId,
      })
      sessionId = s.id
    }

    // 清除播放器错误提示
    playerRef.value?.clearHint()

    roomStore.sendControl('set_source', {
      session_id: sessionId,
      stream_url: buildPlaybackStreamUrl(sessionId),
      episode_sort: searchingEpisode.value,
      title: c.title || playbackTitle.value,
    })

    sourceDrawerVisible.value = false
  } catch {
    /* interceptor */
  } finally {
    sourceCreating.value = false
  }
}

function onDrawerClosed() {
  // 关闭抽屉不取消后台搜索、不丢缓存，便于再次打开继续看结果
}

onBeforeUnmount(() => {
  // 离开放映室页才中断搜索并清会话缓存
  searchToken++
  sourceSearching.value = false
  searchCache.clear()
})
</script>

<style scoped lang="less">
@accent: var(--primary-color);

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

  &__episodes {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__episodes-label {
    font-size: 14px;
    font-weight: 600;
    padding-left: 10px;
    border-left: 3px solid var(--primary-color);
  }

  &__episode-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__episode-btn {
    min-width: 40px;
    height: 36px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(104, 198, 189, 0.2);
    background: var(--aside-bg-color);
    color: var(--font-color);
    font-size: 13px;
    font-weight: 600;
    cursor: default;
    transition: all 0.2s;

    &.clickable {
      cursor: pointer;

      &:hover:not(.active) {
        border-color: rgba(104, 198, 189, 0.5);
        background: rgba(104, 198, 189, 0.08);
      }
    }

    &.active {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: #fff;
      box-shadow: 0 0 10px rgba(104, 198, 189, 0.3);
    }

    &:disabled:not(.active) {
      opacity: 0.7;
    }
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
