let wasm;

let cachedUint8ArrayMemory0 = null;

/**
 * Returns a cached Uint8Array view of the WASM memory buffer, refreshing the cache if necessary.
 * @return {Uint8Array} The current Uint8Array view of the WASM memory buffer.
 */
function getUint8ArrayMemory0() {
	if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
		cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
	}
	return cachedUint8ArrayMemory0;
}

let WASM_VECTOR_LEN = 0;

/**
 * Allocates memory in WASM and copies a Uint8Array into it.
 * @param {Uint8Array} arg - The byte array to pass to WASM.
 * @param {Function} malloc - The WASM memory allocation function.
 * @returns {number} The pointer to the start of the copied array in WASM memory.
 */
function passArray8ToWasm0(arg, malloc) {
	const ptr = malloc(arg.length * 1, 1) >>> 0;
	getUint8ArrayMemory0().set(arg, ptr / 1);
	WASM_VECTOR_LEN = arg.length;
	return ptr;
}

const cachedTextDecoder =
	typeof TextDecoder !== 'undefined'
		? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
		: {
				decode: () => {
					throw Error('TextDecoder not available');
				},
			};

if (typeof TextDecoder !== 'undefined') {
	cachedTextDecoder.decode();
}

/**
 * Decodes a UTF-8 string from WASM memory at the specified pointer and length.
 * @param {number} ptr - The pointer to the start of the string in WASM memory.
 * @param {number} len - The length of the string in bytes.
 * @return {string} The decoded JavaScript string.
 */
function getStringFromWasm0(ptr, len) {
	ptr = ptr >>> 0;
	return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
/**
 * Parses a manifest from a Uint8Array using the underlying WebAssembly logic.
 * @param {Uint8Array} manifest_bytes - The manifest data to parse.
 * @returns {string} The parsed manifest as a string.
 */
export function parse_manifest(manifest_bytes) {
	let deferred2_0;
	let deferred2_1;
	try {
		const ptr0 = passArray8ToWasm0(manifest_bytes, wasm.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.parse_manifest(ptr0, len0);
		deferred2_0 = ret[0];
		deferred2_1 = ret[1];
		return getStringFromWasm0(ret[0], ret[1]);
	} finally {
		wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
	}
}

const cachedTextEncoder =
	typeof TextEncoder !== 'undefined'
		? new TextEncoder('utf-8')
		: {
				encode: () => {
					throw Error('TextEncoder not available');
				},
			};

const encodeString =
	typeof cachedTextEncoder.encodeInto === 'function'
		? function (arg, view) {
				return cachedTextEncoder.encodeInto(arg, view);
			}
		: function (arg, view) {
				const buf = cachedTextEncoder.encode(arg);
				view.set(buf);
				return {
					read: arg.length,
					written: buf.length,
				};
			};

/**
 * Encodes a JavaScript string as UTF-8, allocates memory in WASM, and copies the encoded bytes into WASM memory.
 * 
 * Uses ASCII fast-path for efficiency and handles multi-byte UTF-8 characters with reallocation as needed. Updates the global `WASM_VECTOR_LEN` to the number of bytes written.
 * 
 * @param {string} arg - The string to encode and pass to WASM.
 * @param {Function} malloc - Function to allocate memory in WASM.
 * @param {Function} [realloc] - Optional function to reallocate memory in WASM for multi-byte characters.
 * @returns {number} Pointer to the start of the encoded string in WASM memory.
 */
function passStringToWasm0(arg, malloc, realloc) {
	if (realloc === undefined) {
		const buf = cachedTextEncoder.encode(arg);
		const ptr = malloc(buf.length, 1) >>> 0;
		getUint8ArrayMemory0()
			.subarray(ptr, ptr + buf.length)
			.set(buf);
		WASM_VECTOR_LEN = buf.length;
		return ptr;
	}

	let len = arg.length;
	let ptr = malloc(len, 1) >>> 0;

	const mem = getUint8ArrayMemory0();

	let offset = 0;

	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 0x7f) break;
		mem[ptr + offset] = code;
	}

	if (offset !== len) {
		if (offset !== 0) {
			arg = arg.slice(offset);
		}
		ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
		const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
		const ret = encodeString(arg, view);

		offset += ret.written;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}

	WASM_VECTOR_LEN = offset;
	return ptr;
}

/**
 * Returns a Uint8Array view of WASM memory at the specified pointer and length.
 * @param {number} ptr - The pointer to the start of the array in WASM memory.
 * @param {number} len - The length of the array to retrieve.
 * @return {Uint8Array} The extracted byte array from WASM memory.
 */
