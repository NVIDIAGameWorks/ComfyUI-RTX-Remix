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

from enum import Enum

__all__ = [
    "PREFIX_BASE",
    "PREFIX_MENU_API",
    "HEADER_LSS_REMIX_VERSION_1_0",
    "CONTEXT_TYPE",
    "CHUNK_SIZE_BYTES",
    "DOWNLOAD_TIMEOUT_SECONDS",
    "CIVITAI_API_BASE_URL",
    "ModelSource",
]

PREFIX_BASE = "RTX Remix"
PREFIX_MENU_API = f"{PREFIX_BASE}/REST API"

HEADER_LSS_REMIX_VERSION_1_0 = {"Accept": "application/lightspeed.remix.service+json; version=1.0"}

CONTEXT_TYPE = "RTXRemixContext"

CHUNK_SIZE_BYTES = 1024 * 1024  # 1MB
DOWNLOAD_TIMEOUT_SECONDS = 5 * 60  # 5 minutes

CIVITAI_API_BASE_URL = "https://civitai.com/api/v1"


# Model source types for the download node
class ModelSource(str, Enum):
    """Model source types - inherits from str so values work directly as strings."""

    HUGGINGFACE = "huggingface"
    CIVITAI = "civitai"
    CUSTOM = "custom"

    @classmethod
    def all(cls):
        """Return all valid source values including empty string for 'not selected'."""
        return ["", *cls]
