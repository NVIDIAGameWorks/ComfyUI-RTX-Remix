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
 * Preset Sidebar Controller
 *
 * This controller handles all UI rendering and user interaction for the preset sidebar.
 * It imports business logic from presetCore.js, following the convention:
 *   - Controllers can import from cores (allowed)
 *   - Cores cannot import from controllers (forbidden)
 *
 * DEPENDENCY RULES:
 *   controllers → cores → stores → utils
 */

import { PRESET_KEYS, REMIX_KEYS, ASSETS, TEMPLATE_IDS, EVENTS, KEYS, SIDEBAR } from "../utils/constants.js";
import { cloneTemplate, bindTemplateData } from "../utils/html.js";
import { updateInputMetadata } from "../cores/metadataEditorCore.js";
import { setOnInputTagChanged, toggleInputSlotMark } from "../cores/slotMarkingCore.js";
import { showConfirmDialog } from "./baseDialogController.js";
import { createGroupedList } from "./groupedListController.js";
import { openTemplatePopover, openPopoverWithContent, closePopover, isPopoverOpenFor } from "./popoverController.js";
import { createButtonCell } from "./slotRowController.js";
import { showEditGlobalSettingsDialog } from "./metadataDialogController.js";
import { createSplitButton } from "../factories/componentFactory.js";
import { getGroupOrder } from "../stores/graphStore.js";
import { getPresetsStore, getActivePreset, getPresetNames, getPresetDescription, setPresetDescription, getAutoSave } from "../stores/presetStore.js";
import { updateGroupOrder } from "../cores/workflowExportCore.js";
import { getTaggedInputs } from "../cores/inputCore.js";
import { getInputKey, parseInputKey } from "../utils/keys.js";

// Import business logic from core (controllers can import from cores)
import {
  setActivePreset,
  createPreset,
  deletePreset,
  renamePreset,
  captureDefaultPreset,
  applyPreset,
  updatePresetValue,
  getEffectiveValue,
  registerNewlyTaggedInput,
  isProgrammaticChange,
  setIsProgrammaticChange,
  withProgrammaticChange,
  cleanupDeletedInputs,
  clearDefaultPresetValues,
  canClearDefaultPreset,
  hasOtherPresets,
  hasPresetDataToClear,
  toggleAutoSave,
} from "../cores/presetCore.js";

// Module-level state for persistence across re-renders
const collapsedGroups = new Set();

// Module-level pending state (moved from function scope for external access)
// pendingChanges: Map<inputKey, {nodeId, slotName, value}>
const pendingChanges = new Map();
// pendingDefaultChanges: Map<key, {nodeId, slotName, value}>
const pendingDefaultChanges = new Map();
// pendingOverrideRemovals: Set<key>
const pendingOverrideRemovals = new Set();

// Cleanup function for the current sidebar instance
let sidebarCleanup = null;

// Reference to the current sidebar element and app for re-rendering on workflow change
let currentSidebarEl = null;
let currentApp = null;

/**
 * Persist all pending changes to the preset store.
 * Shared by performSave, handlePendingChangesBeforeAction, and preset-switch save.
 * Does NOT clear pending state or refresh UI — callers handle that.
 *
 * @param {Object} app - ComfyUI app instance
 */
function savePendingToStore(app) {
  const active = getActivePreset(app);
  const store = getPresetsStore(app);
  const presets = store[PRESET_KEYS.PRESETS];

  // First-time save for default preset: capture all current widget values as baseline
  if (active === PRESET_KEYS.DEFAULT && !presets[PRESET_KEYS.DEFAULT]) {
    captureDefaultPreset(app);
  }

  // Write pending changes to the active preset
  pendingChanges.forEach(({ nodeId, slotName, value }) => {
    updatePresetValue(app, active, nodeId, slotName, value);
  });

  // Write pending default changes to the default preset
  pendingDefaultChanges.forEach(({ nodeId, slotName, value }) => {
    updatePresetValue(app, PRESET_KEYS.DEFAULT, nodeId, slotName, value);
  });

  // Remove pending override removals from the active preset
  pendingOverrideRemovals.forEach((key) => {
    delete presets[active]?.inputs?.[key];
  });
}

/**
 * Check if there are any pending preset changes.
 * Can be called from other controllers to check before actions like export.
 * @returns {boolean} True if there are pending changes
 */
export function hasPendingPresetChanges() {
  return pendingChanges.size > 0 || pendingDefaultChanges.size > 0 || pendingOverrideRemovals.size > 0;
}

/**
 * Handle pending preset changes before an action (e.g., export).
 * Shows unsaved changes dialog if there are pending changes.
 * Returns true if action can proceed, false if cancelled.
 *
 * @param {Object} app - ComfyUI app instance
 * @returns {Promise<boolean>} True if action can proceed, false if cancelled
 */
export async function handlePendingChangesBeforeAction(app) {
  if (!hasPendingPresetChanges()) {
    return true; // No pending changes, proceed
  }

  const result = await showUnsavedChangesDialog();
  if (result === "cancel") {
    return false; // User cancelled, don't proceed
  }

  if (result === "save") {
    savePendingToStore(app);
  }

  // Clear pending state (for both save and discard)
  pendingChanges.clear();
  pendingDefaultChanges.clear();
  pendingOverrideRemovals.clear();

  // Dispatch event to refresh sidebar UI (especially for discard case where no PRESET_VALUE_CHANGED fires)
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.PRESET_CHANGED, {
      detail: { action: "pending-cleared" },
    })
  );

  return true; // Proceed with action
}

/**
 * Show unsaved changes dialog using template.
 * Returns: "cancel" | "save" | "discard"
 */
function showUnsavedChangesDialog() {
  return new Promise((resolve) => {
    const overlay = cloneTemplate(TEMPLATE_IDS.UNSAVED_CHANGES_DIALOG);
    if (!overlay) {
      resolve("cancel");
      return;
    }

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector("[data-action='cancel']")?.addEventListener("click", () => close("cancel"));
    overlay.querySelector("[data-action='save']")?.addEventListener("click", () => close("save"));
    overlay.querySelector("[data-action='discard']")?.addEventListener("click", () => close("discard"));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close("cancel");
    });

    document.body.appendChild(overlay);
  });
}

/**
 * Register the presets sidebar tab with ComfyUI.
 * @param {Object} app - ComfyUI app instance
 */
