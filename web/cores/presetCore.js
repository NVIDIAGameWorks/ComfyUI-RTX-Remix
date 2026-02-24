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
 * Preset Core - Business Logic Only
 *
 * This module contains pure business logic for preset management.
 * It does NOT import from any controllers, following the dependency rule:
 *   controllers → cores → stores → utils
 *
 * UI code has been moved to presetSidebarController.js
 */

import { PRESET_KEYS, REMIX_KEYS, EVENTS } from "../utils/constants.js";
import {
  getPresetsStore,
  ensurePresetsStore,
  setAutoSave,
} from "../stores/presetStore.js";
import { getTaggedInputs } from "./inputCore.js";
import { getInputKey } from "../utils/keys.js";

// Flag to prevent markDirty during programmatic changes (e.g., applyPreset).
// When true, widget callbacks won't mark values as dirty.
let _isProgrammaticChange = false;

/**
 * Get the current value of the isProgrammaticChange flag.
 * Used by controllers to check if a widget change is user-initiated or programmatic.
 * @returns {boolean}
 */
export function isProgrammaticChange() {
  return _isProgrammaticChange;
}

/**
 * Set the isProgrammaticChange flag.
 * Used by controllers when making programmatic changes to widgets.
 * @param {boolean} value
 */
export function setIsProgrammaticChange(value) {
  _isProgrammaticChange = value;
}

/**
 * Execute a callback while suppressing dirty-state marking.
 * Ensures the flag is always reset, even if the callback throws.
 * @param {Function} fn - Synchronous callback to execute
 * @returns {*} The return value of the callback
 */
export function withProgrammaticChange(fn) {
  _isProgrammaticChange = true;
  try {
    return fn();
  } finally {
    _isProgrammaticChange = false;
  }
}

export function setActivePreset(app, presetName) {
  // Check if preset exists (read-only check)
  const readStore = getPresetsStore(app);
  if (!readStore[PRESET_KEYS.PRESETS][presetName] && presetName !== PRESET_KEYS.DEFAULT) return;

  // Update the active preset in the store
  if (presetName !== PRESET_KEYS.DEFAULT) {
    // Non-default preset: ensure store exists and update
    const store = ensurePresetsStore(app);
    if (!store) return;
    store[PRESET_KEYS.ACTIVE_PRESET] = presetName;
  } else {
    // Default preset: only update if store already exists (don't create just for default)
    const existingStore = app.graph?.extra?.[REMIX_KEYS.ROOT];
    if (existingStore) {
      existingStore[PRESET_KEYS.ACTIVE_PRESET] = PRESET_KEYS.DEFAULT;
    }
  }

  withProgrammaticChange(() => applyPreset(app, presetName));
  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.PRESET_CHANGED, {
      detail: { action: "select", presetName },
    })
  );
}

export function createPreset(app, name) {
  const store = ensurePresetsStore(app);
  if (!store || store[PRESET_KEYS.PRESETS][name]) return;

  // Auto-capture default values if this is the first preset being created
  // This ensures we have a baseline to compare overrides against
  if (!store[PRESET_KEYS.PRESETS][PRESET_KEYS.DEFAULT]) {
    captureDefaultPreset(app);
  }

  const defaultPreset = store[PRESET_KEYS.PRESETS][PRESET_KEYS.DEFAULT];
  const defaultInputs = defaultPreset?.inputs || {};
  const tagged = getTaggedInputs(app);
  const overrides = {};

  // Compute overrides: values that differ from saved defaults
  tagged.forEach(({ nodeId, slotName, widget }) => {
    if (!widget) return;
    const key = getInputKey(nodeId, slotName);
    const defaultVal = defaultInputs[key]?.[PRESET_KEYS.VALUE];
    // Store override only if value differs from saved default
    if (widget.value !== defaultVal && defaultVal !== undefined) {
      overrides[key] = { [PRESET_KEYS.VALUE]: widget.value };
    }
  });

  store[PRESET_KEYS.PRESETS][name] = { inputs: overrides, [PRESET_KEYS.DESCRIPTION]: "" };
  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.PRESET_CHANGED, {
      detail: { action: "create", presetName: name },
    })
  );
}

