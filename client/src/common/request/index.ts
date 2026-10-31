import AxiosUtils from './axios-utils'

//创建请求实例
const request = new AxiosUtils({
  baseURL: import.meta.env.VITE_BASE_API,
  timeout: import.meta.env.VITE_TIME_OUT,
})

export default request
