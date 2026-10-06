// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// SPDX-FileCopyrightText: Copyright (C) 2026 Extelligence AI
// SPDX-License-Identifier: MPL-2.0
import { applyEmbedCommand, embedAddress } from "./embedControl";

describe("isolated viewer control", () => {
  const own = "https://viewer.example";
  it("preserves legacy origin unless opt-in origin and channel are valid", () => {
    expect(embedAddress("", own)).toEqual({ origin: own });
    for (const parent of [
      "*",
      "https://matcha.example/path",
      "https://user@matcha.example",
      "http://foreign.example",
    ]) {
      expect(
        embedAddress(
          new URLSearchParams({
            "matcha.parent": parent,
            "matcha.channel": "abcdefghijklmnop",
          }).toString(),
          own,
        ),
      ).toEqual({ origin: own });
    }
    expect(
      embedAddress(
        "matcha.parent=https%3A%2F%2Fmatcha.example&matcha.channel=abcdefghijklmnop",
        own,
      ),
    ).toEqual({ origin: "https://matcha.example", channel: "abcdefghijklmnop" });
  });
  it("uses player controls and recording-relative time with nanosecond carry", () => {
    const play = jest.fn();
    const pause = jest.fn();
    const seek = jest.fn();
    const playback = {
      start: { sec: 100, nsec: 900000000 },
      end: { sec: 110, nsec: 0 },
      play,
      pause,
      seek,
    };
    applyEmbedCommand({ action: "play" }, playback);
    applyEmbedCommand({ action: "pause" }, playback);
    applyEmbedCommand({ action: "seek", seconds: 1.25 }, playback);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith({ sec: 102, nsec: 150000000 });
    for (const seconds of [-1, 9.2, NaN, Infinity, "2"]) {
      expect(() => {
        applyEmbedCommand({ action: "seek", seconds }, playback);
      }).toThrow();
    }
    expect(seek).toHaveBeenCalledTimes(1);
  });
});
