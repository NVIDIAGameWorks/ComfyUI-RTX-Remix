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
 * Node Controller
 *
 * Handles RTX Remix node setup, UI configuration, and API event handling.
 * Follows the dependency rule: controllers → cores → stores → utils
 */

import { api } from "../../../scripts/api.js";
import { cloneTemplate, bindTemplateData } from "../utils/html.js";
import { TEMPLATE_IDS, REMIX_KEYS, EVENTS } from "../utils/constants.js";

/** Cache for frontend configs fetched from Python backend */
const configCache = new Map();

/** Symbol keys for private properties on external objects */
const SETUP_COMPLETE = Symbol("rtxRemixSetup");
const ORIG_TYPE = Symbol("origType");
const ORIG_COMPUTE_SIZE = Symbol("origComputeSize");
const ORIG_HAS_COMPUTE_SIZE = Symbol("origHasComputeSize");

/**
 * Fetch frontend UI config for a node class from the backend API.
 * Results are cached to avoid redundant network requests.
 *
 * @param {string} nodeClass - The ComfyUI node class name (e.g., "RTXRemixDownloadModel")
 * @returns {Promise<Object|null>} The UI config object or null if fetch fails
 */
async function fetchFrontendConfig(nodeClass) {
  if (configCache.has(nodeClass)) {
    return configCache.get(nodeClass);
  }

  try {
    const response = await api.fetchApi(`/rtx-remix/v1/ui/${nodeClass}`);
    if (!response.ok) return null;

    const config = await response.json();
    configCache.set(nodeClass, config);
    return config;
  } catch (e) {
    console.warn(`Failed to fetch frontend config for ${nodeClass}:`, e);
    return null;
  }
}

/**
 * Display a modal info dialog with the given title and HTML content.
 * Dialog can be closed by clicking the close button or the overlay background.
 *
 * @param {string} title - The dialog title text
 * @param {string} content - HTML content to display in the dialog body
 */
function showInfoDialog(title, content) {
  const dialog = cloneTemplate(TEMPLATE_IDS.INFO_DIALOG);
  if (!dialog) return;

  bindTemplateData(dialog, { title });

  const contentEl = dialog.querySelector('[data-element="content"]');
  if (contentEl) contentEl.innerHTML = content;

  const close = () => dialog.remove();
  dialog.querySelector('[data-action="close"]')?.addEventListener("click", close);
  dialog.querySelector(".rtx-remix-info-overlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close();
  });

  document.body.appendChild(dialog);
}

/**
 * Update widget visibility based on declarative visibility rules.
 * Widgets are shown/hidden by changing their type to "converted-widget" and
 * overriding computeSize to collapse them.
 *
 * @param {Object} node - The LiteGraph node instance
 * @param {Array<Object>} visibilityRules - Array of visibility rule objects containing:
 *   - source_field: Widget name to watch for changes
 *   - mapping: Object mapping source values to arrays of field names to show
 *   - show_when_filled: Array of field names to show when source has any value
 * @param {Object} app - The ComfyUI app instance
 */
