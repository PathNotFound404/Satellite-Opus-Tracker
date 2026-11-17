<script setup lang="ts">
/** An iOS-style switch with a label, e.g. "Day and night". */
defineProps<{ label: string; hint?: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="toggle">
    <span class="toggle__text">
      <span class="toggle__label">{{ label }}</span>
      <span v-if="hint" class="toggle__hint">{{ hint }}</span>
    </span>
    <input v-model="model" class="toggle__input" type="checkbox" role="switch" :aria-checked="model" />
    <span class="toggle__track" aria-hidden="true"><span class="toggle__thumb" /></span>
  </label>
</template>

<style scoped>
.toggle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  cursor: pointer;
}

.toggle__text {
  display: flex;
  flex-direction: column;
}

.toggle__label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.toggle__hint {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.toggle__input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.toggle__track {
  flex: none;
  position: relative;
  width: 40px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-pressed);
  transition: background var(--duration-normal) var(--ease-out);
}

.toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform var(--duration-normal) var(--ease-out);
}

.toggle__input:checked + .toggle__track {
  background: var(--color-success);
}

.toggle__input:checked + .toggle__track .toggle__thumb {
  transform: translateX(16px);
}

.toggle__input:focus-visible + .toggle__track {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 2px;
}
</style>
