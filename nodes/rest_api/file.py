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

__all__ = ["RestAPIDeleteFileNode"]

from pathlib import Path

from comfy_api.latest import io

from .common import RemixContext, context_input, context_output, enable_input
from ..constant import PREFIX_MENU_API
from ...utils import get_logger

_file_name = Path(__file__).stem

logger = get_logger(__name__)


class RestAPIDeleteFileNode(io.ComfyNode):
    """Delete a file from the disk"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixDeleteFile",
            display_name="🌐 RTX Remix Delete File",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("path", default=""),
                io.Boolean.Input("fail_on_error", default=False),
            ],
            outputs=[
                context_output(),
                io.Boolean.Output(
                    id="was_deleted",
                    display_name="was_deleted",
                ),
            ],
        )

    @classmethod
    def execute(
        cls,
        context: RemixContext,
        enable_this_node: bool,
        path: str,
        fail_on_error: bool,
    ) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, False)
        result = False
        try:
            Path(path).resolve().unlink()
            result = True
        except OSError as e:
            error_message = f"Error deleting file {path}: {e}"
            if fail_on_error:
                raise RuntimeError(error_message) from e
            logger.error(error_message)
        return io.NodeOutput(context, result)
