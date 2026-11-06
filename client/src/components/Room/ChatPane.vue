<template>
  <ChatPaneBase
    :messages="messages"
    :online-users="onlineUsers"
    :connected="connected"
    empty-text="还没有消息，来说点什么吧"
    @send="onSend"
    @send-media="onSendMedia"
  >
    <template #header-extra>
      <el-button size="small" text @click="copyRoomLink">复制链接</el-button>
    </template>
  </ChatPaneBase>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import ChatPaneBase from '@/components/Chat/ChatPaneBase.vue'
import { copyText, shareUrlOf } from '@/utils/share'

/** 放映室聊天：消息与在线成员都来自 room store，面板本身复用 ChatPaneBase */
const roomStore = useRoomStore()
const route = useRoute()
const router = useRouter()

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

function onSendMedia(message: string, type: 'image' | 'audio') {
  if (!connected.value) {
    ElNotification({ type: 'warning', title: '未连接放映室' })
    return
  }
  roomStore.sendMessage(message, type)
}

async function copyRoomLink() {
  const seasonId = String(route.params.seasonId || '')
  const url = shareUrlOf(router, { name: 'Room', params: { seasonId } })
  if (await copyText(url)) {
    ElNotification({ type: 'success', title: '已复制放映室链接' })
    return
  }
  ElNotification({
    type: 'error',
    title: '复制失败',
    message: '浏览器未允许访问剪贴板，请手动复制地址栏链接',
  })
}
</script>
