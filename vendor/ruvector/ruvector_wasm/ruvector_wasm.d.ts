/* tslint:disable */
/* eslint-disable */

/**
 * JavaScript-compatible SearchResult
 */
export class JsSearchResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly id: string;
    readonly metadata: any | undefined;
    readonly score: number;
    readonly vector: Float32Array | undefined;
}

/**
 * JavaScript-compatible VectorEntry
 */
export class JsVectorEntry {
    free(): void;
    [Symbol.dispose](): void;
    constructor(vector: Float32Array, id?: string | null, metadata?: any | null);
    readonly id: string | undefined;
    readonly metadata: any | undefined;
    readonly vector: Float32Array;
}

/**
 * Main VectorDB class for browser usage
 */
export class VectorDB {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Delete a vector by ID
     *
     * # Arguments
     * * `id` - Vector ID to delete
     *
     * # Returns
     * True if deleted, false if not found
     */
    delete(id: string): boolean;
    /**
     * Get a vector by ID
     *
     * # Arguments
     * * `id` - Vector ID
     *
     * # Returns
     * VectorEntry or null if not found
     */
    get(id: string): JsVectorEntry | undefined;
    /**
     * Insert a single vector
     *
     * # Arguments
     * * `vector` - Float32Array of vector data
     * * `id` - Optional ID (auto-generated if not provided)
     * * `metadata` - Optional metadata object
     *
     * # Returns
     * The vector ID
     */
    insert(vector: Float32Array, id?: string | null, metadata?: any | null): string;
    /**
     * Insert multiple vectors in a batch (more efficient)
     *
     * # Arguments
     * * `entries` - Array of VectorEntry objects
     *
     * # Returns
     * Array of vector IDs
     */
    insertBatch(entries: any): string[];
    /**
     * Check if the database is empty
     */
    isEmpty(): boolean;
    /**
     * Get the number of vectors in the database
     */
    len(): number;
    /**
     * Load database from IndexedDB
     * Returns a Promise that resolves with the VectorDB instance
     */
    static loadFromIndexedDB(db_name: string): Promise<any>;
    /**
     * Create a new VectorDB instance
     *
     * # Arguments
     * * `dimensions` - Vector dimensions
     * * `metric` - Distance metric ("euclidean", "cosine", "dotproduct", "manhattan")
     * * `use_hnsw` - Whether to use HNSW index for faster search
     */
    constructor(dimensions: number, metric?: string | null, use_hnsw?: boolean | null);
    /**
     * Save database to IndexedDB
     * Returns a Promise that resolves when save is complete
     */
    saveToIndexedDB(): Promise<any>;
    /**
     * Search for similar vectors
     *
     * # Arguments
     * * `query` - Query vector as Float32Array
     * * `k` - Number of results to return
     * * `filter` - Optional metadata filter object
     *
     * # Returns
     * Array of search results
     */
    search(query: Float32Array, k: number, filter?: any | null): JsSearchResult[];
    /**
     * Get database dimensions
     */
    readonly dimensions: number;
}

/**
 * Utility: Convert JavaScript array to Float32Array
 */
export function arrayToFloat32Array(arr: Float32Array): Float32Array;

/**
 * Utility: Measure performance of an operation
 */
export function benchmark(name: string, iterations: number, dimensions: number): number;

/**
 * Detect SIMD support in the current environment
 */
export function detectSIMD(): boolean;

/**
 * Initialize panic hook for better error messages in browser console
 */
export function init(): void;

/**
 * Get version information
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_jssearchresult_free: (a: number, b: number) => void;
    readonly __wbg_jsvectorentry_free: (a: number, b: number) => void;
    readonly __wbg_vectordb_free: (a: number, b: number) => void;
    readonly arrayToFloat32Array: (a: number, b: number) => number;
    readonly benchmark: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly detectSIMD: () => number;
    readonly jssearchresult_id: (a: number, b: number) => void;
    readonly jssearchresult_metadata: (a: number) => number;
    readonly jssearchresult_score: (a: number) => number;
    readonly jssearchresult_vector: (a: number) => number;
    readonly jsvectorentry_id: (a: number, b: number) => void;
    readonly jsvectorentry_metadata: (a: number) => number;
    readonly jsvectorentry_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly jsvectorentry_vector: (a: number) => number;
    readonly vectordb_delete: (a: number, b: number, c: number, d: number) => void;
    readonly vectordb_dimensions: (a: number) => number;
    readonly vectordb_get: (a: number, b: number, c: number, d: number) => void;
    readonly vectordb_insert: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly vectordb_insertBatch: (a: number, b: number, c: number) => void;
    readonly vectordb_isEmpty: (a: number, b: number) => void;
    readonly vectordb_len: (a: number, b: number) => void;
    readonly vectordb_loadFromIndexedDB: (a: number, b: number, c: number) => void;
    readonly vectordb_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly vectordb_saveToIndexedDB: (a: number, b: number) => void;
    readonly vectordb_search: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly version: (a: number) => void;
    readonly init: () => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
