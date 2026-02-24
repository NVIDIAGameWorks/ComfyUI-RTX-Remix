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
 * Slot Marking Core - Business Logic Only
 *
 * Handles the business logic for marking/unmarking input slots and node outputs.
 * Does NOT contain any UI/rendering code (moved to slotMarkingController.js).
 * Follows the dependency rule: cores → stores → utils
 */

import {
  NODE_DEFAULTS,
  COMFYUI_INPUT_TYPE_MAP,
  COMFYUI_OUTPUT_TYPE_MAP,
  REMIX_KEYS,
  EVENTS,
} from "../utils/constants.js";
import { getPrimitiveTypeName } from "../utils/types.js";

// Module-level callback for input tag changes
let onInputTagChanged = null;

/**
 * Register a callback to be called when inputs are tagged/untagged.
 * @param {Function|null} callback - Callback function: ({action, nodeId, slotName, app}) => void
 *   action: "tagged" | "untagged"
 */
export function setOnInputTagChanged(callback) {
  onInputTagChanged = callback;
}

/**
 * Check if an input slot is marked
 * @param {Object} node - LiteGraph node
 * @param {number} slotIndex - Index of the input slot
 * @returns {boolean} True if the slot is marked
 */
export function isInputSlotMarked(node, slotIndex) {
  if (!node.inputs || !node.inputs[slotIndex]) return false;
  const markedSlots = node?.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS];
  if (!markedSlots) return false;
  const slotName = node.inputs[slotIndex].name;
  return markedSlots.hasOwnProperty(slotName);
}

/**
 * Check if the node output is marked (node-level, not per-slot)
 * @param {Object} node - LiteGraph node
 * @returns {boolean} True if the node output is marked
 */
export function isNodeOutputMarked(node) {
  return !!node?.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.OUTPUT];
}

/**
 * Resolve export name from defaults (may reference widget values)
 * @param {Object} node - LiteGraph node
 * @param {Object} defaults - Default values configuration
 * @returns {string|null} Resolved export name
 */
function resolveExportName(node, defaults) {
  let exportName = defaults[REMIX_KEYS.PROPERTY.NAME];
  if (exportName && typeof exportName === "object" && exportName[REMIX_KEYS.DYNAMIC.REF]) {
    const widget = node.widgets?.find((w) => w.name === exportName[REMIX_KEYS.DYNAMIC.REF]);
    if (widget?.value) {
      exportName = widget.value;
    } else if (Array.isArray(node.widgets_values)) {
      const widgetIndex = node.widgets?.findIndex((w) => w.name === exportName[REMIX_KEYS.DYNAMIC.REF]);
      if (widgetIndex >= 0) {
        exportName = node.widgets_values[widgetIndex];
      }
    } else if (node.widgets_values?.[exportName[REMIX_KEYS.DYNAMIC.REF]]) {
      exportName = node.widgets_values[exportName[REMIX_KEYS.DYNAMIC.REF]];
    }
  }
  return exportName;
}

/**
 * Resolve additional data from defaults
 * @param {Object} node - LiteGraph node
 * @param {Object} defaults - Default values configuration
 * @returns {Object} Resolved additional data
 */
function resolveAdditionalData(node, defaults) {
  const additionalData = {};
  if (defaults) {
    Object.entries(defaults).forEach(([key, value]) => {
      if (Object.values(REMIX_KEYS.PROPERTY.ADDITIONAL_DATA).includes(key)) {
        if (typeof value === "object" && value[REMIX_KEYS.DYNAMIC.REF]) {
          const widget = node.widgets?.find((w) => w.name === value[REMIX_KEYS.DYNAMIC.REF]);
          if (widget?.value) {
            additionalData[key] = widget.value;
          }
        } else {
          additionalData[key] = value;
        }
      }
    });
  }
  return additionalData;
}

/**
 * Toggle an input slot mark
 * @param {Object} node - LiteGraph node
 * @param {number} slotIndex - Index of the input slot
 * @param {Object} app - ComfyUI app instance
 */
