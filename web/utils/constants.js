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

// Preset storage keys - consolidated under rtx-remix root
// Structure: app.graph.extra["rtx-remix"].activePreset, .presets, .groupOrder
export const PRESET_KEYS = {
  ACTIVE_PRESET: "activePreset",
  PRESETS: "presets",
  DEFAULT: "default",
  INPUTS: "inputs",
  VALUE: "value",
  DESCRIPTION: "description",
  GROUP_ORDER: "groupOrder",
  AUTO_SAVE: "autoSave",
};

// Keyboard key constants
export const KEYS = {
  ENTER: "Enter",
  ESCAPE: "Escape",
};

// Sidebar configuration
export const SIDEBAR = {
  ID: "rtx-remix-presets",
  TITLE: "Presets",
  TOOLTIP: "RTX Remix Presets - Manage preset values for tagged inputs",
};

// API Endpoints
export const API_ENDPOINTS = {
  WORKFLOWS_BASE: "/rtx-remix/v1/workflows",
  WORKFLOWS_SAVE: "/rtx-remix/v1/workflows/save",
};

// Prefix for all RTX Remix nodes
export const NODE_PREFIX = "RTXRemix";

// Dynamically determine extension base path from current module URL
export const EXTENSION_BASE = new URL(".", import.meta.url).pathname.replace(/\/utils\/$/, "");

// Asset paths relative to the extension's web directory
export const ASSETS = {
  REMIX_ICON: `${EXTENSION_BASE}/resources/images/remix_icon.png`,
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
    label: "Minimum Value",
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
    label: "Group",
    inputType: "text",
    applyTo: () => true, // Always available
    defaultValue: () => "",
  },
];

// Template IDs for cloneTemplate() calls
export const TEMPLATE_IDS = {
  // Dialogs
  EXPORT_DIALOG: "rtx-remix-export-dialog-template",
  CONFIRM_DIALOG: "rtx-remix-confirm-dialog-template",
  INFO_DIALOG: "rtx-remix-info-dialog-template",
  EDIT_PRESET_DIALOG: "rtx-remix-edit-preset-dialog-template",
  DELETE_PRESET_CONFIRM: "rtx-remix-delete-preset-confirm-template",
  CLEAR_DEFAULT_CONFIRM: "rtx-remix-clear-default-confirm-template",
  APPLY_ALL_CONFIRM: "rtx-remix-apply-all-confirm-template",
  RESET_ALL_CONFIRM: "rtx-remix-reset-all-confirm-template",
  UNSAVED_CHANGES_DIALOG: "rtx-remix-unsaved-changes-dialog-template",

  // Components
  SIDEBAR_PANEL: "rtx-remix-sidebar-panel-template",
  GROUPED_LIST_GROUP: "rtx-remix-grouped-list-group-template",
  GROUPED_LIST_ROW: "rtx-remix-grouped-list-row-template",
  PRESET_LIST_ROW: "rtx-remix-preset-list-row-template",
  PRESET_LIST_EMPTY: "rtx-remix-preset-list-empty-template",
  INPUTS_EMPTY: "rtx-remix-inputs-empty-template",
  WARNING_ROW: "rtx-remix-warning-row-template",
  METADATA_ACCORDION: "rtx-remix-metadata-accordion-template",
  SLIDER_INPUT: "rtx-remix-slider-input-template",
  SPINNER: "rtx-remix-spinner-template",
  MENU_ITEM: "rtx-remix-menu-item-template",

  // Popover/Menu
  POPOVER: "rtx-remix-popover-template",
  POPOVER_ITEM: "rtx-remix-popover-item-template",
  INPUT_MENU: "rtx-remix-input-menu-template",
  GROUP_MENU: "rtx-remix-group-menu-template",
  SAVE_MENU: "rtx-remix-save-menu-template",

  // Global Settings
  EDIT_GLOBAL_SETTINGS_DIALOG: "rtx-remix-edit-global-settings-dialog-template",

  // Group Picker
  GROUP_PICKER: "rtx-remix-group-picker-template",
  GROUP_PICKER_OPTION: "rtx-remix-group-picker-option-template",
  GROUP_PICKER_CREATE: "rtx-remix-group-picker-create-template",
  GROUP_PICKER_INPUT: "rtx-remix-group-picker-input-template",

  // Reusable Components
  FORM_FIELD: "rtx-remix-form-field-template",
  TEXT_INPUT: "rtx-remix-text-input-template",
  NUMBER_INPUT: "rtx-remix-number-input-template",
  SELECT_INPUT: "rtx-remix-select-input-template",
  CHECKBOX_INPUT: "rtx-remix-checkbox-input-template",
  TEXTAREA_INPUT: "rtx-remix-textarea-input-template",
};

// Event names for app.api event system
export const EVENTS = {
  // API events (server → client)
  UPDATE_NODE_INPUT: "rtx-remix-update-node-input",

  // Internal events (data → UI, using app.api as event bus per ComfyUI pattern)
  SIDEBAR_INIT: "rtx-remix-sidebar-init",
  METADATA_CHANGED: "rtx-remix-metadata-changed",
  PRESET_CHANGED: "rtx-remix-preset-changed",
  PRESET_VALUE_CHANGED: "rtx-remix-preset-value-changed",
  INPUTS_TAGGED: "rtx-remix-inputs-tagged",
  GROUP_ORDER_CHANGED: "rtx-remix-group-order-changed",
  AUTO_SAVE_CHANGED: "rtx-remix-auto-save-changed",

  // Action events (UI → action, decouples menus from controllers)
  EXPORT_WORKFLOW_REQUESTED: "rtx-remix-export-workflow-requested",
};

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
