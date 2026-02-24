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
 * Metadata Dialog Controller
 *
 * Handles UI for metadata editing dialogs and forms.
 * Follows the dependency rule: controllers → cores → stores → utils
 */

import { COMFYUI_INPUT_TYPE_MAP, REMIX_KEYS, REMIX_TYPE, TEMPLATE_IDS } from "../utils/constants.js";
import { showDialog } from "./baseDialogController.js";
import { createFormField } from "../factories/componentFactory.js";
import { createGroupPicker } from "./groupPickerController.js";
import { getInputMetadata, updateInputMetadata, reassignGroupInputs } from "../cores/metadataEditorCore.js";
import { buildMetadataContext, getApplicableMetadataFields } from "../cores/workflowExportCore.js";

/**
 * Create a metadata form with all applicable fields for the given context.
 *
 * @param {Object} options - Form configuration
 * @param {Object} options.app - ComfyUI app instance
 * @param {Object} options.context - Metadata context from buildMetadataContext
 * @param {Object} options.currentValues - Current values for form fields
 * @param {string} options.primitiveType - Primitive type (int, float, str, bool)
 * @param {boolean} options.isInput - Whether this is an input (affects remix type options)
 * @param {string} [options.formClass] - Optional CSS class for the form
 * @returns {HTMLElement} Form element with all metadata fields
 */
export function createMetadataForm({ app, context, currentValues, primitiveType, isInput, formClass }) {
  const form = document.createElement("div");
  form.className = formClass || "rtx-remix-metadata-form";

  // Export Name field
  const { field: nameField } = createFormField({
    label: "Export Name",
    inputType: "text",
    fieldClass: "rtx-remix-metadata-field",
    labelClass: "rtx-remix-metadata-label",
    inputClass: "rtx-remix-metadata-input",
    inputOptions: {
      value: currentValues.name || "",
      placeholder: "Name used in exported workflow",
    },
    dataAttributes: {
      fieldKey: "name",
    },
  });
  if (nameField) form.appendChild(nameField);

  // RTX Remix Type dropdown (only for inputs with string type)
  if (isInput && primitiveType === "str") {
    const typeMap = COMFYUI_INPUT_TYPE_MAP;
    const validTypes = typeMap[primitiveType] || [REMIX_TYPE.AUTO];

    const typeField = document.createElement("div");
    typeField.className = "rtx-remix-metadata-field";

    const label = document.createElement("label");
    label.className = "rtx-remix-metadata-label";
    label.textContent = "RTX Remix Type";
    typeField.appendChild(label);

    const select = document.createElement("select");
    select.className = "rtx-remix-metadata-input";
    select.dataset.fieldKey = "remixType";

    validTypes.forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      if (type === currentValues.remixType) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    typeField.appendChild(select);
    form.appendChild(typeField);
  }

  // NOTE: Order field removed - order is now controlled via drag-and-drop in the list UI

  // Get applicable additional fields from METADATA_FIELD_CONFIG
  const applicableFields = getApplicableMetadataFields(context);

  // Create additional metadata fields
  applicableFields.forEach((fieldConfig) => {
    const currentValue = currentValues.additionalData?.[fieldConfig.key] ?? fieldConfig.computedDefault;

    // Special handling for group field - render as combobox
    if (fieldConfig.key === "group") {
      const groupField = createGroupCombobox({
        app,
        currentValue,
      });
      form.appendChild(groupField);
    } else {
      const { field } = createFormField({
        label: fieldConfig.label,
        inputType: fieldConfig.inputType,
        fieldClass: "rtx-remix-metadata-field",
        labelClass: "rtx-remix-metadata-label",
        inputClass: "rtx-remix-metadata-input",
        inputOptions: {
          value: currentValue,
        },
        dataAttributes: {
          fieldKey: fieldConfig.key,
          isAdditionalData: "true",
        },
      });
      if (field) form.appendChild(field);
    }
  });

  return form;
}

/**
 * Create a group combobox field with existing groups and "Create new group" option.
 * Uses the custom group picker component with inline create/rename/delete functionality.
 * @param {Object} options
 * @param {Object} options.app - ComfyUI app instance
 * @param {string} options.currentValue - Current group value
 * @returns {HTMLElement} Field element with custom group picker
 */
function createGroupCombobox({ app, currentValue }) {
  const fieldDiv = document.createElement("div");
  fieldDiv.className = "rtx-remix-metadata-field";

  const labelEl = document.createElement("label");
  labelEl.className = "rtx-remix-metadata-label";
  labelEl.textContent = "Group";
  fieldDiv.appendChild(labelEl);

  const picker = createGroupPicker({
    app,
    currentValue: currentValue || "",
    onChange: (newGroup) => {
      // Value is stored in data attribute for extractFormValues
      picker.dataset.selectedGroup = newGroup || "";
    },
    onGroupDelete: (groupName) => {
      // Update all inputs in this group to be ungrouped (DELETE their group metadata)
      reassignGroupInputs(app, groupName, null);
    },
    onGroupRename: (oldName, newName) => {
      // Update all inputs with old group name to new name
      reassignGroupInputs(app, oldName, newName);
    },
  });

  picker.dataset.fieldKey = "group";
  picker.dataset.isAdditionalData = "true";
  picker.dataset.selectedGroup = currentValue || "";
  fieldDiv.appendChild(picker);

  return fieldDiv;
}

