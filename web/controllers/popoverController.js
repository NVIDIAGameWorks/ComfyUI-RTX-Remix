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
import { TEMPLATE_IDS } from "../utils/constants.js";

// Track active popover for global cleanup
let activePopover = null;
let activePopoverCleanup = null;
let activePopoverAnchor = null;

/**
 * Close the currently open popover, if any.
 */
export function closePopover() {
  activePopover?.remove();
  activePopover = null;
  activePopoverCleanup?.();
  activePopoverCleanup = null;
  activePopoverAnchor = null;
}

/**
 * Check if a popover is currently open for a specific anchor.
 * @param {HTMLElement} anchor - The anchor element to check
 * @returns {boolean} True if popover is open for this anchor
 */
export function isPopoverOpenFor(anchor) {
  return activePopover !== null && activePopoverAnchor === anchor;
}

/**
 * Open a popover menu anchored to an element.
 *
 * @param {HTMLElement} anchor - Element to anchor the popover to
 * @param {Array<Object>} items - Menu items
 * @param {string} items[].label - Menu item label
 * @param {Function} items[].onSelect - Called when item is selected
 * @param {boolean} [items[].disabled] - Whether item is disabled
 * @param {string} [items[].tooltip] - Tooltip for disabled items
 * @param {Object} [options] - Additional options
 * @param {string} [options.templateId=TEMPLATE_IDS.POPOVER] - Custom popover template
 * @param {string} [options.itemTemplateId=TEMPLATE_IDS.POPOVER_ITEM] - Custom item template
 * @returns {Function} Close function
 */
export function openPopover(anchor, items, options = {}) {
  const { templateId = TEMPLATE_IDS.POPOVER, itemTemplateId = TEMPLATE_IDS.POPOVER_ITEM } = options;

  // Close any existing popover
  closePopover();

  const popover = cloneTemplate(templateId);
  if (!popover) return () => {};

  // Create menu items
  items.forEach(({ label, onSelect, disabled, tooltip }) => {
    const item = cloneTemplate(itemTemplateId);
    if (!item) return;

    bindTemplateData(item, { label });

    if (disabled) {
      item.classList.add("rtx-remix-popover-item-disabled");
      if (tooltip) item.title = tooltip;
    } else {
      item.addEventListener("click", () => {
        onSelect?.();
        closePopover();
      });
    }

    popover.appendChild(item);
  });

  document.body.appendChild(popover);

  // Position popover relative to anchor
  positionPopover(popover, anchor);

  // Setup close handlers
  const onDocClick = (e) => {
    if (!popover.contains(e.target) && !anchor.contains(e.target)) {
      closePopover();
    }
  };

  const onEscape = (e) => {
    if (e.key === "Escape") {
      closePopover();
    }
  };

  document.addEventListener("mousedown", onDocClick, true);
  document.addEventListener("keydown", onEscape);

  activePopover = popover;
  activePopoverAnchor = anchor;
  activePopoverCleanup = () => {
    document.removeEventListener("mousedown", onDocClick, true);
    document.removeEventListener("keydown", onEscape);
  };

  return closePopover;
}

/**
 * Open a popover menu from a pre-defined template.
 * Items are identified by data-action attributes and configured via the actions object.
 *
 * @param {HTMLElement} anchor - Element to anchor the popover to
 * @param {string} templateId - ID of the template to clone
 * @param {Object} actions - Map of action names to config {onSelect, disabled, tooltip}
 * @returns {Function} Close function
 */
export function openTemplatePopover(anchor, templateId, actions) {
  closePopover();

  const popover = cloneTemplate(templateId);
  if (!popover) return () => {};

  // Configure items based on data-action attributes
  popover.querySelectorAll("[data-action]").forEach((item) => {
    const action = item.dataset.action;
    const config = actions[action];
    if (!config) return;

    if (config.disabled) {
      item.classList.add("rtx-remix-popover-item-disabled");
      if (config.tooltip) item.title = config.tooltip;
    } else {
      item.addEventListener("click", () => {
        config.onSelect?.();
        closePopover();
      });
    }
  });

  document.body.appendChild(popover);
  positionPopover(popover, anchor);

  // Setup close handlers
  const onDocClick = (e) => {
    if (!popover.contains(e.target) && !anchor.contains(e.target)) {
      closePopover();
    }
  };

  const onEscape = (e) => {
    if (e.key === "Escape") {
      closePopover();
    }
  };

  document.addEventListener("mousedown", onDocClick, true);
  document.addEventListener("keydown", onEscape);

  activePopover = popover;
  activePopoverAnchor = anchor;
  activePopoverCleanup = () => {
    document.removeEventListener("mousedown", onDocClick, true);
    document.removeEventListener("keydown", onEscape);
  };

  return closePopover;
}

/**
 * Open a popover with custom content element.
 * Reuses existing positioning and close handling logic.
 *
 * @param {HTMLElement} anchor - Element to anchor the popover to
 * @param {HTMLElement} content - Content element to show in popover
 * @param {Object} [options] - Options
 * @param {boolean} [options.closeOnContentClick=false] - Close when clicking inside content
 * @returns {Function} Close function
 */
export function openPopoverWithContent(anchor, content, options = {}) {
  const { closeOnContentClick = false } = options;
  closePopover();

  // Wrap content in popover container
  const popover = document.createElement("div");
  popover.className = "rtx-remix-popover";
  popover.appendChild(content);

  document.body.appendChild(popover);
  positionPopover(popover, anchor);

  // Setup close handlers (reuses existing pattern)
  const onDocClick = (e) => {
    const clickedInside = popover.contains(e.target);
    const clickedAnchor = e.target === anchor || anchor.contains(e.target);
    if (!clickedInside && !clickedAnchor) {
      closePopover();
    } else if (clickedInside && closeOnContentClick) {
      closePopover();
    }
  };

  const onEscape = (e) => {
    if (e.key === "Escape") closePopover();
  };

  document.addEventListener("mousedown", onDocClick, true);
  document.addEventListener("keydown", onEscape);

  activePopover = popover;
  activePopoverAnchor = anchor;
  activePopoverCleanup = () => {
    document.removeEventListener("mousedown", onDocClick, true);
    document.removeEventListener("keydown", onEscape);
  };

  return closePopover;
}

/**
 * Position a popover relative to its anchor element.
 *
 * @param {HTMLElement} popover - The popover element
 * @param {HTMLElement} anchor - The anchor element
 */
function positionPopover(popover, anchor) {
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth;
  const popoverHeight = popover.offsetHeight;
  const padding = 8;

  // Calculate horizontal position (align right edge with anchor)
  let left = rect.right - popoverWidth;
  if (left < padding) {
    left = padding;
  }
  if (left + popoverWidth > window.innerWidth - padding) {
    left = window.innerWidth - padding - popoverWidth;
  }

  // Calculate vertical position (below anchor, or above if not enough space)
  const gap = 6;
  let top = rect.bottom + gap;
  if (top + popoverHeight > window.innerHeight - padding) {
    top = rect.top - gap - popoverHeight;
  }

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}
