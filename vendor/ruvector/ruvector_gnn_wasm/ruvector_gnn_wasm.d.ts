/* tslint:disable */
/* eslint-disable */

/**
 * Graph Neural Network layer for HNSW topology
 */
export class JsRuvectorLayer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Forward pass through the GNN layer
     *
     * # Arguments
     * * `node_embedding` - Current node's embedding (Float32Array)
     * * `neighbor_embeddings` - Embeddings of neighbor nodes (array of Float32Arrays)
     * * `edge_weights` - Weights of edges to neighbors (Float32Array)
     *
     * # Returns
     * Updated node embedding (Float32Array)
     */
    forward(node_embedding: Float32Array, neighbor_embeddings: any, edge_weights: Float32Array): Float32Array;
    /**
     * Create a new GNN layer
     *
     * # Arguments
     * * `input_dim` - Dimension of input node embeddings
     * * `hidden_dim` - Dimension of hidden representations
     * * `heads` - Number of attention heads
     * * `dropout` - Dropout rate (0.0 to 1.0)
     */
    constructor(input_dim: number, hidden_dim: number, heads: number, dropout: number);
    /**
     * Get the output dimension of this layer
     */
    readonly outputDim: number;
}

/**
 * Tensor compressor with adaptive level selection
 */
export class JsTensorCompress {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Compress an embedding based on access frequency
     *
     * # Arguments
     * * `embedding` - The input embedding vector (Float32Array)
     * * `access_freq` - Access frequency in range [0.0, 1.0]
     *   - f > 0.8: Full precision (hot data)
     *   - f > 0.4: Half precision (warm data)
     *   - f > 0.1: 8-bit PQ (cool data)
     *   - f > 0.01: 4-bit PQ (cold data)
     *   - f <= 0.01: Binary (archive)
     *
     * # Returns
     * Compressed tensor as JsValue
     */
    compress(embedding: Float32Array, access_freq: number): any;
    /**
     * Compress with explicit compression level
     *
     * # Arguments
     * * `embedding` - The input embedding vector
     * * `level` - Compression level ("none", "half", "pq8", "pq4", "binary")
     *
     * # Returns
     * Compressed tensor as JsValue
     */
    compressWithLevel(embedding: Float32Array, level: string): any;
    /**
     * Decompress a compressed tensor
     *
     * # Arguments
     * * `compressed` - Serialized compressed tensor (JsValue)
     *
     * # Returns
     * Decompressed embedding vector (Float32Array)
     */
    decompress(compressed: any): Float32Array;
    /**
     * Get compression ratio estimate for a given access frequency
     *
     * # Arguments
     * * `access_freq` - Access frequency in range [0.0, 1.0]
     *
     * # Returns
     * Estimated compression ratio (original_size / compressed_size)
     */
    getCompressionRatio(access_freq: number): number;
    /**
     * Create a new tensor compressor
     */
    constructor();
}

/**
 * Query configuration for differentiable search
 */
export class SearchConfig {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create a new search configuration
     */
    constructor(k: number, temperature: number);
    /**
     * Number of top results to return
     */
    k: number;
    /**
     * Temperature for softmax (lower = sharper, higher = smoother)
     */
    temperature: number;
}

/**
 * Compute cosine similarity between two vectors
 *
 * # Arguments
 * * `a` - First vector (Float32Array)
 * * `b` - Second vector (Float32Array)
 *
 * # Returns
 * Cosine similarity score [-1.0, 1.0]
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number;

/**
 * Differentiable search using soft attention mechanism
 *
 * # Arguments
 * * `query` - The query vector (Float32Array)
 * * `candidate_embeddings` - List of candidate embedding vectors (array of Float32Arrays)
 * * `config` - Search configuration (k and temperature)
 *
 * # Returns
 * Object with indices and weights for top-k candidates
 */
export function differentiableSearch(query: Float32Array, candidate_embeddings: any, config: SearchConfig): any;

/**
 * Hierarchical forward pass through multiple GNN layers
 *
 * # Arguments
 * * `query` - The query vector (Float32Array)
 * * `layer_embeddings` - Embeddings organized by layer (array of arrays of Float32Arrays)
 * * `gnn_layers` - Array of GNN layers to process through
 *
 * # Returns
 * Final embedding after hierarchical processing (Float32Array)
 */
export function hierarchicalForward(query: Float32Array, layer_embeddings: any, gnn_layers: JsRuvectorLayer[]): Float32Array;

/**
 * Initialize panic hook for better error messages
 */
export function init(): void;

/**
 * Get version information
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_searchconfig_k: (a: number) => number;
    readonly __wbg_get_searchconfig_temperature: (a: number) => number;
    readonly __wbg_jsruvectorlayer_free: (a: number, b: number) => void;
    readonly __wbg_jstensorcompress_free: (a: number, b: number) => void;
    readonly __wbg_searchconfig_free: (a: number, b: number) => void;
    readonly __wbg_set_searchconfig_k: (a: number, b: number) => void;
    readonly __wbg_set_searchconfig_temperature: (a: number, b: number) => void;
    readonly cosineSimilarity: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly differentiableSearch: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly hierarchicalForward: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly init: () => void;
    readonly jsruvectorlayer_forward: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly jsruvectorlayer_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly jsruvectorlayer_outputDim: (a: number) => number;
    readonly jstensorcompress_compress: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly jstensorcompress_compressWithLevel: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly jstensorcompress_decompress: (a: number, b: number, c: number) => void;
    readonly jstensorcompress_getCompressionRatio: (a: number, b: number) => number;
    readonly jstensorcompress_new: () => number;
    readonly version: (a: number) => void;
    readonly searchconfig_new: (a: number, b: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
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