/**
 * Extract form values from a metadata form element.
 *
 * @param {HTMLElement} form - Form element created by createMetadataForm
 * @returns {Object} Extracted values {name, remixType, additionalData}
 */
export function extractFormValues(form) {
  const result = {
    name: "",
    remixType: REMIX_TYPE.AUTO,
    additionalData: {},
  };

  form.querySelectorAll("[data-field-key]").forEach((element) => {
    const key = element.dataset.fieldKey;
    const isAdditionalData = element.dataset.isAdditionalData === "true";
    let value;

    // Handle custom group picker component (stores value in dataset.selectedGroup)
    if (key === "group" && element.dataset.selectedGroup !== undefined) {
      value = element.dataset.selectedGroup;
    } else {
      // Handle regular input/select elements
      value = element.value;

      // Convert numeric values
      if (element.type === "number") {
        const numValue = parseFloat(value);
        value = isNaN(numValue) ? null : numValue;
      }
    }

    if (isAdditionalData) {
      // For additionalData fields, only include non-empty values
      // Empty/null values will be deleted from metadata
      if (value !== null && value !== "") {
        result.additionalData[key] = value;
      }
    } else if (key === "name") {
      result.name = value?.trim() || "";
    } else if (key === "remixType") {
      result.remixType = value || REMIX_TYPE.AUTO;
    }
  });

  return result;
}

/**
 * Show an Edit Input Metadata dialog for a single input slot.
 * This metadata is shared across all presets and affects the exported workflow.
 *
 * @param {Object} options - Dialog options
 * @param {Object} options.app - ComfyUI app instance
 * @param {number} options.nodeId - Node ID
 * @param {string} options.slotName - Slot name
 * @param {string} options.nodeTitle - Node title for display
 * @param {Function} [options.onSave] - Callback when changes are saved
 * @returns {Promise<boolean>} True if saved, false if cancelled
 */
export function showEditGlobalSettingsDialog({ app, nodeId, slotName, nodeTitle, onSave }) {
  // Get current metadata first
  const currentMetadata = getInputMetadata(app, nodeId, slotName);
  if (!currentMetadata) {
    return Promise.resolve(false);
  }

  return showDialog(TEMPLATE_IDS.EDIT_GLOBAL_SETTINGS_DIALOG, {
    onOpen: ({ overlay, dialog, close }) => {
      const titleEl = overlay.querySelector("[data-bind='title']");
      const subtitleNodeEl = overlay.querySelector("[data-bind='subtitle-node']");
      const subtitleSlotEl = overlay.querySelector("[data-bind='subtitle-slot']");
      const formContainer = overlay.querySelector("[data-element='form-container']");
      const cancelBtn = overlay.querySelector("[data-action='cancel']");
      const saveBtn = overlay.querySelector("[data-action='save']");

      // Set dialog title and subtitle
      if (titleEl) {
        titleEl.textContent = "Edit Input Metadata";
      }
      if (subtitleNodeEl) {
        subtitleNodeEl.textContent = nodeTitle;
        subtitleNodeEl.title = nodeTitle; // Tooltip for full text
      }
      if (subtitleSlotEl) {
        subtitleSlotEl.textContent = slotName;
        subtitleSlotEl.title = slotName; // Tooltip for full text
      }

      // Build context for field applicability
      const node = app.graph.getNodeById?.(nodeId);
      const context = buildMetadataContext({
        app,
        node,
        slotName,
        primitiveType: currentMetadata.type,
        isInput: true,
        remixType: currentMetadata.remixType,
      });

      // Create the metadata form
      const form = createMetadataForm({
        app,
        context,
        currentValues: currentMetadata,
        primitiveType: currentMetadata.type,
        isInput: true,
        formClass: "rtx-remix-edit-details-form",
      });

      if (formContainer) {
        formContainer.appendChild(form);
      }

      // Save handler
      function handleSave() {
        const values = extractFormValues(form);

        // Update the node's metadata
        // Note: order is not included - it's controlled by drag-and-drop in the list UI
        const success = updateInputMetadata(app, nodeId, slotName, {
          name: values.name,
          remixType: values.remixType,
          additionalData: values.additionalData,
        });

        if (success) {
          onSave?.();
          close(true);
        } else {
          close(false);
        }
      }

      // Event listeners
      cancelBtn?.addEventListener("click", () => close(false));
      saveBtn?.addEventListener("click", handleSave);

      // Ctrl+Enter to save
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();
          handleSave();
        }
      });

      // Focus first input
      setTimeout(() => {
        const firstInput = form.querySelector("input, select, textarea");
        firstInput?.focus();
      }, 100);
    },
  });
}
