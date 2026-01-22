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

import { NODE_DEFAULTS, COMFYUI_INPUT_TYPE_MAP, COMFYUI_OUTPUT_TYPE_MAP, REMIX_KEYS } from "../utils/constants.js";
import { getPrimitiveTypeName } from "../utils/types.js";
import { getRemixColor } from "../utils/html.js";

/**
 * Check if an input slot is marked
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
 */
export function isNodeOutputMarked(node) {
  return !!node?.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.OUTPUT];
}

/**
 * Resolve export name from defaults (may reference widget values)
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
}

/**
 * Toggle node output mark (node-level, not per-slot)
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

/**
 * Draw highlight circle on marked input slots
 */
function drawInputSlotHighlight(ctx, node, slotIndex) {
  const slotPos = node.getConnectionPos(true, slotIndex);
  const localX = slotPos[0] - node.pos[0];
  const localY = slotPos[1] - node.pos[1];

  ctx.fillStyle = getRemixColor();
  ctx.beginPath();
  ctx.arc(localX, localY, 7, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw outline highlight on nodes with marked outputs
 */
function drawNodeOutputHighlight(ctx, node) {
  const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;

  ctx.save();
  ctx.strokeStyle = getRemixColor();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(1, -titleHeight + 1, node.size[0] - 2, node.size[1] + titleHeight - 2, [10]);
  ctx.stroke();
  ctx.restore();
}

/**
 * Main drawing function for all node highlights
 */
export function drawNodeHighlights(ctx, node) {
  const markedInputs = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS];
  if (node.inputs && markedInputs) {
    node.inputs.forEach((input, index) => {
      if (markedInputs.hasOwnProperty(input.name)) {
        drawInputSlotHighlight(ctx, node, index);
      }
    });
  }

  if (isNodeOutputMarked(node)) {
    drawNodeOutputHighlight(ctx, node);
  }
}
