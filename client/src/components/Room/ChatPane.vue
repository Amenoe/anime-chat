<template>
  <ChatPaneBase
    :messages="messages"
    :online-users="onlineUsers"
    :connected="connected"
    empty-text="还没有消息，来说点什么吧"
    @send="onSend"
  >
    <template #header-extra>
      <el-button size="small" text @click="copyRoomLink">复制链接</el-button>
    </template>
  </ChatPaneBase>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import ChatPaneBase from '@/components/Chat/ChatPaneBase.vue'

/** 放映室聊天：消息与在线成员都来自 room store，面板本身复用 ChatPaneBase */
const roomStore = useRoomStore()
const route = useRoute()

const messages = computed(() => roomStore.messages)
const connected = computed(() => roomStore.connected)
const onlineUsers = computed(() => roomStore.onlineUsers)

function onSend(text: string) {
  if (!connected.value) {
    ElNotification({ type: 'warning', title: '未连接放映室' })
    return
  }
  roomStore.sendMessage(text)
}

function copyRoomLink() {
  const seasonId = route.params.seasonId as string
  const base = import.meta.env.VITE_BASE_URL || '/'
  const url = `${location.origin}${base}room/${seasonId}`
  navigator.clipboard
    .writeText(url)
    .then(() => {
      ElNotification({ type: 'success', title: '已复制放映室链接' })
    })
    .catch(() => {
      ElNotification({ type: 'error', title: '复制失败' })
    })
}
</script>
