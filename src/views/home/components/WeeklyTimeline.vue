<template>
  <div class="weekly-timeline">
    <div class="weekly-timeline__header">
      <span class="weekly-timeline__title">每日放送</span>
    </div>
    <div class="timeline">
      <!-- 横向时间轴头部 -->
      <div class="timeline__axis">
        <div
          v-for="day in calendarData"
          :key="'label-' + day.weekday.id"
          class="timeline__day"
          :class="{ 'timeline__day--active': isToday(day.weekday.id) }"
        >
          <span class="timeline__weekday">{{ day.weekday.cn }}</span>
          <span class="timeline__today-badge" :class="{ visible: isToday(day.weekday.id) }">
            今天
          </span>
          <div class="timeline__node-wrap">
            <div class="timeline__line" />
            <div class="timeline__node" />
            <div class="timeline__line" />
          </div>
        </div>
      </div>
      <!-- 每天的番剧纵向列表 -->
      <div class="timeline__columns">
        <div
          v-for="day in calendarData"
          :key="'col-' + day.weekday.id"
          class="timeline__col"
          :class="{ 'timeline__col--active': isToday(day.weekday.id) }"
        >
          <div class="timeline__cards">
            <div
              v-for="item in day.items"
              :key="item.id"
              class="timeline-card"
              @click="goDetail(item.id)"
            >
              <img
                class="timeline-card__cover"
                :src="item.images?.small || item.images?.grid"
                alt=""
              />
              <div class="timeline-card__name">{{ item.name_cn || item.name }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ICalendarItem } from '@/api/types'
import type { PropType } from 'vue'

const router = useRouter()

defineProps({
  calendarData: {
    type: Array as PropType<ICalendarItem[]>,
    default: () => [],
  },
})

const todayId = (() => {
  const d = new Date().getDay()
  return d === 0 ? 7 : d
})()

const isToday = (weekdayId: number) => weekdayId === todayId

const goDetail = (id: number) => {
  router.push('/detail/' + id)
}
</script>

<style scoped lang="less">
@col-count: 7;
@cover-w: 48px;
@cover-h: 64px;
@card-gap: 6px;

.weekly-timeline {
  margin-bottom: 32px;

  &__header {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
    padding-left: 12px;
    border-left: 4px solid var(--primary-color);
  }

  &__title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 1px;
  }
}

.timeline {
  &__axis {
    display: grid;
    grid-template-columns: repeat(@col-count, 1fr);
  }

  &__day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding-bottom: 10px;

    &--active {
      .timeline__weekday {
        color: var(--primary-color);
        font-weight: 700;
      }
      .timeline__node {
        background: var(--primary-color);
        box-shadow: 0 0 10px var(--primary-color), 0 0 20px rgba(104, 198, 189, 0.3);
        animation: pulse 2s ease-in-out infinite;
      }
    }
  }

  &__weekday {
    font-size: 13px;
    color: var(--font-unactive-color);
    transition: color 0.3s;
  }

  &__today-badge {
    font-size: 10px;
    background: var(--primary-color);
    color: #fff;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 600;
    visibility: hidden;

    &.visible {
      visibility: visible;
    }
  }

  &__node-wrap {
    display: flex;
    align-items: center;
    width: 100%;
  }

  &__line {
    flex: 1;
    height: 2px;
    background: var(--font-unactive-color);
    opacity: 0.25;
  }

  &__node {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--font-unactive-color);
    flex-shrink: 0;
    transition: all 0.3s;
  }

  &__columns {
    display: grid;
    grid-template-columns: repeat(@col-count, 1fr);
    gap: 6px;
  }

  &__col {
    border-radius: 8px;
    padding: 6px 3px;
    transition: background 0.3s;

    &--active {
      background: rgba(104, 198, 189, 0.06);
    }
  }

  &__cards {
    display: flex;
    flex-direction: column;
    gap: @card-gap;
    max-height: (@cover-h + @card-gap) * 4;
    overflow: hidden;
    transition: max-height 0.3s ease;

    &:hover {
      overflow-y: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }
  }
}

.timeline-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(104, 198, 189, 0.1);
  }

  &__cover {
    width: @cover-w;
    height: @cover-h;
    object-fit: cover;
    border-radius: 4px;
    display: block;
    flex-shrink: 0;
  }

  &__name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.3;
    color: var(--font-color);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 8px var(--primary-color), 0 0 16px rgba(104, 198, 189, 0.2);
  }
  50% {
    box-shadow: 0 0 16px var(--primary-color), 0 0 32px rgba(104, 198, 189, 0.4);
  }
}

@media (max-width: 768px) {
  .timeline {
    &__axis,
    &__columns {
      grid-template-columns: repeat(@col-count, 1fr);
      gap: 3px;
    }
    &__weekday {
      font-size: 11px;
    }
    &__cards {
      max-height: (@cover-h + @card-gap) * 3;
    }
  }
  .timeline-card {
    flex-direction: column;
    &__cover {
      width: 100%;
      height: auto;
      aspect-ratio: 3 / 4;
    }
    &__name {
      text-align: center;
      font-size: 11px;
      -webkit-line-clamp: 1;
    }
  }
  .weekly-timeline__title {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .timeline {
    &__axis,
    &__columns {
      grid-template-columns: repeat(4, 1fr);
    }
    &__day:nth-child(n + 5),
    &__col:nth-child(n + 5) {
      display: none;
    }
  }
}
</style>
