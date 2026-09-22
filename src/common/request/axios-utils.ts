import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import localCache from '@/utils/cache'

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuthRefresh?: boolean
    _authRetried?: boolean
  }
}

/** 并发 401 时只提示一次 */
let authExpiredNotifying = false

/**
 * 后端那些**没有信息量**的 401 文案：只说明「token 不行」，
 * 而前端自己的「登录已过期或无效，请重新登录」更友好也更准确。
 * 命中它们就当作没给文案，别把 `Unauthorized` 这种英文术语甩到用户脸上。
 */
const VAGUE_401_MESSAGES = new Set(['Unauthorized', 'token不正确'])

/**
 * 从各种形态的错误里尽力取后端给的中文文案。
 *
 * 拦截器 reject 的东西有两种形状（见下方两个分支）：
 *   - 业务码非 200：直接 reject `response.data`，即信封 `{ data, message, code }`
 *   - HTTP 非 2xx：reject axios 的 error，信封在 `error.response.data`
 * 两种都要吃得下，否则「账号已被禁用」这类文案会丢，退回成通用提示。
 */
function messageOf(payload: unknown): string {
  const pick = (v: unknown): string =>
    typeof v === 'string' && v && !VAGUE_401_MESSAGES.has(v) ? v : ''
  if (!payload || typeof payload !== 'object') return ''
  const direct = pick((payload as { message?: unknown }).message)
  if (direct) return direct
  const nested = (payload as { response?: { data?: { message?: unknown } } }).response?.data
    ?.message
  return pick(nested)
}

/**
 * token 失效：清 localStorage + pinia 登录态，提示重新登录。
 * 用动态 import 避免 request ↔ login store 循环依赖。
 *
 * `serverMessage` 是后端给的具体原因，**优先用它**。
 * 为什么必须带上：被封禁的账号打任何业务接口都会拿到 401，文案是
 * 「账号已被禁用：<原因>」。以前一律显示「登录已过期或无效」，
 * 被封的人会以为是掉登录，反复重登、反复重试，完全不知道发生了什么。
 */
function handleUnauthorized(serverMessage?: string) {
  localCache.delCache('token')
  localCache.delCache('refreshToken')
  localCache.delCache('userInfo')
  void import('@/stores/modules/login')
    .then(({ useLoginStore }) => {
      useLoginStore().logoutLocal()
    })
    .catch(() => undefined)

  // 并发 401 只提示一次：这段逻辑与文案来源无关，保持原样
  if (authExpiredNotifying) return
  authExpiredNotifying = true
  ElNotification({
    type: 'warning',
    title: '请重新登录',
    message: serverMessage || '登录已过期或无效，请重新登录',
  })
  window.setTimeout(() => {
    authExpiredNotifying = false
  }, 3000)
}

let refreshPromise: Promise<string> | null = null

/**
 * 用 refreshToken 换新 accessToken。
 * 统一走 login store 的 refreshAction（其内部带 skipAuthRefresh，不会递归刷新），
 * 这样 store 的 ref 与 localStorage 一起更新；并发 401 由 refreshPromise 合并为一次请求。
 * 动态 import 避免 request ↔ login store 循环依赖。
 */
function renewAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = import('@/stores/modules/login')
      .then(({ useLoginStore }) => useLoginStore().refreshAction())
      .then((data) => data.accessToken || data.token || '')
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export default class AxiosUtils {
  private instance: AxiosInstance
  constructor(config: AxiosRequestConfig) {
    this.instance = axios.create(config)
    this.requestInterceptor()
    this.responseInterceptor()
  }
  /**
   * 全局请求拦截器
   */
  private requestInterceptor() {
    if (this.instance === null) return
    this.instance.interceptors.request.use((request) => {
      const token = localCache.getCache('token')
      if (token) {
        if (request && request.headers) {
          request.headers.Authorization = `Bearer ${token}`
        }
      }
      // FormData 上传时删除手动 Content-Type，让浏览器自动带 boundary
      if (typeof FormData !== 'undefined' && request.data instanceof FormData) {
        if (request.headers) {
          // axios v1 headers 可能是 AxiosHeaders
          const headers: any = request.headers
          if (typeof headers.delete === 'function') {
            headers.delete('Content-Type')
            headers.delete('content-type')
          } else {
            delete headers['Content-Type']
            delete headers['content-type']
          }
        }
      }
      return request
    })
  }
  /**
   * 全局响应拦截器
   */
  private responseInterceptor() {
    if (this.instance === null) return
    this.instance.interceptors.response.use(
      (response) => {
        // 业务 code 非 200：提示并 reject，避免调用方当成成功
        // 部分网关/历史接口可能把 401 放在 body.code
        if (response.data?.code === 401) {
          // 与下面的 error 分支同理：内部请求（换 token / 登出）不负责通知用户
          const cfg = response.config as AxiosRequestConfig | undefined
          if (!cfg?.skipAuthRefresh) {
            handleUnauthorized(messageOf(response.data))
          }
          return Promise.reject(response.data)
        }
        if (response.data?.code != 200) {
          ElNotification({
            type: 'error',
            title: `请求错误 ${response.data?.code ?? ''}`,
            message: response.data?.message || '请求失败',
          })
          return Promise.reject(response.data)
        }
        return response.data.data
      },
      (error) => {
        const status = error.response?.status
        const payload = error.response?.data
        if (status === 401 || payload?.code === 401) {
          const request = error.config as
            | (AxiosRequestConfig & { _authRetried?: boolean })
            | undefined
          /*
           * `skipAuthRefresh` 标记的是**内部请求**（换 token / 登出），
           * 用户从来没有发起过它们，所以**不该由它们驱动用户可见的提示** ——
           * 真正该解释的原因是「用户那次请求为什么被挡下来」。
           *
           * 这条 early return 是踩出来的：换 token 的请求自己也会 401，
           * 它先弹了「登录状态异常，请重新登录」，而并发去重（3 秒内只提示一次）
           * 把紧接着 `renewAccessToken().catch()` 里那句更具体的
           * 「账号已被禁用：<原因>」挡掉了 —— 用户最终看到的是句没用的废话。
           * 外层 catch 一定会提示（`renewAccessToken()` 唯一的调用点就在下面），
           * 所以这里直接 reject 不会造成静默失败。
           */
          if (request?.skipAuthRefresh) {
            return Promise.reject(error)
          }
          if (request && !request._authRetried) {
            request._authRetried = true
            return renewAccessToken()
              .then((access) => {
                request.headers = request.headers || {}
                request.headers.Authorization = `Bearer ${access}`
                return this.instance.request(request)
              })
              .catch((refreshError) => {
                // 文案优先级：**原始 401 的解释 > 刷新失败的 401** ——
                // 原请求拿到的才是「你为什么被挡下来」（如「账号已被禁用：刷接口」），
                // 刷新失败通常只是它的副作用（会话已吊销 → 「登录状态异常」）。
                handleUnauthorized(
                  messageOf(payload) || messageOf(error) || messageOf(refreshError),
                )
                return Promise.reject(refreshError)
              })
          }
          handleUnauthorized(messageOf(payload) || messageOf(error))
          return Promise.reject(error)
        }
        if (status === 500) {
          ElNotification({
            type: 'error',
            title: `请求错误 ${status}`,
            message: '服务器出现问题，请稍等QAQ',
          })
        } else {
          ElNotification({
            type: 'error',
            title: `请求错误 ${payload?.code ?? status ?? ''}`,
            message: payload?.message || error.message || '网络异常',
          })
        }
        return Promise.reject(error)
      },
    )
  }

  get<T = any>(config: AxiosRequestConfig): Promise<T> {
    return this.instance.request({ ...config, method: 'GET' })
  }

  post<T = any>(config: AxiosRequestConfig): Promise<T> {
    return this.instance.request({ ...config, method: 'POST' })
  }

  patch<T = any>(config: AxiosRequestConfig): Promise<T> {
    return this.instance.request({ ...config, method: 'PATCH' })
  }

  put<T = any>(config: AxiosRequestConfig): Promise<T> {
    return this.instance.request({ ...config, method: 'PUT' })
  }

  delete<T = any>(config: AxiosRequestConfig): Promise<T> {
    return this.instance.request({ ...config, method: 'DELETE' })
  }
}
