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
        
    }
    
    getTrack(){
        this.innerList = this.roadEditor.points;
        this.outerList=this.roadEditor.points2;
        this.checkPointList=this.roadEditor.checkPointListEditor;
        for(let i=0; i<this.innerList.length; i++){
            this.borders.push([this.innerList[i],this.innerList[(i+1)%this.innerList.length]]);
        }
        for(let i=0; i<this.outerList.length; i++){
            this.borders.push([this.outerList[i],this.outerList[(i+1)%this.outerList.length]]);
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

