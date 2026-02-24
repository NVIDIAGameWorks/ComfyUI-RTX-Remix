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
 * Base Dialog Controller - Provides generic dialog rendering and lifecycle management.
 *
 * This controller handles:
 * - Dialog rendering from templates
 * - Close animations and DOM cleanup
 * - Keyboard (Escape) and backdrop click handling
 * - Standard confirm and info dialog patterns
 *
 * DEPENDENCY RULES:
 *   controllers → cores, stores, utils, controllers
 */

import { cloneTemplate } from "../utils/html.js";
import { TEMPLATE_IDS } from "../utils/constants.js";

/**
 * Show a dialog with standard animations and close handling.
 *
 * @param {string} templateId - Template ID to clone
 * @param {Object} [options] - Dialog options
 * @param {Function} [options.onOpen] - Called when dialog opens with {overlay, dialog, close}
 * @param {Function} [options.onClose] - Called when dialog closes with result
 * @param {boolean} [options.closeOnBackdrop=true] - Close dialog when clicking backdrop
 * @param {boolean} [options.closeOnEscape=true] - Close dialog when pressing Escape
 * @returns {Promise<any>} Resolves with result when dialog closes
 */
export function showDialog(templateId, options = {}) {
  const { onOpen, onClose, closeOnBackdrop = true, closeOnEscape = true } = options;

  return new Promise((resolve) => {
    const overlay = cloneTemplate(templateId);
    if (!overlay) {
      console.error(`Failed to load dialog template: ${templateId}`);
      resolve(null);
      return;
    }

    const dialog =
      overlay.querySelector(".rtx-remix-dialog") ||
      overlay.querySelector(".rtx-remix-confirm-dialog") ||
      overlay.querySelector(".rtx-remix-info-dialog");

    let isClosing = false;

    /**
     * Close the dialog with animation
     * @param {any} result - Result to resolve with
     */
    function close(result) {
      if (isClosing) return;
      isClosing = true;

      // Apply close animations
      overlay.style.animation = "rtx-fadeOut 0.15s ease-out";
      if (dialog) {
        dialog.style.animation = "rtx-slideOut 0.15s ease-out";
      }

      // Remove event listeners
      document.removeEventListener("keydown", handleKeydown);

      // Remove from DOM and resolve after animation
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        onClose?.(result);
        resolve(result);
      }, 150);
    }

    /**
     * Handle keydown events
     */
    function handleKeydown(e) {
      if (e.key === "Escape" && closeOnEscape) {
        e.preventDefault();
        close(null);
      }
    }

    // Add escape key handler
    document.addEventListener("keydown", handleKeydown);

    // Track mousedown for backdrop click handling
    let mouseDownOnOverlay = false;

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) {
        mouseDownOnOverlay = true;
      }
    });

    overlay.addEventListener("mouseup", (e) => {
      if (mouseDownOnOverlay && e.target === overlay && closeOnBackdrop) {
        close(null);
      }
      mouseDownOnOverlay = false;
    });

    // Prevent dialog clicks from bubbling
    if (dialog) {
      dialog.addEventListener("mousedown", () => {
        mouseDownOnOverlay = false;
      });
    }

    // Add to DOM
    document.body.appendChild(overlay);

    // Call onOpen callback
    onOpen?.({ overlay, dialog, close });
  });
}

/**
 * Show a confirmation dialog.
 *
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message (can contain HTML)
 * @param {string} [options.confirmText="Confirm"] - Confirm button text
 * @param {string} [options.cancelText="Cancel"] - Cancel button text
 * @param {boolean} [options.danger=false] - Use danger styling for confirm button
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
export function showConfirmDialog({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
  return showDialog(TEMPLATE_IDS.CONFIRM_DIALOG, {
    onOpen: ({ overlay, close }) => {
      const titleEl = overlay.querySelector(".rtx-remix-confirm-title");
      const messageEl = overlay.querySelector(".rtx-remix-confirm-message");
      const cancelBtn = overlay.querySelector("[data-action='cancel']");
      const confirmBtn = overlay.querySelector("[data-action='confirm']");

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.innerHTML = message;
      if (cancelBtn) {
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener("click", () => close(false));
      }
      if (confirmBtn) {
        confirmBtn.textContent = confirmText;
        if (danger) {
          confirmBtn.classList.add("rtx-remix-btn-danger");
        }
        confirmBtn.addEventListener("click", () => close(true));
      }
    },
  });
}

/**
 * Show an info dialog.
 *
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.content - Dialog content (can contain HTML)
 * @param {string} [options.closeText="Close"] - Close button text
 * @returns {Promise<void>}
 */
export function showInfoDialog({ title, content, closeText = "Close" }) {
  return showDialog(TEMPLATE_IDS.INFO_DIALOG, {
    onOpen: ({ overlay, close }) => {
      const titleEl = overlay.querySelector(".rtx-remix-info-title");
      const contentEl = overlay.querySelector(".rtx-remix-info-content");
      const closeBtn = overlay.querySelector("[data-action='close']");

      if (titleEl) titleEl.textContent = title;
      if (contentEl) contentEl.innerHTML = content;
      if (closeBtn) {
        closeBtn.textContent = closeText;
        closeBtn.addEventListener("click", () => close());
      }
    },
  });
}
