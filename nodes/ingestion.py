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

import json
import os
import pathlib

import folder_paths
import numpy as np
import requests
import torch
from PIL import Image

from .common import add_context_input_enabled_and_output
from .constant import HEADER_LSS_REMIX_VERSION_1_0, PREFIX_MENU
from .utils import check_response_status_code, posix

_file_name = pathlib.Path(__file__).stem


@add_context_input_enabled_and_output
class IngestTexture:
    """Ingest an image as a texture and save it to disk"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {
                "texture": ("IMAGE", {}),
                "texture_type": (
                    "STRING",
                    {
                        # node
                        "default": "",
                        "forceInput": True,
                    },
                ),
                "texture_name": (
                    "STRING",
                    {
                        # node
                        "default": "",
                        "forceInput": True,
                    },
                ),
                "output_directory": (
                    "STRING",
                    {
                        # node
                        "default": "",
                        "forceInput": True,
                    },
                ),
            },
        }
        return inputs

    FUNCTION = "ingest_texture"

    RETURN_TYPES = ("STRING",)

    RETURN_NAMES = ("texture_path",)

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def ingest_texture(
        self,
        texture: torch.Tensor,
        texture_type: str,
        texture_name: str,
        output_directory: str,
    ):
        if not self.enable_this_node:  # noqa
            return ("",)
        address, port = self.context  # noqa
        if not pathlib.Path(output_directory).exists():
            raise FileNotFoundError(f"Output directory doesn't exist: {output_directory}")
        output_folder = output_directory

        full_output_folder, filename, _counter, _subfolder, _filename_prefix = folder_paths.get_save_image_path(
            texture_name, folder_paths.get_output_directory(), texture[0].shape[1], texture[0].shape[0]
        )

        tmp_image_path = pathlib.Path(full_output_folder).joinpath(f"{filename}.png")
        i = 255.0 * texture.cpu().numpy().squeeze()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        img.save(tmp_image_path)
        img.close()

        payload = {
            "context_plugin": {
                "data": {
                    "input_files": [(str(tmp_image_path), texture_type)],
                    "output_directory": output_folder,
                },
            },
        }

        data = json.dumps(payload)
        r = requests.post(
            f"http://{address}:{port}/ingestcraft/mass-validator/queue/material",
            data=data,
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        os.remove(str(tmp_image_path))
        check_response_status_code(r)

        completed_schemas = json.loads(r.text).get("completed_schemas", {})
        results = None
        for completed_schema in completed_schemas:
            for check_plugin in completed_schema.get("check_plugins", []):
                if check_plugin.get("name") != "ConvertToDDS":
                    continue
                for data_flow in check_plugin.get("data", {}).get("data_flows", []):
                    if data_flow.get("channel") != "ingestion_output":
                        continue
                    results = data_flow["output_data"]
                    break
                break
            if results:
                break

        if not results:
            raise ValueError(f"Can't get the ingested texture with name {texture_name} from the folder {output_folder}")

        result_path = pathlib.Path(results[0])
        if not result_path.exists():
            raise FileNotFoundError(f"Can't find the texture {result_path}")

        return (str(result_path),)


@add_context_input_enabled_and_output
class GetDefaultDirectory:
    """Get the default directory from RTX Remix before closing project"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {},
        }
        return inputs

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("default_directory",)

    FUNCTION = "get_default_directory"

    OUTPUT_NODE = False

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def _get_default_output_directory(self) -> str:
        """Utility method to get default output directory from RTX Remix API."""
        address, port = self.context  # noqa
        r = requests.get(
            f"http://{address}:{port}/stagecraft/assets/default-directory",
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return json.loads(r.text).get("directory_path", "")

    def get_default_directory(self):
        if not self.enable_this_node:  # noqa
            return ("",)
        default_directory = self._get_default_output_directory()
        return (default_directory,)
