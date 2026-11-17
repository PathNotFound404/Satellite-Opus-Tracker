import { SimClock } from '../utils/sim-clock'

/** The app's single simulation clock. Plain object, not reactive. */
const clock = new SimClock()

export function useSimClock(): SimClock {
  return clock
}
