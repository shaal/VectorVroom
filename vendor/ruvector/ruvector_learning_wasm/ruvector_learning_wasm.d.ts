/* tslint:disable */
/* eslint-disable */

/**
 * WASM-exposed MicroLoRA engine
 */
export class WasmMicroLoRA {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adapt using input buffer as gradient
     */
    adapt(): void;
    /**
     * Adapt with typed array gradient
     */
    adapt_array(gradient: Float32Array): void;
    /**
     * Get adaptation count
     */
    adapt_count(): bigint;
    /**
     * Adapt with improvement reward using input buffer as gradient
     */
    adapt_with_reward(improvement: number): void;
    /**
     * Get delta norm (weight change magnitude)
     */
    delta_norm(): number;
    /**
     * Get embedding dimension
     */
    dim(): number;
    /**
     * Forward pass using internal buffers (zero-allocation)
     *
     * Write input to get_input_ptr(), call forward(), read from get_output_ptr()
     */
    forward(): void;
    /**
     * Forward pass with typed array input (allocates output)
     */
    forward_array(input: Float32Array): Float32Array;
    /**
     * Get forward pass count
     */
    forward_count(): bigint;
    /**
     * Snapshot the learned B matrix (rows concatenated: row0[0..dim] then row1[0..dim]).
     * Round-trips losslessly through `set_b` for persisting adapter state.
     */
    get_b(): Float32Array;
    /**
     * Get pointer to input buffer for direct memory access
     */
    get_input_ptr(): number;
    /**
     * Get pointer to output buffer for direct memory access
     */
    get_output_ptr(): number;
    /**
     * Create a new MicroLoRA engine
     *
     * @param dim - Embedding dimension (default 256, max 256)
     * @param alpha - Scaling factor (default 0.1)
     * @param learning_rate - Learning rate (default 0.01)
     */
    constructor(dim?: number | null, alpha?: number | null, learning_rate?: number | null);
    /**
     * Get parameter count
     */
    param_count(): number;
    /**
     * Reset the engine
     */
    reset(): void;
    /**
     * Restore a previously-snapshotted B matrix. Quietly no-ops if the
     * length doesn't match `2 * dim` — caller should treat that as "stale
     * snapshot, start fresh".
     */
    set_b(b: Float32Array): void;
}

/**
 * WASM-exposed Scoped LoRA manager
 */
export class WasmScopedLoRA {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adapt for operator type using input buffer as gradient
     */
    adapt(op_type: number): void;
    /**
     * Adapt with typed array
     */
    adapt_array(op_type: number, gradient: Float32Array): void;
    /**
     * Get adapt count for operator
     */
    adapt_count(op_type: number): bigint;
    /**
     * Adapt with improvement reward
     */
    adapt_with_reward(op_type: number, improvement: number): void;
    /**
     * Get delta norm for operator
     */
    delta_norm(op_type: number): number;
    /**
     * Forward pass for operator type (uses internal buffers)
     *
     * @param op_type - Operator type (0-16)
     */
    forward(op_type: number): void;
    /**
     * Forward pass with typed array
     */
    forward_array(op_type: number, input: Float32Array): Float32Array;
    /**
     * Get forward count for operator
     */
    forward_count(op_type: number): bigint;
    /**
     * Get input buffer pointer
     */
    get_input_ptr(): number;
    /**
     * Get output buffer pointer
     */
    get_output_ptr(): number;
    /**
     * Create a new scoped LoRA manager
     *
     * @param dim - Embedding dimension (max 256)
     * @param alpha - Scaling factor (default 0.1)
     * @param learning_rate - Learning rate (default 0.01)
     */
    constructor(dim?: number | null, alpha?: number | null, learning_rate?: number | null);
    /**
     * Reset all adapters
     */
    reset_all(): void;
    /**
     * Reset specific operator adapter
     */
    reset_scope(op_type: number): void;
    /**
     * Get operator scope name
     */
    static scope_name(op_type: number): string;
    /**
     * Enable/disable category fallback
     */
    set_category_fallback(enabled: boolean): void;
    /**
     * Get total adapt count
     */
    total_adapt_count(): bigint;
    /**
     * Get total forward count
     */
    total_forward_count(): bigint;
}

/**
 * WASM-exposed trajectory buffer
 */
