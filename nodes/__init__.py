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

# REST API Nodes
from .rest_api.common import (
    RestAPIDetailsNode,
    RestAPIEndContextNode,
    RestAPIInvertBoolNode,
    RestAPIStartContextNode,
    RestAPIStringConcatenateNode,
    RestAPIStringConstantNode,
    RestAPIStrToListNode,
    RestAPISwitchNode,
)
from .rest_api.file import RestAPIDeleteFileNode
from .rest_api.ingestion import (
    RestAPIGetDefaultDirectoryNode,
    RestAPIIngestTextureNode,
)
from .rest_api.layers import (
    RestAPICloseProjectNode,
    RestAPICreateLayerNode,
    RestAPIDefineLayerIdNode,
    RestAPIGetEditTargetNode,
    RestAPIGetLayersNode,
    RestAPIGetLoadedProjectNode,
    RestAPILayerTypeNode,
    RestAPILayerTypesNode,
    RestAPIMuteLayerNode,
    RestAPIOpenProjectNode,
    RestAPIRemoveLayerNode,
    RestAPISaveLayerNode,
    RestAPISetEditTargetNode,
)
from .rest_api.textures import (
    RestAPIGetTexturesNode,
    RestAPISetTextureNode,
    RestAPITexturesTypeNode,
    RestAPITexturesTypesNode,
    RestAPITextureTypeToUSDAttributeNode,
)

# Top-Level Nodes
from .download import DownloadModelNode
from .save import SaveTextureNode

# Nodes for extension entry point
RTX_REMIX_NODES = [
    DownloadModelNode,
    SaveTextureNode,
    RestAPIDetailsNode,
    RestAPIStartContextNode,
    RestAPIEndContextNode,
    RestAPIStringConstantNode,
    RestAPIStringConcatenateNode,
    RestAPISwitchNode,
    RestAPIInvertBoolNode,
    RestAPIStrToListNode,
    RestAPIDefineLayerIdNode,
    RestAPICreateLayerNode,
    RestAPILayerTypeNode,
    RestAPILayerTypesNode,
    RestAPIGetLayersNode,
    RestAPIMuteLayerNode,
    RestAPIRemoveLayerNode,
    RestAPISaveLayerNode,
    RestAPIGetEditTargetNode,
    RestAPISetEditTargetNode,
    RestAPICloseProjectNode,
    RestAPIOpenProjectNode,
    RestAPIGetLoadedProjectNode,
    RestAPIDeleteFileNode,
    RestAPIIngestTextureNode,
    RestAPIGetDefaultDirectoryNode,
    RestAPIGetTexturesNode,
    RestAPITexturesTypesNode,
    RestAPITexturesTypeNode,
    RestAPISetTextureNode,
    RestAPITextureTypeToUSDAttributeNode,
]

__all__ = ["RTX_REMIX_NODES"]
