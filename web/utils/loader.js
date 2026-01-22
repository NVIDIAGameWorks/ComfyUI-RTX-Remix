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

/**
 * Load all required resources (CSS and HTML templates) for the extension
 */
export function loadResources() {
  // Load CSS files
  loadCSS("extensions/comfyui-rtx_remix/resources/styles/variables.css");
  loadCSS("extensions/comfyui-rtx_remix/resources/styles/animations.css");
  loadCSS("extensions/comfyui-rtx_remix/resources/styles/buttons.css");
  loadCSS("extensions/comfyui-rtx_remix/resources/styles/dialogs.css");
  loadCSS("extensions/comfyui-rtx_remix/resources/styles/slots.css");
  loadCSS("extensions/comfyui-rtx_remix/resources/styles/metadata.css");

  // Load common HTML templates
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/exportDialog.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/slotRow.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/confirmDialog.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/infoDialog.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/slotMetadataField.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/spinner.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/metadataAccordion.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/warningRow.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/menuItem.html");

  // Load download node templates (organized by source)
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/download/generic.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/download/huggingface.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/download/civitai.html");
  loadHTMLTemplate("extensions/comfyui-rtx_remix/resources/templates/download/custom.html");
}
