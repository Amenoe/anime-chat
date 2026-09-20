<template>
  <div class="app-header">
    <div class="app-header_user">
      <!-- 已登录：点头像出下拉菜单（个人中心各分区 + 主题切换），不再直接跳转 -->
      <el-dropdown v-if="isLogin" trigger="click" placement="bottom-end" @command="onMenuCommand">
        <el-avatar class="avatar" :size="28" :src="avatarUrl" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="item in MENU_ITEMS" :key="item.tab" :command="item.tab">
              <el-icon><component :is="item.icon" /></el-icon>
              {{ item.label }}
            </el-dropdown-item>
            <el-dropdown-item divided command="theme">
              <el-icon>
                <Sunny v-if="isDark" />
                <Moon v-else />
              </el-icon>
              切换为{{ isDark ? '亮色' : '暗色' }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 未登录：点头像弹登录框 -->
      <el-avatar v-else class="avatar" :size="28" :src="avatarUrl" @click="showLoginDialog" />
      <LoginDialog ref="loginRef" @go-register="showRegisterDialog"></LoginDialog>
      <RegisterDialog ref="registerRef"></RegisterDialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import LoginDialog from '@/components/Login/LoginDialog.vue'
import RegisterDialog from '@/components/Login/RegisterDialog.vue'
import router from '@/router'
import { useLoginStore } from '@/stores/modules/login'
import { resolveAvatarUrl } from '@/utils/avatar'
import { useLeaveRoomGuard } from '@/composables/useLeaveRoomGuard'
import { useTheme } from '@/composables/useTheme'
import { Connection, Edit, Star, User } from '@element-plus/icons-vue'

const GUEST_AVATAR = 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'

/** 与个人中心的 Tab 一一对应；User.vue 通过 ?tab= 接收 */
const MENU_ITEMS = [
  { tab: 'userinfo', label: '基本资料', icon: User },
  { tab: 'update', label: '修改信息', icon: Edit },
  { tab: 'collection', label: '我的追番', icon: Star },
  { tab: 'sources', label: '数据源', icon: Connection },
]

const loginStore = useLoginStore()
const { guardLeaveRoom } = useLeaveRoomGuard()
const { isDark, toggleTheme } = useTheme()

const isLogin = computed(() => loginStore.token !== '')
// 响应式读 userInfo.avatar；空值回落到默认头像
const avatarUrl = computed(() => {
  if (!isLogin.value) return GUEST_AVATAR
  return resolveAvatarUrl(loginStore.userInfo?.avatar)
})

//组件实例
const loginRef = ref<InstanceType<typeof LoginDialog>>()
const registerRef = ref<InstanceType<typeof LoginDialog>>()

/** 进入个人中心指定分区；在放映室中先过一次离开确认 */
async function goUserTab(tab: string) {
  const ok = await guardLeaveRoom()
  if (!ok) return
  router.push({ path: '/user', query: { tab } })
}

function onMenuCommand(command: string | number | object) {
  if (command === 'theme') {
    toggleTheme()
    return
  }
  void goUserTab(String(command))
}

const showLoginDialog = () => {
  loginRef.value!.dialogVisible = true
}

const showRegisterDialog = () => {
  registerRef.value!.dialogVisible = true
}
</script>

<style scoped lang="less">
@base-margin: 40px;
@base-height: 28px;
.app-header {
  position: fixed;
  right: @base-margin;
  top: calc((@base-margin - @base-height) / 2);
  display: flex;
  align-items: center;
  z-index: 10;
  &_user {
    .avatar {
      cursor: pointer;
      border: solid 2px rgba(0, 0, 0, 0);
    }
    .avatar:hover {
      border: solid 2px var(--primary-color);
    }
  }
}
</style>
