import axios from 'axios'

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

const bangumiRequest = axios.create({
  baseURL: BANGUMI_BASE_URL,
  timeout: BANGUMI_TIMEOUT,
  headers: {
    // 浏览器会忽略这个头（受限头）；真正生效的是 nginx 转发时补的 User-Agent
    'User-Agent': 'anime-chat/1.0 (https://github.com/Amenoe/anime-chat)',
  },
})

bangumiRequest.interceptors.response.use(
  (response) => response.data,
  (error) => {
    ElNotification({
      type: 'error',
      title: `Bangumi API 请求错误 ${error.response?.status ?? ''}`,
      message: error.response?.data?.description || error.message,
    })
    return Promise.reject(error)
  },
)

export default bangumiRequest
