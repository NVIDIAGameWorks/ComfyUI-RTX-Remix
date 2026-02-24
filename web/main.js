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

import { app } from "../../scripts/app.js";
import { loadResources } from "./utils/loader.js";
import { NODE_PREFIX } from "./utils/constants.js";
import { getCanvasMenuItems, getNodeMenuItems } from "./controllers/menuController.js";
import { setupNode, setupApiListeners, loadNodeMetadata } from "./controllers/nodeController.js";
import { setupNodeDrawing } from "./controllers/slotMarkingController.js";
import { registerPresetsSidebar, refreshPresetsSidebar, handlePendingChangesBeforeAction } from "./controllers/presetSidebarController.js";
import { initExportController } from "./controllers/exportDialogController.js";

/* ─────────────────────────────────────────────────────────────────────────────
 * Extension registration
 * ───────────────────────────────────────────────────────────────────────────── */

app.registerExtension({
  name: "RTXRemix.Integration",

  async setup() {
    loadResources();
    setupApiListeners(app);
    registerPresetsSidebar(app);
    initExportController(app);
  },

  getCanvasMenuItems: () => getCanvasMenuItems(app),
  getNodeMenuItems: (node) => getNodeMenuItems(node, app),

  async nodeCreated(node) {
    setupNodeDrawing(node);
    if (node.comfyClass?.startsWith(NODE_PREFIX)) {
      await setupNode(node, app);
    }
  },

  async loadedGraphNode(node, nodeData) {
    loadNodeMetadata(node, nodeData);
  },

  /**
   * Called before a graph is configured (workflow loaded/switched).
   * Handle any pending preset changes to prevent data loss.
   */
  async beforeConfigureGraph() {
    await handlePendingChangesBeforeAction(app);
  },

  /**
   * Called after a graph is configured (workflow loaded/switched).
   * Refresh the preset sidebar to reflect the new workflow's data.
   */
  afterConfigureGraph() {
    refreshPresetsSidebar();
  },
});