export class WasmTrajectoryBuffer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get best attention type
     */
    best_attention(): number;
    /**
     * Get best improvement
     */
    best_improvement(): number;
    /**
     * Get trajectory count for operator
     */
    count_by_operator(op_type: number): number;
    /**
     * Get high quality trajectory count
     */
    high_quality_count(threshold: number): number;
    /**
     * Check if empty
     */
    is_empty(): boolean;
    /**
     * Get buffer length
     */
    len(): number;
    /**
     * Get mean improvement
     */
    mean_improvement(): number;
    /**
     * Create a new trajectory buffer
     *
     * @param capacity - Maximum number of trajectories to store
     * @param embedding_dim - Dimension of embeddings (default 256)
     */
    constructor(capacity?: number | null, embedding_dim?: number | null);
    /**
     * Record a trajectory
     *
     * @param embedding - Embedding vector (Float32Array)
     * @param op_type - Operator type (0-16)
     * @param attention_type - Attention mechanism used
     * @param execution_ms - Actual execution time
     * @param baseline_ms - Baseline execution time
     */
    record(embedding: Float32Array, op_type: number, attention_type: number, execution_ms: number, baseline_ms: number): void;
    /**
     * Reset buffer
     */
    reset(): void;
    /**
     * Get success rate
     */
    success_rate(): number;
    /**
     * Get total count
     */
    total_count(): bigint;
    /**
     * Get variance
     */
    variance(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmicrolora_free: (a: number, b: number) => void;
    readonly __wbg_wasmscopedlora_free: (a: number, b: number) => void;
    readonly __wbg_wasmtrajectorybuffer_free: (a: number, b: number) => void;
    readonly wasmmicrolora_adapt: (a: number) => void;
    readonly wasmmicrolora_adapt_array: (a: number, b: number, c: number) => void;
    readonly wasmmicrolora_adapt_count: (a: number) => bigint;
    readonly wasmmicrolora_adapt_with_reward: (a: number, b: number) => void;
    readonly wasmmicrolora_delta_norm: (a: number) => number;
    readonly wasmmicrolora_dim: (a: number) => number;
    readonly wasmmicrolora_forward: (a: number) => void;
    readonly wasmmicrolora_forward_array: (a: number, b: number, c: number, d: number) => void;
    readonly wasmmicrolora_forward_count: (a: number) => bigint;
    readonly wasmmicrolora_get_b: (a: number, b: number) => void;
    readonly wasmmicrolora_get_input_ptr: (a: number) => number;
    readonly wasmmicrolora_get_output_ptr: (a: number) => number;
    readonly wasmmicrolora_new: (a: number, b: number, c: number) => number;
    readonly wasmmicrolora_param_count: (a: number) => number;
    readonly wasmmicrolora_reset: (a: number) => void;
    readonly wasmmicrolora_set_b: (a: number, b: number, c: number) => void;
    readonly wasmscopedlora_adapt: (a: number, b: number) => void;
    readonly wasmscopedlora_adapt_array: (a: number, b: number, c: number, d: number) => void;
    readonly wasmscopedlora_adapt_count: (a: number, b: number) => bigint;
    readonly wasmscopedlora_adapt_with_reward: (a: number, b: number, c: number) => void;
    readonly wasmscopedlora_delta_norm: (a: number, b: number) => number;
    readonly wasmscopedlora_forward: (a: number, b: number) => void;
    readonly wasmscopedlora_forward_array: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmscopedlora_forward_count: (a: number, b: number) => bigint;
    readonly wasmscopedlora_get_input_ptr: (a: number) => number;
    readonly wasmscopedlora_get_output_ptr: (a: number) => number;
    readonly wasmscopedlora_new: (a: number, b: number, c: number) => number;
    readonly wasmscopedlora_reset_all: (a: number) => void;
    readonly wasmscopedlora_reset_scope: (a: number, b: number) => void;
    readonly wasmscopedlora_scope_name: (a: number, b: number) => void;
    readonly wasmscopedlora_set_category_fallback: (a: number, b: number) => void;
    readonly wasmscopedlora_total_adapt_count: (a: number) => bigint;
    readonly wasmscopedlora_total_forward_count: (a: number) => bigint;
    readonly wasmtrajectorybuffer_best_attention: (a: number) => number;
    readonly wasmtrajectorybuffer_best_improvement: (a: number) => number;
    readonly wasmtrajectorybuffer_count_by_operator: (a: number, b: number) => number;
    readonly wasmtrajectorybuffer_high_quality_count: (a: number, b: number) => number;
    readonly wasmtrajectorybuffer_is_empty: (a: number) => number;
    readonly wasmtrajectorybuffer_len: (a: number) => number;
    readonly wasmtrajectorybuffer_mean_improvement: (a: number) => number;
    readonly wasmtrajectorybuffer_new: (a: number, b: number) => number;
    readonly wasmtrajectorybuffer_record: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly wasmtrajectorybuffer_reset: (a: number) => void;
    readonly wasmtrajectorybuffer_success_rate: (a: number) => number;
    readonly wasmtrajectorybuffer_total_count: (a: number) => bigint;
    readonly wasmtrajectorybuffer_variance: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
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
