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
            <button
              v-else-if="item.message_type === 'audio'"
              type="button"
              class="chat-voice"
              :class="{ 'is-self': isSelf(item.user_id), 'is-playing': playingVoiceId === item.id }"
              :style="{ width: voiceWidth(item.message) }"
              :title="`语音 ${voiceDurationLabel(item.message)}`"
              @click="toggleVoice(item)"
            >
              <span class="chat-voice__icon" :class="{ 'is-playing': playingVoiceId === item.id }">
                <i /><i /><i />
              </span>
              <span class="chat-voice__duration">{{ voiceDurationLabel(item.message) }}</span>
            </button>
            <div v-else class="chat-bubble__text">{{ item.message }}</div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="pending.length" class="chat-pane__pending">
      <div
        v-for="item in pending"
        :key="item.id"
        class="pending-item"
        :class="`pending-item--${item.kind}`"
      >
        <el-image
          v-if="item.kind === 'image'"
          :src="item.previewUrl"
          :preview-src-list="[item.previewUrl]"
          preview-teleported
          fit="cover"
          class="pending-item__thumb"
        />
        <button
          v-else
          type="button"
          class="pending-item__voice"
          :class="{ 'is-playing': pendingAudioId === item.id }"
          :title="pendingAudioId === item.id ? '暂停试听' : '试听'"
          @click="togglePendingAudio(item)"
        >
          <span class="pending-item__play">{{ pendingAudioId === item.id ? '❚❚' : '▶' }}</span>
          <span>{{ pendingDurationLabel(item) }}</span>
        </button>
        <button
          type="button"
          class="pending-item__remove"
          title="删除"
          :disabled="sending"
          @click="removePending(item.id)"
        >
          ×
        </button>
      </div>
      <span class="chat-pane__pending-hint">待发送 {{ pending.length }} 个</span>
    </div>

    <div v-if="recording || recordStarting || sending" class="chat-pane__status">
      <template v-if="sending">正在发送…</template>
      <template v-else-if="recordStarting">正在启动麦克风…</template>
      <template v-else>
        <span class="chat-pane__status-dot" />
        <span>录音中 {{ recordedSeconds }}s / 60s</span>
        <button type="button" class="chat-pane__status-btn" @click="stopRecording">结束</button>
        <button
          type="button"
          class="chat-pane__status-btn chat-pane__status-btn--danger"
          @click="cancelRecording"
        >
          取消
        </button>
      </template>
    </div>

    <div class="chat-pane__input">
      <div class="chat-pane__tools">
        <el-tooltip content="发送图片（也可直接粘贴）" placement="top">
          <el-button
            class="chat-pane__tool"
            :icon="Picture"
            circle
            text
            :disabled="!connected || sending || recording || recordStarting"
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
            :disabled="!connected || sending || recordStarting"
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
        :placeholder="pending.length ? '可继续输入文字，点发送一并发出' : placeholder"
        :disabled="!connected || recording"
        @keydown="onInputKeydown"
        @paste="onPaste"
      />
      <el-button
        type="primary"
        class="chat-pane__send"
        :loading="sending"
        :disabled="!canSend"
        @click="doSend"
      >
        发送
      </el-button>
      <input
        ref="imageInput"
        class="chat-pane__file"
        type="file"
        accept="image/*"
        multiple
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

type PendingImage = {
  id: string
  kind: 'image'
  blob: Blob
  previewUrl: string
}

type PendingAudio = {
  id: string
  kind: 'audio'
  blob: Blob
  previewUrl: string
  duration: number
}

type PendingAttachment = PendingImage | PendingAudio

const MAX_IMAGES = 6
const MAX_PENDING = 9

const loginStore = useLoginStore()

const inputText = ref('')
const listRef = ref<HTMLElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)

/** 选完先进入待发送区：可以删除、试听，确认后点「发送」才真正上传 */
const pending = ref<PendingAttachment[]>([])
const sending = ref(false)

