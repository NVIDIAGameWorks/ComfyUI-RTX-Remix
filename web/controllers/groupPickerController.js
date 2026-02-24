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

import { cloneTemplate, bindTemplateData } from "../utils/html.js";
import { showConfirmDialog } from "./baseDialogController.js";
import { getExistingGroups } from "../cores/metadataEditorCore.js";
import { TEMPLATE_IDS } from "../utils/constants.js";

// Track active dropdown for global cleanup
let activeDropdown = null;
let activeCleanup = null;

/**
 * Close the currently open group picker dropdown, if any.
 */
export function closeGroupPicker() {
  if (activeDropdown) {
    activeDropdown.classList.add("rtx-hidden");
  }
  activeCleanup?.();
  activeDropdown = null;
  activeCleanup = null;
}

/**
 * Create a custom group picker dropdown with inline editing capabilities.
 *
 * @param {Object} options
 * @param {Object} options.app - ComfyUI app instance
 * @param {string} options.currentValue - Currently selected group (null/empty = Ungrouped)
 * @param {Function} options.onChange - Called when selection changes: (newGroup) => void
 * @param {Function} [options.onGroupDelete] - Called when group is deleted: (groupName) => void
 * @param {Function} [options.onGroupRename] - Called when group is renamed: (oldName, newName) => void
 * @returns {HTMLElement} The group picker element
 */
