export const MASCOT_FRAME_MS = 180
export const MASCOT_FRAME_COUNT = 9
export const MASCOT_RETURN_MS = 120
export const MASCOT_PLAY_MS = MASCOT_FRAME_COUNT * MASCOT_FRAME_MS

export function mascotIdleMs(random = Math.random()) {
  return 8000 + Math.floor(random * 7001)
}

export function mascotFrame(elapsed: number) {
  return {
    index: Math.min(MASCOT_FRAME_COUNT - 1, Math.floor(elapsed / MASCOT_FRAME_MS)),
    blend: Math.max(0, Math.min(1, (elapsed - MASCOT_PLAY_MS) / MASCOT_RETURN_MS)),
  }
}
