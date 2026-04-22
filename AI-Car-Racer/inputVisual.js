function inputVisual(controlsArray){
    const inputCanvas=document.getElementById("inputCanvas");
    const inputCtx = inputCanvas.getContext("2d");
    const rectHeight=130;
    const rectWidth=130;
    inputCanvas.width = 600;
    inputCanvas.height = 300;

   boxColor({x:inputCanvas.width/2,y:inputCanvas.height - (.25*inputCanvas.width+rectHeight/2)}, controlsArray.forward, rectWidth, rectHeight, inputCtx);
   boxColor({x:inputCanvas.width/2,y:inputCanvas.height - rectHeight/2 - 10}, controlsArray.reverse, rectWidth, rectHeight, inputCtx);
   boxColor({x:inputCanvas.width/4,y:inputCanvas.height - rectHeight/2 - 10}, controlsArray.left, rectWidth, rectHeight, inputCtx);
   boxColor({x:3*inputCanvas.width/4,y:inputCanvas.height - rectHeight/2 - 10}, controlsArray.right, rectWidth, rectHeight, inputCtx);

}
function boxColor(coordinate, on, rectWidth, rectHeight, inputCtx){
    inputCtx.beginPath();
    inputCtx.fillStyle = on?"blue":"white";
    inputCtx.lineWidth = 4;
    inputCtx.rect(coordinate.x-rectWidth/2,coordinate.y-rectHeight/2,rectWidth,rectHeight);
    inputCtx.fill();
    inputCtx.stroke();
}
function showInputCanvas(){
    // Prefer the #liveData region (phase-4 template pins it high in the
    // panel so the NN viz stays visible without scrolling). index.html
    // ships an inert <canvas id="inputCanvas"> inside #rightPanel that
    // we relocate on phase-4 entry; if neither exists, create one fresh.
    const host = document.getElementById("liveData") || document.getElementById("rightPanel");
    let c = document.getElementById("inputCanvas");
    if (!c){
        c = document.createElement("canvas");
        c.id = "inputCanvas";
    }
    if (c.parentElement !== host){
        host.appendChild(c);
    }
}
function deleteInputCanvas(){
    const toDel = document.getElementById("inputCanvas");
    if (toDel){
        toDel.remove();
    }
}