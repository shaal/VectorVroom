// Uniform 2D grid for broad-phase culling of line segments against rays and
// polygons. Built once per track change (see Road.getTrack → road.rebuildGrid)
// and queried from Sensor#getReading, Car#assessDamage, Car#assessCheckpoint.
//
// Dedup strategy: each cell holds segment indices, and queries use a per-call
// epoch counter stamped on a `seen` array sized to the segment count. This
// avoids allocating a Set per query — at 1000 cars × 5 rays × 100 sim
// steps/rAF, allocator churn would dominate the savings.

class SpatialGrid {
    constructor(width, height, cellSize = 200){
        this.cellSize = cellSize;
        this.cols = Math.max(1, Math.ceil(width / cellSize));
        this.rows = Math.max(1, Math.ceil(height / cellSize));
        this.cells = new Array(this.cols * this.rows);
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
        this.segments = [];      // parallel to indices stored in cells
        this.seen = null;        // Int32Array, allocated on first query
        this.epoch = 0;
        // Scratch output array reused across queries so the hot path doesn't
        // allocate. Callers must consume results synchronously.
        this.out = [];
    }

    _cellIndex(cx, cy){
        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -1;
        return cy * this.cols + cx;
    }
    _toCell(x){ return Math.floor(x / this.cellSize); }
    _clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

    // Insert a segment [{x,y},{x,y}] and return its index in this.segments.
    addSegment(seg){
        const idx = this.segments.length;
        this.segments.push(seg);
        const minX = Math.min(seg[0].x, seg[1].x);
        const maxX = Math.max(seg[0].x, seg[1].x);
        const minY = Math.min(seg[0].y, seg[1].y);
        const maxY = Math.max(seg[0].y, seg[1].y);
        const cx0 = this._clamp(this._toCell(minX), 0, this.cols - 1);
        const cx1 = this._clamp(this._toCell(maxX), 0, this.cols - 1);
        const cy0 = this._clamp(this._toCell(minY), 0, this.rows - 1);
        const cy1 = this._clamp(this._toCell(maxY), 0, this.rows - 1);
        for (let cy = cy0; cy <= cy1; cy++){
            for (let cx = cx0; cx <= cx1; cx++){
                this.cells[cy * this.cols + cx].push(idx);
            }
        }
        return idx;
    }

    addSegments(segs){
        const ids = new Array(segs.length);
        for (let i = 0; i < segs.length; i++) ids[i] = this.addSegment(segs[i]);
        return ids;
    }

    // Ensure the seen-array is sized for the current segment count. Cheap:
    // one allocation per segment-count growth, not per query.
    _ensureSeen(){
        if (!this.seen || this.seen.length < this.segments.length){
            this.seen = new Int32Array(Math.max(32, this.segments.length * 2));
        }
    }

    // Query candidates whose AABB overlaps the given axis-aligned box.
    // Returns this.out (reused scratch); DO NOT retain across queries.
    queryAABB(minX, minY, maxX, maxY){
        this._ensureSeen();
        this.epoch++;
        const out = this.out;
        out.length = 0;
        const cx0 = this._clamp(this._toCell(minX), 0, this.cols - 1);
        const cx1 = this._clamp(this._toCell(maxX), 0, this.cols - 1);
        const cy0 = this._clamp(this._toCell(minY), 0, this.rows - 1);
        const cy1 = this._clamp(this._toCell(maxY), 0, this.rows - 1);
        const seen = this.seen, ep = this.epoch, cells = this.cells, cols = this.cols;
        for (let cy = cy0; cy <= cy1; cy++){
            for (let cx = cx0; cx <= cx1; cx++){
                const bucket = cells[cy * cols + cx];
                for (let k = 0; k < bucket.length; k++){
                    const id = bucket[k];
                    if (seen[id] !== ep){ seen[id] = ep; out.push(id); }
                }
            }
        }
        return out;
    }

    // Query candidates for a ray [A,B]. Uses the ray's AABB — cheap and plenty
    // selective for short rays (sensor ray length 400 vs canvas 3200×1800).
    // A true DDA walk would be tighter but costs more per-ray overhead; not
    // worth it at these ray lengths.
    queryRay(A, B){
        const minX = Math.min(A.x, B.x), maxX = Math.max(A.x, B.x);
        const minY = Math.min(A.y, B.y), maxY = Math.max(A.y, B.y);
        return this.queryAABB(minX, minY, maxX, maxY);
    }

    // Query candidates whose AABB overlaps a polygon's AABB. Polygon here is
    // an array of {x,y}.
    queryPolygon(poly){
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < poly.length; i++){
            const p = poly[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return this.queryAABB(minX, minY, maxX, maxY);
    }
}