const recording = ref(false)
const recordStarting = ref(false)
const recordedSeconds = ref(0)

let recorder: MediaRecorder | null = null
let recordStream: MediaStream | null = null
let recordChunks: Blob[] = []
let recordTimer: number | undefined
let recordCancelled = false
let disposed = false

// 聊天记录里的语音（微信式气泡）
const voiceDurations = reactive<Record<string, number>>({})
const playingVoiceId = ref('')
const primingVoices = new Set<string>()
let messageAudio: HTMLAudioElement | null = null

// 待发送语音的本地试听
const pendingAudioId = ref('')
let pendingAudio: HTMLAudioElement | null = null

const canSend = computed(
  () =>
    props.connected &&
    !recording.value &&
    !recordStarting.value &&
    !sending.value &&
    (inputText.value.trim().length > 0 || pending.value.length > 0),
)

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

onMounted(() => {
  scrollToBottom()
  primeAllVoiceDurations()
})

watch(
  () => props.messages,
  () => primeAllVoiceDurations(),
)

function onInputKeydown(e: KeyboardEvent | Event) {
  const ev = e as KeyboardEvent
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault()
    void doSend()
  }
}

// ── 待发送附件 ────────────────────────────────────────────────
function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

async function addImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    ElNotification({ type: 'warning', title: '只能发送图片文件' })
    return
  }
  if (pending.value.filter((p) => p.kind === 'image').length >= MAX_IMAGES) {
    ElNotification({ type: 'warning', title: `一次最多添加 ${MAX_IMAGES} 张图片` })
    return
  }
  if (pending.value.length >= MAX_PENDING) {
    ElNotification({ type: 'warning', title: `待发送最多 ${MAX_PENDING} 个` })
    return
  }
  try {
    // 聊天图不需要原图：先缩到最长边 1280、再压到 400KB 以内
    const blob = await compressImage(file)
    pending.value.push({
      id: makeId('img'),
      kind: 'image',
      blob,
      previewUrl: URL.createObjectURL(blob),
    })
  } catch (err: any) {
    ElNotification({
      type: 'error',
      title: '图片处理失败',
      message: err?.message || '请换一张图片重试',
    })
  }
}

function removePending(id: string) {
  const index = pending.value.findIndex((item) => item.id === id)
  if (index < 0) return
  const [item] = pending.value.splice(index, 1)
  URL.revokeObjectURL(item.previewUrl)
  if (item.kind === 'audio' && pendingAudioId.value === id) {
    pendingAudio?.pause()
    pendingAudio = null
    pendingAudioId.value = ''
  }
}

function pickImage() {
  if (!props.connected || sending.value || recording.value || recordStarting.value) return
  imageInput.value?.click()
}

async function onImageChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  // 清空 value，同一张图连选两次也能触发 change
  input.value = ''
  for (const file of files) {
    await addImageFile(file)
  }
}

/** 直接粘贴图片（截图工具、网页复制图） */
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items?.length) return
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  if (!files.length) return
  e.preventDefault()
  void (async () => {
    for (const file of files) {
      await addImageFile(file)
    }
  })()
}

// ── 录音 ─────────────────────────────────────────────────────
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
  if (!props.connected || sending.value || recordStarting.value) return
  if (!canRecord()) {
    // 非安全上下文（http + 非 localhost）拿不到 mediaDevices，这是浏览器限制
    ElNotification({
      type: 'warning',
      title: '当前环境不支持录音',
      message: '语音需要 HTTPS 或 localhost 环境，并允许麦克风权限',
    })
    return
  }

  recordCancelled = false
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
      finishRecording()
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

/** 取消这一段录音：停止但丢弃，不进入待发送区 */
function cancelRecording() {
  recordCancelled = true
  stopRecording()
}

