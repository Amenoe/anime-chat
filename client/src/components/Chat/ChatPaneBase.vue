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
      <div v-for="item in pending" :key="item.id" class="pending-item pending-item--audio">
        <button
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
      <span class="chat-pane__pending-hint">待发送 {{ pending.length }} 条语音</span>
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
      <div class="chat-pane__editor-wrap">
        <div
          ref="editorRef"
          class="chat-pane__editor"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          :data-placeholder="editorPlaceholder"
          @input="onEditorInput"
          @keydown="onEditorKeydown"
          @paste="onPaste"
          @click="onEditorClick"
        />
        <div class="chat-pane__editor-tools">
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
        <span class="chat-pane__count" :class="{ 'is-over': editorText.length > 500 }">
          {{ editorText.length }} / 500
        </span>
      </div>
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

    <el-image-viewer
      v-if="editorPreviewUrl"
      :url-list="[editorPreviewUrl]"
      teleported
      @close="editorPreviewUrl = ''"
    />
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

type PendingAudio = {
  id: string
  blob: Blob
  previewUrl: string
  duration: number
}

type EditorImage = {
  blob: Blob
  previewUrl: string
}

const MAX_IMAGES = 6
const MAX_PENDING_AUDIO = 9
const MAX_TEXT = 500

const loginStore = useLoginStore()

const listRef = ref<HTMLElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const editorRef = ref<HTMLDivElement | null>(null)

/** 输入框（contenteditable）里的纯文本，用于字数与发送按钮状态 */
const editorText = ref('')
const editorImageCount = ref(0)
const editorPreviewUrl = ref('')
/** 输入框内图片 id → 压缩后的文件；图片本身作为节点插在编辑器里 */
const editorImages = new Map<string, EditorImage>()

/** 语音仍用待发送条（图片按微信方式直接嵌在输入框内） */
const pending = ref<PendingAudio[]>([])
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

const editorPlaceholder = computed(() =>
  editorImageCount.value > 0 ? '继续输入文字，Enter 发送' : props.placeholder,
)

const canSend = computed(
  () =>
    props.connected &&
    !recording.value &&
    !recordStarting.value &&
    !sending.value &&
    (editorText.value.trim().length > 0 || editorImageCount.value > 0 || pending.value.length > 0),
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

// ── 输入框（contenteditable）：文本与图片混排 ─────────────────
function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function readEditorText(): string {
  const editor = editorRef.value
  if (!editor) return ''
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || ''
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.classList.contains('editor-image')) return
    if (node.tagName === 'BR') {
      out += '\n'
      return
    }
    const block = node.tagName === 'DIV' || node.tagName === 'P'
    if (block && out && !out.endsWith('\n')) out += '\n'
    node.childNodes.forEach(walk)
    if (block && !out.endsWith('\n')) out += '\n'
  }
  editor.childNodes.forEach(walk)
  return out
    .replace(/\u00a0/g, ' ')
    .replace(/\n+$/, '')
    .trim()
}

function syncEditorText() {
  const editor = editorRef.value
  if (!editor) {
    editorText.value = ''
    editorImageCount.value = 0
    return
  }
  editorText.value = readEditorText()
  // Backspace 直接删掉图片节点时，把 Map 里的 blob 也回收掉
  const alive = new Set<string>()
  editor.querySelectorAll<HTMLElement>('.editor-image').forEach((node) => {
    const id = node.dataset.imageId || ''
    if (id) alive.add(id)
  })
  for (const [id, item] of editorImages) {
    if (!alive.has(id)) {
      URL.revokeObjectURL(item.previewUrl)
      editorImages.delete(id)
    }
  }
  editorImageCount.value = alive.size
}