function getArrayU8FromWasm0(ptr, len) {
	ptr = ptr >>> 0;
	return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
 * Creates a manifest from a JSON string using the underlying WebAssembly logic.
 * @param {string} json_string - The JSON string representing the manifest data.
 * @returns {Uint8Array} The generated manifest as a byte array.
 */
export function create_manifest(json_string) {
	const ptr0 = passStringToWasm0(json_string, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
	const len0 = WASM_VECTOR_LEN;
	const ret = wasm.create_manifest(ptr0, len0);
	var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
	wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
	return v2;
}

/**
 * Loads and instantiates a WebAssembly module from various input types, supporting streaming instantiation and MIME type fallback.
 * 
 * Accepts a Response, WebAssembly.Module, or raw bytes, and returns the instantiated module and instance. If streaming instantiation fails due to incorrect MIME type, falls back to instantiating from an ArrayBuffer.
 * 
 * @param {Response|WebAssembly.Module|ArrayBuffer|object} module - The WebAssembly module source, which can be a Response, compiled module, or raw bytes.
 * @param {object} imports - The imports object to provide to the WebAssembly module.
 * @return {Promise<object>} An object containing the WebAssembly instance and module.
 */
async function __wbg_load(module, imports) {
	if (typeof Response === 'function' && module instanceof Response) {
		if (typeof WebAssembly.instantiateStreaming === 'function') {
			try {
				return await WebAssembly.instantiateStreaming(module, imports);
			} catch (e) {
				if (module.headers.get('Content-Type') != 'application/wasm') {
					console.warn(
						'`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n',
						e,
					);
				} else {
					throw e;
				}
			}
		}

		const bytes = await module.arrayBuffer();
		return await WebAssembly.instantiate(bytes, imports);
	} else {
		const instance = await WebAssembly.instantiate(module, imports);

		if (instance instanceof WebAssembly.Instance) {
			return { instance, module };
		} else {
			return instance;
		}
	}
}

/**
 * Placeholder for initializing WASM memory; currently performs no operations.
 */
function __wbg_init_memory(imports, maybe_memory) {
	// This function is typically used to initialize memory for WASM modules
	// In most cases, this can be a no-op when memory is auto-managed
}

/**
 * Returns the imports object required for initializing the WASM module, including a function to set up the external reference table.
 * 
 * The returned object contains the necessary imports for the WASM instance, specifically initializing the externref table used for JS-WASM interop.
 * @return {Object} The imports object for WASM instantiation.
 */
function __wbg_get_imports() {
	const imports = {};
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

/**
 * Finalizes the initialization of the WASM module by setting up exports, resetting cached memory views, and invoking the WASM start function.
 * @param {WebAssembly.Instance} instance - The instantiated WASM module.
 * @param {WebAssembly.Module} module - The original WASM module.
 * @return {object} The WASM module's exported functions and objects.
 */
function __wbg_finalize_init(instance, module) {
	wasm = instance.exports;
	__wbg_init.__wbindgen_wasm_module = module;
	cachedUint8ArrayMemory0 = null;

	wasm.__wbindgen_start();
	return wasm;
}

/**
 * Synchronously initializes the WebAssembly module and returns its exports.
 * 
 * If provided, the `module` parameter can be a WebAssembly.Module or an object containing a `module` property. This function sets up the necessary imports, creates a WebAssembly instance, and finalizes initialization before returning the WASM exports.
 * 
 * @param {WebAssembly.Module|object} [module] - The WASM module or an object containing a `module` property.
 * @returns {any} The initialized WebAssembly module exports.
 */
function initSync(module) {
	if (wasm !== undefined) return wasm;

	if (typeof module !== 'undefined') {
		if (Object.getPrototypeOf(module) === Object.prototype) {
			({ module } = module);
		} else {
			console.warn('using deprecated parameters for `initSync()`; pass a single object instead');
		}
	}

	const imports = __wbg_get_imports();

	__wbg_init_memory(imports);

	if (!(module instanceof WebAssembly.Module)) {
		module = new WebAssembly.Module(module);
	}

	const instance = new WebAssembly.Instance(module, imports);

	return __wbg_finalize_init(instance, module);
}

/**
 * Asynchronously initializes the WebAssembly module, loading it from a URL, Request, WebAssembly.Module, or object.
 * 
 * If no argument is provided, loads the default WASM binary relative to the current module. Returns the initialized WASM exports.
 * @returns {Promise<any>} A promise that resolves to the initialized WASM exports.
 */
async function __wbg_init(module_or_path) {
	if (wasm !== undefined) return wasm;

	if (typeof module_or_path !== 'undefined') {
		if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
			({ module_or_path } = module_or_path);
		} else {
			console.warn('using deprecated parameters for the initialization function; pass a single object instead');
		}
	}

	if (typeof module_or_path === 'undefined') {
		module_or_path = new URL('epic_manifest_wasm_bg.wasm', import.meta.url);
	}
	const imports = __wbg_get_imports();

	if (
		typeof module_or_path === 'string' ||
		(typeof Request === 'function' && module_or_path instanceof Request) ||
		(typeof URL === 'function' && module_or_path instanceof URL)
	) {
		module_or_path = fetch(module_or_path);
	}

	__wbg_init_memory(imports);

	const { instance, module } = await __wbg_load(await module_or_path, imports);

	return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