export function registerPresetsSidebar(app) {
  if (!app?.extensionManager?.registerSidebarTab) return;
  app.extensionManager.registerSidebarTab({
    id: SIDEBAR.ID,
    icon: "pi pi-star",
    title: SIDEBAR.TITLE,
    tooltip: SIDEBAR.TOOLTIP,
    type: "custom",
    render: (el) => renderSidebarPanel(el, app),
  });
}

/**
 * Refresh the preset sidebar when the workflow changes.
 * Called from afterConfigureGraph hook in main.js.
 */
export function refreshPresetsSidebar() {
  if (currentSidebarEl && currentApp) {
    renderSidebarPanel(currentSidebarEl, currentApp);
  }
}

/**
 * Show delete preset confirmation dialog using template.
 */
function showDeletePresetConfirmDialog(presetName) {
  return new Promise((resolve) => {
    const overlay = cloneTemplate(TEMPLATE_IDS.DELETE_PRESET_CONFIRM);
    if (!overlay) {
      resolve(false);
      return;
    }

    const nameEl = overlay.querySelector("[data-element='preset-name']");
    if (nameEl) nameEl.textContent = presetName;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector("[data-action='cancel']")?.addEventListener("click", () => close(false));
    overlay.querySelector("[data-action='confirm']")?.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
  });
}

/**
 * Show clear default preset confirmation dialog using template.
 */
function showClearDefaultConfirmDialog() {
  return new Promise((resolve) => {
    const overlay = cloneTemplate(TEMPLATE_IDS.CLEAR_DEFAULT_CONFIRM);
    if (!overlay) {
      resolve(false);
      return;
    }

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector("[data-action='cancel']")?.addEventListener("click", () => close(false));
    overlay.querySelector("[data-action='confirm']")?.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
  });
}

/**
 * Show apply all confirmation dialog using template.
 */
function showApplyAllConfirmDialog() {
  return new Promise((resolve) => {
    const overlay = cloneTemplate(TEMPLATE_IDS.APPLY_ALL_CONFIRM);
    if (!overlay) {
      resolve(false);
      return;
    }

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector("[data-action='cancel']")?.addEventListener("click", () => close(false));
    overlay.querySelector("[data-action='confirm']")?.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
  });
}

/**
 * Show reset all confirmation dialog using template.
 */
function showResetAllConfirmDialog() {
  return new Promise((resolve) => {
    const overlay = cloneTemplate(TEMPLATE_IDS.RESET_ALL_CONFIRM);
    if (!overlay) {
      resolve(false);
      return;
    }

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector("[data-action='cancel']")?.addEventListener("click", () => close(false));
    overlay.querySelector("[data-action='confirm']")?.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
  });
}

/**
 * Show edit preset dialog using template.
 */
