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
import { NODE_PREFIX, REMIX_KEYS } from "./utils/constants.js";
import { getCanvasMenuItems, getNodeMenuItems } from "./cores/menuCore.js";
import { setupNode } from "./cores/nodeInteractivityCore.js";
import { drawNodeHighlights } from "./cores/slotMarkingCore.js";

/**
 * Initialize API event listeners for node input updates from the backend
 */
function setupApiListeners() {
  app.api.addEventListener("rtx-remix-update-node-input", (event) => {
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
 * Hook into node's draw foreground to render custom highlights
 */
function setupNodeDrawing(node) {
  const originalOnDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    originalOnDrawForeground?.apply(this, arguments);
    drawNodeHighlights(ctx, this);
  };
}

/**
 * Load RTX Remix metadata when a node is restored from a saved workflow
 */
function loadNodeMetadata(node, nodeData) {
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

/* ─────────────────────────────────────────────────────────────────────────────
 * Extension registration
 * ───────────────────────────────────────────────────────────────────────────── */

app.registerExtension({
  name: "RTXRemix.Integration",

  async setup() {
    loadResources();
    setupApiListeners();
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
});
