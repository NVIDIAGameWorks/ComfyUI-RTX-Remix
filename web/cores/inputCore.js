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
 * Input Core - Business logic for reading and querying tagged RTX Remix inputs.
 *
 * This core reads from node properties to find inputs that have been marked
 * for RTX Remix export. It provides the canonical way to query tagged inputs
 * across the graph.
 *
 * DEPENDENCY RULES:
 *   cores → stores, utils, cores (NEVER controllers)
 */

import { REMIX_KEYS } from "../utils/constants.js";

/**
 * Get all tagged RTX Remix inputs from the graph, sorted by their order property.
 * Order matches the export dialog's input ordering.
 *
 * @param {Object} app - ComfyUI app instance
 * @returns {Array<Object>} Array of tagged input objects with:
 *   - nodeId: Node ID
 *   - slotName: Slot/widget name
 *   - exportName: Export name (from metadata or slotName)
 *   - nodeTitle: Node display title
 *   - widget: Widget reference
 *   - primitiveType: Primitive type string
 *   - comboOptions: Array of combo options or null
 *   - order: Display order
 *   - group: Group name or empty string
 *   - tooltip: Tooltip text or empty string
 *   - min: Minimum value for float/int sliders (or undefined)
 *   - max: Maximum value for float/int sliders (or undefined)
 *   - step: Step value for float/int sliders (or undefined)
 */
export function getTaggedInputs(app) {
  const list = [];
  const graphNodes = app.graph?._nodes || app.graph?.nodes || [];

  for (const node of graphNodes) {
    const markedInputs = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS];
    if (!markedInputs) continue;

    const nodeTitle = node.title || node.type || `Node ${node.id}`;

    for (const slotName of Object.keys(markedInputs)) {
      const widget = node.widgets?.find((w) => w.name === slotName);
      const meta = markedInputs[slotName];
      const additionalData = meta?.[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] || {};

      // Get export name from metadata (if set), otherwise fall back to slot name
      const exportName = meta?.[REMIX_KEYS.PROPERTY.NAME] || slotName;

      list.push({
        nodeId: node.id,
        slotName,
        exportName,
        nodeTitle,
        widget,
        primitiveType: meta?.[REMIX_KEYS.PROPERTY.TYPE] || "str",
        comboOptions: Array.isArray(widget?.options?.values) ? widget.options.values : null,
        order: meta?.[REMIX_KEYS.PROPERTY.ORDER] ?? 999,
        group: additionalData[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP] || "",
        tooltip: additionalData[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TOOLTIP] || "",
        // Slider range metadata (used by float/int inputs)
        min: additionalData[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.MIN],
        max: additionalData[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.MAX],
        step: additionalData[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.STEP],
      });
    }
  }

  // Sort by order to match export dialog ordering
  list.sort((a, b) => a.order - b.order);
  return list;
}