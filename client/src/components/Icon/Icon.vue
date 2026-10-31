<template>
  <div class="iconfont">
    <el-icon>
      <component :is="name"></component>
    </el-icon>
  </div>
</template>

<script setup lang="ts">
defineProps({
  name: {
    type: String,
    required: true,
  },
})
</script>

<style scoped>
.iconfont i {
  width: 16px;
  height: 16px;
  margin-right: 16px;
}
</style>
