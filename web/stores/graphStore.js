/*
 * SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Graph Store - Base-level access to RTX Remix graph metadata.
 *
 * All RTX Remix data is stored under `app.graph.extra["rtx-remix"]`.
 * This module provides the base metadata access and group order management.
 *
 * For preset-specific functions, see presetStore.js
 */

import { REMIX_KEYS, PRESET_KEYS } from "../utils/constants.js";

// ============================================================
// GRAPH METADATA (Base Level)
// ============================================================

/**
 * Get graph-level RTX Remix metadata object (read-only).
 * Returns an empty object if no metadata exists - does NOT create the structure.
 * @param {Object} app - ComfyUI app instance
 * @returns {Object} Graph-level metadata object or empty object
 */
export function getGraphMetadata(app) {
  if (!app?.graph) return {};
  return app.graph.extra?.[REMIX_KEYS.ROOT] || {};
}

/**
 * Ensure graph-level RTX Remix metadata structure exists and return it.
 * Creates the structure if it doesn't exist - use only when modifying metadata.
 * @param {Object} app - ComfyUI app instance
 * @returns {Object|null} Graph-level metadata object or null if no graph
 */
export function ensureGraphMetadata(app) {
  if (!app?.graph) return null;
  app.graph.extra = app.graph.extra || {};
  app.graph.extra[REMIX_KEYS.ROOT] = app.graph.extra[REMIX_KEYS.ROOT] || {};
  return app.graph.extra[REMIX_KEYS.ROOT];
}

/**
 * Check if graph has any RTX Remix metadata.
 * @param {Object} app - ComfyUI app instance
 * @returns {boolean} True if metadata exists
 */
export function hasGraphMetadata(app) {
  return !!app?.graph?.extra?.[REMIX_KEYS.ROOT];
}

/**
 * Clear all RTX Remix metadata from the graph.
 * @param {Object} app - ComfyUI app instance
 */
export function clearGraphMetadata(app) {
  if (app?.graph?.extra?.[REMIX_KEYS.ROOT]) {
    delete app.graph.extra[REMIX_KEYS.ROOT];
    app.graph.setDirtyCanvas?.(true, true);
  }
}

// ============================================================
// GROUP ORDER
// ============================================================

/**
 * Get the group display order from graph-level metadata.
 * @param {Object} app - ComfyUI app instance
 * @returns {string[]} Array of group names in display order
 */
export function getGroupOrder(app) {
  const meta = getGraphMetadata(app);
  return meta[PRESET_KEYS.GROUP_ORDER] || [];
}

/**
 * Set the group display order in graph-level metadata.
 * Note: Caller should dispatch EVENTS.GROUP_ORDER_CHANGED if UI update is needed.
 * @param {Object} app - ComfyUI app instance
 * @param {string[]} groupOrder - Array of group names in display order
 */
export function setGroupOrder(app, groupOrder) {
  const meta = ensureGraphMetadata(app);
  if (!meta) return;
  meta[PRESET_KEYS.GROUP_ORDER] = groupOrder;
  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();
}
