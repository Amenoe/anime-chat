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
    path: '/timeline',
    name: 'Timeline',
    component: () => import('@/views/timeline/Timeline.vue'),
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
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/chat/Chat.vue'),
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
