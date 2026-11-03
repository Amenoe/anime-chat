/**
 * 把 Bangumi 的图片 URL 改写到反代域名。
 *
 * Bangumi 的封面/头像都挂在 `lain.bgm.tv`，和 API 一样在国内被 DNS 污染 + SNI 阻断，
 * 浏览器直连会加载失败。生产环境统一走同源反代 `/api/bgm-img`（nginx → Pages → lain.bgm.tv），
 * 反代同时负责把 `/r/200/pic/...` 这类缩略图路径还原成 `/pic/...`。
 *
 * 开发环境不配 `VITE_BANGUMI_IMAGE_BASE_URL` 时原样返回，行为和改动前一致。
 */
const IMAGE_BASE = ((import.meta.env.VITE_BANGUMI_IMAGE_BASE_URL as string | undefined) || '')
  .trim()
  .replace(/\/+$/, '')

/** 只改写 Bangumi 自己的图片域名，外链（例如用户头像的 MinIO 地址）保持原样 */
const BANGUMI_IMAGE_HOSTS = new Set(['lain.bgm.tv', 'bgm.tv', 'bangumi.tv', 'chii.in'])

export function bangumiImage(url?: string | null): string {
  if (!url) return ''
  if (!IMAGE_BASE) return url
  if (!/^https?:\/\//i.test(url)) return url
  try {
    const parsed = new URL(url)
    if (!BANGUMI_IMAGE_HOSTS.has(parsed.hostname)) return url
    return `${IMAGE_BASE}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}
