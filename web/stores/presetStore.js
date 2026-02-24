/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
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
 * Preset Store - Centralized access to RTX Remix preset data.
 *
 * Presets are stored under `app.graph.extra["rtx-remix"]`:
 * - presets: Preset definitions and input values
 * - activePreset: Currently selected preset name
 */

import { REMIX_KEYS, PRESET_KEYS } from "../utils/constants.js";
import { ensureGraphMetadata } from "./graphStore.js";

// ============================================================
// PRESETS STORE
// ============================================================

/**
 * Default store structure when no presets exist.
 */
const DEFAULT_PRESETS_STORE = {
  [PRESET_KEYS.ACTIVE_PRESET]: PRESET_KEYS.DEFAULT,
  [PRESET_KEYS.PRESETS]: {},
};

/**
 * Get the presets store (read-only).
 * Returns a default structure if store doesn't exist - does NOT create it.
 * @param {Object} app - ComfyUI app instance
 * @returns {Object} Presets store object
 */
export function getPresetsStore(app) {
  if (!app?.graph) return { ...DEFAULT_PRESETS_STORE };

  const store = app.graph.extra?.[REMIX_KEYS.ROOT];
  if (!store || typeof store !== "object") return { ...DEFAULT_PRESETS_STORE };
  if (!store[PRESET_KEYS.PRESETS]) return { ...store, [PRESET_KEYS.PRESETS]: {} };
  return store;
}

/**
 * Ensure the presets store exists in graph.extra and return it.
 * Creates the store if it doesn't exist - use only when modifying presets.
 * @param {Object} app - ComfyUI app instance
 * @returns {Object|null} Presets store object or null if no graph
 */
export function ensurePresetsStore(app) {
  const store = ensureGraphMetadata(app);
  if (!store) return null;

  if (!store[PRESET_KEYS.PRESETS]) store[PRESET_KEYS.PRESETS] = {};
  if (!store[PRESET_KEYS.ACTIVE_PRESET]) store[PRESET_KEYS.ACTIVE_PRESET] = PRESET_KEYS.DEFAULT;
  return store;
}

/**
 * Get the currently active preset name.
 * @param {Object} app - ComfyUI app instance
 * @returns {string} Active preset name (defaults to "default")
 */
export function getActivePreset(app) {
  return getPresetsStore(app)[PRESET_KEYS.ACTIVE_PRESET] || PRESET_KEYS.DEFAULT;
}

/**
 * Get all preset names.
 * @param {Object} app - ComfyUI app instance
 * @returns {string[]} Array of preset names
 */
export function getPresetNames(app) {
  const store = getPresetsStore(app);
  const names = Object.keys(store[PRESET_KEYS.PRESETS] || {});

  // Ensure "default" is always first if not present
  if (!names.includes(PRESET_KEYS.DEFAULT)) {
    names.unshift(PRESET_KEYS.DEFAULT);
  }

  // Sort with default first, then alphabetically
  names.sort((a, b) => {
    if (a === PRESET_KEYS.DEFAULT) return -1;
    if (b === PRESET_KEYS.DEFAULT) return 1;
    return a.localeCompare(b);
  });

  return names;
}

/**
 * Get a specific preset's data.
 * @param {Object} app - ComfyUI app instance
 * @param {string} presetName - Preset name
 * @returns {Object|null} Preset data or null if not found
 */
export function getPreset(app, presetName) {
  return getPresetsStore(app)[PRESET_KEYS.PRESETS]?.[presetName] || null;
}

/**
 * Get preset description.
 * @param {Object} app - ComfyUI app instance
 * @param {string} presetName - Preset name
 * @returns {string} Preset description
 */
export function getPresetDescription(app, presetName) {
  return getPresetsStore(app)[PRESET_KEYS.PRESETS]?.[presetName]?.[PRESET_KEYS.DESCRIPTION] ?? "";
}

/**
 * Set preset description.
 * @param {Object} app - ComfyUI app instance
 * @param {string} presetName - Preset name
 * @param {string} description - Description text
 */
export function setPresetDescription(app, presetName, description) {
  const preset = app.graph?.extra?.[REMIX_KEYS.ROOT]?.[PRESET_KEYS.PRESETS]?.[presetName];
  if (!preset) return;
  preset[PRESET_KEYS.DESCRIPTION] = description ?? "";
  app.graph.setDirtyCanvas?.(true, true);
}

/**
 * Check if a preset exists.
 * @param {Object} app - ComfyUI app instance
 * @param {string} presetName - Preset name
 * @returns {boolean} True if preset exists
 */
export function hasPreset(app, presetName) {
  return !!getPresetsStore(app)[PRESET_KEYS.PRESETS]?.[presetName];
}

// ============================================================
// AUTO-SAVE SETTING
// ============================================================

/**
 * Get the auto-save setting from the presets store.
 * @param {Object} app - ComfyUI app instance
 * @returns {boolean} True if auto-save is enabled
 */
export function getAutoSave(app) {
  return getPresetsStore(app)[PRESET_KEYS.AUTO_SAVE] ?? false;
}

/**
 * Set the auto-save setting in the presets store.
 * Note: Caller should dispatch EVENTS.AUTO_SAVE_CHANGED if UI update is needed.
 * @param {Object} app - ComfyUI app instance
 * @param {boolean} enabled - Whether auto-save is enabled
 */
export function setAutoSave(app, enabled) {
  const store = ensurePresetsStore(app);
  if (!store) return;
  store[PRESET_KEYS.AUTO_SAVE] = enabled;
  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();
}
