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
        <el-tab-pane label="数据源" name="sources">
          <div class="source-add">
            <el-input
              v-model="sourceUrl"
              clearable
              placeholder="订阅 URL"
              @keyup.enter="onAddSource"
            />
            <el-input
              v-model="sourceName"
              clearable
              class="source-add__name"
              placeholder="名称"
              @keyup.enter="onAddSource"
            />
            <el-button type="primary" :loading="sourceSaving" @click="onAddSource">添加</el-button>
          </div>

          <div class="source-section-head">
            <span>订阅</span>
          </div>
          <div v-loading="sourceLoading" class="source-list">
            <div
              v-for="(s, index) in sources"
              :key="s.id"
              class="source-row"
              draggable="true"
              @dragstart="onSubDragStart(index)"
              @dragover.prevent
              @drop="onSubDrop(index)"
            >
              <span class="source-row__handle" title="拖动排序">⋮⋮</span>
              <el-avatar :size="40" :src="sourceIcon(s)" class="source-row__avatar">
                {{ (s.name || '源').slice(0, 1) }}
              </el-avatar>
              <div class="source-row__main">
                <div class="source-row__title">
                  <span class="source-row__kind">{{ kindLabel(s.kind) }}</span>
                  <span class="source-row__name">{{ s.name }}</span>
                </div>
                <div class="source-row__url" :title="s.url">{{ s.url }}</div>
              </div>
              <div class="source-row__actions">
                <el-switch
                  :model-value="!!s.enabled"
                  size="small"
                  @change="(v: string | number | boolean) => onToggleSource(s.id, !!v)"
                />
                <el-button link type="primary" @click="openEditSource(s)">编辑</el-button>
                <el-button link type="danger" @click="onRemoveSource(s.id)">删除</el-button>
              </div>
            </div>
            <el-empty v-if="!sourceLoading && sources.length === 0" description="暂无订阅" />
          </div>

          <div class="source-catalog">
            <div class="source-section-head">
              <span>站点</span>
              <el-button link type="primary" :loading="catalogLoading" @click="loadCatalog(true)">
                刷新
              </el-button>
            </div>
            <div v-loading="catalogLoading" class="source-list">
              <div
                v-for="(e, index) in catalogView"
                :key="e.key"
                class="source-row source-row--child"
                :class="{ 'source-row--off': !isSiteEnabled(e.key) }"
                draggable="true"
                @dragstart="onSiteDragStart(index)"
                @dragover.prevent
                @drop="onSiteDrop(index)"
              >
                <span class="source-row__handle" title="拖动排序">⋮⋮</span>
                <el-avatar :size="36" :src="e.iconUrl || undefined" class="source-row__avatar">
                  {{ (e.name || '?').slice(0, 1) }}
                </el-avatar>
                <div class="source-row__main">
                  <div class="source-row__title">
                    <span class="source-row__kind">{{ e.factoryId === 'rss' ? 'BT' : '流' }}</span>
                    <span class="source-row__name">{{ displaySiteName(e) }}</span>
                  </div>
                  <div class="source-row__url" :title="e.searchUrl || e.subscriptionUrl">
                    {{ e.searchUrl || e.subscriptionUrl }}
                  </div>
                </div>
                <div class="source-row__actions">
                  <el-switch
                    :model-value="isSiteEnabled(e.key)"
                    size="small"
                    @change="(v: string | number | boolean) => onToggleSite(e.key, !!v)"
                  />
                  <el-button link type="primary" @click="openEditSite(e)">编辑</el-button>
                  <el-button link type="danger" @click="onRemoveSite(e.key)">删除</el-button>
                </div>
              </div>
              <el-empty v-if="!catalogLoading && catalogView.length === 0" description="暂无站点" />
            </div>
          </div>

          <el-dialog
            v-model="editVisible"
            title="编辑订阅"
            width="480px"
            destroy-on-close
            @closed="resetEdit"
          >
            <el-form label-position="top">
              <el-form-item label="名称">
                <el-input v-model="editForm.name" maxlength="128" show-word-limit />
              </el-form-item>
              <el-form-item label="地址">
                <el-input v-model="editForm.url" type="textarea" :rows="2" />
              </el-form-item>
              <el-form-item label="启用">
                <el-switch v-model="editForm.enabled" />
              </el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="editVisible = false">取消</el-button>
              <el-button type="primary" :loading="editSaving" @click="onSaveEdit">保存</el-button>
            </template>
          </el-dialog>

          <el-dialog
            v-model="siteEditVisible"
            title="编辑站点"
            width="400px"
            destroy-on-close
            @closed="resetSiteEdit"
          >
            <el-form label-position="top">
              <el-form-item label="名称">
                <el-input v-model="siteEditForm.name" maxlength="128" />
              </el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="siteEditVisible = false">取消</el-button>
              <el-button type="primary" @click="onSaveSiteEdit">保存</el-button>
            </template>
          </el-dialog>
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
import {
  addMediaSource,
  listMediaSourceCatalog,
  listMediaSources,
  removeMediaSource,
  reorderMediaSources,
  updateMediaSource,
  type MediaCatalogEntry,
  type MediaSourceItem,
} from '@/api/media-source'
import {
  applyCatalogPrefs,
  clearCatalogCache,
  isCatalogEnabled,
  loadCatalogCache,
  loadCatalogPrefs,
  saveCatalogCache,
  saveCatalogPrefs,
  type CatalogPrefs,
} from '@/utils/media-catalog-cache'
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

