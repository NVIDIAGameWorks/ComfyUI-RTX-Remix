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
 * Component Factory - Creates UI components from templates.
 *
 * Factory functions create DOM elements from templates without attaching
 * event handlers (callers add their own handlers). This keeps factories
 * pure and reusable.
 *
 * DEPENDENCY RULES:
 *   factories → utils (NEVER controllers/cores/stores)
 */

import { cloneTemplate, bindTemplateData } from "../utils/html.js";
import { TEMPLATE_IDS } from "../utils/constants.js";

/**
 * Map of input types to their template IDs
 */
const INPUT_TEMPLATES = {
  text: TEMPLATE_IDS.TEXT_INPUT,
  number: TEMPLATE_IDS.NUMBER_INPUT,
  select: TEMPLATE_IDS.SELECT_INPUT,
  checkbox: TEMPLATE_IDS.CHECKBOX_INPUT,
  textarea: TEMPLATE_IDS.TEXTAREA_INPUT,
  slider: TEMPLATE_IDS.SLIDER_INPUT,
};

/**
 * Create an input element from a template.
 *
 * @param {string} type - Input type: "text", "number", "select", "checkbox", "textarea", "slider"
 * @param {Object} [options={}] - Input configuration options
 * @param {string} [options.name] - Input name attribute
 * @param {*} [options.value] - Initial value
 * @param {string} [options.placeholder] - Placeholder text
 * @param {boolean} [options.disabled] - Whether input is disabled
 * @param {Array<{value: string, label: string}>} [options.options] - Options for select inputs
 * @param {number} [options.min] - Minimum value for number/slider inputs
 * @param {number} [options.max] - Maximum value for number/slider inputs
 * @param {number} [options.step] - Step value for number/slider inputs
 * @returns {HTMLElement|null} The input element, or null if template not found
 */
function createInput(type, options = {}) {
  const templateId = INPUT_TEMPLATES[type];
  if (!templateId) {
    console.warn(`[componentFactory] Unknown input type: ${type}`);
    return null;
  }

  const element = cloneTemplate(templateId);
  if (!element) {
    return null;
  }

  const input = element.querySelector("input, select, textarea") || element;

  // Apply common options
  if (options.name) {
    input.name = options.name;
  }
  if (options.placeholder) {
    input.placeholder = options.placeholder;
  }
  if (options.disabled) {
    input.disabled = true;
  }

  // Type-specific configuration
  switch (type) {
    case "text":
    case "textarea":
      if (options.value !== undefined) {
        input.value = options.value;
      }
      break;

    case "number":
      if (options.value !== undefined) {
        input.value = options.value;
      }
      if (options.min !== undefined) {
        input.min = options.min;
      }
      if (options.max !== undefined) {
        input.max = options.max;
      }
      if (options.step !== undefined) {
        input.step = options.step;
      }
      break;

    case "checkbox":
      if (options.value !== undefined) {
        input.checked = Boolean(options.value);
      }
      if (options.label) {
        const labelSpan = element.querySelector("[data-bind='label']");
        if (labelSpan) {
          labelSpan.textContent = options.label;
        }
      }
      break;

    case "select":
      if (options.options) {
        options.options.forEach(({ value, label }) => {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = label;
          input.appendChild(opt);
        });
      }
      if (options.value !== undefined) {
        input.value = options.value;
      }
      break;

    case "slider":
      // Slider template has its own structure, configure via data attributes or specific selectors
      const rangeInput = element.querySelector('input[type="range"]');
      const numberInput = element.querySelector('input[type="number"]');
      if (rangeInput) {
        if (options.value !== undefined) rangeInput.value = options.value;
        if (options.min !== undefined) rangeInput.min = options.min;
        if (options.max !== undefined) rangeInput.max = options.max;
        if (options.step !== undefined) rangeInput.step = options.step;
      }
      if (numberInput) {
        if (options.value !== undefined) numberInput.value = options.value;
        if (options.min !== undefined) numberInput.min = options.min;
        if (options.max !== undefined) numberInput.max = options.max;
        if (options.step !== undefined) numberInput.step = options.step;
      }
      break;
  }

  return element;
}

/**
 * Create a form field with label and input.
 *
 * @param {Object} config - Field configuration
 * @param {string} config.label - Field label text
 * @param {string} config.inputType - Input type (passed to createInput)
 * @param {Object} [config.inputOptions={}] - Options passed to createInput
 * @param {string} [config.fieldClass] - Additional class for the field container
 * @param {string} [config.labelClass] - Additional class for the label
 * @param {string} [config.inputClass] - Additional class for the input
 * @param {Object} [config.dataAttributes={}] - Data attributes to add to the input
 * @returns {{field: HTMLElement, input: HTMLElement|null}} The field container and input element
 */
export function createFormField(config) {
  const { label, inputType, inputOptions = {}, fieldClass, labelClass, inputClass, dataAttributes = {} } = config;

  const field = cloneTemplate(TEMPLATE_IDS.FORM_FIELD);
  if (!field) {
    return { field: null, input: null };
  }

  // Apply custom field class
  if (fieldClass) {
    field.classList.add(fieldClass);
  }

  // Apply custom label class
  const labelEl = field.querySelector("[data-bind='label']");
  if (labelEl && labelClass) {
    labelEl.classList.add(labelClass);
  }

  bindTemplateData(field, { label });

  const inputWrap = field.querySelector("[data-element='input-wrap']");
  const input = createInput(inputType, inputOptions);

  if (inputWrap && input) {
    // Apply custom input class
    const actualInput = input.querySelector("input, select, textarea") || input;
    if (inputClass) {
      actualInput.classList.add(inputClass);
    }

    // Apply data attributes
    Object.entries(dataAttributes).forEach(([key, value]) => {
      actualInput.dataset[key] = value;
    });

    inputWrap.appendChild(input);
  }

  // Return the actual input element for event binding
  const actualInput = input?.querySelector("input, select, textarea") || input;

  return { field, input: actualInput };
}

/**
 * Create a split button with main action and caret for popover.
 * The split button has two distinct click targets: a main button for the primary action
 * and a caret button that typically opens a dropdown/popover with options.
 *
 * @param {Object} config - Split button configuration
 * @param {string} config.label - Main button label text
 * @param {string} [config.title] - Main button title/tooltip
 * @param {string} [config.caretTitle="More options"] - Caret button title/tooltip
 * @param {string} [config.variant="primary"] - Button variant: "primary", "secondary"
 * @param {boolean} [config.disabled=false] - Whether main button is initially disabled
 * @returns {{container: HTMLElement, mainBtn: HTMLElement, caretBtn: HTMLElement}}
 */
export function createSplitButton(config) {
  const { label, title, caretTitle = "More options", variant = "primary", disabled = false } = config;

  const container = document.createElement("div");
  container.className = "rtx-remix-split-btn";

  const mainBtn = document.createElement("button");
  mainBtn.type = "button";
  mainBtn.className = `rtx-remix-btn rtx-remix-btn-${variant}`;
  mainBtn.textContent = label;
  if (title) mainBtn.title = title;
  if (disabled) mainBtn.disabled = true;

  const caretBtn = document.createElement("button");
  caretBtn.type = "button";
  caretBtn.className = `rtx-remix-btn rtx-remix-btn-${variant}`;
  caretBtn.title = caretTitle;
  caretBtn.innerHTML = '<span class="pi pi-chevron-down"></span>';

  container.appendChild(mainBtn);
  container.appendChild(caretBtn);

  return { container, mainBtn, caretBtn };
}
