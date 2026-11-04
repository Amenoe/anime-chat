import type { RouteLocationRaw, Router } from 'vue-router'

/**
 * 生成可分享的绝对链接。
 *
 * 复制链接在两个地方容易出错，所以统一收口到这里：
 * 1. 直接 `${origin}${base}${path}` 在 base 为 `/` 时会拼出 `http://host//room/x`，
 *    部分服务器/代理会把双斜杠当成另一个路径（甚至 301），链接就失效了；
 * 2. base 不带结尾斜杠（例如 `/app`）时，字符串拼接会得到 `/approom/x`。
 *
 * 这里让 URL 解析器负责折叠与规范化；`href` 由 vue-router 的
 * `router.resolve()` 产出（它知道 base），本函数只补 origin。
 */
export function absoluteShareUrl(href: string, origin = window.location.origin): string {
  // 先折叠开头的多个斜杠：`//evil.com/x` 传给 URL 会被当成协议相对地址，
  // 解析成另一个域名。站内链接永远从单个 `/` 开始。
  const path = `/${href.replace(/^\/+/, '')}`
  return new URL(path, origin).toString()
}

/** 生成某个路由的绝对分享链接（router 已处理 base，故开发环境会带上 `/dev/`） */
export function shareUrlOf(
  router: Router,
  to: RouteLocationRaw,
  origin = window.location.origin,
): string {
  return absoluteShareUrl(router.resolve(to).href, origin)
}

/**
 * 复制文本到剪贴板，返回是否成功。
 *
 * 不能只用 `navigator.clipboard`：它只在安全上下文可用（HTTPS 或 localhost），
 * 而线上是 `http://8.130.120.172`，非 localhost 的 http 页面里
 * `navigator.clipboard` 是 `undefined`，直接调用会抛 TypeError、连提示都没有
 * （2026-11-04 实测）。所以这里保留 `execCommand('copy')` 作为降级。
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  // 优先异步 Clipboard API：无临时 DOM、不打断用户当前选区
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限被拒 / 文档未聚焦（如 iframe）时继续走降级，而不是直接失败
    }
  }

  return copyTextWithExecCommand(text)
}

/** 兼容非安全上下文与老浏览器的兜底复制 */
function copyTextWithExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  // readonly 防止 iOS 弹出键盘；固定定位 + 透明避免页面跳动
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  // 记下用户原来的焦点与选区，复制完原样还回去
  const activeElement = document.activeElement as HTMLElement | null
  const selection = document.getSelection()
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  textarea.remove()
  if (savedRange && selection) {
    selection.removeAllRanges()
    selection.addRange(savedRange)
  }
  activeElement?.focus?.()
  return ok
}
