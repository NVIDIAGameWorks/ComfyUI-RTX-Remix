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

from .constant import PREFIX_MENU

_file_name = pathlib.Path(__file__).stem


def get_rest_api_inputs() -> dict[str, dict[str, tuple[str, dict]]]:
    return {"required": {"address": ("STRING", {"forceInput": True}), "port": ("INT", {"forceInput": True})}}


class RestAPIDetails:

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        return {
            "required": {
                "address": ("STRING", {"multiline": False, "default": "127.0.0.1"}),
                "port": (
                    "INT",
                    {
                        "default": 8011,
                        "min": 0,  # Minimum value
                        "max": 65353,  # Maximum value
                        "step": 1,  # Slider's step
                        "display": "number",  # Cosmetic only: display as "number" or "slider"
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("address", "port")

    FUNCTION = "get_address"

    # OUTPUT_NODE = False

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_address(self, address, port):
        return address, port


class StringConstant:
    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        return {
            "required": {
                "string": ("STRING", {"default": "", "multiline": False}),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "get_string"
    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_string(self, string):
        return (string,)
