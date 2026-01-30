"""
* SPDX-FileCopyrightText: Copyright (c) 2024 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
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

from __future__ import annotations

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY", "comfy_entrypoint"]

from comfy_api.latest import io, ComfyExtension

# Import nodes
from .nodes import RTX_REMIX_NODES

# Define the API endpoints
from .api import *

# Define the UI components
WEB_DIRECTORY = "./web"


# Generate NODE_CLASS_MAPPINGS and NODE_DISPLAY_NAME_MAPPINGS from V3 nodes
# This is required for the ComfyUI Registry to discover nodes via static analysis
def _generate_node_mappings(
    nodes: list[type[io.ComfyNode]],
) -> tuple[dict[str, type[io.ComfyNode]], dict[str, str]]:
    """Generate legacy NODE_CLASS_MAPPINGS from V3 node classes."""
    class_mappings = {}
    display_name_mappings = {}

    for node_class in nodes:
        schema = node_class.define_schema()
        node_id = schema.node_id
        display_name = schema.display_name or node_id

        class_mappings[node_id] = node_class
        display_name_mappings[node_id] = display_name

    return class_mappings, display_name_mappings


NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS = _generate_node_mappings(RTX_REMIX_NODES)


class RTXRemixExtension(ComfyExtension):
    """RTX Remix Extension for ComfyUI"""

    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        """Return all nodes for this extension"""
        return RTX_REMIX_NODES


async def comfy_entrypoint() -> RTXRemixExtension:
    """V3 entry point for ComfyUI to discover this extension's nodes"""
    return RTXRemixExtension()
