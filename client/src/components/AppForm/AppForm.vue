<template>
  <div class="app-form">
    <el-form ref="elFormRef" :model="formData" label-width="100px" label-position="left">
      <template v-for="item in formItem" :key="item.label">
        <el-form-item
          v-if="!item.isHidden"
          :label="item.label"
          :rules="item.rules"
          :prop="item.field"
          class="form-item"
        >
          <template v-if="item.type === 'text'">
            <span>{{ item.field }}</span>
          </template>

          <template v-if="item.type === 'input' || item.type === 'password'">
            <el-input
              v-bind="item.otherOptions"
              v-model="formData[item.field]"
              :placeholder="item.placeholder"
              :show-password="item.type === 'password'"
            ></el-input>
          </template>
          <template v-else-if="item.type === 'select'">
            <el-select
              v-bind="item.otherOptions"
              v-model="formData[item.field]"
              :placeholder="item.placeholder"
              style="width: 100%"
            >
              <el-option
                v-for="option in item.options"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              ></el-option>
            </el-select>
          </template>
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { IFormItem } from './type'
import type { FormInstance } from 'element-plus'
const props = defineProps({
  modelValue: {
    type: Object,
    default: () => {},
  },
  formItem: {
    type: Array as PropType<IFormItem[]>,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])
//formItem的数据
const formData = ref({ ...props.modelValue })

//监听表单的改变，将值发送给父组件
watch(
  formData,
  (newValue) => {
    emit('update:modelValue', newValue)
  },
  {
    deep: true,
  },
)

const elFormRef = ref<FormInstance>()

defineExpose({
  elFormRef,
})
</script>

<style scoped lang="less">
:deep(.el-form-item__label) {
  color: var(--font-unactive-color);
}
.app-form {
  width: 80%;

  .form-item {
    width: 300px;
  }
}
</style>
