<template>
  <div id="chat" class="page chat-page">
    <div class="chat-header">
      <div class="chat-header__left">
        <el-button class="chat-header__back" @click="goBack">返回</el-button>
        <div class="chat-header__title">
          <h1>{{ chatTitle || '聊天室' }}</h1>
          <template v-if="isLogin && animeId">
            <span v-if="joining" class="chat-header__status">连接中…</span>
            <span v-else-if="connected" class="chat-header__status is-on">已连接</span>
            <span v-else class="chat-header__status is-off">未连接</span>
          </template>
        </div>
      </div>
      <span v-if="isLogin && animeId" class="chat-header__online">
        当前在线：{{ activeUser }}
      </span>
    </div>

    <template v-if="!isLogin">
      <el-empty description="请先登录后再进入聊天室" />
    </template>
    <template v-else-if="!animeId">
      <el-empty description="请从番剧详情页点击「进入聊天室」" />
    </template>
    <template v-else>
      <div ref="listRef" v-loading="joining" class="chat-content">
        <div v-if="!joining && chatMessage.length === 0" class="chat-empty">
          还没有消息，来说点什么吧
        </div>
        <div
          v-for="item in chatMessage"
          :key="item.id"
          class="chat-row"
          :class="{ 'is-self': isSelf(item.user_id), 'is-pending': item.pending }"
        >
          <el-avatar class="chat-avatar" :size="36" :src="avatarOf(item.avatar)" />
          <div class="chat-bubble">
            <div class="chat-bubble__meta">
              <span class="chat-bubble__name">{{ item.nickname }}</span>
              <span class="chat-bubble__time">{{ formatStamp(Number(item.time)) }}</span>
            </div>
            <div class="chat-bubble__text">{{ item.message }}</div>
          </div>
        </div>
      </div>

      <div class="chat-input">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="2"
          resize="none"
          maxlength="500"
          show-word-limit
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          :disabled="!connected || joining"
          @keydown="onInputKeydown"
        />
        <el-button
          type="primary"
          class="chat-input__send"
          :disabled="!canSend"
          @click="sendMessageClick"
        >
          发送
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '@/stores/modules/chat'
import { useLoginStore } from '@/stores/modules/login'
import { useHomeStore } from '@/stores/modules/home'
import { formatStamp } from '@/utils/date-format'
import { resolveAvatarUrl } from '@/utils/avatar'

const inputText = ref('')
const listRef = ref<HTMLElement | null>(null)
const router = useRouter()

const chatStore = useChatStore()
const loginStore = useLoginStore()
const homeStore = useHomeStore()

const isLogin = computed(() => loginStore.token !== '' && !!loginStore.userInfo)
const animeId = computed(() => homeStore.anime_id)
const chatMessage = computed(() => chatStore.messageList)
const chatTitle = computed(() => chatStore.group?.group_name)
const activeUser = computed(() => chatStore.activeUser)
const connected = computed(() => chatStore.connected)
const joining = computed(() => chatStore.joining)
const canSend = computed(
  () => connected.value && !joining.value && inputText.value.trim().length > 0,
)

const isSelf = (userId: string) => userId === loginStore.userInfo?.user_id

/** 空头像回落到默认图 */
function avatarOf(src?: string) {
  return resolveAvatarUrl(src)
}

function goBack() {
  // 优先浏览器历史；无历史时回详情或首页
  if (window.history.length > 1) {
    router.back()
    return
  }
  if (animeId.value) {
    router.push(`/detail/${animeId.value}`)
    return
  }
  router.push('/')
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
  () => chatMessage.value.length,
  () => scrollToBottom(true),
)

function onInputKeydown(e: KeyboardEvent | Event) {
  const ev = e as KeyboardEvent
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault()
    sendMessageClick()
  }
}

const sendMessageClick = () => {
  if (!inputText.value.trim()) return
  if (!connected.value) {
    ElNotification({ type: 'warning', title: '尚未连接，请稍候再试' })
    return
  }
  if (joining.value) {
    ElNotification({ type: 'warning', title: '正在加入聊天室…' })
    return
  }
  const ok = chatStore.sendMessage(inputText.value)
  if (ok) {
    inputText.value = ''
    scrollToBottom(true)
  }
}

async function boot() {
  if (!isLogin.value) return
  if (!animeId.value) return
  try {
    await chatStore.enterChat(
      animeId.value,
      homeStore.animeDetail?.name_cn || homeStore.animeDetail?.name,
    )
    scrollToBottom()
  } catch (err: any) {
    ElNotification({
      type: 'error',
      title: '进入聊天室失败',
      message: err?.message || '请稍后重试',
    })
  }
}

onMounted(() => {
  homeStore.loadAnimeData()
  void boot()
})

onUnmounted(() => {
  chatStore.leaveChat()
})
</script>

<style scoped lang="less">
@import '~styles/page';

.chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding-bottom: 12px;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(104, 198, 189, 0.15);

  &__left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  &__back {
    flex-shrink: 0;
  }

  &__title {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__status {
    font-size: 12px;
    color: var(--font-unactive-color);
    flex-shrink: 0;

    &.is-on {
      color: var(--primary-color);
    }
    &.is-off {
      color: var(--warning-color, #e06b6b);
    }
  }

  &__online {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--font-unactive-color);
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(104, 198, 189, 0.25);
    background: rgba(104, 198, 189, 0.08);
  }
}

.chat-content {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 8px 4px 12px;
  margin-bottom: 12px;

  scrollbar-width: thin;
  scrollbar-color: rgba(104, 198, 189, 0.45) rgba(255, 255, 255, 0.04);

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(104, 198, 189, 0.4);
    border-radius: 8px;
    border: 2px solid transparent;
    background-clip: content-box;

    &:hover {
      background: rgba(104, 198, 189, 0.65);
      background-clip: content-box;
    }
  }
}

.chat-empty {
  height: 100%;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--font-unactive-color);
  font-size: 14px;
}

.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;

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

      .chat-bubble__text {
        text-align: left;
      }
    }
  }
}

.chat-avatar {
  flex-shrink: 0;
  border: 1px solid rgba(104, 198, 189, 0.25);
  background: var(--aside-bg-color);
}

.chat-bubble {
  max-width: min(72%, 520px);
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.12);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);

  &__meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-color);
  }

  &__time {
    font-size: 11px;
    color: var(--font-unactive-color);
  }

  &__text {
    font-size: 14px;
    line-height: 1.55;
    color: var(--font-color);
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.chat-input {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding-top: 4px;

  :deep(.el-textarea) {
    flex: 1;
  }

  :deep(.el-textarea__inner) {
    min-height: 64px !important;
    background: var(--aside-bg-color);
    box-shadow: 0 0 0 1px rgba(104, 198, 189, 0.22) inset;
    color: var(--font-color);
  }

  &__send {
    height: 40px;
    padding: 0 20px;
    margin-bottom: 22px;
  }
}
</style>
