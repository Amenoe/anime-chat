export type CompressImageOptions = {
  /** 最长边像素，超出则等比缩小 */
  maxSide?: number
  /** 初始 JPEG 质量 */
  quality?: number
  /** 目标体积（字节），超过会继续降质量/缩尺寸 */
  maxBytes?: number
}

const DEFAULTS: Required<CompressImageOptions> = {
  maxSide: 1280,
  quality: 0.82,
  maxBytes: 400 * 1024,
}

async function loadSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* 某些浏览器对 HEIC 等格式会失败，走 Image 兜底 */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

function draw(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('浏览器不支持图片压缩'))
  // JPEG 没有透明通道：先铺白底，避免 PNG 透明区变黑
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片压缩失败'))),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * 聊天图片压缩：等比缩到最长边 maxSide，再按目标体积逐级降质量。
 *
 * 输出统一 JPEG（GIF 动图会变成静态首帧，聊天里可接受），
 * 体积上限默认 400KB —— 单条消息只存 URL，图片本体走上传接口。
 */
export async function compressImage(file: File, options: CompressImageOptions = {}): Promise<Blob> {
  const { maxSide, quality, maxBytes } = { ...DEFAULTS, ...options }
  const source = await loadSource(file)
  const sourceWidth = source.width
  const sourceHeight = source.height
  if (!sourceWidth || !sourceHeight) {
    throw new Error('图片尺寸无效')
  }

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  let width = Math.max(1, Math.round(sourceWidth * scale))
  let height = Math.max(1, Math.round(sourceHeight * scale))
  let q = quality
  let blob = await draw(source, width, height, q)

  // 先降质量（对观感影响小于缩尺寸）
  while (blob.size > maxBytes && q > 0.5) {
    q = Math.max(0.5, q - 0.08)
    blob = await draw(source, width, height, q)
  }
  // 仍然超限再逐步缩尺寸
  while (blob.size > maxBytes && Math.max(width, height) > 640) {
    width = Math.max(1, Math.round(width * 0.85))
    height = Math.max(1, Math.round(height * 0.85))
    blob = await draw(source, width, height, q)
  }

  return blob
}
