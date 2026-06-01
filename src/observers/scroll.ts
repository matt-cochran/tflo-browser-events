/**
 * Scroll depth tracking — fires milestones at configurable depth thresholds
 * (25%, 50%, 75%, 100%) and optionally tracks direction changes.
 *
 * Uses a single throttled scroll listener. Each milestone fires once
 * per lifecycle (it won't re-fire on scroll-back-and-down unless
 * `directionChanges` is enabled, in which case it tracks inversion).
 */

import type { EventRecord } from "../types.js";
import type { ScrollTrack } from "../types.js";

export interface ScrollObserverOptions {
  cfg: ScrollTrack;
  handler: (record: EventRecord) => void;
  now?: () => number;
}

export function captureScroll(opts: ScrollObserverOptions): () => void {
  const milestones = opts.cfg.milestones ?? [0.25, 0.5, 0.75, 1];
  const throttleMs = opts.cfg.throttleMs ?? 250;
  const trackDirection = opts.cfg.directionChanges ?? false;
  const now = opts.now ?? (() => performance.now());

  // Track which milestones have already fired
  const fired = new Set<number>();
  let lastDepth = 0;
  let lastDirection = "down";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const flush = () => {
    timer = null;
    if (!pending) return;
    pending = false;
    const ts = now();
    const depth = computeScrollDepth();

    // Direction change
    if (trackDirection) {
      const direction = depth >= lastDepth ? "down" : "up";
      if (direction !== lastDirection) {
        opts.handler({
          ts,
          kind: "scroll.inverted",
          fields: { direction, depth, previousDirection: lastDirection },
        });
        lastDirection = direction;
      }
    }

    // Milestone fire
    for (const m of milestones) {
      if (!fired.has(m) && depth >= m) {
        fired.add(m);
        opts.handler({
          ts,
          kind: "scroll.milestone",
          fields: { depth: m, exactDepth: depth },
        });
      }
    }

    lastDepth = depth;
  };

  const onScroll = () => {
    pending = true;
    if (timer === null) {
      timer = setTimeout(flush, throttleMs);
    }
  };

  // Fire immediately on first call to capture page-loaded scroll state
  flush();

  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    if (timer !== null) {
      clearTimeout(timer);
      flush(); // final fire
    }
  };
}

function computeScrollDepth(): number {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight;
  const winHeight = window.innerHeight;
  if (docHeight <= winHeight) return 1; // page fits without scroll
  return Math.min(1, scrollTop / (docHeight - winHeight));
}
