/**
 * The single source of simulation time. Real time at 1x for now; time
 * controls (M6) will change `rate`, pause and jump.
 *
 * Simulation time = anchorSimMs + (wallNow - anchorWallMs) * rate
 */
export class SimClock {
  private anchorWallMs: number
  private anchorSimMs: number
  private _rate = 1
  private _paused = false
  /** Bumps whenever time jumps discontinuously, so consumers can reset caches. */
  private _epoch = 0

  constructor(private readonly wallNow: () => number = () => Date.now()) {
    this.anchorWallMs = wallNow()
    this.anchorSimMs = this.anchorWallMs
  }

  /** Current simulation time, UTC ms. */
  now(): number {
    if (this._paused) return this.anchorSimMs
    return this.anchorSimMs + (this.wallNow() - this.anchorWallMs) * this._rate
  }

  get rate(): number {
    return this._rate
  }

  get paused(): boolean {
    return this._paused
  }

  get epoch(): number {
    return this._epoch
  }

  setRate(rate: number): void {
    this.reanchor()
    this._rate = rate
  }

  setPaused(paused: boolean): void {
    this.reanchor()
    this._paused = paused
  }

  /** Jump to a simulation time (UTC ms). */
  jumpTo(simMs: number): void {
    this.anchorWallMs = this.wallNow()
    this.anchorSimMs = simMs
    this._epoch++
  }

  private reanchor(): void {
    const sim = this.now()
    this.anchorWallMs = this.wallNow()
    this.anchorSimMs = sim
  }
}