export function deletePreset(app, name) {
  if (name === PRESET_KEYS.DEFAULT) return;
  // Only proceed if store actually exists in the graph
  const store = app.graph?.extra?.[REMIX_KEYS.ROOT];
  if (!store || !store[PRESET_KEYS.PRESETS]?.[name]) return;

  delete store[PRESET_KEYS.PRESETS][name];
  if (store[PRESET_KEYS.ACTIVE_PRESET] === name) {
    store[PRESET_KEYS.ACTIVE_PRESET] = PRESET_KEYS.DEFAULT;
    withProgrammaticChange(() => applyPreset(app, PRESET_KEYS.DEFAULT));
  }

  // Clean up orphaned metadata (empty presets, groupOrder, etc.)
  cleanupDeletedInputs(app);

  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.PRESET_CHANGED, {
      detail: { action: "delete", presetName: name },
    })
  );
}

/**
 * Clear default preset values and group order.
 * This is only allowed when no other presets exist (besides default).
 * Cleans up the entire rtx-remix preset structure while preserving tagged inputs.
 *
 * @param {Object} app - ComfyUI app instance
 * @returns {boolean} True if cleanup was performed
 */
export function clearDefaultPresetValues(app) {
  const store = app.graph?.extra?.[REMIX_KEYS.ROOT];
  if (!store) return false;

  // Check if any non-default presets exist
  const presets = store[PRESET_KEYS.PRESETS];
  if (presets) {
    const nonDefaultPresets = Object.keys(presets).filter((name) => name !== PRESET_KEYS.DEFAULT);
    if (nonDefaultPresets.length > 0) {
      console.warn("[PresetCore] Cannot clear default values while other presets exist");
      return false;
    }
  }

  // Remove the presets structure entirely
  delete store[PRESET_KEYS.PRESETS];
  delete store[PRESET_KEYS.ACTIVE_PRESET];

  // Remove groupOrder
  delete store[PRESET_KEYS.GROUP_ORDER];

  // If the entire rtx-remix store is empty (only had presets), remove it
  if (Object.keys(store).length === 0) {
    delete app.graph.extra[REMIX_KEYS.ROOT];
  }

  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.PRESET_CHANGED, {
      detail: { action: "clear", presetName: PRESET_KEYS.DEFAULT },
    })
  );

  return true;
}

/**
 * Check if other (non-default) presets exist.
 *
 * @param {Object} app - ComfyUI app instance
 * @returns {boolean} True if non-default presets exist
 */
export function hasOtherPresets(app) {
  const store = app.graph?.extra?.[REMIX_KEYS.ROOT];
  if (!store) return false;

  const presets = store[PRESET_KEYS.PRESETS];
  if (!presets) return false;

  const nonDefaultPresets = Object.keys(presets).filter((name) => name !== PRESET_KEYS.DEFAULT);
  return nonDefaultPresets.length > 0;
}

/**
 * Check if there's preset data to clear (default values or group order).
 *
 * @param {Object} app - ComfyUI app instance
 * @returns {boolean} True if there's data to clear
 */
export function hasPresetDataToClear(app) {
  const store = app.graph?.extra?.[REMIX_KEYS.ROOT];
  if (!store) return false;

  // Check if default preset has any inputs
  const defaultPreset = store[PRESET_KEYS.PRESETS]?.[PRESET_KEYS.DEFAULT];
  const hasDefaultValues = defaultPreset?.inputs && Object.keys(defaultPreset.inputs).length > 0;

  // Check if groupOrder exists
  const hasGroupOrder = store[PRESET_KEYS.GROUP_ORDER] && store[PRESET_KEYS.GROUP_ORDER].length > 0;

  return hasDefaultValues || hasGroupOrder;
}

/**
 * Check if the default preset can be cleared.
 * Returns true only if:
 * 1. No non-default presets exist
 * 2. There's actually data to clear (default values or group order)
 *
 * @param {Object} app - ComfyUI app instance
 * @returns {boolean} True if default can be cleared
 */
export function canClearDefaultPreset(app) {
  return !hasOtherPresets(app) && hasPresetDataToClear(app);
}

