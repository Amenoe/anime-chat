import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/views/home/Home.vue'),
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('@/views/search/Search.vue'),
  },
  {
    // AI 助手：原「时间表」入口（每日放送已由首页 WeeklyTimeline 承担）
    path: '/ai',
    name: 'Ai',
    component: () => import('@/views/ai/Ai.vue'),
  },
  {
    // 旧地址兼容：/timeline 曾是「时间表」占位页，保留跳转避免旧书签 404
    path: '/timeline',
    redirect: '/ai',
  },
  {
    path: '/user',
    name: 'User',
    component: () => import('@/views/user/User.vue'),
  },
  {
    path: '/detail/:anime_id',
    name: 'Detail',
    component: () => import('@/views/detail/Detail.vue'),
  },
  {
    path: '/room/:seasonId',
    name: 'Room',
    component: () => import('@/views/room/Room.vue'),
  },
]
const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_BASE_URL),
  routes,
})

export default router
