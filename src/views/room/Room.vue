<template>
  <div class="page room-page">
    <div v-if="joining" v-loading="true" class="room-page__loading">正在进入放映室…</div>
    <template v-else-if="group">
      <div class="room-page__left">
        <PlayerPane />
      </div>
      <div class="room-page__right">
        <div class="room-page__tabs">
          <button
            class="room-page__tab"
            :class="{ active: activeTab === 'chat' }"
            @click="activeTab = 'chat'"
          >
            聊天
          </button>
          <button
            class="room-page__tab"
            :class="{ active: activeTab === 'playlist' }"
            @click="activeTab = 'playlist'"
          >
            播放列表
          </button>
        </div>
        <div class="room-page__panel">
          <ChatPane v-show="activeTab === 'chat'" />
          <PlaylistPane v-show="activeTab === 'playlist'" />
        </div>
      </div>
    </template>
    <el-empty v-else description="放映室不存在或已关闭" />
  </div>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import { useHomeStore } from '@/stores/modules/home'
import PlayerPane from '@/components/Room/PlayerPane.vue'
import ChatPane from '@/components/Room/ChatPane.vue'
import PlaylistPane from '@/components/Room/PlaylistPane.vue'
import { reportWatchedEpisode } from '@/api/user-anime'

const route = useRoute()
const router = useRouter()
const roomStore = useRoomStore()
const homeStore = useHomeStore()

const activeTab = ref<'chat' | 'playlist'>('chat')

const group = computed(() => roomStore.group)
const joining = computed(() => roomStore.joining)

onMounted(async () => {
  const seasonId = route.params.seasonId as string
  if (!seasonId) {
    router.replace('/')
    return
  }
  try {
    const data = await roomStore.joinRoom({ seasonId })
    if (data.group?.anime_id) {
      await homeStore.detailDataAction(data.group.anime_id)
    }
  } catch (err: any) {
    ElNotification({
      type: 'error',
      title: '进入放映室失败',
      message: err?.message || '请稍后重试',
    })
    router.replace('/')
  }
})

watch(group, (val) => {
  if (!val && !joining.value) {
    ElNotification({ type: 'warning', title: '放映室已关闭' })
    const animeId = homeStore.anime_id
    router.replace(animeId ? `/detail/${animeId}` : '/')
  }
})

/**
 * 放映室里看到第几集，也写进自己的追番进度。
 *
 * 监听的是 `playback_state.episode_sort` —— 它由 socket 广播：
 * 房主切集时所有 viewer 都会收到，所以**每个人**的追番都会跟着更新，
 * 而不是只有动手切集的那个人。
 *
 * 失败静默（没追这部时服务端 404，拦截器按 X-Silent 跳过提示）。
 */
watch(
  () => roomStore.playbackState?.episode_sort,
  (sort) => {
    if (!sort || sort <= 0) return
    const animeId = group.value?.anime_id
    if (!animeId) return
    void reportWatchedEpisode(animeId, sort).catch(() => undefined)
  },
)

onBeforeUnmount(() => {
  roomStore.leaveRoom()
})
</script>

<style scoped lang="less">
@import '~styles/page';

.room-page {
  display: flex;
  gap: 0;
  padding: 0;
  overflow: hidden;

  &__loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
  }

  &__left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow-y: auto;
  }

  &__right {
    width: 360px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--aside-bg-color);
    border-left: 1px solid rgba(104, 198, 189, 0.12);
  }

  &__tabs {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(104, 198, 189, 0.12);
  }

  &__tab {
    flex: 1;
    padding: 14px 0;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--font-unactive-color);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;

    &:hover {
      color: var(--font-color);
    }

    &.active {
      color: var(--primary-color);
      border-bottom-color: var(--primary-color);
    }
  }

  &__panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
}

@media (max-width: 768px) {
  .room-page {
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;

    &__left {
      flex: none;
      padding: 0;
      width: 100%;
    }

    &__right {
      flex: 1;
      width: 100%;
      min-height: 360px;
      border-left: none;
      border-top: 1px solid rgba(104, 198, 189, 0.12);
    }
  }
}
</style>
