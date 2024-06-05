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

from .common import get_rest_api_inputs
from .constant import HEADER_LSS_REMIX_VERSION_1_0, PREFIX_MENU
from .utils import merge_dict

_file_name = pathlib.Path(__file__).stem


class IngestTexture:

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
            },
            "optional": {
                "enable_override_output_folder": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "enabled",
                        "label_off": "disabled",
                    },
                ),
                "override_output_folder": (
                    "STRING",
                    {
                        # node
                        "default": "",
                    },
                ),
            },
        }
        return merge_dict(get_rest_api_inputs(), inputs)

    FUNCTION = "ingest_texture"

    RETURN_TYPES = ("STRING",)

    RETURN_NAMES = ("texture_path",)

    OUTPUT_NODE = True

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def ingest_texture(
        self,
        texture: torch.Tensor,
        texture_type: str,
        texture_name: str,
        enable_override_output_folder: bool,
        override_output_folder: str,
        address: str,
        port: str,
    ):
        if enable_override_output_folder:
            if not pathlib.Path(override_output_folder).exists():
                raise FileNotFoundError("Can't overwrite output folder, folder doesn't exist.")
            output_folder = override_output_folder
        else:
            # call RestAPI to get the default output folder
            r = requests.get(
                f"http://{address}:{port}/stagecraft/assets/default-directory",
                headers=HEADER_LSS_REMIX_VERSION_1_0,
            )
            if r.status_code != 200:
                response_dict = json.loads(r.text)
                raise ValueError(response_dict.get("detail", "Wrong request value"))
            output_folder = json.loads(r.text).get("asset_path", {})

        if not os.path.exists(output_folder):
            raise ValueError(f"Output folder doesn't exist: {output_folder}")

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
        if r.status_code != 200:
            response_dict = json.loads(r.text)
            raise ValueError(response_dict.get("detail", "Wrong request value"))

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
