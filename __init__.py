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

__all__ = ["WEB_DIRECTORY", "comfy_entrypoint"]

from comfy_api.latest import io, ComfyExtension

# Import nodes
from .nodes import RTX_REMIX_NODES

# Define the API endpoints
from .api import *

# Define the UI components
WEB_DIRECTORY = "./web"


class RTXRemixExtension(ComfyExtension):
    """RTX Remix Extension for ComfyUI"""

    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        """Return all nodes for this extension"""
        return RTX_REMIX_NODES


async def comfy_entrypoint() -> RTXRemixExtension:
    """V3 entry point for ComfyUI to discover this extension's nodes"""
    return RTXRemixExtension()
