# Full changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

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

### Removed

## [2024.0.0]

### Added
- First release

### Changed

### Fixed

### Removed
