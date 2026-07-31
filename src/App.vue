<template>
  <div class="app-container">
    <!-- 桌面端：右侧头像 -->
    <AppHeader v-if="!isMobile" />
    <!-- 移动端：顶部导航栏 -->
    <header v-if="isMobile" class="mobile-nav">
      <span class="mobile-nav__brand">{{ WEB_NAME }}</span>
      <nav class="mobile-nav__links">
        <router-link
          v-for="{ name, routeName, routePath, icon } in sideList"
          :key="routeName"
          class="mobile-nav__link"
          :class="{ active: $route.fullPath.includes(routePath) }"
          :to="{ name: routeName }"
        >
          <Icon :name="icon" />
          <span>{{ name }}</span>
        </router-link>
      </nav>
      <el-avatar class="mobile-nav__avatar" :size="28" :src="avatarUrl" @click="onAvatarClick" />
    </header>
    <!-- 桌面端：左侧边栏 -->
    <aside v-if="!isMobile" class="app-container__aside" :class="{ hide: !asideVisible }">
      <div
        class="switch"
        :title="asideVisible ? '隐藏' : '展开'"
        @click="asideVisible = !asideVisible"
      ></div>
      <b v-show="asideVisible" class="animate__jello">{{ WEB_NAME }}</b>
      <AppAsideBar v-show="asideVisible" :side-list="sideList" />
    </aside>
    <main class="app-container__main" :class="{ 'app-container__main--mobile': isMobile }">
      <AppRouter />
    </main>
    <AppConfirmHost />
    <!-- 移动端登录弹窗宿主（复用 AppHeader 的逻辑） -->
    <LoginDialog v-if="isMobile" ref="loginRef" @go-register="showRegisterDialog" />
    <RegisterDialog v-if="isMobile" ref="registerRef" />
  </div>
</template>

<script setup lang="ts">
import AppAsideBar from '@/layout/AppAsideBar.vue'
import AppRouter from '@/layout/AppRouter.vue'
import AppHeader from '@/layout/AppHeader.vue'
import AppConfirmHost from '@/components/AppConfirm/AppConfirmHost.vue'
import LoginDialog from '@/components/Login/LoginDialog.vue'
import RegisterDialog from '@/components/Login/RegisterDialog.vue'
import { useRouteStore } from '@/stores/modules/route'
import { useLoginStore } from '@/stores/modules/login'
import { resolveAvatarUrl } from '@/utils/avatar'

const WEB_NAME = import.meta.env.VITE_APP_TITLE
const routeStore = useRouteStore()
const loginStore = useLoginStore()
const sideList = routeStore.routeList
const router = useRouter()

const mq = window.matchMedia('(max-width: 768px)')
const isMobile = ref(mq.matches)
const asideVisible = ref(!mq.matches)

const GUEST_AVATAR = 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'
const isLogin = computed(() => loginStore.token !== '')
const avatarUrl = computed(() => {
  if (!isLogin.value) return GUEST_AVATAR
  return resolveAvatarUrl(loginStore.userInfo?.avatar)
})

const loginRef = ref<InstanceType<typeof LoginDialog>>()
const registerRef = ref<InstanceType<typeof LoginDialog>>()

function onAvatarClick() {
  if (isLogin.value) {
    router.push('/user')
  } else {
    loginRef.value!.dialogVisible = true
  }
}

function showRegisterDialog() {
  registerRef.value!.dialogVisible = true
}

const onMqChange = (e: MediaQueryListEvent | MediaQueryList) => {
  isMobile.value = e.matches
  asideVisible.value = !e.matches
}
onMounted(() => mq.addEventListener('change', onMqChange))
onUnmounted(() => mq.removeEventListener('change', onMqChange))
</script>
<style lang="less">
@import '~styles/app';
@import '~styles/common';
</style>
<style scoped lang="less">
@frameTop: 40px;
@slideDruation: 0.625s;

.app-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  background: var(--bg-color);
  color: var(--font-color);
  &__aside {
    display: flex;
    flex-direction: column;
    width: 280px;
    height: calc(100% - @frameTop*2);
    background: var(--aside-bg-color);
    border-radius: var(--df-radius);
    padding-left: @frameTop;
    box-sizing: border-box;
    animation: slide-in @slideDruation forwards;
    transition: all 0.25s;
    &.hide {
      width: 80px;
    }
    & > b {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      aspect-ratio: 2/1;
      font-size: 30px;
      animation-duration: 1.25s;
      animation-delay: @slideDruation;
    }
    .switch {
      position: absolute;
      top: 0;
      right: 8px;
      bottom: 0;
      margin: auto 0;
      width: 20px;
      height: 100px;
      cursor: pointer;
      &::before {
        .mask(1,var(--font-color));
        right: 0;
        margin: 0 auto;
        width: 5px;
        height: 100%;
        border-radius: 20px;
        opacity: 0.6;
        transition: all 0.25s;
      }
      &:hover::before {
        opacity: 0.8;
      }
    }
    @keyframes slide-in {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(-@frameTop);
      }
    }
  }
  &__main {
    margin-top: @frameTop;
    margin-bottom: @frameTop;
    box-sizing: border-box;
    height: calc(100% - @frameTop * 2);
    border-radius: var(--df-radius);
    flex: 1;
    overflow: hidden;
    position: relative;
    opacity: 0;
    animation: fade-in 1s @slideDruation forwards;
    @keyframes fade-in {
      to {
        opacity: 1;
      }
    }
    &--mobile {
      margin: 0;
      height: 100%;
      border-radius: 0;
      padding-top: 48px;
    }
  }
}

/* 移动端顶部导航栏 */
.mobile-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  background: var(--aside-bg-color);
  border-bottom: 1px solid rgba(104, 198, 189, 0.12);
  box-sizing: border-box;

  &__brand {
    flex-shrink: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--primary-color);
    margin-right: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 72px;
  }

  &__links {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__link {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--font-unactive-color);
    text-decoration: none;
    white-space: nowrap;
    transition: color 0.2s, background 0.2s;

    i {
      width: 14px;
      height: 14px;
    }

    &.active,
    &.router-link-exact-active {
      color: var(--primary-color);
      background: rgba(104, 198, 189, 0.12);
    }
  }

  &__avatar {
    flex-shrink: 0;
    margin-left: 4px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s;

    &:hover {
      border-color: var(--primary-color);
    }
  }
}
</style>
