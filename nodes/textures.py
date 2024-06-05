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
import pathlib

import numpy as np
import requests
import torch
from PIL import Image, ImageOps

from .common import get_rest_api_inputs
from .constant import HEADER_LSS_REMIX_VERSION_1_0, PREFIX_MENU
from .utils import merge_dict

_texture_types = [
    "DIFFUSE",
    "ROUGHNESS",
    "ANISOTROPY",
    "METALLIC",
    "EMISSIVE",
    "NORMAL_OGL",
    "NORMAL_DX",
    "NORMAL_OTH",
    "HEIGHT",
    "TRANSMITTANCE",
    "MEASUREMENT_DISTANCE",
    "SINGLE_SCATTERING",
    "OTHER",
]  # RestAPI should not be called here. Or if there is a crash, the whole graph would not load


_file_name = pathlib.Path(__file__).stem


def validate_texture_types(texture_types: list[str], address: str, port: str):
    r = requests.get(f"http://{address}:{port}/stagecraft/textures/types", headers=HEADER_LSS_REMIX_VERSION_1_0)
    if r.status_code != 200:
        response_dict = json.loads(r.text)
        raise ValueError(response_dict.get("detail", "Wrong request value"))

    valid_texture_types = set(json.loads(r.text).get("texture_types", []))

    for texture_type in texture_types:
        if texture_type not in valid_texture_types:
            supported_str = ','.join(valid_texture_types)
            raise ValueError(f"Wrong texture type value {texture_type}. Only those values are supported: {supported_str}")


class GetTextures:

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {
                "return_selection": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "enabled",
                        "label_off": "disabled",
                    },
                ),
                "filter_session_prims": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "enabled",
                        "label_off": "disabled",
                    },
                ),
            },
            "optional": {
                "asset_hashes": (
                    "STRING",
                    {
                        "multiline": True,  # True if you want the field to look like the one on the ClipTextEncode
                        # node
                        "default": "",
                        "placeholder": "A set of asset hashes to keep when filtering material asset paths",
                    },
                ),
                "texture_types": (
                    "STRING",
                    {
                        # node
                        "default": "",
                        "forceInput": True,
                    },
                ),
            },
        }
        return merge_dict(get_rest_api_inputs(), inputs)

    RETURN_TYPES = (
        "STRING",
        "STRING",
        "IMAGE",
    )
    OUTPUT_IS_LIST = (
        True,
        True,
        True,
    )
    RETURN_NAMES = (
        "usd_attributes",
        "texture_names",
        "textures",
    )

    FUNCTION = "get_texture_prims_assets"

    # OUTPUT_NODE = False

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_texture_prims_assets(
        self,
        return_selection: bool,
        filter_session_prims: bool,
        address: str,
        port: str,
        asset_hashes: str | None = None,
        texture_types: str | None = None,
    ) -> tuple[list[str], list[torch.Tensor]]:

        payload = {"selection": return_selection, "filter_session_prims": filter_session_prims}
        if asset_hashes is not None:
            payload["asset_hashes"] = [item.strip() for item in asset_hashes.split(",")]
        if texture_types is not None:
            payload["texture_types"] = [item.strip() for item in texture_types.split(",")]

        r = requests.get(
            f"http://{address}:{port}/stagecraft/textures", params=payload, headers=HEADER_LSS_REMIX_VERSION_1_0
        )
        if r.status_code != 200:
            response_dict = json.loads(r.text)
            raise ValueError(response_dict.get("detail", "Wrong request value"))

        result_attrs = []
        texture_names = []
        result_images = []
        for usd_attr, texture_path in json.loads(r.text).get("textures", []):
            if not pathlib.Path(texture_path).exists():
                continue
            with Image.open(texture_path) as img_0:
                with ImageOps.exif_transpose(img_0) as img_1:
                    image = img_1.convert("RGB")
                    image = np.array(image).astype(np.float32) / 255.0
                    image = torch.from_numpy(image)[None,]  # noqa E231
                    result_images.append(image)
                    texture_names.append(pathlib.Path(texture_path).stem)
                    result_attrs.append(usd_attr)

        if not result_images:
            raise ValueError("No texture found. Please check the parameters of your node")

        return result_attrs, texture_names, result_images

    @classmethod
    def IS_CHANGED(cls, **kwargs):  # noqa N802
        """
        Always process the node in case the selection in the RTX Remix app changed
        """
        return float("nan")


