<template>
  <div ref="rootEl" class="branch-dd" :class="'dd-' + variant">
    <button type="button" class="dd-btn" :disabled="disabled" :title="modelValue" @click.stop="toggle">
      <span class="dd-ico">🌿</span>
      <span class="dd-cur">{{ modelValue || '选择分支' }}</span>
      <span class="dd-caret">▾</span>
    </button>
    <div v-if="open" class="dd-menu" @click.stop>
      <button
        v-for="b in branches"
        :key="b.name"
        type="button"
        class="dd-item"
        :class="{ active: b.name === modelValue }"
        @click="pick(b.name)"
      >
        <span class="dd-check">{{ b.name === modelValue ? '✓' : '' }}</span>
        <span class="dd-name">{{ b.name }}</span>
        <span v-if="b.current" class="dd-tag">当前</span>
        <span v-else-if="b.upstream" class="dd-up" title="已跟踪远程分支">⇄</span>
      </button>
      <div v-if="!branches.length" class="dd-empty">暂无分支</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // [{ name, current?, upstream? }]
  branches: { type: Array, default: () => [] },
  variant: { type: String, default: 'light' },   // light | header
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'change'])

const rootEl = ref(null)
const open = ref(false)

function toggle () {
  if (props.disabled) return
  open.value = !open.value
}

function pick (name) {
  open.value = false
  if (name === props.modelValue) return
  emit('update:modelValue', name)
  emit('change', name)
}

function onDocClick (e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>

<style scoped>
.branch-dd { position: relative; display: inline-flex; }
.dd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 10px; border-radius: 6px; cursor: pointer;
  font-size: 13px; max-width: 240px; transition: background .15s, border-color .15s;
}
.dd-ico { flex-shrink: 0; font-size: 13px; }
.dd-cur {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, Monaco, monospace; font-size: 13px;
}
.dd-caret { font-size: 10px; opacity: .65; flex-shrink: 0; }

/* 亮色表面（工具栏 / 本地改动页） */
.dd-light .dd-btn {
  background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text);
}
.dd-light .dd-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }

/* 深色顶栏 */
.dd-header .dd-btn {
  background: var(--header-btn-bg); border: 1px solid var(--header-btn-border); color: var(--header-text);
}
.dd-header .dd-btn:hover { background: var(--header-btn-border); }

.dd-menu {
  position: absolute; left: 0; top: 38px; min-width: 200px; max-width: 320px;
  max-height: 300px; overflow: auto; z-index: 200; padding: 5px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 8px 24px var(--shadow);
}
.dd-item {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 7px 9px; border: none; border-radius: 5px; background: transparent;
  color: var(--text); font-size: 13px; cursor: pointer; text-align: left;
}
.dd-item:hover { background: var(--bg-hover); }
.dd-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.dd-check { width: 12px; flex-shrink: 0; font-size: 12px; color: var(--accent); }
.dd-name {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, Monaco, monospace;
}
.dd-tag {
  flex-shrink: 0; font-size: 10px; padding: 1px 6px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
}
.dd-up { flex-shrink: 0; font-size: 11px; color: var(--text-muted); }
.dd-empty { padding: 10px; text-align: center; font-size: 12px; color: var(--text-muted); }
</style>
