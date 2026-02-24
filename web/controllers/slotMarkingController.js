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
 * Slot Marking Controller
 *
 * Handles visual rendering of marked slots on nodes.
 * Uses slotMarkingCore for state queries.
 * Follows the dependency rule: controllers → cores → stores → utils
 */

import { REMIX_KEYS } from "../utils/constants.js";
import { getRemixColor } from "../utils/html.js";
import { isNodeOutputMarked } from "../cores/slotMarkingCore.js";

/**
 * Draw highlight circle on marked input slots
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} node - LiteGraph node
 * @param {number} slotIndex - Index of the input slot
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
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} node - LiteGraph node
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
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} node - LiteGraph node
 */
function drawNodeHighlights(ctx, node) {
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

/**
 * Hook into a node's draw foreground to render custom RTX Remix highlights.
 * This wraps the node's existing onDrawForeground method.
 *
 * @param {Object} node - The LiteGraph node instance
 */
export function setupNodeDrawing(node) {
  const originalOnDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    originalOnDrawForeground?.apply(this, arguments);
    drawNodeHighlights(ctx, this);
  };
}
