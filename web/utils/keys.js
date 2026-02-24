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
 * Key Utilities - Pure functions for generating unique identifiers.
 */

/**
 * Generate a unique input key from node ID and slot name.
 * @param {number} nodeId - Node ID
 * @param {string} slotName - Slot name
 * @returns {string} Input key in format "nodeId.slotName"
 */
export function getInputKey(nodeId, slotName) {
  return `${nodeId}.${slotName}`;
}

/**
 * Parse an input key back into its node ID and slot name components.
 * Handles slot names that contain dots by only splitting on the first dot.
 * @param {string} key - Input key in format "nodeId.slotName"
 * @returns {{nodeId: number, slotName: string}}
 */
export function parseInputKey(key) {
  const dotIdx = key.indexOf(".");
  return {
    nodeId: Number(key.slice(0, dotIdx)),
    slotName: key.slice(dotIdx + 1),
  };
}
