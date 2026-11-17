import { ref, shallowRef } from 'vue'
import type { Observer } from '../orbital/passes'

const STORAGE_KEY = 'sat-tracker:observer'

export interface ObserverLocation extends Observer {
  source: 'device' | 'manual'
}

/** Parse and range-check a manual coordinate. Returns null if invalid. */
export function parseCoordinate(text: string, limit: number): number | null {
  const value = Number(text.trim())
  if (text.trim() === '' || !Number.isFinite(value) || Math.abs(value) > limit) return null
  return value
}

function load(): ObserverLocation | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<ObserverLocation>
    if (typeof v.latDeg !== 'number' || typeof v.lonDeg !== 'number') return null
    if (Math.abs(v.latDeg) > 90 || Math.abs(v.lonDeg) > 180) return null
    return { latDeg: v.latDeg, lonDeg: v.lonDeg, heightKm: v.heightKm ?? 0, source: v.source === 'device' ? 'device' : 'manual' }
  } catch {
    return null
  }
}

function save(location: ObserverLocation | null): void {
  try {
    if (location) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable: the location still works for this visit.
  }
}

// One shared observer for the app. It stays in this browser; it's never sent anywhere.
const location = shallowRef<ObserverLocation | null>(load())
const locating = ref(false)
const error = ref<string | null>(null)

export function useObserver() {
  function set(next: ObserverLocation | null): void {
    location.value = next
    error.value = null
    save(next)
  }

  function useDeviceLocation(): void {
    if (!('geolocation' in navigator)) {
      error.value = 'This browser does not share its location. Enter coordinates instead.'
      return
    }
    locating.value = true
    error.value = null
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating.value = false
        set({
          // Rounded to ~1 km: plenty for pass times, and less precise than the device fix.
          latDeg: Math.round(pos.coords.latitude * 100) / 100,
          lonDeg: Math.round(pos.coords.longitude * 100) / 100,
          heightKm: Math.max(0, (pos.coords.altitude ?? 0) / 1000),
          source: 'device',
        })
      },
      (err) => {
        locating.value = false
        error.value =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Enter coordinates instead.'
            : 'Could not get your location. Enter coordinates instead.'
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  function setManual(latText: string, lonText: string): boolean {
    const latDeg = parseCoordinate(latText, 90)
    const lonDeg = parseCoordinate(lonText, 180)
    if (latDeg === null || lonDeg === null) {
      error.value = 'Latitude must be between -90 and 90, longitude between -180 and 180.'
      return false
    }
    set({ latDeg, lonDeg, heightKm: 0, source: 'manual' })
    return true
  }

  return { location, locating, error, useDeviceLocation, setManual, clear: () => set(null) }
}
