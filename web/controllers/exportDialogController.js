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

import { api } from "../../../scripts/api.js";
import {
  API_ENDPOINTS,
  COMFYUI_INPUT_TYPE_MAP,
  COMFYUI_OUTPUT_TYPE_MAP,
  EVENTS,
  REMIX_TYPE,
  REMIX_KEYS,
  TEMPLATE_IDS,
} from "../utils/constants.js";
import { cloneTemplate, bindTemplateData } from "../utils/html.js";
import {
  createSlotLabelCell,
  createInputCell,
  createTextCell,
  createSelectCell,
  createButtonCell,
  setRowDataAttributes,
} from "./slotRowController.js";
import {
  addRemixMetadataToPrompt,
  applySlotEditsToGraphNodes,
  extractTaggedSlots,
  getApplicableMetadataFields,
  updateGroupOrder,
} from "../cores/workflowExportCore.js";
import { getGroupOrder } from "../stores/graphStore.js";
import { createGroupedList } from "./groupedListController.js";
import { updateInputMetadata } from "../cores/metadataEditorCore.js";
import { createGroupPicker } from "./groupPickerController.js";
import { cleanupDeletedInputs } from "../cores/presetCore.js";
import { handlePendingChangesBeforeAction } from "./presetSidebarController.js";

/**
 * Initialize the export controller - registers event listeners.
 * @param {Object} app - ComfyUI app instance
 */
export function initExportController(app) {
  app.api.addEventListener(EVENTS.EXPORT_WORKFLOW_REQUESTED, () => exportWorkflow(app));
}

/**
 * Export workflow handler - retrieves current workflow name and shows export dialog
 * @param {Object} app - ComfyUI app instance
 */
export async function exportWorkflow(app) {
  // Check for pending preset changes before export
  const canProceed = await handlePendingChangesBeforeAction(app);
  if (!canProceed) {
    return; // User cancelled, don't show export dialog
  }

  // Get current workflow filename (without extension)
  let workflowName = "workflow";

  // Use the active workflow filename from the workflow store
  const activeWorkflow = app.extensionManager?.workflow?.activeWorkflow;
  if (activeWorkflow?.filename) {
    // Use filename without extension (the dialog will add .json automatically)
    workflowName = activeWorkflow.filename;
  }

  // Show custom export dialog which handles the entire export process
  await showExportDialog({
    app,
    defaultValue: workflowName,
  });
}

/**
 * Create metadata accordion with dynamic fields based on slot context
 * @param {Object} options - Accordion options
 * @param {Object} options.app - ComfyUI app instance (for group picker)
 * @param {Object} options.context - Slot context
 * @param {Object} options.slotData - Slot data
 * @param {boolean} [options.includeGroup=true] - Whether to include the group field
 * @returns {HTMLElement} Accordion element
 */
function createMetadataAccordion({ app, context, slotData, includeGroup = true }) {
  const accordion = cloneTemplate(TEMPLATE_IDS.METADATA_ACCORDION);
  if (!accordion) {
    console.error("Failed to load metadata accordion template");
    return null;
  }

  const form = accordion.querySelector('[data-element="form"]');

  // Get applicable fields
  const applicableFields = getApplicableMetadataFields(context);

  // Create field for each applicable metadata
  applicableFields.forEach((fieldConfig) => {
    // Skip group field if not included
    if (!includeGroup && fieldConfig.key === REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP) {
      return;
    }

    const fieldDiv = document.createElement("div");
    fieldDiv.className = "rtx-remix-metadata-field";

    const label = document.createElement("label");
    label.className = "rtx-remix-metadata-label";
    label.textContent = fieldConfig.label;
    fieldDiv.appendChild(label);

    // Get current value from slotData additional_data or use computed default
    const currentValue = slotData.additionalData?.[fieldConfig.key] ?? fieldConfig.computedDefault;

    // Use group picker for the group field
    if (fieldConfig.key === REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP) {
      const picker = createGroupPicker({
        app,
        currentValue: currentValue || "",
        onChange: (newGroup) => {
          // Value is stored in data attribute for form extraction
          picker.dataset.selectedGroup = newGroup || "";
        },
      });
      picker.dataset.fieldKey = fieldConfig.key;
      picker.dataset.nodeId = context.nodeId;
      picker.dataset.slotName = context.slotName || "";
      picker.dataset.isInput = context.isInput;
      picker.dataset.isAdditionalData = "true";
      picker.dataset.selectedGroup = currentValue || "";
      fieldDiv.appendChild(picker);
    } else {
      // Standard input field
      let input;
      if (fieldConfig.inputType === "textarea") {
        input = document.createElement("textarea");
        input.className = "rtx-remix-metadata-input";
        input.rows = 3;
      } else {
        input = document.createElement("input");
        input.className = "rtx-remix-metadata-input";
        input.type = fieldConfig.inputType;
      }

      input.dataset.fieldKey = fieldConfig.key;
      input.dataset.nodeId = context.nodeId;
      input.dataset.slotName = context.slotName || "";
      input.dataset.isInput = context.isInput;

      if (currentValue !== null && currentValue !== undefined) {
        input.value = currentValue;
      }

      fieldDiv.appendChild(input);
    }

    form.appendChild(fieldDiv);
  });

  return accordion;
}

