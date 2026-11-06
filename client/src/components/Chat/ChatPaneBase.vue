<template>
  <div class="chat-pane">
    <div class="chat-pane__header">
      <div class="chat-pane__online-block">
        <span class="chat-pane__online">在线 {{ onlineUsers.length }}</span>
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
      <slot name="header-extra" />
    </div>

    <div ref="listRef" class="chat-pane__list">
      <div v-if="messages.length === 0" class="chat-pane__empty">{{ emptyText }}</div>
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
            <div v-if="item.message_type === 'image'" class="chat-bubble__media">
              <el-image
                :src="item.message"
                :preview-src-list="[item.message]"
                preview-teleported
                fit="cover"
                loading="lazy"
              />
            </div>
            <audio
              v-else-if="item.message_type === 'audio'"
              class="chat-bubble__audio"
              :src="item.message"
              controls
              preload="metadata"
            />
            <div v-else class="chat-bubble__text">{{ item.message }}</div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="recording || uploading || recordStarting" class="chat-pane__status">
      <template v-if="uploading">正在发送{{ uploadKind === 'image' ? '图片' : '语音' }}…</template>
      <template v-else-if="recordStarting">正在启动麦克风…</template>
      <template v-else>
        <span class="chat-pane__status-dot" />
        录音中 {{ recordedSeconds }}s / 60s，点击麦克风结束
      </template>
    </div>

    <div class="chat-pane__input">
      <div class="chat-pane__tools">
        <el-tooltip content="发送图片" placement="top">
          <el-button
            class="chat-pane__tool"
            :icon="Picture"
            circle
            text
            :disabled="!connected || uploading || recording"
            @click="pickImage"
          />
        </el-tooltip>
        <el-tooltip :content="recording ? '结束录音' : '录制语音'" placement="top">
          <el-button
            class="chat-pane__tool"
            :class="{ 'is-recording': recording }"
            :icon="Microphone"
            circle
            text
            :disabled="!connected || uploading || recordStarting"
            @click="toggleRecording"
          />
        </el-tooltip>
      </div>
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="2"
        resize="none"
        maxlength="500"
        show-word-limit
        :placeholder="placeholder"
        :disabled="!connected || recording"
        @keydown="onInputKeydown"
      />
      <el-button
        type="primary"
        class="chat-pane__send"
        :disabled="!canSend || recording || uploading"
        @click="doSend"
      >
        发送
      </el-button>
      <input
        ref="imageInput"
        class="chat-pane__file"
        type="file"
        accept="image/*"
        @change="onImageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '@/stores/types'
import type { OnlineMember } from '@/stores/modules/room'
import { Picture, Microphone } from '@element-plus/icons-vue'
import { useLoginStore } from '@/stores/modules/login'
import { formatStamp } from '@/utils/date-format'
import { resolveAvatarUrl } from '@/utils/avatar'
import { compressImage } from '@/utils/image-compress'
import { uploadChatMedia } from '@/api/chat'

/**
 * 聊天面板骨架：放映室与点播室共用。
 *
 * 只负责「展示 + 输入」，消息从哪来（room store / vod store）、发送后怎么处理
 * 都由父组件通过 props / emits 决定 —— 两个房间的 socket 生命周期不同，
 * 但聊天气泡、在线头像、回车发送这些交互必须长一个样。
 */
const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    onlineUsers: OnlineMember[]
    connected: boolean
    placeholder?: string
    emptyText?: string
  }>(),
  {
    placeholder: '输入消息，Enter 发送',
    emptyText: '还没有消息，来说点什么吧',
  },
)

const emit = defineEmits<{
  send: [text: string]
  'send-media': [message: string, type: 'image' | 'audio']
}>()

const loginStore = useLoginStore()

const inputText = ref('')
const listRef = ref<HTMLElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadKind = ref<'image' | 'audio'>('image')
const recording = ref(false)
const recordStarting = ref(false)
const recordedSeconds = ref(0)

let recorder: MediaRecorder | null = null
let recordStream: MediaStream | null = null
let recordChunks: Blob[] = []
let recordTimer: number | undefined
let disposed = false

const canSend = computed(() => props.connected && inputText.value.trim().length > 0)

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
  () => props.messages.length,
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
  const text = inputText.value.trim()
  if (!text) return
  if (!props.connected) {
    ElNotification({ type: 'warning', title: '聊天服务未连接' })
    return
  }
  emit('send', text)
  inputText.value = ''
  scrollToBottom(true)
}

// ── 图片 ──────────────────────────────────────────────────────
function pickImage() {
  if (!props.connected || uploading.value || recording.value) return
  imageInput.value?.click()
}

async function onImageChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value，同一张图连选两次也能触发 change
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElNotification({ type: 'warning', title: '只能发送图片文件' })
    return
  }

  uploading.value = true
  uploadKind.value = 'image'
  try {
    // 聊天图不需要原图：先缩到最长边 1280、再压到 400KB 以内
    const compressed = await compressImage(file)
    const base = (file.name || 'image').replace(/\.[^.]+$/, '').slice(0, 40)
    const res = await uploadChatMedia(compressed, `${base || 'image'}.jpg`)
    emit('send-media', res.url, 'image')
    scrollToBottom(true)
  } catch (err: any) {
    ElNotification({
      type: 'error',
      title: '图片发送失败',
      message: err?.message || '请稍后重试',
    })
  } finally {
    uploading.value = false
  }
}

