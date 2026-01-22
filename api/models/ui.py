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

__all__ = [
    "UrlParser",
    "UrlHandler",
    "WidgetVisibility",
    "HelpContent",
    "DynamicHelp",
    "NodeUI",
]

from typing import Any
from pydantic import BaseModel


class UrlParser(BaseModel):
    """Defines how to extract data from a URL and populate widget fields."""

    populate: dict[str, str]
    """Maps parsed keys to widget names. Example: {"repo_id": "hf_repo_id"}"""

    reset: list[str] = []
    """Widget names to clear when this parser runs"""


class UrlHandler(BaseModel):
    """Auto-detects URL source and populates fields accordingly."""

    source_field: str
    """Widget that stores the detected source type (e.g., "model_source")"""

    host_patterns: dict[str, str]
    """Maps source values to hostname patterns for detection"""

    parsers: dict[str, UrlParser]
    """URL parsers keyed by source value"""


class WidgetVisibility(BaseModel):
    """Shows/hides widgets based on another widget's value."""

    source_field: str
    """Widget whose value controls visibility (e.g., "model_source")"""

    mapping: dict[Any, list[str]] = {}
    """Maps source values to widget names that should be visible"""

    show_when_filled: list[str] = []
    """Widget names to show when source_field has any non-empty value"""


class HelpContent(BaseModel):
    """Content for a help dialog."""

    label: str
    """Button label (e.g., "🛈 HuggingFace Help")"""

    title: str
    """Dialog title"""

    template: str
    """HTML template ID for dialog body"""


class DynamicHelp(BaseModel):
    """Help button that changes based on context."""

    source_field: str
    """Widget whose value determines which help to show"""

    configs: dict[str, HelpContent]
    """Help content keyed by source value (empty string = default)"""


class NodeUI(BaseModel):
    """Complete dynamic UI configuration for a node."""

    url_handler: UrlHandler | None = None
    """Auto-detect URLs and populate fields"""

    visibility_rules: list[WidgetVisibility] = []
    """Conditional widget visibility rules"""

    info_button: DynamicHelp | None = None
    """Context-sensitive help button"""
