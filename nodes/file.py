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

import pathlib

from .common import add_context_input_enabled_and_output
from .constant import PREFIX_MENU

_file_name = pathlib.Path(__file__).stem


@add_context_input_enabled_and_output
class DeleteFile:
    """Delete a file from the disk"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        return {
            "required": {
                "path": (
                    "STRING",
                    {"default": ""},
                ),
            },
        }

    RETURN_TYPES = ("BOOL",)
    RETURN_NAMES = ("File deleted",)
    FUNCTION = "execute"
    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def execute(self, path: str):
        if not self.enable_this_node:  # noqa
            return (False,)
        result = False
        try:
            pathlib.Path(path).unlink()
            result = True
        except OSError:
            pass
        return (result,)
