<template>
  <el-dialog
    v-model="state.visible"
    class="app-confirm-dialog"
    :title="state.title"
    width="400px"
    align-center
    :close-on-click-modal="false"
    :append-to-body="true"
    @close="onClose"
  >
    <p class="app-confirm-dialog__msg">{{ state.message }}</p>
    <template #footer>
      <div class="app-confirm-dialog__footer">
        <el-button class="app-confirm-dialog__btn" @click="onCancel">
          {{ state.cancelText }}
        </el-button>
        <el-button
          class="app-confirm-dialog__btn"
          :type="state.type === 'danger' ? 'danger' : 'primary'"
          @click="onConfirm"
        >
          {{ state.confirmText }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { resolveConfirm, useConfirmState } from '@/composables/useConfirm'

const state = useConfirmState()

function onConfirm() {
  resolveConfirm(true)
}

function onCancel() {
  resolveConfirm(false)
}

function onClose() {
  // 点遮罩/X 视为取消
  if (state.resolve) {
    resolveConfirm(false)
  }
}
</script>

<style lang="less">
// Teleport 到 body，用全局 class
.app-confirm-dialog {
  background-color: var(--bg-color) !important;
  border-radius: 16px !important;
  border: 1px solid rgba(104, 198, 189, 0.18);

  .el-dialog__header {
    margin-right: 0;
    padding-bottom: 8px;
  }

  .el-dialog__title {
    color: var(--font-color);
    font-weight: 700;
    font-size: 16px;
  }

  .el-dialog__headerbtn .el-dialog__close {
    color: var(--font-unactive-color);

    &:hover {
      color: var(--primary-color);
    }
  }

  .el-dialog__body {
    padding-top: 8px;
    padding-bottom: 8px;
  }

  &__msg {
    margin: 0;
    color: var(--font-color);
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  &__btn {
    min-width: 88px;
  }
}
</style>
