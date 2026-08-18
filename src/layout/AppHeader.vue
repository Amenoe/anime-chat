<template>
  <div class="app-header">
    <div class="app-header_user">
      <el-avatar :class="{ avatar: !isLogin }" :size="28" :src="avatarUrl" @click="showDialog" />
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

const GUEST_AVATAR = 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'

const loginStore = useLoginStore()
const { guardLeaveRoom } = useLeaveRoomGuard()
const isLogin = computed(() => loginStore.token !== '')
// 响应式读 userInfo.avatar；空值回落到默认头像
const avatarUrl = computed(() => {
  if (!isLogin.value) return GUEST_AVATAR
  return resolveAvatarUrl(loginStore.userInfo?.avatar)
})

//组件实例
const loginRef = ref<InstanceType<typeof LoginDialog>>()
const registerRef = ref<InstanceType<typeof LoginDialog>>()
const showDialog = async () => {
  if (isLogin.value) {
    const ok = await guardLeaveRoom()
    if (!ok) return
    router.push('/user')
  } else {
    loginRef.value!.dialogVisible = true
  }
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
      border: solid 2px rgba(0, 0, 0, 0);
    }
    .avatar:hover {
      border: solid 2px var(--primary-color);
    }
  }
}
</style>
