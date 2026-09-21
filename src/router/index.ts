import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { setTrackPage, track } from '@/utils/track'

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

/**
 * 页面浏览埋点。
 *
 * 只上报**路由名**而不是完整 URL —— 后者会带上 `/detail/10380` 这类业务 id，
 * 埋点表没必要存这些，而且容易变成事实上的用户行为明细。
 */
router.afterEach((to) => {
  const page = typeof to.name === 'string' ? to.name : 'unknown'
  setTrackPage(page)
  track('page.view', { page }, page)
})

export default router
