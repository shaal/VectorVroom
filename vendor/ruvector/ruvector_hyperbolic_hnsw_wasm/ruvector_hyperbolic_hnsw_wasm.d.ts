/* tslint:disable */
/* eslint-disable */

/**
 * Hyperbolic HNSW Index for hierarchy-aware vector search
 *
 * @example
 * ```javascript
 * const index = new HyperbolicIndex(16, 1.0);
 * index.insert(new Float32Array([0.1, 0.2]));
 * index.insert(new Float32Array([-0.1, 0.3]));
 * const results = index.search(new Float32Array([0.05, 0.25]), 2);
 * ```
 */
export class HyperbolicIndex {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Build tangent cache for optimized search
     */
    buildTangentCache(): void;
    /**
     * Get vector dimension
     */
    dim(): number | undefined;
    /**
     * Export index configuration as JSON
     */
    exportConfig(): any;
    /**
     * Create with custom configuration
     *
     * @param config - JSON configuration object
     */
    static fromConfig(config: any): HyperbolicIndex;
    /**
     * Get a vector by ID
     *
     * @param id - Vector ID
     * @returns Vector data or null if not found
     */
    getVector(id: number): Float32Array | undefined;
    /**
     * Insert a vector into the index
     *
     * @param vector - Vector to insert (Float32Array)
     * @returns ID of inserted vector
     */
    insert(vector: Float32Array): number;
    /**
     * Insert batch of vectors
     *
     * @param vectors - Flat array of vectors
     * @param dim - Dimension of each vector
     * @returns Array of inserted IDs
     */
    insertBatch(vectors: Float32Array, dim: number): Uint32Array;
    /**
     * Check if index is empty
     */
    isEmpty(): boolean;
    /**
     * Get number of vectors in index
     */
    len(): number;
    /**
     * Create a new hyperbolic HNSW index
     *
     * @param ef_search - Size of dynamic candidate list during search (default: 50)
     * @param curvature - Curvature parameter for Poincaré ball (default: 1.0)
     */
    constructor(ef_search?: number | null, curvature?: number | null);
    /**
     * Search for k nearest neighbors
     *
     * @param query - Query vector (Float32Array)
     * @param k - Number of neighbors to return
     * @returns Array of search results as JSON
     */
    search(query: Float32Array, k: number): any;
    /**
     * Search with tangent space pruning (optimized)
     *
     * @param query - Query vector (Float32Array)
     * @param k - Number of neighbors to return
     * @returns Array of search results as JSON
     */
    searchWithPruning(query: Float32Array, k: number): any;
    /**
     * Update curvature parameter
     *
     * @param curvature - New curvature value (must be positive)
     */
    setCurvature(curvature: number): void;
}

/**
 * Sharded Hyperbolic HNSW with per-shard curvature
 *
 * @example
 * ```javascript
 * const manager = new ShardedIndex(1.0);
 * manager.insertToShard("taxonomy", new Float32Array([0.1, 0.2]), 0);
 * manager.insertToShard("taxonomy", new Float32Array([0.3, 0.1]), 3);
 * manager.updateCurvature("taxonomy", 0.5);
 * const results = manager.search(new Float32Array([0.2, 0.15]), 5);
 * ```
 */
