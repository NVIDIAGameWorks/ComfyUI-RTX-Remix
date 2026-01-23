![RTX Remix Icon](https://media.githubusercontent.com/media/NVIDIAGameWorks/ComfyUI-RTX-Remix/refs/tags/2.0.2/web/resources/images/remix_icon.png) 
 
# **NVIDIA RTX Remix Nodes** (*ComfyUI-RTX_Remix*)

ComfyUI custom nodes for creating AI texture processing workflows that integrate seamlessly with the NVIDIA RTX Remix Toolkit.

> [!NOTE]  
> The RTX Remix Toolkit Integration is currently a work in progress and is not yet ready for production use.
> Beta releases may be available for testing and feedback on the [RTX Remix Toolkit GitHub repository](https://github.com/NVIDIAGameWorks/toolkit-remix).
> If not, please check back later or contact the NVIDIA RTX Remix team on the [RTX Remix Showcase Discord server](https://discord.gg/c7J6gUhXMk).

## Installation

### Simple (Recommended)

1. Open ComfyUI Manager
2. Search for "RTX Remix" or "comfyui-rtx_remix"
3. Click **Install** and restart ComfyUI

### Advanced

1. Navigate to your `/ComfyUI/custom_nodes/` folder
2. Git clone this repo: `git clone https://github.com/NVIDIA/ComfyUI-RTX_Remix.git comfyui-rtx_remix`
3. Navigate to your `comfyui-rtx_remix` folder and run `install.bat` (Windows) or `install.sh` (Linux/Mac)
4. Restart ComfyUI

## Requirements

- **ComfyUI `v0.3.48` or newer**. Nodes V3 support was introduced in [`v0.3.48`](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.3.48), and this pack uses the V3 schema API.

## Multiple Approaches to Use These Nodes

This node pack provides two distinct approaches for integrating ComfyUI with the RTX Remix Toolkit.

Choose the one that fits your needs.

Mixing approaches is also _possible_ but **not recommended**.

### Integration Workflows (Recommended)

**Best for:** Most users who want to use AI texture processing in the RTX Remix Toolkit

**How it works:** The RTX Remix Toolkit controls ComfyUI. ComfyUI handles only the AI processing part - it receives image paths and parameters from the RTX Remix Toolkit, processes them, and returns the output file paths.

**Key benefits:**

- Simple to set up and use: Tag your inputs and outputs, export the workflow, and the RTX Remix Toolkit will discover the workflow automatically.
- Works directly from within the RTX RemixToolkit interface: Queue up jobs and set the workflow input values directly from the RTX Remix Toolkit interface.
- Easy workflow development and iteration: use standard ComfyUI nodes like `Load Image` to test your workflow without the RTX Remix Toolkit running

👉 **[Jump to Integration Workflow Guide](#integration-workflow-guide)**

### REST API Workflows (Advanced)

**Best for:** Advanced users building complex workflows that require programmatic control of the RTX Remix Toolkit

**How it works:** ComfyUI controls the RTX Remix Toolkit remotely. You build comprehensive workflows that include layer management, texture ingestion, edit target selection, and asset manipulation - all controlled from within ComfyUI.

**Key benefits:**

- Full programmatic control over the RTX Remix Toolkit
- Build custom automation and complex workflows
- Suitable for unique use cases not supported by the integration approach

**Requirements:**

- Understanding of the RTX Remix Toolkit project structure and USD concepts
- More complex workflow setup with logic nodes
- Manual REST API configuration
- The RTX Remix Toolkit must be running and in the correct state during development and testing

👉 **[Jump to REST API Nodes Reference](#rest-api-nodes-advanced)**

---

## Integration Workflow Guide

The integration workflow system allows the RTX Remix Toolkit to execute your ComfyUI workflows without manual intervention. This is the recommended approach for most users.

### How It Works

The integration workflow system consists of three key steps:

1. **Build your workflow** - Create a ComfyUI workflow for AI texture processing
2. **Tag inputs and outputs** - Mark which inputs/outputs the RTX Remix Toolkit should control
3. **Export the workflow** - Save the workflow for the RTX Remix Toolkit to use

Once exported, your workflow can be selected and run directly from within the RTX Remix Toolkit, which will:

- Provide input texture paths and parameters to tagged input slots
- Execute your workflow in ComfyUI
- Collect output file paths from ComfyUI's output history for tagged output nodes
- Automatically ingest the processed textures/meshes from those file paths
- Automatically apply the processed assets back to your mod

**Important:** In this approach, ComfyUI only performs the AI processing. The RTX Remix Toolkit handles all project management, asset selection, layer organization, and texture replacement.

### Step 1: Build Your Workflow

Create your ComfyUI workflow as you normally would. You can use any nodes available in ComfyUI for loading, processing, and generating textures.

**Recommended Node:** It's highly recommended to use **RTX Remix Save Texture** nodes to save your processed textures. While not strictly required, this node provides important benefits:

- Saves textures to the ComfyUI output directory
- Supports PNG and EXR file formats
- Handles linear and sRGB colorspace conversion
- Automatically organizes outputs per job (or timestamp when execution is not triggered by the RTX Remix Toolkit)
- **Specifies texture type metadata** - Without this, if your workflow outputs multiple textures (e.g., albedo, normal, roughness), the RTX Remix Toolkit may not know which texture map to use for which shader input

**Alternative:** You can use standard ComfyUI save nodes (like `Save Image`). If you output multiple textures, you'll need to manually configure texture type metadata for each output in the export dialog (expand the metadata section for each output to set texture types like albedo, normal, roughness, etc.) to ensure the RTX Remix Toolkit correctly matches outputs to shader inputs.

**Tip:** Use standard ComfyUI nodes for image processing, model loading, and AI processing. The RTX Remix Toolkit integration works with any workflow structure.

**Development workflow:** Integration workflows are easy to develop and test. Since they use standard ComfyUI nodes (plus the RTX Remix pack for tagging), you can iterate quickly:

- Use `Load Image` nodes to test with sample textures without the RTX Remix Toolkit running
- Develop and refine your AI processing pipeline entirely within ComfyUI
- Once satisfied, simply tag the inputs/outputs and export for use in the RTX Remix Toolkit
- No need to modify your workflow between development and production use

### Step 2: Tag Inputs and Outputs

Tagging tells the RTX Remix Toolkit which parts of your workflow should receive input data and which nodes produce the final outputs.

#### Tagging Input Slots

Input slots are connection points on nodes that can receive data from the RTX Remix Toolkit when the workflow is executed.

**To tag an input slot:**

1. Right-click on a node with input slots
2. Select **"Tag for RTX Remix"** → **"Inputs"**
3. Choose the input slot(s) you want to tag
4. Tagged slots will display a **green circle** indicator

**Batch tagging:** Select multiple nodes, then tag a slot. The same slot will be tagged on all compatible selected nodes.

**Supported input types:**

Any type that can be serialized to a primitive is supported, including:

- `STRING` - For text parameters (file paths, names, configuration values, prompts, etc.)
- `INT` - For integer parameters (resolution, iterations, seed values, etc.)
- `FLOAT` - For decimal parameters (scale factors, strength values, etc.)
- `BOOLEAN` - For true/false flags (enable/disable features)
- And other primitive-serializable types supported by ComfyUI

#### Tagging Output Nodes

Output nodes are the final nodes in your workflow that produce the textures/meshes the RTX Remix Toolkit should collect.

**Important:** Output nodes must **save one or more file(s) to disk** (e.g., images, textures, meshes). The RTX Remix Toolkit retrieves the output file paths from ComfyUI's output history, so any node that saves files will work.

**To tag an output node:**

1. Right-click on a node that saves files - e.g., `RTX Remix Save Texture`, `Save Image`, or any other save node
2. Select **"Tag for RTX Remix"** → **"Output"**
3. The entire node will display a **green outline**

**Recommended:** Use `RTX Remix Save Texture` nodes as outputs. These nodes:

- Save the texture to disk (the RTX Remix Toolkit retrieves the file path from ComfyUI's output history)
- Include texture type metadata (albedo, normal, roughness, etc.) that helps the RTX Remix Toolkit correctly match textures to shader inputs
- If you output multiple texture types from a single workflow, this metadata is essential for proper assignment

**Alternative:** You can tag other save nodes (like `Save Image`). If you output multiple textures, you'll need to manually configure texture type metadata for each output in the export dialog (expand the metadata section for each output to set texture types like albedo, normal, roughness, etc.) to ensure the RTX Remix Toolkit correctly matches outputs to shader inputs.

#### Visual Indicators

- **Green circles** on input slots = Tagged input
- **Green outline** around entire node = Tagged output (must save files to disk)

### Step 3: Export the Workflow

Once you've tagged your inputs and outputs, export the workflow for use in the RTX Remix Toolkit.

**To export:**

1. Right-click on the canvas (not on a node)
2. Select **"Export Workflow for RTX Remix"**
3. In the export dialog, you'll see:
   - All tagged input slots listed with their metadata
   - All tagged output nodes listed with their metadata
   - Options to edit export names and RTX Remix types
   - Additional metadata fields (description, min/max values, texture types for outputs, etc.)
4. Configure texture types for outputs if needed (especially important when using standard save nodes instead of `RTX Remix Save Texture`)
5. Enter a filename for your workflow
6. Click **"Export"**

The exported workflow is saved to the `user/rtx-remix/workflows/` and `user/rtx-remix/api_workflows/` directories in the ComfyUI installation and includes:

- **API Workflow** (`user/rtx-remix/api_workflows/`) - A runtime-executable format enriched with RTX Remix metadata that the RTX Remix Toolkit uses to execute the workflow
- **Full Workflow** (`user/rtx-remix/workflows/`) - The complete workflow with all node configurations and tagged metadata - use this to open and edit the workflow in ComfyUI

**Export Dialog Features:**

- **Edit export names** - Change how parameters appear in the RTX Remix Toolkit
- **Change RTX Remix types** - Specify how the RTX Remix Toolkit interprets each input/output
- **Set texture types for outputs** - Configure which texture map type each output represents (albedo, normal, roughness, etc.) - essential for proper shader input matching when using multiple outputs
- **Add descriptions** - Provide user guidance for each parameter
- **Set value ranges** - Define min/max constraints for numeric inputs
- **Reorder inputs/outputs** - Drag and drop rows to change the order
- **Expand metadata** - Click the chevron to see and edit additional fields

### Using Your Workflow in the RTX Remix Toolkit

After exporting, your workflow becomes available in the RTX Remix Toolkit's workflow selection menu. When you run the workflow from the RTX Remix Toolkit, it will:

1. Read your workflow's tagged inputs and display them as configurable parameters in the UI
2. Provide input data to the tagged input slots when the workflow executes
3. Execute the workflow in ComfyUI
4. Monitor tagged output nodes for completion
5. Retrieve the output file paths from ComfyUI's output history
6. Automatically import the processed textures/meshes from those file paths into your mod

**How data flows:**

- **Inputs:** The RTX Remix Toolkit provides image data, file paths, and parameter values to your tagged input slots
- **Processing:** ComfyUI performs all the AI processing (upscaling, PBR generation, style transfer, etc.)
- **Outputs:** Your workflow saves textures/meshes to disk (e.g., using `RTX Remix Save Texture` or `Save Image` nodes)
- **Integration:** The RTX Remix Toolkit retrieves the output file paths from ComfyUI's output history and imports the processed assets into your project

### Integration Workflow Nodes

#### RTX Remix Download Model

Download models directly into ComfyUI's models directory from HuggingFace, CivitAI, or a direct URL.

**Purpose:** Fetch model files during workflow setup or testing without leaving ComfyUI. Improves workflow portability by pairing template JSON workflows with ComfyUI Manager so missing node packs and models install without manual file browsing.

**Dynamic inputs:** This node is dynamic and will automatically show/hide inputs based on the detected source and options (e.g., enabling archive extraction or selecting HuggingFace/CivitAI/custom).

**Inputs:**

- `url` (STRING) - Model URL (HuggingFace, CivitAI, or direct link)
- `model_type` - Target model folder (checkpoints, loras, vae, etc.)
- `subdirectory` - Optional subfolder within the model type directory
- `force_download` - Re-download even if the file exists
- `extract_archive` - Extract if the download is a zip/tar archive
- `archive_model_filename` - Filename inside the archive (optional)
- `extracted_model_hash` - SHA256 hash of extracted model (optional)
- `model_source` - Auto-detected source (HuggingFace/CivitAI/custom)
- `hf_repo_id` - HuggingFace repository ID (auto-filled from URL)
- `hf_filename` - HuggingFace filename (auto-filled from URL)
- `hf_token` - HuggingFace token (optional, for gated models)
- `civitai_model_id` - CivitAI model version ID (auto-filled from URL)
- `civitai_api_key` - CivitAI API key (optional, for restricted downloads)
- `custom_filename` - Custom filename (auto-filled from URL)
- `custom_hash` - SHA256 hash for direct/custom downloads (auto-filled after download)

**Outputs:**

- `model_name` (ANY) - The saved model filename

**Compatibility note:**

The `model_name` output is `ANY` and is compatible with most model loading nodes. It connects directly to load node inputs and will download the model if missing, otherwise it uses the local file.

**Features:**

- Auto-detects source from URL (HuggingFace/CivitAI/custom)
- Supports API tokens/keys when required

**Category:** `RTX Remix`

#### RTX Remix Save Texture

The recommended node for integration workflows. This node provides the cleanest integration experience, especially for workflows that output multiple texture types.

**Purpose:** Save processed textures to disk in a format and location that the RTX Remix Toolkit can use, with proper texture type metadata.

**Inputs:**

- `textures` (IMAGE) - The texture image to save
- `texture_type` - Type of texture (albedo, roughness, normal, metallic, etc.)
- `file_extension` - Format to save (.png or .exr)
- `colorspace` - Color space (linear or sRGB)

**Outputs:**

- `file_path` (STRING) - Path to the saved texture file(s)

**Features:**

- Automatically creates timestamped subdirectories for each workflow run
- Respects RTX Remix metadata for organizing outputs
- Generates preview images for EXR files
- Supports batch processing (multiple textures in one execution)

**Category:** `RTX Remix`

### Example Workflows

We provide example workflows demonstrating both integration and REST API approaches.

#### Integration Workflow: PBRify_Remix

**File:** `./workflows/integration_pbrify.json`

A complete example showing the integration workflow approach. This workflow:

- Uses tagged inputs to receive textures from the RTX Remix Toolkit
- Processes textures using the [PBRify_Remix](https://github.com/Kim2091/PBRify_Remix) models
- Generates albedo, normal, roughness, and height maps
- Saves all outputs using tagged `RTX Remix Save Texture` nodes with proper texture type metadata for each output

**How to use:**

1. Load the workflow in ComfyUI
2. Install [PBRify_Remix](https://github.com/Kim2091/PBRify_Remix) models (follow their installation guide)
3. The workflow is already tagged and ready to use
4. In the RTX Remix Toolkit, select your exported workflow from the workflow menu

## REST API Workflow Guide (Advanced)

For advanced users building comprehensive workflows with full control of the RTX Remix Toolkit:

- `./workflows/restapi_pbrify.json` - Full-featured REST API workflow with layer management
- `./workflows/restapi_pbrify_lowVRAM.json` - Memory-optimized version with project open/close nodes

**Note:** These workflows use REST API nodes to control the RTX Remix Toolkit from within ComfyUI. They include layer creation, texture ingestion, and asset manipulation logic. This approach requires:

- Manual API configuration (port, connection details)
- Understanding of the RTX Remix Toolkit project structure
- More complex workflow setup

### REST API Nodes (Advanced)

The REST API nodes enable ComfyUI to remotely control the RTX Remix Toolkit. Unlike integration workflows where the RTX Remix Toolkit controls ComfyUI, this approach puts ComfyUI in the driver's seat.

**What's the difference?**

- **Integration workflows:** ComfyUI does AI processing only. The RTX Remix Toolkit handles layer management, asset selection, and texture replacement.
- **REST API workflows:** ComfyUI controls everything. Your workflow includes nodes for layer creation, texture ingestion, edit target selection, asset manipulation, and more.

**When to use REST API nodes:**

- Building custom automation that isn't supported by standard integration with the RTX Remix Toolkit
- Creating unique workflows with complex logic and conditional operations
- Need programmatic control over the RTX Remix Toolkit project structure

**Requirements:**

- The RTX Remix Toolkit must be open and running with a project in the correct state
- Manual configuration of API connection details (port, etc.)
- Understanding of the RTX Remix Toolkit project structure and USD concepts
- More complex workflow design with logic nodes

**Development considerations:** REST API workflows are harder to iterate on during development because:

- The RTX Remix Toolkit must be open and in the correct state to provide stage data
- Cannot easily test workflows with sample data using standard ComfyUI nodes
- Either requires modifying workflows during development (removing REST API nodes for testing) or maintaining the RTX Remix Toolkit state for every test run
- Makes the development cycle slower and more complex

**Note:** Most users should use Integration Workflows instead. REST API workflows are only recommended for advanced users building unique automation.

All REST API nodes are located under the `RTX Remix > REST API` category and prefixed with 🌐 to indicate they communicate with the Toolkit via REST API.

### Common Nodes

- **🌐 RTX Remix Rest API Details**: Provide the port information to connect to the RTX Remix Toolkit
- **🌐 RTX Remix String Constant**: Declare a string constant
- **🌐 RTX Remix Start Context**: Use this node to begin a graph, then pass context along to determine execution order
- **🌐 RTX Remix End Context**: Put this node at the end of your graph to evaluate prior nodes

### Texture Nodes

- **🌐 RTX Remix Get Textures**: Read the textures matching provided criteria from the currently open project
- **🌐 RTX Remix Texture Type To USD Attribute**: Use this node to get the proper texture attribute on the same asset but for a different texture type
- **🌐 RTX Remix Set Texture**: Set the texture path on an asset
- **🌐 RTX Remix Texture Type**: Select from a list of supported texture types
- **🌐 RTX Remix Texture Types**: Select multiple texture types from a list of supported texture types

### Ingestion Nodes

- **🌐 RTX Remix Ingest Texture**: Ingest an image as a texture and save it to disk. Output folder is now mandatory and must be provided by user or Get Default Directory node
- **🌐 RTX Remix Get Default Directory**: Captures the RTX Remix default output directory before closing projects for use with texture ingestion

### Layer Management Nodes

- **🌐 RTX Remix Define Layer ID**: Helper node to define a layer path relative to project or another layer
- **🌐 RTX Remix Create Layer**: Create or Insert a sublayer in the current stage
- **🌐 RTX Remix Get Layers**: Query layer ids from the currently open project
- **🌐 RTX Remix Remove Layer**: Remove a layer from the project
- **🌐 RTX Remix Save Layer**: Save a project layer
- **🌐 RTX Remix Mute Layer**: Mute or unmute a project layer
- **🌐 RTX Remix Set Edit Target**: Designate the edit target on the open project to receive modifications
- **🌐 RTX Remix Get Edit Target**: Get the edit target from the currently open project
- **🌐 RTX Remix Layer Types**: Select multiple layer types from a list of supported layer types
- **🌐 RTX Remix Layer Type**: Select from a list of supported layer types

### Project Management Nodes

- **🌐 RTX Remix Open Project**: Opens the RTX Remix Toolkit projects by layer ID for workflow management and VRAM optimization
- **🌐 RTX Remix Get Loaded Project**: Gets layer ID of current open project for use with Open Project node
- **🌐 RTX Remix Close Project**: Closes the RTX Remix Toolkit projects to save VRAM during AI processing
