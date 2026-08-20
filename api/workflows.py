"""
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
"""

__all__ = ["list_workflow_types", "list_workflows", "get_workflow", "save_workflow"]

import json
import re
from pathlib import Path
from typing import Any

from aiohttp import web

import folder_paths
from server import PromptServer

from .constants import (
    get_base_url,
    API_WORKFLOWS_DIR,
    DESCRIPTION_KEY,
    DISPLAY_NAME_KEY,
    REMIX_EXTRA_KEY,
    REMIX_USER_ID,
    WORKFLOWS_DIR,
    WORKFLOWS_PREFIX,
    WORKFLOW_TYPE_KEY,
    WORKFLOW_TYPES_BY_CATEGORY,
)
from .enums import PathType, SourceType, WorkflowType

prompt_server = PromptServer.instance
routes = prompt_server.routes


def _get_comfyui_directory() -> Path:
    """Get the ComfyUI directory."""
    return Path(folder_paths.base_path)


def _get_node_pack_directory() -> Path:
    """Get the RTX Remix node pack directory."""
    return Path(__file__).parent.parent


def _get_user_directory() -> Path:
    """Get the RTX Remix user directory."""
    user_dir = Path(folder_paths.get_user_directory())
    return user_dir / REMIX_USER_ID


def _get_workflow_directories() -> dict[PathType, dict[SourceType, Path]]:
    """
    Initialize and return workflow directories for all sources.

    Creates the directories if they don't exist (for user directories only).

    Returns:
        A nested dictionary: path_type -> source -> directory path
    """
    # User directories
    user_dir = _get_user_directory()
    user_api_workflows_dir = user_dir / API_WORKFLOWS_DIR
    user_full_workflows_dir = user_dir / WORKFLOWS_DIR

    # Create user directories if they don't exist
    user_api_workflows_dir.mkdir(parents=True, exist_ok=True)
    user_full_workflows_dir.mkdir(parents=True, exist_ok=True)

    # RTX Remix node pack directories
    node_pack_dir = _get_node_pack_directory()
    remix_api_workflows_dir = node_pack_dir / API_WORKFLOWS_DIR
    remix_full_workflows_dir = node_pack_dir / WORKFLOWS_DIR

    # Node pack directories should already exist, but we can check
    remix_api_workflows_dir.mkdir(parents=True, exist_ok=True)
    remix_full_workflows_dir.mkdir(parents=True, exist_ok=True)

    # Structure: path_type -> source -> directory
    return {
        PathType.API: {
            SourceType.USER: user_api_workflows_dir,
            SourceType.RTX_REMIX: remix_api_workflows_dir,
        },
        PathType.FULL: {
            SourceType.USER: user_full_workflows_dir,
            SourceType.RTX_REMIX: remix_full_workflows_dir,
        },
    }


def _success_response(data: dict[str, Any], status: int = 200) -> web.Response:
    """
    Create a standardized success JSON response.

    Args:
        data: Data dictionary to include in the response
        status: HTTP status code, defaults to 200

    Returns:
        JSON success response with success=True and the provided data
    """
    return web.json_response({"success": True, **data}, status=status)


def _error_response(message: str, status: int = 400) -> web.Response:
    """
    Create a standardized error JSON response.

    Args:
        message: Error message to include in the response
        status: HTTP status code, defaults to 400

    Returns:
        JSON error response with success=False and the error message
    """
    return web.json_response({"success": False, "message": message}, status=status)


def _load_workflow_file(file_path: Path) -> dict[str, Any]:
    """
    Load workflow data from a JSON file.

    Args:
        file_path: Path to the workflow JSON file

    Returns:
        Dictionary containing the workflow data

    Raises:
        IOError: If the file cannot be read
        json.JSONDecodeError: If the file contains invalid JSON
    """
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_workflow_file(file_path: Path, workflow_data: dict[str, Any]):
    """
    Save workflow data to a JSON file.

    Args:
        file_path: Path where the workflow file should be saved
        workflow_data: Dictionary containing the workflow data to save

    Raises:
        IOError: If the file cannot be written
    """
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(workflow_data, f, indent=2)


