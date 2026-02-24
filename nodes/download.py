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
from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import requests
from huggingface_hub import get_hf_file_metadata, hf_hub_url

import folder_paths
from comfy_execution.utils import get_executing_context
from comfy_execution.progress import get_progress_state
from comfy_api.latest import io
from comfy.model_management import processing_interrupted, InterruptProcessingException
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

# Sample size for sparse hashing (64KB from each section)
_SPARSE_HASH_SAMPLE_SIZE = 64 * 1024

# In-memory cache: maps (filepath, sparse_hash) -> full_hash
# This avoids recomputing full hashes within a session
_hash_cache: dict[tuple[str, str], str] = {}


@dataclass
class DownloadInfo:
    """Information needed to download a file from any source."""
    url: str
    filename: str
    headers: dict[str, str] | None = None
    remote_hash: str | None = None  # SHA256 hash from the source (if available)


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
                # === Hash verification (common to all sources) ===
                io.String.Input(
                    "file_hash",
                    default="",
                    optional=True,
                    tooltip="SHA256 hash of the file (auto-filled after download, used to verify integrity)",
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
        file_hash: str = "",
        model_source: str = "",
        hf_repo_id: str = "",
        hf_filename: str = "",
        hf_token: str = "",
        civitai_model_id: str = "",
        civitai_api_key: str = "",
        custom_filename: str = "",
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
            file_hash: SHA256 hash of the file (auto-filled after download, used to verify integrity)
            model_source: Auto-detected source (huggingface, civitai, custom)
            hf_repo_id: HuggingFace repository ID (auto-filled from URL)
            hf_filename: HuggingFace filename (auto-filled from URL)
            hf_token: HuggingFace auth token (optional)
            civitai_model_id: CivitAI model version ID (auto-filled from URL)
            civitai_api_key: CivitAI API key
            custom_filename: Custom filename for the downloaded file (auto-filled from URL)
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

        if extract_archive and not archive_model_filename:
            raise ValueError("archive_model_filename is required when extract_archive is enabled")

        # Auto-detect source from URL if not already set
        if not model_source:
            model_source = cls._detect_source_from_url(url)

        # Get download info from the appropriate source
        download_info = cls._get_download_info(
            model_source=model_source,
            url=url,
            hf_repo_id=hf_repo_id,
            hf_filename=hf_filename,
            hf_token=hf_token,
            civitai_model_id=civitai_model_id,
            civitai_api_key=civitai_api_key,
            custom_filename=custom_filename,
            timeout=timeout,
        )

        # Normalize subdirectory
        subdir = subdirectory.strip() if subdirectory else ""

        # Get all paths
        target_dir, target_path, final_model_path, model_name = cls._get_download_paths(
            model_type, download_info.filename, subdir, archive_model_filename if extract_archive else None
        )

        # === PHASE 1: Check if we already have the file with matching hash ===
        if file_hash and target_path.exists() and not force_download:
            local_hash = cls._compute_file_hash(target_path)
            if local_hash == file_hash:
                logger.info(f"File exists with matching hash: {download_info.filename}")
                if extract_archive:
                    return cls._handle_extraction(
                        target_path, target_dir, final_model_path, model_name, extracted_model_hash, unique_id
                    )
                return io.NodeOutput(model_name)
            else:
                logger.info(f"Hash mismatch for {download_info.filename}, re-downloading")

        # === PHASE 2: Check against remote hash (if no local hash provided) ===
        if not file_hash and target_path.exists() and not force_download:
            if download_info.remote_hash:
                local_hash = cls._compute_file_hash(target_path)
                if local_hash == download_info.remote_hash:
                    logger.info(f"File exists with matching remote hash: {download_info.filename}")
                    # Store hash for future runs
                    if unique_id:
                        cls._update_node_input(unique_id, "file_hash", local_hash)
                    if extract_archive:
                        return cls._handle_extraction(
                            target_path, target_dir, final_model_path, model_name, extracted_model_hash, unique_id
                        )
                    return io.NodeOutput(model_name)
                else:
                    logger.info(f"Hash mismatch for {download_info.filename}, re-downloading")
            else:
                # No hash to verify against - accept existing file
                logger.info(f"File already exists (no hash to verify): {download_info.filename}")
                # Compute and store hash for future runs
                if unique_id:
                    local_hash = cls._compute_file_hash(target_path)
                    cls._update_node_input(unique_id, "file_hash", local_hash)
                if extract_archive:
                    return cls._handle_extraction(
                        target_path, target_dir, final_model_path, model_name, extracted_model_hash, unique_id
                    )
                return io.NodeOutput(model_name)

        # === PHASE 3: Download the file ===
        logger.info(f"Downloading {download_info.filename} from {model_source}")
        cls._download_file(download_info.url, target_path, timeout, headers=download_info.headers, node_id=unique_id)
        logger.info(f"Downloaded to {target_path}")

        # === PHASE 4: Verify hash (if provided) ===
        computed_hash = cls._compute_file_hash(target_path)

        if file_hash:
            if computed_hash != file_hash:
                # Delete the file since it doesn't match
                try:
                    target_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete file with hash mismatch: {target_path}: {e}")
                raise ValueError(
                    f"Downloaded file hash does not match expected hash for {download_info.filename}. "
                    f"Expected: {file_hash}, Got: {computed_hash}. "
                    f"The file may have been modified on the server or the hash is incorrect."
                )
        else:
            # Store computed hash for future runs
            if unique_id:
                cls._update_node_input(unique_id, "file_hash", computed_hash)

        # === PHASE 5: Handle extraction if needed ===
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
    def _get_download_info(
        cls,
        model_source: str,
        url: str,
        hf_repo_id: str,
        hf_filename: str,
        hf_token: str,
        civitai_model_id: str,
        civitai_api_key: str,
        custom_filename: str,
        timeout: int,
    ) -> DownloadInfo:
        """
        Get download information from the appropriate source.

        This method handles source-specific logic to obtain the download URL,
        filename, headers, and remote hash. The actual download is handled
        by the common _download_file method.

        Returns:
            DownloadInfo containing url, filename, headers, and optional remote_hash
        """
        match model_source:
            case ModelSource.HUGGINGFACE:
                return cls._get_huggingface_download_info(url, hf_repo_id, hf_filename, hf_token)
            case ModelSource.CIVITAI:
                return cls._get_civitai_download_info(civitai_model_id, civitai_api_key, timeout)
            case ModelSource.CUSTOM:
                return cls._get_custom_download_info(url, custom_filename)
            case _:
                raise ValueError(f"Unknown model source: {model_source}")

    @classmethod
    def _get_huggingface_download_info(
        cls, url: str, repo_id: str, filename: str, token: str
    ) -> DownloadInfo:
        """Get download info for a HuggingFace model."""
        # Parse URL if repo_id/filename not provided
        if not repo_id or not filename:
            parsed = cls._parse_huggingface_url(url)
            if not parsed:
                raise ValueError("Unable to parse the HuggingFace URL")
            repo_id = repo_id or parsed.get("repo_id", "")
            filename = filename or parsed.get("filename", "")

        if not repo_id:
            raise ValueError("HuggingFace repo_id is required")
        if not filename:
            raise ValueError("HuggingFace filename is required")

        # Build download URL
        download_url = hf_hub_url(repo_id=repo_id, filename=filename)

        # Get remote hash from metadata
        remote_hash = None
        try:
            file_url = hf_hub_url(repo_id=repo_id, filename=filename)
            metadata = get_hf_file_metadata(file_url, token=token if token else None)
            if metadata.etag:
                etag = metadata.etag.strip('"')
                # Only use SHA256 hashes (64 chars), not git blob hashes (40 chars)
                if len(etag) == 64:
                    remote_hash = etag
        except Exception as e:
            logger.debug(f"Could not get HuggingFace metadata: {e}")

        # Build headers
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        # Extract just the filename (HF paths may include subdirectories)
        output_filename = Path(filename).name

        return DownloadInfo(
            url=download_url,
            filename=output_filename,
            headers=headers if headers else None,
            remote_hash=remote_hash,
        )

    @classmethod
    def _get_civitai_download_info(
        cls, model_id: str, api_key: str, timeout: int
    ) -> DownloadInfo:
        """Get download info for a CivitAI model."""
        if not model_id:
            raise ValueError("CivitAI model version ID is required")
        if not api_key:
            raise ValueError("CivitAI API key is required")

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
        selected_file = None
        for file_info in files:
            if file_info.get("name") and file_info.get("downloadUrl"):
                if file_info.get("primary"):
                    selected_file = file_info
                    break
                elif selected_file is None:
                    selected_file = file_info

        if not selected_file:
            raise ValueError(f"No valid file found for CivitAI model version {model_id}")

        filename = selected_file.get("name")
        download_url = selected_file.get("downloadUrl")
        file_hashes = selected_file.get("hashes", {})
        remote_hash = file_hashes.get("SHA256", "").lower() or None

        return DownloadInfo(
            url=download_url,
            filename=filename,
            headers={"Authorization": f"Bearer {api_key}"},
            remote_hash=remote_hash,
        )

    @classmethod
    def _get_custom_download_info(cls, url: str, filename: str) -> DownloadInfo:
        """Get download info for a custom URL."""
        if not url:
            raise ValueError("Custom URL is required")

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

        return DownloadInfo(
            url=url,
            filename=filename,
            headers=None,
            remote_hash=None,
        )

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
    def _compute_sparse_hash(filepath: Path) -> str:
        """
        Compute a fast sparse hash by sampling portions of a file.

        Samples the first 64KB, middle 64KB, last 64KB, and combines with file size.
        This is much faster than hashing the entire file while still being reliable
        for detecting different files or modifications.

        Args:
            filepath: Path to the file

        Returns:
            Hex digest of the sparse hash
        """
        stat = filepath.stat()
        file_size = stat.st_size
        sample_size = _SPARSE_HASH_SAMPLE_SIZE

        hasher = hashlib.sha256()
        # Include file size in hash
        hasher.update(file_size.to_bytes(8, byteorder="big"))

        with filepath.open("rb") as f:
            # Sample from beginning
            hasher.update(f.read(sample_size))

            # Sample from middle (if file is large enough)
            if file_size > sample_size * 3:
                middle_pos = (file_size - sample_size) // 2
                f.seek(middle_pos)
                hasher.update(f.read(sample_size))

            # Sample from end (if file is large enough)
            if file_size > sample_size * 2:
                f.seek(-sample_size, 2)  # Seek from end
                hasher.update(f.read(sample_size))

        return hasher.hexdigest()

    @staticmethod
    def _compute_file_hash(filepath: Path, hash_func=hashlib.sha256, prefix: bytes | None = None) -> str:
        """
        Compute hash of a file with in-memory caching using sparse hash validation.

        Uses a sparse hash (sampling beginning, middle, end) to quickly validate
        if a cached full hash is still valid. The full hash is only recomputed
        if the sparse hash changes or no cache exists.

        Note: Persistent storage of the hash is handled by the node's file_hash field.
        This cache just avoids recomputing within a session.

        Args:
            filepath: Path to the file
            hash_func: Hash function to use (default: hashlib.sha256)
            prefix: Optional prefix bytes to prepend (e.g., for git blob format)

        Returns:
            Hex digest of the hash
        """
        file_size = filepath.stat().st_size

        # For standard sha256 without prefix, use the in-memory cache
        if hash_func == hashlib.sha256 and prefix is None:
            # Compute sparse hash for quick validation
            sparse_hash = DownloadModelNode._compute_sparse_hash(filepath)
            cache_key = (str(filepath), sparse_hash)

            # Check in-memory cache
            cached_hash = _hash_cache.get(cache_key)
            if cached_hash is not None:
                logger.debug(f"Using cached hash for {filepath.name}")
                return cached_hash

            # Compute full hash
            logger.info(f"Computing hash for {filepath.name} ({file_size / (1024*1024):.1f} MB)...")
            file_hash = hash_func()
            with filepath.open("rb") as f:
                for chunk in iter(lambda: f.read(CHUNK_SIZE_BYTES), b""):
                    file_hash.update(chunk)
            computed_hash = file_hash.hexdigest()

            # Save to in-memory cache
            _hash_cache[cache_key] = computed_hash

            return computed_hash

        # Non-standard hash (e.g., with prefix for HF git blob format) - no caching
        file_hash = hash_func()
        if prefix:
            file_hash.update(prefix)
        with filepath.open("rb") as f:
            for chunk in iter(lambda: f.read(CHUNK_SIZE_BYTES), b""):
                file_hash.update(chunk)
        return file_hash.hexdigest()

    @staticmethod
    def _download_file(
        url: str, filepath: Path, timeout: int, headers: dict | None = None, node_id: str | None = None
    ) -> None:
        """
        Download a file from URL to filepath with progress logging and UI updates.

        Args:
            url: The URL to download from
            filepath: Path where the file will be saved
            timeout: Download timeout in seconds
            headers: Optional HTTP headers to include in the request
            node_id: Optional node ID for progress updates in the UI

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

        # Get total file size if available
        total_size = int(response.headers.get("Content-Length", 0))
        downloaded_size = 0
        last_logged_percent = -1

        # Send initial progress
        if node_id and total_size > 0:
            get_progress_state().update_progress(node_id=node_id, value=0, max_value=total_size)

        # Download and validate content
        first_chunk = None
        try:
            with filepath.open("wb") as f:
                for chunk in response.iter_content(chunk_size=CHUNK_SIZE_BYTES):
                    # Check if user cancelled the prompt
                    if processing_interrupted():
                        raise InterruptProcessingException()

                    if first_chunk is None:
                        first_chunk = chunk
                    f.write(chunk)
                    downloaded_size += len(chunk)

                    # Update progress every 10%
                    if total_size > 0:
                        percent = int((downloaded_size / total_size) * 100)
                        if percent >= last_logged_percent + 10:
                            last_logged_percent = (percent // 10) * 10
                            downloaded_mb = downloaded_size / (1024 * 1024)
                            total_mb = total_size / (1024 * 1024)
                            logger.info(f"Downloading: {downloaded_mb:.1f} MB / {total_mb:.1f} MB ({last_logged_percent}%)")

                            # Update UI progress bar
                            if node_id:
                                get_progress_state().update_progress(
                                    node_id=node_id,
                                    value=downloaded_size,
                                    max_value=total_size,
                                )
        except InterruptProcessingException:
            # Clean up partial file on cancellation
            logger.info("Download cancelled by user")
            try:
                if filepath.exists():
                    filepath.unlink()
                    logger.info(f"Deleted partial download: {filepath.name}")
            except Exception as e:
                logger.warning(f"Failed to delete partial download {filepath.name}: {e}")
            raise

        # Log completion and update UI
        if total_size > 0:
            total_mb = total_size / (1024 * 1024)
            logger.info(f"Download complete: {total_mb:.1f} MB (100%)")
            if node_id:
                get_progress_state().update_progress(node_id=node_id, value=total_size, max_value=total_size)
        else:
            downloaded_mb = downloaded_size / (1024 * 1024)
            logger.info(f"Download complete: {downloaded_mb:.1f} MB")

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
                except Exception as e:
                    logger.warning(f"Failed to delete invalid HTML file: {filepath}: {e}")
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
                    except Exception as e:
                        logger.warning(f"Failed to delete invalid HTML file: {filepath}: {e}")
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
        Return a stable fingerprint based on inputs to enable caching.

        When all the inputs that affect the output are the same, ComfyUI can
        skip re-execution entirely. This avoids expensive network calls and
        hash computations on every run.

        The fingerprint includes all inputs that determine the final model file.
        If force_download is True, we return NaN to force re-execution.
        """
        # If force_download is enabled, always re-execute
        if kwargs.get("force_download", False):
            return float("nan")

        # Return a tuple of all inputs that affect the output
        return (
            kwargs.get("url", ""),
            kwargs.get("model_type", ""),
            kwargs.get("subdirectory", ""),
            kwargs.get("model_source", ""),
            kwargs.get("extract_archive", False),
            kwargs.get("archive_model_filename", ""),
            # Include hashes - these are the "lock" for safe distribution
            kwargs.get("file_hash", ""),
            kwargs.get("extracted_model_hash", ""),
            # Source-specific fields
            kwargs.get("hf_repo_id", ""),
            kwargs.get("hf_filename", ""),
            kwargs.get("civitai_model_id", ""),
            kwargs.get("custom_filename", ""),
        )
