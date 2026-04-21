const canvas=document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");
// canvas.width=window.innerWidth*.8;
// canvas.height=window.innerHeight;
canvas.width = 3200;
canvas.height = 1800;
// canvas.style.width="100px";
// canvas.style.height="100px";

const startInfo = {x: canvas.width - canvas.width/10, y: canvas.height/2, startWidth: canvas.width/40};
const road=new Road(startInfo);
var batchSize = 10;
var nextSeconds = 15;
var seconds;
var mutateValue = .3;
var cars;
var playerCar;
var playerCar2;
let bestCar;
var invincible=false;
var traction=1;

var frameCount = 0;
var fastLap = '--';

var acceleration = .05;
var breakAccel = .05;
// cars[0].update(road.borders, road.checkPointList);//create polygon
let pause=true;
var phase = 0; //0 welcome, 1 track, 2 checkpoints, 3 physics, 4 training
var maxSpeed = 8;
nextPhase();
if (localStorage.getItem("traction")){
    traction=JSON.parse(localStorage.getItem("traction"));
}
if (localStorage.getItem("maxSpeed")){
    maxSpeed=JSON.parse(localStorage.getItem("maxSpeed"));
}
if (localStorage.getItem("fastLap")){
    fastLap = JSON.parse(localStorage.getItem("fastLap"));
}
function begin(){
    seconds = nextSeconds;
    pause=false;
    playerCar = new Car(startInfo.x,startInfo.y,30,50,"KEYS",maxSpeed);
    playerCar2 = new Car(startInfo.x,startInfo.y,30,50,"WASD",maxSpeed);
    cars=generateCars(batchSize);
    // cars[0].update(road.borders, road.checkPointList);//create polygon
    frameCount=0;
    if(localStorage.getItem("bestBrain")){
        for(let i = 0; i<cars.length;i++){
            cars[i].brain=JSON.parse(localStorage.getItem("bestBrain"));
            if(i!=0){
                NeuralNetwork.mutate(cars[i].brain,mutateValue);
            }
        }
        // bestCar.brain=JSON.parse(localStorage.getItem("bestBrain"));
    }
    bestCar = cars[0];
}

// if(localStorage.getItem("bestBrain")){
//     for(let i = 0; i<cars.length;i++){
//         cars[i].brain=JSON.parse(localStorage.getItem("bestBrain"));
//         if(i!=1){
//             NeuralNetwork.mutate(cars[i].brain,.2);
//         }
//     }
//     // bestCar.brain=JSON.parse(localStorage.getItem("bestBrain"));
// }

// graphProgress();
begin();
animate();
function generateCars(N){
    const cars = [];
    for(let i=0; i<N; i++){
        cars.push(new Car(startInfo.x,startInfo.y,30,50,"AI",maxSpeed));
    }
    return cars;
}


function nextBatch(){
    if(localStorage.getItem("trainCount")){
        localStorage.setItem("trainCount", JSON.stringify(JSON.parse(localStorage.getItem("trainCount"))+1));
    }
    else{
        localStorage.setItem("trainCount", JSON.stringify(1));
    }
    if(bestCar){
        save();
    }
    if(bestCar.laps>0 && (Math.min(...bestCar.lapTimes) < fastLap || fastLap=='--')){
        fastLap = Math.min(...bestCar.lapTimes);
        localStorage.setItem('fastLap', JSON.stringify(fastLap));
    }
    begin();
    // location.reload();
}
function animate(){
    road.draw(ctx);
    // canvas.style.width = String(Math.min(window.innerWidth*.8, 16/9*window.innerHeight)) + "px";
    // canvas.style.height = String(Math.min(9/16*window.innerWidth*.8, window.innerHeight)) + "px";
    // road.draw(ctx);
    if(phase==3){
        playerCar.update(road.borders, road.checkPointList);
        playerCar.draw(ctx,"red",true);
        playerCar2.update(road.borders, road.checkPointList);
        playerCar2.draw(ctx,"blue",true);
    }
    if(phase==4){        
        const timer = document.getElementById("timer");
        timer.innerHTML = "<p>Game Time: " + String((frameCount/60).toFixed(2)) + "</p>";
        timer.innerHTML += "<p>Fast Lap: " + fastLap.toFixed(2) + "</p>";
        if(frameCount==60*seconds){
            nextBatch();
        }
        // canvas.height=window.innerHeight;
        // canvas.width=window.innerWidth*.8;
        ctx.save();
        // ctx.translate(-car.x+canvas.width*0.5,-car.y+canvas.height*0.5);

        if(!pause){
            frameCount+=1;
            for(let i=0;i<cars.length;i++){
                cars[i].update(road.borders, road.checkPointList);
            }
            playerCar.update(road.borders, road.checkPointList);
            playerCar2.update(road.borders, road.checkPointList);
            // car.update(road.borders, road.checkPointList);

            testBestCar=cars.find(
                c=>(c.checkPointsCount+c.laps*road.checkPointList.length)==Math.max(
                    ...cars.map(c=>c.checkPointsCount+c.laps*road.checkPointList.length)
            ));
            if (testBestCar.checkPointsCount+testBestCar.laps*road.checkPointList.length > bestCar.checkPointsCount+bestCar.laps*road.checkPointList.length){
                bestCar = testBestCar;
            }
            // cars[0] = bestCar;
            

            
            
            ctx.globalAlpha=.2;
            for(let i=0;i<cars.length;i++){
                cars[i].draw(ctx,"rgb(227, 138, 15)");
            }
            ctx.globalAlpha=1;
            if(bestCar){
                inputVisual(bestCar.controls);
                bestCar.draw(ctx,"rgb(227, 138, 15)",true);
            }
            playerCar.draw(ctx,"red",true);
            playerCar2.draw(ctx,"blue",true);

            ctx.restore();
        }
    }
    requestAnimationFrame(animate);
}