function finishRecording() {
  const recorded = recorder
  recorder = null
  const chunks = recordChunks
  recordChunks = []
  if (disposed || !recorded) return
  if (recordCancelled) {
    recordCancelled = false
    return
  }

  const blob = new Blob(chunks, { type: recorded.mimeType || 'audio/webm' })
  if (!blob.size) return
  pending.value.push({
    id: makeId('voice'),
    kind: 'audio',
    blob,
    previewUrl: URL.createObjectURL(blob),
    duration: Math.max(1, recordedSeconds.value),
  })
}

// ── 待发送语音试听 ───────────────────────────────────────────
function pendingDurationLabel(item: PendingAudio) {
  return `${Math.max(1, Math.round(item.duration))}"`
}

function togglePendingAudio(item: PendingAudio) {
  if (pendingAudioId.value === item.id) {
    pendingAudio?.pause()
    pendingAudio = null
    pendingAudioId.value = ''
    return
  }
  pendingAudio?.pause()
  const audio = new Audio(item.previewUrl)
  pendingAudio = audio
  audio.onended = () => {
    if (pendingAudioId.value === item.id) {
      pendingAudioId.value = ''
      pendingAudio = null
    }
  }
  audio
    .play()
    .then(() => {
      pendingAudioId.value = item.id
    })
    .catch(() => {
      pendingAudio = null
      pendingAudioId.value = ''
      ElNotification({ type: 'error', title: '试听失败' })
    })
}

// ── 发送 ─────────────────────────────────────────────────────
function audioExtOf(mime: string) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

async function doSend() {
  if (!props.connected) {
    ElNotification({ type: 'warning', title: '聊天服务未连接' })
    return
  }
  const text = inputText.value.trim()
  if (!text && !pending.value.length) return

  if (text) {
    emit('send', text)
    inputText.value = ''
  }
  if (!pending.value.length) {
    scrollToBottom(true)
    return
  }

  const items = [...pending.value]
  sending.value = true
  let failed = 0
  try {
    for (const item of items) {
      try {
        const filename =
          item.kind === 'image' ? 'chat-image.jpg' : `chat-voice.${audioExtOf(item.blob.type)}`
        const res = await uploadChatMedia(item.blob, filename)
        // 自己发的语音直接用录制时长，列表里不必等 metadata 加载再显示
        if (item.kind === 'audio') voiceDurations[res.url] = item.duration
        emit('send-media', res.url, item.kind)
        removePending(item.id)
      } catch {
        failed += 1
      }
    }
    scrollToBottom(true)
  } finally {
    sending.value = false
  }
  if (failed) {
    ElNotification({
      type: 'error',
      title: '部分附件发送失败',
      message: `${failed} 个附件未发出，已保留在待发送区`,
    })
  }
}

// ── 聊天记录语音（微信式） ───────────────────────────────────
function primeVoiceDuration(url: string) {
  if (!url || voiceDurations[url] !== undefined || primingVoices.has(url)) return
  primingVoices.add(url)
  const audio = new Audio()
  audio.preload = 'metadata'
  audio.onloadedmetadata = () => {
    voiceDurations[url] = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
    audio.src = ''
  }
  audio.onerror = () => {
    voiceDurations[url] = 0
  }
  audio.src = url
}

function primeAllVoiceDurations() {
  for (const message of props.messages) {
    if (message.message_type === 'audio') primeVoiceDuration(message.message)
  }
}

function voiceDurationLabel(url: string) {
  const duration = voiceDurations[url]
  if (!duration) return '语音'
  return `${Math.max(1, Math.round(duration))}"`
}

function voiceWidth(url: string) {
  const duration = voiceDurations[url] || 0
  return `${Math.min(210, Math.max(86, 70 + duration * 2.2))}px`
}

