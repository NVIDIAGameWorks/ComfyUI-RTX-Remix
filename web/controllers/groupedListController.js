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

import { cloneTemplate } from "../utils/html.js";
import { TEMPLATE_IDS } from "../utils/constants.js";

// Special group name for ungrouped items
const UNGROUPED = "";
const UNGROUPED_DISPLAY = "Ungrouped";

/**
 * Group items by their group property.
 * @param {Array} items - Items with `group` property
 * @returns {Map<string, Array>} Map of groupName -> items (sorted by order within each group)
 */
export function groupItemsByGroup(items) {
  const groups = new Map();

  items.forEach((item) => {
    const groupName = item.group || UNGROUPED;
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(item);
  });

  // Sort items within each group by order
  groups.forEach((groupItems) => {
    groupItems.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  });

  return groups;
}

/**
 * Get sorted group names based on explicit order and alphabetical fallback.
 * Ungrouped is always first.
 * @param {Map<string, Array>} groupedItems - Map from groupItemsByGroup
 * @param {string[]} explicitOrder - Explicit group order from metadata
 * @returns {string[]} Sorted group names
 */
function getSortedGroupNames(groupedItems, explicitOrder = []) {
  const allGroups = Array.from(groupedItems.keys());
  const result = [];

  // Ungrouped always first
  if (allGroups.includes(UNGROUPED)) {
    result.push(UNGROUPED);
  }

  // Add groups in explicit order
  explicitOrder.forEach((group) => {
    if (allGroups.includes(group) && group !== UNGROUPED && !result.includes(group)) {
      result.push(group);
    }
  });

  // Add remaining groups alphabetically
  allGroups
    .filter((g) => !result.includes(g))
    .sort()
    .forEach((group) => {
      result.push(group);
    });

  return result;
}

/**
 * Create a grouped, reorderable list component using CSS Grid layout.
 * Renders into a container <div> element, with one group <div> per group.
 *
 * @param {Object} options
 * @param {HTMLElement} options.container - Container element to render into (will be cleared)
 * @param {Array<Object>} options.items - Items to display [{nodeId, slotName, group, order, ...customData}]
 * @param {Array<string>} [options.groupOrder] - Explicit group order (groups not listed appear after, alphabetically)
 * @param {Function} options.renderRow - Row delegate: (item, rowEl: HTMLDivElement) => void
 * @param {Function} [options.renderHeader] - Optional: (headerRow: HTMLDivElement) => void - Renders column header cells
 * @param {Function} [options.renderCompanionRow] - Optional: (item, rowEl) => HTMLElement|null - Returns companion row to insert after main row
 * @param {string} [options.companionRowClass] - CSS class to identify companion rows (for drag handling)
 * @param {Function} options.onItemOrderChange - Called when item order changes within a group: (groupName, orderedItems) => void
 * @param {Function} [options.onGroupOrderChange] - Called when groups are reordered: (newOrder: string[]) => void
 * @param {Set<string>} [options.collapsedGroups] - Optional external collapsed state
 * @param {Function} [options.onGroupToggle] - Called when group is toggled: (groupName, isCollapsed) => void
 * @param {Function} [options.onGroupMenu] - Called when group menu button is clicked: (groupName, groupItems, menuBtn) => void
 * @param {string} [options.emptyMessage] - Message when no items
 * @returns {{refresh: Function, cleanup: Function, getItems: Function}}
 */