def _safe_stem(workflow_name: str) -> str | None:
    """Return a filename stem safe to join with a workflow directory, or None if it escapes it."""
    stem = workflow_name.strip()
    if stem.lower().endswith(".json"):
        stem = stem[:-5]
    if not stem or "/" in stem or "\\" in stem or stem.strip(".") == "":
        return None
    return stem


def _query_values(request: web.Request, key: str) -> list[str]:
    """Collect repeated and comma-separated query values for a single key."""
    return [part.strip() for raw in request.query.getall(key, []) for part in raw.split(",") if part.strip()]


def _derive_filename(display_name: str) -> str:
    """
    Derive the on-disk workflow stem from a display name.

    "PBR Fusion 4 v1.0.2" -> "pbr_fusion_4_v1_0_2". Names with no ASCII alphanumerics
    (for example non-Latin scripts) collapse to "workflow".
    """
    return re.sub(r"[^a-z0-9]+", "_", display_name.strip().lower()).strip("_") or "workflow"


def _read_metadata(workflow_data: Any, fallback_display_name: str) -> dict[str, Any]:
    """
    Read export metadata from a full workflow, tolerating legacy and malformed data.

    Legacy and malformed fallbacks: displayName -> fallback_display_name (the filename stem),
    description -> "", workflowType -> None so consumers fall back to their own grouping instead
    of guessing a type.
    """
    extra = workflow_data.get("extra") if isinstance(workflow_data, dict) else None
    remix = extra.get(REMIX_EXTRA_KEY) if isinstance(extra, dict) else None
    remix = remix if isinstance(remix, dict) else {}

    display_name = remix.get(DISPLAY_NAME_KEY)
    description = remix.get(DESCRIPTION_KEY)
    try:
        workflow_type = WorkflowType(remix.get(WORKFLOW_TYPE_KEY))
    except (ValueError, TypeError):  # unknown value, missing key, or unhashable garbage
        workflow_type = None

    return {
        DISPLAY_NAME_KEY: (
            display_name.strip() if isinstance(display_name, str) and display_name.strip() else fallback_display_name
        ),
        DESCRIPTION_KEY: description if isinstance(description, str) else "",
        WORKFLOW_TYPE_KEY: workflow_type.value if workflow_type else None,
    }


@routes.get(f"{get_base_url()}/{WORKFLOWS_PREFIX}/types")
async def list_workflow_types(_request: web.Request) -> web.Response:
    """
    List the valid workflow types, grouped by category and in display order.

    Returns:
        JSON response containing a "categories" list of {"name": ..., "types": [...]} entries, where
        each type is {"value": ..., "description": ...}. A type value is its own label, so clients
        display it as it comes, and the description is its tooltip.
    """
    categories = [
        {
            "name": category,
            "types": [{"value": item.value, DESCRIPTION_KEY: description} for item, description in types.items()],
        }
        for category, types in WORKFLOW_TYPES_BY_CATEGORY.items()
    ]
    return _success_response({"categories": categories})


