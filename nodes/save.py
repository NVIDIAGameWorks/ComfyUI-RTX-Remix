"""
* SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
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

__all__ = ["TextureType", "FileExtension", "Colorspace", "SaveTextureNode"]

import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

import folder_paths
import numpy as np
from comfy_api.latest import io
from comfy_execution.utils import get_executing_context
from Imath import Channel, PixelType
from OpenEXR import Header, OutputFile
from PIL import Image

from .constant import PREFIX_BASE

if TYPE_CHECKING:
    import torch

# Cache for current execution timestamp (ComfyUI processes prompts sequentially)
_prompt_id = None
_prompt_timestamp = None


class TextureType(Enum):
    DIFFUSE = "albedo"
    ROUGHNESS = "roughness"
    ANISOTROPY = "anisotropy"
    METALLIC = "metallic"
    EMISSIVE = "emissive_mask"
    NORMAL_OGL = "normal_ogl"
    NORMAL_DX = "normal_dx"
    NORMAL_OTH = "normal_oth"
    HEIGHT = "height"
    TRANSMITTANCE = "transmittance"
    MEASUREMENT_DISTANCE = "measurement_distance"
    SINGLE_SCATTERING = "single_scattering"
    OTHER = "other"


class FileExtension(Enum):
    PNG = ".png"
    EXR = ".exr"


class Colorspace(Enum):
    LINEAR = "linear"
    SRGB = "sRGB"


class SaveTextureNode(io.ComfyNode):
    """Save a texture to the file system"""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RTXRemixSaveTexture",
            display_name="💾 RTX Remix Save Texture",
            category=PREFIX_BASE,
            description="Save a texture to the file system to be used in RTX Remix",
            inputs=[
                io.Image.Input("textures", tooltip="Input images to save"),
                io.Combo.Input(
                    "texture_type",
                    options=[e.value for e in TextureType],
                    default=TextureType.DIFFUSE.value,
                    tooltip="Type of texture being saved",
                ),
                io.Combo.Input(
                    "file_extension",
                    options=[e.value for e in FileExtension],
                    default=FileExtension.PNG.value,
                    tooltip="File format to save as",
                ),
                io.Combo.Input(
                    "colorspace",
                    options=[e.value for e in Colorspace],
                    default=Colorspace.LINEAR.value,
                    tooltip="Color space for the output",
                ),
            ],
            hidden=[io.Hidden.extra_pnginfo],
            outputs=[
                io.String.Output("file_path", display_name="file_path"),
            ],
            is_output_node=True,
        )

    @classmethod
    def execute(
        cls,
        textures: "torch.Tensor",
        texture_type: str,
        file_extension: str,
        colorspace: str,
        hidden: io.HiddenHolder | None = None,
    ) -> io.NodeOutput:
        global _prompt_id, _prompt_timestamp

        # Get the execution context to access the unique prompt_id for this run
        context = get_executing_context()
        prompt_id = context.prompt_id if context else None

        # Create timestamp for new execution, reuse for same execution
        timestamp = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
        if prompt_id and prompt_id != _prompt_id:
            # New execution - create new timestamp
            _prompt_id = prompt_id
            _prompt_timestamp = timestamp

        # Check if metadata is stored in extra_pnginfo
        extra_pnginfo = hidden.extra_pnginfo if hidden else None
        metadata_subfolder = None
        if extra_pnginfo is not None:
            metadata_subfolder = extra_pnginfo.get("rtx-remix", {}).get("subfolder")

        # Use subfolder in the metadata or current execution timestamp as subdirectory
        subfolder = metadata_subfolder or _prompt_timestamp
        output_directory = Path(folder_paths.get_output_directory()) / subfolder

        # Create output directory if it doesn't exist
        output_directory.mkdir(parents=True, exist_ok=True)

        output_paths = []
        results = []

        for texture in textures:
            output_folder, file_name, counter, _sub_folder, _file_name_prefix = folder_paths.get_save_image_path(
                texture_type,
                str(output_directory),
                texture.shape[1],
                texture.shape[0],
            )

            file_path = Path(output_folder) / f"{file_name}_{counter:05}_{file_extension}"

            # ComfyUI works in linear space, convert to numpy
            np_img = texture.cpu().numpy()

            # Apply colorspace conversion if needed
            # Note: ComfyUI internal format is linear [0,1]
            if colorspace == Colorspace.SRGB.value:
                # Convert from linear to sRGB
                np_img = cls._linear_to_srgb(np_img)

            if file_extension == FileExtension.EXR.value:
                # Save the image using OpenEXR
                float_img = np_img.astype(np.float32)
                height, width, _ = float_img.shape

                # Prepare the EXR header
                header = Header(width, height)
                header["channels"] = dict([(c, Channel(PixelType(PixelType.FLOAT))) for c in "RGB"])

                # Split the channels for OpenEXR
                R = float_img[:, :, 0].tobytes()
                G = float_img[:, :, 1].tobytes()
                B = float_img[:, :, 2].tobytes()

                # Write the EXR file
                exr_file = OutputFile(str(file_path), header)
                try:
                    exr_file.writePixels({"R": R, "G": G, "B": B})
                finally:
                    exr_file.close()

                # Add actual file to outputs
                results.append(
                    {
                        "filename": file_path.name,
                        "subfolder": subfolder,
                        "type": "output",
                    }
                )

                # Create a preview PNG for the UI (browsers can't display EXR)
                preview_filename = f"_temp_{uuid.uuid4().hex[:8]}_{file_name}_{counter:05}.png"
                preview_path = Path(folder_paths.get_temp_directory()) / preview_filename

                # Save preview as PNG
                Image.fromarray(np.clip(255.0 * np_img, 0, 255).astype(np.uint8)).save(preview_path)

                # Add preview for UI display
                results.append(
                    {
                        "filename": preview_filename,
                        "subfolder": "",
                        "type": "temp",
                    }
                )
            else:
                # Save the image using Pillow
                Image.fromarray(np.clip(255.0 * np_img, 0, 255).astype(np.uint8)).save(file_path, compress_level=0)

                # Add actual file for UI display
                results.append(
                    {
                        "filename": file_path.name,
                        "subfolder": subfolder,
                        "type": "output",
                    }
                )

            output_paths.append(str(file_path))

        return io.NodeOutput(output_paths, ui={"images": results})

    @staticmethod
    def _linear_to_srgb(linear: np.ndarray) -> np.ndarray:
        """
        Convert linear RGB to sRGB (apply gamma encoding).

        ComfyUI works in linear RGB [0,1]. This applies the sRGB OETF to encode the image.

        Formula: if x ≤ 0.0031308: y = 12.92x
                 else: y = 1.055x^(1/2.4) - 0.055
        """
        return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1.0 / 2.4) - 0.055)

    @classmethod
    def fingerprint_inputs(cls, **kwargs) -> Any:
        """
        Always process the node
        """
        return float("nan")
