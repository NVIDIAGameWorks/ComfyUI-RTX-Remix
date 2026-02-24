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

import { NODE_DEFAULTS, METADATA_FIELD_CONFIG, REMIX_KEYS, REMIX_TYPE, EVENTS } from "../utils/constants.js";
import { setGroupOrder as _setGroupOrder } from "../stores/graphStore.js";

/**
 * Update the group display order.
 * This is the canonical way to change group order - it updates the store
 * and dispatches the GROUP_ORDER_CHANGED event.
 *
 * @param {Object} app - ComfyUI app instance
 * @param {string[]} groupOrder - Array of group names in display order
 */
export function updateGroupOrder(app, groupOrder) {
  _setGroupOrder(app, groupOrder);

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.GROUP_ORDER_CHANGED, {
      detail: { groupOrder },
    })
  );
}

// ============================================================
// WORKFLOW EXPORT
// ============================================================

/**
 * Add RTX Remix metadata inline to the API workflow prompt
 */
export function addRemixMetadataToPrompt(apiWorkflow, workflowGraph) {
  const nodeMap = new Map();
  if (workflowGraph?.nodes) {
    workflowGraph.nodes.forEach((node) => {
      nodeMap.set(node.id, node);
    });
  }

  const enrichedPrompt = JSON.parse(JSON.stringify(apiWorkflow));

  for (const [nodeId, nodeData] of Object.entries(enrichedPrompt)) {
    const graphNode = nodeMap.get(Number(nodeId));
    if (!graphNode?.properties?.[REMIX_KEYS.ROOT]) continue;

    const remixInputs = graphNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS];
    const remixOutput = graphNode.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT];

    if (remixInputs || remixOutput) {
      nodeData[REMIX_KEYS.META] = nodeData[REMIX_KEYS.META] || {};
      nodeData[REMIX_KEYS.META][REMIX_KEYS.ROOT] = {};

      if (remixInputs) {
        nodeData[REMIX_KEYS.META][REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS] = {};
        Object.entries(remixInputs).forEach(([slotName, slot]) => {
          nodeData[REMIX_KEYS.META][REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS][slotName] = {
            [REMIX_KEYS.PROPERTY.NAME]: slot[REMIX_KEYS.PROPERTY.NAME] || slotName,
            [REMIX_KEYS.PROPERTY.TYPE]: slot[REMIX_KEYS.PROPERTY.TYPE],
            [REMIX_KEYS.PROPERTY.REMIX_TYPE]: slot[REMIX_KEYS.PROPERTY.REMIX_TYPE] || REMIX_TYPE.AUTO,
            [REMIX_KEYS.PROPERTY.ORDER]: slot[REMIX_KEYS.PROPERTY.ORDER] ?? 0,
            [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT]: slot[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] || {},
          };
        });
      }

      if (remixOutput) {
        nodeData[REMIX_KEYS.META][REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT] = {
          [REMIX_KEYS.PROPERTY.NAME]: remixOutput[REMIX_KEYS.PROPERTY.NAME] || null,
          [REMIX_KEYS.PROPERTY.TYPE]: remixOutput[REMIX_KEYS.PROPERTY.TYPE],
          [REMIX_KEYS.PROPERTY.REMIX_TYPE]: remixOutput[REMIX_KEYS.PROPERTY.REMIX_TYPE] || REMIX_TYPE.AUTO,
          [REMIX_KEYS.PROPERTY.ORDER]: remixOutput[REMIX_KEYS.PROPERTY.ORDER] ?? 0,
          [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT]: remixOutput[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] || {},
        };
      }
    }
  }

  return enrichedPrompt;
}

/**
 * Build metadata context for determining which fields apply to a slot
 */
