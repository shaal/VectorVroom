class Road{
    constructor(startInfo){
        this.roadEditor = new roadEditor(startInfo);
        this.left=0;
        this.right=canvas.width;
        this.top=0;
        this.bottom=canvas.height;

        const topLeft={x:this.left,y:this.top};
        const topRight={x:this.right,y:this.top};
        const bottomLeft={x:this.left,y:this.bottom};
        const bottomRight={x:this.right,y:this.bottom};

        this.innerList=[];
        this.outerList=[];
        this.checkPointList = [];
        this.crossed = Array(this.checkPointList.length);
        this.borders=[
            [topLeft,bottomLeft],
            [topRight,bottomRight],
            [topLeft,topRight],
            [bottomLeft,bottomRight]
        ];
        // Broad-phase grids. Built in getTrack() once track/checkpoints are
        // finalised; Sensor + Car consume via road.borderGrid / road.cpGrid.
        this.borderGrid = null;
        this.cpGrid = null;
    }

    getTrack(){
        this.innerList = this.roadEditor.points;
        this.outerList=this.roadEditor.points2;
        this.checkPointList=this.roadEditor.checkPointListEditor;
        // Reset borders to just the canvas edges before appending wall
        // segments. Without this, repeated calls (e.g. nextPhase triggers
        // submitTrack on both phase-3 and phase-4 transitions, so auto-boot
        // calls getTrack twice) leave duplicated wall segments in borders
        // and balloon the collision-test workload.
        const w = this.right - this.left;
        const h = this.bottom - this.top;
        this.borders = [
            [{x:this.left,  y:this.top   },{x:this.left,  y:this.bottom}],
            [{x:this.right, y:this.top   },{x:this.right, y:this.bottom}],
            [{x:this.left,  y:this.top   },{x:this.right, y:this.top   }],
            [{x:this.left,  y:this.bottom},{x:this.right, y:this.bottom}]
        ];
        for(let i=0; i<this.innerList.length; i++){
            this.borders.push([this.innerList[i],this.innerList[(i+1)%this.innerList.length]]);
        }
        for(let i=0; i<this.outerList.length; i++){
            this.borders.push([this.outerList[i],this.outerList[(i+1)%this.outerList.length]]);
        }
        this.rebuildGrids();
    }

    // Rebuild the broad-phase grids from whatever's currently in
    // this.borders + this.checkPointList. Safe to call repeatedly.
    rebuildGrids(){
        const w = this.right - this.left;
        const h = this.bottom - this.top;
        this.borderGrid = new SpatialGrid(w, h, 200);
        this.borderGrid.addSegments(this.borders);
        // Checkpoints are stored as 2-point segments too — reuse the same
        // grid abstraction but a separate index so sensor queries don't trip
        // on checkpoint geometry and vice versa.
        this.cpGrid = new SpatialGrid(w, h, 200);
        if (this.checkPointList && this.checkPointList.length){
            this.cpGrid.addSegments(this.checkPointList);
        }
    }

    draw(ctx){
        this.roadEditor.redraw();
        // ctx.lineWidth=5;
        // ctx.strokeStyle="white";
        
        // ctx.setLineDash([]);
        // this.borders.forEach(border=>{
        //     ctx.beginPath();
        //     ctx.moveTo(border[0].x,border[0].y);
        //     ctx.lineTo(border[1].x,border[1].y);
        //     ctx.stroke();
        // });  

        
        // //ctx.fillStyle="white";
        // //ctx.fill();
        // ctx.strokeStyle="white";
        // ctx.lineWidth = 10;
        // ctx.stroke();
        // this.checkPointList.forEach(checkPoint=>{
        //     ctx.beginPath();
        //     ctx.strokeStyle="red";
        //     ctx.moveTo(checkPoint[0].x,checkPoint[0].y);
        //     ctx.lineTo(checkPoint[1].x,checkPoint[1].y);
        //     ctx.stroke();
        // });
    }
}

