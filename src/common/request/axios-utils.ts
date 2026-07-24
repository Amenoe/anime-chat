import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import localCache from '@/utils/cache'

/** 并发 401 时只提示一次 */
let authExpiredNotifying = false

/**
 * token 失效：清 localStorage + pinia 登录态，提示重新登录。
 * 用动态 import 避免 request ↔ login store 循环依赖。
 */
function handleUnauthorized() {
  localCache.delCache('token')
  localCache.delCache('userInfo')
  void import('@/stores/modules/login')
    .then(({ useLoginStore }) => {
      useLoginStore().logoutLocal()
    })
    .catch(() => undefined)

  if (authExpiredNotifying) return
  authExpiredNotifying = true
  ElNotification({
    type: 'warning',
    title: '请重新登录',
    message: '登录已过期或无效，请重新登录',
  })
  window.setTimeout(() => {
    authExpiredNotifying = false
  }, 3000)
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
          handleUnauthorized()
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
          handleUnauthorized()
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
