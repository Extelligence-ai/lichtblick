// SPDX-FileCopyrightText: Copyright (C) 2026 Extelligence AI
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEffect, useRef } from "react";

import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@lichtblick/suite-base/components/MessagePipeline";

const PROTOCOL_VERSION = 1;
const EMIT_INTERVAL_MS = 66;

const selectSeek = (ctx: MessagePipelineContext) => ctx.seekPlayback;
const selectActiveData = (ctx: MessagePipelineContext) => ctx.playerState.activeData;

/**
 * Matcha embed bridge: when running inside a same-origin iframe, mirrors
 * playback time to the parent and accepts seek commands from it.
 * Protocol: {lichtblick:'hello'|'time'|'seek', ...} — see Matcha
 * docs/superpowers/specs/2026-07-26-scrub-lock-design.md.
 */
export function useEmbedBridge(): void {
  const seekPlayback = useMessagePipeline(selectSeek);
  const activeData = useMessagePipeline(selectActiveData);
  const lastEmit = useRef(0);

  const embedded = typeof window !== "undefined" && window.parent !== window;

  // Announce ourselves once.
  useEffect(() => {
    if (!embedded) return;
    try {
      window.parent.postMessage(
        { lichtblick: "hello", protocol: PROTOCOL_VERSION },
        window.location.origin,
      );
    } catch {
      // Cross-origin parent: not our embed, stay silent.
    }
  }, [embedded]);

  // Accept seeks from the parent.
  useEffect(() => {
    if (!embedded || !seekPlayback) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { lichtblick?: string; time?: { sec: number; nsec: number } }
        | null;
      if (data?.lichtblick === "seek" && data.time
          && typeof data.time.sec === "number" && typeof data.time.nsec === "number") {
        seekPlayback(data.time);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedded, seekPlayback]);

  // Mirror playback time to the parent (throttled).
  useEffect(() => {
    if (!embedded || !activeData) return;
    const now = Date.now();
    if (now - lastEmit.current < EMIT_INTERVAL_MS) return;
    lastEmit.current = now;
    try {
      window.parent.postMessage(
        {
          lichtblick: "time",
          current: activeData.currentTime,
          start: activeData.startTime,
          end: activeData.endTime,
          playing: activeData.isPlaying,
        },
        window.location.origin,
      );
    } catch {
      // Detached/foreign parent — ignore.
    }
  }, [embedded, activeData]);
}