@routes.get(f"{get_base_url()}/{WORKFLOWS_PREFIX}")
async def list_workflows(request: web.Request) -> web.Response:
    """
    List all workflows from both user and rtx-remix node pack directories.

    Query Parameters (all optional, repeatable and comma-separated):
        pathType: Keep only these path types ("api", "full").
        sourceType: Keep only these sources ("user", "rtx-remix").
        workflowType: Keep only workflows with these types, matched exactly as the "types" endpoint
            spells them, for example "Material Generation". Workflows without a type never match.
        search: Case-insensitive substring matched against the filename, display name and
            description.

    Returns:
        JSON response containing workflows organized by path type first,
        then by source (user vs rtx-remix). Filtered out buckets are present but empty.
    """
    try:
        path_filter = {PathType(value.lower()) for value in _query_values(request, "pathType")}
        source_filter = {SourceType(value.lower()) for value in _query_values(request, "sourceType")}
        type_filter = {WorkflowType(value).value for value in _query_values(request, WORKFLOW_TYPE_KEY)}
    except ValueError as e:
        return _error_response(f"Invalid filter value: {str(e)}", status=400)

    search = request.query.get("search", "").strip().lower()

    # Initialize structure: path_type -> source -> list of workflows
    workflows = {
        PathType.API.value: {
            SourceType.USER.value: [],
            SourceType.RTX_REMIX.value: [],
        },
        PathType.FULL.value: {
            SourceType.USER.value: [],
            SourceType.RTX_REMIX.value: [],
        },
    }

    # Get all workflow directories (path_type -> source -> directory)
    all_directories = _get_workflow_directories()

    # Metadata only exists in the full workflows (API workflow files are flat prompt dicts with no
    # "extra"), so index it by filename stem and reuse it for the matching API entries, which the
    # save endpoint always writes under the same stem.
    # ponytail: parses every full workflow per call, add an mtime keyed cache if profiling shows it
    metadata_by_source: dict[SourceType, dict[str, dict[str, Any]]] = {}
    for source, directory in all_directories[PathType.FULL].items():
        entries: dict[str, dict[str, Any]] = {}
        if (not source_filter or source in source_filter) and directory.exists():
            for file_path in sorted(directory.glob("*.json")):
                try:
                    workflow_data = _load_workflow_file(file_path)
                except (OSError, IOError, json.JSONDecodeError):
                    workflow_data = {}
                entries[file_path.stem] = _read_metadata(workflow_data, file_path.stem)
        metadata_by_source[source] = entries

    # Iterate through path types and sources
    for path_type, source_dirs in all_directories.items():
        if path_filter and path_type not in path_filter:
            continue
        for source, directory in source_dirs.items():
            if source_filter and source not in source_filter:
                continue
            if not directory.exists():
                continue

            for file_path in sorted(directory.glob("*.json")):
                try:
                    stat = file_path.stat()
                    relative_path = file_path.relative_to(_get_comfyui_directory())
                except (OSError, IOError):
                    # Skip files that can't be accessed
                    continue

                metadata = metadata_by_source[source].get(file_path.stem) or _read_metadata({}, file_path.stem)
                if type_filter and metadata[WORKFLOW_TYPE_KEY] not in type_filter:
                    continue
                if search:
                    haystack = f"{file_path.stem} {metadata[DISPLAY_NAME_KEY]} {metadata[DESCRIPTION_KEY]}".lower()
                    if search not in haystack:
                        continue

                workflows[path_type.value][source.value].append(
                    {
                        "name": file_path.stem,
                        "path": relative_path.as_posix(),
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                        **metadata,
                    }
                )

    return _success_response({"workflows": workflows})


@routes.get(f"{get_base_url()}/{WORKFLOWS_PREFIX}/{{path_type}}/{{source_type}}/{{workflow_name}}")
async def get_workflow(request: web.Request) -> web.Response:
    """
    Get specific workflow contents from either user or rtx-remix source.

    Also handles HEAD requests to check if a workflow exists (for overwrite confirmation).

    Args:
        request: The HTTP request object

    Path Parameters:
        source_type: The type of source ("user" or "rtx-remix").
        workflow_name: The name of the workflow to get
        path_type: Type of workflow path ("api" or "full").

    Returns:
        JSON response containing workflow data organized by path type
        first, then by source (or just status code for HEAD requests)
    """
    source_type = request.match_info.get("source_type")
    workflow_name = request.match_info.get("workflow_name")
    path_type = request.match_info.get("path_type")

    if not source_type or not source_type.strip():
        return _error_response("Source type is required", status=400)
    try:
        source_type = SourceType(source_type.strip().lower())
    except ValueError:
        return _error_response(
            f"Invalid source type: {source_type}. "
            f"Valid source types are: {', '.join([source.value for source in SourceType])}",
            status=400,
        )

    if not workflow_name or not workflow_name.strip():
        return _error_response("Workflow name is required", status=400)

    if path_type and path_type.strip():
        try:
            path_type = PathType(path_type.strip())
        except ValueError:
            return _error_response(
                f"Invalid path type: {path_type}. "
                f"Valid path types are: {', '.join([path_type.value for path_type in PathType])}",
                status=400,
            )

    stem = _safe_stem(workflow_name)
    if stem is None:
        return _error_response(f"Invalid workflow name: {workflow_name}", status=400)
    workflow_name = stem

    all_directories = _get_workflow_directories()
    workflow_directory = all_directories[path_type][source_type]
    file_path = Path((workflow_directory / workflow_name).as_posix() + ".json")

    # Handle HEAD requests efficiently - just check existence without reading file
    if request.method == "HEAD":
        if file_path.exists():
            return web.Response(status=200)
        return web.Response(status=404)

    response_data = None
    if file_path.exists():
        try:
            workflow_data = _load_workflow_file(file_path)
            relative_path = file_path.relative_to(_get_comfyui_directory())
            response_data = {
                "name": workflow_name,
                "path": relative_path.as_posix(),
                "data": workflow_data,
            }
        except (IOError, json.JSONDecodeError) as e:
            return _error_response(f"Error reading workflow: {str(e)}", status=500)

    if not response_data:
        return _error_response(f"Workflow not found: {workflow_name} in {workflow_directory}", status=404)

    return _success_response(response_data)


