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

import { applyEmbedCommand, embedAddress } from "./embedControl";

const selectSeek = (ctx: MessagePipelineContext) => ctx.seekPlayback;
const selectPlay = (ctx: MessagePipelineContext) => ctx.startPlayback;
const selectPause = (ctx: MessagePipelineContext) => ctx.pausePlayback;
const selectActive = (ctx: MessagePipelineContext) => ctx.playerState.activeData;

/** Legacy same-origin seeks, plus opt-in protocol 2 for an isolated Matcha viewer. */
export function useEmbedBridge(): void {
  const seek = useMessagePipeline(selectSeek);
  const play = useMessagePipeline(selectPlay);
  const pause = useMessagePipeline(selectPause);
  const active = useMessagePipeline(selectActive);
  const latest = useRef({ active, seek, play, pause });
  latest.current = { active, seek, play, pause };
  useEffect(() => {
    if (window.parent === window) {
      return;
    }
    const address = embedAddress(window.location.search, window.location.origin);
    let interaction = 0;
    // Bound memory; parent sends commands in order, never retransmits an old ID.
    const handled = new Set<string>();
    const post = (value: Record<string, unknown>) => {
      window.parent.postMessage(
        {
          ...value,
          ...(address.channel ? { protocol: 2, channel: address.channel, interaction } : {}),
        },
        address.origin,
      );
    };
    const state = () => {
      const data = latest.current.active;
      if (data) {
        post({
          lichtblick: "time",
          current: data.currentTime,
          start: data.startTime,
          end: data.endTime,
          playing: data.isPlaying,
          ready: !!latest.current.seek,
        });
      }
    };
    const hello = () => {
      post({ lichtblick: "hello", protocol: address.channel ? 2 : 1 });
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== address.origin) {
        return;
      }
      const data: unknown = event.data;
      if (data == undefined || typeof data !== "object") {
        return;
      }
      const command = data as Record<string, unknown>;
      if (address.channel) {
        if (command.protocol !== 2 || command.channel !== address.channel) {
          return;
        }
        if (command.lichtblick === "hello") {
          hello();
          state();
          return;
        }
        if (
          command.lichtblick !== "command" ||
          typeof command.id !== "string" ||
          command.id.length > 128
        ) {
          return;
        }
        if (handled.has(command.id)) {
          return;
        }
        handled.add(command.id);
        if (handled.size > 256) {
          handled.delete(handled.values().next().value!);
        }
        try {
          if (command.interaction !== interaction) {
            throw new Error("Manual controls took precedence");
          }
          const current = latest.current;
          if (!current.active) {
            throw new Error("Recording is not ready");
          }
          applyEmbedCommand(command, {
            start: current.active.startTime,
            end: current.active.endTime,
            play: current.play,
            pause: current.pause,
            seek: current.seek,
          });
          post({ lichtblick: "ack", id: command.id, ok: true });
        } catch (error) {
          post({
            lichtblick: "ack",
            id: command.id,
            ok: false,
            message: error instanceof Error ? error.message : "Playback command was rejected",
          });
        }
        return;
      }
      if (
        command.lichtblick === "seek" &&
        command.time != undefined &&
        typeof command.time === "object"
      ) {
        const time = command.time as { sec?: unknown; nsec?: unknown };
        if (
          typeof time.sec === "number" &&
          Number.isFinite(time.sec) &&
          typeof time.nsec === "number" &&
          Number.isFinite(time.nsec)
        ) {
          try {
            latest.current.seek?.({ sec: time.sec, nsec: time.nsec });
          } catch {
            /* Player not ready. */
          }
        }
      }
    };
    const manual = (event: Event) => {
      if (!address.channel || !event.isTrusted) {
        return;
      }
      interaction++;
      post({ lichtblick: "manual" });
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("pointerdown", manual, true);
    window.addEventListener("keydown", manual, true);
    hello();
    // State uses the latest player snapshot; keeps paused / freshly loaded embeds discoverable.
    const timer = setInterval(state, 100);
    let attempts = 0;
    const handshake = setInterval(() => {
      if (++attempts >= 10) {
        clearInterval(handshake);
      }
      hello();
    }, 1000);
    return () => {
      clearInterval(timer);
      clearInterval(handshake);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pointerdown", manual, true);
      window.removeEventListener("keydown", manual, true);
    };
  }, []);
}
