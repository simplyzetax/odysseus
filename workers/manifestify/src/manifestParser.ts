// Import the generated wasm-bindgen JavaScript bindings
import init, { parse_manifest, create_manifest } from '../pkg/epic_manifest_wasm.js';
import wasmBytes from '../pkg/epic_manifest_wasm_bg.wasm';

// TypeScript interfaces for Epic Manifest structure
export interface ManifestGuid {
	a: number;
	b: number;
	c: number;
	d: number;
}

export interface ManifestHeader {
	magic: number;
	header_size: number;
	data_size_uncompressed: number;
	data_size_compressed: number;
	sha_hash: string;
	stored_as: string;
	version: string;
}

export interface ManifestMeta {
	feature_level: string;
	b_is_file_data: boolean;
	app_id: number;
	app_name: string;
	build_version: string;
	launch_exe: string;
	launch_command: string;
	prerequisites: string[];
	prereq_name: string;
	prereq_path: string;
	prereq_args: string;
	build_id: string | null;
	prereq_ids: string[];
	uninstall_action_path: string | null;
	uninstall_action_args: string | null;
}

export interface ManifestChunk {
	guid: ManifestGuid;
	hash: number;
	sha_hash: string;
	group_num: number;
	uncompressed_size: number;
	compressed_size: number;
}

export interface ManifestChunkList {
	_manifest_version: string;
	_size: number;
	_version: number;
	chunks: ManifestChunk[];
}

export interface ManifestChunkPart {
	size: number;
	guid: ManifestGuid;
	offset: number;
	file_offset: number;
}

export interface ManifestFileEntry {
	filename: string;
	syslink_target: string;
	hash: string;
	flags: number;
	install_tags: string[];
	chunk_parts: ManifestChunkPart[];
	mime_type: string | null;
	hash_md5: string | null;
	hash_sha256: string | null;
	file_size: number;
}

export interface ManifestFileList {
	_version: number;
	_size: number;
	_count: number;
	entries: ManifestFileEntry[];
}

export interface EpicManifest {
	header: ManifestHeader;
	meta: ManifestMeta;
	chunk_list: ManifestChunkList;
	file_list: ManifestFileList;
}

// Track initialization state
let isInitialized = false;

/**
 * Initialize the WASM module if not already initialized
 */
async function ensureWasmInitialized(): Promise<void> {
	if (!isInitialized) {
		console.log('Initializing WASM module');
		// Pass the WASM bytes as an object to avoid deprecation warning
		await init({ module_or_path: wasmBytes });
		isInitialized = true;
		console.log('WASM module initialized successfully');
	}
}

/**
 * Parses an Epic manifest using the WASM module
 * @param manifestBytes - The manifest file as Uint8Array
 * @returns Parsed manifest as EpicManifest object
 */
export async function parseEpicManifest(manifestBytes: Uint8Array): Promise<EpicManifest> {
	await ensureWasmInitialized();
	console.log('Parsing manifest');
	const result = parse_manifest(manifestBytes);
	return JSON.parse(result) as EpicManifest;
}

/**
 * Creates an Epic manifest using the WASM module
 * @param manifestData - The manifest data as EpicManifest object to create manifest from
 * @returns Created manifest as Uint8Array
 */
export async function createEpicManifest(manifestData: EpicManifest): Promise<Uint8Array> {
	await ensureWasmInitialized();
	console.log('Creating manifest');
	return create_manifest(JSON.stringify(manifestData));
}

/**
 * Creates an Epic manifest using the WASM module from JSON string
 * @param manifestJson - The manifest data as JSON string to create manifest from
 * @returns Created manifest as Uint8Array
 */
export async function createEpicManifestFromJson(manifestJson: string): Promise<Uint8Array> {
	await ensureWasmInitialized();
	console.log('Creating manifest from JSON');
	return create_manifest(manifestJson);
}
