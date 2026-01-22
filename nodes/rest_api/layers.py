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

import collections
import json
import pathlib
import re
from urllib.parse import quote, unquote

import requests

from comfy_api.latest import io

from .common import RemixContext, context_input, context_output, enable_input
from ..constant import HEADER_LSS_REMIX_VERSION_1_0, PREFIX_MENU_API
from ..utils import check_response_status_code, posix

NONE = "None"
_layer_types = [
    "autoupscale",
    "capture_baker",
    "capture",
    "replacement",
    "workfile",
    NONE,
]  # RestAPI should not be called here. Or if there is a crash, the whole graph would not load

_file_name = pathlib.Path(__file__).stem

__all__ = [
    "RestAPIDefineLayerIdNode",
    "RestAPICreateLayerNode",
    "RestAPILayerTypeNode",
    "RestAPILayerTypesNode",
    "RestAPIGetLayersNode",
    "RestAPIMuteLayerNode",
    "RestAPIRemoveLayerNode",
    "RestAPISaveLayerNode",
    "RestAPIGetEditTargetNode",
    "RestAPISetEditTargetNode",
    "RestAPICloseProjectNode",
    "RestAPIOpenProjectNode",
    "RestAPIGetLoadedProjectNode",
]


def stringify_layer_type(layer_type: str | None) -> str:
    if layer_type is None:
        return NONE
    return layer_type


def validate_layer_types(layer_types: list[str], address: str, port: str):
    r = requests.get(f"http://{address}:{port}/stagecraft/layers/types", headers=HEADER_LSS_REMIX_VERSION_1_0)
    check_response_status_code(r)

    valid_layer_types = set(json.loads(r.text).get("layer_types", []))

    # No type is not returned here, but it is a valid input
    valid_layer_types.add(NONE)

    for layer_type in layer_types:
        if layer_type not in valid_layer_types:
            supported_str = ",".join(valid_layer_types)
            raise ValueError(f"Wrong layer type value {layer_type}. Only those values are supported: {supported_str}")


class RestAPIDefineLayerIdNode(io.ComfyNode):
    """Helper node to define a layer path relative to project or another layer"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixDefineLayerId",
            display_name="🌐 RTX Remix Define Layer ID",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                io.String.Input("name"),
                io.String.Input("parent_layer_id", default=""),
                io.String.Input("directories", default="", optional=True),
            ],
            outputs=[io.String.Output("layer_id", display_name="layer_id")],
        )

    @classmethod
    def execute(
        cls,
        name: str,
        parent_layer_id: str | None = None,
        directories: str = "",
    ) -> io.NodeOutput:
        if parent_layer_id is None:
            parent_layer_id = ""

        layer_id_dir = pathlib.Path(parent_layer_id).parent
        if directories:
            layer_id_dir = layer_id_dir / directories
        layer_id = layer_id_dir / name
        return io.NodeOutput(layer_id.as_posix())


class RestAPICreateLayerNode(io.ComfyNode):
    """Create or Insert a sublayer in the current stage"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixCreateLayer",
            display_name="🌐 RTX Remix Create Layer",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("layer_id"),
                io.String.Input("layer_type"),
                io.Boolean.Input("replace_existing", default=False),
                io.Boolean.Input("set_edit_target", default=True),
                io.Int.Input("sublayer_position", default=-1, min=-1),
                io.Boolean.Input(
                    "create_or_insert",
                    default=True,
                    label_on="create",
                    label_off="insert",
                ),
                io.String.Input("parent_layer_id", default="", optional=True),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_id_out", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(
        cls,
        context: RemixContext,
        enable_this_node: bool,
        layer_id: str,
        layer_type: str,
        sublayer_position: int,
        replace_existing: bool = False,
        set_edit_target: bool = True,
        parent_layer_id: str | None = None,
        create_or_insert: bool = True,
    ) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        payload = {
            "layer_path": posix(layer_id),
            "layer_type": None if layer_type == NONE else layer_type,
            "set_edit_target": set_edit_target,
            "sublayer_position": sublayer_position,
            "parent_layer_id": posix(parent_layer_id),
            "create_or_insert": create_or_insert,
            "replace_existing": replace_existing,
        }
        data = json.dumps(payload)
        address, port = context
        r = requests.post(f"http://{address}:{port}/stagecraft/layers", data=data, headers=HEADER_LSS_REMIX_VERSION_1_0)
        check_response_status_code(r)

        return io.NodeOutput(context, layer_id)


