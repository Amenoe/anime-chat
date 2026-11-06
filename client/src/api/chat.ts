import request from '@/common/request'

export type ChatMediaType = 'image' | 'audio'

export type ChatMediaUploadResult = {
  /** 站内路径：/api/chat/media/<uuid>.<ext> */
  url: string
  type: ChatMediaType
  size: number
}

/** 上传聊天图片/语音（multipart；axios 实例会自动去掉 Content-Type 让浏览器补 boundary） */
export function uploadChatMedia(file: Blob, filename: string) {
  const data = new FormData()
  data.append('file', file, filename)
  return request.post<ChatMediaUploadResult>({
    url: '/chat/media',
    data,
    timeout: 60000,
  })
}
