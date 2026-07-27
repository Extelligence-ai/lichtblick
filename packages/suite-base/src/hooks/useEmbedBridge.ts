// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

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
const HELLO_RETRY_INTERVAL_MS = 1000;
const HELLO_MAX_ATTEMPTS = 10;

const selectSeek = (ctx: MessagePipelineContext) => ctx.seekPlayback;
const selectActiveData = (ctx: MessagePipelineContext) =>
  ctx.playerState.activeData;

type ActiveData = NonNullable<ReturnType<typeof selectActiveData>>;

function postTime(data: ActiveData): void {
  try {
    window.parent.postMessage(
      {
        lichtblick: "time",
        current: data.currentTime,
        start: data.startTime,
        end: data.endTime,
        playing: data.isPlaying,
      },
      window.location.origin,
    );
  } catch {
    // Detached/foreign parent — ignore.
  }
}

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
  const latestActiveData = useRef(activeData);
  const flushTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const receivedParentMessage = useRef(false);

  const embedded = typeof window !== "undefined" && window.parent !== window;

  // Announce ourselves immediately, then retry until the parent responds
  // (its listener may attach after our first hello fires) or we give up.
  useEffect(() => {
    if (!embedded) {
      return;
    }
    const sendHello = () => {
      try {
        window.parent.postMessage(
          { lichtblick: "hello", protocol: PROTOCOL_VERSION },
          window.location.origin,
        );
      } catch {
        // Cross-origin parent: not our embed, stay silent.
      }
    };

    sendHello();

    let attempts = 1;
    const interval = setInterval(() => {
      if (receivedParentMessage.current || attempts >= HELLO_MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }
      attempts += 1;
      sendHello();
    }, HELLO_RETRY_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [embedded]);

  // Accept seeks from the parent.
  useEffect(() => {
    if (!embedded || !seekPlayback) {
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as {
        lichtblick?: string;
        time?: { sec: number; nsec: number };
      } | null;
      if (data?.lichtblick == undefined) {
        return;
      }
      receivedParentMessage.current = true;
      if (
        data.lichtblick === "seek" &&
        data.time &&
        Number.isFinite(data.time.sec) &&
        Number.isFinite(data.time.nsec)
      ) {
        try {
          seekPlayback(data.time);
        } catch {
          // Player rejected the seek (e.g. not ready) — ignore, keep bridge alive.
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [embedded, seekPlayback]);

  // Mirror playback time to the parent (throttled, leading-edge, with a
  // trailing flush so the final settled position after a burst is never lost).
  useEffect(() => {
    latestActiveData.current = activeData;
    if (!embedded || !activeData) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastEmit.current;
    if (elapsed >= EMIT_INTERVAL_MS) {
      if (flushTimeout.current != undefined) {
        clearTimeout(flushTimeout.current);
        flushTimeout.current = undefined;
      }
      lastEmit.current = now;
      postTime(activeData);
      return;
    }

    // Suppressed by throttle: schedule (or reschedule) a trailing flush that
    // posts whatever the latest snapshot is once the interval elapses.
    if (flushTimeout.current != undefined) {
      clearTimeout(flushTimeout.current);
    }
    const remaining = EMIT_INTERVAL_MS - elapsed;
    flushTimeout.current = setTimeout(() => {
      flushTimeout.current = undefined;
      const latest = latestActiveData.current;
      if (latest) {
        lastEmit.current = Date.now();
        postTime(latest);
      }
    }, remaining);
  }, [embedded, activeData]);

  // Clear any pending trailing flush on unmount.
  useEffect(() => {
    return () => {
      if (flushTimeout.current != undefined) {
        clearTimeout(flushTimeout.current);
        flushTimeout.current = undefined;
      }
    };
  }, []);
}
