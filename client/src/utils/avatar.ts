/** 未设置头像时的默认图 */
export const DEFAULT_AVATAR =
  'https://i0.hdslb.com/bfs/face/99c781c93f035e005d1ee89b03f9d1f33ef2b933.jpg'

/**
 * 展示用头像地址。
 * 后端返回可访问路径（如 /api/images/avatars/xxx）；空值用默认图。
 */
export function resolveAvatarUrl(src?: string | null): string {
  const raw = (src || '').trim()
  return raw || DEFAULT_AVATAR
}
