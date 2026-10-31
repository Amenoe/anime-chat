import { computed, ref } from 'vue'
import localCache from '@/utils/cache'

export type ThemeMode = 'dark' | 'light'

/** 与 index.html 首屏内联脚本、app.less 的 [data-theme] 选择器保持一致 */
const STORAGE_KEY = 'theme-mode'
const ATTR = 'data-theme'

/**
 * 读取初始主题。
 * index.html 的内联脚本已在首屏前置写入 data-theme（避免闪烁），
 * 因此优先以 DOM 上的值为准，其次才是本地缓存。
 */
function readInitialMode(): ThemeMode {
  if (typeof document === 'undefined') return 'dark'
  const fromDom = document.documentElement.getAttribute(ATTR)
  if (fromDom === 'light' || fromDom === 'dark') return fromDom
  const saved = localCache.getCache(STORAGE_KEY)
  return saved === 'light' ? 'light' : 'dark'
}

const mode = ref<ThemeMode>(readInitialMode())

function apply(next: ThemeMode) {
  mode.value = next
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(ATTR, next)
  }
  localCache.setCache(STORAGE_KEY, next)
}

/**
 * 全局主题：暗色（默认）/ 亮色。
 *
 * 颜色令牌定义在 src/assets/css/app.less 的 `:root, html[data-theme='dark']`
 * 与 `html[data-theme='light']` 两套里，本模块只负责切换 <html data-theme>。
 *
 * 默认保持暗色（与本项目既有视觉一致），不跟随系统偏好 —— 否则亮色系统用户
 * 首次进入会看到一个和高亮/封面图不搭的亮色界面。
 */
export function useTheme() {
  const isDark = computed(() => mode.value === 'dark')

  function toggleTheme() {
    apply(mode.value === 'dark' ? 'light' : 'dark')
  }

  /** app 挂载前调用：把内存状态同步到 <html>，保证两者一致 */
  function initTheme() {
    apply(mode.value)
  }

  return { mode, isDark, toggleTheme, initTheme }
}
