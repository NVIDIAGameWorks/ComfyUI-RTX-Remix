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

// API Endpoints
export const API_ENDPOINTS = {
  WORKFLOWS_BASE: "/rtx-remix/v1/workflows",
  WORKFLOWS_SAVE: "/rtx-remix/v1/workflows/save",
};

// Prefix for all RTX Remix nodes
export const NODE_PREFIX = "RTXRemix";

// ComfyUI automatically serves the web directory at /extensions/{folder-name}/
export const ASSETS = {
  REMIX_ICON: "/extensions/comfyui-rtx_remix/resources/images/remix_icon.png",
};

// RTX Remix metadata keys - hierarchically organized
export const REMIX_KEYS = {
  ROOT: "rtx-remix",
  META: "_meta",

  STRUCTURE: {
    INPUTS: "inputs",
    OUTPUT: "output",
  },

  PROPERTY: {
    NAME: "name",
    TYPE: "type",
    REMIX_TYPE: "remix_type",
    ORDER: "order",
    ADDITIONAL_DATA_ROOT: "additional_data",
    ADDITIONAL_DATA: {
      TOOLTIP: "tooltip",
      GROUP: "group",
      MIN: "min",
      MAX: "max",
      STEP: "step",
      TEXTURE_TYPE: "texture_type",
    },
  },

  DYNAMIC: {
    REF: "ref",
  },
};

// ComfyUI primitive type names
// Only these types can be tagged for RTX Remix export
export const PRIMITIVE_TYPES = new Set(["STRING", "INT", "FLOAT", "BOOLEAN", "COMBO"]);

// RTX Remix type enum
// These are the valid types for RTX Remix slot metadata
export const REMIX_TYPE = {
  TEXTURE_FILE_PATH: "texture_file_path",
  TEXTURE_PRIM_PATH: "texture_prim_path",
  MESH_FILE_PATH: "mesh_file_path",
  MESH_PRIM_PATH: "mesh_prim_path",
  LAYER_IDENTIFIER: "layer_identifier",
  PROMPT: "prompt",
  AUTO: "auto",
};

// Primitive type to RTX Remix type compatibility mapping for inputs
// Inputs can be any string primitive (file paths, prim paths, identifiers, prompts)
export const COMFYUI_INPUT_TYPE_MAP = {
  str: [
    REMIX_TYPE.TEXTURE_FILE_PATH,
    REMIX_TYPE.TEXTURE_PRIM_PATH,
    REMIX_TYPE.MESH_FILE_PATH,
    REMIX_TYPE.MESH_PRIM_PATH,
    REMIX_TYPE.LAYER_IDENTIFIER,
    REMIX_TYPE.PROMPT,
    REMIX_TYPE.AUTO,
  ],
  int: [REMIX_TYPE.AUTO],
  float: [REMIX_TYPE.AUTO],
  bool: [REMIX_TYPE.AUTO],
};

// Primitive type to RTX Remix type compatibility mapping for outputs
// Outputs can ONLY be string types with file paths (texture or mesh)
export const COMFYUI_OUTPUT_TYPE_MAP = {
  str: [REMIX_TYPE.TEXTURE_FILE_PATH, REMIX_TYPE.MESH_FILE_PATH],
};

// Metadata field configuration system
// Defines which metadata fields are available and their conditions
// Ordered: Dynamic data (min/max/step), Texture type, Always available (tooltip/group)
export const METADATA_FIELD_CONFIG = [
  {
    key: REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.MIN,
    label: "Mininum Value",
    inputType: "number",
    applyTo: (context) => ["float", "int"].includes(context.primitiveType),
    defaultValue: (context) => context.widgetConfig?.min ?? null,
  },
  {
    key: REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.MAX,
    label: "Maximum Value",
    inputType: "number",
    applyTo: (context) => ["float", "int"].includes(context.primitiveType),
    defaultValue: (context) => context.widgetConfig?.max ?? null,
  },
  {
    key: REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.STEP,
    label: "Step Size",
    inputType: "number",
    applyTo: (context) => ["float", "int"].includes(context.primitiveType),
    defaultValue: (context) => context.widgetConfig?.step ?? null,
  },
  {
    key: REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TEXTURE_TYPE,
    label: "Texture Type",
    inputType: "text",
    applyTo: (context) => !context.isInput && context.remixType === REMIX_TYPE.TEXTURE_FILE_PATH,
    defaultValue: (context) => context.widgetValue ?? null,
  },
  {
    key: REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TOOLTIP,
    label: "Tooltip",
    inputType: "text",
    applyTo: () => true, // Always available
    defaultValue: (context) => {
      // Check NODE_DEFAULTS first, then node description, then empty string
      return context.nodeDefaults?.[REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TOOLTIP] || context.nodeDescription || "";
    },
  },
  {
    key: REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.GROUP,
    label: "UI Group",
    inputType: "text",
    applyTo: () => true, // Always available
    defaultValue: () => "",
  },
];

// Default export names and types for specific nodes
//
// Structure:
//   - inputs: { nodeType: { inputs: { slotName: { name, remix_type } } } }
//   - output: { nodeType: { output: { name, remix_type } } }
//
// Fallback chain:
//   name: slot.name → defaults.name → slot.name (for inputs) or node.title (for outputs)
//   remix_type: slot.remix_type → defaults.remix_type → REMIX_TYPE.AUTO
//
// Options for name:
//   - null: use slot name (for inputs) or node title (for outputs)
//   - string: use this name (e.g., "texture", "prompt")
//   - { ref: "widgetName" }: dynamically use value from another widget
//     (e.g., { ref: "texture_type" } will use the value of the texture_type widget)
//
// Options for remix_type:
//   - null: use REMIX_TYPE.AUTO (JSON equivalent of primitive type)
//   - REMIX_TYPE enum value: use this type (e.g., REMIX_TYPE.TEXTURE_FILE_PATH, REMIX_TYPE.PROMPT)
export const NODE_DEFAULTS = {
  LoadImage: {
    inputs: {
      image: {
        [REMIX_KEYS.PROPERTY.NAME]: "texture",
        [REMIX_KEYS.PROPERTY.REMIX_TYPE]: REMIX_TYPE.TEXTURE_FILE_PATH,
        [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TOOLTIP]: "Input texture file to be processed by the workflow",
      },
    },
  },
  RTXRemixSaveTexture: {
    output: {
      // Dynamic: uses texture_type widget value
      [REMIX_KEYS.PROPERTY.NAME]: { [REMIX_KEYS.DYNAMIC.REF]: "texture_type" },
      [REMIX_KEYS.PROPERTY.REMIX_TYPE]: REMIX_TYPE.TEXTURE_FILE_PATH,
      [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TEXTURE_TYPE]: {
        [REMIX_KEYS.DYNAMIC.REF]: "texture_type",
      },
      [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TOOLTIP]:
        "Generated texture output for RTX Remix (albedo, roughness, normal, etc.)",
    },
  },
  CLIPTextEncode: {
    inputs: {
      text: {
        [REMIX_KEYS.PROPERTY.NAME]: "prompt",
        [REMIX_KEYS.PROPERTY.REMIX_TYPE]: REMIX_TYPE.PROMPT,
        [REMIX_KEYS.PROPERTY.ADDITIONAL_DATA.TOOLTIP]: "Text prompt used to guide the generation process",
      },
    },
  },
};