@routes.post(f"{get_base_url()}/{WORKFLOWS_PREFIX}/save")
async def save_workflow(request: web.Request) -> web.Response:
    """
    Save both API workflow and full workflow to the user directory.

    Note: Workflows can only be saved to the user directory, not to the
        rtx-remix node pack.

    Request body:
        displayName: User facing workflow name, the filename is derived from it
        description: Workflow description, shown as the workflow tooltip in the RTX Remix Toolkit
        workflowType: One of the type values returned by the workflow "types" endpoint
        workflows: Dictionary containing the workflow data for each path type

    Returns:
        JSON response containing the saved workflow name and filepaths
    """
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return _error_response("Invalid JSON in request body", status=400)

    display_name = data.get(DISPLAY_NAME_KEY)
    display_name = display_name.strip() if isinstance(display_name, str) else ""
    description = data.get(DESCRIPTION_KEY)
    description = description.strip() if isinstance(description, str) else ""
    type_value = data.get(WORKFLOW_TYPE_KEY)
    workflows = data.get("workflows", {})

    if not display_name:
        return _error_response("Workflow display name is required", status=400)

    try:
        workflow_type = WorkflowType(type_value)
    except (ValueError, TypeError):
        return _error_response(
            f"Invalid workflow type: {type_value}. "
            f"Valid workflow types are: {', '.join([item.value for item in WorkflowType])}",
            status=400,
        )

    workflow_name = _derive_filename(display_name)

    # Get all workflow directories (path_type -> source -> directory)
    all_directories = _get_workflow_directories()

    try:
        response_data = {}
        for path_type, workflow_data in workflows.items():
            try:
                path_type = PathType(path_type)
            except ValueError:
                return _error_response(f"Invalid path type: {path_type}", status=400)

            # Always save to user directory
            if path_type not in all_directories:
                return _error_response(
                    f"Invalid path type: {path_type}. "
                    f"Valid path types are: {', '.join([path_type.value for path_type in all_directories.keys()])}",
                    status=400,
                )

            user_workflow_dir = all_directories[path_type][SourceType.USER]
            file_path = Path((user_workflow_dir / workflow_name).as_posix() + ".json")

            # Stamp the metadata into the full workflow so the workflow list is correct
            # regardless of what the client serialized
            if path_type is PathType.FULL and isinstance(workflow_data, dict):
                extra = workflow_data.get("extra")
                if not isinstance(extra, dict):
                    extra = {}
                    workflow_data["extra"] = extra
                remix_extra = extra.get(REMIX_EXTRA_KEY)
                if not isinstance(remix_extra, dict):
                    remix_extra = {}
                    extra[REMIX_EXTRA_KEY] = remix_extra
                remix_extra[DISPLAY_NAME_KEY] = display_name
                remix_extra[DESCRIPTION_KEY] = description
                remix_extra[WORKFLOW_TYPE_KEY] = workflow_type.value

            _save_workflow_file(file_path, workflow_data)

            relative_path = file_path.relative_to(_get_comfyui_directory())
            response_data.setdefault(path_type.value, {}).setdefault(SourceType.USER.value, {})["path"] = (
                relative_path.as_posix()
            )

        return _success_response(
            {
                "message": "Workflow saved successfully",
                "name": workflow_name,
                DISPLAY_NAME_KEY: display_name,
                DESCRIPTION_KEY: description,
                WORKFLOW_TYPE_KEY: workflow_type.value,
                "workflows": response_data,
            }
        )
    except IOError as e:
        return _error_response(f"Error saving workflow: {str(e)}", status=500)
