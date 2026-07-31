<template>
  <div class="chat-pane">
    <div class="chat-pane__header">
      <div class="chat-pane__online-block">
        <span class="chat-pane__online">在线 {{ onlineCount }}</span>
        <div v-if="onlineUsers.length" class="chat-pane__avatars">
          <el-tooltip
            v-for="u in onlineUsers"
            :key="u.user_id"
            :content="u.nickname || '用户'"
            placement="bottom"
            effect="dark"
          >
            <el-avatar class="chat-pane__avatar" :size="28" :src="avatarOf(u.avatar)">
              {{ (u.nickname || '?').slice(0, 1) }}
            </el-avatar>
          </el-tooltip>
        </div>
      </div>
      <el-button size="small" text @click="copyRoomLink">复制链接</el-button>
    </div>

    <div ref="listRef" class="chat-pane__list">
      <div v-if="messages.length === 0" class="chat-pane__empty">还没有消息，来说点什么吧</div>
      <template v-for="item in messages" :key="item.id">
        <div v-if="item.message_type === 'system'" class="chat-system">
          {{ item.message }}
        </div>
        <div
          v-else
          class="chat-row"
          :class="{ 'is-self': isSelf(item.user_id), 'is-pending': item.pending }"
        >
          <el-avatar class="chat-avatar" :size="32" :src="avatarOf(item.avatar)" />
          <div class="chat-bubble">
            <div class="chat-bubble__meta">
              <span class="chat-bubble__name">{{ item.nickname }}</span>
              <span class="chat-bubble__time">{{ formatStamp(Number(item.time)) }}</span>
            </div>
            <div class="chat-bubble__text">{{ item.message }}</div>
          </div>
        </div>
      </template>
    </div>

    <div class="chat-pane__input">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="2"
        resize="none"
        maxlength="500"
        show-word-limit
        placeholder="输入消息，Enter 发送"
        :disabled="!connected"
        @keydown="onInputKeydown"
      />
      <el-button type="primary" class="chat-pane__send" :disabled="!canSend" @click="doSend">
        发送
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/modules/room'
import { useLoginStore } from '@/stores/modules/login'
import { formatStamp } from '@/utils/date-format'
import { resolveAvatarUrl } from '@/utils/avatar'

const roomStore = useRoomStore()
const loginStore = useLoginStore()
const route = useRoute()

const inputText = ref('')
const listRef = ref<HTMLElement | null>(null)

const messages = computed(() => roomStore.messages)
const connected = computed(() => roomStore.connected)
const onlineUsers = computed(() => roomStore.onlineUsers)
const onlineCount = computed(() => onlineUsers.value.length)
const canSend = computed(() => connected.value && inputText.value.trim().length > 0)

const isSelf = (userId: string) => userId === loginStore.userInfo?.user_id

function avatarOf(src?: string) {
  return resolveAvatarUrl(src)
}

function scrollToBottom(smooth = false) {
  nextTick(() => {
    const el = listRef.value
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    })
  })
}

watch(
  () => messages.value.length,
  () => scrollToBottom(true),
)

onMounted(() => scrollToBottom())

function onInputKeydown(e: KeyboardEvent | Event) {
  const ev = e as KeyboardEvent
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault()
    doSend()
  }
}

function doSend() {
  if (!inputText.value.trim()) return
  if (!connected.value) {
    ElNotification({ type: 'warning', title: '未连接放映室' })
    return
  }
  const ok = roomStore.sendMessage(inputText.value)
  if (ok) {
    inputText.value = ''
    scrollToBottom(true)
  }
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

<style scoped lang="less">
.chat-pane {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(104, 198, 189, 0.12);
  }

  &__online-block {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  &__online {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--font-unactive-color);
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid rgba(104, 198, 189, 0.25);
    background: rgba(104, 198, 189, 0.08);
  }

  &__avatars {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
    padding: 2px 0;

    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__avatar {
    flex-shrink: 0;
    margin-left: -6px;
    border: 2px solid var(--aside-bg-color);
    background: var(--bg-color);
    cursor: default;
    transition: transform 0.15s, z-index 0s;

    &:first-child {
      margin-left: 0;
    }

    &:hover {
      transform: translateY(-2px) scale(1.06);
      z-index: 2;
    }
  }

  &__list {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 12px 16px;

    scrollbar-width: thin;
    scrollbar-color: rgba(104, 198, 189, 0.45) rgba(255, 255, 255, 0.04);

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.04);
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(104, 198, 189, 0.4);
      border-radius: 6px;

      &:hover {
        background: rgba(104, 198, 189, 0.65);
      }
    }
  }

  &__empty {
    height: 100%;
    min-height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--font-unactive-color);
    font-size: 13px;
  }

  &__input {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px 14px;
    border-top: 1px solid rgba(104, 198, 189, 0.12);

    :deep(.el-textarea) {
      flex: 1;
    }

    :deep(.el-textarea__inner) {
      min-height: 56px !important;
      background: rgba(34, 36, 51, 0.8);
      box-shadow: 0 0 0 1px rgba(104, 198, 189, 0.22) inset;
      color: var(--font-color);
    }
  }

  &__send {
    height: 36px;
    padding: 0 16px;
    flex-shrink: 0;
  }
}

.chat-system {
  margin: 8px 0;
  text-align: center;
  font-size: 12px;
  color: var(--font-unactive-color);

  span,
  & {
    display: block;
  }
}

.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;

  &.is-pending {
    .chat-bubble,
    .chat-avatar {
      opacity: 0.65;
    }
  }

  &.is-self {
    flex-direction: row-reverse;

    .chat-bubble {
      background: rgba(104, 198, 189, 0.18);
      border-color: rgba(104, 198, 189, 0.35);

      .chat-bubble__meta {
        flex-direction: row-reverse;
      }
    }
  }
}

.chat-avatar {
  flex-shrink: 0;
  border: 1px solid rgba(104, 198, 189, 0.25);
  background: var(--bg-color);
}

.chat-bubble {
  max-width: 75%;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(34, 36, 51, 0.8);
  border: 1px solid rgba(104, 198, 189, 0.12);

  &__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  &__name {
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
  }

  &__time {
    font-size: 10px;
    color: var(--font-unactive-color);
  }

  &__text {
    font-size: 13px;
    line-height: 1.5;
    color: var(--font-color);
    white-space: pre-wrap;
    word-break: break-word;
  }
}

@media (max-width: 768px) {
  .chat-pane {
    height: 100%;

    &__header {
      padding: 8px 12px;
    }

    &__avatar {
      margin-left: -8px;
    }

    &__list {
      padding: 8px 12px;
    }

    &__input {
      padding: 8px 12px 12px;
      gap: 6px;
    }

    &__send {
      height: 34px;
      padding: 0 12px;
    }
  }

  .chat-row {
    gap: 6px;
    margin-bottom: 10px;
  }

  .chat-avatar {
    width: 28px !important;
    height: 28px !important;
  }

  .chat-bubble {
    max-width: 80%;
    padding: 6px 10px;

    &__name {
      font-size: 11px;
    }

    &__text {
      font-size: 12px;
    }
  }
}
</style>