function updateVisibility(node, visibilityRules, app) {
  const controlledFields = new Set();
  const visibleFields = new Set();

  for (const { source_field, mapping, show_when_filled } of visibilityRules) {
    const sourceValue = node.widgets?.find((w) => w.name === source_field)?.value;

    // Register all controlled fields
    if (mapping) {
      Object.values(mapping)
        .flat()
        .forEach((f) => controlledFields.add(f));
    }
    show_when_filled?.forEach((f) => controlledFields.add(f));

    // Determine which fields should be visible
    if (show_when_filled?.length && sourceValue != null && sourceValue !== "") {
      show_when_filled.forEach((f) => visibleFields.add(f));
    }

    if (mapping) {
      // Handle both direct value match and boolean string conversion
      const matchedFields =
        mapping[sourceValue] ?? (typeof sourceValue === "boolean" ? mapping[String(sourceValue)] : null);
      matchedFields?.forEach((f) => visibleFields.add(f));
    }
  }

  // Apply visibility to widgets
  for (const widget of node.widgets ?? []) {
    if (!controlledFields.has(widget.name)) continue;

    // Preserve original widget state only once
    if (!(ORIG_TYPE in widget)) {
      widget[ORIG_TYPE] = widget.type;
    }
    if (!(ORIG_COMPUTE_SIZE in widget)) {
      widget[ORIG_COMPUTE_SIZE] = widget.computeSize;
      widget[ORIG_HAS_COMPUTE_SIZE] = Object.prototype.hasOwnProperty.call(widget, "computeSize");
    }

    const visible = visibleFields.has(widget.name);
    widget.hidden = !visible;
    widget.type = visible ? widget[ORIG_TYPE] : "converted-widget";
    if (visible) {
      if (widget[ORIG_HAS_COMPUTE_SIZE]) {
        widget.computeSize = widget[ORIG_COMPUTE_SIZE];
      } else {
        delete widget.computeSize;
      }
    } else {
      widget.computeSize = () => [0, -4];
    }
  }

  node.setSize(node.computeSize());
  app.graph.setDirtyCanvas(true, true);
}

/**
 * Detect the model source type from a URL by matching against known host patterns.
 *
 * @param {string} url - The URL to analyze
 * @param {Object<string, string>} hostPatterns - Map of source names to hostname patterns
 * @returns {string} The detected source name or "custom" if no match
 */
function detectSourceFromUrl(url, hostPatterns) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [source, pattern] of Object.entries(hostPatterns)) {
      if (hostname.includes(pattern)) return source;
    }
  } catch {
    // Invalid URL
  }
  return "custom";
}

/**
 * Parse a HuggingFace URL to extract repository ID and filename.
 *
 * Supported formats:
 * - https://huggingface.co/{org}/{repo}/resolve/main/{path}
 * - https://huggingface.co/{org}/{repo}/blob/main/{path}
 *
 * @param {string} url - HuggingFace URL to parse
 * @returns {{repo_id: string, filename: string}|null} Parsed data or null if invalid
 */
function parseHuggingFaceUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length < 5 || !["resolve", "blob", "tree"].includes(parts[2])) return null;
    return { repo_id: `${parts[0]}/${parts[1]}`, filename: parts.slice(4).join("/") };
  } catch {
    return null;
  }
}

/**
 * Parse a CivitAI URL to extract the model version ID.
 *
 * Supported formats:
 * - https://civitai.com/api/download/models/{version_id}
 * - https://civitai.com/models/{id}?modelVersionId={version_id}
 *
 * @param {string} url - CivitAI URL to parse
 * @returns {{version_id: string}|null} Parsed data or null if invalid
 */
