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

__all__ = ["list_workflows", "get_workflow", "save_workflow"]

import json
from pathlib import Path
from typing import Any

from aiohttp import web

import folder_paths
from server import PromptServer

from .constants import get_base_url, WORKFLOWS_PREFIX, API_WORKFLOWS_DIR, WORKFLOWS_DIR, REMIX_USER_ID
from .enums import PathType, SourceType

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


@routes.get(f"{get_base_url()}/{WORKFLOWS_PREFIX}")
async def list_workflows(_request: web.Request) -> web.Response:
    """
    List all workflows from both user and rtx-remix node pack directories.

    Returns:
        JSON response containing workflows organized by path type first,
        then by source (user vs rtx-remix)
    """
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

    # Iterate through path types and sources
    for path_type, source_dirs in all_directories.items():
        for source, directory in source_dirs.items():
            if not directory.exists():
                continue

            for file_path in sorted(directory.glob("*.json")):
                try:
                    stat = file_path.stat()
                    relative_path = file_path.relative_to(_get_comfyui_directory())
                    workflows[path_type.value][source.value].append(
                        {
                            "name": file_path.stem,
                            "path": relative_path.as_posix(),
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                        }
                    )
                except (OSError, IOError):
                    # Skip files that can't be accessed
                    continue

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

    # Remove extension if provided
    if workflow_name.lower().endswith(".json"):
        workflow_name = workflow_name[:-5]

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
        name: Name of the workflow to save
        workflows: Dictionary containing the workflow data for each path type

    Returns:
        JSON response containing the saved workflow name and filepaths
    """
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return _error_response("Invalid JSON in request body", status=400)

    workflow_name = data.get("name", "").strip()
    workflows = data.get("workflows", {})

    if not workflow_name:
        return _error_response("Workflow name is required", status=400)

    # Remove extension if provided
    if workflow_name.lower().endswith(".json"):
        workflow_name = workflow_name[:-5]

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

            _save_workflow_file(file_path, workflow_data)

            relative_path = file_path.relative_to(_get_comfyui_directory())
            response_data.setdefault(path_type.value, {}).setdefault(SourceType.USER.value, {})["path"] = (
                relative_path.as_posix()
            )

        return _success_response(
            {
                "message": "Workflow saved successfully",
                "name": workflow_name,
                "workflows": response_data,
            }
        )
    except IOError as e:
        return _error_response(f"Error saving workflow: {str(e)}", status=500)
