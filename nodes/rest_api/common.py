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

import pathlib
from collections import namedtuple
from typing import Any

from comfy_api.latest import io

from ..constant import CONTEXT_TYPE, PREFIX_MENU_API

_file_name = pathlib.Path(__file__).stem

RemixContext = namedtuple("RemixContext", ["address", "port"])

__all__ = [
    "RemixContext",
    "context_input",
    "context_output",
    "enable_input",
    "remix_api_inputs",
    "RestAPIDetailsNode",
    "RestAPIStartContextNode",
    "RestAPIEndContextNode",
    "RestAPIStringConstantNode",
    "RestAPIStringConcatenateNode",
    "RestAPISwitchNode",
    "RestAPIInvertBoolNode",
    "RestAPIStrToListNode",
]


def context_input() -> io.Input:
    return io.Custom(CONTEXT_TYPE).Input("context")


def enable_input() -> io.Input:
    return io.Boolean.Input("enable_this_node", default=True)


def context_output() -> io.Output:
    return io.Custom(CONTEXT_TYPE).Output("context_out", display_name="context")


def remix_api_inputs() -> list[io.Input]:
    return [
        io.String.Input("address", default="127.0.0.1"),
        io.Int.Input(
            "port",
            default=8011,
            min=0,
            max=65353,
            step=1,
            display_mode=io.NumberDisplay.number,
        ),
    ]


class RestAPIDetailsNode(io.ComfyNode):
    """Provide the port information to connect to the RTX Remix Toolkit"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixRestAPIDetails",
            display_name="🌐 RTX Remix Rest API Details",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=remix_api_inputs(),
            outputs=[
                io.String.Output("address_out", display_name="address"),
                io.Int.Output("port_out", display_name="port"),
            ],
        )

    @classmethod
    def execute(cls, address: str, port: int) -> io.NodeOutput:
        return io.NodeOutput(address, port)


class RestAPIStartContextNode(io.ComfyNode):
    """Use this node to begin a graph, then pass context along to determine execution order."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixStartContext",
            display_name="🌐 RTX Remix Start Context",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                io.String.Input("address"),
                io.Int.Input("port"),
            ],
            outputs=[context_output()],
        )

    @classmethod
    def execute(cls, address: str, port: int) -> io.NodeOutput:
        return io.NodeOutput(RemixContext(address, port))


class RestAPIEndContextNode(io.ComfyNode):
    """Put this node at the end of your graph to evaluate prior nodes"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixEndContext",
            display_name="🌐 RTX Remix End Context",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[context_input()],
            outputs=[],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, context: RemixContext) -> io.NodeOutput:  # noqa: ARG003
        return io.NodeOutput()


class RestAPIStringConstantNode(io.ComfyNode):
    """Declare a string constant"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixStringConstant",
            display_name="🌐 RTX Remix String Constant",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[io.String.Input("string", default="", multiline=True)],
            outputs=[io.String.Output("string_out", display_name="string")],
        )

    @classmethod
    def execute(cls, string: str) -> io.NodeOutput:
        return io.NodeOutput(string)


class RestAPIStringConcatenateNode(io.ComfyNode):
    """Concatenate two strings"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixStringConcatenate",
            display_name="🌐 RTX Remix String Concatenate",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                io.String.Input("string1", default=""),
                io.String.Input("string2", default=""),
                io.String.Input("separator", default="_", optional=True),
            ],
            outputs=[io.String.Output("string", display_name="string")],
        )

    @classmethod
    def execute(cls, string1: str, string2: str, separator: str = "_") -> io.NodeOutput:
        return io.NodeOutput(string1 + separator + string2)


class RestAPISwitchNode(io.ComfyNode):
    """Switch to one branch or another depending on the bool value"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixSwitch",
            display_name="🌐 RTX Remix Switch",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                io.AnyType.Input("if_true"),
                io.AnyType.Input("if_false"),
                io.Boolean.Input("switcher", default=True),
            ],
            outputs=[io.AnyType.Output("value", display_name="value", is_output_list=True)],
            is_input_list=True,
        )

    @classmethod
    def execute(cls, if_true: Any, if_false: Any, switcher: list[bool]) -> io.NodeOutput:
        return io.NodeOutput(if_true if switcher[0] else if_false)


class RestAPIInvertBoolNode(io.ComfyNode):
    """Invert a boolean value. For example, True to False, or False to True"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixInvertBool",
            display_name="🌐 RTX Remix Invert Boolean Value",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[io.Boolean.Input("value", default=True)],
            outputs=[io.Boolean.Output("value_out", display_name="value")],
        )

    @classmethod
    def execute(cls, value: bool) -> io.NodeOutput:
        return io.NodeOutput(not value)


class RestAPIStrToListNode(io.ComfyNode):
    """Converts a string to list"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixStrToList",
            display_name="🌐 RTX Remix String to List",
            category=f"{PREFIX_MENU_API}/{_file_name}",
            inputs=[
                io.String.Input("value", default=""),
            ],
            outputs=[
                io.String.Output("value_out", display_name="value", is_output_list=True),
            ],
        )

    @classmethod
    def execute(cls, value: str) -> io.NodeOutput:
        return io.NodeOutput([value])
