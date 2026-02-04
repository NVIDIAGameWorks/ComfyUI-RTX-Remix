# Full changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

## [2.2.0] - 2026-02-02

### Changed

- Fixed the implementations to work with newer releases 
- Use more official APIs for stability over time

## [2.1.2] - 2026-01-30

### Fixed

- Cleaned up some of the changes previously applied that were not required
- Added missing dependencies to the project description

## [2.1.1] - 2026-01-30

### Fixed

- Fixed minimum version requirement to be compatible with ComfyUI 0.3.72
- Removed classifiers to fix misleading warnings when installing on ComfyUI Desktop
- Export the NODE_CLASS_MAPPINGS & NODE_DISPLAY_NAME_MAPPINGS so the ComfyUI Registry can discover nodes via static analysis

## [2.1.0] - 2026-01-29

### Changed

- Tweaked how hashing worked on downloader nodes to improve performance

## [2.0.3] - 2026-01-22

### Fixed

- Fixed the icon url to point to a statis url

## [2.0.2] - 2026-01-22

### Fixed

- Fixed the project name to match existing node pack name
- Increased the minimum required Python version to 3.10

## [2.0.1] - 2026-01-22

### Changed

- Added minimum requirements to the project description

### Fixed

- Updated Publisher ID for the node registry
- Fixed typo in README.md

## [2.0.0] - 2025-11-21

### Added

- **RTX Remix Save Texture Node**: Saves textures to the output directory with a subfolder based on the job ID or prompt timestamp if not job ID is provided
- **RTX Remix Integration Workflow**: A new workflow for integrating ComfyUI into the RTX Remix Toolkit without using REST API nodes
- **RTX Remix Front-End**: Front-end ComfyUI implementation to implement a better workflow for users
  - Ability to tag input slots and output nodes with metadata for RTX Remix Toolkit to use
  - Ability to export the workflow (and associated API Workflow) to the user directory for use in the RTX Remix Toolkit integration
  - Update the UI to indicate tagged nodes and slots

### Changed

- Moved all nodes previously existing nodes to the REST API sub-menu and sub-directory
- Updated display names to include the 🌐 prefix to indicate REST API nodes

## [1.1.1] - 2025-07-25

### Fixed

- Fixed docstring and aux ID for nodes in the template workflow

## [1.1.0] - 2025-07-24

### Added

- **Open Project Node**: Opens RTX Remix projects by layer ID for workflow management
- **Get Loaded Project Node**: Gets layer ID of current open project for use with Open Project node
- **Close Project Node**: Closes RTX Remix projects and a force boolean parameter default false
- **Get Default Directory Node**: Captures the RTX Remix default output directory before closing projects
- Low VRAM workflow example: "rtx_remix_pbrify_workflow_LowVRAM.json" demonstrating new project management nodes

### Changed

- **Ingest Texture Node**: Made output_folder parameter mandatory, must be provided by user or Get Default Directory Node
- Updated normal PBRify workflow to work with new ingest texture changes

### Fixed

- Path handling compatibility for URLs with spaces when calling toolkit

## [2024.0.0]

### Added

- First release
