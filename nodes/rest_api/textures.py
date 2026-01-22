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

import json
import pathlib

import numpy as np
import requests
import torch
from PIL import Image, ImageOps

from comfy_api.latest import io

from .common import RemixContext, context_input, context_output, enable_input
from ..constant import HEADER_LSS_REMIX_VERSION_1_0, PREFIX_MENU_API
from ..utils import check_response_status_code, posix

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

__all__ = [
    "RestAPIGetTexturesNode",
    "RestAPITexturesTypesNode",
    "RestAPITexturesTypeNode",
    "RestAPISetTextureNode",
    "RestAPITextureTypeToUSDAttributeNode",
]


def validate_texture_types(texture_types: list[str], address: str, port: str):
    r = requests.get(f"http://{address}:{port}/stagecraft/textures/types", headers=HEADER_LSS_REMIX_VERSION_1_0)
    check_response_status_code(r)

    valid_texture_types = set(json.loads(r.text).get("texture_types", []))

    for texture_type in texture_types:
        if texture_type not in valid_texture_types:
            supported_str = ",".join(valid_texture_types)
            raise ValueError(
                f"Wrong texture type value {texture_type}. Only those values are supported: {supported_str}"
            )


class RestAPIGetTexturesNode(io.ComfyNode):
    """Read the textures matching provided criteria from the currently open project"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixGetTextures",
            display_name="🌐 RTX Remix Get Textures",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.Boolean.Input(
                    "return_selection",
                    default=False,
                    label_on="enabled",
                    label_off="disabled",
                ),
                io.Boolean.Input(
                    "filter_session_prims",
                    default=False,
                    label_on="enabled",
                    label_off="disabled",
                ),
                io.String.Input(
                    "asset_hashes",
                    default="",
                    multiline=True,
                    placeholder="A set of asset hashes to keep when filtering material asset paths",
                    optional=True,
                ),
                io.String.Input(
                    "texture_types",
                    default="",
                    optional=True,
                ),
                io.String.Input("layer_id", optional=True),
                io.Boolean.Input("exists", default=False, optional=True),
            ],
            outputs=[
                context_output(),
                io.String.Output("usd_attributes", display_name="usd_attributes", is_output_list=True),
                io.String.Output("texture_names", display_name="texture_names", is_output_list=True),
                io.Image.Output("textures", display_name="textures", is_output_list=True),
                io.Mask.Output("masks", display_name="masks", is_output_list=True),
            ],
        )

    @classmethod
    def execute(
        cls,
        context: RemixContext,
        enable_this_node: bool,
        return_selection: bool,
        filter_session_prims: bool,
        asset_hashes: str | None = None,
        texture_types: str | None = None,
        layer_id: str | None = None,
        exists: bool = True,
    ) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, [], [], [], [])

        payload = {"selection": return_selection, "filter_session_prims": filter_session_prims, "exists": exists}
        if asset_hashes is not None:
            payload["asset_hashes"] = [item.strip() for item in asset_hashes.split(",")]
        if texture_types is not None:
            payload["texture_types"] = [item.strip() for item in texture_types.split(",")]
        if layer_id is not None and layer_id.strip():
            payload["layer_identifier"] = posix(layer_id)

        address, port = context
        r = requests.get(
            f"http://{address}:{port}/stagecraft/textures", params=payload, headers=HEADER_LSS_REMIX_VERSION_1_0
        )
        check_response_status_code(r)

        textures = json.loads(r.text).get("textures", [])
        if not textures:
            raise ValueError(
                f"No textures found. Please check the parameters of your node.\nURL: {r.url}, PARAMS: {payload}"
            )

        result_attrs = []
        texture_names = []
        result_images = []
        result_masks = []
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

                    if "A" in img_1.getbands():
                        mask = np.array(img_1.getchannel("A")).astype(np.float32) / 255.0
                        mask = 1.0 - torch.from_numpy(mask)
                    else:
                        mask = torch.zeros((image.shape[2], image.shape[3]), dtype=torch.float32, device="cpu")
                    result_masks.append(mask.unsqueeze(0))

        if not result_images:
            raise ValueError(f"No textures found on disk. paths: {', '.join(t[1] for t in textures)}")

        return io.NodeOutput(context, result_attrs, texture_names, result_images, result_masks)

    @classmethod
    def fingerprint_inputs(cls, **kwargs):  # noqa: ARG003
        """
        Always process the node in case the selection in the RTX Remix app changed
        """
        return float("nan")


class RestAPITexturesTypesNode(io.ComfyNode):
    """Select multiple texture types from a list of supported texture types."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixTexturesTypes",
            display_name="🌐 RTX Remix Texture Types",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input(
                    "texture_types",
                    multiline=True,
                    default=",".join(_texture_types),
                ),
            ],
            outputs=[
                context_output(),
                io.String.Output("texture_types_out", display_name="texture_types"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, texture_types: str) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        texture_types_list = [tx.strip() for tx in texture_types.split(",")]
        validate_texture_types(texture_types_list, context.address, context.port)
        return io.NodeOutput(context, texture_types)


class RestAPITexturesTypeNode(io.ComfyNode):
    """Select from a list of supported texture types."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixTexturesType",
            display_name="🌐 RTX Remix Texture Type",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.Combo.Input("texture_type", options=_texture_types),
            ],
            outputs=[
                context_output(),
                io.String.Output("texture_type_out", display_name="texture_type"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, texture_type: str) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        validate_texture_types([texture_type], context.address, context.port)
        return io.NodeOutput(context, texture_type)


class RestAPISetTextureNode(io.ComfyNode):
    """Set the texture path on an asset"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixSetTexture",
            display_name="🌐 RTX Remix Set Texture",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("usd_attribute", default=""),
                io.String.Input("texture_path", default=""),
                io.Boolean.Input(
                    "force",
                    default=False,
                    label_on="enabled",
                    label_off="disabled",
                    optional=True,
                ),
            ],
            outputs=[context_output()],
        )

    @classmethod
    def execute(
        cls,
        context: RemixContext,
        enable_this_node: bool,
        usd_attribute: str,
        texture_path: str,
        force: bool = False,
    ) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context)

        payload = {"force": force, "textures": [[usd_attribute, texture_path]]}
        data = json.dumps(payload)

        address, port = context
        r = requests.put(
            f"http://{address}:{port}/stagecraft/textures", data=data, headers=HEADER_LSS_REMIX_VERSION_1_0
        )
        check_response_status_code(r)

        return io.NodeOutput(context)


class RestAPITextureTypeToUSDAttributeNode(io.ComfyNode):
    """Use this node to get the proper texture attribute on the same asset but for a different texture type"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixTextureTypeToUSDAttribute",
            display_name="🌐 RTX Remix Texture Type To USD Attribute",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("usd_attribute", default=""),
                io.String.Input("texture_type", default=""),
            ],
            outputs=[
                context_output(),
                io.String.Output("usd_attribute_out", display_name="usd_attribute"),
            ],
        )

    @classmethod
    def execute(
        cls,
        context: RemixContext,
        enable_this_node: bool,
        usd_attribute: str,
        texture_type: str,
    ) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")

        address, port = context
        r = requests.get(
            f"http://{address}:{port}/stagecraft/textures/{usd_attribute}/material/inputs",
            params={"texture_type": texture_type},
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        result_texture_types = json.loads(r.text).get("prim_paths", [])

        if not result_texture_types:
            raise ValueError(
                f"Can't get texture type using the USD attribute {usd_attribute} and texture type {texture_type}"
            )

        return io.NodeOutput(context, result_texture_types[0])
