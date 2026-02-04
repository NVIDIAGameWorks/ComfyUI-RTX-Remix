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

import { loadCSS, loadHTMLTemplate } from "./html.js";
import { EXTENSION_BASE } from "./constants.js";

/**
 * Load all required resources (CSS and HTML templates) for the extension
 */
export function loadResources() {
  // Load CSS files
  loadCSS(`${EXTENSION_BASE}/resources/styles/variables.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/animations.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/buttons.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/dialogs.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/slots.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/metadata.css`);

  // Load common HTML templates
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/exportDialog.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/slotRow.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/confirmDialog.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/infoDialog.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/slotMetadataField.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/spinner.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/metadataAccordion.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/warningRow.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/menuItem.html`);

  // Load download node templates (organized by source)
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/generic.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/huggingface.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/civitai.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/custom.html`);
}
