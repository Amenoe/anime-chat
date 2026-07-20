<template>
  <el-dialog
    v-model="visible"
    title="裁剪头像"
    width="520px"
    :close-on-click-modal="false"
    destroy-on-close
    @closed="onClosed"
  >
    <div class="crop-wrap">
      <div ref="stageRef" class="crop-stage" @wheel.prevent="onWheel">
        <img
          ref="imgRef"
          class="crop-image"
          :src="imageUrl"
          alt="preview"
          draggable="false"
          @load="onImageLoad"
        />
        <div
          class="crop-box"
          :style="boxStyle"
          @pointerdown.stop="startDrag($event)"
        >
          <span class="crop-handle nw" @pointerdown.stop="startResize($event, 'nw')" />
          <span class="crop-handle ne" @pointerdown.stop="startResize($event, 'ne')" />
          <span class="crop-handle sw" @pointerdown.stop="startResize($event, 'sw')" />
          <span class="crop-handle se" @pointerdown.stop="startResize($event, 'se')" />
        </div>
      </div>
      <div class="crop-side">
        <div class="crop-preview-label">预览</div>
        <canvas ref="previewRef" class="crop-preview" width="96" height="96" />
        <p class="crop-tip">拖动选框或四角缩放；滚轮缩放选框</p>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="confirming" @click="confirm">确认上传</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
type Corner = 'nw' | 'ne' | 'sw' | 'se'

