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

// ComfyUI to Python primitive type mapping
const PRIMITIVE_TYPE_MAP = {
  STRING: "str",
  INT: "int",
  FLOAT: "float",
  BOOLEAN: "bool",
  COMBO: "str",
};

/**
 * Get Python primitive type name from ComfyUI type specification
 * @param {string|Array} typeSpec - ComfyUI type spec (string, tuple, or COMBO array)
 * @returns {string|null} Python type name (str, int, float, bool) or null for non-primitives
 */
export function getPrimitiveTypeName(typeSpec) {
  // Handle direct string type
  if (typeof typeSpec === "string") {
    return PRIMITIVE_TYPE_MAP[typeSpec] || null;
  }

  // Handle array configurations
  if (Array.isArray(typeSpec)) {
    if (typeSpec.length === 0) return null;

    const firstElement = typeSpec[0];

    // COMBO case: first element is an array of options (always returns str)
    if (Array.isArray(firstElement)) {
      return "str";
    }

    // Standard type case: first element is the type string
    if (typeof firstElement === "string") {
      return PRIMITIVE_TYPE_MAP[firstElement] || null;
    }
  }

  return null;
}

