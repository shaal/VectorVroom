/* @ts-self-types="./ruvector_hyperbolic_hnsw_wasm.d.ts" */

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
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(HyperbolicIndex.prototype);
        obj.__wbg_ptr = ptr;
        HyperbolicIndexFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HyperbolicIndexFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hyperbolicindex_free(ptr, 0);
    }
    /**
     * Build tangent cache for optimized search
     */
    buildTangentCache() {
        const ret = wasm.hyperbolicindex_buildTangentCache(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Get vector dimension
     * @returns {number | undefined}
     */
    dim() {
        const ret = wasm.hyperbolicindex_dim(this.__wbg_ptr);
        return ret === 0x100000001 ? undefined : ret;
    }
    /**
     * Export index configuration as JSON
     * @returns {any}
     */
    exportConfig() {
        const ret = wasm.hyperbolicindex_exportConfig(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Create with custom configuration
     *
     * @param config - JSON configuration object
     * @param {any} config
     * @returns {HyperbolicIndex}
     */
    static fromConfig(config) {
        const ret = wasm.hyperbolicindex_fromConfig(config);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return HyperbolicIndex.__wrap(ret[0]);
    }
    /**
     * Get a vector by ID
     *
     * @param id - Vector ID
     * @returns Vector data or null if not found
     * @param {number} id
     * @returns {Float32Array | undefined}
     */
    getVector(id) {
        const ret = wasm.hyperbolicindex_getVector(this.__wbg_ptr, id);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v1;
    }
    /**
     * Insert a vector into the index
     *
     * @param vector - Vector to insert (Float32Array)
     * @returns ID of inserted vector
     * @param {Float32Array} vector
     * @returns {number}
     */
    insert(vector) {
        const ptr0 = passArrayF32ToWasm0(vector, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hyperbolicindex_insert(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Insert batch of vectors
     *
     * @param vectors - Flat array of vectors
     * @param dim - Dimension of each vector
     * @returns Array of inserted IDs
     * @param {Float32Array} vectors
     * @param {number} dim
     * @returns {Uint32Array}
     */
    insertBatch(vectors, dim) {
        const ptr0 = passArrayF32ToWasm0(vectors, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hyperbolicindex_insertBatch(this.__wbg_ptr, ptr0, len0, dim);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * Check if index is empty
     * @returns {boolean}
     */
    isEmpty() {
        const ret = wasm.hyperbolicindex_isEmpty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get number of vectors in index
     * @returns {number}
     */
    len() {
        const ret = wasm.hyperbolicindex_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Create a new hyperbolic HNSW index
     *
     * @param ef_search - Size of dynamic candidate list during search (default: 50)
     * @param curvature - Curvature parameter for Poincaré ball (default: 1.0)
     * @param {number | null} [ef_search]
     * @param {number | null} [curvature]
     */
    constructor(ef_search, curvature) {
        const ret = wasm.hyperbolicindex_new(isLikeNone(ef_search) ? 0x100000001 : (ef_search) >>> 0, isLikeNone(curvature) ? 0x100000001 : Math.fround(curvature));
        this.__wbg_ptr = ret >>> 0;
        HyperbolicIndexFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Search for k nearest neighbors
     *
     * @param query - Query vector (Float32Array)
     * @param k - Number of neighbors to return
     * @returns Array of search results as JSON
     * @param {Float32Array} query
     * @param {number} k
     * @returns {any}
     */
    search(query, k) {
        const ptr0 = passArrayF32ToWasm0(query, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hyperbolicindex_search(this.__wbg_ptr, ptr0, len0, k);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Search with tangent space pruning (optimized)
     *
     * @param query - Query vector (Float32Array)
     * @param k - Number of neighbors to return
     * @returns Array of search results as JSON
     * @param {Float32Array} query
     * @param {number} k
     * @returns {any}
     */
    searchWithPruning(query, k) {
        const ptr0 = passArrayF32ToWasm0(query, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hyperbolicindex_searchWithPruning(this.__wbg_ptr, ptr0, len0, k);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Update curvature parameter
     *
     * @param curvature - New curvature value (must be positive)
     * @param {number} curvature
     */
    setCurvature(curvature) {
        const ret = wasm.hyperbolicindex_setCurvature(this.__wbg_ptr, curvature);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) HyperbolicIndex.prototype[Symbol.dispose] = HyperbolicIndex.prototype.free;

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
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ShardedIndexFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_shardedindex_free(ptr, 0);
    }
    /**
     * Build tangent caches for all shards
     */
    buildCaches() {
        const ret = wasm.shardedindex_buildCaches(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Get curvature registry as JSON
     * @returns {any}
     */
    getRegistry() {
        const ret = wasm.shardedindex_getRegistry(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Insert vector with automatic shard assignment
     *
     * @param vector - Vector to insert (Float32Array)
     * @param depth - Optional hierarchy depth for shard assignment
     * @returns Global vector ID
     * @param {Float32Array} vector
     * @param {number | null} [depth]
     * @returns {number}
     */
    insert(vector, depth) {
        const ptr0 = passArrayF32ToWasm0(vector, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.shardedindex_insert(this.__wbg_ptr, ptr0, len0, isLikeNone(depth) ? 0x100000001 : (depth) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Insert vector into specific shard
     *
     * @param shard_id - Target shard ID
     * @param vector - Vector to insert (Float32Array)
     * @returns Global vector ID
     * @param {string} shard_id
     * @param {Float32Array} vector
     * @returns {number}
     */
    insertToShard(shard_id, vector) {
        const ptr0 = passStringToWasm0(shard_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(vector, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.shardedindex_insertToShard(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Check if empty
     * @returns {boolean}
     */
    isEmpty() {
        const ret = wasm.shardedindex_isEmpty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get total vector count
     * @returns {number}
     */
    len() {
        const ret = wasm.shardedindex_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Create a new sharded index
     *
     * @param default_curvature - Default curvature for new shards
     * @param {number} default_curvature
     */
    constructor(default_curvature) {
        const ret = wasm.shardedindex_new(default_curvature);
        this.__wbg_ptr = ret >>> 0;
        ShardedIndexFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get number of shards
     * @returns {number}
     */
    numShards() {
        const ret = wasm.shardedindex_numShards(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Promote canary to production
     *
     * @param shard_id - Shard ID
     * @param {string} shard_id
     */
    promoteCanary(shard_id) {
        const ptr0 = passStringToWasm0(shard_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.shardedindex_promoteCanary(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Rollback canary
     *
     * @param shard_id - Shard ID
     * @param {string} shard_id
     */
    rollbackCanary(shard_id) {
        const ptr0 = passStringToWasm0(shard_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.shardedindex_rollbackCanary(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Search across all shards
     *
     * @param query - Query vector (Float32Array)
     * @param k - Number of neighbors to return
     * @returns Array of search results as JSON
     * @param {Float32Array} query
     * @param {number} k
     * @returns {any}
     */
    search(query, k) {
        const ptr0 = passArrayF32ToWasm0(query, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.shardedindex_search(this.__wbg_ptr, ptr0, len0, k);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Set canary curvature for A/B testing
     *
     * @param shard_id - Shard ID
     * @param curvature - Canary curvature value
     * @param traffic - Percentage of traffic for canary (0-100)
     * @param {string} shard_id
     * @param {number} curvature
     * @param {number} traffic
     */
    setCanaryCurvature(shard_id, curvature, traffic) {
        const ptr0 = passStringToWasm0(shard_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.shardedindex_setCanaryCurvature(this.__wbg_ptr, ptr0, len0, curvature, traffic);
    }
    /**
     * Update curvature for a shard
     *
     * @param shard_id - Shard ID
     * @param curvature - New curvature value
     * @param {string} shard_id
     * @param {number} curvature
     */
    updateCurvature(shard_id, curvature) {
        const ptr0 = passStringToWasm0(shard_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.shardedindex_updateCurvature(this.__wbg_ptr, ptr0, len0, curvature);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) ShardedIndex.prototype[Symbol.dispose] = ShardedIndex.prototype.free;

/**
 * Search result from hyperbolic HNSW
 */
export class WasmSearchResult {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSearchResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmsearchresult_free(ptr, 0);
    }
    /**
     * Hyperbolic distance to query
     * @returns {number}
     */
    get distance() {
        const ret = wasm.__wbg_get_wasmsearchresult_distance(this.__wbg_ptr);
        return ret;
    }
    /**
     * Vector ID
     * @returns {number}
     */
    get id() {
        const ret = wasm.__wbg_get_wasmsearchresult_id(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Hyperbolic distance to query
     * @param {number} arg0
     */
    set distance(arg0) {
        wasm.__wbg_set_wasmsearchresult_distance(this.__wbg_ptr, arg0);
    }
    /**
     * Vector ID
     * @param {number} arg0
     */
    set id(arg0) {
        wasm.__wbg_set_wasmsearchresult_id(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} id
     * @param {number} distance
     */
    constructor(id, distance) {
        const ret = wasm.wasmsearchresult_new(id, distance);
        this.__wbg_ptr = ret >>> 0;
        WasmSearchResultFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmSearchResult.prototype[Symbol.dispose] = WasmSearchResult.prototype.free;

/**
 * Tangent space cache for fast pruning
 */
export class WasmTangentCache {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmTangentCacheFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmtangentcache_free(ptr, 0);
    }
    /**
     * Get centroid of the cache
     * @returns {Float32Array}
     */
    centroid() {
        const ret = wasm.wasmtangentcache_centroid(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get dimension
     * @returns {number}
     */
    dim() {
        const ret = wasm.wasmtangentcache_dim(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get number of cached points
     * @returns {number}
     */
    len() {
        const ret = wasm.wasmtangentcache_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Create tangent cache from points
     *
     * @param points - Flat array of points
     * @param dim - Dimension of each point
     * @param curvature - Curvature parameter
     * @param {Float32Array} points
     * @param {number} dim
     * @param {number} curvature
     */
    constructor(points, dim, curvature) {
        const ptr0 = passArrayF32ToWasm0(points, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtangentcache_new(ptr0, len0, dim, curvature);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmTangentCacheFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get tangent coordinates for a query
     *
     * @param query - Query point (Float32Array)
     * @returns Tangent coordinates (Float32Array)
     * @param {Float32Array} query
     * @returns {Float32Array}
     */
    queryTangent(query) {
        const ptr0 = passArrayF32ToWasm0(query, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtangentcache_queryTangent(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * Compute tangent distance squared (for fast pruning)
     *
     * @param query_tangent - Query in tangent space (Float32Array)
     * @param idx - Index of cached point
     * @returns Squared distance in tangent space
     * @param {Float32Array} query_tangent
     * @param {number} idx
     * @returns {number}
     */
    tangentDistanceSquared(query_tangent, idx) {
        const ptr0 = passArrayF32ToWasm0(query_tangent, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtangentcache_tangentDistanceSquared(this.__wbg_ptr, ptr0, len0, idx);
        return ret;
    }
}
if (Symbol.dispose) WasmTangentCache.prototype[Symbol.dispose] = WasmTangentCache.prototype.free;

/**
 * Exponential map at point p
 *
 * Maps a tangent vector v at point p to the Poincaré ball
 *
 * @param v - Tangent vector (Float32Array)
 * @param p - Base point (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Point on the manifold (Float32Array)
 * @param {Float32Array} v
 * @param {Float32Array} p
 * @param {number} curvature
 * @returns {Float32Array}
 */
export function expMap(v, p, curvature) {
    const ptr0 = passArrayF32ToWasm0(v, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(p, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.expMap(ptr0, len0, ptr1, len1, curvature);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Compute Fréchet mean (hyperbolic centroid)
 *
 * @param points - Array of points as flat Float32Array
 * @param dim - Dimension of each point
 * @param curvature - Curvature parameter
 * @returns Centroid point (Float32Array)
 * @param {Float32Array} points
 * @param {number} dim
 * @param {number} curvature
 * @returns {Float32Array}
 */
export function frechetMean(points, dim, curvature) {
    const ptr0 = passArrayF32ToWasm0(points, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.frechetMean(ptr0, len0, dim, curvature);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Get default curvature value
 * @returns {number}
 */
export function getDefaultCurvature() {
    const ret = wasm.getDefaultCurvature();
    return ret;
}

/**
 * Get numerical stability epsilon
 * @returns {number}
 */
export function getEps() {
    const ret = wasm.getEps();
    return ret;
}

/**
 * Get library version
 * @returns {string}
 */
export function getVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.getVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Initialize the WASM module
 */
export function init() {
    wasm.init();
}

/**
 * Logarithmic map at point p
 *
 * Maps a point y to the tangent space at point p
 *
 * @param y - Target point (Float32Array)
 * @param p - Base point (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Tangent vector at p (Float32Array)
 * @param {Float32Array} y
 * @param {Float32Array} p
 * @param {number} curvature
 * @returns {Float32Array}
 */
export function logMap(y, p, curvature) {
    const ptr0 = passArrayF32ToWasm0(y, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(p, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.logMap(ptr0, len0, ptr1, len1, curvature);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Möbius addition in Poincaré ball
 *
 * Computes the hyperbolic analog of vector addition: x ⊕_c y
 *
 * @param x - First point (Float32Array)
 * @param y - Second point (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Result of Möbius addition (Float32Array)
 * @param {Float32Array} x
 * @param {Float32Array} y
 * @param {number} curvature
 * @returns {Float32Array}
 */
export function mobiusAdd(x, y, curvature) {
    const ptr0 = passArrayF32ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(y, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.mobiusAdd(ptr0, len0, ptr1, len1, curvature);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Möbius scalar multiplication
 *
 * Computes r ⊗_c x for scalar r and point x
 *
 * @param r - Scalar value
 * @param x - Point in Poincaré ball (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Scaled point (Float32Array)
 * @param {number} r
 * @param {Float32Array} x
 * @param {number} curvature
 * @returns {Float32Array}
 */
export function mobiusScalarMult(r, x, curvature) {
    const ptr0 = passArrayF32ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.mobiusScalarMult(r, ptr0, len0, curvature);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Compute Poincaré distance between two points
 *
 * @param u - First point (Float32Array)
 * @param v - Second point (Float32Array)
 * @param curvature - Curvature parameter (positive)
 * @returns Geodesic distance in hyperbolic space
 * @param {Float32Array} u
 * @param {Float32Array} v
 * @param {number} curvature
 * @returns {number}
 */
export function poincareDistance(u, v, curvature) {
    const ptr0 = passArrayF32ToWasm0(u, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(v, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.poincareDistance(ptr0, len0, ptr1, len1, curvature);
    return ret;
}

/**
 * Project point to Poincaré ball
 *
 * Ensures ||x|| < 1/√c - eps for numerical stability
 *
 * @param x - Point to project (Float32Array)
 * @param curvature - Curvature parameter
 * @returns Projected point (Float32Array)
 * @param {Float32Array} x
 * @param {number} curvature
 * @returns {Float32Array}
 */
export function projectToBall(x, curvature) {
    const ptr0 = passArrayF32ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.projectToBall(ptr0, len0, curvature);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Compute vector norm
 * @param {Float32Array} x
 * @returns {number}
 */
export function vectorNorm(x) {
    const ptr0 = passArrayF32ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.vectorNorm(ptr0, len0);
    return ret;
}

/**
 * Compute squared vector norm
 * @param {Float32Array} x
 * @returns {number}
 */
export function vectorNormSquared(x) {
    const ptr0 = passArrayF32ToWasm0(x, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.vectorNormSquared(ptr0, len0);
    return ret;
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_8c4e43fe74559d73: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_04624de7d0e8332d: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8f0eb39a4a4c2f66: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_8fcf4ce7f1ca72a2: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_bbbb1c18aa2f5e25: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_0bc8482c6e3508ae: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_47fa6863be6f2f25: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_31b12575b56f32fc: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_0095a73b8b156f76: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_5ae8e5880f2c1fbd: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_cd444516edc5b180: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_9e4d92534c42d778: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_11888390b0186270: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_9dd77d8cd6671811: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_8ff4255516ccad3e: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_72fb696202c56729: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_389efe28435a9388: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_4708e0c13bdc8e95: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_crypto_86f2631e91b51511: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_entries_58c7934c745daac7: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_7534b8e9a36f1ab4: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_getRandomValues_b3f15fcbfabb0f8b: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_get_9b94d73e6221f75c: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_1dc361bd10053bfe: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_c367199e2fa2aa04: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_9b9075935c74707c: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isSafeInteger_bfbc7332a9768d2a: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_length_32ed9a279acd054c: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_35a7bace40f36eac: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_d562bbe83e0d4b91: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_361308b2356cecd0: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_3eb36ae241fe6f44: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_8a6f238a6ece86ea: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_dca287b076112a51: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_dd2b680c8bf6ae29: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_no_args_1c7c842f08d00ebb: function(arg0, arg1) {
            const ret = new Function(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_with_length_a2c39cbe88fd8ff1: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_e1f24f89a7336c2e: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_3975fd6c72f520aa: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_bdcdcc5842e4d77d: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_randomFillSync_f8c153b79f285817: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b74f47fc2d022fd6: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_set_1eb0999cf5d27fc8: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_3f1d0b984ed272ed: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_f43e577aea94465b: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_stack_0ed75d68575b0f3c: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_12837167ad935116: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_e628e89ab3b1c95f: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_a621d3dfbb60d0ce: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_f8727f0cf888e0bd: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_a96e1fef17ed23cb: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_versions_4e31226f5e8dc909: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./ruvector_hyperbolic_hnsw_wasm_bg.js": import0,
    };
}

const HyperbolicIndexFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hyperbolicindex_free(ptr >>> 0, 1));
const ShardedIndexFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_shardedindex_free(ptr >>> 0, 1));
const WasmSearchResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsearchresult_free(ptr >>> 0, 1));
const WasmTangentCacheFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmtangentcache_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
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

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ruvector_hyperbolic_hnsw_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
