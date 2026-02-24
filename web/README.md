# ComfyUI-RTX-Remix Frontend Architecture

This document describes the frontend architecture for contributors to the ComfyUI-RTX-Remix extension.

## Overview

The RTX Remix extension adds a frontend UI layer to ComfyUI for managing RTX Remix workflow metadata, presets, and exports. It registers as a ComfyUI extension via `app.registerExtension()` and follows a strict layered architecture.

The extension provides:

- A sidebar panel for managing presets and input metadata
- Context menu items for tagging/untagging inputs and outputs
- Dialogs for editing metadata, managing presets, and exporting workflows
- Visual highlighting of RTX Remix-tagged inputs on the graph

## Key Concepts

### Tagged Inputs

A "tagged input" is a node input slot that has been marked for RTX Remix export. Tagged inputs appear in the sidebar and can have metadata (min, max, step, tooltip, group) configured. Only primitive types (STRING, INT, FLOAT, BOOLEAN, COMBO) can be tagged.

### Presets

Presets store snapshots of tagged input values. Users can create, apply, and manage presets to quickly switch between different configurations. Presets are stored in the workflow file.

### Groups

Tagged inputs can be organized into groups for the export dialog. Groups control the visual organization when exporting workflows.

## Development

### Setup

The frontend is vanilla JavaScript with no build step. Files are served directly by ComfyUI.

### Testing Changes

1. Make changes to files in the `web/` directory
2. Refresh the browser (F5) - ComfyUI serves files directly, no restart needed
3. For template/CSS changes, a hard refresh (Ctrl+F5) may be needed to clear cache

### ComfyUI Integration

The extension uses these ComfyUI APIs:

- **`app.registerExtension()`** - Register the extension with lifecycle hooks
- **`app.graph.extra`** - Store persistent data in the workflow
- **`app.api.addEventListener()`** - Subscribe to events
- **`app.api.dispatchEvent()`** - Dispatch events
- **`app.canvas`** - Access the LiteGraph canvas for drawing

## Directory Structure

```
web/
├── main.js              # Extension entry point and registration
├── controllers/         # UI rendering and event handling
├── cores/               # Business logic and event dispatch
├── stores/              # Data CRUD operations
├── factories/           # Reusable component creation
├── utils/               # Pure utilities and constants
└── resources/
    ├── styles/          # CSS files (variables, utilities, components)
    ├── templates/       # HTML template files
    └── images/          # Static assets
```

## Architecture

```
Import Flow:
  main.js ──────► controllers/, utils/
  controllers/ ─► cores/, stores/, factories/, utils/
  cores/ ───────► stores/, utils/
  stores/ ──────► utils/
  factories/ ───► utils/
```

| Layer           | Directory      | Purpose                                     | Can Import From                             |
| --------------- | -------------- | ------------------------------------------- | ------------------------------------------- |
| **Bootstrap**   | `main.js`      | Extension registration only                 | `controllers/`, `utils/`                    |
| **Controllers** | `controllers/` | UI rendering, event handling                | `cores/`, `stores/`, `factories/`, `utils/` |
| **Cores**       | `cores/`       | Business logic, data-changed event dispatch | `stores/`, `utils/`                         |
| **Stores**      | `stores/`      | Pure CRUD operations on `app.graph.extra`   | `utils/`                                    |
| **Factories**   | `factories/`   | Component creation from templates           | `utils/`                                    |
| **Utils**       | `utils/`       | Pure utility functions, constants           | `utils/` only                               |

### Import Rules

- `main.js` **must not** import from `cores/`, `stores/`, or `factories/`
- `cores/` **must not** import from `controllers/`
- `stores/` **must not** import from `controllers/`, `cores/`, or `factories/`
- `factories/` **must not** import from `controllers/`, `cores/`, or `stores/`
- `utils/` **must not** import from any other layer

## Event System

The extension uses ComfyUI's `app.api` event system for communication between layers. Events are defined in `utils/constants.js`.

### Event Flow

```
User Action → Controller → Core → Store (update data) → Core dispatches event → Controller subscribes → UI updates
```

### Rules

- **Only cores** dispatch data-changed events (e.g., `METADATA_CHANGED`, `PRESET_CHANGED`)
- **Controllers** may dispatch action events (e.g., `EXPORT_WORKFLOW_REQUESTED`)
- **Stores never** dispatch events - they only perform CRUD operations

## CSS Architecture

### CSS Variables

All design tokens are defined in `resources/styles/variables.css`:

- **Spacing:** `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl`
- **Colors:** `--remix-color`, `--bg-*`, `--border-*`, `--text-*`
- **Typography:** `--font-xxs` through `--font-xxl`, `--font-weight-*`
- **Borders:** `--border-width-*`, `--radius-*`
- **Shadows:** `--shadow-light`, `--shadow-medium`, `--shadow-strong`
- **Timing:** `--duration-fast`, `--duration-base`, `--duration-slow`

### Naming Convention

CSS classes use the `rtx-remix-` prefix to avoid conflicts with ComfyUI styles.

### Utility Classes

`resources/styles/utilities.css` provides Tailwind-like utility classes for layout, spacing, and typography.

## HTML Templates

Templates are HTML files in `resources/templates/` using `<template>` elements.

### Template Loading

```javascript
import { loadHTMLTemplate, cloneTemplate, bindTemplateData } from "./utils/html.js";
import { TEMPLATE_IDS } from "./utils/constants.js";

// Load template file (done once at startup)
await loadHTMLTemplate("/path/to/template.html");

// Clone and bind data
const element = bindTemplateData(TEMPLATE_IDS.SOME_TEMPLATE, {
  name: "value",
  onClick: () => handleClick(),
});
```

### Template Conventions

- **`data-bind="key"`** - Bind text content to data key
- **`data-element="name"`** - Reference element by name
- **`data-action="eventType:handlerKey"`** - Bind event handler

## Data Storage

All RTX Remix data is stored in `app.graph.extra["rtx-remix"]`:

```javascript
app.graph.extra["rtx-remix"] = {
  root_path: "/path/to/remix",
  groupOrder: ["Group A", "Group B"],
  presets: {
    "preset-1": {
      name: "My Preset",
      values: { "nodeId.slotName": { value: 42 } },
    },
  },
};

// Per-input metadata is stored on node properties:
// node.properties["rtx-remix"] = { inputs: { slotName: { min: 0, max: 100 } } }
```

### Data Access Pattern

- **Read:** Controllers can read directly from stores or via cores
- **Write:** Controllers call cores, which update stores and dispatch events
- **Never:** Controllers should not write directly to stores

## Adding New Features

### Adding a New Dialog

1. Create HTML template in `resources/templates/`
2. Add template ID to `TEMPLATE_IDS` in `utils/constants.js`
3. Create controller in `controllers/` that renders and handles the dialog
4. If business logic needed, create or extend a core in `cores/`

### Adding a New Event

1. Add event name to `EVENTS` in `utils/constants.js`
2. Dispatch from appropriate core after store update
3. Subscribe in controllers that need to react

### Adding New Metadata Fields

1. Update `METADATA_FIELD_CONFIG` in `utils/constants.js`
2. Update `metadataEditorCore.js` if validation needed
3. Templates auto-generate from config

## License

SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
