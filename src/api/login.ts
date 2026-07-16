import request from '@/common/request'
import type { ILogin, ILoginData, IRegister, IUserInfo } from './types'

/**
 * 登录接口
 * @param data username,password
 * @returns Promise
 */
export function login(data: ILogin) {
  return request.post<ILoginData>({
    url: '/auth/login',
    data,
  })
}

/**
 * 注册接口
 * @param data
 * @returns Promise
 */
export function register(data: IRegister) {
  return request.post({
    url: '/user/register',
    data,
  })
}

/**
 * GET 请求用户信息(查询单个用户)
 * @param userid
 * @returns Promise
 */
export function getUserInfo(userid: string) {
  return request.get<IUserInfo>({
    url: `/user/${userid}`,
  })
}

/**
 * 更新用户数据接口
 * @param user
 * @returns
 */
export function updateUserInfo(id: string, user: Partial<IUserInfo> & { password?: string }) {
  return request.patch<IUserInfo>({
    url: `/user/${id}`,
    data: user,
  })
}

//更新用户在线状态
export function updateUserStatus(id: string, status: number) {
  return request.patch({
    url: `/user/status/${id}`,
    data: { status },
  })
}

/**
 * 上传用户头像
 * multipart 字段名 file；勿手写 Content-Type，交给浏览器带 boundary
 */
export function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<IUserInfo>({
    url: '/user/avatar',
    data: formData,
  })
}
