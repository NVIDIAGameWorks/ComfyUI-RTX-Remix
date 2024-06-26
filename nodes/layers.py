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

import abc
import collections
import json
import pathlib
import re
from urllib.parse import quote_plus, unquote

import requests

from .common import (
    RemixContext,
    add_context_input_enabled_and_output,
    get_context_inputs,
)
from .constant import HEADER_LSS_REMIX_VERSION_1_0, PREFIX_MENU
from .utils import check_response_status_code, merge_dict, posix

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


class DefineLayerId:
    """Helper node to define a layer path relative to project or another layer"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {
                "name": ("STRING", {"forceInput": True}),
                "parent_layer_id": (
                    "STRING",
                    {
                        # node
                        "default": "",
                        "forceInput": True,
                    },
                ),
            },
            "optional": {
                "directories": (
                    "STRING",
                    {
                        "default": None,
                    },
                ),
            },
        }
        return inputs

    RETURN_TYPES = ("STRING",)
    OUTPUT_IS_LIST = (False,)
    RETURN_NAMES = ("layer_id",)

    FUNCTION = "execute"
    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def execute(
        self,
        name: str,
        parent_layer_id: str | None = None,
        directories: str | None = None,
    ) -> str:
        layer_id_dir = pathlib.Path(parent_layer_id).parent
        if directories:
            layer_id_dir = layer_id_dir / directories
        layer_id = layer_id_dir / name
        return (layer_id.as_posix(),)


@add_context_input_enabled_and_output
class CreateLayer:
    """Create or Insert a sublayer in the current stage"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {
                "layer_id": ("STRING", {"forceInput": True}),
                "layer_type": ("STRING", {"forceInput": True}),
                "replace_existing": ("BOOLEAN", {"default": False}),
                "set_edit_target": ("BOOLEAN", {"default": True}),
                "sublayer_position": ("INT", {"default": -1, "min": -1}),
                "create_or_insert": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "create",
                        "label_off": "insert",
                    },
                ),
            },
            "optional": {
                "parent_layer_id": (
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

    RETURN_TYPES = ("STRING",)
    OUTPUT_IS_LIST = (False,)
    RETURN_NAMES = ("layer_id",)

    FUNCTION = "create_layer"

    OUTPUT_NODE = False

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def create_layer(
        self,
        layer_id: str,
        layer_type: str,
        sublayer_position: int,
        replace_existing: bool = False,
        set_edit_target: bool = True,
        parent_layer_id: str | None = None,
        create_or_insert: bool = True,
    ) -> str:
        if not self.enable_this_node:  # noqa
            return ("",)
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
        address, port = self.context  # noqa
        r = requests.post(f"http://{address}:{port}/stagecraft/layers", data=data, headers=HEADER_LSS_REMIX_VERSION_1_0)
        check_response_status_code(r)

        return (layer_id,)


@add_context_input_enabled_and_output
class LayerType:
    """Select from a list of supported layer types."""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802

        inputs = {
            "required": {
                "layer_type": (_layer_types,),
            }
        }
        return inputs

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("layer_type",)

    FUNCTION = "get_layer_type"

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_layer_type(self, layer_type: str) -> tuple[str]:
        if not self.enable_this_node:  # noqa
            return ("",)
        validate_layer_types([layer_type], self.context.address, self.context.port)  # noqa
        return (layer_type,)


@add_context_input_enabled_and_output
class LayerTypes:
    """Select multiple layer types from a list of supported layer types."""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802

        inputs = {
            "required": {
                "layer_types": (
                    "STRING",
                    {
                        "multiline": True,  # True if you want the field to look like the one on the ClipTextEncode
                        "default": ",".join(_layer_types),
                    },
                ),
            }
        }
        return inputs

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("layer_types",)

    FUNCTION = "get_layer_types"

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_layer_types(self, layer_types: str) -> tuple[str]:
        if not self.enable_this_node:  # noqa
            return ("",)
        layer_types_list = [t.strip() for t in layer_types.split(",")]
        validate_layer_types(layer_types_list, self.context.address, self.context.port)  # noqa
        return (layer_types,)


@add_context_input_enabled_and_output
class GetLayers:
    """Query layer ids from the currently open project"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        inputs = {
            "required": {
                "layer_types": ("STRING", {"forceInput": True}),
                "layer_count": ("INT", {"default": -1, "min": -1}),
                "sublayers": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "all",
                        "label_off": "immediate only",
                    },
                ),
                "crash_if_not_exist": (
                    "BOOLEAN",
                    {
                        "default": True,
                    },
                ),
            },
            "optional": {
                "parent_layer_id": ("STRING", {"forceInput": True}),
                "regex_filter": ("STRING", {"forceInput": True, "default": None}),
            },
        }
        return inputs

    RETURN_TYPES = (
        "STRING",
        "STRING",
        "BOOLEAN",
    )
    OUTPUT_IS_LIST = (
        True,
        True,
        False,
    )
    RETURN_NAMES = (
        "layer_ids",
        "layer_types",
        "all_layer_type_exist",
    )

    FUNCTION = "execute"

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def execute(
        self,
        layer_types: str,
        layer_count: int = -1,
        sublayers: bool = True,
        crash_if_not_exist: bool = True,
        parent_layer_id: str | None = None,
        regex_filter: str | None = None,
    ) -> tuple[list[str], list[str], bool]:
        if not self.enable_this_node:  # noqa
            return ([], [], False)
        layer_types_list = [t.strip() for t in layer_types.split(",")]
        params = {
            "layer_types": layer_types_list,
            "layer_count": layer_count,
        }
        address, port = self.context  # noqa
        if parent_layer_id:
            r = requests.get(
                f"http://{address}:{port}/stagecraft/layers/{quote_plus(posix(parent_layer_id))}/sublayers",
                params=params,
                headers=HEADER_LSS_REMIX_VERSION_1_0,
            )
        else:
            r = requests.get(
                f"http://{address}:{port}/stagecraft/layers", params=params, headers=HEADER_LSS_REMIX_VERSION_1_0
            )
        check_response_status_code(r)

        layer_ids: list[str] = []
        layer_types: list[str] = []

        layers = json.loads(r.text).get("layers", [])
        if not layers and crash_if_not_exist:
            raise ValueError("No layers found. Please check the parameters of your node")
        if not layers and not crash_if_not_exist:
            return (layer_ids, layer_types, False)

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
                layer_types.append(stringify_layer_type(layer["layer_type"]))
            if sublayers:
                layers_to_process.extend(layer["children"])

        return (layer_ids, layer_types, bool(layer_ids))

    @classmethod
    def IS_CHANGED(cls, **kwargs):  # noqa N802
        """
        Always process the node in case the layers in the RTX Remix app changed
        """
        return float("nan")


class _LayerOp:

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802

        inputs = {
            "required": {
                "layer_id": (
                    "STRING",
                    {"default": "", "forceInput": True},
                ),
            }
        }
        return inputs

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("layer_id",)

    FUNCTION = "execute"

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    @abc.abstractmethod
    def execute(self, layer_id: str) -> tuple[str]:
        raise NotImplementedError()


@add_context_input_enabled_and_output
class MuteLayer(_LayerOp):
    """Mute or unmute a project layer"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa
        inputs = {
            "required": {
                "mute": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "mute",
                        "label_off": "unmute",
                    },
                ),
            }
        }
        return merge_dict(super().INPUT_TYPES(), inputs)

    def execute(self, layer_id: str, mute: bool) -> tuple[str]:  # noqa
        if not self.enable_this_node:  # noqa
            return ("",)
        payload = {"value": mute}
        address, port = self.context  # noqa
        r = requests.put(
            f"http://{address}:{port}/stagecraft/layers/{quote_plus(posix(layer_id))}/mute",
            data=json.dumps(payload),
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return (layer_id,)


@add_context_input_enabled_and_output
class RemoveLayer(_LayerOp):
    """Remove a layer from the project"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802

        inputs = {
            "required": {
                "parent_layer_id": (
                    "STRING",
                    {"default": "", "forceInput": True},
                ),
            }
        }
        return merge_dict(super().INPUT_TYPES(), inputs)

    def execute(self, layer_id: str, parent_layer_id: str) -> tuple[str]:  # noqa
        if not self.enable_this_node:  # noqa
            return ("",)
        payload = {"parent_layer_id": posix(parent_layer_id)}
        address, port = self.context  # noqa
        r = requests.delete(
            f"http://{address}:{port}/stagecraft/layers/{quote_plus(posix(layer_id))}",
            data=json.dumps(payload),
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return (layer_id,)


@add_context_input_enabled_and_output
class SaveLayer(_LayerOp):
    """Save a project layer"""

    def execute(self, layer_id: str) -> tuple[str]:
        if not self.enable_this_node:  # noqa
            return ("",)
        address, port = self.context  # noqa
        r = requests.post(
            f"http://{address}:{port}/stagecraft/layers/{quote_plus(posix(layer_id))}/save",
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return (layer_id,)


@add_context_input_enabled_and_output
class GetEditTarget:
    """Get the edit target from the currently open project"""

    @classmethod
    def INPUT_TYPES(cls):  # noqa N802
        return get_context_inputs()

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("layer_id",)

    FUNCTION = "get_edit_target"

    OUTPUT_NODE = False

    CATEGORY = f"{PREFIX_MENU}/{_file_name}"

    def get_edit_target(self, context: RemixContext) -> tuple[str]:
        if not self.enable_this_node:  # noqa
            return ("",)
        address, port = self.context  # noqa
        r = requests.get(f"http://{address}:{port}/stagecraft/layers/target", headers=HEADER_LSS_REMIX_VERSION_1_0)
        check_response_status_code(r)

        return (unquote(json.loads(r.text).get("layer_id")),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):  # noqa N802
        """
        Always process the node in case the selection in the RTX Remix app changed
        """
        return float("nan")


@add_context_input_enabled_and_output
class SetEditTarget(_LayerOp):
    """Designate the edit target on the open project to receive modifications"""

    def execute(self, layer_id: str) -> tuple[str]:
        if not self.enable_this_node:  # noqa
            return ("",)
        address, port = self.context  # noqa
        r = requests.put(
            f"http://{address}:{port}/stagecraft/layers/target/{quote_plus(posix(layer_id))}",
            headers=HEADER_LSS_REMIX_VERSION_1_0,
        )
        check_response_status_code(r)
        return (layer_id,)  # return an output so that you can make sure this executes before other nodes