export function createGroupPicker(options) {
  const { app, currentValue, onChange, onGroupDelete, onGroupRename } = options;

  const container = cloneTemplate(TEMPLATE_IDS.GROUP_PICKER);
  if (!container) {
    console.error("Failed to load group picker template");
    return document.createElement("div");
  }

  const trigger = container.querySelector("[data-element='trigger']");
  const dropdown = container.querySelector("[data-element='dropdown']");
  const selectedLabel = container.querySelector("[data-bind='selectedGroup']");

  // Store current selected value
  let selectedGroup = currentValue || "";
  container.dataset.selectedGroup = selectedGroup;

  // Update the trigger label
  function updateTriggerLabel() {
    if (selectedLabel) {
      selectedLabel.textContent = selectedGroup || "Ungrouped";
    }
  }
  updateTriggerLabel();

  /**
   * Render the dropdown options
   */
  function renderOptions() {
    dropdown.innerHTML = "";

    // Add "Ungrouped" option (no icons)
    const ungroupedOption = cloneTemplate(TEMPLATE_IDS.GROUP_PICKER_OPTION);
    if (ungroupedOption) {
      bindTemplateData(ungroupedOption, { groupName: "Ungrouped" });
      ungroupedOption.dataset.group = "";
      // Hide actions for ungrouped
      const actions = ungroupedOption.querySelector(".rtx-remix-group-picker-option-actions");
      if (actions) actions.classList.add("rtx-hidden");

      ungroupedOption.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return;
        selectGroup("");
      });
      dropdown.appendChild(ungroupedOption);
    }

    // Add existing groups
    const existingGroups = app ? getExistingGroups(app) : [];
    existingGroups.forEach((groupName) => {
      const option = cloneTemplate(TEMPLATE_IDS.GROUP_PICKER_OPTION);
      if (!option) return;

      bindTemplateData(option, { groupName });
      option.dataset.group = groupName;

      // Handle group selection
      option.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return;
        selectGroup(groupName);
      });

      // Handle rename action
      const renameBtn = option.querySelector("[data-action='rename']");
      if (renameBtn) {
        renameBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showInlineInput(option, groupName, "rename");
        });
      }

      // Handle delete action
      const deleteBtn = option.querySelector("[data-action='delete']");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const confirmed = await showConfirmDialog({
            title: "Delete Group",
            message: `Are you sure you want to delete the group "<strong>${groupName}</strong>"?<br><br>All inputs in this group will be moved to <strong>Ungrouped</strong>.`,
            confirmText: "Delete",
            cancelText: "Cancel",
            danger: true,
          });
          if (confirmed) {
            onGroupDelete?.(groupName);
            // If current selection was this group, reset to ungrouped
            if (selectedGroup === groupName) {
              selectGroup("");
            }
            renderOptions();
          }
        });
      }

      dropdown.appendChild(option);
    });

    // Add "Create new group" option
    const createOption = cloneTemplate(TEMPLATE_IDS.GROUP_PICKER_CREATE);
    if (createOption) {
      createOption.addEventListener("click", () => {
        showInlineInput(createOption, "", "create");
      });
      dropdown.appendChild(createOption);
    }
  }

  /**
   * Show inline input for creating or renaming a group
   */
  function showInlineInput(targetElement, existingName, mode) {
    const inputRow = cloneTemplate(TEMPLATE_IDS.GROUP_PICKER_INPUT);
    if (!inputRow) return;

    const input = inputRow.querySelector("[data-element='input']");
    const confirmBtn = inputRow.querySelector("[data-action='confirm']");
    const cancelBtn = inputRow.querySelector("[data-action='cancel']");

    if (input) {
      input.value = existingName;
      input.placeholder = mode === "create" ? "New group name" : "Group name";
    }

    // Replace target element with input row
    targetElement.classList.add("rtx-hidden");
    targetElement.parentElement.insertBefore(inputRow, targetElement.nextSibling);

    // Focus input
    setTimeout(() => input?.focus(), 0);

    function cleanup() {
      inputRow.remove();
      targetElement.classList.remove("rtx-hidden");
    }

    function confirm() {
      const newName = input?.value?.trim();
      if (!newName) {
        cleanup();
        return;
      }

      if (mode === "create") {
        selectGroup(newName);
      } else if (mode === "rename" && newName !== existingName) {
        onGroupRename?.(existingName, newName);
        // If current selection was renamed, update it
        if (selectedGroup === existingName) {
          selectedGroup = newName;
          container.dataset.selectedGroup = newName;
          updateTriggerLabel();
          onChange?.(newName);
        }
        renderOptions();
      }
      cleanup();
    }

    confirmBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      confirm();
    });

    cancelBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      cleanup();
    });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
      }
    });
  }

  /**
   * Select a group and close dropdown
   */
  function selectGroup(groupName) {
    selectedGroup = groupName;
    container.dataset.selectedGroup = groupName;
    updateTriggerLabel();
    onChange?.(groupName || null); // null for ungrouped to delete metadata
    closeDropdown();
  }

  /**
   * Open the dropdown
   */
  function openDropdown() {
    // Close any other open dropdown
    closeGroupPicker();

    renderOptions();
    dropdown.classList.remove("rtx-hidden");

    // Use fixed positioning for better behavior in scrollable containers
    const triggerRect = trigger.getBoundingClientRect();
    const dropdownHeight = dropdown.offsetHeight;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const maxHeight = 200; // Max height before scrolling

    dropdown.style.position = "fixed";
    dropdown.style.left = `${triggerRect.left}px`;
    dropdown.style.setProperty("width", `${triggerRect.width}px`, "important");
    dropdown.style.maxHeight = `${maxHeight}px`;
    dropdown.style.overflowY = "auto";
    dropdown.style.zIndex = "10000"; // Higher than dialog overlay

    // Position below or above based on available space
    if (spaceBelow >= Math.min(dropdownHeight, maxHeight) || spaceBelow >= spaceAbove) {
      // Position below
      dropdown.style.top = `${triggerRect.bottom + 4}px`;
      dropdown.style.bottom = "auto";
    } else {
      // Position above
      dropdown.style.top = "auto";
      dropdown.style.bottom = `${viewportHeight - triggerRect.top + 4}px`;
    }

    // Setup close handlers
    const onDocClick = (e) => {
      if (!container.contains(e.target)) {
        closeDropdown();
      }
    };

    const onEscape = (e) => {
      if (e.key === "Escape") {
        closeDropdown();
      }
    };

    // Delay adding listener to prevent immediate close
    setTimeout(() => {
      document.addEventListener("mousedown", onDocClick, true);
      document.addEventListener("keydown", onEscape);
    }, 0);

    activeDropdown = dropdown;
    activeCleanup = () => {
      document.removeEventListener("mousedown", onDocClick, true);
      document.removeEventListener("keydown", onEscape);
    };
  }

  /**
   * Close the dropdown
   */
  function closeDropdown() {
    dropdown.classList.add("rtx-hidden");
    activeCleanup?.();
    activeDropdown = null;
    activeCleanup = null;
  }

  // Toggle dropdown on trigger click
  trigger?.addEventListener("click", () => {
    if (dropdown.classList.contains("rtx-hidden")) {
      openDropdown();
    } else {
      closeDropdown();
    }
  });

  return container;
}