export class ShardedIndex {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Build tangent caches for all shards
     */
    buildCaches(): void;
    /**
     * Get curvature registry as JSON
     */
    getRegistry(): any;
    /**
     * Insert vector with automatic shard assignment
     *
     * @param vector - Vector to insert (Float32Array)
     * @param depth - Optional hierarchy depth for shard assignment
     * @returns Global vector ID
     */
    insert(vector: Float32Array, depth?: number | null): number;
    /**
     * Insert vector into specific shard
     *
     * @param shard_id - Target shard ID
     * @param vector - Vector to insert (Float32Array)
     * @returns Global vector ID
     */
    insertToShard(shard_id: string, vector: Float32Array): number;
    /**
     * Check if empty
     */
    isEmpty(): boolean;
    /**
     * Get total vector count
     */
    len(): number;
    /**
     * Create a new sharded index
     *
     * @param default_curvature - Default curvature for new shards
     */
    constructor(default_curvature: number);
    /**
     * Get number of shards
     */
    numShards(): number;
    /**
     * Promote canary to production
     *
     * @param shard_id - Shard ID
     */
    promoteCanary(shard_id: string): void;
    /**
     * Rollback canary
     *
     * @param shard_id - Shard ID
     */
    rollbackCanary(shard_id: string): void;
    /**
     * Search across all shards
     *
     * @param query - Query vector (Float32Array)
     * @param k - Number of neighbors to return
     * @returns Array of search results as JSON
     */
    search(query: Float32Array, k: number): any;
    /**
     * Set canary curvature for A/B testing
     *
     * @param shard_id - Shard ID
     * @param curvature - Canary curvature value
     * @param traffic - Percentage of traffic for canary (0-100)
     */
    setCanaryCurvature(shard_id: string, curvature: number, traffic: number): void;
    /**
     * Update curvature for a shard
     *
     * @param shard_id - Shard ID
     * @param curvature - New curvature value
     */
    updateCurvature(shard_id: string, curvature: number): void;
}

/**
 * Search result from hyperbolic HNSW
 */
export class WasmSearchResult {
    free(): void;
    [Symbol.dispose](): void;
    constructor(id: number, distance: number);
    /**
     * Hyperbolic distance to query
     */
    distance: number;
    /**
     * Vector ID
     */
    id: number;
}

/**
 * Tangent space cache for fast pruning
 */
export class WasmTangentCache {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get centroid of the cache
     */
    centroid(): Float32Array;
    /**
     * Get dimension
     */
    dim(): number;
    /**
     * Get number of cached points
     */
    len(): number;
    /**
     * Create tangent cache from points
     *
     * @param points - Flat array of points
     * @param dim - Dimension of each point
     * @param curvature - Curvature parameter
     */
    constructor(points: Float32Array, dim: number, curvature: number);
    /**
     * Get tangent coordinates for a query
     *
     * @param query - Query point (Float32Array)
     * @returns Tangent coordinates (Float32Array)
     */
    queryTangent(query: Float32Array): Float32Array;
    /**
     * Compute tangent distance squared (for fast pruning)
     *
     * @param query_tangent - Query in tangent space (Float32Array)
     * @param idx - Index of cached point
     * @returns Squared distance in tangent space
     */
    tangentDistanceSquared(query_tangent: Float32Array, idx: number): number;
}

/**
 * Exponential map at point p
 *
 * Maps a tangent vector v at point p to the Poincaré ball
 *
 * @param v - Tangent vector (Float32Array)
 * @param p - Base point (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Point on the manifold (Float32Array)
 */
export function expMap(v: Float32Array, p: Float32Array, curvature: number): Float32Array;

/**
 * Compute Fréchet mean (hyperbolic centroid)
 *
 * @param points - Array of points as flat Float32Array
 * @param dim - Dimension of each point
 * @param curvature - Curvature parameter
 * @returns Centroid point (Float32Array)
 */
export function frechetMean(points: Float32Array, dim: number, curvature: number): Float32Array;

/**
 * Get default curvature value
 */
export function getDefaultCurvature(): number;

/**
 * Get numerical stability epsilon
 */
export function getEps(): number;

/**
 * Get library version
 */
export function getVersion(): string;

/**
 * Initialize the WASM module
 */
export function init(): void;

/**
 * Logarithmic map at point p
 *
 * Maps a point y to the tangent space at point p
 *
 * @param y - Target point (Float32Array)
 * @param p - Base point (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Tangent vector at p (Float32Array)
 */
export function logMap(y: Float32Array, p: Float32Array, curvature: number): Float32Array;

/**
 * Möbius addition in Poincaré ball
 *
 * Computes the hyperbolic analog of vector addition: x ⊕_c y
 *
 * @param x - First point (Float32Array)
 * @param y - Second point (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Result of Möbius addition (Float32Array)
 */
export function mobiusAdd(x: Float32Array, y: Float32Array, curvature: number): Float32Array;

/**
 * Möbius scalar multiplication
 *
 * Computes r ⊗_c x for scalar r and point x
 *
 * @param r - Scalar value
 * @param x - Point in Poincaré ball (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Scaled point (Float32Array)
 */
