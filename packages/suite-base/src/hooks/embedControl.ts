// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// SPDX-FileCopyrightText: Copyright (C) 2026 Extelligence AI
// SPDX-License-Identifier: MPL-2.0

/** Opt-in, exact-parent playback control. Legacy embeds remain protocol 1. */
export function embedAddress(
  search: string,
  ownOrigin: string,
): { origin: string; channel?: string } {
  const params = new URLSearchParams(search);
  const parent = params.get("matcha.parent");
  const channel = params.get("matcha.channel");
  if (parent && channel && /^[a-zA-Z0-9_-]{16,80}$/.test(channel)) {
    try {
      const url = new URL(parent);
      if (
        url.origin === parent &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
      ) {
        return { origin: parent, channel };
      }
    } catch {
      /* Invalid opt-in stays on the legacy same-origin bridge. */
    }
  }
  return { origin: ownOrigin };
}

type Time = { sec: number; nsec: number };
type Playback = {
  start: Time;
  end: Time;
  play?: () => void;
  pause?: () => void;
  seek?: (time: Time) => void;
};
export function applyEmbedCommand(data: Record<string, unknown>, playback: Playback): void {
  if (data.action === "play" && playback.play) {
    playback.play();
    return;
  }
  if (data.action === "pause" && playback.pause) {
    playback.pause();
    return;
  }
  if (
    data.action === "seek" &&
    playback.seek &&
    typeof data.seconds === "number" &&
    Number.isFinite(data.seconds)
  ) {
    const duration =
      playback.end.sec - playback.start.sec + (playback.end.nsec - playback.start.nsec) / 1e9;
    if (data.seconds < 0 || data.seconds > duration) {
      throw new Error("Seek is outside the recording");
    }
    const nanos = playback.start.nsec + Math.round((data.seconds % 1) * 1e9);
    playback.seek({
      sec: playback.start.sec + Math.floor(data.seconds) + Math.floor(nanos / 1e9),
      nsec: nanos % 1e9,
    });
    return;
  }
  throw new Error("Playback command is unavailable");
}
