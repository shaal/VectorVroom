class roadEditor{
    constructor(startInfo){
        this.startInfo=startInfo;
        this.checkPointMode=false;
        this.editMode = true;
        if(localStorage.getItem("trackInner") && localStorage.getItem("trackOuter")){
            this.points=JSON.parse(localStorage.getItem("trackInner"));
            this.points2=JSON.parse(localStorage.getItem("trackOuter"));
        }
        else{
            this.points = [{x:startInfo.x-4*startInfo.startWidth,y:startInfo.y+4*startInfo.startWidth},{x:startInfo.x-3*startInfo.startWidth,y:startInfo.y-3*startInfo.startWidth}];
            this.points2 = [{x:startInfo.x+4*startInfo.startWidth,y:startInfo.y+4*startInfo.startWidth},{x:startInfo.x+3*startInfo.startWidth,y:startInfo.y-3*startInfo.startWidth}];
        }
        if(localStorage.getItem("checkPointList")){
            this.checkPointListEditor=JSON.parse(localStorage.getItem("checkPointList"));
        }
        else{
            this.checkPointListEditor = [[{x:startInfo.x-5*startInfo.startWidth,y:startInfo.y-startInfo.startWidth},{x:startInfo.x+5*startInfo.startWidth,y:startInfo.y-startInfo.startWidth}]];
        }
        this.drag_point = -1;
        this.pointSize = startInfo.startWidth/1.5;
        this.canvas = document.getElementById("myCanvas");
        this.ctx=document.getElementById("myCanvas").getContext("2d");
        this.#addMouseListeners();
        this.lastClicked=this.drag_point;
    }
    checkPointModeChange(onOff){
        this.checkPointMode = onOff;
    }
    editModeChange(onOff){
        this.editMode = onOff;
    }

    getPointAt(x, y) {
        if(this.checkPointMode){
            for (var i = 0; i < this.checkPointListEditor.length; i++) {
                for(var j=0; j<2;j++){
                    if (
                        Math.abs(this.checkPointListEditor[i][j].x - x) < this.pointSize &&
                        Math.abs(this.checkPointListEditor[i][j].y - y) < this.pointSize
                      )
                        return [i,j];
                }
              }
        }
        else{
            for (var i = 0; i < this.points.length; i++) {
                if (
                  Math.abs(this.points[i].x - x) < this.pointSize &&
                  Math.abs(this.points[i].y - y) < this.pointSize
                )
                  return {index: i, list: 1};
              }
            for (var i = 0; i < this.points2.length; i++) {
                if (
                Math.abs(this.points2[i].x - x) < this.pointSize &&
                Math.abs(this.points2[i].y - y) < this.pointSize
                )
                return {index: i, list: 2};
            }
        }
  
        return -1; 
    }
    redraw() {
        // this.canvas = document.getElementById("myCanvas");
        // this.ctx=document.getElementById("myCanvas").getContext("2d");
        if (this.points.length > 0) {
            this.ctx.clearRect(0, 0, canvas.width, canvas.height);
            if(this.editMode){
                this.drawCircles();
            }
            this.drawLines();
        }
       this.drawStartPos(this.startInfo, this.ctx);
    }
    drawLines() {
        this.ctx.beginPath();
        this.ctx.moveTo(this.points[0].x, this.points[0].y);
        this.ctx.strokeStyle = "white";
        this.ctx.lineWidth = 2;
        this.points.forEach((p) => {
            this.ctx.lineTo(p.x, p.y);
        })
        this.ctx.stroke();
        this.ctx.lineWidth = this.editMode?.75:2;
        this.ctx.globalAlpha = this.editMode?.2:1;
        this.ctx.lineTo(this.points[0].x,this.points[0].y);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;

        this.ctx.beginPath();
        this.ctx.moveTo(this.points2[0].x, this.points2[0].y);
        this.ctx.strokeStyle = "white";
        this.ctx.lineWidth = 2;
        this.points2.forEach((p) => {
            this.ctx.lineTo(p.x, p.y);
        })
        this.ctx.stroke();
        this.ctx.lineWidth = this.editMode?.75:2;
        this.ctx.globalAlpha = this.editMode?.2:1;
        this.ctx.lineTo(this.points2[0].x,this.points2[0].y);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;

        this.ctx.strokeStyle = "green";
        this.ctx.lineWidth = 2;
        this.checkPointListEditor.forEach((p)=>{
            this.ctx.beginPath();
            this.ctx.moveTo(p[0].x,p[0].y);
            this.ctx.lineTo(p[1].x,p[1].y);
            this.ctx.stroke();
        })
    }
    deleteLast(){
        if(this.checkPointMode && typeof this.lastClicked[1] != 'undefined' && this.checkPointListEditor.length>1){
            this.checkPointListEditor.splice(this.lastClicked[0],1);
        }
        else if(typeof this.lastClicked.index != 'undefined' && this.editMode){
            if(this.lastClicked.list == 1 && this.points.length>1){
                this.points.splice(this.lastClicked.index,1);   
                if(this.lastClicked.index == this.points.length){ //shift index to last point for delete multiple times
                    this.lastClicked.index--;
                }
            }
            else if (this.lastClicked.list==2 && this.points2.length>1){
                this.points2.splice(this.lastClicked.index,1);
                if(this.lastClicked.index == this.points2.length){
                    this.lastClicked.index--;
                }
            }
        }
    }

    // getPosition(event) {
    //     var rect = this.canvas.getBoundingClientRect();
    //     var x = event.clientX - rect.left;
    //     var y = event.clientY - rect.top;
    //     return {x, y};
    // }
    getPosition(evt) {
        var rect = this.canvas.getBoundingClientRect(), // abs. size of element
        scaleX = this.canvas.width / rect.width,    // relationship bitmap vs. element for x
        scaleY = this.canvas.height / rect.height;  // relationship bitmap vs. element for y
        var x = (evt.clientX - rect.left) * scaleX;
        var y = (evt.clientY - rect.top) * scaleY;
        return {x,y};
      }
      

    drawCircles() {
        if(!this.checkPointMode){
            this.ctx.strokeStyle = "red";
            this.ctx.lineWidth = 3;
            this.points.forEach((p) => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, this.pointSize, 0, Math.PI * 2, true);
                this.ctx.stroke();
            })
    
            this.ctx.strokeStyle = "blue";
            this.ctx.lineWidth = 4;
            this.points2.forEach((p) => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, this.pointSize, 0, Math.PI * 2, true);
                this.ctx.stroke();
            })
        }
 

        if(this.checkPointMode){
            this.ctx.strokeStyle = "green";
            this.ctx.lineWidth = 3;
            this.checkPointListEditor.forEach((p) => {
                this.ctx.beginPath();
                this.ctx.arc(p[0].x, p[0].y, this.pointSize, 0, Math.PI * 2, true);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(p[1].x, p[1].y, this.pointSize, 0, Math.PI * 2, true);
                this.ctx.stroke();
            })
        }
  
    }
    
    #addMouseListeners(){
        window.oncontextmenu = function ()
        {
            return false;     // cancel default menu
        }
        canvas.onmousedown = function(e) {
            var pos = road.roadEditor.getPosition(e);
            let rightClick = e.button == 2; //gets right click
            let leftClick = e.button == 0;
            road.roadEditor.drag_point = road.roadEditor.getPointAt(pos.x, pos.y);
            if (leftClick && !road.roadEditor.checkPointMode && road.roadEditor.editMode){
                if (road.roadEditor.drag_point == -1) {
                    road.roadEditor.points.push(pos);
                    road.roadEditor.redraw();
                }
            }
            else if (rightClick && !road.roadEditor.checkPointMode && road.roadEditor.editMode){
                if (road.roadEditor.drag_point == -1) {
                    road.roadEditor.points2.push(pos);
                    road.roadEditor.redraw();
                }
            }
            else if(road.roadEditor.checkPointMode && road.roadEditor.editMode){
                if (road.roadEditor.drag_point == -1) {
                    road.roadEditor.checkPointListEditor.push([pos,{x:pos.x+100,y:pos.y}]);
                    road.roadEditor.redraw();
                } 
            }
          };
        canvas.onmousemove = function(e) {
        if (road.roadEditor.drag_point != -1) {
            var pos = road.roadEditor.getPosition(e);
            if (road.roadEditor.editMode && road.roadEditor.drag_point.list==1 && !road.roadEditor.checkPointMode){
                road.roadEditor.points[road.roadEditor.drag_point.index].x = pos.x;
                road.roadEditor.points[road.roadEditor.drag_point.index].y = pos.y;
            }
            else if (road.roadEditor.editMode && road.roadEditor.drag_point.list==2 &&!road.roadEditor.checkPointMode){
                road.roadEditor.points2[road.roadEditor.drag_point.index].x = pos.x;
                road.roadEditor.points2[road.roadEditor.drag_point.index].y = pos.y;
            }
            else if(road.roadEditor.checkPointMode && road.roadEditor.editMode){
                road.roadEditor.checkPointListEditor[road.roadEditor.drag_point[0]][road.roadEditor.drag_point[1]].x = pos.x;
                road.roadEditor.checkPointListEditor[road.roadEditor.drag_point[0]][road.roadEditor.drag_point[1]].y = pos.y;
            }
            road.roadEditor.redraw(); 
        }
        };
        canvas.onmouseup = function(e) {
            if(road.roadEditor.drag_point !=-1){
                road.roadEditor.lastClicked=road.roadEditor.drag_point;
            }
            else{
                var pos = road.roadEditor.getPosition(e);
                road.roadEditor.lastClicked= road.roadEditor.getPointAt(pos.x, pos.y);
            }
            road.roadEditor.drag_point = -1;
        }; 
    }
    drawStartPos(startInfo, ctx){
        ctx.lineWidth = 3;
        ctx.strokeStyle = "white";
        ctx.beginPath();
        ctx.moveTo(startInfo.x,startInfo.y);
        ctx.lineTo(startInfo.x+startInfo.startWidth,startInfo.y+startInfo.startWidth);
        ctx.lineTo(startInfo.x-startInfo.startWidth,startInfo.y+startInfo.startWidth);
        ctx.lineTo(startInfo.x,startInfo.y);
        ctx.closePath();
        ctx.fillStyle="red";
        ctx.fill();
        ctx.stroke();
        ctx.font = "bold 3em Tahoma";
        ctx.textAlign = 'center';
        ctx.fillStyle = "white";
        ctx.fillText("START",startInfo.x,startInfo.y+ startInfo.startWidth+3*parseFloat(getComputedStyle(document.getElementById("fullDisplay")).fontSize));
    }
}