function insertEditorImage(id: string, previewUrl: string) {
  const editor = editorRef.value
  if (!editor) return

  const wrap = document.createElement('span')
  wrap.className = 'editor-image'
  wrap.contentEditable = 'false'
  wrap.dataset.imageId = id

  const img = document.createElement('img')
  img.src = previewUrl
  img.alt = '聊天图片'

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'editor-image__remove'
  remove.textContent = '×'
  remove.addEventListener('mousedown', (event) => event.preventDefault())
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    removeEditorImage(id)
  })

  wrap.append(img, remove)

  const selection = window.getSelection()
  const inEditor = selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)
  if (inEditor && selection) {
    const range = selection.getRangeAt(0)
    range.deleteContents()
    range.insertNode(wrap)
    const space = document.createTextNode('\u00a0')
    wrap.after(space)
    const after = document.createRange()
    after.setStartAfter(space)
    after.collapse(true)
    selection.removeAllRanges()
    selection.addRange(after)
  } else {
    editor.appendChild(wrap)
    editor.appendChild(document.createTextNode('\u00a0'))
  }

  editor.focus()
  syncEditorText()
}

function removeEditorImage(id: string) {
  editorRef.value?.querySelector(`[data-image-id="${id}"]`)?.remove()
  const item = editorImages.get(id)
  if (item) {
    URL.revokeObjectURL(item.previewUrl)
    editorImages.delete(id)
  }
  syncEditorText()
}

async function addImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    ElNotification({ type: 'warning', title: '只能发送图片文件' })
    return
  }
  if (editorImages.size >= MAX_IMAGES) {
    ElNotification({ type: 'warning', title: `一次最多添加 ${MAX_IMAGES} 张图片` })
    return
  }
  try {
    // 聊天图不需要原图：先缩到最长边 1280、再压到 400KB 以内
    const blob = await compressImage(file)
    const previewUrl = URL.createObjectURL(blob)
    const id = makeId('img')
    editorImages.set(id, { blob, previewUrl })
    insertEditorImage(id, previewUrl)
  } catch (err: any) {
    ElNotification({
      type: 'error',
      title: '图片处理失败',
      message: err?.message || '请换一张图片重试',
    })
  }
}

function collectEditorImages(): Array<{ id: string; blob: Blob }> {
  const editor = editorRef.value
  if (!editor) return []
  const result: Array<{ id: string; blob: Blob }> = []
  editor.querySelectorAll<HTMLElement>('.editor-image').forEach((node) => {
    const id = node.dataset.imageId || ''
    const item = editorImages.get(id)
    if (item) result.push({ id, blob: item.blob })
  })
  return result
}

function clearEditorText() {
  const editor = editorRef.value
  if (!editor) return
  for (const node of Array.from(editor.childNodes)) {
    if (node instanceof HTMLElement && node.classList.contains('editor-image')) continue
    node.remove()
  }
  syncEditorText()
}

function onEditorInput() {
  syncEditorText()
}

function onEditorKeydown(e: KeyboardEvent | Event) {
  const ev = e as KeyboardEvent
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault()
    void doSend()
  }
}

function onEditorClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.editor-image__remove')) return
  const img = target.closest('.editor-image img') as HTMLImageElement | null
  if (img) editorPreviewUrl.value = img.src
}

/** 直接粘贴图片（截图工具、网页复制图）；粘贴纯文本时去掉外部富文本样式 */
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items?.length) return
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  if (files.length) {
    e.preventDefault()
    void (async () => {
      for (const file of files) {
        await addImageFile(file)
      }
    })()
    return
  }
  const text = e.clipboardData?.getData('text/plain')
  if (text) {
    e.preventDefault()
    document.execCommand('insertText', false, text)
    syncEditorText()
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
  if (pending.value.length >= MAX_PENDING_AUDIO) {
    ElNotification({ type: 'warning', title: `待发送语音最多 ${MAX_PENDING_AUDIO} 条` })
    return
  }
  pending.value.push({
    id: makeId('voice'),
    blob,
    previewUrl: URL.createObjectURL(blob),
    duration: Math.max(1, recordedSeconds.value),
  })
}

