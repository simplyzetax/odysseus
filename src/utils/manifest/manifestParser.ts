// Import WASM file directly for modules-based workers
import wasmModule from './pkg/epic_manifest_wasm_bg.wasm';

// Global state similar to generated bindings
let wasm: any = null;
let cachedUint8ArrayMemory0: Uint8Array | null = null;
let WASM_VECTOR_LEN = 0;

function getUint8ArrayMemory0() {
	if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
		cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
	}
	return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg: Uint8Array, malloc: any) {
	const ptr = malloc(arg.length * 1, 1) >>> 0;
	getUint8ArrayMemory0().set(arg, ptr / 1);
	WASM_VECTOR_LEN = arg.length;
	return ptr;
}

const cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

function getStringFromWasm0(ptr: number, len: number) {
	ptr = ptr >>> 0;
	return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function __wbg_get_imports() {
	const imports: any = {};
	imports.wbg = {};
	imports.wbg.__wbindgen_init_externref_table = function () {
		const table = wasm.__wbindgen_export_0;
		const offset = table.grow(4);
		table.set(0, undefined);
		table.set(offset + 0, undefined);
		table.set(offset + 1, null);
		table.set(offset + 2, true);
		table.set(offset + 3, false);
	};
	return imports;
}

function __wbg_finalize_init(instance: WebAssembly.Instance, module: WebAssembly.Module) {
	wasm = instance.exports;
	cachedUint8ArrayMemory0 = null;
	(wasm as any).__wbindgen_start();
	return wasm;
}

async function initWasm() {
	if (wasm !== null) return wasm;

	const imports = __wbg_get_imports();
	const instance = await WebAssembly.instantiate(wasmModule, imports);
	return __wbg_finalize_init(instance, wasmModule);
}

/**
 * Parses an Epic manifest using the WASM module
 * @param manifestBytes - The manifest file as Uint8Array
 * @returns Parsed manifest as string
 */
export async function parseEpicManifest(manifestBytes: Uint8Array): Promise<string> {
	console.log('Initializing WASM instance');
	await initWasm();

	console.log('Parsing manifest');

	let deferred2_0: number;
	let deferred2_1: number;
	try {
		const ptr0 = passArray8ToWasm0(manifestBytes, wasm.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.parse_manifest(ptr0, len0);
		deferred2_0 = ret[0];
		deferred2_1 = ret[1];
		return getStringFromWasm0(ret[0], ret[1]);
	} finally {
		wasm.__wbindgen_free(deferred2_0!, deferred2_1!, 1);
	}
}
