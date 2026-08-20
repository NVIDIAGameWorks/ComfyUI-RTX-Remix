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

__all__ = ["PathType", "SourceType", "WorkflowType"]

from enum import Enum


class PathType(Enum):
    """Enumeration for workflow path types."""

    API = "api"
    FULL = "full"


class SourceType(Enum):
    """Enumeration for workflow source types."""

    USER = "user"
    RTX_REMIX = "rtx-remix"


class WorkflowType(Enum):
    """Enumeration for the workflow types authored at export time.

    The value is both the serialized form and the label shown in the RTX Remix Toolkit picker, so
    nothing derives a display string from it. Add members here only, and describe them in
    WORKFLOW_TYPES_BY_CATEGORY.
    """

    ASSET_GENERATION = "Asset Generation"
    MATERIAL_GENERATION = "Material Generation"
    ASSET_UPSCALING = "Asset Upscaling"
    MESH_UPSCALING = "Mesh Upscaling"
    TEXTURE_UPSCALING = "Texture Upscaling"
    ASSET_TAGGING = "Asset Tagging"
    OTHER = "Other"
