import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import localCache from '@/utils/cache'

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

  delete<T = any>(config: AxiosRequestConfig): Promise<T> {
    return this.instance.request({ ...config, method: 'DELETE' })
  }
}
