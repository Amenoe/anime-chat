import axios from 'axios'

const bangumiRequest = axios.create({
  baseURL: 'https://api.bgm.tv',
  timeout: 10000,
  headers: {
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
