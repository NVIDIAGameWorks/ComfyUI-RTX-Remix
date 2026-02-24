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
 * Metadata Editor Core - Business Logic Only
 *
 * This module contains pure data operations for metadata management.
 * It does NOT import from any controllers, following the dependency rule:
 *   controllers → cores → stores → utils
 *
 * UI code (dialogs, forms) has been moved to metadataDialogController.js
 */

import { METADATA_FIELD_CONFIG, REMIX_KEYS, REMIX_TYPE, EVENTS } from "../utils/constants.js";
import { buildMetadataContext, getApplicableMetadataFields } from "./workflowExportCore.js";

/**
 * Get all unique group names from the current workflow.
 * Scans all nodes with tagged inputs and collects their group names.
 * @param {Object} app - ComfyUI app instance
 * @returns {string[]} Sorted array of unique group names
 */
export function getExistingGroups(app) {
  const groups = new Set();
  const graphNodes = app.graph._nodes || app.graph.nodes || [];
  for (const node of graphNodes) {
    const markedInputs = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS];
    if (!markedInputs) continue;
    for (const slotName of Object.keys(markedInputs)) {
      const meta = markedInputs[slotName];
      const group = meta?.[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT]?.[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP];
      if (group) groups.add(group);
    }
  }
  return Array.from(groups).sort();
}

/**
 * Get applicable metadata fields for an input based on its context.
 * Combines context building with field filtering for convenience.
 *
 * @param {Object} app - ComfyUI app instance
 * @param {number} nodeId - Node ID
 * @param {string} slotName - Slot name
 * @returns {Object[]} Array of applicable field configs from METADATA_FIELD_CONFIG
 */
export function getApplicableMetadataFieldsForInput(app, nodeId, slotName) {
  const node = app.graph.getNodeById?.(nodeId);
  if (!node) return [];

  const inputMeta = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS]?.[slotName];
  if (!inputMeta) return [];

  const context = buildMetadataContext({
    app,
    node,
    slotName,
    primitiveType: inputMeta.type,
    isInput: true,
    remixType: inputMeta.remix_type,
  });

  return getApplicableMetadataFields(context);
}

/**
 * Get current metadata values for a tagged input.
 *
 * @param {Object} app - ComfyUI app instance
 * @param {number} nodeId - Node ID
 * @param {string} slotName - Slot name
 * @returns {Object|null} Metadata values or null if not found
 */
export function getInputMetadata(app, nodeId, slotName) {
  const node = app.graph.getNodeById?.(nodeId);
  if (!node) return null;

  const inputMeta = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS]?.[slotName];
  if (!inputMeta) return null;

  return {
    name: inputMeta.name || slotName,
    type: inputMeta.type || "unknown",
    remixType: inputMeta.remix_type || REMIX_TYPE.AUTO,
    order: inputMeta[REMIX_KEYS.PROPERTY.ORDER],
    additionalData: inputMeta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] || {},
  };
}

/**
 * Update metadata for a tagged input.
 *
 * @param {Object} app - ComfyUI app instance
 * @param {number} nodeId - Node ID
 * @param {string} slotName - Slot name
 * @param {Object} updates - Fields to update {name?, remixType?, additionalData?}
 * @returns {boolean} True if update was successful
 */
export function updateInputMetadata(app, nodeId, slotName, updates) {
  const node = app.graph.getNodeById?.(nodeId);
  if (!node) return false;

  const inputMeta = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS]?.[slotName];
  if (!inputMeta) return false;

  // Update base fields
  if (updates.name !== undefined) {
    inputMeta.name = updates.name;
  }
  if (updates.remixType !== undefined) {
    inputMeta.remix_type = updates.remixType;
  }
  if (updates.order !== undefined) {
    // Order is stored at the property level, not inside additional_data
    inputMeta[REMIX_KEYS.PROPERTY.ORDER] = updates.order;
  }

  // Update additional data fields
  if (updates.additionalData !== undefined) {
    // Ensure additionalData root exists
    if (!inputMeta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT]) {
      inputMeta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] = {};
    }

    const additionalDataRoot = inputMeta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT];

    // Process each field from METADATA_FIELD_CONFIG
    for (const fieldConfig of METADATA_FIELD_CONFIG) {
      const key = fieldConfig.key;
      const remixKey = REMIX_KEYS.PROPERTY.ADDITIONAL_DATA[key.toUpperCase()];
      if (!remixKey) continue;

      const newValue = updates.additionalData[key];

      // If value is empty/null/undefined, DELETE the field from metadata
      if (newValue === null || newValue === undefined || newValue === "") {
        delete additionalDataRoot[remixKey];
      } else {
        // Set the value
        additionalDataRoot[remixKey] = newValue;
      }
    }
  }

  // Clean up empty additionalData object
  const additionalData = inputMeta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT];
  if (additionalData && Object.keys(additionalData).length === 0) {
    delete inputMeta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT];
  }

  app.graph.setDirtyCanvas?.(true, true);
  app.graph.change?.();

  // Dispatch event for UI updates
  app.api.dispatchEvent(
    new CustomEvent(EVENTS.METADATA_CHANGED, {
      detail: { nodeId, slotName, updates },
    })
  );

  return true;
}

/**
 * Reassign all inputs from one group to another.
 * Used when renaming or deleting a group.
 * @param {Object} app - ComfyUI app instance
 * @param {string} fromGroup - Group to reassign from
 * @param {string|null} toGroup - Group to reassign to (null/empty = Ungrouped, DELETES metadata)
 */
export function reassignGroupInputs(app, fromGroup, toGroup) {
  const graphNodes = app.graph._nodes || app.graph.nodes || [];
  let changed = false;

  for (const node of graphNodes) {
    const markedInputs = node.properties?.[REMIX_KEYS.ROOT]?.[REMIX_KEYS.STRUCTURE.INPUTS];
    if (!markedInputs) continue;

    for (const slotName of Object.keys(markedInputs)) {
      const meta = markedInputs[slotName];
      const additionalData = meta?.[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT];
      const currentGroup = additionalData?.[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP];

      if (currentGroup === fromGroup) {
        if (!toGroup) {
          // Moving to Ungrouped = DELETE the group metadata entirely
          if (additionalData) {
            delete additionalData[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP];
          }
        } else {
          // Rename to new group
          if (!meta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT]) {
            meta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT] = {};
          }
          meta[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA_ROOT][REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP] = toGroup;
        }
        changed = true;
      }
    }
  }

  if (changed) {
    app.graph.setDirtyCanvas?.(true, true);
    app.graph.change?.();
  }
}
