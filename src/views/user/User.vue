<template>
  <div id="user" class="page">
    <template v-if="isLogin">
      <el-tabs v-model="activeName" class="user-tabs" @tab-change="onTabChange">
        <el-tab-pane label="基本资料" name="userinfo">
          <div class="avatar-preview">
            <el-avatar :size="72" :src="currentAvatar" />
            <span class="avatar-preview__label">当前头像</span>
          </div>
          <AppForm :form-item="userInfoItem"></AppForm>
          <el-button type="danger" @click="logoutClick">退出登录</el-button>
        </el-tab-pane>
        <el-tab-pane label="修改信息" name="update">
          <div class="avatar-upload">
            <el-avatar :size="72" :src="currentAvatar" />
            <div class="avatar-upload__actions">
              <el-upload
                :show-file-list="false"
                :auto-upload="false"
                accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                :disabled="uploading"
                :on-change="onAvatarChange"
              >
                <el-button type="primary" :loading="uploading">选择头像</el-button>
              </el-upload>
              <p class="avatar-upload__tip">
                支持 jpg / png / gif / webp（原图≤5MB）；裁剪后将上传为 JPEG 正方形头像
              </p>
            </div>
          </div>
          <AvatarCropDialog
            v-model="cropVisible"
            :image-url="cropImageUrl"
            @confirm="onCropConfirm"
            @closed="revokeCropUrl"
          />
          <AppForm ref="formRef" v-model="formData" :form-item="updateItem"></AppForm>
          <el-button type="primary" :loading="updating" @click="updateClick">确认修改</el-button>
        </el-tab-pane>
        <el-tab-pane label="我的追番" name="collection">
          <el-tabs v-model="collectTab" class="collect-tabs" @tab-change="loadCollection">
            <el-tab-pane label="想看" name="wish" />
            <el-tab-pane label="在看" name="watching" />
            <el-tab-pane label="看完" name="done" />
          </el-tabs>
          <div v-loading="userAnimeStore.loading" class="collect-grid">
            <div
              v-for="item in userAnimeStore.list"
              :key="item.id"
              class="collect-card"
              @click="goDetail(item.bangumi_id)"
            >
              <img
                class="collect-card__cover"
                :src="item.cover || defaultCover"
                :alt="item.name_cn || item.title || ''"
              />
              <div class="collect-card__body">
                <div class="collect-card__title">
                  {{ item.name_cn || item.title || `番剧 #${item.bangumi_id}` }}
                </div>
                <div class="collect-card__meta">
                  <span class="collect-card__tag">{{ userAnimeStore.labelOf(item.status) }}</span>
                  <el-button link type="danger" @click.stop="onCancel(item.bangumi_id)">
                    取消
                  </el-button>
                </div>
              </div>
            </div>
            <el-empty
              v-if="!userAnimeStore.loading && userAnimeStore.list.length === 0"
              description="还没有追番记录"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
    <template v-else>
      <h1>您还没有登录哦</h1>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useLoginStore } from '@/stores/modules/login'
import { useUserAnimeStore } from '@/stores/modules/userAnime'
import { updateUserStatus } from '@/api/login'
import type { IFormItem } from '@/components/AppForm/type'
import type { UserAnimeStatus } from '@/api/types'
import type { UploadFile } from 'element-plus'
import AppForm from '@/components/AppForm/AppForm.vue'
import { formatUtcString } from '@/utils/date-format'
import { PASSWORD_HINT, passwordRule } from '@/utils/password'
import { appConfirm } from '@/composables/useConfirm'
import { resolveAvatarUrl } from '@/utils/avatar'
import AvatarCropDialog from '@/components/AvatarCrop/AvatarCropDialog.vue'

const activeName = ref('userinfo')
const collectTab = ref<UserAnimeStatus>('wish')
const defaultCover = 'https://bgm.tv/img/no_icon_subject.png'
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

const loginStore = useLoginStore()
const userAnimeStore = useUserAnimeStore()
const router = useRouter()

const isLogin = computed(() => loginStore.token !== '')
const userInfo = computed(() => loginStore.userInfo)
const currentAvatar = computed(() => resolveAvatarUrl(userInfo.value?.avatar))
const uploading = ref(false)
const updating = ref(false)
const cropVisible = ref(false)
const cropImageUrl = ref('')

/** 释放本地预览 Object URL（幂等，可重复调用） */
function revokeCropUrl() {
  if (!cropImageUrl.value) return
  URL.revokeObjectURL(cropImageUrl.value)
  cropImageUrl.value = ''
}

const roleLabel = computed(() => {
  const role = userInfo.value?.role
  if (role === 'root') return '管理员'
  return '普通用户'
})

const userInfoItem = computed<IFormItem[]>(() => [
  {
    field: userInfo.value?.username || '',
    label: '用户名',
    type: 'text',
  },
  {
    field: userInfo.value?.nickname || '',
    label: '用户昵称',
    type: 'text',
  },
  {
    field: userInfo.value?.create_time
      ? formatUtcString(userInfo.value.create_time, 'YYYY-MM-DD')
      : '',
    label: '创建时间',
    type: 'text',
  },
  {
    field: roleLabel.value,
    label: '我的权限',
    type: 'text',
  },
])

