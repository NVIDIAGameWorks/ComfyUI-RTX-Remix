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
import { API_ENDPOINTS, COMFYUI_INPUT_TYPE_MAP, COMFYUI_OUTPUT_TYPE_MAP } from "../utils/constants.js";
import { cloneTemplate, bindTemplateData } from "../utils/html.js";
import {
  addRemixMetadataToPrompt,
  applySlotEditsToGraphNodes,
  extractTaggedSlots,
  getApplicableMetadataFields,
} from "../cores/workflowExportCore.js";

/**
 * Export workflow handler - retrieves current workflow name and shows export dialog
 * @param {Object} app - ComfyUI app instance
 */
export async function exportWorkflow(app) {
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
 * @returns {HTMLElement} Accordion element
 */
function createMetadataAccordion({ context, slotData }) {
  const accordion = cloneTemplate("rtx-remix-metadata-accordion-template");
  if (!accordion) {
    console.error("Failed to load metadata accordion template");
    return null;
  }

  const form = accordion.querySelector('[data-element="form"]');

  // Get applicable fields
  const applicableFields = getApplicableMetadataFields(context);

  // Create field for each applicable metadata
  applicableFields.forEach((fieldConfig) => {
    const fieldDiv = document.createElement("div");
    fieldDiv.className = "rtx-remix-metadata-field";

    const label = document.createElement("label");
    label.className = "rtx-remix-metadata-label";
    label.textContent = fieldConfig.label;
    fieldDiv.appendChild(label);

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

    // Get current value from slotData additional_data or use computed default
    const currentValue = slotData.additionalData?.[fieldConfig.key] ?? fieldConfig.computedDefault;
    if (currentValue !== null && currentValue !== undefined) {
      input.value = currentValue;
    }

    fieldDiv.appendChild(input);
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
    const overlay = cloneTemplate("rtx-remix-export-dialog-template");
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
    const inputsTbody = overlay.querySelector('[data-element="inputs-tbody"]');
    const outputsTbody = overlay.querySelector('[data-element="outputs-tbody"]');

    // Set up initial values
    input.value = defaultValue;

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
      // Get filename stem (without extension) - backend adds .json automatically
      const lastDotIndex = filename.lastIndexOf(".");
      const workflowName = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;

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
        applySlotEditsToGraphNodes(app, inputsTbody, outputsTbody);

        // Now serialize the graph (which has updated metadata)
        setLoading(true, "Generating workflow data...");
        const promptResult = await app.graphToPrompt();
        const apiWorkflow = promptResult.output;
        const workflowGraph = app.graph.serialize();

        // Add Remix metadata inline to the API workflow
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
          // Update active workflow to point to the newly saved file (Save As behavior)
          const workflowManager = app.extensionManager?.workflow;
          if (workflowManager?.activeWorkflow && responseData.workflows?.full?.user?.path) {
            const workflow = workflowManager.activeWorkflow;
            const newName = responseData.name;
            const newPath = responseData.workflows.full.user.path;

            // Update workflow properties
            workflow.filename = newName;
            workflow.fullFilename = newName + ".json";
            workflow.path = newPath;

            // Mark workflow as saved by replicating what workflow.save() does internally
            // (without making another API call since we already saved via our custom API)
            const serialized = app.graph.serialize();
            const content = JSON.stringify(serialized);
            workflow.content = content;
            workflow.originalContent = content;
            workflow.changeTracker.reset();
            workflow.isModified = false;
          }

          app.extensionManager.toast.add({
            severity: "success",
            summary: "Export Successful",
            detail: `Workflow saved as "${responseData.name}.json"`,
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
        const confirmOverlay = cloneTemplate("rtx-remix-confirm-dialog-template");
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
        const spinner = cloneTemplate("rtx-remix-spinner-template");
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

    // Create a table row for a slot using template
    function createSlotRow(slot, isInput) {
      // Clone the row template
      const row = cloneTemplate("rtx-remix-slot-row-template");
      if (!row) {
        console.error("Failed to load slot row template");
        return null;
      }

      // Bind data to template
      bindTemplateData(row, {
        nodeTitle: slot.nodeTitle,
        slotName: slot.slotName,
        exportName: slot.exportName,
        comfyuiType: slot.primitiveType || "unknown",
        nodeId: slot.nodeId,
        slotName: slot.slotName,
        isInput: isInput,
      });

      // Populate the remix type dropdown
      const remixTypeSelect = row.querySelector(".rtx-remix-slot-type-select");
      if (remixTypeSelect) {
        // Get valid types based on slot direction and primitive type
        const typeMap = isInput ? COMFYUI_INPUT_TYPE_MAP : COMFYUI_OUTPUT_TYPE_MAP;
        const validTypes = typeMap[slot.primitiveType] || typeMap["*"];

        validTypes.forEach((type) => {
          const option = document.createElement("option");
          option.value = type;
          option.textContent = type;
          if (type === slot.remixType) {
            option.selected = true;
          }
          remixTypeSelect.appendChild(option);
        });
      }

      // Create metadata accordion
      const accordion = createMetadataAccordion({
        context: slot.context,
        slotData: slot,
      });

      // Setup chevron button to toggle accordion
      const chevronBtn = row.querySelector(".rtx-remix-details-btn");
      if (chevronBtn) {
        chevronBtn.addEventListener("click", () => {
          const isExpanded = accordion.style.display !== "none";
          accordion.style.display = isExpanded ? "none" : "table-row";
          chevronBtn.classList.toggle("expanded", !isExpanded);
        });
      }

      // Return both row and accordion as a fragment
      const fragment = document.createDocumentFragment();
      fragment.appendChild(row);
      fragment.appendChild(accordion);

      return fragment;
    }

    // Setup drag and drop for a tbody
    function setupDragAndDrop(tbody) {
      let draggedRow = null;
      let sourceTbody = null;

      // Disable row dragging when focusing interactive elements
      tbody.addEventListener(
        "focus",
        (e) => {
          const row = e.target.closest("tr");
          if (row) row.setAttribute("draggable", "false");
        },
        true
      );

      // Re-enable row dragging when blurring interactive elements
      tbody.addEventListener(
        "blur",
        (e) => {
          const row = e.target.closest("tr");
          if (row) row.setAttribute("draggable", "true");
        },
        true
      );

      tbody.addEventListener("dragstart", (e) => {
        if (e.target.classList.contains("rtx-remix-draggable-row")) {
          draggedRow = e.target;
          sourceTbody = tbody;
          e.target.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        }
      });

      tbody.addEventListener("dragend", (e) => {
        if (e.target.classList.contains("rtx-remix-draggable-row")) {
          e.target.classList.remove("dragging");
          draggedRow = null;
          sourceTbody = null;
        }
        // Remove all drag-over indicators
        tbody.querySelectorAll(".drag-over, .drag-over-bottom").forEach((el) => {
          el.classList.remove("drag-over", "drag-over-bottom");
        });
      });

      tbody.addEventListener("dragover", (e) => {
        // Only allow drag over if we're in the same tbody as the source
        if (sourceTbody !== tbody) {
          return;
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        // Find the closest draggable row, not accordion rows
        const row = e.target.closest("tr.rtx-remix-draggable-row");
        if (!row || row === draggedRow) {
          return;
        }

        // Remove all drag-over indicators
        tbody.querySelectorAll(".drag-over, .drag-over-bottom").forEach((el) => {
          el.classList.remove("drag-over", "drag-over-bottom");
        });

        // Determine if we should insert before or after
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (e.clientY < midpoint) {
          row.classList.add("drag-over");
        } else {
          row.classList.add("drag-over-bottom");
        }
      });

      tbody.addEventListener("drop", (e) => {
        // Only allow drop if we're in the same tbody as the source
        if (sourceTbody !== tbody) {
          return;
        }

        e.preventDefault();

        const targetRow = e.target.closest("tr.rtx-remix-draggable-row");
        if (!targetRow || !draggedRow || targetRow === draggedRow) {
          return;
        }

        // Get the accordion row that follows the dragged row
        const draggedAccordion = draggedRow.nextElementSibling;
        const isDraggedAccordion =
          draggedAccordion && draggedAccordion.classList.contains("rtx-remix-metadata-accordion");

        // Determine insert position
        const rect = targetRow.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (e.clientY < midpoint) {
          // Insert before target
          tbody.insertBefore(draggedRow, targetRow);
          if (isDraggedAccordion) {
            tbody.insertBefore(draggedAccordion, targetRow);
          }
        } else {
          // Insert after target (and its accordion if it has one)
          const targetAccordion = targetRow.nextElementSibling;
          const isTargetAccordion =
            targetAccordion && targetAccordion.classList.contains("rtx-remix-metadata-accordion");

          if (isTargetAccordion) {
            tbody.insertBefore(draggedRow, targetAccordion.nextSibling);
            if (isDraggedAccordion) {
              tbody.insertBefore(draggedAccordion, targetAccordion.nextSibling);
            }
          } else {
            tbody.insertBefore(draggedRow, targetRow.nextSibling);
            if (isDraggedAccordion) {
              tbody.insertBefore(draggedAccordion, targetRow.nextSibling);
            }
          }
        }

        // Remove drag indicators
        tbody.querySelectorAll(".drag-over, .drag-over-bottom").forEach((el) => {
          el.classList.remove("drag-over", "drag-over-bottom");
        });
      });
    }

    // Populate the slots tables
    function populateSlotsTable(slotData) {
      const { inputs, outputs } = slotData;

      // Clear existing rows
      inputsTbody.innerHTML = "";
      outputsTbody.innerHTML = "";

      // Populate inputs table
      if (inputs.length > 0) {
        inputsWrapper.style.display = "block";
        inputs.forEach((slot) => {
          const row = createSlotRow(slot, true);
          if (row) {
            inputsTbody.appendChild(row);
          }
        });
        // Setup drag and drop for inputs table
        setupDragAndDrop(inputsTbody);
      } else {
        // Show warning when no inputs are tagged
        inputsWrapper.style.display = "block";
        const warningRow = cloneTemplate("rtx-remix-warning-row-template");
        if (warningRow) {
          bindTemplateData(warningRow, {
            message: "No input slots tagged. Tag at least one input slot using the node context menu.",
          });
          inputsTbody.appendChild(warningRow);
        }
      }

      // Populate outputs table
      if (outputs.length > 0) {
        outputsWrapper.style.display = "block";
        outputs.forEach((slot) => {
          const row = createSlotRow(slot, false);
          if (row) {
            outputsTbody.appendChild(row);
          }
        });
        // Setup drag and drop for outputs table
        setupDragAndDrop(outputsTbody);
      } else {
        // Show warning when no outputs are tagged
        outputsWrapper.style.display = "block";
        const warningRow = cloneTemplate("rtx-remix-warning-row-template");
        if (warningRow) {
          bindTemplateData(warningRow, {
            message: "No output nodes tagged. Tag at least one output node using the node context menu.",
          });
          outputsTbody.appendChild(warningRow);
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
