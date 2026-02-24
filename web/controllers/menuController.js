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
 * Menu Controller
 *
 * Handles context menu building for canvas and node right-click menus.
 * Uses slotMarkingCore for state queries and actions.
 * Follows the dependency rule: controllers → cores → stores → utils
 */

import { COMFYUI_INPUT_TYPE_MAP, COMFYUI_OUTPUT_TYPE_MAP, EVENTS } from "../utils/constants.js";
import { createMenuItemHTML } from "../utils/html.js";
import { getPrimitiveTypeName } from "../utils/types.js";
import {
  isInputSlotMarked,
  isNodeOutputMarked,
  toggleInputSlotMark,
  toggleNodeOutputMark,
} from "../cores/slotMarkingCore.js";

/**
 * Build menu items for input slots
 * @param {Object} node - LiteGraph node
 * @param {Object} app - ComfyUI app instance
 * @returns {Object[]} Array of menu item objects
 */
function buildInputSlotMenuItems(node, app) {
  const selectedNodes = Object.values(app.canvas.selected_nodes || {});
  const multipleSelected = selectedNodes.length > 1;

  return node.inputs.map((slot, index) => {
    const isMarked = isInputSlotMarked(node, index);
    const primitiveType = getPrimitiveTypeName(slot.type);
    const isSupported = primitiveType !== null && COMFYUI_INPUT_TYPE_MAP[primitiveType];

    let matchingCount = 0;
    if (multipleSelected) {
      matchingCount = selectedNodes.filter((n) =>
        n.inputs?.some((s) => s.name === slot.name && s.type === slot.type)
      ).length;
    }

    const checkmark = isMarked ? "✔" : "";
    const slotLabel = isSupported ? slot.name : `${slot.name} (not supported)`;
    const batchInfo = multipleSelected && matchingCount > 1 ? ` (${matchingCount} nodes)` : "";
    const textColor = isSupported ? "inherit" : "#888";
    const cursor = isSupported ? "inherit" : "not-allowed";

    return {
      content: `<span style="display: inline-block; width: 1.25em;">${checkmark}</span><span style="color: ${textColor}; cursor: ${cursor};">${slotLabel}${batchInfo}</span>`,
      callback: isSupported ? () => toggleInputSlotMark(node, index, app) : null,
      disabled: !isSupported,
    };
  });
}

/**
 * Build slot tagging submenu
 * @param {Object} node - LiteGraph node
 * @param {Object} app - ComfyUI app instance
 * @returns {Object} Submenu object with options
 */
function buildSlotTaggingMenu(node, app) {
  const submenu = { options: [] };

  if (node.inputs && node.inputs.length > 0) {
    submenu.options.push({
      content: `<span style="display: inline-block; width: 1.25em;"></span><span>Inputs</span>`,
      submenu: { options: buildInputSlotMenuItems(node, app) },
    });
  }

  const hasOutputSlots = node.outputs && node.outputs.length > 0;
  let isSupported = true;

  if (hasOutputSlots) {
    const firstOutput = node.outputs[0];
    const primitiveType = getPrimitiveTypeName(firstOutput.type);
    isSupported = primitiveType !== null && COMFYUI_OUTPUT_TYPE_MAP[primitiveType];
  }

  const isMarked = isNodeOutputMarked(node);
  const selectedNodes = Object.values(app.canvas.selected_nodes || {});
  const multipleSelected = selectedNodes.length > 1;

  let outputNodeCount = 0;
  if (multipleSelected) {
    outputNodeCount = selectedNodes.filter((n) => {
      if (!n.outputs || n.outputs.length === 0) return true;
      const firstOut = n.outputs[0];
      const primType = getPrimitiveTypeName(firstOut.type);
      return primType !== null && COMFYUI_OUTPUT_TYPE_MAP[primType];
    }).length;
  }

  const checkmark = isMarked ? "✔ " : "";
  const label = isSupported ? "Output" : "Output (not supported)";
  const batchInfo = multipleSelected && outputNodeCount > 1 ? ` (${outputNodeCount} nodes)` : "";
  const textColor = isSupported ? "inherit" : "#888";
  const cursor = isSupported ? "inherit" : "not-allowed";

  submenu.options.push({
    content: `<span style="display: inline-block; width: 1.25em;">${checkmark}</span><span style="color: ${textColor}; cursor: ${cursor};">${label}${batchInfo}</span>`,
    callback: isSupported ? () => toggleNodeOutputMark(node, app) : null,
    disabled: !isSupported,
  });

  return submenu;
}

/**
 * Get canvas context menu items (background right-click)
 * @param {Object} app - ComfyUI app instance
 * @returns {Object[]} Array of menu item objects
 */
export function getCanvasMenuItems(app) {
  return [
    null, // separator above
    {
      content: createMenuItemHTML("Export Workflow for RTX Remix"),
      callback: () => {
        // Dispatch event - exportDialogController listens and handles export
        app.api.dispatchEvent(new CustomEvent(EVENTS.EXPORT_WORKFLOW_REQUESTED, { detail: { app } }));
      },
    },
    null, // separator below
  ];
}

/**
 * Get node context menu items (node right-click)
 * @param {Object} node - LiteGraph node
 * @param {Object} app - ComfyUI app instance
 * @returns {Object[]} Array of menu item objects
 */
export function getNodeMenuItems(node, app) {
  return [
    null, // separator above
    {
      content: createMenuItemHTML("Tag for RTX Remix"),
      submenu: buildSlotTaggingMenu(node, app),
    },
    null, // separator below
  ];
}
