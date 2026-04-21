function showGraphCanvas(){
    document.getElementById("rightPanel").innerHTML += "<canvas id='graphCanvas'></canvas>";
    graphCanvas.height=300;
    graphCanvas.width=400;
}
function graphProgress(){
    const graphCanvas=document.getElementById("graphCanvas");
    const graphCtx = graphCanvas.getContext("2d");
    graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

    graphCtx.beginPath();
    const progressArray = JSON.parse(localStorage.progress);
    const minVal = Math.min(...progressArray);
    const yRange = Math.max(...progressArray)-Math.min(...progressArray);
    const multiplier = graphCanvas.height / yRange;
    const xIncrement = .9*graphCanvas.width / progressArray.length;
    let i = 0;
    graphCtx.beginPath();
    graphCtx.moveTo(xIncrement, graphCanvas.height*.05 + .9*(graphCanvas.height-multiplier*(progressArray[0]-minVal)));
    progressArray.forEach((prog)=>{
        graphCtx.strokeStyle = "rgb(227, 138, 15)";
        graphCtx.lineWidth = 8;
        i+=1;
        graphCtx.lineTo(xIncrement*i, graphCanvas.height*.05 + .9*(graphCanvas.height-multiplier*(prog-minVal)));
    });
    graphCtx.stroke();


}