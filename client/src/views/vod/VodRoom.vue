<template>
  <div class="page vod-room">
    <div v-if="joining" v-loading="true" class="vod-room__loading">正在进入点播室…</div>
    <template v-else-if="group">
      <div class="vod-room__left">
        <header class="vod-room__head">
          <div class="vod-room__title">
            <span class="vod-room__dot" />
            {{ group.group_name }}
            <span class="vod-room__role">{{ isHost ? '房主' : '成员' }}</span>
          </div>
          <div class="vod-room__actions">
            <el-button size="small" text @click="copyInvite">复制邀请链接</el-button>
            <el-button size="small" text @click="leave">退出房间</el-button>
          </div>
        </header>
        <p class="vod-room__desc">
          {{
            isHost
              ? '你选的源会同步给房间成员；离开房间会解散它。'
              : '播放进度跟随房主，右侧是房间聊天。'
          }}
        </p>
        <VodPlayer />
      </div>

      <div class="vod-room__right">
        <VodChatPane />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useVodStore } from '@/stores/modules/vod'
import { useLoginStore } from '@/stores/modules/login'
import VodPlayer from '@/components/Vod/VodPlayer.vue'
import VodChatPane from '@/components/Vod/VodChatPane.vue'

const route = useRoute()
const router = useRouter()
const vodStore = useVodStore()
const loginStore = useLoginStore()

const group = computed(() => vodStore.group)
const isHost = computed(() => vodStore.role === 'host')
const joining = computed(() => vodStore.joining)

function copyInvite() {
  const base = import.meta.env.VITE_BASE_URL || '/'
  const url = `${location.origin}${base}vod/${route.params.seasonId}`
  navigator.clipboard
    .writeText(url)
    .then(() => ElNotification({ type: 'success', title: '已复制邀请链接' }))
    .catch(() => ElNotification({ type: 'error', title: '复制失败' }))
}

function leave() {
  vodStore.leaveRoom()
  router.push('/vod')
}

onMounted(async () => {
  const seasonId = route.params.seasonId as string
  if (!seasonId) {
    router.replace('/vod')
    return
  }
  if (!loginStore.token) {
    router.replace('/vod')
    return
  }
  try {
    await vodStore.joinRoom(seasonId)
  } catch (e: any) {
    ElNotification({
      type: 'error',
      title: '进入点播室失败',
      message: e?.message || '房间可能已解散',
    })
    router.replace('/vod')
  }
})

// 房主离开会解散房间（后端 room:destroyed），成员收到后回入口页
watch(
  () => vodStore.roomDestroyed,
  (destroyed) => {
    if (!destroyed) return
    ElNotification({ type: 'warning', title: '房间已解散', message: '房主离开了点播室' })
    router.replace('/vod')
  },
)

onBeforeUnmount(() => {
  vodStore.leaveRoom()
})
</script>

<style scoped lang="less">
@import '~styles/page';

.vod-room {
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
    gap: 12px;
    padding: 20px;
    overflow-y: auto;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 20px;
    font-weight: 700;
    padding-left: 10px;
    border-left: 4px solid var(--primary-color);
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary-color);
  }

  &__role {
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid rgba(104, 198, 189, 0.35);
    background: rgba(104, 198, 189, 0.1);
  }

  &__desc {
    margin: 0;
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__right {
    width: 360px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--aside-bg-color);
    border-left: 1px solid rgba(104, 198, 189, 0.12);
  }
}

@media (max-width: 768px) {
  .vod-room {
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;

    &__left {
      flex: none;
      padding: 12px;
    }

    &__right {
      flex: 1;
      width: 100%;
      min-height: 420px;
      border-left: none;
      border-top: 1px solid rgba(104, 198, 189, 0.12);
    }
  }
}
</style>