function parseCivitAIUrl(url) {
  try {
    const urlObj = new URL(url);
    const apiMatch = urlObj.pathname.match(/\/api\/download\/models\/(\d+)/);
    if (apiMatch) return { version_id: apiMatch[1] };

    if (urlObj.pathname.startsWith("/models/")) {
      const versionId = urlObj.searchParams.get("modelVersionId");
      if (versionId) return { version_id: versionId };
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract the filename from a URL's path.
 *
 * @param {string} url - URL to extract filename from
 * @returns {string|null} The decoded filename or null if not found
 */
function extractFilenameFromUrl(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const filename = decodeURIComponent(segments.at(-1)).split("?")[0];
    return filename || null;
  } catch {
    return null;
  }
}

/** Map of source types to their URL parser functions */
const URL_PARSERS = {
  huggingface: parseHuggingFaceUrl,
  civitai: parseCivitAIUrl,
};

/**
 * Parse a URL based on detected source and populate node widgets with extracted data.
 * Also resets widgets specified in the parser config's reset array.
 *
 * @param {Object} node - The LiteGraph node instance
 * @param {string} url - The URL to parse
 * @param {string} source - The detected source type (huggingface, civitai, custom)
 * @param {Object} parsers - Parser configurations keyed by source type
 * @param {Object} app - The ComfyUI app instance
 */
function parseAndPopulateUrl(node, url, source, parsers, app) {
  const config = parsers[source];
  if (!config) return;

  // Parse URL using source-specific parser or fallback to filename extraction
  const parser = URL_PARSERS[source];
  const parsed = parser ? parser(url) : { filename: extractFilenameFromUrl(url) };

  // Populate widgets with parsed values
  if (parsed && config.populate) {
    for (const [key, widgetName] of Object.entries(config.populate)) {
      const widget = node.widgets?.find((w) => w.name === widgetName);
      if (widget && parsed[key]) widget.value = parsed[key];
    }
  }

  // Reset specified widgets
  config.reset?.forEach((name) => {
    const widget = node.widgets?.find((w) => w.name === name);
    if (widget) widget.value = "";
  });

  app.graph.setDirtyCanvas(true, true);
}

/**
 * Setup URL input handler that auto-detects source and populates fields.
 * Hooks into the URL widget's callback to process URL changes.
 *
 * @param {Object} node - The LiteGraph node instance
 * @param {Object} config - URL handler configuration containing:
 *   - source_field: Name of widget to store detected source
 *   - host_patterns: Map of source names to hostname patterns
 *   - parsers: Parser configurations for each source type
 * @param {Array<Object>|null} visibilityRules - Optional visibility rules to apply after URL change
 * @param {Object} app - The ComfyUI app instance
 */
function setupUrlHandler(node, { source_field, host_patterns, parsers }, visibilityRules, app) {
  const urlWidget = node.widgets?.find((w) => w.name === "url");
  const sourceWidget = node.widgets?.find((w) => w.name === source_field);
  if (!urlWidget || !sourceWidget) return;

  let previousUrl = urlWidget.value || "";
  let processing = false;

  const originalCallback = urlWidget.callback;
  urlWidget.callback = (value) => {
    originalCallback?.apply(urlWidget, [value]);
    if (!value || processing || value === previousUrl) return;

    processing = true;
    previousUrl = value;

    try {
      const source = detectSourceFromUrl(value, host_patterns);
      if (sourceWidget.value !== source) sourceWidget.value = source;

      parseAndPopulateUrl(node, value, source, parsers, app);
      if (visibilityRules) updateVisibility(node, visibilityRules, app);
    } finally {
      processing = false;
    }
  };
}

/**
 * Setup a dynamic info button that shows context-sensitive help dialogs.
 * The button label and content change based on the source widget's value.
 *
 * @param {Object} node - The LiteGraph node instance
 * @param {Object} config - Info button configuration containing:
 *   - source_field: Name of widget that determines which help to show
 *   - configs: Map of source values to {label, title, template} objects
 */
function setupInfoButton(node, { source_field, configs }) {
  const sourceWidget = node.widgets?.find((w) => w.name === source_field);
  if (!sourceWidget) return;

  const getConfig = () => configs[sourceWidget.value || ""] ?? configs[""] ?? null;
  const initialConfig = getConfig();
  if (!initialConfig) return;

  const infoButton = node.addWidget("button", initialConfig.label, null, () => {
    const cfg = getConfig();
    if (!cfg) return;
    const content = cloneTemplate(cfg.template)?.innerHTML ?? "";
    showInfoDialog(cfg.title, content);
  });
  infoButton.serializeValue = () => undefined;

  // Update button label when source changes
  const originalCallback = sourceWidget.callback;
  sourceWidget.callback = (value) => {
    originalCallback?.apply(sourceWidget, [value]);
    const cfg = getConfig();
    if (cfg) infoButton.name = cfg.label;
  };
}

/**
 * Setup automatic visibility updates by hooking into source widget callbacks.
 * Triggers updateVisibility whenever any source field changes.
 *
 * @param {Object} node - The LiteGraph node instance
 * @param {Array<Object>} visibilityRules - Array of visibility rule configurations
 * @param {Object} app - The ComfyUI app instance
 */
function setupVisibility(node, visibilityRules, app) {
  const sourceFields = new Set(visibilityRules.map((r) => r.source_field));

  for (const fieldName of sourceFields) {
    const widget = node.widgets?.find((w) => w.name === fieldName);
    if (!widget) continue;

    const originalCallback = widget.callback;
    widget.callback = (value) => {
      originalCallback?.apply(widget, [value]);
      updateVisibility(node, visibilityRules, app);
    };
  }

  // Apply initial visibility
  updateVisibility(node, visibilityRules, app);
}

/**
 * Setup reset rules that clear specified widgets when source fields change.
 *
 * @param {Object} node - The LiteGraph node instance
 * @param {Array<Object>} resetRules - Array of reset rule objects containing:
 *   - source_field: Widget name to watch for changes
 *   - reset_fields: Array of widget names to clear when source changes
 * @param {Object} app - The ComfyUI app instance
 */
function setupResetRules(node, resetRules, app) {
  for (const { source_field, reset_fields } of resetRules) {
    const sourceWidget = node.widgets?.find((w) => w.name === source_field);
    if (!sourceWidget || !reset_fields?.length) continue;

    let previousValue = sourceWidget.value ?? "";

    const originalCallback = sourceWidget.callback;
    sourceWidget.callback = (value) => {
      originalCallback?.apply(sourceWidget, [value]);

      // Skip if value hasn't actually changed
      if (value === previousValue) return;

      // Reset specified fields
      for (const name of reset_fields) {
        const w = node.widgets?.find((w) => w.name === name);
        if (w) w.value = "";
      }

      previousValue = value;
      app.graph.setDirtyCanvas(true, true);
    };
  }
}

/**
 * Main setup function for RTX Remix nodes.
 * Fetches UI configuration from the backend and applies interactive behaviors
 * including URL handling, visibility rules, and info buttons.
 *
 * @param {Object} node - The LiteGraph node instance to configure
 * @param {Object} app - The ComfyUI app instance
 * @returns {Promise<void>}
 */
export async function setupNode(node, app) {
  if (node[SETUP_COMPLETE]) return;
  node[SETUP_COMPLETE] = true;

  const config = await fetchFrontendConfig(node.comfyClass);
  if (!config) return;

  if (config.url_handler) setupUrlHandler(node, config.url_handler, config.visibility_rules, app);
  if (config.visibility_rules) setupVisibility(node, config.visibility_rules, app);
  if (config.reset_rules) setupResetRules(node, config.reset_rules, app);
  if (config.info_button) setupInfoButton(node, config.info_button);
}

/**
 * Initialize API event listeners for node input updates from the backend.
 * Handles real-time value updates pushed from Python to the frontend.
 *
 * @param {Object} app - The ComfyUI app instance
 */
export function setupApiListeners(app) {
  app.api.addEventListener(EVENTS.UPDATE_NODE_INPUT, (event) => {
    const { node_id, input_name, value } = event.detail;
    const node = app.graph.getNodeById(node_id);
    if (!node) return;

    const widget = node.widgets?.find((w) => w.name === input_name);
    if (!widget) return;

    widget.value = value;
    widget.callback?.(value);
    app.graph.setDirtyCanvas(true, true);
    app.graph.change?.();
  });
}

/**
 * Load RTX Remix metadata when a node is restored from a saved workflow.
 * Transfers persisted metadata from nodeData to the live node properties.
 *
 * @param {Object} node - The LiteGraph node instance
 * @param {Object} nodeData - The serialized node data from the workflow
 */
export function loadNodeMetadata(node, nodeData) {
  const remixData = nodeData.properties?.[REMIX_KEYS.ROOT];
  if (!remixData) return;

  node.properties ??= {};
  node.properties[REMIX_KEYS.ROOT] ??= {};

  const { INPUTS, OUTPUT } = REMIX_KEYS.STRUCTURE;
  if (remixData[INPUTS]) {
    node.properties[REMIX_KEYS.ROOT][INPUTS] = remixData[INPUTS];
  }
  if (remixData[OUTPUT]) {
    node.properties[REMIX_KEYS.ROOT][OUTPUT] = remixData[OUTPUT];
  }
}
