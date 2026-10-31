import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

/**
 * 模型输出的 Markdown 渲染 + 净化。
 *
 * 两处都是必须的，缺一不可：
 * - `html: false` 让 markdown-it 不解析原始 HTML 标签；
 * - 仍然要过 DOMPurify —— 链接协议（`javascript:`）等仍可能被利用，
 *   而这份 HTML 是要交给 `v-html` 的。
 *
 * `linkify` 便于模型直接给出网址；`breaks` 让单换行也成行，更接近聊天气泡的观感。
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

export function renderMarkdown(text: string): string {
  if (!text) return ''
  return DOMPurify.sanitize(md.render(text), { USE_PROFILES: { html: true } })
}
