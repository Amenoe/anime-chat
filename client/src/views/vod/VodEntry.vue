<template>
  <div class="page vod-entry">
    <div class="vod-entry__card">
      <h2 class="vod-entry__title">点播室</h2>
      <p class="vod-entry__desc">
        建一个自己的点播室，把邀请链接发给朋友：房主选源、所有人同步观看，右边是房间聊天。
        没有弹幕，也不绑定番剧 —— 想临时一起看点什么就用它。
      </p>

      <template v-if="!isLogin">
        <el-button type="primary" @click="$router.push('/user')">去登录</el-button>
      </template>
      <template v-else>
        <div class="vod-entry__row">
          <el-input
            v-model="roomName"
            maxlength="40"
            placeholder="房间名（可选，默认「我的点播室」）"
          />
          <el-button type="primary" :loading="creating" @click="create">创建点播室</el-button>
        </div>

        <div class="vod-entry__divider"><span>或加入别人的房间</span></div>

        <div class="vod-entry__row">
          <el-input
            v-model="joinInput"
            placeholder="粘贴邀请链接，或输入房间号"
            @keyup.enter="join"
          />
          <el-button :loading="joining" @click="join">加入</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLoginStore } from '@/stores/modules/login'
import { createVodRoom } from '@/api/room'

const router = useRouter()
const loginStore = useLoginStore()

const isLogin = computed(() => !!loginStore.token)
const roomName = ref('')
const joinInput = ref('')
const creating = ref(false)
const joining = ref(false)

async function create() {
  if (!isLogin.value) return
  creating.value = true
  try {
    const defaultName = loginStore.userInfo?.nickname
      ? `${loginStore.userInfo.nickname} 的点播室`
      : '我的点播室'
    const room = await createVodRoom(roomName.value.trim() || defaultName)
    roomName.value = ''
    router.push(`/vod/${room.season_id}`)
  } catch (e: any) {
    ElNotification({
      type: 'error',
      title: '创建失败',
      message: e?.message || '请稍后重试',
    })
  } finally {
    creating.value = false
  }
}

/** 支持整条邀请链接，也支持只贴房间号 */
function parseSeasonId(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  const fromUrl = /\/vod\/([A-Za-z0-9]+)/.exec(text)?.[1]
  const candidate = fromUrl || text.replace(/[?#].*$/, '').trim()
  return /^[A-Za-z0-9]{6,32}$/.test(candidate) ? candidate : ''
}

function join() {
  if (!isLogin.value) return
  const seasonId = parseSeasonId(joinInput.value)
  if (!seasonId) {
    ElNotification({
      type: 'warning',
      title: '房间号无效',
      message: '粘贴房主给你的邀请链接，或输入房间号',
    })
    return
  }
  joining.value = true
  router.push(`/vod/${seasonId}`)
}
</script>

<style scoped lang="less">
@import '~styles/page';

.vod-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;

  &__card {
    width: 100%;
    max-width: 520px;
    padding: 28px 26px;
    border-radius: 14px;
    background: var(--aside-bg-color);
    border: 1px solid rgba(104, 198, 189, 0.18);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  }

  &__title {
    margin: 0 0 10px;
    font-size: 22px;
    padding-left: 10px;
    border-left: 4px solid var(--primary-color);
  }

  &__desc {
    margin: 0 0 22px;
    font-size: 13px;
    line-height: 1.8;
    color: var(--font-unactive-color);
  }

  &__row {
    display: flex;
    gap: 10px;
    align-items: center;

    :deep(.el-input) {
      flex: 1;
    }
  }

  &__divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 16px 0;
    font-size: 12px;
    color: var(--font-unactive-color);

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(104, 198, 189, 0.18);
    }
  }
}

@media (max-width: 768px) {
  .vod-entry__row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
