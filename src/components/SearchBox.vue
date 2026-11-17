<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { searchSatellites, type SearchEntry, type SearchIndex } from '../utils/search'

const props = defineProps<{
  index: SearchIndex | null
  /** Excludes satellites that can't be shown (failed propagation). */
  include: (i: number) => boolean
}>()

const emit = defineEmits<{ pick: [index: number] }>()

const query = ref('')
const open = ref(false)
const activeOption = ref(0)
const input = ref<HTMLInputElement | null>(null)

const results = computed<SearchEntry[]>(() =>
  props.index && query.value.trim() ? searchSatellites(props.index, query.value, 8, props.include) : [],
)
const hasQuery = computed(() => query.value.trim().length > 0)

watch(results, () => {
  activeOption.value = 0
})

function choose(entry: SearchEntry | undefined): void {
  if (!entry) return
  emit('pick', entry.index)
  query.value = entry.name
  open.value = false
  input.value?.blur()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    open.value = true
    activeOption.value = Math.min(activeOption.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeOption.value = Math.max(activeOption.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    choose(results.value[activeOption.value])
  } else if (e.key === 'Escape') {
    // Esc clears the search first; the next Esc (outside the field) clears the selection.
    e.preventDefault()
    if (query.value) {
      query.value = ''
    } else {
      input.value?.blur()
    }
    open.value = false
  }
}

function clearQuery(): void {
  query.value = ''
  input.value?.focus()
}
</script>

<template>
  <div class="search">
    <div class="search__field">
      <svg class="search__icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <input
        ref="input"
        v-model="query"
        class="search__input"
        type="search"
        placeholder="Search name or NORAD ID"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-label="Search satellites"
        aria-autocomplete="list"
        aria-controls="search-results"
        :aria-expanded="open && results.length > 0"
        :aria-activedescendant="open && results.length ? `search-option-${activeOption}` : undefined"
        @focus="open = true"
        @input="open = true"
        @blur="open = false"
        @keydown="onKeydown"
      />
      <button
        v-if="hasQuery"
        class="search__clear"
        type="button"
        aria-label="Clear search"
        @mousedown.prevent
        @click="clearQuery"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <ul v-show="open && results.length > 0" id="search-results" class="search__results" role="listbox">
      <li
        v-for="(entry, i) in results"
        :id="`search-option-${i}`"
        :key="entry.index"
        class="search__option"
        :class="{ 'search__option--active': i === activeOption }"
        role="option"
        :aria-selected="i === activeOption"
        @mousedown.prevent
        @mouseenter="activeOption = i"
        @click="choose(entry)"
      >
        <span class="search__name">{{ entry.name }}</span>
        <span class="search__id tabular">{{ entry.noradId }}</span>
      </li>
    </ul>
    <p v-if="open && hasQuery && index && results.length === 0" class="search__empty">No matches</p>
  </div>
</template>

<style scoped>
.search {
  position: relative;
}

.search__field {
  position: relative;
  display: flex;
  align-items: center;
}

.search__icon {
  position: absolute;
  left: 10px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.search__input {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-surface-hover);
  font-size: var(--text-md);
  outline: none;
  transition: background var(--duration-fast) var(--ease-out);
  -webkit-appearance: none;
  appearance: none;
}

.search__input::placeholder {
  color: var(--color-text-tertiary);
}

.search__input::-webkit-search-cancel-button {
  display: none;
}

.search__input:focus-visible {
  background: var(--color-surface-pressed);
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 0;
}

.search__clear {
  position: absolute;
  right: 8px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  color: var(--color-canvas);
  cursor: pointer;
}

.search__results {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: var(--space-1);
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
}

.search__option {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.search__option--active {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.search__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search__id {
  flex: none;
  color: var(--color-text-tertiary);
}

.search__option--active .search__id {
  color: var(--color-on-accent);
}

.search__empty {
  margin: var(--space-2) var(--space-1) 0;
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
}
</style>
