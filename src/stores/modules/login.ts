import { getUserInfo, login, logout, refreshToken, updateUserInfo, uploadAvatar } from '@/api/login'
import { defineStore } from 'pinia'
import type { apiType } from '../types'
import localCache from '@/utils/cache'
import type { IUserInfo } from '@/api/types'

export const useLoginStore = defineStore('login', () => {
  const userInfo = ref<IUserInfo>()
  const token = ref('')
  const accessToken = ref('')
  const refreshTokenValue = ref('')

  function setUserInfo(data: IUserInfo) {
    userInfo.value = data
    localCache.setCache('userInfo', data)
  }

  async function loginAction(data: apiType.ILogin) {
    const loginData = await login(data)
    setTokens(loginData)

    // 优先用登录响应里的 user，兼容旧后端再请求一次
    if (loginData.user) {
      setUserInfo(loginData.user)
    } else {
      const userInfoData = await getUserInfo(loginData.user_id)
      setUserInfo(userInfoData)
    }
  }

  function setTokens(data: { token?: string; accessToken?: string; refreshToken?: string }) {
    const access = data.accessToken || data.token || ''
    token.value = access
    accessToken.value = access
    refreshTokenValue.value = data.refreshToken || ''
    localCache.setCache('token', access)
    if (data.refreshToken) localCache.setCache('refreshToken', data.refreshToken)
  }

  async function refreshAction() {
    const value = refreshTokenValue.value || localCache.getCache('refreshToken')
    if (!value) throw new Error('缺少 refreshToken')
    const data = await refreshToken(value)
    setTokens(data)
    return data
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
      accessToken.value = _token
    }
    refreshTokenValue.value = localCache.getCache('refreshToken') || ''
    const _userInfo = localCache.getCache('userInfo')
    if (_userInfo) {
      userInfo.value = _userInfo
    }
  }

  /** 仅清理本地登录态（401 失效、后端不可用时的兜底） */
  function logoutLocal() {
    token.value = ''
    accessToken.value = ''
    refreshTokenValue.value = ''
    userInfo.value = undefined
    localCache.delCache('token')
    localCache.delCache('refreshToken')
    localCache.delCache('userInfo')
  }

  /**
   * 主动登出：先让后端吊销 refreshToken（否则该 token 仍可换新 accessToken），
   * 后端不可用也保证本地登出成功。
   */
  async function logoutAction() {
    const value = refreshTokenValue.value || localCache.getCache('refreshToken')
    try {
      if (value) await logout(value)
    } catch {
      // 忽略：本地登出优先
    } finally {
      logoutLocal()
    }
  }

  return {
    token,
    accessToken,
    refreshToken: refreshTokenValue,
    userInfo,
    loginAction,
    loadLocalLogin,
    updateUserAction,
    uploadAvatarAction,
    setUserInfo,
    logoutLocal,
    logoutAction,
    refreshAction,
  }
})