export function createGroupedList(options) {
  const {
    container,
    items,
    groupOrder = [],
    renderRow,
    renderHeader,
    renderCompanionRow,
    companionRowClass = "rtx-remix-companion-row",
    onItemOrderChange,
    onGroupOrderChange,
    collapsedGroups = new Set(),
    onGroupToggle,
    onGroupMenu,
    emptyMessage = "No items to display",
  } = options;

  let currentItems = [...items];
  let draggedRow = null;
  let draggedGroup = null;
  let dragPlaceholder = null;
  let preDragCollapsedState = null; // Saved collapsed state before group drag
  let dragOccurred = false; // Flag to prevent click handler from toggling during drag

  // Track document-level event listeners for cleanup
  const documentListeners = [];

  /**
   * Render the entire list
   */
  function render() {
    container.innerHTML = "";

    // Render optional header row first (above all groups)
    if (renderHeader) {
      const headerRow = document.createElement("div");
      headerRow.className = "rtx-remix-list-row rtx-remix-list-header";
      renderHeader(headerRow);
      container.appendChild(headerRow);
    }

    if (currentItems.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "rtx-remix-grouped-list-empty";
      emptyDiv.textContent = emptyMessage;
      container.appendChild(emptyDiv);
      return;
    }

    const groupedItems = groupItemsByGroup(currentItems);
    const sortedGroups = getSortedGroupNames(groupedItems, groupOrder);

    sortedGroups.forEach((groupName) => {
      const groupItems = groupedItems.get(groupName);
      if (!groupItems || groupItems.length === 0) return;

      const groupEl = renderGroup(groupName, groupItems);
      container.appendChild(groupEl);
    });
  }

  /**
   * Render a single group
   */
  function renderGroup(groupName, groupItems) {
    const groupEl = cloneTemplate(TEMPLATE_IDS.GROUPED_LIST_GROUP);
    if (!groupEl) {
      // Fallback if template not loaded
      const fallbackGroup = document.createElement("div");
      fallbackGroup.className = "rtx-remix-list-group";
      return fallbackGroup;
    }

    groupEl.dataset.groupName = groupName;
    const isCollapsed = collapsedGroups.has(groupName);
    const isUngrouped = groupName === UNGROUPED;

    // Apply collapsed class
    if (isCollapsed) {
      groupEl.classList.add("rtx-remix-group-collapsed");
    }

    // Mark ungrouped for CSS styling (pinned to top, can't be dragged)
    if (isUngrouped) {
      groupEl.classList.add("rtx-remix-group-ungrouped");
    }

    // Update header
    const headerBtn = groupEl.querySelector("[data-action='toggle-group']");
    const dragHandle = groupEl.querySelector("[data-element='group-drag-handle']");
    const chevron = groupEl.querySelector(".rtx-remix-group-chevron");
    const nameEl = groupEl.querySelector("[data-bind='groupName']");
    const countEl = groupEl.querySelector("[data-bind='groupCount']");

    if (nameEl) nameEl.textContent = isUngrouped ? UNGROUPED_DISPLAY : groupName;
    if (countEl) countEl.textContent = `(${groupItems.length})`;
    if (chevron) chevron.textContent = isCollapsed ? "▶" : "▼";
    if (headerBtn) {
      headerBtn.setAttribute("aria-expanded", !isCollapsed);
      headerBtn.addEventListener("click", (e) => {
        // Don't toggle if click was on the drag handle
        if (e.target.closest("[data-element='group-drag-handle']")) {
          return;
        }
        // Don't toggle if click was on the menu button
        if (e.target.closest("[data-action='group-menu']")) {
          return;
        }
        // Don't toggle if we just finished a drag operation
        if (dragOccurred) {
          dragOccurred = false;
          return;
        }
        toggleGroup(groupName);
      });
    }

    // Setup group dragging via drag handle (except ungrouped)
    if (!isUngrouped && headerBtn && dragHandle) {
      setupGroupDragHandlers(headerBtn, dragHandle, groupName);
    }

    // Setup group menu button (if present in template)
    const menuBtn = groupEl.querySelector("[data-action='group-menu']");
    if (menuBtn && onGroupMenu) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onGroupMenu(groupName, groupItems, menuBtn);
      });
    }

    // Get items container
    const itemsContainer = groupEl.querySelector(".rtx-remix-group-items");
    if (!itemsContainer) return groupEl;

    // Render items (only if not collapsed)
    if (!isCollapsed) {
      groupItems.forEach((item) => {
        const row = renderItemRow(item, groupName);
        itemsContainer.appendChild(row);

        // If a companion row renderer is provided, add companion row after main row
        if (renderCompanionRow) {
          const companion = renderCompanionRow(item, row);
          if (companion) {
            companion.classList.add(companionRowClass);
            itemsContainer.appendChild(companion);
          }
        }
      });
    }

    return groupEl;
  }

  /**
   * Render a single item row
   */
  function renderItemRow(item, groupName) {
    const row = cloneTemplate(TEMPLATE_IDS.GROUPED_LIST_ROW);
    if (!row) {
      // Fallback if template not loaded
      const fallbackRow = document.createElement("div");
      fallbackRow.className = "rtx-remix-list-row";
      return fallbackRow;
    }

    row.dataset.nodeId = item.nodeId;
    row.dataset.slotName = item.slotName;
    row.dataset.group = groupName;

    // Track if drag started from the handle
    let dragFromHandle = false;

    // Setup drag handle
    const dragHandle = row.querySelector("[data-element='drag-handle']");
    if (dragHandle) {
      dragHandle.addEventListener("mousedown", (e) => {
        dragFromHandle = true;
        // Don't stop propagation - let row mousedown set row.draggable = true
      });

      dragHandle.addEventListener("mouseup", () => {
        // Reset after a short delay to allow dragstart to check the flag
        setTimeout(() => {
          dragFromHandle = false;
        }, 100);
      });
    } else {
      console.warn("[GroupedList] No drag handle found for row:", item.slotName);
    }

    // Row should NOT be draggable by default - only when drag handle is used
    row.draggable = false;

    // Make row draggable only when drag handle is pressed
    row.addEventListener("mousedown", (e) => {
      if (e.target.closest("[data-element='drag-handle']")) {
        row.draggable = true;
      } else {
        row.draggable = false;
      }
    });

    // Setup drag handlers
    setupRowDragHandlers(row, item, groupName, () => dragFromHandle);

    // Call the row delegate to populate custom content
    renderRow(item, row);

    return row;
  }

  /**
   * Get companion row following a main row (if any)
   */
  function getCompanionRow(mainRow) {
    const next = mainRow.nextElementSibling;
    return next?.classList.contains(companionRowClass) ? next : null;
  }

  /**
   * Setup drag handlers for item rows
   */
  function setupRowDragHandlers(row, item, groupName, isDragFromHandle) {
    row.addEventListener("dragstart", (e) => {
      // Only allow drag from the handle
      if (!isDragFromHandle || !isDragFromHandle()) {
        e.preventDefault();
        return;
      }

      draggedRow = row;
      draggedGroup = null;
      row.classList.add("rtx-remix-dragging");

      // Also mark companion row as dragging
      const companion = getCompanionRow(row);
      if (companion) companion.classList.add("rtx-remix-dragging");

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `item:${item.nodeId}:${item.slotName}`);

      // Create placeholder
      dragPlaceholder = document.createElement("div");
      dragPlaceholder.className = "rtx-remix-drag-placeholder";
    });

    row.addEventListener("dragend", (e) => {
      row.classList.remove("rtx-remix-dragging");
      row.draggable = false; // Reset draggable state

      // Also unmark companion row
      const companion = getCompanionRow(row);
      if (companion) companion.classList.remove("rtx-remix-dragging");

      cleanupDrag();
    });

    row.addEventListener("dragover", (e) => {
      // During group drag, let event bubble to container
      if (draggedGroup) {
        return;
      }

      if (!draggedRow) {
        // No drag in progress
        return;
      }

      // Skip if target is a companion row
      if (row.classList.contains(companionRowClass)) return;

      // Only allow drop within same group
      const targetGroup = row.dataset.group;
      const sourceGroup = draggedRow.dataset.group;
      if (targetGroup !== sourceGroup) {
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      // Position placeholder
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      // Skip companion row when positioning
      const targetCompanion = getCompanionRow(row);

      if (e.clientY < midY) {
        row.parentElement.insertBefore(dragPlaceholder, row);
      } else {
        // Insert after companion if it exists
        const insertAfter = targetCompanion || row;
        row.parentElement.insertBefore(dragPlaceholder, insertAfter.nextSibling);
      }
    });

    row.addEventListener("drop", (e) => {
      if (!draggedRow || draggedGroup) return;
      e.preventDefault();

      const targetGroup = row.dataset.group;
      const sourceGroup = draggedRow.dataset.group;
      if (targetGroup !== sourceGroup) return;

      // Get companion rows
      const draggedCompanion = getCompanionRow(draggedRow);

      // Move the row to placeholder position
      if (dragPlaceholder && dragPlaceholder.parentElement) {
        dragPlaceholder.parentElement.insertBefore(draggedRow, dragPlaceholder);
        // Also move companion row if it exists
        if (draggedCompanion) {
          draggedRow.parentElement.insertBefore(draggedCompanion, draggedRow.nextSibling);
        }
      }

      // Update order based on DOM
      updateItemOrderFromDOM(targetGroup);
      cleanupDrag();
    });
  }

  /**
   * Setup drag handlers for group headers using a drag handle pattern
   * Similar to how row dragging works - button is only draggable when drag handle is used
   */
  function setupGroupDragHandlers(headerBtn, dragHandle, groupName) {
    const groupEl = headerBtn.closest(".rtx-remix-list-group");

    // Track if we started dragging from the handle
    let dragFromHandle = false;

    // Make button draggable only when drag handle is pressed
    dragHandle.addEventListener("mousedown", (e) => {
      dragFromHandle = true;
      headerBtn.draggable = true;
      e.stopPropagation(); // Prevent button click
    });

    // Reset on mouseup anywhere (in case drag doesn't start)
    const onMouseUp = () => {
      if (dragFromHandle) {
        dragFromHandle = false;
        headerBtn.draggable = false;
      }
    };
    document.addEventListener("mouseup", onMouseUp);
    documentListeners.push(onMouseUp);

    headerBtn.addEventListener("dragstart", (e) => {
      // Only allow drag from the handle
      if (!dragFromHandle) {
        e.preventDefault();
        return;
      }

      dragOccurred = true; // Prevent click handler from toggling
      draggedGroup = groupName;
      draggedRow = null;

      // Set up dataTransfer - MUST be done synchronously in dragstart
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `group:${groupName}`);

      // Create a custom drag image using the button
      const headerRect = headerBtn.getBoundingClientRect();
      const dragImage = headerBtn.cloneNode(true);
      dragImage.style.position = "absolute";
      dragImage.style.top = "-9999px";
      dragImage.style.left = "-9999px";
      dragImage.style.width = headerRect.width + "px";
      dragImage.style.backgroundColor = "var(--comfy-input-bg, #333)";
      dragImage.style.padding = "8px";
      dragImage.style.borderRadius = "4px";
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, headerRect.width / 2, 15);

      // Clean up drag image after a short delay
      setTimeout(() => {
        if (dragImage.parentElement) {
          document.body.removeChild(dragImage);
        }
      }, 100);

      // Save current collapsed state
      preDragCollapsedState = new Set(collapsedGroups);

      // Create placeholder immediately (before DOM changes)
      dragPlaceholder = document.createElement("div");
      dragPlaceholder.className = "rtx-remix-group-placeholder";

      // Defer DOM modifications to next frame to avoid interfering with browser's drag image capture
      requestAnimationFrame(() => {
        // Visually collapse all groups using CSS (don't re-render - it would destroy the dragged element!)
        const allGroups = container.querySelectorAll(".rtx-remix-list-group");
        allGroups.forEach((el) => {
          el.classList.add("rtx-remix-group-drag-collapsed");
        });

        // Mark the dragged group
        if (groupEl) {
          groupEl.classList.add("rtx-remix-group-dragging");
        }
      });
    });

    headerBtn.addEventListener("dragend", (e) => {
      // Reset drag state
      dragOccurred = false;
      dragFromHandle = false;
      headerBtn.draggable = false;

      // Remove visual collapse from all groups
      container.querySelectorAll(".rtx-remix-list-group").forEach((el) => {
        el.classList.remove("rtx-remix-group-drag-collapsed", "rtx-remix-group-dragging");
      });

      // Restore collapsed state (will be applied on next render or toggle)
      if (preDragCollapsedState) {
        collapsedGroups.clear();
        preDragCollapsedState.forEach((name) => collapsedGroups.add(name));
        preDragCollapsedState = null;
      }

      cleanupDrag();
    });

    // Also set up dragover/drop on the button for drop target handling
    headerBtn.addEventListener("dragover", (e) => {
      const targetGroupEl = headerBtn.closest(".rtx-remix-list-group");
      const targetGroup = targetGroupEl?.dataset.groupName;

      if (!draggedGroup) {
        return;
      }

      // Can't drop on ungrouped or on self
      if (targetGroup === UNGROUPED || targetGroup === draggedGroup) {
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      // Position placeholder
      const rect = targetGroupEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        targetGroupEl.parentElement.insertBefore(dragPlaceholder, targetGroupEl);
      } else {
        targetGroupEl.parentElement.insertBefore(dragPlaceholder, targetGroupEl.nextSibling);
      }
    });

    headerBtn.addEventListener("drop", (e) => {
      if (!draggedGroup) return;
      e.preventDefault();

      const sourceGroupEl = container.querySelector(`.rtx-remix-list-group[data-group-name="${draggedGroup}"]`);

      // Move the group to placeholder position
      if (dragPlaceholder && dragPlaceholder.parentElement && sourceGroupEl) {
        dragPlaceholder.parentElement.insertBefore(sourceGroupEl, dragPlaceholder);
      }

      // Update group order based on DOM
      updateGroupOrderFromDOM();
      cleanupDrag();
    });
  }

  /**
   * Setup container-level dragover for group reordering and row reordering
   * This allows dropping between groups even when not directly over a header
   */
  function setupContainerDragHandlers() {
    // Handle row dragging at container level for better drop target coverage
    container.addEventListener("dragover", (e) => {
      // CRITICAL: Always prevent default and set dropEffect when we have an active drag
      // This tells the browser this is a valid drop target and keeps the drag alive
      if (draggedGroup || draggedRow) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }

      // Handle row dragging
      if (draggedRow && !draggedGroup) {
        const sourceGroup = draggedRow.dataset.group;
        const itemsContainer = container.querySelector(
          `.rtx-remix-list-group[data-group-name="${sourceGroup}"] .rtx-remix-group-items`
        );

        if (itemsContainer && itemsContainer.contains(e.target)) {
          // Find insertion point among rows
          const rows = Array.from(itemsContainer.querySelectorAll(`.rtx-remix-list-row:not(.${companionRowClass})`));
          let insertBefore = null;

          for (const row of rows) {
            if (row === draggedRow) continue;
            const rect = row.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
              insertBefore = row;
              break;
            }
          }

          // Position placeholder
          if (dragPlaceholder) {
            if (insertBefore) {
              itemsContainer.insertBefore(dragPlaceholder, insertBefore);
            } else {
              // Insert at end
              itemsContainer.appendChild(dragPlaceholder);
            }
          }
        }
        return;
      }

      // Handle group dragging
      if (!draggedGroup) {
        return;
      }

      // Find which group we're over - filter out Ungrouped and the dragged group
      const allGroupEls = Array.from(container.querySelectorAll(".rtx-remix-list-group"));
      const draggableGroupEls = allGroupEls.filter((el) => {
        const name = el.dataset.groupName;
        return name !== UNGROUPED && name !== draggedGroup;
      });

      if (draggableGroupEls.length === 0) {
        return;
      }

      let targetGroupEl = null;
      let insertBefore = true;

      for (let i = 0; i < draggableGroupEls.length; i++) {
        const groupEl = draggableGroupEls[i];
        const rect = groupEl.getBoundingClientRect();

        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          // Within this group's bounds
          targetGroupEl = groupEl;
          insertBefore = e.clientY < rect.top + rect.height / 2;
          break;
        } else if (e.clientY < rect.top) {
          // Above this group - insert before it
          targetGroupEl = groupEl;
          insertBefore = true;
          break;
        } else if (i === draggableGroupEls.length - 1 && e.clientY > rect.bottom) {
          // Below the last draggable group - insert after it
          targetGroupEl = groupEl;
          insertBefore = false;
          break;
        }
      }

      if (!targetGroupEl) {
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      // Position placeholder
      if (insertBefore) {
        targetGroupEl.parentElement.insertBefore(dragPlaceholder, targetGroupEl);
      } else {
        targetGroupEl.parentElement.insertBefore(dragPlaceholder, targetGroupEl.nextSibling);
      }
    });

    container.addEventListener("drop", (e) => {
      // Handle row drop
      if (draggedRow && !draggedGroup) {
        e.preventDefault();

        const sourceGroup = draggedRow.dataset.group;
        const draggedCompanion = getCompanionRow(draggedRow);

        // Move the row to placeholder position
        if (dragPlaceholder && dragPlaceholder.parentElement) {
          dragPlaceholder.parentElement.insertBefore(draggedRow, dragPlaceholder);
          // Also move companion row if it exists
          if (draggedCompanion) {
            draggedRow.parentElement.insertBefore(draggedCompanion, draggedRow.nextSibling);
          }
        }

        // Update order based on DOM
        updateItemOrderFromDOM(sourceGroup);
        cleanupDrag();
        return;
      }

      // Handle group drop
      if (!draggedGroup) {
        return;
      }
      e.preventDefault();

      const sourceGroupEl = container.querySelector(`.rtx-remix-list-group[data-group-name="${draggedGroup}"]`);

      // Move the group to placeholder position
      if (dragPlaceholder && dragPlaceholder.parentElement && sourceGroupEl) {
        dragPlaceholder.parentElement.insertBefore(sourceGroupEl, dragPlaceholder);
      }

      // Update group order based on DOM
      updateGroupOrderFromDOM();
      cleanupDrag();
    });
  }

  /**
   * Clean up after drag operation
   */
  function cleanupDrag() {
    if (dragPlaceholder && dragPlaceholder.parentElement) {
      dragPlaceholder.parentElement.removeChild(dragPlaceholder);
    }
    dragPlaceholder = null;
    draggedRow = null;
    draggedGroup = null;
  }

  /**
   * Update item order based on DOM position and notify callback
   */
  function updateItemOrderFromDOM(groupName) {
    const groupEl = container.querySelector(`.rtx-remix-list-group[data-group-name="${groupName}"]`);
    const itemsContainer = groupEl?.querySelector(".rtx-remix-group-items");
    if (!itemsContainer) return;

    // Get only main rows, excluding companion rows
    const rows = itemsContainer.querySelectorAll(`.rtx-remix-list-row:not(.${companionRowClass})`);
    const orderedItems = [];

    let orderIndex = 0;
    rows.forEach((row) => {
      const nodeId = parseInt(row.dataset.nodeId, 10);
      const slotName = row.dataset.slotName;

      // Find the item in currentItems
      const item = currentItems.find((i) => i.nodeId === nodeId && i.slotName === slotName);
      if (item) {
        item.order = orderIndex;
        orderedItems.push({ ...item, order: orderIndex });
        orderIndex++;
      }
    });

    onItemOrderChange?.(groupName, orderedItems);
  }

  /**
   * Update group order based on DOM position and notify callback
   */
  function updateGroupOrderFromDOM() {
    const groupEls = container.querySelectorAll(".rtx-remix-list-group");
    const newOrder = [];

    groupEls.forEach((groupEl) => {
      const groupName = groupEl.dataset.groupName;
      if (groupName && groupName !== UNGROUPED) {
        newOrder.push(groupName);
      }
    });

    onGroupOrderChange?.(newOrder);
  }

  /**
   * Toggle group collapse state
   */
  function toggleGroup(groupName) {
    const isCollapsed = collapsedGroups.has(groupName);
    if (isCollapsed) {
      collapsedGroups.delete(groupName);
    } else {
      collapsedGroups.add(groupName);
    }
    onGroupToggle?.(groupName, !isCollapsed);
    render();
  }

  /**
   * Refresh the list with new items
   */
  function refresh(newItems) {
    currentItems = [...newItems];
    render();
  }

  /**
   * Cleanup resources
   */
  function cleanup() {
    cleanupDrag();
    documentListeners.forEach((fn) => document.removeEventListener("mouseup", fn));
    documentListeners.length = 0;
    container.innerHTML = "";
  }

  /**
   * Get current items
   */
  function getItems() {
    return currentItems;
  }

  // Initial render
  render();

  // Setup container-level drag handlers for group reordering
  setupContainerDragHandlers();

  return {
    refresh,
    cleanup,
    getItems,
  };
}