class TexturesTypes:

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802

        inputs = {
            "required": {
                "texture_types": (
                    "STRING",
                    {
                        "multiline": True,  # True if you want the field to look like the one on the ClipTextEncode
                        # node
                        "default": ",".join(_texture_types),
                    },
                ),
            }
        }
        return merge_dict(get_rest_api_inputs(), inputs)

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("texture_types",)

    FUNCTION = "get_texture_types"

    # OUTPUT_NODE = False

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_texture_types(self, texture_types: str, address: str, port: str) -> tuple[str]:
        texture_types_list = [tx.strip() for tx in texture_types.split(",")]
        validate_texture_types(texture_types_list, address, port)

        return (texture_types,)


class TexturesType:

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802

        inputs = {
            "required": {
                "texture_type": (_texture_types,),
            }
        }
        return merge_dict(get_rest_api_inputs(), inputs)

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("texture_type",)

    FUNCTION = "get_texture_type"

    # OUTPUT_NODE = False

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_texture_type(self, texture_type: str, address: str, port: str) -> tuple[str]:
        validate_texture_types([texture_type], address, port)
        return (texture_type,)


class SetTexture:

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {
                "usd_attribute": ("STRING", {"default": "", "forceInput": True}),
                "texture_path": ("STRING", {"default": "", "forceInput": True}),
            },
            "optional": {
                "force": (  # Whether to force replace the texture or validate it was ingested correctly
                    "BOOLEAN",
                    {"default": False, "label_on": "enabled", "label_off": "disabled"},
                ),
            },
        }
        return merge_dict(get_rest_api_inputs(), inputs)

    FUNCTION = "set_texture"

    RETURN_TYPES = ()

    OUTPUT_NODE = True

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def set_texture(self, usd_attribute: str, texture_path: str, address: str, port: str, force: bool = False):

        payload = {"force": force, "textures": [[usd_attribute, texture_path]]}

        data = json.dumps(payload)

        r = requests.put(
            f"http://{address}:{port}/stagecraft/textures", data=data, headers=HEADER_LSS_REMIX_VERSION_1_0
        )
        if r.status_code != 200:
            response_dict = json.loads(r.text)
            raise ValueError(response_dict.get("detail", "Wrong request value"))

        return {}  # need to return something


class TextureTypeToUSDAttribute:

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {
                "usd_attribute": ("STRING", {"default": "", "forceInput": True}),
                "texture_type": (
                    "STRING",
                    {
                        # node
                        "default": "",
                        "forceInput": True,
                    },
                ),
            },
        }
        return merge_dict(get_rest_api_inputs(), inputs)

    FUNCTION = "get_attr_from_texture_type"

    RETURN_TYPES = ("STRING",)

    RETURN_NAMES = ("usd_attribute",)

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_attr_from_texture_type(self, usd_attribute: str, texture_type: str, address: str, port: str):

        r = requests.get(
            f"http://{address}:{port}/stagecraft/textures/{usd_attribute}/material/inputs",
            params={"texture_type": texture_type},
            headers=HEADER_LSS_REMIX_VERSION_1_0
        )
        if r.status_code != 200:
            response_dict = json.loads(r.text)
            raise ValueError(response_dict.get("detail", "Wrong request value"))
        result_texture_types = json.loads(r.text).get("asset_paths", [])

        if not result_texture_types:
            raise ValueError(
                f"Can't get texture type using the USD attribute {usd_attribute} and texture type {texture_type}"
            )

        return (result_texture_types[0],)