export function mobiusScalarMult(r: number, x: Float32Array, curvature: number): Float32Array;

/**
 * Compute Poincaré distance between two points
 *
 * @param u - First point (Float32Array)
 * @param v - Second point (Float32Array)
 * @param curvature - Curvature parameter (positive)
 * @returns Geodesic distance in hyperbolic space
 */
export function poincareDistance(u: Float32Array, v: Float32Array, curvature: number): number;

/**
 * Project point to Poincaré ball
 *
 * Ensures ||x|| < 1/√c - eps for numerical stability
 *
 * @param x - Point to project (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Projected point (Float32Array)
 */
export function projectToBall(x: Float32Array, curvature: number): Float32Array;

/**
 * Compute vector norm
 */
export function vectorNorm(x: Float32Array): number;

/**
 * Compute squared vector norm
 */
export function vectorNormSquared(x: Float32Array): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_wasmsearchresult_distance: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_id: (a: number) => number;
    readonly __wbg_hyperbolicindex_free: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_distance: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_id: (a: number, b: number) => void;
    readonly __wbg_shardedindex_free: (a: number, b: number) => void;
    readonly __wbg_wasmsearchresult_free: (a: number, b: number) => void;
    readonly __wbg_wasmtangentcache_free: (a: number, b: number) => void;
    readonly expMap: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly frechetMean: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly getDefaultCurvature: () => number;
    readonly getEps: () => number;
    readonly getVersion: () => [number, number];
    readonly hyperbolicindex_buildTangentCache: (a: number) => [number, number];
    readonly hyperbolicindex_dim: (a: number) => number;
    readonly hyperbolicindex_exportConfig: (a: number) => [number, number, number];
    readonly hyperbolicindex_fromConfig: (a: any) => [number, number, number];
    readonly hyperbolicindex_getVector: (a: number, b: number) => [number, number];
    readonly hyperbolicindex_insert: (a: number, b: number, c: number) => [number, number, number];
    readonly hyperbolicindex_insertBatch: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly hyperbolicindex_isEmpty: (a: number) => number;
    readonly hyperbolicindex_len: (a: number) => number;
    readonly hyperbolicindex_new: (a: number, b: number) => number;
    readonly hyperbolicindex_search: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly hyperbolicindex_searchWithPruning: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly hyperbolicindex_setCurvature: (a: number, b: number) => [number, number];
    readonly logMap: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly mobiusAdd: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly mobiusScalarMult: (a: number, b: number, c: number, d: number) => [number, number];
    readonly poincareDistance: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly projectToBall: (a: number, b: number, c: number) => [number, number];
    readonly shardedindex_buildCaches: (a: number) => [number, number];
    readonly shardedindex_getRegistry: (a: number) => [number, number, number];
    readonly shardedindex_insert: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly shardedindex_insertToShard: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly shardedindex_isEmpty: (a: number) => number;
    readonly shardedindex_len: (a: number) => number;
    readonly shardedindex_new: (a: number) => number;
    readonly shardedindex_numShards: (a: number) => number;
    readonly shardedindex_promoteCanary: (a: number, b: number, c: number) => [number, number];
    readonly shardedindex_rollbackCanary: (a: number, b: number, c: number) => void;
    readonly shardedindex_search: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly shardedindex_setCanaryCurvature: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly shardedindex_updateCurvature: (a: number, b: number, c: number, d: number) => [number, number];
    readonly vectorNorm: (a: number, b: number) => number;
    readonly vectorNormSquared: (a: number, b: number) => number;
    readonly wasmtangentcache_centroid: (a: number) => [number, number];
    readonly wasmtangentcache_dim: (a: number) => number;
    readonly wasmtangentcache_len: (a: number) => number;
    readonly wasmtangentcache_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmtangentcache_queryTangent: (a: number, b: number, c: number) => [number, number];
    readonly wasmtangentcache_tangentDistanceSquared: (a: number, b: number, c: number, d: number) => number;
    readonly init: () => void;
    readonly wasmsearchresult_new: (a: number, b: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