const props = defineProps<{
  modelValue: boolean
  imageUrl: string
  outputSize?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', file: File): void
  /** 弹窗完全关闭后（取消/确认/点 X），父组件可在此释放 Object URL */
  (e: 'closed'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const outputSize = computed(() => props.outputSize || 256)
const confirming = ref(false)

const stageRef = ref<HTMLElement | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const previewRef = ref<HTMLCanvasElement | null>(null)

const box = reactive({ x: 40, y: 40, size: 200 })
const natural = reactive({ w: 0, h: 0 })
const display = reactive({ w: 0, h: 0, left: 0, top: 0 })

const boxStyle = computed(() => ({
  left: `${box.x}px`,
  top: `${box.y}px`,
  width: `${box.size}px`,
  height: `${box.size}px`,
}))

const MIN_BOX = 64

function onImageLoad() {
  layoutImage()
  initBox()
  drawPreview()
}

function layoutImage() {
  const stage = stageRef.value
  const img = imgRef.value
  if (!stage || !img) return

  natural.w = img.naturalWidth
  natural.h = img.naturalHeight
  if (!natural.w || !natural.h) return

  const sw = stage.clientWidth
  const sh = stage.clientHeight
  const scale = Math.min(sw / natural.w, sh / natural.h)
  display.w = natural.w * scale
  display.h = natural.h * scale
  display.left = (sw - display.w) / 2
  display.top = (sh - display.h) / 2

  img.style.width = `${display.w}px`
  img.style.height = `${display.h}px`
  img.style.left = `${display.left}px`
  img.style.top = `${display.top}px`
}

function initBox() {
  const side = Math.min(display.w, display.h) * 0.72
  box.size = Math.max(MIN_BOX, side)
  box.x = display.left + (display.w - box.size) / 2
  box.y = display.top + (display.h - box.size) / 2
  clampBox()
}

function clampBox() {
  const minX = display.left
  const minY = display.top
  const maxX = display.left + display.w
  const maxY = display.top + display.h
  box.size = Math.min(box.size, display.w, display.h)
  box.size = Math.max(MIN_BOX, box.size)
  box.x = Math.min(Math.max(box.x, minX), maxX - box.size)
  box.y = Math.min(Math.max(box.y, minY), maxY - box.size)
}

let dragging = false
let resizing: Corner | null = null
let startPtr = { x: 0, y: 0 }
let startBox = { x: 0, y: 0, size: 0 }

function startDrag(e: PointerEvent) {
  dragging = true
  resizing = null
  startPtr = { x: e.clientX, y: e.clientY }
  startBox = { x: box.x, y: box.y, size: box.size }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function startResize(e: PointerEvent, corner: Corner) {
  resizing = corner
  dragging = false
  startPtr = { x: e.clientX, y: e.clientY }
  startBox = { x: box.x, y: box.y, size: box.size }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(e: PointerEvent) {
  const dx = e.clientX - startPtr.x
  const dy = e.clientY - startPtr.y

  if (dragging) {
    box.x = startBox.x + dx
    box.y = startBox.y + dy
    clampBox()
    drawPreview()
    return
  }
  if (!resizing) return

  let next = startBox.size
  let nx = startBox.x
  let ny = startBox.y

  if (resizing === 'se') {
    next = Math.max(MIN_BOX, startBox.size + Math.max(dx, dy))
  } else if (resizing === 'nw') {
    const d = Math.min(dx, dy)
    next = Math.max(MIN_BOX, startBox.size - d)
    nx = startBox.x + (startBox.size - next)
    ny = startBox.y + (startBox.size - next)
  } else if (resizing === 'ne') {
    const d = Math.max(dx, -dy)
    next = Math.max(MIN_BOX, startBox.size + d)
    ny = startBox.y + (startBox.size - next)
  } else if (resizing === 'sw') {
    const d = Math.max(-dx, dy)
    next = Math.max(MIN_BOX, startBox.size + d)
    nx = startBox.x + (startBox.size - next)
  }

  box.size = next
  box.x = nx
  box.y = ny
  clampBox()
  drawPreview()
}

function onPointerUp() {
  dragging = false
  resizing = null
  window.removeEventListener('pointermove', onPointerMove)
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -12 : 12
  const centerX = box.x + box.size / 2
  const centerY = box.y + box.size / 2
  box.size = Math.max(MIN_BOX, box.size + delta)
  box.x = centerX - box.size / 2
  box.y = centerY - box.size / 2
  clampBox()
  drawPreview()
}

function cropSourceRect() {
  const sx = ((box.x - display.left) / display.w) * natural.w
  const sy = ((box.y - display.top) / display.h) * natural.h
  const sSize = (box.size / display.w) * natural.w
  return {
    sx: Math.max(0, sx),
    sy: Math.max(0, sy),
    sSize: Math.min(sSize, natural.w, natural.h),
  }
}

function drawPreview() {
  const canvas = previewRef.value
  const img = imgRef.value
  if (!canvas || !img || !natural.w) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { sx, sy, sSize } = cropSourceRect()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, canvas.width, canvas.height)
}

async function confirm() {
  const img = imgRef.value
  if (!img || !natural.w) return
  confirming.value = true
  try {
    const size = outputSize.value
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { sx, sy, sSize } = cropSourceRect()
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, size, size)

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    )
    if (!blob) {
      ElNotification({ type: 'error', title: '裁剪失败' })
      return
    }
    const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' })
    emit('confirm', file)
    visible.value = false
  } finally {
    confirming.value = false
  }
}

function onClosed() {
  confirming.value = false
  emit('closed')
}

watch(
  () => props.imageUrl,
  () => {
    nextTick(() => {
      if (imgRef.value?.complete) onImageLoad()
    })
  },
)

watch(visible, (open) => {
  if (!open) return
  nextTick(() => {
    // dialog 动画/布局完成后再量 stage，避免选框错位
    requestAnimationFrame(() => {
      if (imgRef.value?.complete) onImageLoad()
    })
  })
})

onMounted(() => {
  window.addEventListener('resize', layoutImage)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', layoutImage)
  window.removeEventListener('pointermove', onPointerMove)
})
</script>

<style scoped lang="less">
.crop-wrap {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.crop-stage {
  position: relative;
  width: 340px;
  height: 340px;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.crop-image {
  position: absolute;
  max-width: none;
  pointer-events: none;
}

.crop-box {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #68c6bd;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  cursor: move;
  touch-action: none;
}

.crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #68c6bd;
  border: 2px solid #fff;
  border-radius: 2px;
  box-sizing: border-box;

  &.nw {
    left: -6px;
    top: -6px;
    cursor: nwse-resize;
  }
  &.ne {
    right: -6px;
    top: -6px;
    cursor: nesw-resize;
  }
  &.sw {
    left: -6px;
    bottom: -6px;
    cursor: nesw-resize;
  }
  &.se {
    right: -6px;
    bottom: -6px;
    cursor: nwse-resize;
  }
}

.crop-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 120px;
}

.crop-preview-label {
  font-size: 13px;
  color: var(--font-color);
}

.crop-preview {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #222;
  box-shadow: 0 0 0 1px rgba(104, 198, 189, 0.35);
}

.crop-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--font-unactive-color);
  text-align: center;
}
</style>