// ── 待发送语音试听 ───────────────────────────────────────────
function pendingDurationLabel(item: PendingAudio) {
  return `${Math.max(1, Math.round(item.duration))}"`
}

function removePending(id: string) {
  const index = pending.value.findIndex((item) => item.id === id)
  if (index < 0) return
  const [item] = pending.value.splice(index, 1)
  URL.revokeObjectURL(item.previewUrl)
  if (pendingAudioId.value === id) {
    pendingAudio?.pause()
    pendingAudio = null
    pendingAudioId.value = ''
  }
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
  const text = editorText.value.trim()
  const images = collectEditorImages()
  const audios = [...pending.value]
  if (!text && !images.length && !audios.length) return

  if (text) {
    emit('send', text.slice(0, MAX_TEXT))
    clearEditorText()
  }

  if (images.length || audios.length) {
    sending.value = true
    let failed = 0
    try {
      for (const image of images) {
        try {
          const res = await uploadChatMedia(image.blob, 'chat-image.jpg')
          emit('send-media', res.url, 'image')
          removeEditorImage(image.id)
        } catch {
          failed += 1
        }
      }
      for (const audio of audios) {
        try {
          const res = await uploadChatMedia(audio.blob, `chat-voice.${audioExtOf(audio.blob.type)}`)
          // 自己发的语音直接用录制时长，列表里不必等 metadata 加载再显示
          voiceDurations[res.url] = audio.duration
          emit('send-media', res.url, 'audio')
          removePending(audio.id)
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
        message: `${failed} 个附件未发出，仍保留在输入区`,
      })
    }
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
  for (const item of editorImages.values()) URL.revokeObjectURL(item.previewUrl)
  editorImages.clear()
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
  }

  /* 输入框：contenteditable，图片直接嵌在文本里（微信式） */
  &__editor-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  &__editor {
    box-sizing: border-box;
    min-height: 64px;
    max-height: 140px;
    overflow-y: auto;
    /* 底部留出内嵌按钮的位置（按钮绝对定位在左下角） */
    padding: 8px 12px 30px;
    border-radius: 10px;
    background: var(--surface-overlay);
    box-shadow: 0 0 0 1px rgba(104, 198, 189, 0.22) inset;
    color: var(--font-color);
    font-size: 14px;
    line-height: 1.5;
    outline: none;
    word-break: break-word;
    white-space: pre-wrap;

    &:empty::before {
      content: attr(data-placeholder);
      color: var(--font-unactive-color);
      pointer-events: none;
    }

    &:focus {
      box-shadow: 0 0 0 1px var(--primary-color) inset;
    }
  }

  /* 图片/语音按钮内嵌在输入框左下角 */
  &__editor-tools {
    position: absolute;
    left: 8px;
    bottom: 4px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  &__count {
    position: absolute;
    right: 10px;
    bottom: 7px;
    font-size: 11px;
    color: var(--font-unactive-color);
    pointer-events: none;

    &.is-over {
      color: var(--warning-color);
    }
  }

  &__tool {
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--font-unactive-color);

    :deep(.el-icon) {
      font-size: 14px;
    }

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
    height: 64px;
    padding: 0 16px;
    flex-shrink: 0;
  }
}

/* 输入框里的图片块：节点由 createElement 插入，没有 scoped 的 data-v，
   必须用 :deep() 才能命中（否则图片按原始尺寸铺满输入框） */
.chat-pane :deep(.editor-image) {
  position: relative;
  display: inline-block;
  vertical-align: bottom;
  margin: 2px 4px 2px 0;
  line-height: 0;

  img {
    display: block;
    width: 64px;
    height: 64px;
    border-radius: 6px;
    object-fit: cover;
    cursor: zoom-in;
  }
}

.chat-pane :deep(.editor-image__remove) {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--aside-bg-color);
  background: var(--warning-color);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
}

/* 待发送语音条 */
.pending-item {
  position: relative;
  flex-shrink: 0;

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
      height: 64px;
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