const updateItem: IFormItem[] = [
  {
    field: 'nickname',
    label: '用户昵称',
    type: 'input',
    placeholder: '请输入昵称',
    rules: [
      { required: true, message: '昵称不能为空', trigger: 'blur' },
      {
        pattern: /^[a-zA-Z0-9一-龥]{1,10}$/,
        message: '请输入正确的昵称',
        trigger: 'change',
      },
    ],
  },
  {
    field: 'password',
    label: '新密码',
    type: 'password',
    placeholder: PASSWORD_HINT,
    rules: [
      { required: true, message: '请输入新密码', trigger: 'blur' },
      passwordRule(false),
    ],
  },
]

const logoutClick = async () => {
  if (!loginStore.userInfo) return
  const ok = await appConfirm({
    title: '退出登录',
    message: '确定要退出当前账号吗？',
    confirmText: '退出',
    type: 'danger',
  })
  if (!ok) return

  updateUserStatus(loginStore.userInfo.user_id, 0)
    .catch(() => undefined)
    .finally(() => {
      loginStore.logoutLocal()
      ElNotification({
        type: 'success',
        title: '退出成功',
      })
    })
}

const formData = ref({
  nickname: loginStore.userInfo?.nickname || '',
  password: '',
})
const formRef = ref<InstanceType<typeof AppForm>>()

const updateClick = () => {
  formRef.value?.elFormRef?.validate(async (valid: boolean) => {
    if (!valid || updating.value) return

    const ok = await appConfirm({
      title: '确认修改',
      message: '将更新昵称与密码，确定继续吗？',
      confirmText: '确认修改',
    })
    if (!ok) return

    const payload = {
      nickname: formData.value.nickname,
      password: formData.value.password,
    }

    updating.value = true
    try {
      await loginStore.updateUserAction(loginStore.userInfo!.user_id, payload)
      ElNotification({
        type: 'success',
        title: '更新成功',
      })
      formData.value.password = ''
    } catch {
      // 拦截器已提示
    } finally {
      updating.value = false
    }
  })
}

async function onAvatarChange(uploadFile: UploadFile) {
  const raw = uploadFile.raw
  if (!raw) return

  if (raw.size > MAX_AVATAR_SIZE) {
    ElNotification({ type: 'error', title: '图片不能超过 5MB' })
    return
  }

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (raw.type && !allowed.includes(raw.type)) {
    ElNotification({ type: 'error', title: '仅支持 jpg / png / gif / webp' })
    return
  }

  // 重新选择时先释放上一次本地预览
  revokeCropUrl()
  cropImageUrl.value = URL.createObjectURL(raw)
  cropVisible.value = true
}

async function onCropConfirm(file: File) {
  uploading.value = true
  try {
    await loginStore.uploadAvatarAction(file)
    ElNotification({ type: 'success', title: '头像上传成功' })
  } catch {
    // 错误已由 request 拦截器提示
  } finally {
    uploading.value = false
    // 上传结束（成功/失败）释放预览 URL；取消走 dialog @closed
    revokeCropUrl()
  }
}

function loadCollection() {
  if (!isLogin.value) return
  userAnimeStore.fetchList(collectTab.value)
}

function onTabChange(name: string | number) {
  if (name === 'collection') {
    loadCollection()
  }
  if (name === 'update' && userInfo.value?.nickname) {
    formData.value.nickname = userInfo.value.nickname
  }
}

function goDetail(id: number) {
  router.push(`/detail/${id}`)
}

async function onCancel(bangumiId: number) {
  const ok = await appConfirm({
    title: '取消追番',
    message: '确定从追番列表中移除这部作品吗？',
    confirmText: '取消追番',
    type: 'danger',
  })
  if (!ok) return
  await userAnimeStore.cancel(bangumiId)
  ElNotification({ type: 'success', title: '已取消追番' })
}
</script>

<style scoped lang="less">
@import '~styles/page';

:deep(.el-tabs__nav-wrap)::after {
  position: static !important;
}
:deep(.el-tabs__item) {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}
:deep(.el-tabs__item:hover) {
  color: var(--primary-color);
}
:deep(.is-active) {
  color: var(--primary-color);
}
:deep(.el-tabs__active-bar) {
  background-color: var(--primary-color);
}

.avatar-preview {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;

  &__label {
    font-size: 14px;
    color: var(--font-unactive-color);
  }
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.15);

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__tip {
    margin: 0;
    font-size: 12px;
    color: var(--font-unactive-color);
  }
}

.collect-tabs {
  margin-bottom: 12px;
  :deep(.el-tabs__item) {
    font-size: 15px;
  }
}

.collect-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  min-height: 120px;
}

.collect-card {
  display: flex;
  gap: 12px;
  padding: 10px;
  border-radius: 10px;
  background: var(--aside-bg-color);
  cursor: pointer;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 0 12px rgba(104, 198, 189, 0.15);
  }

  &__cover {
    width: 64px;
    height: 90px;
    object-fit: cover;
    border-radius: 6px;
    flex-shrink: 0;
    background: #111;
  }

  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__tag {
    font-size: 12px;
    color: var(--primary-color);
    border: 1px solid rgba(104, 198, 189, 0.4);
    border-radius: 10px;
    padding: 2px 8px;
  }
}
</style>