// ── 语音 ──────────────────────────────────────────────────────
function canRecord() {
  // 非安全上下文里 mediaDevices 整个是 undefined，而 lib.dom 的类型把它写成了必有，
  // 所以这里显式交叉一个可选类型，避免 TS 把判断当成恒真。
  const mediaDevices = (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices
  return typeof mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined'
}

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return (
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) || ''
  )
}

async function toggleRecording() {
  if (recording.value) {
    stopRecording()
    return
  }
  if (!props.connected || uploading.value || recordStarting.value) return
  if (!canRecord()) {
    // 非安全上下文（http + 非 localhost）拿不到 mediaDevices，这是浏览器限制
    ElNotification({
      type: 'warning',
      title: '当前环境不支持录音',
      message: '语音需要 HTTPS 或 localhost 环境，并允许麦克风权限',
    })
    return
  }

  recordStarting.value = true
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = pickAudioMime()
    recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined)
    recordChunks = []
    recorder.ondataavailable = (event) => {
      if (event.data?.size) recordChunks.push(event.data)
    }
    recorder.onstop = () => {
      recordStream?.getTracks().forEach((track) => track.stop())
      recordStream = null
      void finishRecording()
    }
    recorder.start()
    recording.value = true
    recordedSeconds.value = 0
    // 最长 60s，到点自动结束
    recordTimer = window.setInterval(() => {
      recordedSeconds.value += 1
      if (recordedSeconds.value >= 60) stopRecording()
    }, 1000)
  } catch {
    recordStream?.getTracks().forEach((track) => track.stop())
    recordStream = null
    recorder = null
    ElNotification({
      type: 'error',
      title: '无法录音',
      message: '请允许麦克风权限后重试',
    })
  } finally {
    recordStarting.value = false
  }
}

function stopRecording() {
  if (!recording.value) return
  recording.value = false
  if (recordTimer !== undefined) {
    window.clearInterval(recordTimer)
    recordTimer = undefined
  }
  if (recorder && recorder.state !== 'inactive') recorder.stop()
}

async function finishRecording() {
  const recorded = recorder
  recorder = null
  const chunks = recordChunks
  recordChunks = []
  if (disposed || !recorded) return

  const blob = new Blob(chunks, { type: recorded.mimeType || 'audio/webm' })
  if (!blob.size) return

  uploading.value = true
  uploadKind.value = 'audio'
  try {
    const mime = (blob.type || 'audio/webm').split(';')[0]
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
    // 统一 blob 的 MIME，避免 `audio/webm;codecs=opus` 这类参数影响后端识别
    const res = await uploadChatMedia(new Blob([blob], { type: mime }), `voice.${ext}`)
    emit('send-media', res.url, 'audio')
    scrollToBottom(true)
  } catch (err: any) {
    ElNotification({
      type: 'error',
      title: '语音发送失败',
      message: err?.message || '请稍后重试',
    })
  } finally {
    uploading.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
  if (recordTimer !== undefined) window.clearInterval(recordTimer)
  if (recorder && recorder.state !== 'inactive') {
    // 离开页面时不再上传半段录音
    recorder.ondataavailable = null
    recorder.onstop = null
    recorder.stop()
  }
  recordStream?.getTracks().forEach((track) => track.stop())
  recordStream = null
})
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

    // 不设 scrollbar-width / scrollbar-color：Chromium 下一旦设为非 auto，
    // 所有 ::-webkit-scrollbar 规则都会被忽略，下面的主题滚动条就失效了
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 6px;

      &:hover {
        background: var(--scrollbar-thumb-hover);
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

  &__status {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px 0;
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning-color);
    animation: chat-recording-pulse 1.1s ease-in-out infinite;
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
      background: var(--surface-overlay);
      box-shadow: 0 0 0 1px rgba(104, 198, 189, 0.22) inset;
      color: var(--font-color);
    }
  }

  &__tools {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  &__tool {
    width: 30px;
    height: 26px;
    padding: 0;
    color: var(--font-unactive-color);

    &:hover:not(.is-disabled) {
      color: var(--primary-color);
    }

    &.is-recording {
      color: var(--warning-color);
      animation: chat-recording-pulse 1.1s ease-in-out infinite;
    }
  }

  &__file {
    display: none;
  }

  &__send {
    height: 36px;
    padding: 0 16px;
    flex-shrink: 0;
  }
}

@keyframes chat-recording-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
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
  background: var(--surface-overlay);
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

  /* 图片消息：点击由 el-image 的 preview 放大 */
  &__media {
    max-width: 220px;
    line-height: 0;

    :deep(.el-image) {
      display: block;
      max-width: 100%;
      border-radius: 8px;
      overflow: hidden;
      cursor: zoom-in;
    }

    :deep(.el-image__inner) {
      display: block;
      width: auto;
      max-width: 100%;
      max-height: 280px;
      object-fit: cover;
    }
  }

  &__audio {
    display: block;
    width: 220px;
    max-width: 100%;
    height: 34px;
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
