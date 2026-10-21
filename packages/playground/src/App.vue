<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import HomePage from './HomePage.vue'

const SchemaDesigner = defineAsyncComponent(() =>
  import('@schema-forge/designer').then((module) => module.SchemaDesigner),
)

type Route = 'home' | 'designer'

const route = ref<Route>('home')
const isDesigner = computed(() => route.value === 'designer')

function readRoute(): Route {
  return window.location.hash.startsWith('#/designer') ? 'designer' : 'home'
}

function scrollToAnchor(): void {
  const hash = window.location.hash
  if (!hash || hash === '#/' || hash.startsWith('#/designer')) {
    window.scrollTo(0, 0)
    return
  }
  const id = decodeURIComponent(hash.slice(1))
  const target = document.getElementById(id)
  if (target) target.scrollIntoView({ block: 'start' })
}

function syncRoute(): void {
  const next = readRoute()
  const previous = route.value
  route.value = next
  document.documentElement.classList.toggle('sf-route-designer', next === 'designer')
  document.title =
    next === 'designer'
      ? '设计器 · schema-forge'
      : 'schema-forge · 把表单当源码编译'

  if (next === 'designer') {
    window.scrollTo(0, 0)
    return
  }

  if (previous === 'designer') {
    void nextTick(scrollToAnchor)
  }
}

onMounted(() => {
  syncRoute()
  window.addEventListener('hashchange', syncRoute)
  if (route.value === 'home' && window.location.hash && !window.location.hash.startsWith('#/')) {
    void nextTick(scrollToAnchor)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncRoute)
  document.documentElement.classList.remove('sf-route-designer')
})
</script>

<template>
  <HomePage v-if="!isDesigner" />
  <Suspense v-else>
    <SchemaDesigner home-href="#/" />
    <template #fallback>
      <div class="route-loading">
        <i aria-hidden="true"></i>
        <span>正在编译设计器…</span>
      </div>
    </template>
  </Suspense>
</template>
