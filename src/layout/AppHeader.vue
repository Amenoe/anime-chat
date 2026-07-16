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

const DEFAULT_AVATAR =
  'https://i0.hdslb.com/bfs/face/99c781c93f035e005d1ee89b03f9d1f33ef2b933.jpg'
const GUEST_AVATAR = 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'

const loginStore = useLoginStore()
const isLogin = computed(() => loginStore.token !== '')
// 响应式读 userInfo.avatar，上传头像后 Header 自动更新
const avatarUrl = computed(() => {
  if (!isLogin.value) return GUEST_AVATAR
  return loginStore.userInfo?.avatar || DEFAULT_AVATAR
})

//组件实例
const loginRef = ref<InstanceType<typeof LoginDialog>>()
const registerRef = ref<InstanceType<typeof LoginDialog>>()
const showDialog = () => {
  if (isLogin.value) {
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