export function toggleInputSlotMark(node, slotIndex, app) {
  if (!node.inputs || !node.inputs[slotIndex]) return;

  const slot = node.inputs[slotIndex];
  const slotName = slot.name;
  const slotType = slot.type;

  const markedSlots = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS];
  const isCurrentlyMarked = markedSlots && markedSlots.hasOwnProperty(slotName);

  const selectedNodes = Object.values(app.canvas.selected_nodes || {});
  const nodesToProcess = selectedNodes.length > 1 ? selectedNodes : [node];

  nodesToProcess.forEach((targetNode) => {
    const matchingSlotIndex = targetNode.inputs?.findIndex((s) => s.name === slotName && s.type === slotType);
    if (matchingSlotIndex === -1 || matchingSlotIndex === undefined) return;

    targetNode.properties = targetNode.properties || {};
    targetNode.properties[REMIX_KEYS.ROOT] = targetNode.properties[REMIX_KEYS.ROOT] || {};
    targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS] =
      targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS] || {};

    const targetMarkedSlots = targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS];

    if (isCurrentlyMarked) {
      delete targetMarkedSlots[slotName];
      if (Object.keys(targetMarkedSlots).length === 0) {
        delete targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS];
      }
      if (
        !targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS] &&
        !targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT]
      ) {
        delete targetNode.properties[REMIX_KEYS.ROOT];
      }
    } else {
      const primitiveType = getPrimitiveTypeName(slotType);
      if (primitiveType === null || !COMFYUI_INPUT_TYPE_MAP[primitiveType]) {
        console.warn(`Cannot tag slot: ${slotName} (type: ${slotType}) on node ${targetNode.title}. Not supported.`);
        return;
      }

      const defaults = NODE_DEFAULTS?.[targetNode.type]?.[REMIX_KEYS.STRUCTURE.INPUTS]?.[slotName] || {};
      targetMarkedSlots[slotName] = {
        [REMIX_KEYS.PROPERTY.NAME]: resolveExportName(targetNode, defaults) || null,
        [REMIX_KEYS.PROPERTY.TYPE]: primitiveType,
        [REMIX_KEYS.PROPERTY.REMIX_TYPE]: defaults[REMIX_KEYS.PROPERTY.REMIX_TYPE] || null,
        [REMIX_KEYS.PROPERTY.ORDER]: Object.keys(targetMarkedSlots).length,
      };

      const additionalDataDefaults = NODE_DEFAULTS?.[targetNode.type]?.[REMIX_KEYS.STRUCTURE.INPUTS]?.[slotName];
      targetMarkedSlots[slotName][REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] = resolveAdditionalData(
        targetNode,
        additionalDataDefaults
      );
    }

    targetNode.setDirtyCanvas(true, true);
  });

  // Notify listeners of the tag change
  const tagAction = isCurrentlyMarked ? "untagged" : "tagged";
  onInputTagChanged?.({
    action: tagAction,
    nodeId: node.id,
    slotName,
    app,
  });

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.INPUTS_TAGGED, {
      detail: { action: tagAction, nodeId: node.id, slotName },
    })
  );
}

/**
 * Toggle node output mark (node-level, not per-slot)
 * @param {Object} node - LiteGraph node
 * @param {Object} app - ComfyUI app instance
 */
export function toggleNodeOutputMark(node, app) {
  const isCurrentlyMarked = !!node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.OUTPUT];

  const selectedNodes = Object.values(app.canvas.selected_nodes || {});
  const nodesToProcess = selectedNodes.length > 1 ? selectedNodes : [node];

  nodesToProcess.forEach((targetNode) => {
    const hasOutputSlots = targetNode.outputs && targetNode.outputs.length > 0;
    let isSupported = !hasOutputSlots;
    let primitiveType = null;

    if (hasOutputSlots) {
      for (const output of targetNode.outputs) {
        const outputPrimitiveType = getPrimitiveTypeName(output.type);
        if (outputPrimitiveType !== null && COMFYUI_OUTPUT_TYPE_MAP[outputPrimitiveType]) {
          primitiveType = outputPrimitiveType;
          isSupported = true;
          break;
        }
      }
    }

    if (!isSupported) {
      const outputTypes = targetNode.outputs.map((o) => o.type).join(", ");
      console.warn(`Cannot tag node output (types: ${outputTypes}) on node ${targetNode.title}. Not supported.`);
      return;
    }

    targetNode.properties = targetNode.properties || {};
    targetNode.properties[REMIX_KEYS.ROOT] = targetNode.properties[REMIX_KEYS.ROOT] || {};

    if (isCurrentlyMarked) {
      delete targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT];
      if (
        !targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS] &&
        !targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT]
      ) {
        delete targetNode.properties[REMIX_KEYS.ROOT];
      }
    } else {
      const defaults = NODE_DEFAULTS?.[targetNode.type]?.[REMIX_KEYS.STRUCTURE.OUTPUT] || {};
      targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT] = {
        [REMIX_KEYS.PROPERTY.NAME]: resolveExportName(targetNode, defaults) || targetNode.title,
        [REMIX_KEYS.PROPERTY.TYPE]: primitiveType,
        [REMIX_KEYS.PROPERTY.REMIX_TYPE]: defaults[REMIX_KEYS.PROPERTY.REMIX_TYPE] || null,
        [REMIX_KEYS.PROPERTY.ORDER]: 0,
      };

      const additionalDataDefaults = NODE_DEFAULTS?.[targetNode.type]?.[REMIX_KEYS.STRUCTURE.OUTPUT];
      targetNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT][REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] =
        resolveAdditionalData(targetNode, additionalDataDefaults);
    }

    targetNode.setDirtyCanvas(true, true);
  });
}