export function buildMetadataContext({ app, node, slotName, primitiveType, isInput, remixType }) {
  const nodeType = node.type;
  const nodeId = node.id;
  const nodeDescription = app.graph.extra?.node_definitions?.[nodeType]?.description || "";

  const nodeDefaults = isInput
    ? NODE_DEFAULTS?.[nodeType]?.[REMIX_KEYS.STRUCTURE.INPUTS]?.[slotName]
    : NODE_DEFAULTS?.[nodeType]?.[REMIX_KEYS.STRUCTURE.OUTPUT];

  let widgetConfig = null;
  let widgetValue = null;

  if (slotName && node.widgets) {
    const widget = node.widgets.find((w) => w.name === slotName);
    if (widget) {
      widgetConfig = {
        min: widget.options?.min,
        max: widget.options?.max,
        step: widget.options?.step,
      };
    }
  }

  if (!isInput && nodeType === "RTXRemixSaveTexture") {
    const textureTypeWidget = node.widgets?.find((w) => w.name === "texture_type");
    if (textureTypeWidget) {
      widgetValue = textureTypeWidget.value;
    }
  }

  return {
    nodeType,
    primitiveType,
    isInput,
    remixType,
    widgetConfig,
    widgetValue,
    nodeDescription,
    nodeDefaults,
    slotName,
    nodeId,
  };
}

/**
 * Get applicable metadata fields for a slot based on context
 */
export function getApplicableMetadataFields(context) {
  return METADATA_FIELD_CONFIG.filter((field) => field.applyTo(context)).map((field) => ({
    ...field,
    computedDefault: field.defaultValue(context),
  }));
}

/**
 * Resolve export name from defaults (may reference widget values)
 */
function resolveExportName(node, slotName, key, slotExportName, app) {
  if (slotExportName) return slotExportName;

  const defaults = slotName ? NODE_DEFAULTS?.[node.type]?.[key]?.[slotName] : NODE_DEFAULTS?.[node.type]?.[key];

  if (!defaults?.[REMIX_KEYS.PROPERTY.NAME]) return null;

  const exportNameDef = defaults[REMIX_KEYS.PROPERTY.NAME];

  if (typeof exportNameDef === "object" && exportNameDef[REMIX_KEYS.DYNAMIC.REF]) {
    const refName = exportNameDef[REMIX_KEYS.DYNAMIC.REF];
    const widget = node.widgets?.find((w) => w.name === refName);

    if (widget?.value) return widget.value;

    if (Array.isArray(node.widgets_values)) {
      const graphNode =
        app.graph._nodes?.find((n) => n.id === node.id) || app.graph.nodes?.find((n) => n.id === node.id);
      if (graphNode?.widgets) {
        const widgetIndex = graphNode.widgets.findIndex((w) => w.name === refName);
        if (widgetIndex >= 0 && node.widgets_values[widgetIndex] !== undefined) {
          return node.widgets_values[widgetIndex];
        }
      }
    } else if (node.widgets_values?.[refName]) {
      return node.widgets_values[refName];
    }

    return null;
  }

  return exportNameDef;
}

/**
 * Extract tagged slots from graph nodes
 */
