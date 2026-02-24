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

from __future__ import annotations

__all__ = ["NODE_UI_CONFIGS", "NodeUIConfig"]

from enum import Enum

from ..models import (
    DynamicHelp,
    HelpContent,
    NodeUI,
    UrlHandler,
    UrlParser,
    WidgetResetRule,
    WidgetVisibilityRule,
)
from ...nodes.constant import ModelSource


class NodeUIConfig(str, Enum):
    RTX_REMIX_DOWNLOAD_MODEL = "RTXRemixDownloadModel"


NODE_UI_CONFIGS: dict[NodeUIConfig, NodeUI] = {
    NodeUIConfig.RTX_REMIX_DOWNLOAD_MODEL: NodeUI(
        url_handler=UrlHandler(
            source_field="model_source",
            host_patterns={
                ModelSource.HUGGINGFACE: "huggingface.co",
                ModelSource.CIVITAI: "civitai.com",
            },
            parsers={
                ModelSource.HUGGINGFACE: UrlParser(
                    populate={"repo_id": "hf_repo_id", "filename": "hf_filename"},
                    reset=["civitai_model_id", "custom_filename"],
                ),
                ModelSource.CIVITAI: UrlParser(
                    populate={"version_id": "civitai_model_id"},
                    reset=["hf_repo_id", "hf_filename", "custom_filename"],
                ),
                ModelSource.CUSTOM: UrlParser(
                    populate={"filename": "custom_filename"},
                    reset=["hf_repo_id", "hf_filename", "civitai_model_id"],
                ),
            },
        ),
        visibility_rules=[
            # Show model_source only after a URL is entered
            WidgetVisibilityRule(
                source_field="url",
                show_when_filled=["model_source"],
            ),
            # Show source-specific fields based on detected source
            WidgetVisibilityRule(
                source_field="model_source",
                mapping={
                    ModelSource.HUGGINGFACE: [
                        "hf_repo_id",
                        "hf_filename",
                        "hf_token",
                    ],
                    ModelSource.CIVITAI: ["civitai_model_id", "civitai_api_key"],
                    ModelSource.CUSTOM: ["custom_filename", "custom_hash"],
                },
            ),
            # Show archive fields when extract_archive is enabled
            WidgetVisibilityRule(
                source_field="extract_archive",
                mapping={
                    True: ["archive_model_filename", "extracted_model_hash"],
                },
            ),
        ],
        reset_rules=[
            # Reset hash and archive fields when URL changes
            WidgetResetRule(
                source_field="url",
                reset_fields=["file_hash", "archive_model_filename", "extracted_model_hash"],
            ),
        ],
        info_button=DynamicHelp(
            source_field="model_source",
            configs={
                "": HelpContent(
                    label="🛈 How to use this node",
                    title="Download Model",
                    template="rtx-remix-download-generic-info-template",
                ),
                ModelSource.HUGGINGFACE: HelpContent(
                    label="🛈 HuggingFace Help",
                    title="Download from HuggingFace",
                    template="rtx-remix-download-huggingface-token-info-template",
                ),
                ModelSource.CIVITAI: HelpContent(
                    label="🛈 CivitAI Help",
                    title="Download from CivitAI",
                    template="rtx-remix-download-civitai-apikey-info-template",
                ),
                ModelSource.CUSTOM: HelpContent(
                    label="🛈 Custom URL Help",
                    title="Custom URL Download",
                    template="rtx-remix-download-custom-howto-info-template",
                ),
            },
        ),
    )
}
