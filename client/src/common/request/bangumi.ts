import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'

/**
 * Bangumi API 基址。
 *
 * 生产服务器/用户网络都无法直连 `api.bgm.tv`（DNS 污染 + SNI 封锁），
 * 所以生产走同源反代 `/api/bgm`（nginx → Cloudflare Pages → api.bgm.tv）；
 * 本地开发不配这个变量时仍然直连官方地址。
 */
const BANGUMI_BASE_URL =
  (import.meta.env.VITE_BANGUMI_BASE_URL as string | undefined)?.trim() || 'https://api.bgm.tv'

/**
 * 反代链路比直连慢且抖动大（跨境 + 反代，实测单次 2–30s），
 * 10s 会把「慢」直接判成「失败」。30s 与后端 anime-ai 的超时保持一致。
 */
const BANGUMI_TIMEOUT = Number(import.meta.env.VITE_BANGUMI_TIMEOUT || 30000)

/** 重试标记挂在 config 上，保证只重试一次 */
type RetryableConfig = InternalAxiosRequestConfig & { _bgmRetried?: boolean }

const bangumiRequest = axios.create({
  baseURL: BANGUMI_BASE_URL,
  timeout: BANGUMI_TIMEOUT,
  // 不在这里设 User-Agent：浏览器把 UA 视为禁止设置的头，控制台会一直报
  // `Refused to set unsafe header "User-Agent"`。生产由 nginx 反代补 UA
  // （`proxy_set_header User-Agent ...`），浏览器自带 UA 也满足 Bangumi 的要求。
})

/**
 * 反代是跨境链路，超时/5xx 是常态而非异常。
 * 这里对「超时、网络错误、5xx」重试一次：首页是多个并行请求，
 * 任何一个抖动都会让整屏空白，重试一次比让用户刷新页面便宜得多。
 */
function shouldRetry(error: AxiosError): boolean {
  const status = error.response?.status
  if (!status) return true // 网络错误 / 超时（浏览器里表现为无 response）
  return status >= 500
}

bangumiRequest.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined
    if (config && !config._bgmRetried && shouldRetry(error)) {
      config._bgmRetried = true
      await new Promise((resolve) => setTimeout(resolve, 600))
      // 重新走一遍请求与拦截器；返回值仍然是 response.data
      return bangumiRequest(config)
    }
    ElNotification({
      type: 'error',
      title: `Bangumi API 请求错误 ${error.response?.status ?? ''}`,
      message:
        (error.response?.data as { description?: string } | undefined)?.description ||
        error.message,
    })
    return Promise.reject(error)
  },
)

export default bangumiRequest