function toggleVoice(item: ChatMessage) {
  if (playingVoiceId.value === item.id) {
    messageAudio?.pause()
    messageAudio = null
    playingVoiceId.value = ''
    return
  }
  messageAudio?.pause()
  const audio = new Audio(item.message)
  messageAudio = audio
  audio.onloadedmetadata = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      voiceDurations[item.message] = audio.duration
    }
  }
  audio.onended = () => {
    if (playingVoiceId.value === item.id) {
      playingVoiceId.value = ''
      messageAudio = null
    }
  }
  audio
    .play()
    .then(() => {
      playingVoiceId.value = item.id
    })
    .catch(() => {
      messageAudio = null
      ElNotification({ type: 'error', title: '语音播放失败' })
    })
}

onBeforeUnmount(() => {
  disposed = true
  if (recordTimer !== undefined) window.clearInterval(recordTimer)
  if (recorder && recorder.state !== 'inactive') {
    // 离开页面时不再保留半段录音
    recorder.ondataavailable = null
    recorder.onstop = null
    recorder.stop()
  }
  recordStream?.getTracks().forEach((track) => track.stop())
  recordStream = null

  messageAudio?.pause()
  pendingAudio?.pause()
  for (const item of pending.value) URL.revokeObjectURL(item.previewUrl)
  pending.value = []
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
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px 0;
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

  &__status-btn {
    padding: 1px 10px;
    border: 1px solid rgba(104, 198, 189, 0.3);
    border-radius: 999px;
    background: transparent;
    color: var(--primary-color);
    font-size: 11px;
    line-height: 1.6;
    cursor: pointer;

    &:hover {
      background: rgba(104, 198, 189, 0.12);
    }

    &--danger {
      color: var(--warning-color);
      border-color: rgba(224, 107, 107, 0.4);

      &:hover {
        background: rgba(224, 107, 107, 0.12);
      }
    }
  }

  /* 待发送附件：选完先预览，可删除/试听，点发送才上传 */
  &__pending {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 16px 0;
  }

  &__pending-hint {
    margin-left: auto;
    font-size: 11px;
    color: var(--font-unactive-color);
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
    flex-direction: row;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  &__tool {
    width: 30px;
    height: 30px;
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
    height: 56px;
    padding: 0 16px;
    flex-shrink: 0;
  }
}

/* 待发送缩略图 / 语音条 */
.pending-item {
  position: relative;
  flex-shrink: 0;

  &__thumb {
    display: block;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(104, 198, 189, 0.25);
    cursor: zoom-in;

    :deep(.el-image__inner) {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  &__voice {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 14px;
    border-radius: 20px;
    border: 1px solid rgba(104, 198, 189, 0.3);
    background: var(--surface-overlay);
    color: var(--font-color);
    font-size: 12px;
    cursor: pointer;

    &:hover,
    &.is-playing {
      color: var(--primary-color);
      border-color: var(--primary-color);
    }
  }

  &__play {
    font-size: 10px;
    width: 12px;
    text-align: center;
  }

  &__remove {
    position: absolute;
    top: -7px;
    right: -7px;
    z-index: 2;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--bg-color);
    background: var(--warning-color);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

/* 聊天记录里的语音：微信式气泡，不用原生 audio 控件 */
.chat-voice {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--font-color);
  font-size: 13px;
  cursor: pointer;
  user-select: none;

  &.is-self {
    flex-direction: row-reverse;
  }

  &__icon {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    width: 16px;
    height: 16px;
    flex-shrink: 0;

    i {
      display: block;
      width: 3px;
      height: 6px;
      border-radius: 2px;
      background: currentColor;
      transform-origin: bottom;

      &:nth-child(2) {
        height: 12px;
      }

      &:nth-child(3) {
        height: 9px;
      }
    }

    &.is-playing i {
      animation: chat-voice-wave 0.9s ease-in-out infinite;

      &:nth-child(2) {
        animation-delay: 0.15s;
      }

      &:nth-child(3) {
        animation-delay: 0.3s;
      }
    }
  }

  &__duration {
    font-size: 12px;
    opacity: 0.85;
  }
}

@keyframes chat-voice-wave {
  0%,
  100% {
    transform: scaleY(0.55);
  }
  50% {
    transform: scaleY(1.25);
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
