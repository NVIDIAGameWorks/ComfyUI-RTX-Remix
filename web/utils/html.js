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

import { ASSETS } from "./constants.js";

/** Cached remix color value */
let remixColor = null;

/**
 * Get CSS variable value from document
 * @param {string} name - CSS variable name
 * @returns {string} Variable value
 */
function getCSSVariable(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Get the RTX Remix primary color from CSS variables
 * @returns {string} Hex color value
 */
export function getRemixColor() {
  if (!remixColor) {
    remixColor = getCSSVariable("--remix-color") || "#76b900";
  }
  return remixColor;
}

/**
 * Load CSS file into the document
 * @param {string} href - Path to CSS file
 */
export function loadCSS(href) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

/**
 * Load HTML template file and inject into document
 * @param {string} href - Path to HTML template file
 * @returns {Promise<void>}
 */
export async function loadHTMLTemplate(href) {
  const templateId = `template-${href.replace(/[^a-zA-Z0-9]/g, "-")}`;

  // Remove existing template if present (for hot-reload during development)
  const existing = document.getElementById(templateId);
  if (existing) {
    existing.remove();
  }

  try {
    // Add cache-busting parameter to ensure fresh content
    const cacheBuster = `?t=${Date.now()}`;
    const response = await fetch(href + cacheBuster);
    const html = await response.text();

    const container = document.createElement("div");
    container.id = templateId;
    container.style.display = "none";
    container.innerHTML = html;

    document.body.appendChild(container);
  } catch (error) {
    console.error(`Failed to load template from ${href}:`, error);
  }
}

/**
 * Clone a template and return the element
 * @param {string} templateId - ID of the template element
 * @returns {HTMLElement|null}
 */
export function cloneTemplate(templateId) {
  const template = document.getElementById(templateId);
  if (!template) {
    console.error(`Template not found: ${templateId}`);
    return null;
  }

  return template.content.cloneNode(true).firstElementChild;
}

/**
 * Bind data to a cloned template element
 * @param {HTMLElement} element - The cloned template element
 * @param {Object} data - Data object to bind
 * @returns {HTMLElement} The element with bound data
 */
export function bindTemplateData(element, data) {
  // Bind text content to span/div elements with data-bind attribute
  element.querySelectorAll("span[data-bind], div[data-bind]").forEach((el) => {
    const key = el.getAttribute("data-bind");
    if (data[key] !== undefined) {
      el.textContent = data[key];
    }
  });

  // Bind values to input elements with data-bind attribute
  element.querySelectorAll("input[data-bind]").forEach((el) => {
    const key = el.getAttribute("data-bind");
    if (data[key] !== undefined) {
      el.value = data[key];
    }
  });

  // Bind placeholder to input elements with data-bind-placeholder attribute
  element.querySelectorAll("input[data-bind-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-bind-placeholder");
    if (data[key] !== undefined) {
      el.placeholder = data[key];
    }
  });

  // Set dataset fields on elements with data-fields attribute
  element.querySelectorAll("[data-fields]").forEach((el) => {
    const fields = el.getAttribute("data-fields");
    if (fields) {
      fields.split(",").forEach((fieldName) => {
        const trimmedField = fieldName.trim();
        if (trimmedField && data[trimmedField] !== undefined) {
          el.dataset[trimmedField] = data[trimmedField];
        }
      });
    }
  });

  // Bind assets to img elements with data-asset attribute
  element.querySelectorAll("img[data-asset]").forEach((el) => {
    const assetKey = el.getAttribute("data-asset");
    if (assetKey === "remix-icon") {
      el.src = ASSETS.REMIX_ICON;
    }
  });

  return element;
}

/**
 * Create HTML for Remix menu item with icon
 * @param {string} text - Menu text
 * @returns {string} HTML string
 */
export function createRemixMenuHTML(text) {
  const element = cloneTemplate("rtx-remix-menu-item-template");
  if (!element) {
    console.error("Failed to load menu item template");
    return text;
  }

  bindTemplateData(element, { text });
  return element.outerHTML;
}