export function renamePreset(app, oldName, newName) {
  if (oldName === PRESET_KEYS.DEFAULT || newName === PRESET_KEYS.DEFAULT) return;
  // Only proceed if store actually exists in the graph
  const store = app.graph?.extra?.[REMIX_KEYS.ROOT];
  if (!store || !store[PRESET_KEYS.PRESETS]) return;

  const presets = store[PRESET_KEYS.PRESETS];
  if (!presets[oldName] || presets[newName]) return;
  presets[newName] = presets[oldName];
  delete presets[oldName];
  if (store[PRESET_KEYS.ACTIVE_PRESET] === oldName) store[PRESET_KEYS.ACTIVE_PRESET] = newName;
  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.PRESET_CHANGED, {
      detail: { action: "rename", oldName, newName },
    })
  );
}

export function captureDefaultPreset(app) {
  const store = ensurePresetsStore(app);
  if (!store) return;
  const inputs = {};
  getTaggedInputs(app).forEach(({ nodeId, slotName, widget }) => {
    if (!widget) return;
    inputs[getInputKey(nodeId, slotName)] = { [PRESET_KEYS.VALUE]: widget.value };
  });
  store[PRESET_KEYS.PRESETS][PRESET_KEYS.DEFAULT] = { inputs, [PRESET_KEYS.DESCRIPTION]: "" };
  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();
}

export function applyPreset(app, presetName) {
  const store = getPresetsStore(app);
  const defaultInputs = store[PRESET_KEYS.PRESETS][PRESET_KEYS.DEFAULT]?.inputs || {};
  const overrideInputs = presetName === PRESET_KEYS.DEFAULT ? {} : store[PRESET_KEYS.PRESETS][presetName]?.inputs || {};
  const tagged = getTaggedInputs(app);

  tagged.forEach(({ nodeId, slotName, widget }) => {
    if (!widget) return;
    const key = getInputKey(nodeId, slotName);
    const value = overrideInputs[key]?.[PRESET_KEYS.VALUE] ?? defaultInputs[key]?.[PRESET_KEYS.VALUE] ?? widget.value;
    widget.value = value;
    widget.callback?.call(widget, value);
  });

  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();
}

export function updatePresetValue(app, presetName, nodeId, slotName, value) {
  const store = ensurePresetsStore(app);
  if (!store) return;
  const presets = store[PRESET_KEYS.PRESETS];

  // Auto-create default preset if it doesn't exist (opt-in on first save)
  if (presetName === PRESET_KEYS.DEFAULT && !presets[presetName]) {
    presets[presetName] = { inputs: {}, [PRESET_KEYS.DESCRIPTION]: "" };
  }

  if (!presets[presetName]) return;
  presets[presetName].inputs = presets[presetName].inputs || {};
  presets[presetName].inputs[getInputKey(nodeId, slotName)] = { [PRESET_KEYS.VALUE]: value };
  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.PRESET_VALUE_CHANGED, {
      detail: { presetName, nodeId, slotName, value },
    })
  );
}

export function getEffectiveValue(app, presetName, nodeId, slotName) {
  const store = getPresetsStore(app);
  const key = getInputKey(nodeId, slotName);
  if (presetName !== PRESET_KEYS.DEFAULT) {
    const override = store[PRESET_KEYS.PRESETS][presetName]?.inputs?.[key];
    if (override?.[PRESET_KEYS.VALUE] !== undefined) return override[PRESET_KEYS.VALUE];
  }
  const defaultInputs = store[PRESET_KEYS.PRESETS][PRESET_KEYS.DEFAULT]?.inputs || {};
  if (defaultInputs[key]?.[PRESET_KEYS.VALUE] !== undefined) return defaultInputs[key][PRESET_KEYS.VALUE];
  const node = app.graph.getNodeById?.(nodeId);
  return node?.widgets?.find((w) => w.name === slotName)?.value;
}

/**
 * Register a newly tagged input to the default preset.
 * Called when an input is tagged while a non-default preset is active.
 * This ensures the input's current value becomes the default, not an override.
 * @param {Object} app - ComfyUI app instance
 * @param {number} nodeId - Node ID
 * @param {string} slotName - Slot name
 */
