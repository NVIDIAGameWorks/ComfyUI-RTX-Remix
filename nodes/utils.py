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
import logging
import pathlib
import json

import requests

_logger = logging.getLogger(__name__)


def merge_dict(source: dict, destination: dict) -> dict:
    """
    Took from https://stackoverflow.com/questions/20656135/python-deep-merge-dictionary-data
    run me with nosetests --with-doctest file.py

    Examples:
        >>> a = { 'first' : { 'all_rows' : { 'pass' : 'dog', 'number' : '1' } } }
        >>> b = { 'first' : { 'all_rows' : { 'fail' : 'cat', 'number' : '5' } } }
        >>> merge_dict(b, a) == { 'first' : { 'all_rows' : { 'pass' : 'dog', 'fail' : 'cat', 'number' : '5' } } }

    Returns:
        True
    """
    for key, value in source.items():
        if isinstance(value, dict):
            # get node or create one
            node = destination.setdefault(key, {})
            merge_dict(value, node)
        else:
            destination[key] = value

    return destination


def check_response_status_code(response: requests.Response) -> None:
    import pprint
    try:
        response.raise_for_status()
    except requests.exceptions.HTTPError as err:
        r = response.json()
        _logger.error(f"Requested URL: {response.url}\n"
                      f"Raw Response: \n\n{pprint.pformat(r)}\n")
        raise err


def posix(layer_id: str | None) -> str:
    if layer_id is None:
        return layer_id
    return pathlib.Path(layer_id).as_posix()
