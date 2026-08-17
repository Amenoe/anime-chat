<template>
  <div id="home" class="page">
    <RecentPlay v-if="recentList.length" :list="recentList" />
    <HomeList title="热门推荐" :list-data="hots" />
    <WeeklyTimeline :calendar-data="calendar" />
    <HomeList title="最近更新" :list-data="latest" />
  </div>
</template>

<script setup lang="ts">
import { useHomeStore } from '@/stores/modules/home'
import HomeList from './components/HomeList.vue'
import WeeklyTimeline from './components/WeeklyTimeline.vue'
import RecentPlay from './components/RecentPlay.vue'
import { getPlayHistory } from '@/utils/play-history'

const homeStore = useHomeStore()
homeStore.homeDataAction()

const hots = computed(() => homeStore.hots)
const latest = computed(() => homeStore.latest)
const calendar = computed(() => homeStore.calendar)
const recentList = ref(getPlayHistory())
</script>

<style scoped lang="less">
@import '~styles/page';
</style>