export function registerNewlyTaggedInput(app, nodeId, slotName) {
  // Only proceed if store actually exists in the graph
  const store = app.graph?.extra?.[REMIX_KEYS.ROOT];
  const defaultPreset = store?.[PRESET_KEYS.PRESETS]?.[PRESET_KEYS.DEFAULT];

  // Only add to default preset if it exists (opt-in system)
  if (!defaultPreset) return;

  const node = app.graph.getNodeById?.(nodeId);
  const widget = node?.widgets?.find((w) => w.name === slotName);
  if (!widget) return;

  const key = getInputKey(nodeId, slotName);

  // Add current widget value to default preset
  defaultPreset.inputs = defaultPreset.inputs || {};
  defaultPreset.inputs[key] = { [PRESET_KEYS.VALUE]: widget.value };

  app.graph.setDirtyCanvas?.(true, true);
}

/**
 * Clean up stale metadata from the graph store.
 * Removes:
 * - Preset inputs that reference deleted nodes/inputs
 * - Empty presets
 * - Orphaned groups from groupOrder
 * - Empty store structure
 *
 * @param {Object} app - ComfyUI app instance
 */
export function cleanupDeletedInputs(app) {
  const store = app.graph?.extra?.[REMIX_KEYS.ROOT];
  if (!store) return;

  const taggedInputs = getTaggedInputs(app);
  const validKeys = new Set(taggedInputs.map(({ nodeId, slotName }) => getInputKey(nodeId, slotName)));

  let hasChanges = false;

  // Clean up preset inputs
  const presets = store[PRESET_KEYS.PRESETS];
  if (presets) {
    Object.keys(presets).forEach((presetName) => {
      const inputs = presets[presetName]?.inputs;
      if (!inputs) return;

      Object.keys(inputs).forEach((key) => {
        if (!validKeys.has(key)) {
          delete inputs[key];
          hasChanges = true;
        }
      });

      // Remove empty preset entries (except for metadata like description)
      if (inputs && Object.keys(inputs).length === 0) {
        delete presets[presetName].inputs;
      }
    });

    // Remove presets that only have empty structures
    Object.keys(presets).forEach((presetName) => {
      const preset = presets[presetName];
      if (preset && Object.keys(preset).length === 0) {
        delete presets[presetName];
        hasChanges = true;
      }
    });

    // If all presets are gone, clean up the entire preset structure
    if (Object.keys(presets).length === 0) {
      delete store[PRESET_KEYS.PRESETS];
      delete store[PRESET_KEYS.ACTIVE_PRESET];
      hasChanges = true;
    }
  }

  // Clean up orphaned groups from groupOrder
  if (store[PRESET_KEYS.GROUP_ORDER] && Array.isArray(store[PRESET_KEYS.GROUP_ORDER])) {
    // Get all groups that actually have inputs
    const activeGroups = new Set(taggedInputs.map((input) => input.group).filter((g) => g && g.trim()));

    // Filter groupOrder to only include groups that have inputs
    const cleanedGroupOrder = store[PRESET_KEYS.GROUP_ORDER].filter((group) => activeGroups.has(group));

    if (cleanedGroupOrder.length !== store[PRESET_KEYS.GROUP_ORDER].length) {
      store[PRESET_KEYS.GROUP_ORDER] = cleanedGroupOrder;
      hasChanges = true;
    }

    // Remove groupOrder entirely if empty
    if (store[PRESET_KEYS.GROUP_ORDER].length === 0) {
      delete store[PRESET_KEYS.GROUP_ORDER];
      hasChanges = true;
    }
  }

  // If the entire rtx-remix store is empty, remove it
  if (Object.keys(store).length === 0) {
    delete app.graph.extra[REMIX_KEYS.ROOT];
    hasChanges = true;
  }

  if (hasChanges) {
    app.graph.setDirtyCanvas?.(true, true);
  }
}

/**
 * Toggle auto-save setting and dispatch event for UI updates.
 * @param {Object} app - ComfyUI app instance
 * @param {boolean} enabled - Whether auto-save should be enabled
 */
export function toggleAutoSave(app, enabled) {
  setAutoSave(app, enabled);
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.AUTO_SAVE_CHANGED, {
      detail: { enabled },
    })
  );
}