export function extractTaggedSlots(app) {
  const inputs = [];
  const outputs = [];

  const graphNodes = app.graph._nodes || app.graph.nodes || [];

  graphNodes.forEach((node) => {
    const nodeTitle = node.title || node.type || `Node ${node.id}`;

    if (node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS]) {
      Object.entries(node.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS])
        .map(([slotName, metadata]) => ({
          slotName,
          metadata: {
            ...metadata,
            [REMIX_KEYS.PROPERTY.ORDER]: metadata[REMIX_KEYS.PROPERTY.ORDER] ?? 999,
          },
        }))
        .sort((a, b) => a.metadata[REMIX_KEYS.PROPERTY.ORDER] - b.metadata[REMIX_KEYS.PROPERTY.ORDER])
        .forEach(({ slotName, metadata }, index) => {
          const primitiveType = metadata[REMIX_KEYS.PROPERTY.TYPE] || null;
          const defaults = NODE_DEFAULTS?.[node.type]?.[REMIX_KEYS.STRUCTURE.INPUTS]?.[slotName] || {};
          const resolvedExportName = resolveExportName(
            node,
            slotName,
            REMIX_KEYS.STRUCTURE.INPUTS,
            metadata[REMIX_KEYS.PROPERTY.NAME],
            app
          );

          const context = buildMetadataContext({
            app,
            node,
            slotName,
            primitiveType,
            isInput: true,
            remixType:
              metadata[REMIX_KEYS.PROPERTY.REMIX_TYPE] || defaults[REMIX_KEYS.PROPERTY.REMIX_TYPE] || REMIX_TYPE.AUTO,
          });

          const additionalData = metadata[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] || {};
          inputs.push({
            nodeId: node.id,
            nodeTitle,
            slotName,
            exportName: resolvedExportName || slotName,
            primitiveType: primitiveType,
            remixType:
              metadata[REMIX_KEYS.PROPERTY.REMIX_TYPE] || defaults[REMIX_KEYS.PROPERTY.REMIX_TYPE] || REMIX_TYPE.AUTO,
            order: metadata[REMIX_KEYS.PROPERTY.ORDER] ?? index,
            group: additionalData[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP] || "",
            additionalData,
            context,
          });
        });
    }

    if (node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.OUTPUT]) {
      const metadata = node.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT];
      const primitiveType = metadata[REMIX_KEYS.PROPERTY.TYPE] || null;
      const defaults = NODE_DEFAULTS?.[node.type]?.[REMIX_KEYS.STRUCTURE.OUTPUT] || {};
      const resolvedExportName = resolveExportName(
        node,
        null,
        REMIX_KEYS.STRUCTURE.OUTPUT,
        metadata[REMIX_KEYS.PROPERTY.NAME],
        app
      );

      const context = buildMetadataContext({
        app,
        node,
        slotName: null,
        primitiveType,
        isInput: false,
        remixType:
          metadata[REMIX_KEYS.PROPERTY.REMIX_TYPE] || defaults[REMIX_KEYS.PROPERTY.REMIX_TYPE] || REMIX_TYPE.AUTO,
      });

      outputs.push({
        nodeId: node.id,
        nodeTitle,
        slotName: null,
        exportName: resolvedExportName || nodeTitle,
        primitiveType: primitiveType,
        remixType:
          metadata[REMIX_KEYS.PROPERTY.REMIX_TYPE] || defaults[REMIX_KEYS.PROPERTY.REMIX_TYPE] || REMIX_TYPE.AUTO,
        order: metadata[REMIX_KEYS.PROPERTY.ORDER] ?? 0,
        additionalData: metadata[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] || {},
        context,
      });
    }
  });

  inputs.sort((a, b) => a.order - b.order);
  outputs.sort((a, b) => a.order - b.order);

  return { inputs, outputs };
}

/**
 * Apply slot edits from UI back to graph nodes.
 * Supports both old template-based rows and new grouped list rows.
 *
 * @param {Object} app - ComfyUI app instance
 * @param {HTMLElement} inputsContainer - Container element for inputs
 * @param {HTMLElement} outputsContainer - Container element for outputs
 */
