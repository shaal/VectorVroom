class Car{
    constructor(x,y,width,height,controlType, maxSpeed=3){
        this.origin={x:x,y:y};
        this.x=x;
        this.y=y;
        this.width=width;
        this.height=height;
        if(controlType == "KEYS" || controlType == "WASD"){
            this.invincible=invincible;
        }
        this.lapTimes='--';

        this.velocity={x:0,y:0};
        this.speed=0;
        this.acceleration=maxSpeed/50;
        this.breakAccel=maxSpeed/60;
        this.maxSpeed=maxSpeed;
        this.friction=0.02;
        this.angle=0;
        this.damaged=false;
        // this.driftVelocity={x:0,y:0};
        this.slideSpeed=traction*this.maxSpeed;
        this.traction = traction;
        this.slide=false;

        this.checkPointsCount = 0;
        this.checkPointsPassed = [];
        this.laps=0;

        this.controlType = controlType;
        this.useBrain=controlType=="AI";

        this.delayCounter = 0;

        if(controlType!="DUMMY"){
            this.sensor=new Sensor(this);
            this.brain=new NeuralNetwork(
                [this.sensor.rayCount+1,8,4]
            );
        }
        this.controls=new Controls(controlType);
        this.polygon=this.#createPolygon();
    }

    update(roadBorders, checkPointList){
        if(!this.damaged){
            this.#move();
            this.polygon=this.#createPolygon();
            if((!this.controlType == "KEYS" && !this.controlType == "WASD") || !this.invincible){
                this.damaged=this.#assessDamage(roadBorders);
            }
            let checkPoint=this.#assessCheckpoint(checkPointList);
            if (checkPoint!=-1 && (!this.checkPointsPassed.includes(checkPoint) || checkPoint == this.checkPointsPassed[0])){
                if(!this.checkPointsPassed.includes(checkPoint)){
                    this.checkPointsCount++;
                }
                if(this.checkPointsCount >= checkPointList.length && checkPoint == this.checkPointsPassed[0]){
                    this.checkPointsCount=1;
                    this.laps++;
                    if(this.laps == 1){
                        this.lapTimes = [parseFloat((frameCount/60).toFixed(2))];
                    }
                    else if (this.laps>1){
                        this.lapTimes.push(parseFloat((frameCount/60-this.lapTimes.reduce((a, b) => a + b, 0)).toFixed(2)));
                    }
                    this.checkPointsPassed = [this.checkPointsPassed[0]];
                }
                this.checkPointsPassed.push(checkPoint);
            }
        }
        else if(this.controlType == "KEYS" || this.controlType == "WASD"){
            this.delayCounter++;
            if(this.delayCounter==40){
                this.x = this.origin.x;
                this.y = this.origin.y;
                this.angle=0;
                this.speed=0;
                this.velocity.x=0
                this.velocity.y=0;
                this.delayCounter=0;
                this.damaged=false;
                this.delayCounter=0;
                this.slide=false;
                this.checkPointsCount = 0;
                this.checkPointsPassed = [];
            }
 
        }
        if(this.sensor){
            this.sensor.update(roadBorders);
            var offsets=this.sensor.readings.map(
                s=>s==null?0:1-s.offset
            );
            offsets.push(this.speed/this.maxSpeed);
            const outputs=NeuralNetwork.feedForward(offsets,this.brain);
            if(this.useBrain){
                this.controls.forward=outputs[0];
                this.controls.left=outputs[1];
                this.controls.right=outputs[2];
                this.controls.reverse=outputs[3];
            }
        }
    }
    #assessDamage(roadBoarders){
        for(let i=0; i<roadBoarders.length;i++){
            if(polysIntersect(this.polygon,roadBoarders[i])){
                return true;
            }
        }
        return false;
    }
    #assessCheckpoint(checkpoints){
        for(let i=0; i<checkpoints.length;i++){
            if(polysIntersect(this.polygon,checkpoints[i])){
                return i;
            }
        }
        return -1;
    }

    #createPolygon(){
        const points=[];
        const rad=Math.hypot(this.width,this.height)/2
        const alpha=Math.atan2(this.width,this.height);
        points.push({
            x:this.x-Math.sin(this.angle-alpha)*rad,
            y:this.y-Math.cos(this.angle-alpha)*rad
        });
        points.push({
            x:this.x-Math.sin(this.angle+alpha)*rad,
            y:this.y-Math.cos(this.angle+alpha)*rad
        });
        points.push({
            x:this.x-Math.sin(Math.PI+this.angle-alpha)*rad,
            y:this.y-Math.cos(Math.PI+this.angle-alpha)*rad
        });
        points.push({
            x:this.x-Math.sin(Math.PI+this.angle+alpha)*rad,
            y:this.y-Math.cos(Math.PI+this.angle+alpha)*rad
        });
        return points;
    }
    
    #move(){
        //handle acceleration and breaking
        if(this.controls.forward){
            this.speed+=this.acceleration;
            this.velocity.x+=Math.sin(this.angle)*(this.acceleration);
            this.velocity.y+=Math.cos(this.angle)*(this.acceleration);
        }
        if(this.controls.reverse && (!this.slide || this.speed>.5)){
            this.speed-=this.breakAccel;
            this.velocity.x-=Math.sin(this.angle)*(this.breakAccel);
            this.velocity.y-=Math.cos(this.angle)*(this.breakAccel);
        }
        //turning
        if(this.speed!=0){
            const flip=this.speed>0?1:-1;
            if(this.controls.left){
                if(Math.abs(this.speed) > this.slideSpeed){
                    this.slide = true;
                }
                this.angle+=0.03*flip;
            }
            if(this.controls.right){
                if(Math.abs(this.speed) > this.slideSpeed){
                    this.slide = true;
                }
                this.angle-=0.03*flip;
            }
        }
        //topSpeed
        if(Math.hypot(this.velocity.x,this.velocity.y)>this.maxSpeed){
            const scalar = this.maxSpeed/Math.hypot(this.velocity.x,this.velocity.y);
            this.velocity.x*=scalar;
            this.velocity.y*=scalar;
            this.speed=this.maxSpeed;
        }
        else if (this.speed < -this.maxSpeed/2){
            const scalar=(this.maxSpeed/2)/Math.hypot(this.velocity.x,this.velocity.y);
            this.speed=-this.maxSpeed/2;
            this.velocity.x*=scalar;
            this.velocity.y*=scalar;
        }

        //what to do if sliding or not
        if(this.slide){
            this.velocity.x = lerp(this.velocity.x, this.speed*Math.sin(this.angle), (this.traction/2+.5)*this.maxSpeed/(Math.abs(this.speed)+.001)*.02);
            this.velocity.y = lerp(this.velocity.y, this.speed*Math.cos(this.angle), (this.traction/2+.5)*this.maxSpeed/(Math.abs(this.speed)+.001)*.02);
            const scalar=Math.abs(this.speed)/Math.hypot(this.velocity.x,this.velocity.y);
            this.velocity.x*=scalar;
            this.velocity.y*=scalar;
        }
        else{
            this.velocity.x=this.speed*Math.sin(this.angle);
            this.velocity.y=this.speed*Math.cos(this.angle);
        }
        //end  sliding when not steering, especially breaking
        if(!this.controls.left && !this.controls.right && this.speed < .9*this.slideSpeed){
            this.slide=false;
        }
        //end sliding for close enough angle
        if(this.slide && Math.abs(Math.abs(this.velocity.x)-this.speed*Math.sin(this.angle))<.02 && Math.abs(Math.abs(this.velocity.y)-this.speed*Math.sin(this.angle))<.02){
            this.slide=false;
        }
        
        //friction when sliding vs windAccel when not
        if(this.slide && Math.hypot(this.velocity.x,this.velocity.y)!=0){
            const scalar = Math.abs(this.speed)/Math.hypot(this.velocity.x,this.velocity.y);
            this.velocity.x*=scalar;
            this.velocity.y*=scalar;
        }
        else if (this.speed!=0){
            const windAccel = .001*(this.speed*Math.sin(this.angle)*this.velocity.x+this.speed*Math.cos(this.angle)*this.velocity.y);
            this.speed-=Math.sign(this.speed)*windAccel;
            this.velocity.x-=windAccel*Math.sin(this.angle);
            this.velocity.y-=windAccel*Math.cos(this.angle);

        }
        //too slow
        if(Math.abs(this.speed)>this.acceleration/2 && this.speed>0){
            this.velocity.x*=1-this.friction;
            this.velocity.y*=1-this.friction;
            this.speed*=1-this.friction;
        }
        else if (this.speed>0){
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.speed=0;
        }


        this.x-=this.velocity.x;
        this.y-=this.velocity.y;
     
    }

    draw(ctx,color,drawSensor=false){
        let tempAlpha = ctx.globalAlpha;
        if(this.damaged){
            ctx.fillStyle="gray";
        }
        else if (this.controlType == "KEYS" || this.controlType=="WASD"){
            ctx.globalAlpha=1;
            ctx.fillStyle=color;
            // ctx.fillStyle="red";
        }
        // else if (this.controlType == "WASD"){
        //     ctx.globalAlpha=1;
        //     ctx.fillStyle="#d38b4b";
        // }
        else {
            ctx.fillStyle=color;
        }
        ctx.beginPath();
        ctx.moveTo(this.polygon[0].x,this.polygon[0].y);
        for(let i=1;i<this.polygon.length;i++){
            ctx.lineTo(this.polygon[i].x,this.polygon[i].y);
        }
        ctx.fill();
        ctx.globalAlpha=tempAlpha;
        if(this.sensor && drawSensor && this.controlType != "KEYS" && this.controlType != "WASD"){
            this.sensor.draw(ctx);
        }
    }
}