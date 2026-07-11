<template>
  <div id="home" class="page">
    <HomeList title="热门推荐" :list-data="hots" />
    <WeeklyTimeline :calendar-data="calendar" />
    <HomeList title="最近更新" :list-data="latest" />
  </div>
</template>

<script setup lang="ts">
import { useHomeStore } from '@/stores/modules/home'
import HomeList from './components/HomeList.vue'
import WeeklyTimeline from './components/WeeklyTimeline.vue'

const homeStore = useHomeStore()
homeStore.homeDataAction()

const hots = computed(() => homeStore.hots)
const latest = computed(() => homeStore.latest)
const calendar = computed(() => homeStore.calendar)
</script>

<style scoped lang="less">
@import '~styles/page';
</style>