const sources = ref<MediaSourceItem[]>([])
const sourceLoading = ref(false)
const sourceSaving = ref(false)
const sourceUrl = ref('')
const sourceName = ref('')
const catalogRaw = ref<MediaCatalogEntry[]>([])
const catalogPrefs = ref<CatalogPrefs>(loadCatalogPrefs())
const catalogLoading = ref(false)
const editVisible = ref(false)
const editSaving = ref(false)
const editId = ref('')
const editForm = ref({ name: '', url: '', enabled: true })
const siteEditVisible = ref(false)
const siteEditKey = ref('')
const siteEditForm = ref({ name: '' })
let subDragFrom = -1
let siteDragFrom = -1

const catalogView = computed(() => applyCatalogPrefs(catalogRaw.value, catalogPrefs.value))

const defaultSourceIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="#2f3042" width="40" height="40" rx="8"/><text x="50%" y="54%" fill="#68c6bd" font-size="16" text-anchor="middle" dominant-baseline="middle">源</text></svg>`,
  )

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
    rules: [{ required: true, message: '请输入新密码', trigger: 'blur' }, passwordRule(false)],
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

async function loadSources() {
  if (!isLogin.value) return
  sourceLoading.value = true
  try {
    sources.value = (await listMediaSources()) || []
  } catch {
    sources.value = []
  } finally {
    sourceLoading.value = false
  }
}

function kindLabel(kind: string) {
  if (kind === 'rss') return 'BT'
  if (kind === 'web') return '流'
  return '混合'
}

function sourceIcon(s: MediaSourceItem) {
  if (s.kind === 'rss') return 'https://nyaa.land/static/favicon.png'
  if (s.url.includes('css1')) {
    return 'https://enlienli.link/upload/mxprocms/20230707-1/49f4b8a7fd5cbf77ffcfa7a52e755675.gif'
  }
  return defaultSourceIcon
}

function persistPrefs() {
  saveCatalogPrefs(catalogPrefs.value)
}

function isSiteEnabled(key: string) {
  return isCatalogEnabled(key, catalogPrefs.value)
}

function displaySiteName(e: MediaCatalogEntry) {
  return catalogPrefs.value.names[e.key] || e.name
}

/** force=true 跳过 localStorage 重新拉网 */
async function loadCatalog(force = false) {
  catalogLoading.value = true
  try {
    if (!force) {
      const cached = loadCatalogCache()
      if (cached?.length) {
        catalogRaw.value = cached
        catalogPrefs.value = loadCatalogPrefs()
        return
      }
    }
    const res = await listMediaSourceCatalog()
    catalogRaw.value = res?.entries || []
    if (catalogRaw.value.length) saveCatalogCache(catalogRaw.value)
    catalogPrefs.value = loadCatalogPrefs()
    await loadSources()
  } catch {
    if (!catalogRaw.value.length) catalogRaw.value = []
  } finally {
    catalogLoading.value = false
  }
}

async function onAddSource() {
  const url = sourceUrl.value.trim()
  if (!url) return
  sourceSaving.value = true
  try {
    await addMediaSource({
      url,
      name: sourceName.value.trim() || undefined,
    })
    sourceUrl.value = ''
    sourceName.value = ''
    clearCatalogCache()
    await loadSources()
    await loadCatalog(true)
  } catch {
    /* interceptor */
  } finally {
    sourceSaving.value = false
  }
}

async function onToggleSource(id: string, enabled: boolean) {
  try {
    await updateMediaSource(id, { enabled })
    clearCatalogCache()
    await loadSources()
    await loadCatalog(true)
  } catch {
    /* interceptor */
  }
}

function openEditSource(s: MediaSourceItem) {
  editId.value = s.id
  editForm.value = {
    name: s.name,
    url: s.url,
    enabled: !!s.enabled,
  }
  editVisible.value = true
}

function resetEdit() {
  editId.value = ''
  editForm.value = { name: '', url: '', enabled: true }
}

async function onSaveEdit() {
  if (!editId.value) return
  const name = editForm.value.name.trim()
  const url = editForm.value.url.trim()
  if (!url) return
  editSaving.value = true
  try {
    await updateMediaSource(editId.value, {
      name: name || url,
      url,
      enabled: editForm.value.enabled,
    })
    editVisible.value = false
    clearCatalogCache()
    await loadSources()
    await loadCatalog(true)
  } catch {
    /* interceptor */
  } finally {
    editSaving.value = false
  }
}

async function onRemoveSource(id: string) {
  const ok = await appConfirm({
    title: '删除订阅',
    message: '确定删除？',
    confirmText: '删除',
    type: 'danger',
  })
  if (!ok) return
  try {
    await removeMediaSource(id)
    clearCatalogCache()
    await loadSources()
    await loadCatalog(true)
  } catch {
    /* interceptor */
  }
}

function onSubDragStart(index: number) {
  subDragFrom = index
}

async function onSubDrop(to: number) {
  const from = subDragFrom
  subDragFrom = -1
  if (from < 0 || from === to) return
  const list = [...sources.value]
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  sources.value = list
  try {
    await reorderMediaSources(list.map((s) => s.id))
  } catch {
    await loadSources()
  }
}

function onToggleSite(key: string, enabled: boolean) {
  catalogPrefs.value = {
    ...catalogPrefs.value,
    enabled: { ...catalogPrefs.value.enabled, [key]: enabled },
  }
  persistPrefs()
}

function openEditSite(e: MediaCatalogEntry) {
  siteEditKey.value = e.key
  siteEditForm.value = { name: displaySiteName(e) }
  siteEditVisible.value = true
}

function resetSiteEdit() {
  siteEditKey.value = ''
  siteEditForm.value = { name: '' }
}

function onSaveSiteEdit() {
  const key = siteEditKey.value
  const name = siteEditForm.value.name.trim()
  if (!key || !name) return
  catalogPrefs.value = {
    ...catalogPrefs.value,
    names: { ...catalogPrefs.value.names, [key]: name },
  }
  persistPrefs()
  siteEditVisible.value = false
}

function onRemoveSite(key: string) {
  // 本地隐藏：标记禁用并从排序去掉（不改远端订阅）
  const order = catalogPrefs.value.order.filter((k) => k !== key)
  const enabled = { ...catalogPrefs.value.enabled, [key]: false }
  catalogPrefs.value = { ...catalogPrefs.value, order, enabled }
  persistPrefs()
}

function onSiteDragStart(index: number) {
  siteDragFrom = index
}

function onSiteDrop(to: number) {
  const from = siteDragFrom
  siteDragFrom = -1
  if (from < 0 || from === to) return
  const list = [...catalogView.value]
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  catalogPrefs.value = {
    ...catalogPrefs.value,
    order: list.map((e) => e.key),
  }
  persistPrefs()
}

function onTabChange(name: string | number) {
  if (name === 'collection') {
    loadCollection()
  }
  if (name === 'sources') {
    loadSources().then(() => loadCatalog(false))
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

.source-add {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
  align-items: center;

  .el-input {
    flex: 1;
    min-width: 200px;
  }

  &__name {
    flex: 0 0 140px;
    min-width: 100px;
  }
}

.source-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 10px;
  font-size: 15px;
  font-weight: 600;
  border-left: 4px solid var(--primary-color);
  padding-left: 10px;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 48px;
}

.source-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--aside-bg-color);
  border: 1px solid rgba(104, 198, 189, 0.12);
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  &--child {
    background: rgba(47, 48, 66, 0.65);
  }

  &--off {
    opacity: 0.5;
  }

  &__handle {
    flex-shrink: 0;
    width: 16px;
    color: var(--font-unactive-color);
    letter-spacing: -2px;
    user-select: none;
    font-size: 12px;
  }

  &__avatar {
    flex-shrink: 0;
    background: #1e1d2b;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }

  &__kind {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
    border: 1px solid rgba(104, 198, 189, 0.4);
    border-radius: 6px;
    padding: 1px 6px;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__url {
    margin-top: 4px;
    font-size: 12px;
    color: var(--font-unactive-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
}

.source-catalog {
  margin-top: 22px;
}
</style>
