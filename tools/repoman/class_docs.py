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
import os
import re
import subprocess
import sys
import textwrap


def update_comfyui_rtx_remix_readme(module, readme_path, section_header):
    """Generate docs for node types"""
    section_header_style = section_header.split(' ')[0]
    header_num = section_header_style.count('#')

    output = []
    nodes_by_module = {}
    for name, node in module.NODE_CLASS_MAPPINGS.items():
        nodes_by_module.setdefault(node.__module__, []).append((name, node))

    for node_module, nodes in nodes_by_module.items():
        output.append(f"{'#' * (header_num + 1)} {node_module.split('.')[-1].capitalize()}\n")
        for node_info in nodes:
            name, node_class = node_info
            display_name = module.NODE_DISPLAY_NAME_MAPPINGS[name]
            if node_class.__doc__:
                # first line only
                doc = node_class.__doc__.strip("\n")
                line_break_index = doc.find("\n")
                if line_break_index > 0:
                    doc = doc[:]
                output.append(f"- **{display_name}**: {doc}\n")
            else:
                output.append(f"**{display_name}**\n")

        output.append("\n")

    replace_section(readme_path, section_header, output)


def replace_section(readme_path, section_header, contents):
    """Replace a section under a specific markdown header with new contents"""
    section_header_style = section_header.split(' ')[0]
    with open(readme_path, 'r') as f:
        data = f.readlines()

    new = []
    start = -1
    end = None
    found = False
    for i, line in enumerate(data):
        # search for the first occurence of the special section header string
        if not found:
            if line.strip() == section_header:
                found = True
                start = i + 1
        # search for the next header of the same magnitude
        elif re.match(f"{section_header_style}[^#].*", line):
            end = i
            break

    final = data[:start] + contents
    if end:
        final += data[end:]
    with open(readme_path, 'w') as f:
        f.writelines(final)


def update_readme(module, readme_path, section_header):
    """Generic `class_docs` entry point. Add repo-specific implementation here!"""
    update_comfyui_rtx_remix_readme(module, readme_path, section_header)


def setup_repo_tool(parser, _):
    parser.prog = "class_docs"
    parser.description = "Generate summary documentation for a bunch of classes"

    def run_repo_tool(options, config):
        import subprocess
        settings = config["repo_class_docs"]

        # Some projects will require using their own python in order to be able to import and inspect
        # classes so we use a subprocess
        python_code = textwrap.dedent(f"""\
            import sys
            sys.path.append("{os.path.dirname(__file__)}")
            import class_docs
            import importlib.util
            module_name = "{settings["module_name"]}"
            spec = importlib.util.spec_from_file_location(module_name, "{settings["module"]}")
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
            
            class_docs.update_readme(module, "{settings["file_path"]}", "{settings["section_header"]}")
            """)
        python_cmd = settings["python_install"]

        if subprocess.call([python_cmd, "-c", python_code]) == 0:
            print("Success!")

    return run_repo_tool
