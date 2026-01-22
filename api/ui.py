"""
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
"""

__all__ = ["get_node_ui", "get_all_ui"]

from aiohttp import web
from server import PromptServer

from .configs.dynamic_ui import NODE_UI_CONFIGS, NodeUIConfig

prompt_server = PromptServer.instance
routes = prompt_server.routes


@routes.get("/rtx-remix/v1/ui/{node_class}")
async def get_node_ui(request: web.Request) -> web.Response:
    """
    Get UI configuration for a specific node class.

    This endpoint provides dynamic UI behavior configuration including:
    - visibility_rules: Widget visibility based on other widget values
    - url_handler: URL parsing and auto-population of fields
    - info_button: Dynamic help button configuration

    Args:
        request: The aiohttp request object with node_class path parameter

    Returns:
        JSON response with the UI config or 404 if not found
    """
    node_class = request.match_info.get("node_class", "")
    try:
        config = NODE_UI_CONFIGS[NodeUIConfig(node_class)]
    except (KeyError, ValueError):
        return web.json_response({"error": f"No UI config for {node_class}"}, status=404)

    return web.json_response(config.model_dump())


@routes.get("/rtx-remix/v1/ui")
async def get_all_ui(request: web.Request) -> web.Response:
    """
    Get all UI configurations for all nodes.

    Returns:
        JSON response with all UI configs keyed by node class
    """
    return web.json_response({node_class.value: config.model_dump() for node_class, config in NODE_UI_CONFIGS.items()})
