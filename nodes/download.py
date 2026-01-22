"""
* SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
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

__all__ = ["DownloadModelNode"]

import hashlib
import tarfile
import zipfile
from pathlib import Path
import re
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import requests
from huggingface_hub import get_hf_file_metadata, hf_hub_url

import folder_paths
from comfy_execution.utils import get_executing_context
from comfy_api.latest import io
from server import PromptServer

from .constant import (
    CHUNK_SIZE_BYTES,
    CIVITAI_API_BASE_URL,
    DOWNLOAD_TIMEOUT_SECONDS,
    PREFIX_BASE,
    ModelSource,
)
from ..api.configs.dynamic_ui import NODE_UI_CONFIGS, NodeUIConfig
from ..utils import get_logger

logger = get_logger(__name__)


class DownloadModelNode(io.ComfyNode):
    """Download a model from a variety of sources"""

    # Dynamic UI configuration (Pydantic validated)
    UI_CONFIG = NODE_UI_CONFIGS[NodeUIConfig.RTX_REMIX_DOWNLOAD_MODEL]

    @classmethod
    def define_schema(cls) -> io.Schema:
        model_sources = ModelSource.all()
        excluded = ["custom_nodes", "configs"]
        model_types = sorted([k for k in folder_paths.folder_names_and_paths.keys() if k not in excluded])

        return io.Schema(
            node_id="RTXRemixDownloadModel",
            display_name="🧲 RTX Remix Download Model",
            category=PREFIX_BASE,
            description="Download a model from a variety of sources to the models directory",
            inputs=[
                # === Primary input ===
                io.String.Input(
                    "url",
                    default="",
                    placeholder="Paste model URL (HuggingFace, CivitAI, or direct link)...",
                    tooltip="Paste any model URL - source will be auto-detected",
                ),
                # === Common options (always visible) ===
                io.Combo.Input(
                    "model_type",
                    options=model_types,
                    default="checkpoints",
                    tooltip="The type of model (determines target directory)",
                ),
                io.String.Input(
                    "subdirectory",
                    default="",
                    tooltip="Optional subdirectory within the model type folder",
                ),
                io.Boolean.Input(
                    "force_download",
                    default=False,
                    label_on="Yes",
                    label_off="No",
                    tooltip="Force re-download even if file exists",
                ),
                io.Boolean.Input(
                    "extract_archive",
                    default=False,
                    label_on="Yes",
                    label_off="No",
                    tooltip="Enable if download is a zip/tar archive containing the model",
                ),
                # === Archive fields (visible when extract_archive is enabled) ===
                io.String.Input(
                    "archive_model_filename",
                    default="",
                    optional=True,
                    tooltip="The model filename inside the archive (e.g., 'model.safetensors')",
                ),
                io.String.Input(
                    "extracted_model_hash",
                    default="",
                    optional=True,
                    tooltip="SHA256 hash of extracted model (auto-populated after extraction)",
                ),
                # === Source detection (last common, visible after URL entered) ===
                io.Combo.Input(
                    "model_source",
                    options=model_sources,
                    default="",
                    tooltip="Auto-detected from URL",
                ),
                # === HuggingFace fields (visible when source is huggingface) ===
                io.String.Input(
                    "hf_repo_id",
                    default="",
                    optional=True,
                    tooltip="Auto-filled from URL",
                ),
                io.String.Input(
                    "hf_filename",
                    default="",
                    optional=True,
                    tooltip="Auto-filled from URL",
                ),
                io.String.Input(
                    "hf_token",
                    default="",
                    optional=True,
                    tooltip="Optional: Required only for private repos or gated models",
                ),
                # === CivitAI fields (visible when source is civitai) ===
                io.String.Input(
                    "civitai_model_id",
                    default="",
                    optional=True,
                    tooltip="Auto-filled from URL (model version ID)",
                ),
                io.String.Input(
                    "civitai_api_key",
                    default="",
                    optional=True,
                    tooltip="Required: Get your API key from civitai.com/user/account",
                ),
                # === Custom URL fields (visible when source is custom) ===
                io.String.Input(
                    "custom_filename",
                    default="",
                    optional=True,
                    tooltip="Auto-filled from URL",
                ),
                io.String.Input(
                    "custom_hash",
                    default="",
                    optional=True,
                    tooltip="SHA256 hash (auto-filled after download)",
                ),
            ],
            outputs=[
                io.AnyType.Output("model_name", display_name="model_name"),
            ],
            is_output_node=True,
        )

    @classmethod
    def execute(
        cls,
        url: str = "",
        model_type: str = "checkpoints",
        subdirectory: str = "",
        force_download: bool = False,
        extract_archive: bool = False,
        model_source: str = "",
        hf_repo_id: str = "",
        hf_filename: str = "",
        hf_token: str = "",
        civitai_model_id: str = "",
        civitai_api_key: str = "",
        custom_filename: str = "",
        custom_hash: str = "",
        archive_model_filename: str = "",
        extracted_model_hash: str = "",
    ) -> io.NodeOutput:
        """
        Download a model from a variety of sources to the models directory.

        Args:
            url: The model URL (HuggingFace, CivitAI, or direct link)
            model_type: The type of the model (checkpoints, loras, vae, etc.)
            subdirectory: Optional subdirectory within the model type folder
            force_download: Force download and re-extraction even if files exist
            extract_archive: If True, extract the downloaded archive
            model_source: Auto-detected source (huggingface, civitai, custom)
            hf_repo_id: HuggingFace repository ID (auto-filled from URL)
            hf_filename: HuggingFace filename (auto-filled from URL)
            hf_token: HuggingFace auth token (optional)
            civitai_model_id: CivitAI model version ID (auto-filled from URL)
            civitai_api_key: CivitAI API key
            custom_filename: Custom filename for the downloaded file (auto-filled from URL)
            custom_hash: Custom file hash (optional, auto-filled after download)
            archive_model_filename: The model filename inside the archive
            extracted_model_hash: SHA256 hash of the extracted model (auto-populated)

        Returns:
            io.NodeOutput containing the name of the model file
        """
        context = get_executing_context()
        unique_id = context.node_id if context else None
        timeout = DOWNLOAD_TIMEOUT_SECONDS

        if not url:
            raise ValueError("URL is required. Please paste a model URL.")

        # Auto-detect source from URL if not already set
        if not model_source:
            model_source = cls._detect_source_from_url(url)

        # Parse URL based on detected source
        if model_source == ModelSource.HUGGINGFACE:
            parsed = cls._parse_huggingface_url(url)
            if parsed:
                if not hf_repo_id:
                    hf_repo_id = parsed.get("repo_id", "")
                if not hf_filename:
                    hf_filename = parsed.get("filename", "")
        elif model_source == ModelSource.CIVITAI:
            parsed = cls._parse_civitai_url(url)
            if parsed and not civitai_model_id:
                civitai_model_id = parsed.get("version_id", "")
        elif model_source == ModelSource.CUSTOM:
            if not custom_filename:
                custom_filename = cls._get_filename_from_url(url)

        # Normalize subdirectory
        subdir = subdirectory.strip() if subdirectory else ""

        match model_source:
            case ModelSource.HUGGINGFACE:
                return cls._download_from_huggingface(
                    model_type,
                    hf_repo_id,
                    hf_filename,
                    hf_token,
                    subdir,
                    force_download,
                    extract_archive,
                    archive_model_filename,
                    extracted_model_hash,
                    unique_id,
                    timeout,
                )
            case ModelSource.CIVITAI:
                return cls._download_from_civitai(
                    model_type,
                    civitai_model_id,
                    civitai_api_key,
                    subdir,
                    force_download,
                    extract_archive,
                    archive_model_filename,
                    extracted_model_hash,
                    unique_id,
                    timeout,
                )
            case ModelSource.CUSTOM:
                return cls._download_from_custom(
                    model_type,
                    url,
                    custom_filename,
                    custom_hash,
                    subdir,
                    force_download,
                    extract_archive,
                    archive_model_filename,
                    extracted_model_hash,
                    unique_id,
                    timeout,
                )
            case _:
                raise ValueError(f"Unknown model source: {model_source}")

    @classmethod
    def _download_from_huggingface(
        cls,
        model_type: str,
        repo_id: str,
        filename: str,
        token: str,
        subdirectory: str,
        force_download: bool,
        extract_archive: bool,
        archive_model_filename: str,
        extracted_model_hash: str,
        unique_id: str | None,
        timeout: int,
    ) -> io.NodeOutput:
        """
        Download a model from HuggingFace.

        Downloads directly to ComfyUI's model directory (no HF cache).
        Uses SHA256 hash comparison to skip download if file already exists.

        Args:
            model_type: The type of model (determines target directory)
            repo_id: HuggingFace repository ID (e.g., "stabilityai/sd-vae-ft-mse")
            filename: The filename in the repository
            token: HuggingFace auth token (optional, for private repos)
            subdirectory: Optional subdirectory within the model type folder
            force_download: If True, re-download and re-extract even if files exist
            extract_archive: If True, extract the downloaded archive
            archive_model_filename: The model filename inside the archive
            extracted_model_hash: SHA256 hash of the extracted model (for verification)
            unique_id: Node ID for updating input values
            timeout: Download timeout in seconds

        Returns:
            io.NodeOutput containing the model filename (extracted file if extract_archive,
            otherwise the downloaded file)
        """
        if not repo_id:
            raise ValueError("HuggingFace repo_id is required")
        if not filename:
            raise ValueError("HuggingFace filename is required")
        if extract_archive and not archive_model_filename:
            raise ValueError("archive_model_filename is required when extract_archive is enabled")

        # Extract just the filename (HF paths may include subdirectories)
        output_filename = Path(filename).name

        # Get all paths
        target_dir, target_path, final_model_path, model_name = cls._get_download_paths(
            model_type, output_filename, subdirectory, archive_model_filename if extract_archive else None
        )

        # Get remote file metadata to get the hash (ETag)
        file_url = hf_hub_url(repo_id=repo_id, filename=filename)
        metadata = get_hf_file_metadata(file_url, token=token if token else None)
        remote_hash = metadata.etag.strip('"') if metadata.etag else None

        # Check if archive file already exists and hash matches
        if target_path.exists() and not force_download:
            hash_matches = False
            if remote_hash:
                if len(remote_hash) == 64:
                    local_hash = cls._compute_file_hash(target_path)
                elif len(remote_hash) == 40:
                    prefix = f"blob {target_path.stat().st_size}\0".encode()
                    local_hash = cls._compute_file_hash(target_path, hash_func=hashlib.sha1, prefix=prefix)
                else:
                    local_hash = None

                hash_matches = local_hash and local_hash == remote_hash
                if hash_matches:
                    logger.info(f"File exists with matching hash: {output_filename}")
                else:
                    logger.info(f"Hash mismatch for {output_filename}, re-downloading")
            else:
                hash_matches = True
                logger.info(f"File already exists (no remote hash to verify): {output_filename}")

            if hash_matches:
                if extract_archive:
                    return cls._handle_extraction(
                        target_path, target_dir, final_model_path, model_name, extracted_model_hash, unique_id
                    )
                return io.NodeOutput(model_name)

        # Build download URL and download directly to target
        download_url = hf_hub_url(repo_id=repo_id, filename=filename)
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        logger.info(f"Downloading {repo_id}/{filename} from HuggingFace")
        cls._download_file(download_url, target_path, timeout, headers=headers)
        logger.info(f"Downloaded to {target_path}")

        # Extract if requested
        if extract_archive:
            return cls._handle_extraction(
                target_path,
                target_dir,
                final_model_path,
                model_name,
                extracted_model_hash,
                unique_id,
                force_extract=True,
            )

        return io.NodeOutput(model_name)

    @classmethod
    def _download_from_civitai(
        cls,
        model_type: str,
        model_id: str,
        api_key: str,
        subdirectory: str,
        force_download: bool,
        extract_archive: bool,
        archive_model_filename: str,
        extracted_model_hash: str,
        unique_id: str | None,
        timeout: int,
    ) -> io.NodeOutput:
        """
        Download a model from CivitAI.

        Uses the CivitAI REST API to get model version info and download the file.
        See: https://github.com/civitai/civitai/wiki/REST-API-Reference

        Args:
            model_type: The type of model (determines target directory)
            model_id: The CivitAI model version ID
            api_key: CivitAI API key (required for downloads)
            subdirectory: Optional subdirectory within the model type folder
            force_download: If True, re-download and re-extract even if files exist
            extract_archive: If True, extract the downloaded archive
            archive_model_filename: The model filename inside the archive
            extracted_model_hash: SHA256 hash of the extracted model (for verification)
            unique_id: Node ID for updating input values
            timeout: Download timeout in seconds

        Returns:
            io.NodeOutput containing the model filename (extracted file if extract_archive,
            otherwise the downloaded file)
        """
        if not model_id:
            raise ValueError("CivitAI model version ID is required")
        if not api_key:
            raise ValueError("CivitAI API key is required")
        if extract_archive and not archive_model_filename:
            raise ValueError("archive_model_filename is required when extract_archive is enabled")

        # Get model version info from CivitAI API
        api_url = f"{CIVITAI_API_BASE_URL}/model-versions/{model_id}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        response = requests.get(api_url, headers=headers, timeout=timeout)
        response.raise_for_status()

        version_info = response.json()

        # Get the primary file info from the response
        files = version_info.get("files", [])
        if not files:
            raise ValueError(f"No files found for CivitAI model version {model_id}")

        # Find the primary file, or fall back to first valid file
        primary_file = None
        fallback_file = None

        for file_info in files:
            name = file_info.get("name")
            url = file_info.get("downloadUrl")
            if name and url:
                if file_info.get("primary"):
                    primary_file = file_info
                    break
                elif fallback_file is None:
                    fallback_file = file_info

        selected_file = primary_file or fallback_file
        if not selected_file:
            raise ValueError(f"No valid file found for CivitAI model version {model_id}")

        filename = selected_file.get("name")
        download_url = selected_file.get("downloadUrl")
        file_hashes = selected_file.get("hashes", {})
        remote_hash = file_hashes.get("SHA256", "").lower()

        # Get all paths
        target_dir, filepath, final_model_path, model_name = cls._get_download_paths(
            model_type, filename, subdirectory, archive_model_filename if extract_archive else None
        )

        # Check if archive file exists with matching hash
        if filepath.exists() and not force_download:
            hash_matches = False
            if remote_hash:
                local_hash = cls._compute_file_hash(filepath)
                hash_matches = local_hash == remote_hash
                if hash_matches:
                    logger.info(f"File exists with matching SHA256 hash: {filename}")
                else:
                    logger.info(f"Hash mismatch for {filename}, re-downloading")
            else:
                hash_matches = True
                logger.info(f"File already exists (no remote hash to verify): {filename}")

            if hash_matches:
                if extract_archive:
                    return cls._handle_extraction(
                        filepath, target_dir, final_model_path, model_name, extracted_model_hash, unique_id
                    )
                return io.NodeOutput(model_name)

        # Download the file
        download_headers = {"Authorization": f"Bearer {api_key}"}

        logger.info(f"Downloading {filename} from CivitAI (version {model_id})")
        cls._download_file(download_url, filepath, timeout, headers=download_headers)
        logger.info(f"Downloaded to {filepath}")

        # Extract if requested
        if extract_archive:
            return cls._handle_extraction(
                filepath,
                target_dir,
                final_model_path,
                model_name,
                extracted_model_hash,
                unique_id,
                force_extract=True,
            )

        return io.NodeOutput(model_name)

    @classmethod
    def _download_from_custom(
        cls,
        model_type: str,
        url: str,
        filename: str,
        file_hash: str,
        subdirectory: str,
        force_download: bool,
        extract_archive: bool,
        archive_model_filename: str,
        extracted_model_hash: str,
        unique_id: str | None,
        timeout: int,
    ) -> io.NodeOutput:
        """
        Download a model from a custom URL.

        Args:
            model_type: The type of model (determines target directory)
            url: The URL to download from
            filename: The filename to save the downloaded file as
            file_hash: Optional SHA256 hash to check for existing files
            subdirectory: Optional subdirectory within the model type folder
            force_download: If True, re-download and re-extract even if files exist
            extract_archive: If True, extract the downloaded archive
            archive_model_filename: The model filename inside the archive
            extracted_model_hash: SHA256 hash of the extracted model (for verification)
            unique_id: Node ID for updating input values
            timeout: Download timeout in seconds

        Returns:
            io.NodeOutput containing the model filename (extracted file if extract_archive,
            otherwise the downloaded file)
        """
        if not url:
            raise ValueError("Custom URL is required")
        if extract_archive and not archive_model_filename:
            raise ValueError("archive_model_filename is required when extract_archive is enabled")

        # Extract filename from URL if not provided
        if not filename:
            filename = cls._get_filename_from_url(url)
            if not filename:
                raise ValueError("Could not extract filename from URL. Please provide a custom filename.")

        # Validate filename has a file extension
        file_ext = Path(filename).suffix.lower()
        if not file_ext:
            raise ValueError(
                f"The filename '{filename}' has no file extension. "
                f"This usually means the URL is a web page, not a direct download link. "
                f"Model files should have extensions like .safetensors, .pth, .ckpt, etc. "
                f"Please provide a 'custom_filename' with the correct extension, "
                f"or use a direct download URL."
            )

        # Validate extension based on whether this is an archive or direct model download
        if not extract_archive and file_ext not in folder_paths.supported_pt_extensions:
            raise ValueError(
                f"The filename '{filename}' has extension '{file_ext}' which is not a recognized model extension. "
                f"Supported model extensions: {', '.join(sorted(folder_paths.supported_pt_extensions))}. "
                f"If this is an archive file, enable 'extract_archive' and specify 'archive_model_filename'. "
                f"Otherwise, please verify you're using a direct download URL for a model file."
            )

        # Get all paths
        target_dir, filepath, final_model_path, model_name = cls._get_download_paths(
            model_type, filename, subdirectory, archive_model_filename if extract_archive else None
        )

        # Check if archive file already exists and hash was provided
        if filepath.exists() and not force_download and file_hash:
            existing_hash = cls._compute_file_hash(filepath)
            if existing_hash != file_hash.lower():
                raise ValueError(
                    f"Existing file hash does not match provided hash for {filename}. "
                    f"Expected {file_hash.lower()}, got {existing_hash}"
                )
            logger.info(f"File exists with matching hash: {filename}")
            if extract_archive:
                return cls._handle_extraction(
                    filepath, target_dir, final_model_path, model_name, extracted_model_hash, unique_id
                )
            return io.NodeOutput(model_name)
        if not file_hash:
            logger.info(f"No hash provided, downloading {filename}")

        logger.info(f"Downloading {url} to {filepath}")
        cls._download_file(url, filepath, timeout)
        logger.info(f"Downloaded to {filepath}")

        # Compute hash of downloaded file
        computed_hash = cls._compute_file_hash(filepath)
        logger.info(f"Downloaded file hash: {computed_hash}")

        # Update the node's hash input if we have a unique_id
        if unique_id and (not file_hash or file_hash != computed_hash):
            cls._update_node_input(unique_id, "custom_hash", computed_hash)

        # Extract if requested
        if extract_archive:
            return cls._handle_extraction(
                filepath,
                target_dir,
                final_model_path,
                model_name,
                extracted_model_hash,
                unique_id,
                force_extract=True,
            )

        return io.NodeOutput(model_name)

    @staticmethod
    def _get_model_directory(model_type: str) -> str:
        """Get the directory path for a model type."""
        if model_type not in folder_paths.folder_names_and_paths:
            raise ValueError(f"Unknown model type: {model_type}")

        paths, _ = folder_paths.folder_names_and_paths[model_type]
        return paths[0]

    @classmethod
    def _get_download_paths(
        cls, model_type: str, filename: str, subdirectory: str, archive_model_filename: str | None = None
    ) -> tuple[Path, Path, Path, str]:
        """
        Get all paths needed for downloading a model.

        Args:
            model_type: The type of model (determines base directory)
            filename: The filename to download
            subdirectory: Optional subdirectory within the model type folder
            archive_model_filename: If extracting, the model filename inside the archive

        Returns:
            tuple: (target_dir, filepath, final_model_path, model_name)
                - target_dir: Directory to save files (Path)
                - filepath: Full path to the downloaded file (Path)
                - final_model_path: Path to the final model file (Path)
                - model_name: The model name to return (str, includes subdir if set)
        """
        base_dir = Path(cls._get_model_directory(model_type))
        target_dir = base_dir / subdirectory if subdirectory else base_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        filepath = target_dir / filename
        final_filename = archive_model_filename if archive_model_filename else filename
        final_model_path = target_dir / final_filename
        model_name = f"{subdirectory}/{final_filename}" if subdirectory else final_filename

        return target_dir, filepath, final_model_path, model_name

    @staticmethod
    def _compute_file_hash(filepath: Path, hash_func=hashlib.sha256, prefix: bytes | None = None) -> str:
        """
        Compute hash of a file.

        Args:
            filepath: Path to the file
            hash_func: Hash function to use (default: hashlib.sha256)
            prefix: Optional prefix bytes to prepend (e.g., for git blob format)

        Returns:
            Hex digest of the hash
        """
        file_hash = hash_func()
        if prefix:
            file_hash.update(prefix)
        with filepath.open("rb") as f:
            for chunk in iter(lambda: f.read(CHUNK_SIZE_BYTES), b""):
                file_hash.update(chunk)
        return file_hash.hexdigest()

    @staticmethod
    def _download_file(url: str, filepath: Path, timeout: int, headers: dict | None = None) -> None:
        """
        Download a file from URL to filepath.

        Args:
            url: The URL to download from
            filepath: Path where the file will be saved
            timeout: Download timeout in seconds
            headers: Optional HTTP headers to include in the request

        Raises:
            ValueError: If URL returns HTML content instead of a file
            requests.HTTPError: If the download request fails
        """
        response = requests.get(url, stream=True, timeout=timeout, headers=headers)
        response.raise_for_status()

        # Check Content-Type to detect HTML responses
        content_type = response.headers.get("Content-Type", "").lower()
        if "text/html" in content_type:
            raise ValueError(
                f"URL returned HTML content instead of a model file. "
                f"The URL '{url}' appears to be a web page, not a direct download link. "
                f"Please use the direct download URL for the model file."
            )

        # Ensure directory exists
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Download and validate content
        first_chunk = None
        with filepath.open("wb") as f:
            for chunk in response.iter_content(chunk_size=CHUNK_SIZE_BYTES):
                if first_chunk is None:
                    first_chunk = chunk
                f.write(chunk)

        # Validate the downloaded content doesn't look like HTML
        if first_chunk:
            DownloadModelNode._validate_downloaded_content(first_chunk, filepath, url)

    @staticmethod
    def _get_filename_from_url(url: str) -> str | None:
        """
        Extract filename from URL.

        Args:
            url: The URL to extract filename from

        Returns:
            The filename extracted from the URL path, or None if extraction fails
        """
        try:
            parsed = urlparse(url)
            path = unquote(parsed.path)
            filename = Path(path).name
            if "?" in filename:
                filename = filename.split("?")[0]
            return filename if filename else None
        except Exception:
            return None

    @staticmethod
    def _detect_source_from_url(url: str) -> str:
        """
        Detect the model source from a URL.

        Args:
            url: The URL to analyze

        Returns:
            ModelSource.HUGGINGFACE, ModelSource.CIVITAI, or ModelSource.CUSTOM
        """
        try:
            parsed = urlparse(url)
            hostname = parsed.netloc.lower()

            if "huggingface.co" in hostname:
                return ModelSource.HUGGINGFACE
            elif "civitai.com" in hostname:
                return ModelSource.CIVITAI
            else:
                return ModelSource.CUSTOM
        except Exception:
            return ModelSource.CUSTOM

    @staticmethod
    def _validate_downloaded_content(first_chunk: bytes, filepath: Path, url: str) -> None:
        """
        Validate that downloaded content looks like a model file, not HTML or other invalid content.

        Args:
            first_chunk: First chunk of downloaded data
            filepath: Path where file was saved
            url: Original URL (for error messages)

        Raises:
            ValueError: If content appears to be invalid (HTML, etc.)
        """
        html_signatures = [
            b"<!DOCTYPE",
            b"<!doctype",
            b"<html",
            b"<HTML",
            b"<head",
            b"<HEAD",
        ]

        chunk_start = first_chunk[:256].lstrip()
        for sig in html_signatures:
            if chunk_start.startswith(sig):
                try:
                    filepath.unlink()
                except Exception:
                    pass
                raise ValueError(
                    f"Downloaded content appears to be an HTML page, not a model file. "
                    f"The URL '{url}' is likely a web page URL, not a direct download link. "
                    f"Please find the direct download URL for the model file."
                )

        if not filepath.suffix:
            logger.warning(f"Downloaded file has no extension: {filepath.name}. This may indicate an incorrect URL.")

        file_size = filepath.stat().st_size
        if file_size < 1024:
            content = filepath.read_bytes()
            for sig in html_signatures:
                if sig in content:
                    try:
                        filepath.unlink()
                    except Exception:
                        pass
                    raise ValueError(
                        f"Downloaded file is too small ({file_size} bytes) and contains HTML. "
                        f"The URL '{url}' likely returned an error page or redirect."
                    )

    @staticmethod
    def _parse_huggingface_url(url: str) -> dict | None:
        """
        Parse a HuggingFace URL to extract repo_id and filename.

        Supported URL formats:
        - https://huggingface.co/{org}/{repo}/resolve/main/{path/to/file}
        - https://huggingface.co/{org}/{repo}/blob/main/{path/to/file}
        - https://huggingface.co/{org}/{repo}/tree/main/{path/to/file}

        Args:
            url: The HuggingFace URL to parse

        Returns:
            dict with 'repo_id' and 'filename' keys, or None if parsing fails
        """
        try:
            parsed = urlparse(url)
            if "huggingface.co" not in parsed.netloc:
                return None

            path_parts = [p for p in parsed.path.split("/") if p]

            if len(path_parts) < 5:
                return None

            repo_id = f"{path_parts[0]}/{path_parts[1]}"

            if path_parts[2] not in ("resolve", "blob", "tree"):
                return None

            filename = "/".join(path_parts[4:])

            return {"repo_id": repo_id, "filename": filename}
        except Exception:
            return None

    @staticmethod
    def _parse_civitai_url(url: str) -> dict | None:
        """
        Parse a CivitAI URL to extract the model version ID.

        Supported URL formats:
        - https://civitai.com/models/{model_id}?modelVersionId={version_id}
        - https://civitai.com/models/{model_id}/{slug}?modelVersionId={version_id}
        - https://civitai.com/api/download/models/{version_id}

        Args:
            url: The CivitAI URL to parse

        Returns:
            dict with 'version_id' key, or None if parsing fails
        """
        try:
            parsed = urlparse(url)
            if "civitai.com" not in parsed.netloc:
                return None

            path = parsed.path

            api_match = re.match(r"/api/download/models/(\d+)", path)
            if api_match:
                return {"version_id": api_match.group(1)}

            if path.startswith("/models/"):
                query_params = parse_qs(parsed.query)
                if "modelVersionId" in query_params:
                    return {"version_id": query_params["modelVersionId"][0]}

                return None

            return None
        except Exception:
            return None

    @staticmethod
    def _update_node_input(unique_id: str, input_name: str, value: str) -> None:
        """
        Send a message to update a node's input value.

        Args:
            unique_id: The node's unique ID
            input_name: Name of the input field to update
            value: The new value to set
        """
        PromptServer.instance.send_sync(
            "rtx-remix-update-node-input",
            {
                "node_id": unique_id,
                "input_name": input_name,
                "value": value,
            },
        )

    @classmethod
    def _check_extracted_model_hash(cls, final_model_path: Path, extracted_model_hash: str) -> bool:
        """
        Check if the extracted model exists and its hash matches.

        Args:
            final_model_path: Path to the extracted model file
            extracted_model_hash: Expected SHA256 hash of the extracted model

        Returns:
            True if file exists and hash matches, False otherwise
        """
        if not final_model_path.exists():
            return False
        if not extracted_model_hash:
            return False
        local_hash = cls._compute_file_hash(final_model_path)
        return local_hash == extracted_model_hash.lower()

    @classmethod
    def _extract_and_store_hash(
        cls, archive_path: Path, target_dir: Path, final_model_path: Path, unique_id: str | None
    ) -> bool:
        """
        Extract archive and store the hash of the extracted model.

        Args:
            archive_path: Path to the archive file
            target_dir: Directory to extract to
            final_model_path: Path to the expected extracted model file
            unique_id: Node ID for updating the hash input (can be None)

        Returns:
            True if extraction was successful
        """
        success = cls._extract_archive(archive_path, target_dir)
        if success and final_model_path.exists() and unique_id:
            new_hash = cls._compute_file_hash(final_model_path)
            cls._update_node_input(unique_id, "extracted_model_hash", new_hash)
        return success

    @classmethod
    def _handle_extraction(
        cls,
        archive_path: Path,
        target_dir: Path,
        final_model_path: Path,
        final_model_filename: str,
        extracted_model_hash: str,
        unique_id: str | None,
        force_extract: bool = False,
    ) -> io.NodeOutput:
        """
        Handle the extraction logic with hash verification.

        Args:
            archive_path: Path to the archive file
            target_dir: Directory to extract to
            final_model_path: Path to the expected extracted model file
            final_model_filename: Filename of the extracted model (for logging)
            extracted_model_hash: Expected hash of the extracted model
            unique_id: Node ID for updating the hash input
            force_extract: If True, always re-extract

        Returns:
            io.NodeOutput containing the filename of the extracted model
        """
        if not force_extract:
            if cls._check_extracted_model_hash(final_model_path, extracted_model_hash):
                logger.info(f"Extracted model exists with matching hash: {final_model_filename}")
                return io.NodeOutput(final_model_filename)
            if final_model_path.exists():
                logger.info("Extracted model hash mismatch, re-extracting")

        cls._extract_and_store_hash(archive_path, target_dir, final_model_path, unique_id)
        return io.NodeOutput(final_model_filename)

    @staticmethod
    def _extract_archive(filepath: Path, target_dir: Path) -> bool:
        """
        Extract an archive to the target directory.

        Supports zip and tar archives (including compressed variants).
        The archive file is kept for hash verification.

        Args:
            filepath: Path to the archive file
            target_dir: Directory to extract files into

        Returns:
            True if extraction was successful, False otherwise
        """
        try:
            if zipfile.is_zipfile(filepath):
                logger.info(f"Extracting zip archive: {filepath.name}")
                with zipfile.ZipFile(filepath, "r") as zf:
                    zf.extractall(target_dir)
                return True
            elif tarfile.is_tarfile(filepath):
                logger.info(f"Extracting tar archive: {filepath.name}")
                with tarfile.open(filepath, "r:*") as tf:
                    tf.extractall(target_dir)
                return True
            else:
                logger.warning(f"Unsupported archive format: {filepath.name}")
                return False
        except Exception as e:
            logger.error(f"Failed to extract archive {filepath.name}: {e}")
            return False

    @classmethod
    def fingerprint_inputs(cls, **kwargs) -> Any:
        """
        Always return NaN to force re-execution.

        The execute method handles file existence checks and early returns,
        so this node needs to run each time to perform those checks.
        """
        return float("nan")
