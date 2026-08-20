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

__all__ = [
    "API_WORKFLOWS_DIR",
    "DESCRIPTION_KEY",
    "DISPLAY_NAME_KEY",
    "REMIX_EXTRA_KEY",
    "REMIX_USER_ID",
    "WORKFLOWS_DIR",
    "WORKFLOWS_PREFIX",
    "WORKFLOW_TYPES_BY_CATEGORY",
    "WORKFLOW_TYPE_KEY",
    "get_base_url",
]

from .enums import WorkflowType

WORKFLOWS_PREFIX = "workflows"
API_WORKFLOWS_DIR = "api_workflows"
WORKFLOWS_DIR = "workflows"
REMIX_USER_ID = "rtx-remix"

# Keys of the export metadata, stored under extra[REMIX_EXTRA_KEY] of a full workflow
REMIX_EXTRA_KEY = "rtx-remix"
DISPLAY_NAME_KEY = "displayName"
DESCRIPTION_KEY = "description"
WORKFLOW_TYPE_KEY = "workflowType"

# Display order of the picker: category -> type -> the tooltip shown next to the type. Every member
# of WorkflowType must appear exactly once.
WORKFLOW_TYPES_BY_CATEGORY: dict[str, dict[WorkflowType, str]] = {
    "Generation": {
        WorkflowType.ASSET_GENERATION: "Creates a full asset, including its mesh and textures, from any mix of inputs.",
        WorkflowType.MATERIAL_GENERATION: "Creates a PBR material from any mix of inputs, such as a texture or prompt.",
    },
    "Upscaling": {
        WorkflowType.ASSET_UPSCALING: "Increases the detail of a full asset, including its mesh and textures.",
        WorkflowType.MESH_UPSCALING: "Increases the geometric detail of a mesh.",
        WorkflowType.TEXTURE_UPSCALING: "Increases the detail of a texture.",
    },
    "Miscellaneous": {
        WorkflowType.ASSET_TAGGING: "Takes a material, a texture or a full asset and returns tags for it.",
    },
    "Other": {
        WorkflowType.OTHER: "Anything that no other type describes.",
    },
}

# A type missing from the map would silently vanish from the picker, so fail loudly at import.
assert tuple(WorkflowType) == tuple(item for types in WORKFLOW_TYPES_BY_CATEGORY.values() for item in types)


def get_base_url(version: int = 1) -> str:
    return f"/rtx-remix/v{version}"
