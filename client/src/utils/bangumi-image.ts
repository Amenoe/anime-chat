/**
 * 把 Bangumi 的图片 URL 改写到反代域名。
 *
 * Bangumi 的封面/头像都挂在 `lain.bgm.tv`，和 API 一样在国内被 DNS 污染 + SNI 阻断，
 * 浏览器直连会加载失败。生产环境统一走同源反代 `/api/bgm-img`（nginx → Pages → lain.bgm.tv）。
 *
 * `bangumiImage` 用于列表缩略图：Bangumi 的 `/pic/...` 是原图（约 700×1000），
 * 这里统一补 `/r/200` 前缀，nginx 反转成 `/pic/...` 后缩放到 240 宽再缓存，
 * 避免每日放送上百张原图把首屏拖死。详情页大头图用 `bangumiOriginal`，不补缩略图前缀。
 *
 * 开发环境不配 `VITE_BANGUMI_IMAGE_BASE_URL` 时原样返回，行为和改动前一致。
 */
const IMAGE_BASE = ((import.meta.env.VITE_BANGUMI_IMAGE_BASE_URL as string | undefined) || '')
  .trim()
  .replace(/\/+$/, '')

/** 只改写 Bangumi 自己的图片域名，外链（例如用户头像的 MinIO 地址）保持原样 */
const BANGUMI_IMAGE_HOSTS = new Set(['lain.bgm.tv', 'bgm.tv', 'bangumi.tv', 'chii.in'])

function mapToProxy(url: string | null | undefined, thumbWidth?: number): string {
  if (!url) return ''
  if (!IMAGE_BASE) return url
  if (!/^https?:\/\//i.test(url)) return url
  try {
    const parsed = new URL(url)
    if (!BANGUMI_IMAGE_HOSTS.has(parsed.hostname)) return url
    // 已经是 /r/200/ 这类带尺寸的路径就原样保留
    if (thumbWidth && /^\/r\/\d+\//.test(parsed.pathname)) {
      return `${IMAGE_BASE}${parsed.pathname}${parsed.search}`
    }
    // 原图 /pic/... 补上缩略图前缀，交给 nginx 缩放
    if (thumbWidth && parsed.pathname.startsWith('/pic/')) {
      return `${IMAGE_BASE}/r/${thumbWidth}${parsed.pathname}${parsed.search}`
    }
    return `${IMAGE_BASE}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/** 列表封面：自动改走缩略图（默认 200 宽，nginx 会缩放到 240 再缓存） */
export function bangumiImage(url?: string | null, thumbWidth = 200): string {
  return mapToProxy(url, thumbWidth)
}

/** 详情页大头图：保留原图，不做缩略图 */
export function bangumiOriginal(url?: string | null): string {
  return mapToProxy(url)
}