class RestAPILayerTypeNode(io.ComfyNode):
    """Select from a list of supported layer types."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixLayerType",
            display_name="🌐 RTX Remix Layer Type",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.Combo.Input("layer_type", options=_layer_types),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_type_out", display_name="layer_type"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, layer_type: str) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        validate_layer_types([layer_type], context.address, context.port)
        return io.NodeOutput(context, layer_type)


class RestAPILayerTypesNode(io.ComfyNode):
    """Select multiple layer types from a list of supported layer types."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixLayerTypes",
            display_name="🌐 RTX Remix Layer Types",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input(
                    "layer_types",
                    multiline=True,
                    default=",".join(_layer_types),
                ),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_types_out", display_name="layer_types"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, layer_types: str) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        layer_types_list = [t.strip() for t in layer_types.split(",")]
        validate_layer_types(layer_types_list, context.address, context.port)
        return io.NodeOutput(context, layer_types)


class RestAPIGetLayersNode(io.ComfyNode):
    """Query layer ids from the currently open project"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixGetLayers",
            display_name="🌐 RTX Remix Get Layers",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("layer_types"),
                io.Int.Input("layer_count", default=-1, min=-1),
                io.Boolean.Input(
                    "sublayers",
                    default=True,
                    label_on="all",
                    label_off="immediate only",
                ),
                io.Boolean.Input("crash_if_not_exist", default=True),
                io.String.Input("parent_layer_id", optional=True),
                io.String.Input("regex_filter", default="", optional=True),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_ids", display_name="layer_ids", is_output_list=True),
                io.String.Output("layer_types_out", display_name="layer_types", is_output_list=True),
                io.Boolean.Output("all_layer_type_exist", display_name="all_layer_type_exist"),
            ],
        )

    @classmethod
    def execute(
        cls,
        context: RemixContext,
        enable_this_node: bool,
        layer_types: str,
        layer_count: int = -1,
        sublayers: bool = True,
        crash_if_not_exist: bool = True,
        parent_layer_id: str | None = None,
        regex_filter: str = "",
    ) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, [""], [""], False)

        layer_types_list = [t.strip() for t in layer_types.split(",")]
        params = {
            "layer_types": layer_types_list,
            "layer_count": layer_count,
        }
        address, port = context
        if parent_layer_id:
            r = requests.get(
                f"http://{address}:{port}/stagecraft/layers/{quote(posix(parent_layer_id), safe='')}/sublayers",
                params=params,
                headers=HEADER_LSS_REMIX_VERSION_1_0,
            )
        else:
            r = requests.get(
                f"http://{address}:{port}/stagecraft/layers", params=params, headers=HEADER_LSS_REMIX_VERSION_1_0
            )
        check_response_status_code(r)

        layer_ids: list[str] = []
        layer_types_output: list[str] = []

        layers = json.loads(r.text).get("layers", [])
        if not layers and crash_if_not_exist:
            raise ValueError("No layers found. Please check the parameters of your node")
        if not layers and not crash_if_not_exist:
            return io.NodeOutput(context, [""], [""], False)

        seen: set[str] = set()
        layers_to_process = collections.deque(layers)

        while layers_to_process:
            layer = layers_to_process.popleft()
            layer_id = posix(unquote(layer["layer_id"]))
            if layer_id in seen:
                continue
            seen.add(layer_id)
            if not regex_filter or re.match(regex_filter, layer_id):
                layer_ids.append(layer_id)
                layer_types_output.append(stringify_layer_type(layer["layer_type"]))
            if sublayers:
                layers_to_process.extend(layer["children"])

        if not layer_ids:
            layer_ids = [""]
            layer_types_output = [""]
            return io.NodeOutput(context, layer_ids, layer_types_output, False)

        return io.NodeOutput(context, layer_ids, layer_types_output, bool(layer_ids))

    @classmethod
    def fingerprint_inputs(cls, **kwargs):  # noqa: ARG003
        """
        Always process the node in case the layers in the RTX Remix app changed
        """
        return float("nan")


class RestAPIMuteLayerNode(io.ComfyNode):
    """Mute or unmute a project layer"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixMuteLayer",
            display_name="🌐 RTX Remix Mute Layer",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("layer_id", default=""),
                io.Boolean.Input("mute", default=True, label_on="mute", label_off="unmute"),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_id_out", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, layer_id: str, mute: bool) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        payload = {"value": mute}
        address, port = context
        r = requests.put(
            f"http://{address}:{port}/stagecraft/layers/{quote(posix(layer_id), safe='')}/mute",
            data=json.dumps(payload),
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return io.NodeOutput(context, layer_id)


class RestAPIRemoveLayerNode(io.ComfyNode):
    """Remove a layer from the project"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixRemoveLayer",
            display_name="🌐 RTX Remix Remove Layer",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("layer_id", default=""),
                io.String.Input("parent_layer_id", default=""),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_id_out", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(
        cls, context: RemixContext, enable_this_node: bool, layer_id: str, parent_layer_id: str
    ) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        payload = {"parent_layer_id": posix(parent_layer_id)}
        address, port = context
        r = requests.delete(
            f"http://{address}:{port}/stagecraft/layers/{quote(posix(layer_id), safe='')}",
            data=json.dumps(payload),
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return io.NodeOutput(context, layer_id)


class RestAPISaveLayerNode(io.ComfyNode):
    """Save a project layer"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixSaveLayer",
            display_name="🌐 RTX Remix Save Layer",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("layer_id", default=""),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_id_out", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, layer_id: str) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        address, port = context
        r = requests.post(
            f"http://{address}:{port}/stagecraft/layers/{quote(posix(layer_id), safe='')}/save",
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return io.NodeOutput(context, layer_id)


class RestAPIGetEditTargetNode(io.ComfyNode):
    """Get the edit target from the currently open project"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixGetEditTarget",
            display_name="🌐 RTX Remix Get Edit Target",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[context_input(), enable_input()],
            outputs=[
                context_output(),
                io.String.Output("layer_id_out", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        address, port = context
        r = requests.get(f"http://{address}:{port}/stagecraft/layers/target", headers=HEADER_LSS_REMIX_VERSION_1_0)
        check_response_status_code(r)
        return io.NodeOutput(context, unquote(json.loads(r.text).get("layer_id")))

    @classmethod
    def fingerprint_inputs(cls, **kwargs):  # noqa: ARG003
        """
        Always process the node in case the selection in the RTX Remix app changed
        """
        return float("nan")


class RestAPISetEditTargetNode(io.ComfyNode):
    """Designate the edit target on the open project to receive modifications"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixSetEditTarget",
            display_name="🌐 RTX Remix Set Edit Target",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("layer_id", default=""),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_id_out", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, layer_id: str) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        address, port = context
        r = requests.put(
            f"http://{address}:{port}/stagecraft/layers/target/{quote(posix(layer_id), safe='')}",
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return io.NodeOutput(context, layer_id)


class RestAPICloseProjectNode(io.ComfyNode):
    """Close the currently open project"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixCloseProject",
            display_name="🌐 RTX Remix Close Project",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.Boolean.Input("force", default=False, optional=True),
            ],
            outputs=[
                context_output(),
                io.String.Output("status", display_name="status"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, force: bool = False) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "disabled")
        address, port = context
        url = f"http://{address}:{port}/stagecraft/project"
        if force:
            url += "?force=true"
        r = requests.delete(
            url,
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return io.NodeOutput(context, "closed")


class RestAPIOpenProjectNode(io.ComfyNode):
    """Open a project using the specified layer ID"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixOpenProject",
            display_name="🌐 RTX Remix Open Project",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                context_input(),
                enable_input(),
                io.String.Input("layer_id", default=""),
            ],
            outputs=[
                context_output(),
                io.String.Output("layer_id_out", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool, layer_id: str) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        address, port = context
        r = requests.put(
            f"http://{address}:{port}/stagecraft/project/{quote(posix(layer_id), safe='')}",
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return io.NodeOutput(context, layer_id)


class RestAPIGetLoadedProjectNode(io.ComfyNode):
    """Get the currently loaded project"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixGetLoadedProject",
            display_name="🌐 RTX Remix Get Loaded Project",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[context_input(), enable_input()],
            outputs=[
                context_output(),
                io.String.Output("layer_id", display_name="layer_id"),
            ],
        )

    @classmethod
    def execute(cls, context: RemixContext, enable_this_node: bool) -> io.NodeOutput:
        if not enable_this_node:
            return io.NodeOutput(context, "")
        address, port = context
        r = requests.get(
            f"http://{address}:{port}/stagecraft/project/",
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        response_data = json.loads(r.text)
        layer_id = response_data.get("layer_id", "")
        return io.NodeOutput(context, layer_id)

    @classmethod
    def fingerprint_inputs(cls, **kwargs):  # noqa: ARG003
        """
        Always process the node in case the loaded project in the RTX Remix app changed
        """
        return float("nan")
