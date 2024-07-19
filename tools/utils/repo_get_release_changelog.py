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
import re
import sys


def get_changelog_text(content: str, section_header: str, section_pattern: str):
    """
    Get the changelog for a given header
    """
    split = [section for section in re.split(section_pattern, content) if section.startswith(section_header)]
    if not split:
        print(f"No '{section_header}' section was found")
        sys.exit(1)
    return [f"{ln}\n" for ln in split[0].splitlines()[2:]]


def setup_repo_tool(parser, _):
    parser.prog = "get_release_changelog"
    parser.description = "Get the changelog text for a given release"
    parser.add_argument(
        "-s",
        "--save-current",
        dest="file_path",
        required=False,
        help="Save the current changelog from the version specified in the section_header into a file."
    )
    parser.add_argument(
        "-sh",
        "--section-header",
        dest="section_header",
        required=False,
        help="Override the section header you want to use",
    )
    parser.add_argument(
        "-sol",
        "--save-one-line",
        dest="one_line",
        action="store_true",
        required=False,
        help="To use with -s. If True, it will save the changelog into 1 line",
    )

    def run_repo_tool(options, config):
        settings = config["repo_get_release_changelog"]
        file_name = settings["file_name"]
        section_pattern = settings["section_pattern"]
        section_header = options.section_header if options.section_header else settings["section_header"]

        with open(file_name, "r", encoding="utf8") as f:
            current_text = f.read()
        current_changelog = get_changelog_text(current_text, section_header, section_pattern)
        if options.file_path:
            if options.one_line:
                with open(options.file_path, "w", encoding="utf8") as f:
                    f.write(repr("".join(current_changelog)))
            else:
                with open(options.file_path, "w", encoding="utf8") as f:
                    f.writelines(current_changelog)
            print("Success!")
        else:
            print(section_pattern, section_header, sep="", end="\n\n")
            print("".join(current_changelog))

    return run_repo_tool
