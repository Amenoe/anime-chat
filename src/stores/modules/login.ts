import { getUserInfo, login, updateUserInfo, uploadAvatar } from '@/api/login'
import { defineStore } from 'pinia'
import type { apiType } from '../types'
import localCache from '@/utils/cache'
import type { IUserInfo } from '@/api/types'

export const useLoginStore = defineStore('login', () => {
  const userInfo = ref<IUserInfo>()
  const token = ref('')

  function setUserInfo(data: IUserInfo) {
    userInfo.value = data
    localCache.setCache('userInfo', data)
  }

  async function loginAction(data: apiType.ILogin) {
    const loginData = await login(data)
    token.value = loginData.token
    localCache.setCache('token', loginData.token)

    // 优先用登录响应里的 user，兼容旧后端再请求一次
    if (loginData.user) {
      setUserInfo(loginData.user)
    } else {
      const userInfoData = await getUserInfo(loginData.user_id)
      setUserInfo(userInfoData)
    }
  }

  async function updateUserAction(id: string, data: Partial<IUserInfo> & { password?: string }) {
    const updateData = await updateUserInfo(id, data)
    setUserInfo(updateData)
  }

  async function uploadAvatarAction(file: File) {
    const data = await uploadAvatar(file)
    setUserInfo(data)
    return data
  }

  function loadLocalLogin() {
    const _token = localCache.getCache('token')
    if (_token) {
      token.value = _token
    }
    const _userInfo = localCache.getCache('userInfo')
    if (_userInfo) {
      userInfo.value = _userInfo
    }
  }

  function logoutLocal() {
    token.value = ''
    userInfo.value = undefined
    localCache.delCache('token')
    localCache.delCache('userInfo')
  }

  return {
    token,
    userInfo,
    loginAction,
    loadLocalLogin,
    updateUserAction,
    uploadAvatarAction,
    setUserInfo,
    logoutLocal,
  }
})