//'{"levels":[{"inputs":[0.495606189201673,0.15726215616367423,0,0.6062034072393743,0.7496399637888809],"outputs":[1,0,1,0,0,1],"biases":[-0.013740731634192205,0.6951143976529082,-0.5697816444261132,0.1256929635933952,0.49673130416849576,0.6373846513146026],"weights":[[0.9240140833302606,0.25091394484609575,-0.4077179156441786,0.21592532139427467,-0.6862378192394485,0.697398523618745],[0.3211162914201262,0.2615854303788545,0.4746093050272915,0.8033437683176308,-0.7341054748796783,-0.916951464044971],[-0.18507903730366992,0.42927022661166125,0.306261891088051,-0.3837882586456778,0.952567592490035,0.8542800790925975],[0.22172773706975413,-0.5215198285643297,-0.4920542534845125,-0.9291969638628683,-0.8856946763484408,0.3938602710681609],[-0.8410642961250265,0.7579906650045083,0.32516678866065174,-0.30754302421501567,0.8750073921299881,0.4999127605665361]]},{"inputs":[1,0,1,0,0,1],"outputs":[1,0,0,0],"biases":[-0.8566061993749825,0.4250344074205392,0.4059436542760504,0.9283323169289042],"weights":[[-0.03284571525471147,-0.07174304448134672,0.9705226282848525,0.4786108058481413],[-0.5219072138022529,0.6678782301476365,0.4635492145127511,-0.776407850244115],[-0.04195812585225989,0.3497316343546939,-0.1768704063971387,-0.32871733563395233],[0.23344650987322257,0.09045178035212231,0.4046143644666751,0.09849445965256542],[-0.6279687724901417,0.8853891662508939,0.3327718864420204,-0.17241258720460628],[0.35115347757846305,0.0889499918491552,-0.9644183785501652,-0.6884814126502978]]}]}'
//'{"levels":[{"inputs":[0.6395045484555228,0.4359628418308088,0.07340465472849844,0,0.5535612099823177,0.990906584451451],"outputs":[1,0,0,1,1,1,1,1],"biases":[-0.014753822021949163,0.04896634890272357,0.17863768300993674,-0.049642725490895226,0.08749957520037199,-0.012076978772172313,-0.024113772931165768,-0.0824189041813355],"weights":[[0.004229355580572908,0.000057785402906351027,0.10202159780807353,0.09153950174283897,-0.07499968554856666,0.05564797190966312,0.1674938026016347,-0.058192893467054176],[-0.03776941179254002,0.02041705942976021,0.032273336905924085,0.11818418505990481,0.15377965457906564,-0.1596019978693655,0.10187209329255824,0.03959848238860798],[-0.2174667597309811,-0.07272935607093334,-0.06465008743518509,0.11144079503383379,0.17604593586544665,0.08052515820563311,-0.07377492573213228,-0.07299743852666632],[-0.08001452281427013,-0.05627433517866529,0.1323809223215508,0.06883154729866059,-0.1069947772202646,0.017189481890519113,0.06646921038871915,-0.10954474392674232],[0.10324057404054585,-0.033169402656589804,0.1243432482177765,0.2911866883255414,0.10710591144952915,-0.06791835003015999,-0.15711745229792942,-0.07939053369353453],[0.00713515703851305,0.04375518955271324,0.009546386053716866,0.12836467415280342,0.0004795055449842196,0.11041345561610985,0.07979696667846176,0.10848388629251672]]},{"inputs":[1,0,0,1,1,1,1,1],"outputs":[1,0,1,0],"biases":[-0.071187096884142,-0.11687737138672825,-0.06599828084390714,-0.014383456122405847],"weights":[[0.17954521532131484,-0.0008988777384373932,-0.01595166196304911,-0.008515858675526226],[-0.16087191702292633,-0.05851075061941579,0.0072468339910833224,0.02166515761043868],[-0.20319128977863793,0.10329997860690525,0.041146891092939536,0.12659916059847753],[0.15803835303689934,-0.018908640750950365,-0.044571817776129556,0.2662485368606925],[-0.029798744533117212,-0.0235886279849129,0.05718211675393633,-0.07455804284353565],[-0.040516174435908076,0.042343716704855816,-0.005914512722737507,-0.1577147593553106],[-0.010486600089340629,-0.11350580663223411,0.10351770538874087,-0.062077254056490914],[0.042770330368817125,-0.020104603820007422,0.13634648255306495,-0.0216467940618405]]}]}'