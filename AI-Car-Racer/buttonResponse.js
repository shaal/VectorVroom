function pauseGame(){
    pause=!pause;
    document.getElementById("pause").textContent = pause?"Play":"Pause";
}
function save(){
    const progressVal = bestCar.checkPointsCount+bestCar.laps*road.checkPointList.length/seconds;
    if(localStorage.getItem("progress")){
        var progressArray = JSON.parse(localStorage.getItem("progress"));
        progressArray.push(fastLap);
        localStorage.setItem("progress",JSON.stringify(progressArray));
    }
    else{
        localStorage.setItem("progress",JSON.stringify([fastLap]));
    }
    localStorage.setItem("oldBestBrain",(localStorage.getItem("bestBrain")));
    localStorage.setItem("bestBrain",JSON.stringify(bestCar.brain));
}
function restoreOldBrain(){
    localStorage.setItem("bestBrain", localStorage.getItem("oldBestBrain"));
    restartBatch();
}
function resetFastLap(){
    fastLap = '--';
}
function destroyBrain(){
    localStorage.removeItem("bestBrain");
    localStorage.removeItem("fastLap");
    fastLap="--";
}
function submitTrack(){
    road.getTrack();
    road.roadEditor.checkPointModeChange(false);
    road.roadEditor.editModeChange(false);
}
function deleteTrack(){
    if(localStorage.getItem("trackInner")){
        localStorage.removeItem("trackInner");
    }
    if(localStorage.getItem("trackOuter")){
        localStorage.removeItem("trackOuter");
    }
    if(localStorage.getItem("checkPointList")){
        localStorage.removeItem("checkPointList");
    }
    location.reload();
}
function saveTrack(){
    localStorage.setItem("trackInner",JSON.stringify(road.roadEditor.points));
    localStorage.setItem("trackOuter",JSON.stringify(road.roadEditor.points2))
    localStorage.setItem("checkPointList",JSON.stringify(road.roadEditor.checkPointListEditor))
}
function savePhysics(){
    localStorage.setItem("maxSpeed", JSON.stringify(maxSpeed));
    localStorage.setItem("traction", traction);
}
function checkPoint(onOff){
    road.roadEditor.checkPointModeChange(onOff);
}
function deleteLastPoint(){
    road.roadEditor.deleteLast();
}
function resetTrainCount(){
    localStorage.setItem("trainCount", JSON.stringify(0));
    localStorage.setItem("progress", JSON.stringify([]));
}
function nextPhase(){
    phase+=1;
    switch(phase){
        case 1:
            road.roadEditor.checkPointModeChange(false);
            road.roadEditor.editModeChange(true);
            phaseToLayout(phase);
            break;
        case 2:
            road.roadEditor.editModeChange(true);
            road.roadEditor.checkPointModeChange(true);
            phaseToLayout(phase);
            break;
        case 3:
            road.roadEditor.checkPointModeChange(false);
            road.roadEditor.editModeChange(false);
            phaseToLayout(phase);
            saveTrack();            
            submitTrack();
            
            break;
        case 4:
            begin();
            road.roadEditor.checkPointModeChange(false);
            road.roadEditor.editModeChange(false);
            phaseToLayout(phase);
            submitTrack();
            // pauseGame();
            break;
    }
}
function backPhase(){
    phase-=2;
    nextPhase();
}
function setN(value){
    batchSize=value;
}
function setSeconds(value){
    nextSeconds=value;
}
function setMutateValue(value){
    mutateValue=value;
}
function restartBatch(){
    begin();
}
function setMaxSpeed(value){
    maxSpeed = value;
    begin();
}
function makeInvincible(){
    playerCar.invincible = !playerCar.invincible;
    playerCar2.invincible = !playerCar2.invincible;
    invincible = playerCar.invincible;
    document.getElementById('hide').innerText = playerCar.invincible?"Invincible Off":"Invincible On";
}
function setTraction(value){
    traction = value;
    begin();
}