export function applySlotEditsToGraphNodes(app, inputsContainer, outputsContainer) {
  const graphNodes = app.graph._nodes || app.graph.nodes || [];

  // Helper to extract slot data from a row (handles both old and new structures)
  function extractSlotData(row) {
    // Try new grouped list structure first (data on row)
    let nodeId = parseInt(row.dataset.nodeId, 10);
    let slotName = row.dataset.slotName;

    // Fall back to old structure (data on input element)
    if (isNaN(nodeId)) {
      const nameInput = row.querySelector(".rtx-remix-slot-name-input");
      if (nameInput) {
        nodeId = parseInt(nameInput.dataset.nodeId, 10);
        slotName = nameInput.dataset.slotName;
      }
    }

    if (isNaN(nodeId) || !slotName) return null;

    // Get export name
    const nameInput = row.querySelector(".rtx-remix-slot-name-input, [data-field-key='exportName']");
    const exportName = nameInput?.value?.trim() || slotName;

    // Get remix type
    const typeSelect = row.querySelector(".rtx-remix-slot-type-select, [data-field-key='remixType']");
    const remixType = typeSelect?.value || REMIX_TYPE.AUTO;

    // Get primitive type from span (supports both old and new class names)
    const typeSpan = row.querySelector(".rtx-remix-slot-type, .rtx-remix-slot-primitive-type");
    const primitiveType = typeSpan?.textContent || row.dataset.primitiveType || "unknown";

    // Get additional data from accordion
    const accordionRow = row.nextElementSibling;
    const additionalData = {};
    if (accordionRow && accordionRow.classList.contains("rtx-remix-metadata-accordion")) {
      accordionRow.querySelectorAll("[data-field-key]").forEach((el) => {
        const key = el.dataset.fieldKey;
        // Handle group picker (div with dataset.selectedGroup) vs regular inputs
        const value = el.dataset.selectedGroup !== undefined ? el.dataset.selectedGroup : el.value;

        if (el.type === "number") {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            additionalData[key] = numValue;
          } else if (value === "") {
            additionalData[key] = null;
          }
        } else {
          additionalData[key] = value;
        }
      });
    }

    return { nodeId, slotName, exportName, remixType, primitiveType, additionalData };
  }

  // Process inputs - support both old tbody and new div-based layout
  const inputRows = inputsContainer.querySelectorAll(
    "tr.rtx-remix-draggable-row, tr.rtx-remix-list-row:not(.rtx-remix-metadata-accordion), div.rtx-remix-list-row:not(.rtx-remix-metadata-accordion)"
  );
  inputRows.forEach((row, index) => {
    const data = extractSlotData(row);
    if (!data) return;

    const node = graphNodes.find((n) => n.id === data.nodeId);
    if (!node) return;

    if (!node.properties) node.properties = {};
    if (!node.properties[REMIX_KEYS.ROOT]) node.properties[REMIX_KEYS.ROOT] = {};
    if (!node.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS])
      node.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS] = {};

    node.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.INPUTS][data.slotName] = {
      [REMIX_KEYS.PROPERTY.NAME]: data.exportName,
      [REMIX_KEYS.PROPERTY.TYPE]: data.primitiveType,
      [REMIX_KEYS.PROPERTY.REMIX_TYPE]: data.remixType,
      [REMIX_KEYS.PROPERTY.ORDER]: index,
      [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT]: data.additionalData,
    };
  });

  // Process outputs - support both old tbody and new div-based layout
  const outputRows = outputsContainer.querySelectorAll(
    "tr.rtx-remix-draggable-row, div.rtx-remix-list-row:not(.rtx-remix-metadata-accordion)"
  );
  outputRows.forEach((row, index) => {
    const data = extractSlotData(row);
    if (!data) return;

    const node = graphNodes.find((n) => n.id === data.nodeId);
    if (!node) return;

    if (!node.properties) node.properties = {};
    if (!node.properties[REMIX_KEYS.ROOT]) node.properties[REMIX_KEYS.ROOT] = {};

    node.properties[REMIX_KEYS.ROOT][REMIX_KEYS.STRUCTURE.OUTPUT] = {
      [REMIX_KEYS.PROPERTY.NAME]: data.exportName,
      [REMIX_KEYS.PROPERTY.TYPE]: data.primitiveType,
      [REMIX_KEYS.PROPERTY.REMIX_TYPE]: data.remixType,
      [REMIX_KEYS.PROPERTY.ORDER]: index,
      [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT]: data.additionalData,
    };
  });

  app.graph.setDirtyCanvas(true, true);
}
