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
 * Shared slot row utilities for rendering consistent slot information.
 * Used by both export dialog and preset panel for consistent slot display.
 */

/**
 * Create a slot label cell with name and node title.
 * This is the common element shared between export dialog and preset panel rows.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.primaryLabel - Primary label (slot name or export name)
 * @param {string} options.secondaryLabel - Secondary label (node title)
 * @param {string} [options.primaryTooltip] - Tooltip for primary label
 * @param {string} [options.secondaryTooltip] - Tooltip for secondary label
 * @param {string} [options.cellClass="rtx-remix-slot-label-cell"] - CSS class for the cell
 * @param {string} [options.primaryClass="rtx-remix-slot-name"] - CSS class for primary span
 * @param {string} [options.secondaryClass="rtx-remix-slot-node-title"] - CSS class for secondary span
 * @returns {HTMLElement} The label cell element
 */
export function createSlotLabelCell(options) {
  const {
    primaryLabel,
    secondaryLabel,
    primaryTooltip,
    secondaryTooltip,
    cellClass = "rtx-remix-slot-label-cell",
    primaryClass = "rtx-remix-slot-name",
    secondaryClass = "rtx-remix-slot-node-title",
  } = options;

  const cell = document.createElement("div");
  cell.className = cellClass;

  const primarySpan = document.createElement("span");
  primarySpan.className = primaryClass;
  primarySpan.textContent = primaryLabel;
  if (primaryTooltip) {
    primarySpan.title = primaryTooltip;
  }
  cell.appendChild(primarySpan);

  const secondarySpan = document.createElement("span");
  secondarySpan.className = secondaryClass;
  secondarySpan.textContent = secondaryLabel;
  if (secondaryTooltip) {
    secondarySpan.title = secondaryTooltip;
  }
  cell.appendChild(secondarySpan);

  return cell;
}

/**
 * Create a button cell with an icon button.
 * Used for menu buttons, details buttons, etc.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.iconClass - Icon class (e.g., "pi pi-ellipsis-v")
 * @param {string} [options.title] - Button title/tooltip
 * @param {string} [options.action] - Data-action attribute value
 * @param {string} [options.cellClass] - CSS class for the cell
 * @param {string} [options.buttonClass] - CSS class for the button
 * @returns {{cell: HTMLElement, button: HTMLElement}} The cell and button elements
 */
export function createButtonCell(options) {
  const { iconClass, title, action, cellClass, buttonClass } = options;

  const cell = document.createElement("div");
  if (cellClass) {
    cell.className = cellClass;
  }

  const button = document.createElement("button");
  button.type = "button";
  if (buttonClass) {
    button.className = buttonClass;
  }
  if (action) {
    button.dataset.action = action;
  }
  if (title) {
    button.title = title;
  }
  button.innerHTML = `<span class="${iconClass}"></span>`;

  cell.appendChild(button);

  return { cell, button };
}

/**
 * Create a text display cell (read-only).
 *
 * @param {Object} options - Configuration options
 * @param {string} options.text - Text to display
 * @param {string} [options.cellClass] - CSS class for the cell
 * @param {string} [options.textClass] - CSS class for the text span
 * @returns {HTMLElement} The cell element
 */
export function createTextCell(options) {
  const { text, cellClass, textClass } = options;

  const cell = document.createElement("div");
  if (cellClass) {
    cell.className = cellClass;
  }

  const span = document.createElement("span");
  if (textClass) {
    span.className = textClass;
  }
  span.textContent = text;

  cell.appendChild(span);

  return cell;
}

/**
 * Create an input cell with a text input.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.value - Input value
 * @param {string} [options.placeholder] - Input placeholder
 * @param {string} [options.fieldKey] - Data attribute for field identification
 * @param {string} [options.cellClass] - CSS class for the cell
 * @param {string} [options.inputClass] - CSS class for the input
 * @returns {{cell: HTMLElement, input: HTMLInputElement}} The cell and input elements
 */
export function createInputCell(options) {
  const { value, placeholder, fieldKey, cellClass, inputClass } = options;

  const cell = document.createElement("div");
  if (cellClass) {
    cell.className = cellClass;
  }

  const input = document.createElement("input");
  input.type = "text";
  if (inputClass) {
    input.className = inputClass;
  }
  input.value = value || "";
  if (placeholder) {
    input.placeholder = placeholder;
  }
  if (fieldKey) {
    input.dataset.fieldKey = fieldKey;
  }

  cell.appendChild(input);

  return { cell, input };
}

/**
 * Create a select cell with a dropdown.
 *
 * @param {Object} options - Configuration options
 * @param {Array<{value: string, label: string}>} options.options - Select options
 * @param {string} options.selectedValue - Currently selected value
 * @param {string} [options.fieldKey] - Data attribute for field identification
 * @param {string} [options.cellClass] - CSS class for the cell
 * @param {string} [options.selectClass] - CSS class for the select
 * @returns {{cell: HTMLElement, select: HTMLSelectElement}} The cell and select elements
 */
export function createSelectCell(options) {
  const { options: selectOptions, selectedValue, fieldKey, cellClass, selectClass } = options;

  const cell = document.createElement("div");
  if (cellClass) {
    cell.className = cellClass;
  }

  const select = document.createElement("select");
  if (selectClass) {
    select.className = selectClass;
  }
  if (fieldKey) {
    select.dataset.fieldKey = fieldKey;
  }

  selectOptions.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (value === selectedValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  cell.appendChild(select);

  return { cell, select };
}

/**
 * Set row data attributes consistently across different row types.
 *
 * @param {HTMLElement} row - The row element
 * @param {Object} data - Data to set
 * @param {string|number} [data.nodeId] - Node ID
 * @param {string} [data.slotName] - Slot name
 * @param {boolean} [data.isInput] - Whether this is an input slot
 */
export function setRowDataAttributes(row, data) {
  if (data.nodeId !== undefined) {
    row.dataset.nodeId = data.nodeId;
  }
  if (data.slotName !== undefined) {
    row.dataset.slotName = data.slotName;
  }
  if (data.isInput !== undefined) {
    row.dataset.isInput = data.isInput;
  }
}
