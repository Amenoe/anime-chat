<template>
  <el-dialog
    v-model="dialogVisible"
    class="login-dialog"
    title="用户登录"
    center
    :close-on-click-modal="false"
  >
    <el-form
      ref="loginRef"
      label-position="left"
      class="login-form"
      :rules="loginRules"
      :model="loginForm"
    >
      <el-form-item prop="username">
        <el-input
          v-model="loginForm.username"
          prefix-icon="User"
          placeholder="请输入账号"
        ></el-input>
      </el-form-item>
      <el-form-item prop="password">
        <el-input
          v-model="loginForm.password"
          prefix-icon="Lock"
          placeholder="请输入密码"
          show-password
        ></el-input>
      </el-form-item>
      <el-button type="primary" :loading="loggingIn" @click="loginClick"> 立即登录 </el-button>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        还没有账号？<span class="register" @click="registerClick">点击注册</span>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useLoginStore } from '@/stores/modules/login'
import type { FormInstance } from 'element-plus'
const dialogVisible = ref(false)
const loginStore = useLoginStore()

const loginRef = ref<FormInstance>()

const loginForm = ref({
  username: '',
  password: '',
})

//自定义校验规则
const loginRules = {
  username: [
    //分别是：是否必须，提示信息，触发时机
    { required: true, trigger: 'blur', message: '请输入您的账号' },
    {
      pattern: /^[A-Za-z0-9]{3,10}$/,
      trigger: 'blur',
      message: '请输入3到10位字母或数字',
    },
  ],
  password: [{ required: true, trigger: 'blur', message: '请输入您的密码' }],
}

const loggingIn = ref(false)
// 登录事件
const loginClick = () => {
  loginRef.value?.validate(async (valid) => {
    if (!valid || loggingIn.value) return
    loggingIn.value = true
    try {
      await loginStore.loginAction(loginForm.value)
      dialogVisible.value = false
      ElNotification({
        type: 'success',
        title: '登录成功',
      })
    } catch {
      // 错误已由 axios 拦截器提示
    } finally {
      loggingIn.value = false
    }
  })
}
const emit = defineEmits(['goRegister'])

const registerClick = () => {
  dialogVisible.value = false
  emit('goRegister')
}

defineExpose({
  dialogVisible,
})
</script>

<style lang="less">
@input-width: 300px;
@input-height: 35px;
// 因为对话框是使用Teleport渲染的，所以用在全局写样式
.login-dialog {
  width: 400px;
  background-color: var(--bg-color);
  border-radius: var(--df-radius);
  .el-dialog__title {
    font-weight: 700;
    color: #fff;
  }

  // 登录框
  .login-form {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;

    //表单输入框
    .el-input {
      width: @input-width;
      height: @input-height;
    }

    .el-button {
      margin-top: 8px;
      width: @input-width;
      height: @input-height;
      margin-bottom: 8px;
    }
  }
}

.dialog-footer {
  .register {
    cursor: pointer;
    color: var(--primary-color);
  }
}
</style>
