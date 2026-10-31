<template>
  <ChatPaneBase
    :messages="messages"
    :online-users="onlineUsers"
    :connected="connected"
    empty-text="还没有人说话，打个招呼吧"
    placeholder="聊天室消息，Enter 发送"
    @send="onSend"
  >
    <template #header-extra>
      <span class="vod-chat__tag">点播室</span>
    </template>
  </ChatPaneBase>
</template>

<script setup lang="ts">
import { useVodStore } from '@/stores/modules/vod'
import ChatPaneBase from '@/components/Chat/ChatPaneBase.vue'

/** 点播室聊天：与放映室共用同一套聊天面板，只是消息来自 vod store */
const vodStore = useVodStore()

const messages = computed(() => vodStore.messages)
const connected = computed(() => vodStore.connected)
const onlineUsers = computed(() => vodStore.onlineUsers)

function onSend(text: string) {
  vodStore.sendMessage(text)
}
</script>

<style scoped lang="less">
.vod-chat__tag {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--primary-color);
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(104, 198, 189, 0.35);
  background: rgba(104, 198, 189, 0.1);
}
</style>