function showEditPresetDialog(app, options) {
  const { isNew = false, currentName = "", currentDescription = "" } = options || {};
  return new Promise((resolve) => {
    const overlay = cloneTemplate(TEMPLATE_IDS.EDIT_PRESET_DIALOG);
    if (!overlay) {
      resolve(null);
      return;
    }

    const titleEl = overlay.querySelector("[data-element='dialog-title']");
    const nameInput = overlay.querySelector("[data-input='preset-name']");
    const descInput = overlay.querySelector("[data-input='preset-description']");
    const validationEl = overlay.querySelector("[data-element='validation']");
    const cancelBtn = overlay.querySelector("[data-action='cancel']");
    const saveBtn = overlay.querySelector("[data-action='save']");
    const icon = overlay.querySelector("[data-asset='remix-icon']");

    if (icon) icon.src = ASSETS.REMIX_ICON;
    if (titleEl) titleEl.textContent = isNew ? "Create a preset" : "Edit a preset";
    if (saveBtn) saveBtn.textContent = isNew ? "Create" : "Edit";
    if (nameInput) {
      nameInput.value = currentName;
      nameInput.select();
    }
    if (descInput) descInput.value = currentDescription;

    const showValidation = (msg) => {
      if (validationEl) {
        validationEl.textContent = msg;
        validationEl.classList.add("show");
      }
      nameInput?.classList.add("error");
    };

    const hideValidation = () => {
      validationEl?.classList.remove("show");
      nameInput?.classList.remove("error");
    };

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    const handleSave = () => {
      const name = nameInput?.value?.trim() || "";
      const description = descInput?.value?.trim() || "";

      if (!name) {
        showValidation("Name cannot be empty");
        return;
      }
      if (name === PRESET_KEYS.DEFAULT) {
        showValidation(`"${PRESET_KEYS.DEFAULT}" is a reserved name`);
        return;
      }
      if (!isNew && name === currentName && description === currentDescription) {
        close(null);
        return;
      }

      const presets = getPresetsStore(app)[PRESET_KEYS.PRESETS];
      if (presets[name] && (isNew || name !== currentName)) {
        showValidation("A preset with that name already exists");
        return;
      }

      hideValidation();
      close({ name, description });
    };

    cancelBtn?.addEventListener("click", () => close(null));
    saveBtn?.addEventListener("click", handleSave);

    // Handle Enter key to submit, Escape to cancel
    overlay.addEventListener("keydown", (e) => {
      if (e.key === KEYS.ENTER) {
        e.preventDefault();
        handleSave();
      } else if (e.key === KEYS.ESCAPE) {
        e.preventDefault();
        close(null);
      }
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    document.body.appendChild(overlay);

    // Focus the name input after appending to DOM
    nameInput?.focus();
  });
}

/**
 * Render the sidebar panel into el and wire events.
 *
 * FLOW OVERVIEW:
 * 1. Clone and mount the sidebar panel template
 * 2. Set up dirty state tracking (pendingChanges map)
 * 3. Define helper functions for UI state management
 * 4. Set up preset list rendering with selection handling
 * 5. Set up tagged inputs list rendering with input controls
 * 6. Wire up event listeners for buttons and inputs
 * 7. Initialize the display
 *
 * DIRTY STATE FLOW:
 * - User changes an input value -> handleChange() -> markDirty() -> updates Save button
 * - User clicks Save -> saves all pendingChanges to preset store -> clearDirty()
 * - User switches presets -> unsaved changes dialog -> save/discard -> clearDirty()
 *
 * WIDGET SYNC:
 * - When user changes a graph widget directly on the canvas, the wrapped callback:
 *   1. Calls original callback
 *   2. Marks the change as dirty
 *   3. Updates the corresponding input in the panel
 */
export function renderSidebarPanel(el, app) {
  // Clean up previous sidebar instance (remove event listeners, etc.)
  sidebarCleanup?.();
  sidebarCleanup = null;

  // Clear pending state from previous workflow to prevent cross-workflow contamination
  pendingChanges.clear();
  pendingDefaultChanges.clear();
  pendingOverrideRemovals.clear();

  // Store references for re-rendering on workflow change
  currentSidebarEl = el;
  currentApp = app;

  cleanupDeletedInputs(app);

  const panel = cloneTemplate(TEMPLATE_IDS.SIDEBAR_PANEL);
  if (!panel) {
    const fallback = cloneTemplate(TEMPLATE_IDS.INPUTS_EMPTY);
    if (fallback) {
      bindTemplateData(fallback, { message: "Failed to load RTX Remix Presets panel" });
      el.appendChild(fallback);
    }
    return;
  }

  const headerIcon = panel.querySelector("[data-asset='remix-icon']");
  if (headerIcon) headerIcon.src = ASSETS.REMIX_ICON;

  // ============================================================
  // ELEMENT REFERENCES
  // ============================================================
  const presetListContainer = panel.querySelector("[data-element='preset-list']");
  const presetSearchInput = panel.querySelector("[data-input='preset-search']");
  const presetSearchClear = panel.querySelector("[data-action='preset-search-clear']");
  const createBtn = panel.querySelector("[data-action='create-preset']");
  const saveBtnContainer = panel.querySelector("[data-element='save-btn-container']");
  const applyAllBtn = panel.querySelector("[data-action='apply-all']");
  const resetAllBtn = panel.querySelector("[data-action='reset-all']");
  const inputsList = panel.querySelector("[data-element='inputs-list']");
  const inputsSearchInput = panel.querySelector("[data-input='inputs-search']");
  const inputsSearchClear = panel.querySelector("[data-action='inputs-search-clear']");

  // Create split button for Save with auto-save popover
  const {
    container: splitBtn,
    mainBtn: saveBtn,
    caretBtn,
  } = createSplitButton({
    label: "Save",
    title: "Save changes to preset",
    caretTitle: "Save options",
    variant: "primary",
    disabled: true,
  });
  saveBtn.classList.add("rtx-remix-inputs-action-btn");
  caretBtn.classList.add("rtx-remix-inputs-action-btn");
  saveBtnContainer?.appendChild(splitBtn);

  // ============================================================
  // DIRTY STATE TRACKING
  // ============================================================
  // Note: pendingChanges, pendingDefaultChanges, pendingOverrideRemovals are module-level
  // for external access (e.g., checking before export dialog)

  // widgetCallbacks: Map<widget, originalCallback>
  // Stores original widget callbacks before wrapping, for cleanup on refresh.
  const widgetCallbacks = new Map();

  /**
   * Check if a specific key is an override for the active preset.
   * An override exists if: not default preset, not pending removal, and (has pending change OR has stored override).
   * @param {string} key - Input key in format "nodeId.slotName"
   * @returns {boolean} True if the key is an override
   */
  function isKeyOverride(key) {
    const active = getActivePreset(app);
    if (active === PRESET_KEYS.DEFAULT) return false;
    if (pendingOverrideRemovals.has(key)) return false;
    if (pendingChanges.has(key)) return true;
    const store = getPresetsStore(app);
    return store[PRESET_KEYS.PRESETS][active]?.inputs?.[key] != null;
  }

  /**
   * Check if a key has a STORED override in the current preset (ignores pending state).
   * Used to determine if pendingOverrideRemovals should be updated.
   * @param {string} key - Input key in format "nodeId.slotName"
   * @returns {boolean} True if there's a stored override for this key
   */
  function hasStoredOverride(key) {
    const active = getActivePreset(app);
    if (active === PRESET_KEYS.DEFAULT) return false;
    const store = getPresetsStore(app);
    return store[PRESET_KEYS.PRESETS][active]?.inputs?.[key] != null;
  }

  /**
   * Check if the active preset has any overrides (values different from default).
   * Takes into account pending override removals.
   * Returns true if there are overrides, false otherwise.
   */
  function hasOverrides() {
    const active = getActivePreset(app);
    if (active === PRESET_KEYS.DEFAULT) return false;
    const store = getPresetsStore(app);
    const inputs = store[PRESET_KEYS.PRESETS][active]?.inputs || {};
    // Count overrides that aren't pending removal
    const activeOverrides = Object.keys(inputs).filter((k) => !pendingOverrideRemovals.has(k));
    return activeOverrides.length > 0 || pendingChanges.size > 0;
  }

  /**
   * Apply a single input's value to the default preset immediately.
   * Writes the value to the store right away so it survives Discard.
   * The override removal remains pending (requires Save to finalize).
   * @param {string} key - Input key in format "nodeId.slotName"
   * @param {number} nodeId - Node ID
   * @param {string} slotName - Slot name
   * @param {*} value - Value to apply to default
   */
  function markInputForApplyToDefault(key, nodeId, slotName, value) {
    updatePresetValue(app, PRESET_KEYS.DEFAULT, nodeId, slotName, value);
    // Only mark for removal if there's an actual stored override
    if (hasStoredOverride(key)) {
      pendingOverrideRemovals.add(key);
    }
    pendingChanges.delete(key);
  }

  /**
   * Mark a single input to be reset to default value (pending until Save).
   * Optionally updates the widget with live preview.
   * @param {string} key - Input key in format "nodeId.slotName"
   * @param {object} widget - Optional widget to update with live preview
   */
  function markInputForReset(key, widget = null) {
    // Only mark for removal if there's an actual stored override
    if (hasStoredOverride(key)) {
      pendingOverrideRemovals.add(key);
    }
    pendingChanges.delete(key);

    // Live preview: update widget to default value
    if (widget) {
      const { nodeId, slotName } = parseInputKey(key);
      const defaultVal = getEffectiveValue(app, PRESET_KEYS.DEFAULT, nodeId, slotName);
      setIsProgrammaticChange(true);
      try {
        widget.value = defaultVal;
        widget.callback?.call(widget, defaultVal);
      } finally {
        setIsProgrammaticChange(false);
      }
    }
  }

  /**
   * Update UI state for all action buttons based on current dirty state and overrides.
   * - Save: enabled when there are pending (unsaved) changes and auto-save is OFF
   * - Apply All: enabled when current preset has overrides (values to apply to default)
   * - Reset All: enabled when current preset has overrides (values to reset)
   * Also sets tooltips explaining why buttons are disabled.
   */
  function updateButtonStates() {
    const active = getActivePreset(app);
    const isDefault = active === PRESET_KEYS.DEFAULT;
    const hasOv = hasOverrides();
    const isAutoSave = getAutoSave(app);
    // Any pending change: value changes, default changes, or override removals
    const hasPending = pendingChanges.size > 0 || pendingDefaultChanges.size > 0 || pendingOverrideRemovals.size > 0;

    // Save button: disabled when auto-save is ON or no pending changes
    if (saveBtn) {
      saveBtn.disabled = isAutoSave || !hasPending;
      if (isAutoSave) {
        saveBtn.title = "Auto-save is enabled";
      } else if (hasPending) {
        saveBtn.title = "Save changes to preset";
      } else {
        saveBtn.title = "No unsaved changes";
      }
    }

    // Apply All: disabled if Default preset OR no overrides
    if (applyAllBtn) {
      const canApply = !isDefault && hasOv;
      applyAllBtn.disabled = !canApply;
      if (isDefault) {
        applyAllBtn.title = "Cannot apply from Default Values preset";
      } else if (!hasOv) {
        applyAllBtn.title = "No overrides to apply";
      } else {
        applyAllBtn.title = "Apply all values to Default Values";
      }
    }

    // Reset All: disabled if Default preset OR no overrides
    if (resetAllBtn) {
      const canReset = !isDefault && hasOv;
      resetAllBtn.disabled = !canReset;
      if (isDefault) {
        resetAllBtn.title = "Cannot reset Default Values preset";
      } else if (!hasOv) {
        resetAllBtn.title = "No overrides to reset";
      } else {
        resetAllBtn.title = "Reset all overrides to Default Values";
      }
    }
  }

  /**
   * Mark a value as changed (dirty). Called when user edits an input.
   * A new change overrides any pending reset/apply operations for this key.
   * If auto-save is enabled, immediately saves the changes.
   * @param {string} key - Input key in format "nodeId.slotName"
   * @param {Object} value - Object with nodeId, slotName, and the new value
   */
  function markDirty(key, value) {
    pendingChanges.set(key, value);
    // New change overrides any pending reset/apply operations
    pendingOverrideRemovals.delete(key);
    pendingDefaultChanges.delete(key);
    updateButtonStates();

    // Auto-save if enabled - save immediately
    if (getAutoSave(app)) {
      performSave();
    }
  }

  /**
   * Clear all pending changes. Called after save or discard.
   */
  function clearDirty() {
    pendingChanges.clear();
    pendingDefaultChanges.clear();
    pendingOverrideRemovals.clear();
    updateButtonStates();
  }

  /**
   * Perform save operation - persist all pending changes to the preset store.
   * Extracted to allow reuse by auto-save and manual save button.
   */
  function performSave() {
    savePendingToStore(app);

    // Clear dirty state, then apply preset (which sets widget values)
    clearDirty();
    const active = getActivePreset(app);
    setIsProgrammaticChange(true);
    try {
      applyPreset(app, active);
    } finally {
      setIsProgrammaticChange(false);
    }
    refreshInputsList();
  }

  // Preset list rendering
  function refreshPresetList() {
    if (!presetListContainer) return;
    presetListContainer.innerHTML = "";

    const active = getActivePreset(app);
    let names = getPresetNames(app);

    const searchTerm = (presetSearchInput?.value?.trim() || "").toLowerCase();
    if (searchTerm) {
      names = names.filter((name) => {
        const desc = (getPresetDescription(app, name) || "").toLowerCase();
        return name.toLowerCase().includes(searchTerm) || desc.includes(searchTerm);
      });
    }

    if (names.length === 0) {
      const empty = cloneTemplate(TEMPLATE_IDS.PRESET_LIST_EMPTY);
      if (empty) presetListContainer.appendChild(empty);
      return;
    }

    names.forEach((name) => {
      const row = cloneTemplate(TEMPLATE_IDS.PRESET_LIST_ROW);
      if (!row) return;

      row.dataset.presetName = name;
      const nameEl = row.querySelector(".rtx-remix-preset-list-row-name");
      const descEl = row.querySelector(".rtx-remix-preset-list-row-desc");
      const displayName = name === PRESET_KEYS.DEFAULT ? "Default Values" : name;

      if (nameEl) nameEl.textContent = displayName;
      if (descEl) {
        const description = getPresetDescription(app, name);
        descEl.textContent = description || "";
        descEl.classList.toggle("rtx-hidden", !description);
      }

      if (name === active) {
        row.classList.add("rtx-remix-preset-list-row-active");
        row.title = "Currently active preset. Values are synchronized with the workflow inputs.";
      }

      const editBtn = row.querySelector("[data-action='preset-edit']");
      const deleteBtn = row.querySelector("[data-action='preset-delete']");
      const isDefault = name === PRESET_KEYS.DEFAULT;

      if (isDefault) {
        row.classList.add("rtx-remix-preset-list-row-default");
        if (editBtn) editBtn.disabled = true;

        // Enable delete for default only when no other presets exist AND there's data to clear
        // Tooltip explains the action or why it's disabled (dynamic based on state)
        const canClear = canClearDefaultPreset(app);
        const otherPresetsExist = hasOtherPresets(app);
        const hasData = hasPresetDataToClear(app);

        if (deleteBtn) {
          deleteBtn.disabled = !canClear;
          if (canClear) {
            deleteBtn.title = "Clear all default values and group order";
          } else if (otherPresetsExist) {
            deleteBtn.title = "Delete all other presets first to clear default values";
          } else if (!hasData) {
            deleteBtn.title = "No default values to clear";
          }
        }
      }
      // Non-default presets use the template's default title="Delete"

      row.addEventListener("mousedown", async (e) => {
        // Ignore clicks on edit/delete buttons
        if (e.target.closest("[data-action='preset-edit']") || e.target.closest("[data-action='preset-delete']")) {
          return;
        }
        e.preventDefault();

        // Do nothing if clicking the already selected preset
        if (name === getActivePreset(app)) return;

        // Warn on unsaved changes (any pending state)
        const hasPendingChanges =
          pendingChanges.size > 0 || pendingDefaultChanges.size > 0 || pendingOverrideRemovals.size > 0;
        if (hasPendingChanges) {
          const result = await showUnsavedChangesDialog();
          if (result === "cancel") return;
          if (result === "save") {
            savePendingToStore(app);
          }
          clearDirty();
        }

        setActivePreset(app, name);
        refreshPresetList();
        refreshInputsList();
      });

      editBtn?.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (isDefault) return;
        showEditPresetDialog(app, {
          isNew: false,
          currentName: name,
          currentDescription: getPresetDescription(app, name),
        }).then((result) => {
          if (!result) return;
          const { name: newName, description } = result;
          if (newName !== name) renamePreset(app, name, newName);
          setPresetDescription(app, newName, description);
          refreshPresetList();
          refreshInputsList();
        });
      });

      deleteBtn?.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (isDefault) {
          // For default preset, show clear confirmation dialog (only if allowed)
          if (!canClearDefaultPreset(app)) return;
          showClearDefaultConfirmDialog().then((confirmed) => {
            if (!confirmed) return;
            clearDefaultPresetValues(app);
            refreshPresetList();
            refreshInputsList();
          });
        } else {
          // For non-default presets, show delete confirmation dialog
          showDeletePresetConfirmDialog(name).then((confirmed) => {
            if (!confirmed) return;
            deletePreset(app, name);
            refreshPresetList();
            refreshInputsList();
          });
        }
      });

      presetListContainer.appendChild(row);
    });
  }

  // ============================================================
  // INPUTS LIST RENDERING
  // ============================================================

  // Store reference to the grouped list controller for refresh
  let groupedListInstance = null;

  /**
   * Render the tagged inputs list for the active preset.
   *
   * For each input:
   * 1. Creates the appropriate input control (select, checkbox, slider, number, text)
   * 2. Wires up change handlers to mark dirty state
   * 3. Wraps widget callbacks to sync canvas changes to the panel
   * 4. Updates override indicator state
   */
  /**
   * Filter inputs based on search term.
   * Matches against slot name, export name, node title, group, and tooltip.
   */
  function filterInputs(inputs, searchTerm) {
    if (!searchTerm) return inputs;
    const term = searchTerm.toLowerCase();
    return inputs.filter((input) => {
      return (
        input.slotName.toLowerCase().includes(term) ||
        (input.exportName || "").toLowerCase().includes(term) ||
        input.nodeTitle.toLowerCase().includes(term) ||
        (input.group || "").toLowerCase().includes(term) ||
        (input.tooltip || "").toLowerCase().includes(term)
      );
    });
  }

  function refreshInputsList() {
    if (!inputsList) return;
    inputsList.innerHTML = "";

    // CLEANUP: Restore original widget callbacks before rebuilding.
    // This prevents memory leaks and duplicate callback wrapping.
    widgetCallbacks.forEach((original, widget) => {
      widget.callback = original;
    });
    widgetCallbacks.clear();

    // Cleanup previous grouped list instance
    groupedListInstance?.cleanup();
    groupedListInstance = null;

    const active = getActivePreset(app);
    let tagged = getTaggedInputs(app);

    // Apply search filter if search term is present
    const searchTerm = inputsSearchInput?.value?.trim() || "";
    if (searchTerm) {
      tagged = filterInputs(tagged, searchTerm);
    }

    if (tagged.length === 0) {
      const empty = cloneTemplate(TEMPLATE_IDS.INPUTS_EMPTY);
      if (empty) inputsList.appendChild(empty);
      return;
    }

    // Create container for grouped list
    const container = document.createElement("div");
    container.className = "rtx-remix-grouped-list";

    // Create the grouped list using the shared controller
    groupedListInstance = createGroupedList({
      container,
      items: tagged,
      groupOrder: getGroupOrder(app),
      collapsedGroups,
      renderRow: (item, rowEl) => {
        renderPresetInputRow(item, rowEl, active);
      },
      onItemOrderChange: (groupName, orderedItems) => {
        // Update node metadata with new order values
        orderedItems.forEach((item) => {
          updateInputMetadata(app, item.nodeId, item.slotName, { order: item.order });
        });
      },
      onGroupOrderChange: (newOrder) => {
        updateGroupOrder(app, newOrder);
      },
      onGroupToggle: (groupName, isCollapsed) => {
        // collapsedGroups is already updated by the controller
      },
      onGroupMenu: async (groupName, groupItems, menuBtn) => {
        // Toggle behavior - close if already open for this anchor
        if (isPopoverOpenFor(menuBtn)) {
          closePopover();
          return;
        }

        openTemplatePopover(menuBtn, TEMPLATE_IDS.GROUP_MENU, {
          "untag-group": {
            onSelect: async () => {
              const confirmed = await showConfirmDialog({
                title: "Untag All in Group",
                message: `Are you sure you want to untag all <strong>${groupItems.length}</strong> inputs in the "<strong>${groupName || "Ungrouped"}</strong>" group?<br><br>This will remove them from all presets.`,
                confirmText: "Untag All",
                danger: true,
              });
              if (!confirmed) return;

              for (const item of groupItems) {
                const node = app.graph.getNodeById(item.nodeId);
                if (node) {
                  const slotIndex = node.inputs?.findIndex((s) => s.name === item.slotName);
                  if (slotIndex >= 0) {
                    toggleInputSlotMark(node, slotIndex, app);
                  }
                }
              }
            },
          },
        });
      },
      emptyMessage: "No inputs have been tagged for presets.",
    });

    inputsList.appendChild(container);

    // Update button states after rendering inputs
    updateButtonStates();
  }

  /**
   * Render the content of a preset input row (row delegate).
   * Adds grid cells to the provided row element.
   */
  function renderPresetInputRow(item, rowEl, active) {
    const { nodeId, slotName, exportName, nodeTitle, widget, primitiveType, comboOptions, tooltip, min, max, step } =
      item;

    // Set tooltip on row for hover display
    if (tooltip) {
      rowEl.title = tooltip;
    }

    const key = getInputKey(nodeId, slotName);

    // Check pending states
    const pendingChange = pendingChanges.get(key);
    const isPendingRemoval = pendingOverrideRemovals.has(key);
    const pendingDefaultChange = pendingDefaultChanges.get(key);

    // Priority: pendingChange (new user edit) > pendingDefaultChange (apply to default) > isPendingRemoval (reset) > stored value
    // Note: pendingDefaultChange means "apply to default" was clicked - show that value regardless of isPendingRemoval
    let effectiveVal;
    if (pendingChange !== undefined) {
      effectiveVal = pendingChange.value;
    } else if (pendingDefaultChange !== undefined) {
      // Apply to default was clicked - show the value that will become the new default
      effectiveVal = pendingDefaultChange.value;
    } else if (isPendingRemoval) {
      // Reset to default was clicked - show the default value
      effectiveVal = getEffectiveValue(app, PRESET_KEYS.DEFAULT, nodeId, slotName);
    } else {
      effectiveVal = getEffectiveValue(app, active, nodeId, slotName);
    }

    // Use centralized function to check override status
    const isOverride = isKeyOverride(key);

    // Add override indicator class to the row
    if (isOverride) {
      rowEl.classList.add("rtx-remix-override-indicator");
    }

    // Cell 1: Override indicator (inserted first, before drag handle)
    const indicatorCell = document.createElement("div");
    indicatorCell.className = "rtx-remix-indicator-cell";
    const indicator = document.createElement("div");
    indicator.className = "rtx-remix-input-row-indicator";
    indicator.dataset.element = "override-indicator";
    if (isOverride) {
      indicator.title = "Value overrides default";
    }
    indicatorCell.appendChild(indicator);
    // Insert at the beginning, before the drag handle cell
    rowEl.insertBefore(indicatorCell, rowEl.firstChild);

    // Cell 2: Label column (export name + node title)
    // Display export name (bold), show actual slot name in tooltip
    const labelCell = document.createElement("div");
    labelCell.className = "rtx-remix-label-cell";
    const labelDiv = document.createElement("div");
    labelDiv.className = "rtx-remix-input-row-col1";
    const slotLabel = document.createElement("span");
    slotLabel.className = "rtx-remix-input-row-slot";
    slotLabel.textContent = exportName || slotName;
    // Tooltip shows actual node input name if different from export name
    if (exportName && exportName !== slotName) {
      slotLabel.title = `Node input slot name: "${slotName}"`;
    }
    const nodeLabel = document.createElement("span");
    nodeLabel.className = "rtx-remix-input-row-node";
    nodeLabel.textContent = nodeTitle;
    labelDiv.appendChild(slotLabel);
    labelDiv.appendChild(nodeLabel);
    labelCell.appendChild(labelDiv);
    rowEl.appendChild(labelCell);

    // Cell 3: Input wrap
    const inputCell = document.createElement("div");
    inputCell.className = "rtx-remix-input-cell";
    const inputWrap = document.createElement("div");
    inputWrap.className = "rtx-remix-input-row-col2";
    inputWrap.dataset.element = "input-wrap";

    let inputEl;
    let valueLabel = null;

    // Create appropriate input control
    if (comboOptions && comboOptions.length > 0) {
      inputEl = document.createElement("select");
      inputEl.className = "rtx-remix-preset-input";
      comboOptions.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (String(opt) === String(effectiveVal)) o.selected = true;
        inputEl.appendChild(o);
      });
      inputWrap.appendChild(inputEl);
    } else if (primitiveType === "bool") {
      inputEl = document.createElement("input");
      inputEl.type = "checkbox";
      inputEl.className = "rtx-remix-preset-input";
      inputEl.checked = !!effectiveVal;
      inputWrap.appendChild(inputEl);
    } else if (primitiveType === "float") {
      // Float slider with editable value input
      const sliderWrap = cloneTemplate(TEMPLATE_IDS.SLIDER_INPUT);
      if (sliderWrap) {
        inputEl = sliderWrap.querySelector("[data-element='slider']");
        valueLabel = sliderWrap.querySelector("[data-element='value']");
        // Use metadata values if set, otherwise fall back to widget options
        const minVal = min ?? widget?.options?.min ?? 0;
        const maxVal = max ?? widget?.options?.max ?? 1;
        const stepVal = step ?? widget?.options?.step ?? 0.01;

        if (inputEl) {
          inputEl.min = minVal;
          inputEl.max = maxVal;
          inputEl.step = stepVal;
          inputEl.value = effectiveVal ?? 0;
        }

        if (valueLabel) {
          valueLabel.min = minVal;
          valueLabel.max = maxVal;
          valueLabel.step = stepVal;
          valueLabel.value = Number(effectiveVal ?? 0).toFixed(2);

          // Sync: slider updates value input
          inputEl?.addEventListener("input", () => {
            valueLabel.value = Number(inputEl.value).toFixed(2);
          });

          // Sync: value input updates slider
          valueLabel.addEventListener("input", () => {
            const val = parseFloat(valueLabel.value) || 0;
            inputEl.value = val;
          });

          // When value input changes (blur/enter), trigger slider's change event
          valueLabel.addEventListener("change", () => {
            const val = parseFloat(valueLabel.value) || 0;
            inputEl.value = val;
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
          });
        }

        inputWrap.appendChild(sliderWrap);
      }
    } else if (primitiveType === "int") {
      inputEl = document.createElement("input");
      inputEl.type = "number";
      inputEl.className = "rtx-remix-preset-input";
      inputEl.value = effectiveVal;
      inputEl.step = "1";
      inputWrap.appendChild(inputEl);
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.className = "rtx-remix-preset-input";
      inputEl.value = effectiveVal ?? "";
      inputWrap.appendChild(inputEl);
    }

    inputCell.appendChild(inputWrap);
    rowEl.appendChild(inputCell);

    // Cell 4: Menu button (using shared utility)
    const { cell: menuCell, button: menuBtn } = createButtonCell({
      iconClass: "pi pi-ellipsis-v",
      title: "More options",
      action: "input-menu",
      cellClass: "rtx-remix-menu-cell",
      buttonClass: "rtx-remix-input-menu-btn",
    });
    rowEl.appendChild(menuCell);

    // Value change handler - marks dirty, updates widget, and updates override indicator
    if (inputEl) {
      const handleChange = () => {
        let val;
        if (inputEl.type === "checkbox") val = inputEl.checked;
        else if (inputEl.type === "range") val = parseFloat(inputEl.value);
        else if (inputEl.type === "number")
          val = primitiveType === "int" ? parseInt(inputEl.value, 10) : parseFloat(inputEl.value);
        else val = inputEl.value;

        markDirty(key, { nodeId, slotName, value: val });

        // Live update: apply value to graph widget immediately for preview
        if (widget) {
          withProgrammaticChange(() => {
            widget.value = val;
            widget.callback?.call(widget, val);
          });
          app.graph.setDirtyCanvas?.(true, true);
        }

        // Update override indicator immediately when value changes (shows pending override)
        if (active !== PRESET_KEYS.DEFAULT) {
          rowEl.classList.add("rtx-remix-override-indicator");
          if (indicator) indicator.title = "Value overrides default";
        }
      };

      inputEl.addEventListener("change", handleChange);
      if (inputEl.type === "range") {
        inputEl.addEventListener("input", handleChange);
      }
    }

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      // Toggle behavior - close if already open for this anchor
      if (isPopoverOpenFor(menuBtn)) {
        closePopover();
        return;
      }

      // Build menu items with dynamic enable/disable state
      const currentActive = getActivePreset(app);
      const currentIsOverride = isKeyOverride(key);
      const isDefault = currentActive === PRESET_KEYS.DEFAULT;

      // Get current effective value for apply action
      const currentEffectiveVal = pendingChanges.has(key)
        ? pendingChanges.get(key).value
        : getEffectiveValue(app, currentActive, nodeId, slotName);

      openTemplatePopover(menuBtn, TEMPLATE_IDS.INPUT_MENU, {
        "focus-node": {
          onSelect: () => {
            const node = app.graph.getNodeById(nodeId);
            if (node) {
              app.canvas.centerOnNode(node);
              app.canvas.selectNode(node, false);
              app.canvas.setDirty(true, true);
            }
          },
        },
        "edit-metadata": {
          onSelect: async () => {
            await showEditGlobalSettingsDialog({
              app,
              nodeId,
              slotName,
              nodeTitle,
              onSave: () => {
                // Refresh to pick up any group/order changes
                refreshInputsList();
              },
            });
          },
        },
        "apply-to-default": {
          disabled: isDefault || !currentIsOverride,
          tooltip: isDefault
            ? "Cannot apply when Default Values preset is selected"
            : !currentIsOverride
              ? "No override to apply"
              : undefined,
          onSelect: () => {
            markInputForApplyToDefault(key, nodeId, slotName, currentEffectiveVal);
            updateButtonStates();
            refreshInputsList();
            // Auto-save if enabled
            if (getAutoSave(app)) {
              performSave();
            }
          },
        },
        "reset-to-default": {
          disabled: isDefault || !currentIsOverride,
          tooltip: isDefault
            ? "Cannot reset when Default Values preset is selected"
            : !currentIsOverride
              ? "No override to reset"
              : undefined,
          onSelect: () => {
            markInputForReset(key, widget);
            app.graph.setDirtyCanvas?.(true, true);
            updateButtonStates();
            refreshInputsList();
            // Auto-save if enabled
            if (getAutoSave(app)) {
              performSave();
            }
          },
        },
        "untag-input": {
          onSelect: async () => {
            const confirmed = await showConfirmDialog({
              title: "Untag Input",
              message: `Are you sure you want to untag "<strong>${exportName || slotName}</strong>" from <strong>${nodeTitle}</strong>?<br><br>This will remove the input from all presets.`,
              confirmText: "Untag",
              danger: true,
            });
            if (!confirmed) return;

            const node = app.graph.getNodeById(nodeId);
            if (node) {
              const slotIndex = node.inputs?.findIndex((s) => s.name === slotName);
              if (slotIndex >= 0) {
                toggleInputSlotMark(node, slotIndex, app);
              }
            }
          },
        },
      });
    });

    // Wrap widget callback to detect graph changes from the canvas
    // This syncs canvas widget edits to the preset panel
    if (widget && inputEl) {
      const originalCallback = widget.callback;
      widgetCallbacks.set(widget, originalCallback);
      widget.callback = function (value) {
        originalCallback?.call(this, value);

        // Only mark dirty if this is a USER-initiated change, not programmatic
        if (!isProgrammaticChange()) {
          markDirty(key, { nodeId, slotName, value });

          // Update override indicator only for user changes
          if (active !== PRESET_KEYS.DEFAULT) {
            rowEl.classList.add("rtx-remix-override-indicator");
            if (indicator) indicator.title = "Value overrides default";
          }
        }

        // Always update input display to match graph widget value
        if (inputEl.type === "checkbox") {
          inputEl.checked = !!value;
        } else if (inputEl.type === "range") {
          inputEl.value = value;
          if (valueLabel) valueLabel.value = Number(value).toFixed(2);
        } else {
          inputEl.value = value ?? "";
        }
      };
    }
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  // Search filter for preset list
  presetSearchInput?.addEventListener("input", () => {
    const hasValue = !!presetSearchInput.value?.trim();
    presetSearchClear?.classList.toggle("is-hidden", !hasValue);
    refreshPresetList();
  });

  presetSearchClear?.addEventListener("click", () => {
    if (!presetSearchInput) return;
    presetSearchInput.value = "";
    presetSearchClear.classList.add("is-hidden");
    refreshPresetList();
    presetSearchInput.focus();
  });

  // Search filter for inputs list
  inputsSearchInput?.addEventListener("input", () => {
    const hasValue = !!inputsSearchInput.value?.trim();
    inputsSearchClear?.classList.toggle("is-hidden", !hasValue);
    refreshInputsList();
  });

  inputsSearchClear?.addEventListener("click", () => {
    if (!inputsSearchInput) return;
    inputsSearchInput.value = "";
    inputsSearchClear.classList.add("is-hidden");
    refreshInputsList();
    inputsSearchInput.focus();
  });

  // Save button: persist all pending changes to the preset store
  saveBtn?.addEventListener("click", () => performSave());

  // Caret button: toggle popover with save options
  caretBtn?.addEventListener("click", (e) => {
    e.stopPropagation();

    // Toggle behavior - close if already open for this anchor
    if (isPopoverOpenFor(caretBtn)) {
      closePopover();
      return;
    }

    const hasPending = pendingChanges.size > 0 || pendingDefaultChanges.size > 0 || pendingOverrideRemovals.size > 0;
    const isAutoSave = getAutoSave(app);

    const content = cloneTemplate(TEMPLATE_IDS.SAVE_MENU);
    if (!content) return;

    // Configure discard action
    const discardRow = content.querySelector('[data-action="discard"]');
    if (!hasPending) {
      discardRow.classList.add("rtx-remix-popover-item-disabled");
      discardRow.title = "No unsaved changes to discard";
    } else {
      discardRow.addEventListener("click", () => {
        closePopover();
        clearDirty();
        withProgrammaticChange(() => applyPreset(app, getActivePreset(app)));
        refreshInputsList();
      });
    }

    // Configure auto-save checkbox
    const checkbox = content.querySelector('[data-element="auto-save-checkbox"]');
    checkbox.checked = isAutoSave;
    checkbox.addEventListener("change", () => {
      const wasEnabled = getAutoSave(app);
      toggleAutoSave(app, checkbox.checked);
      updateButtonStates();

      // If auto-save was just enabled and there are pending changes, save them immediately
      if (checkbox.checked && !wasEnabled && hasPendingPresetChanges()) {
        performSave();
      }

      closePopover();
    });

    openPopoverWithContent(caretBtn, content);
  });

  // Apply All: mark all current overrides to be applied to default (pending until Save)
  applyAllBtn?.addEventListener("click", async () => {
    const active = getActivePreset(app);
    if (active === PRESET_KEYS.DEFAULT) return;

    const confirmed = await showApplyAllConfirmDialog();
    if (!confirmed) return;

    const store = getPresetsStore(app);
    const activeInputs = store[PRESET_KEYS.PRESETS][active]?.inputs || {};

    // For each tagged input that has an override, mark for apply to default
    getTaggedInputs(app).forEach(({ nodeId, slotName, widget }) => {
      if (!widget) return;
      const key = getInputKey(nodeId, slotName);

      if (isKeyOverride(key)) {
        // Get effective value (pending change takes priority over stored)
        const effectiveVal = pendingChanges.has(key)
          ? pendingChanges.get(key).value
          : (activeInputs[key]?.[PRESET_KEYS.VALUE] ?? widget.value);

        markInputForApplyToDefault(key, nodeId, slotName, effectiveVal);
      }
    });

    updateButtonStates();
    refreshInputsList();

    // Auto-save if enabled (after all changes are marked)
    if (getAutoSave(app)) {
      performSave();
    }
  });

  // Reset All: mark all overrides to be removed (pending until Save)
  resetAllBtn?.addEventListener("click", async () => {
    const active = getActivePreset(app);
    if (active === PRESET_KEYS.DEFAULT) return;

    const confirmed = await showResetAllConfirmDialog();
    if (!confirmed) return;

    // For each tagged input that has an override, mark for removal with live preview
    getTaggedInputs(app).forEach(({ nodeId, slotName, widget }) => {
      if (!widget) return;
      const key = getInputKey(nodeId, slotName);

      if (isKeyOverride(key)) {
        markInputForReset(key, widget);
      }
    });

    app.graph.setDirtyCanvas?.(true, true);
    updateButtonStates();
    refreshInputsList();

    // Auto-save if enabled (after all changes are marked)
    if (getAutoSave(app)) {
      performSave();
    }
  });

  // Focus fix: prevent ComfyUI from stealing focus on text inputs
  // Only protect actual input fields, not buttons - buttons don't need focus protection
  // and intercepting them interferes with native drag behavior
  inputsList?.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target.closest("input, select");
      if (!target) return;

      // Don't interfere with range sliders or select dropdowns - they need native behavior
      if (target.type === "range" || target.tagName === "SELECT") {
        e.stopPropagation();
        return;
      }

      // For text/number/checkbox inputs, prevent default and manually focus
      e.preventDefault();
      target.focus();
      e.stopPropagation();
    },
    true
  );

  createBtn?.addEventListener("click", () => {
    showEditPresetDialog(app, { isNew: true, currentName: "", currentDescription: "" }).then((result) => {
      if (!result) return;
      const { name, description } = result;
      createPreset(app, name);
      setPresetDescription(app, name, description);
      setActivePreset(app, name);
      refreshPresetList();
      refreshInputsList();
    });
  });

  // Initial render
  refreshPresetList();
  refreshInputsList();

  // Listen for graph changes
  const onGraphChanged = () => {
    cleanupDeletedInputs(app);
    refreshPresetList();
    refreshInputsList();
  };
  app.api.addEventListener?.("graphChanged", onGraphChanged);

  // Subscribe to input tag events from slotMarkingCore
  setOnInputTagChanged(({ action, nodeId, slotName, app: eventApp }) => {
    if (action === "tagged") {
      // Register newly tagged input to default preset
      registerNewlyTaggedInput(eventApp, nodeId, slotName);
    }
    // Clean up deleted inputs and refresh the list
    cleanupDeletedInputs(eventApp);
    refreshInputsList();
  });

  // Listen for metadata changes (e.g., min/max/step edited in dialog, group changes)
  const onMetadataChanged = () => {
    // Clean up orphaned groups from groupOrder when groups are removed from inputs
    cleanupDeletedInputs(app);
    refreshInputsList();
  };
  app.api.addEventListener?.(EVENTS.METADATA_CHANGED, onMetadataChanged);

  // Listen for preset value changes (e.g., after saving) to update button states
  const onPresetValueChanged = () => {
    refreshPresetList();
  };
  app.api.addEventListener?.(EVENTS.PRESET_VALUE_CHANGED, onPresetValueChanged);

  // Listen for preset changes (create, delete, clear) to update button states
  const onPresetChanged = () => {
    refreshPresetList();
  };
  app.api.addEventListener?.(EVENTS.PRESET_CHANGED, onPresetChanged);

  // Store cleanup function for next render
  sidebarCleanup = () => {
    app.api.removeEventListener?.("graphChanged", onGraphChanged);
    app.api.removeEventListener?.(EVENTS.METADATA_CHANGED, onMetadataChanged);
    app.api.removeEventListener?.(EVENTS.PRESET_VALUE_CHANGED, onPresetValueChanged);
    app.api.removeEventListener?.(EVENTS.PRESET_CHANGED, onPresetChanged);
    setOnInputTagChanged(null);
  };

  // Mount panel and focus for keyboard events
  el.innerHTML = "";
  el.classList.add("rtx-flex", "rtx-flex-col");
  el.style.height = "100%";
  el.appendChild(panel);
  el.tabIndex = -1;
  el.focus();
}
