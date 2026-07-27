// SPDX-FileCopyrightText: Copyright (C) 2026 Extelligence AI
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEmbedBridge } from "@lichtblick/suite-base/hooks/useEmbedBridge";

// Separate subcomponent so time updates don't rerender expensive parents
// (same pattern as URLStateSyncAdapter).
export function EmbedBridgeAdapter(): ReactNull {
  useEmbedBridge();

  return ReactNull;
}
