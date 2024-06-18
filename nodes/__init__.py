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

from .common import RestAPIDetails, StringConstant, StartContext, EndContext
from .ingestion import IngestTexture
from .textures import (
    GetTextures,
    SetTexture,
    TexturesType,
    TexturesTypes,
    TextureTypeToUSDAttribute,
)
from .layers import (
    SetEditTarget,
    CreateLayer,
    DefineLayerId,
    GetEditTarget,
    RemoveLayer,
    GetLayers,
    SaveLayer,
    LayerTypes,
    LayerType,
    MuteLayer
)

# A dictionary that contains all nodes you want to export with their names
# NOTE: names should be globally unique
NODE_CLASS_MAPPINGS = {
    "RTXRemixGetTextures": GetTextures,
    "RTXRemixTextureTypeToUSDAttribute": TextureTypeToUSDAttribute,
    "RTXRemixIngestTexture": IngestTexture,
    "RTXRemixRestAPIDetails": RestAPIDetails,
    "RTXRemixSetTexture": SetTexture,
    "RTXRemixStringConstant": StringConstant,
    "RTXRemixTexturesType": TexturesType,
    "RTXRemixTexturesTypes": TexturesTypes,
    "RTXRemixDefineLayerId": DefineLayerId,
    "RTXRemixCreateLayer": CreateLayer,
    "RTXRemixGetLayers": GetLayers,
    "RTXRemixRemoveLayer": RemoveLayer,
    "RTXRemixSaveLayer": SaveLayer,
    "RTXRemixMuteLayer": MuteLayer,
    "RTXRemixSetEditTarget": SetEditTarget,
    "RTXRemixGetEditTarget": GetEditTarget,
    "RTXRemixLayerTypes": LayerTypes,
    "RTXRemixLayerType": LayerType,
    "RTXRemixStartContext": StartContext,
    "RTXRemixEndContext": EndContext,
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "RTXRemixGetTextures": "RTX Remix Get Textures",
    "RTXRemixTextureTypeToUSDAttribute": "RTX Remix Texture Type To USD Attribute",
    "RTXRemixIngestTexture": "RTX Remix Ingest Texture",
    "RTXRemixRestAPIDetails": "RTX Remix Rest API Details",
    "RTXRemixSetTexture": "RTX Remix Set Texture",
    "RTXRemixStringConstant": "RTX Remix String Constant",
    "RTXRemixTexturesType": "RTX Remix Texture Type",
    "RTXRemixTexturesTypes": "RTX Remix Texture Types",
    "RTXRemixDefineLayerId": "RTX Remix Define Layer",
    "RTXRemixCreateLayer": "RTX Remix Create Layer",
    "RTXRemixGetLayers": "RTX Remix Get Layers",
    "RTXRemixRemoveLayer": "RTX Remix Remove Layer",
    "RTXRemixSaveLayer": "RTX Remix Save Layer",
    "RTXRemixMuteLayer": "RTX Remix Mute Layer",
    "RTXRemixSetEditTarget": "RTX Remix Set Edit Target",
    "RTXRemixGetEditTarget": "RTX Remix Get Edit Target",
    "RTXRemixLayerTypes": "RTX Remix Layer Types",
    "RTXRemixLayerType": "RTX Remix Layer Type",
    "RTXRemixStartContext": "RTX Remix Start Context",
    "RTXRemixEndContext": "RTX Remix End Context",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
