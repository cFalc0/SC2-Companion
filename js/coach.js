/**
 * CoachEngine — manages the in-game timer and fires cues at their timestamps.
 *
 * Usage:
 *   engine.load(cues)          — load sorted cue list
 *   engine.start()             — begin ticking
 *   engine.pause()             — stop ticking (elapsed preserved)
 *   engine.reset()             — stop + reset elapsed to 0
 *   engine.nextCue()           — returns the next unfired cue, or null
 *   engine.onTick(elapsed)     — called every second with elapsed seconds
 *   engine.onCue(cue)          — called when a cue fires
 */
class CoachEngine {
  constructor() {
    this.cues    = [];
    this.elapsed = 0;
    this.running = false;
    this._iv     = null;
    this._fired  = new Set();

    this.onTick = null;
    this.onCue  = null;
  }

  load(cues) {
    this.cues = [...cues].sort((a, b) => a.time - b.time);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._iv = setInterval(() => this._tick(), 1000);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this._iv);
    this._iv = null;
  }

  reset() {
    this.pause();
    this.elapsed = 0;
    this._fired.clear();
    if (this.onTick) this.onTick(0);
  }

  nextCue() {
    return this.cues.find(c => !this._fired.has(this._key(c))) ?? null;
  }

  _tick() {
    this.elapsed++;
    if (this.onTick) this.onTick(this.elapsed);

    for (const cue of this.cues) {
      const k = this._key(cue);
      if (cue.time <= this.elapsed && !this._fired.has(k)) {
        this._fired.add(k);
        if (this.onCue) this.onCue(cue);
      }
    }
  }

  _key(cue) {
    return `${cue.time}::${cue.message}`;
  }
}
