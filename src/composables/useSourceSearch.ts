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

export type RowStatus = 'pending' | 'searching' | 'done' | 'empty' | 'error'

export type SearchRow = {
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

export function candidateKey(c: PlayCandidate) {
  return `${c.kind}::${c.uri}`
}

/** 自动选源：源下发后 10s 内未真正播放（未触发 play / 未报错）→ 切换下一路有结果的源 */
const AUTO_PLAY_TIMEOUT = 10000

/** 持久缓存 key：按番剧 + 集数，跨会话复用搜索结果 */
const SOURCE_PERSIST_PREFIX = 'room-source-cache:v1:'

export function useSourceSearch(opts?: { clearPlayerHint?: () => void }) {
  const roomStore = useRoomStore()
  const homeStore = useHomeStore()
  const clearPlayerHint = opts?.clearPlayerHint

  const isHost = computed(() => roomStore.role === 'host')
  const playbackState = computed(() => roomStore.playbackState)
  const currentEpisodeSort = computed(() => playbackState.value?.episode_sort ?? null)
  const bangumiId = computed(() => homeStore.animeDetail?.id ?? 0)
  const animeTitle = computed(() => {
    return homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || ''
  })
  const playbackTitle = computed(() => {
    return playbackState.value?.title || animeTitle.value || ''
  })
  const hasActiveSource = computed(() => {
    const ps = playbackState.value
    return !!(ps?.stream_url || ps?.session_id)
  })

  // ── 搜索状态 ──────────────────────────────────────────────
  const sourceDrawerVisible = ref(false)
  const sourceSearching = ref(false)
  const sourceCreating = ref(false)
  const searchRows = ref<SearchRow[]>([])
  const searchingEpisode = ref(0)
  let searchToken = 0
  const searchCache = new Map<string, { rows: SearchRow[]; searching: boolean; token: number }>()

  // ── 当前源标记（自动与手动共用） ────────────────────────────
  const currentSourceKey = ref('')
  const currentSourceUri = ref('')

  function clearCurrentSource() {
    currentSourceKey.value = ''
    currentSourceUri.value = ''
  }

  // ── 自动选源状态 ──────────────────────────────────────────
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

  function persistKey(sort: number) {
    return `${bangumiId.value || animeTitle.value || 'anime'}:${sort}`
  }

  function loadPersistedRows(sort: number): SearchRow[] | null {
    try {
      const raw = sessionStorage.getItem(SOURCE_PERSIST_PREFIX + persistKey(sort))
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      if (typeof parsed.t === 'number' && Date.now() - parsed.t > 24 * 3600 * 1000) {
        sessionStorage.removeItem(SOURCE_PERSIST_PREFIX + persistKey(sort))
        return null
      }
      return Array.isArray(parsed.rows) ? parsed.rows : null
    } catch {
      return null
    }
  }

  function savePersistedRows(sort: number, rows: SearchRow[]) {
    try {
      sessionStorage.setItem(
        SOURCE_PERSIST_PREFIX + persistKey(sort),
        JSON.stringify({ t: Date.now(), rows }),
      )
    } catch {
      /* 存储不可用（隐私模式等）时忽略 */
    }
  }

  // ── 派生展示 ──────────────────────────────────────────────
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

  /** 打开抽屉时兜底：播放状态已有源但本会话未记录 key 时，用播放标题匹配候选 */
  function syncCurrentSourceFromPlayback() {
    if (currentSourceKey.value) return
    const title = (playbackState.value?.title || currentSourceLabel.value || '').trim()
    console.log('[src-debug] syncCurrentSourceFromPlayback', {
      title,
      candidateCount: searchRows.value.reduce((n, r) => n + r.candidates.length, 0),
    })
    if (!title) return
    for (const row of searchRows.value) {
      for (const c of row.candidates) {
        const t = (c.title || c.channel || '').trim()
        if (t && (t === title || t.includes(title) || title.includes(t))) {
          currentSourceKey.value = candidateKey(c)
          currentSourceUri.value = c.uri
          console.log('[src-debug] syncCurrentSourceFromPlayback 匹配', {
            title,
            matched: t,
            key: candidateKey(c),
          })
          return
        }
      }
    }
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
      clearCurrentSource()
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
        clearCurrentSource()
        autoStatus.value = `超时 · ${label}，尝试下一路…`
        autoPlayingUri.value = ''
        void drainAutoQueue()
      }
    }, AUTO_PLAY_TIMEOUT)
  }

  function onPlayerError() {
    if (!autoMode.value || !isHost.value) return
    if (!autoPlayingUri.value) return
    const label = currentSourceLabel.value || '当前源'
    autoStatus.value = `播放失败 · ${label}，尝试下一路…`
    clearCurrentSource()
    autoPlayingUri.value = ''
    clearPlayWatch()
    void drainAutoQueue()
  }

  /** 真正开始播放：停止自动换源 */
  function onPlaybackStarted() {
    if (autoMode.value && autoPlayingUri.value) {
      stopAutoMode()
      autoStatus.value = ''
    }
  }

  function startSearch(sort: number, opts?: { openDrawer?: boolean }) {
    searchingEpisode.value = sort
    const keyword = (homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name || '').trim()
    const key = cacheKey(keyword, sort)
    const cached = searchCache.get(key)
    console.log('[src-debug] startSearch', {
      sort,
      keyword,
      key,
      hitMemory: !!cached,
      cachedSearching: cached?.searching,
      openDrawer: !!opts?.openDrawer,
      currentEpisodeSort: currentEpisodeSort.value,
      playbackState: playbackState.value
        ? {
            episode_sort: playbackState.value.episode_sort,
            episode_id: playbackState.value.episode_id,
            status: playbackState.value.status,
          }
        : null,
    })
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

    if (cached) {
      // 僵尸缓存：搜索被更新的搜索打断且从未完成（rows 为空且 token 已过期），需重新发起
      if (!(cached.searching && !cached.rows.length && cached.token !== searchToken)) {
        searchRows.value = cached.rows
        sourceSearching.value = cached.searching
        if (autoMode.value) {
          for (const row of cached.rows) {
            if (row.candidates?.length) enqueueCandidates(row.candidates, row.name)
          }
        }
        return
      }
    }

    // 会话外持久缓存（刷新 / 重新进房后直接展示，不重新搜索）
    const persisted = !cached ? loadPersistedRows(sort) : null
    if (persisted && persisted.length) {
      console.log('[src-debug] startSearch 命中持久缓存', { key, rows: persisted.length })
      searchRows.value = persisted
      sourceSearching.value = false
      searchCache.set(key, { rows: persisted, searching: false, token: searchToken })
      // 自动选源模式下同样把持久缓存候选入队尝试播放（与内存缓存命中分支一致）
      if (autoMode.value) {
        for (const row of persisted) {
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
            savePersistedRows(sort, searchRows.value)
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
          savePersistedRows(sort, searchRows.value)
          if (autoMode.value) void drainAutoQueue()
        }
      }
    })()
  }

  function openSearchDrawer() {
    stopAutoMode()
    autoPlayingUri.value = ''
    const sort = currentEpisodeSort.value || 1
    console.log('[src-debug] openSearchDrawer', {
      sort,
      currentEpisodeSort: currentEpisodeSort.value,
      hasActiveSource: hasActiveSource.value,
      currentSourceKey: currentSourceKey.value,
    })
    startSearch(sort, { openDrawer: true })
    syncCurrentSourceFromPlayback()
  }

  function beginAutoSelect() {
    if (!isHost.value) return
    if (hasActiveSource.value) return
    const sort = currentEpisodeSort.value || 1
    console.log('[src-debug] beginAutoSelect', {
      sort,
      currentEpisodeSort: currentEpisodeSort.value,
      keyword: homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name,
    })
    autoMode.value = true
    autoQueue.value = []
    autoTried.clear()
    autoPlayingUri.value = ''
    autoStatus.value = '自动选源中…'
    startSearch(sort, { openDrawer: false })
  }

  async function selectCandidate(
    c: PlayCandidate,
    opts?: { fromAuto?: boolean },
  ): Promise<boolean> {
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
      console.log('[src-debug] selectCandidate', {
        kind: c.kind,
        uri: c.uri,
        epSort,
        searchingEpisode: searchingEpisode.value,
        currentEpisodeSort: currentEpisodeSort.value,
        fromAuto: !!opts?.fromAuto,
      })
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

      clearPlayerHint?.()

      roomStore.sendControl('set_source', {
        session_id: sessionId,
        stream_url: buildPlaybackStreamUrl(sessionId, { hls: playMode === 'hls' }),
        episode_sort: epSort,
        title: c.title || playbackTitle.value,
      })
      currentSourceKey.value = candidateKey(c)
      currentSourceUri.value = c.uri

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

  // 源被切集/失效清空（stream_url 置空）时，同步清除「当前源」标记
  watch(
    () => playbackState.value?.stream_url || '',
    (url) => {
      if (!url) clearCurrentSource()
    },
  )

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

  function teardown() {
    searchToken++
    sourceSearching.value = false
    searchCache.clear()
    stopAutoMode()
    autoPlayGen++
  }

  return {
    sourceDrawerVisible,
    sourceSearching,
    sourceCreating,
    searchRows,
    searchingEpisode,
    currentSourceKey,
    autoMode,
    autoPlayingUri,
    autoStatus,
    currentSourceLabel,
    drawerTitle,
    sourceStatusText,
    openSearchDrawer,
    beginAutoSelect,
    selectCandidate: (c: PlayCandidate) => selectCandidate(c),
    onPlayerError,
    onPlaybackStarted,
    teardown,
  }
}
