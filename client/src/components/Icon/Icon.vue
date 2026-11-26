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
.iconfont {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.iconfont i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 16px;
}
</style>
