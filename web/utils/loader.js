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
  loadCSS(`${EXTENSION_BASE}/resources/styles/utilities.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/animations.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/buttons.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/dialogs.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/slots.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/metadata.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/sidebar.css`);
  loadCSS(`${EXTENSION_BASE}/resources/styles/groupedList.css`);

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
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/sidebarPanel.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/presetItem.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/presetInputField.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/presetListRow.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/deletePresetConfirm.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/clearDefaultConfirm.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/editPresetDialog.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/unsavedChangesDialog.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/applyAllConfirm.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/resetAllConfirm.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/popover.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/emptyMessage.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/sliderInput.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/editGlobalSettingsDialog.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/groupedListGroup.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/groupedListRow.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/groupPicker.html`);

  // Load download node templates (organized by source)
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/generic.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/huggingface.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/civitai.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/download/custom.html`);

  // Load reusable component templates
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/components/formField.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/components/inputs/text.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/components/inputs/number.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/components/inputs/select.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/components/inputs/checkbox.html`);
  loadHTMLTemplate(`${EXTENSION_BASE}/resources/templates/components/inputs/textarea.html`);
}
