<template>
  <el-dialog
    v-model="dialogVisible"
    class="register-dialog"
    title="用户注册"
    center
    :close-on-click-modal="false"
  >
    <el-form
      ref="registerRef"
      label-position="left"
      class="register-form"
      :rules="loginRules"
      :model="registerForm"
    >
      <el-form-item prop="username">
        <el-input
          v-model="registerForm.username"
          prefix-icon="User"
          placeholder="请输入账号"
        ></el-input>
      </el-form-item>
      <el-form-item prop="nickname">
        <el-input
          v-model="registerForm.nickname"
          prefix-icon="UserFilled"
          placeholder="请输入昵称"
        ></el-input>
      </el-form-item>
      <el-form-item prop="password">
        <el-input
          v-model="registerForm.password"
          prefix-icon="Lock"
          :placeholder="PASSWORD_HINT"
          show-password
        ></el-input>
      </el-form-item>
      <el-button type="primary" :loading="registering" @click="registerClick"> 立即注册 </el-button>
    </el-form>
  </el-dialog>
</template>

<script setup lang="ts">
import { register } from '@/api/login'
import type { FormInstance } from 'element-plus'
import { PASSWORD_HINT, passwordRule } from '@/utils/password'

const dialogVisible = ref(false)

const registerRef = ref<FormInstance>()

const registerForm = ref({
  username: '',
  nickname: '',
  password: '',
})

//自定义校验规则
const loginRules = {
  username: [
    { required: true, trigger: 'blur', message: '请输入您的账号' },
    {
      pattern: /^[A-Za-z0-9]{3,10}$/,
      trigger: 'blur',
      message: '请输入3到10位字母或数字',
    },
  ],
  nickname: [
    { required: true, trigger: 'blur', message: '请输入您的昵称' },
    {
      pattern: /^[a-zA-Z0-9一-龥]{1,10}$/,
      message: '请输入正确的昵称',
      trigger: 'change',
    },
  ],
  password: [{ required: true, trigger: 'blur', message: '请输入您的密码' }, passwordRule(false)],
}

const registering = ref(false)
const registerClick = () => {
  registerRef.value?.validate(async (valid) => {
    if (!valid || registering.value) return
    registering.value = true
    try {
      await register(registerForm.value)
      ElNotification({
        type: 'success',
        title: '注册成功，请登录',
      })
      dialogVisible.value = false
    } catch {
      // 错误已由 axios 拦截器提示
    } finally {
      registering.value = false
    }
  })
}
defineExpose({
  dialogVisible,
})
</script>

<style lang="less">
@input-width: 300px;
@input-height: 35px;
// 因为对话框是使用Teleport渲染的，所以用在全局写样式
.register-dialog {
  width: 400px;
  background-color: var(--bg-color);
  border-radius: var(--df-radius);
  .el-dialog__title {
    font-weight: 700;
    color: #fff;
  }

  .register-form {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;

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