/**
 * Shows a rich export dialog for RTX Remix workflows and handles the entire export process
 * @param {Object} options - Dialog options
 * @param {Object} options.app - The ComfyUI app instance
 * @param {string} options.defaultValue - Default filename
 * @returns {Promise<boolean>} - True if export succeeded, false if cancelled or failed
 */
export async function showExportDialog({ app, defaultValue = "workflow" } = {}) {
  return new Promise((resolve) => {
    // Clone the dialog template
    const overlay = cloneTemplate(TEMPLATE_IDS.EXPORT_DIALOG);
    if (!overlay) {
      console.error("Failed to load export dialog template");
      resolve(false);
      return;
    }

    // Bind assets (icon)
    bindTemplateData(overlay, {});

    // Get references to elements
    const dialog = overlay.querySelector(".rtx-remix-dialog");
    const input = overlay.querySelector('[data-input="filename"]');
    const validationMsg = overlay.querySelector('[data-element="validation"]');
    const infoMsg = overlay.querySelector('[data-element="info"]');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    const exportBtn = overlay.querySelector('[data-action="export"]');

    // Slots section elements
    const slotsSection = overlay.querySelector('[data-element="slots-section"]');
    const inputsWrapper = overlay.querySelector('[data-element="inputs-wrapper"]');
    const outputsWrapper = overlay.querySelector('[data-element="outputs-wrapper"]');
    // Note: inputs use grouped list (no inputsTbody), outputs use traditional tbody
    const outputsTbody = overlay.querySelector('[data-element="outputs-tbody"]');

    // Set up initial values
    input.value = defaultValue;

    // Track collapsed groups state for inputs (must be before populateSlotsTable call)
    const inputsCollapsedGroups = new Set();

    // Extract and populate tagged slots
    const slotData = extractTaggedSlots(app);
    populateSlotsTable(slotData);

    // Validation function
    function validateFilename(filename) {
      if (!filename) {
        showValidation("Filename cannot be empty");
        return false;
      }

      const invalidChars = /[<>:"|?*\\/]/;
      if (invalidChars.test(filename)) {
        showValidation("Filename contains invalid characters");
        return false;
      }

      hideValidation();
      return true;
    }

    function showValidation(message) {
      validationMsg.textContent = message;
      validationMsg.classList.add("show");
      input.classList.add("error");
    }

    function hideValidation() {
      validationMsg.classList.remove("show");
      input.classList.remove("error");
    }

    // Real-time validation
    input.addEventListener("input", () => {
      const filename = input.value.trim();
      if (filename) {
        validateFilename(filename);
      } else {
        hideValidation();
      }
    });

    // Close dialog function
    function closeDialog(result) {
      overlay.style.animation = "rtx-fadeOut 0.15s ease-out";
      dialog.style.animation = "rtx-slideOut 0.15s ease-out";

      setTimeout(() => {
        document.body.removeChild(overlay);
        resolve(result);
      }, 150);
    }

    // Handle export process
    async function handleExport(filename) {
      // Strip .json extension if present - backend adds it automatically
      const workflowName = filename.endsWith(".json") ? filename.slice(0, -5) : filename;

      setLoading(true, "Checking if file exists...");

      try {
        // Check if file exists (check both api and full workflows in user directory)
        const checkResponse = await api.fetchApi(
          `${API_ENDPOINTS.WORKFLOWS_BASE}/api/user/${encodeURIComponent(workflowName)}`,
          { method: "HEAD" }
        );

        if (checkResponse.status === 200) {
          setLoading(false);
          const confirmed = await showOverwriteConfirmation(`${workflowName}.json`);

          if (!confirmed) {
            return;
          }

          setLoading(true, "Preparing workflow...");
        }

        // Apply UI edits directly to graph nodes first
        setLoading(true, "Preparing workflow...");
        applySlotEditsToGraphNodes(app, inputsWrapper, outputsWrapper);

        // Clean up stale metadata (orphaned groups, empty presets) before serialization
        cleanupDeletedInputs(app);

        // Now serialize the graph (which has updated metadata)
        setLoading(true, "Generating workflow data...");
        const promptResult = await app.graphToPrompt();
        const apiWorkflow = promptResult.output;
        const workflowGraph = app.graph.serialize();

        // Add RTX Remix metadata inline to the API workflow
        const enrichedPrompt = addRemixMetadataToPrompt(apiWorkflow, workflowGraph);

        // Send to backend to save (send name without extension)
        setLoading(true, "Saving workflow...");
        const response = await api.fetchApi(API_ENDPOINTS.WORKFLOWS_SAVE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: workflowName,
            workflows: {
              api: enrichedPrompt,
              full: workflowGraph,
            },
          }),
        });

        const responseData = await response.json();

        if (responseData.success) {
          // Note: We intentionally do NOT save the original workflow here.
          // The RTX Remix export saves to user/rtx-remix/workflows/ via the backend.
          // The original workflow file should remain unchanged (clean/readonly).
          // If users want to save their changes to the original, they can do so manually.

          app.extensionManager.toast.add({
            severity: "success",
            summary: "Export Successful",
            detail: `Workflow exported to "${responseData.name}.json"`,
            life: 5000,
          });
          closeDialog(true);
        } else {
          throw new Error(responseData.message || "Unknown error");
        }
      } catch (error) {
        console.error("Export error:", error);
        setLoading(false);
        showError(error.message || "Failed to export workflow");
      }
    }

    // Show overwrite confirmation
    function showOverwriteConfirmation(filename) {
      return new Promise((resolveConfirm) => {
        const confirmOverlay = cloneTemplate(TEMPLATE_IDS.CONFIRM_DIALOG);
        if (!confirmOverlay) {
          resolveConfirm(false);
          return;
        }

        const filenameSpan = confirmOverlay.querySelector('[data-element="filename"]');
        const confirmCancelBtn = confirmOverlay.querySelector('[data-action="cancel"]');
        const confirmBtn = confirmOverlay.querySelector('[data-action="confirm"]');

        filenameSpan.textContent = `"${filename}"`;

        confirmCancelBtn.addEventListener("click", () => {
          document.body.removeChild(confirmOverlay);
          resolveConfirm(false);
        });

        confirmBtn.addEventListener("click", () => {
          document.body.removeChild(confirmOverlay);
          resolveConfirm(true);
        });

        confirmOverlay.addEventListener("click", (e) => {
          if (e.target === confirmOverlay) {
            document.body.removeChild(confirmOverlay);
            resolveConfirm(false);
          }
        });

        document.body.appendChild(confirmOverlay);
      });
    }

    // Set loading state
    function setLoading(loading, message = "") {
      input.disabled = loading;
      cancelBtn.disabled = loading;
      exportBtn.disabled = loading;

      if (loading) {
        const spinner = cloneTemplate(TEMPLATE_IDS.SPINNER);
        if (spinner) {
          exportBtn.innerHTML = "";
          exportBtn.appendChild(spinner);
        } else {
          exportBtn.textContent = "Exporting...";
        }

        if (message) {
          infoMsg.textContent = message;
          infoMsg.classList.add("loading");
        }
      } else {
        exportBtn.textContent = "Export";
        infoMsg.textContent = "The .json extension will be added automatically if not provided.";
        infoMsg.classList.remove("loading");
      }
    }

    // Show error message
    function showError(message) {
      showValidation(message);
      app.extensionManager.toast.add({
        severity: "error",
        summary: "Export Failed",
        detail: message,
        life: 5000,
      });
    }

    // Handle keyboard events
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!exportBtn.disabled) {
          closeDialog(false);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!exportBtn.disabled) {
          const filename = input.value.trim();
          if (validateFilename(filename)) {
            handleExport(filename);
          }
        }
      }
    }

    // Event listeners
    cancelBtn.addEventListener("click", () => {
      if (!exportBtn.disabled) {
        closeDialog(false);
      }
    });

    exportBtn.addEventListener("click", async () => {
      const filename = input.value.trim();
      if (validateFilename(filename)) {
        await handleExport(filename);
      }
    });

    overlay.addEventListener("keydown", handleKeyDown);

    // Track mousedown on overlay to prevent closing on drag-select from inside dialog
    let mouseDownOnOverlay = false;

    overlay.addEventListener("mousedown", (e) => {
      // Only set flag if mousedown is directly on overlay (not on dialog)
      if (e.target === overlay) {
        mouseDownOnOverlay = true;
      }
    });

    overlay.addEventListener("mouseup", (e) => {
      // Only close if both mousedown and mouseup were on the overlay
      if (mouseDownOnOverlay && e.target === overlay && !exportBtn.disabled) {
        closeDialog(false);
      }
      mouseDownOnOverlay = false;
    });

    // Prevent clicks inside the dialog from bubbling
    dialog.addEventListener("mousedown", (e) => {
      mouseDownOnOverlay = false;
    });

    /**
     * Render header cells into a header row
     * @param {HTMLElement} headerRow - The header row element to populate
     * @param {boolean} isInput - Whether this is for inputs (affects column labels)
     */
    function renderExportHeader(headerRow, isInput = true) {
      // Drag column (empty)
      const dragCol = document.createElement("div");
      headerRow.appendChild(dragCol);

      // Chevron spacer column (empty, for alignment with group headers)
      const chevronCol = document.createElement("div");
      headerRow.appendChild(chevronCol);

      // Slot name column
      const slotCol = document.createElement("div");
      slotCol.textContent = isInput ? "Input" : "Output";
      headerRow.appendChild(slotCol);

      // Export Name column
      const nameCol = document.createElement("div");
      nameCol.textContent = "Export Name";
      headerRow.appendChild(nameCol);

      // Type column
      const typeCol = document.createElement("div");
      typeCol.textContent = "Type";
      headerRow.appendChild(typeCol);

      // RTX Remix Type column
      const remixTypeCol = document.createElement("div");
      remixTypeCol.textContent = "RTX Remix Type";
      headerRow.appendChild(remixTypeCol);

      // Details column (empty)
      const detailsCol = document.createElement("div");
      headerRow.appendChild(detailsCol);
    }

    /**
     * Populate a slot row with data (used as row delegate for grouped list)
     * @param {Object} slot - Slot data
     * @param {HTMLElement} row - The row element to populate
     * @param {boolean} isInput - Whether this is an input slot
     */
    function populateSlotRow(slot, row, isInput) {
      // Set data attributes using shared utility
      setRowDataAttributes(row, {
        nodeId: slot.nodeId,
        slotName: slot.slotName,
        isInput,
      });

      // Cell 1: Stacked slot name (bold) + node title (muted)
      const labelCell = createSlotLabelCell({
        primaryLabel: slot.slotName,
        secondaryLabel: slot.nodeTitle,
        primaryTooltip: slot.slotName,
        secondaryTooltip: slot.nodeTitle,
      });
      row.appendChild(labelCell);

      // Cell 2: Export name input
      const { cell: nameCell } = createInputCell({
        value: slot.exportName || slot.slotName,
        fieldKey: "exportName",
        cellClass: "rtx-remix-slot-name-cell",
        inputClass: "rtx-remix-slot-name-input",
      });
      row.appendChild(nameCell);

      // Cell 3: Primitive type (read-only)
      const primitiveTypeCell = createTextCell({
        text: slot.primitiveType || "unknown",
        cellClass: "rtx-remix-slot-primitive-type-cell",
        textClass: "rtx-remix-slot-primitive-type",
      });
      row.appendChild(primitiveTypeCell);

      // Cell 4: RTX Remix type dropdown
      const typeMap = isInput ? COMFYUI_INPUT_TYPE_MAP : COMFYUI_OUTPUT_TYPE_MAP;
      const validTypes = typeMap[slot.primitiveType] || [REMIX_TYPE.AUTO];
      const { cell: typeCell } = createSelectCell({
        options: validTypes.map((type) => ({ value: type, label: type })),
        selectedValue: slot.remixType,
        fieldKey: "remixType",
        cellClass: "rtx-remix-slot-type-cell",
        selectClass: "rtx-remix-slot-type-select",
      });
      row.appendChild(typeCell);

      // Cell 5: Details button (for accordion)
      const { cell: detailsCell, button: detailsBtn } = createButtonCell({
        iconClass: "pi pi-chevron-down",
        title: "Show metadata details",
        cellClass: "rtx-remix-slot-details-cell",
        buttonClass: "rtx-remix-details-btn",
      });
      row.appendChild(detailsCell);

      // Store button reference for toggle handler (set by companion row renderer)
      row._detailsBtn = detailsBtn;
    }

    /**
     * Create companion row (accordion) for a slot
     * @param {Object} slot - Slot data
     * @param {HTMLElement} mainRow - The main row element
     * @returns {HTMLElement|null} Accordion row
     */
    function createSlotCompanionRow(slot, mainRow) {
      const accordion = createMetadataAccordion({
        app,
        context: slot.context,
        slotData: slot,
      });

      if (!accordion) return null;

      // Initially hidden
      accordion.classList.add("rtx-hidden");

      // Add companion row class for proper styling
      accordion.classList.add("rtx-remix-companion-row");

      // Wire up details button to toggle accordion
      const detailsBtn = mainRow._detailsBtn;
      if (detailsBtn) {
        detailsBtn.addEventListener("click", () => {
          const isExpanded = !accordion.classList.contains("rtx-hidden");
          accordion.classList.toggle("rtx-hidden", isExpanded);
          detailsBtn.classList.toggle("expanded", !isExpanded);
        });
      }

      return accordion;
    }

    /**
     * Create accordion for output slots (without group field)
     * @param {Object} slot - Slot data
     * @returns {HTMLElement|null} Accordion element
     */
    function createOutputAccordion(slot) {
      return createMetadataAccordion({
        app,
        context: slot.context,
        slotData: slot,
        includeGroup: false, // Outputs don't have groups
      });
    }

    // Populate the slots tables
    function populateSlotsTable(slotData) {
      const { inputs, outputs } = slotData;

      // Clear existing content
      inputsWrapper.querySelector(".rtx-remix-export-scroll-wrapper")?.remove();
      inputsWrapper.querySelector(".rtx-remix-warning-row")?.remove();
      outputsWrapper.querySelector(".rtx-remix-export-scroll-wrapper")?.remove();
      outputsWrapper.querySelector(".rtx-remix-warning-row")?.remove();

      // Populate inputs using grouped list with header
      if (inputs.length > 0) {
        inputsWrapper.style.display = "block";

        // Create scroll wrapper container
        const scrollWrapper = document.createElement("div");
        scrollWrapper.className = "rtx-remix-export-scroll-wrapper";

        // Create grouped list container with export-specific columns
        const inputsContainer = document.createElement("div");
        inputsContainer.className = "rtx-remix-grouped-list rtx-remix-export-inputs";

        // Create grouped list with header, grouping, and companion rows (accordions)
        createGroupedList({
          container: inputsContainer,
          items: inputs.map((slot) => ({
            ...slot,
            group: slot.group || "",
            order: slot.order ?? 999,
          })),
          groupOrder: getGroupOrder(app),
          collapsedGroups: inputsCollapsedGroups,
          // Column header row (above groups)
          renderHeader: (headerRow) => {
            renderExportHeader(headerRow, true);
          },
          // Data row cells
          renderRow: (item, rowEl) => {
            populateSlotRow(item, rowEl, true);
          },
          // Accordion below each row
          renderCompanionRow: (item, rowEl) => {
            return createSlotCompanionRow(item, rowEl);
          },
          companionRowClass: "rtx-remix-metadata-accordion",
          onItemOrderChange: (groupName, orderedItems) => {
            // Update node metadata with new order values
            orderedItems.forEach((item) => {
              updateInputMetadata(app, item.nodeId, item.slotName, { order: item.order });
            });
          },
          onGroupOrderChange: (newOrder) => {
            updateGroupOrder(app, newOrder);
          },
          emptyMessage: "No input slots tagged.",
        });

        scrollWrapper.appendChild(inputsContainer);
        inputsWrapper.appendChild(scrollWrapper);
      } else {
        // Show warning when no inputs are tagged
        inputsWrapper.style.display = "block";
        const warningRow = cloneTemplate(TEMPLATE_IDS.WARNING_ROW);
        if (warningRow) {
          bindTemplateData(warningRow, {
            message: "No input slots tagged. Tag at least one input slot using the node context menu.",
          });
          inputsWrapper.appendChild(warningRow);
        }
      }

      // Populate outputs using flat list with header (no grouping)
      if (outputs.length > 0) {
        outputsWrapper.style.display = "block";

        // Create scroll wrapper container
        const scrollWrapper = document.createElement("div");
        scrollWrapper.className = "rtx-remix-export-scroll-wrapper";

        // Create flat list container with export-specific columns
        const outputsContainer = document.createElement("div");
        outputsContainer.className = "rtx-remix-grouped-list rtx-remix-export-outputs";

        // Add header row manually (same grid, same alignment)
        const headerRow = document.createElement("div");
        headerRow.className = "rtx-remix-list-row rtx-remix-list-header";
        renderExportHeader(headerRow, false);
        outputsContainer.appendChild(headerRow);

        // Render each output as a simple row (no grouping)
        outputs.forEach((slot) => {
          // Create row from template
          const row = cloneTemplate(TEMPLATE_IDS.GROUPED_LIST_ROW);
          if (!row) return;

          row.dataset.nodeId = slot.nodeId;
          row.dataset.slotName = slot.slotName;
          row.draggable = false; // No drag for outputs

          // Hide drag handle for outputs
          const dragHandle = row.querySelector("[data-element='drag-handle']");
          if (dragHandle) {
            dragHandle.style.visibility = "hidden";
          }

          // Populate row cells
          populateSlotRow(slot, row, false);
          outputsContainer.appendChild(row);

          // Create accordion (companion row)
          const accordion = createOutputAccordion(slot);
          if (accordion) {
            accordion.className = "rtx-remix-companion-row rtx-remix-metadata-accordion rtx-hidden";
            outputsContainer.appendChild(accordion);

            // Wire up details button
            const detailsBtn = row.querySelector(".rtx-remix-details-btn");
            if (detailsBtn) {
              detailsBtn.addEventListener("click", () => {
                const isExpanded = !accordion.classList.contains("rtx-hidden");
                accordion.classList.toggle("rtx-hidden", isExpanded);
                detailsBtn.classList.toggle("expanded", !isExpanded);
              });
            }
          }
        });

        scrollWrapper.appendChild(outputsContainer);
        outputsWrapper.appendChild(scrollWrapper);
      } else {
        // Show warning when no outputs are tagged
        outputsWrapper.style.display = "block";
        const warningRow = cloneTemplate(TEMPLATE_IDS.WARNING_ROW);
        if (warningRow) {
          bindTemplateData(warningRow, {
            message: "No output nodes tagged. Tag at least one output node using the node context menu.",
          });
          outputsWrapper.appendChild(warningRow);
        }
      }
    }

    // Add to DOM
    document.body.appendChild(overlay);

    // Focus input and select all text
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
  });
}
