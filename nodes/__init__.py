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

from .common import (
    EndContext,
    InvertBool,
    RestAPIDetails,
    StartContext,
    StringConcatenate,
    StringConstant,
    StrToList,
    Switch,
)
from .file import DeleteFile
from .ingestion import IngestTexture
from .layers import (
    CreateLayer,
    DefineLayerId,
    GetEditTarget,
    GetLayers,
    LayerType,
    LayerTypes,
    MuteLayer,
    RemoveLayer,
    SaveLayer,
    SetEditTarget,
)
from .textures import (
    GetTextures,
    SetTexture,
    TexturesType,
    TexturesTypes,
    TextureTypeToUSDAttribute,
)

# A dictionary that contains all nodes you want to export with their names
# NOTE: names should be globally unique
NODE_CLASS_MAPPINGS = {
    "RTXRemixCreateLayer": CreateLayer,
    "RTXRemixDefineLayerId": DefineLayerId,
    "RTXRemixDeleteFile": DeleteFile,
    "RTXRemixEndContext": EndContext,
    "RTXRemixGetEditTarget": GetEditTarget,
    "RTXRemixGetLayers": GetLayers,
    "RTXRemixGetTextures": GetTextures,
    "RTXRemixIngestTexture": IngestTexture,
    "RTXRemixInvertBool": InvertBool,
    "RTXRemixLayerType": LayerType,
    "RTXRemixLayerTypes": LayerTypes,
    "RTXRemixMuteLayer": MuteLayer,
    "RTXRemixRemoveLayer": RemoveLayer,
    "RTXRemixRestAPIDetails": RestAPIDetails,
    "RTXRemixSaveLayer": SaveLayer,
    "RTXRemixSetEditTarget": SetEditTarget,
    "RTXRemixSetTexture": SetTexture,
    "RTXRemixStartContext": StartContext,
    "RTXRemixStringConcatenate": StringConcatenate,
    "RTXRemixStringConstant": StringConstant,
    "RTXRemixStrToList": StrToList,
    "RTXRemixSwitch": Switch,
    "RTXRemixTexturesType": TexturesType,
    "RTXRemixTexturesTypes": TexturesTypes,
    "RTXRemixTextureTypeToUSDAttribute": TextureTypeToUSDAttribute,
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "RTXRemixCreateLayer": "RTX Remix Create Layer",
    "RTXRemixDefineLayerId": "RTX Remix Define Layer ID",
    "RTXRemixDeleteFile": "RTX Remix Delete File",
    "RTXRemixEndContext": "RTX Remix End Context",
    "RTXRemixGetEditTarget": "RTX Remix Get Edit Target",
    "RTXRemixGetLayers": "RTX Remix Get Layers",
    "RTXRemixGetTextures": "RTX Remix Get Textures",
    "RTXRemixIngestTexture": "RTX Remix Ingest Texture",
    "RTXRemixInvertBool": "RTX Remix Invert Boolean Value",
    "RTXRemixLayerType": "RTX Remix Layer Type",
    "RTXRemixLayerTypes": "RTX Remix Layer Types",
    "RTXRemixMuteLayer": "RTX Remix Mute Layer",
    "RTXRemixRemoveLayer": "RTX Remix Remove Layer",
    "RTXRemixRestAPIDetails": "RTX Remix Rest API Details",
    "RTXRemixSaveLayer": "RTX Remix Save Layer",
    "RTXRemixSetEditTarget": "RTX Remix Set Edit Target",
    "RTXRemixSetTexture": "RTX Remix Set Texture",
    "RTXRemixStartContext": "RTX Remix Start Context",
    "RTXRemixStringConcatenate": "RTX Remix String Concatenate",
    "RTXRemixStringConstant": "RTX Remix String Constant",
    "RTXRemixStrToList": "RTX Remix String to List",
    "RTXRemixSwitch": "RTX Remix Switch",
    "RTXRemixTexturesType": "RTX Remix Texture Type",
    "RTXRemixTexturesTypes": "RTX Remix Texture Types",
    "RTXRemixTextureTypeToUSDAttribute": "RTX Remix Texture Type To USD Attribute",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
