"use client";

import { useEffect, useRef } from 'react';
import face from './data/face.json';
import './NexusStandby.css';

const eyes = [[33,160,158,133,153,144,161,159,157,173,155,154,145,163],[263,387,385,362,380,373,388,386,384,398,382,381,374,390]];
const eyeCenters=eyes.map(indices=>indices.reduce((out,index)=>out.map((v,i)=>v+face.vertices[index][i]/indices.length),[0,0,0]));
const eyeByVertex=new Map(eyes.flatMap((indices,eye)=>indices.map(index=>[index,eye] as const)));

export function NexusStandby(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
    let width=0,height=0,frame=0,lastFrame=0,visible=true;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const resize=()=>{width=canvas.clientWidth;height=canvas.clientHeight;const ratio=Math.min(window.devicePixelRatio||1,1.25);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0)};
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    const visibility=()=>{visible=!document.hidden};document.addEventListener('visibilitychange',visibility);
    const draw=(now:number)=>{
      frame=requestAnimationFrame(draw);
      if(!visible||now-lastFrame<(reduced.matches?1000:1000/30)||!width||!height)return;
      lastFrame=now;const t=reduced.matches?0:now/1000;
      const cx=width*.5,cy=height*.42,scale=Math.min(height*.0405,width*.043);
      const yaw=Math.sin(t*.24)*.105,pitch=Math.sin(t*.31)*.025,roll=Math.sin(t*.19)*.012;
      const blink=1-.94*Math.exp(-Math.pow(((t+1.2)%6-5.65)/.095,2));
      const project=(point:number[])=>{
        const [x,y,z]=point;const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=z*Math.cos(yaw)-x*Math.sin(yaw);
        const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),depth=rz*Math.cos(pitch)+y*Math.sin(pitch);
        const perspective=1+depth*.013;
        return [cx+(rx*Math.cos(roll)-ry*Math.sin(roll))*scale*perspective,cy-(ry*Math.cos(roll)+rx*Math.sin(roll))*scale*perspective+Math.sin(t*.7)*1.5,depth];
      };
      ctx.fillStyle='#030f21';ctx.fillRect(0,0,width,height);
      const glow=ctx.createRadialGradient(width*.5,height*.43,20,width*.5,height*.43,height*.76);glow.addColorStop(0,'#0b3042');glow.addColorStop(.45,'#08233c');glow.addColorStop(1,'#020b1b');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
      const rim=ctx.createRadialGradient(0,0,0,0,0,width*.65);rim.addColorStop(0,'#15cce82e');rim.addColorStop(1,'#15cce800');ctx.fillStyle=rim;ctx.fillRect(0,0,width,height);
      // Spatial data field; deterministic positions avoid a noisy flicker.
      for(let i=0;i<280;i++){
        const x=(i*127.71)%width,y=((i*71.13+t*(2+i%4))%height);
        const distance=Math.abs(x-cx)/(width*.5);ctx.fillStyle=`rgba(51,185,221,${.06+distance*.16})`;
        const s=i%9===0?2.5:1;ctx.fillRect(x,y,s,s);
      }
      // Waveforms dissolve before reaching the face.
      for(const side of [-1,1]){
        ctx.beginPath();
        for(let i=0;i<180;i++){
          const u=i/179,x=cx+side*(width*.22+u*width*.28);
          const envelope=Math.pow(Math.sin(u*Math.PI),2);
          const y=height*.49+Math.sin(i*.71-t*2)*Math.sin(i*.13+t)*height*.055*envelope;
          if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.strokeStyle='rgba(51,218,244,.45)';ctx.lineWidth=.85;ctx.stroke();
      }
      const points=face.vertices.map((p,index)=>{
        const v=[...p],eye=eyeByVertex.get(index);
        if(eye!==undefined)v[1]=eyeCenters[eye][1]+(v[1]-eyeCenters[eye][1])*blink;
        return project(v);
      });
      // A faint polygon surface gives volume without hiding the wire network.
      for(let i=0;i<face.faces.length;i+=2){
        const tri=face.faces[i],a=points[tri[0]],b=points[tri[1]],c=points[tri[2]];
        ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();
        ctx.fillStyle=`rgba(27,171,197,${.018+(Math.sin(i*13.7)+1)*.015})`;ctx.fill();
      }
      // Batch the mesh by depth so low-end TVs draw only a few strokes per frame.
      for(let layer=0;layer<4;layer++){
        ctx.beginPath();
        for(const [ai,bi] of face.edges){const a=points[ai],b=points[bi];const depth=(a[2]+b[2])/2;const bucket=Math.max(0,Math.min(3,Math.floor((depth+2)/2.5)));if(bucket!==layer)continue;ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
        ctx.strokeStyle=`rgba(${40+layer*25},${165+layer*22},255,${.25+layer*.14})`;ctx.lineWidth=.65+layer*.1;ctx.stroke();
      }
      const sweep=Math.sin(t*.35)*9;
      // Electric highlights travel through the actual face mesh.
      ctx.beginPath();
      for(const [ai,bi] of face.edges){if(Math.abs(face.vertices[ai][1]-sweep)>.35)continue;const a=points[ai],b=points[bi];ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
      ctx.shadowBlur=8;ctx.shadowColor='#44eaff';ctx.strokeStyle='rgba(131,244,255,.68)';ctx.lineWidth=1;ctx.stroke();ctx.shadowBlur=0;
      for(let i=0;i<points.length;i++){
        const p=points[i],pulse=.35+.65*Math.pow((Math.sin(t*1.1+i*1.7)+1)/2,3);
        ctx.fillStyle=`rgba(155,246,255,${pulse*.95})`;ctx.beginPath();ctx.arc(p[0],p[1],i%7===0?1.8:1,0,Math.PI*2);ctx.fill();
      }
      // Iris detail and slow blink make the presence feel alive.
      eyeCenters.forEach(center=>{
        const eye=project([center[0],center[1],center[2]+.35]);
        ctx.save();ctx.translate(eye[0],eye[1]);ctx.scale(1,blink);const r=scale*.34;
        ctx.shadowBlur=14;ctx.shadowColor='#33ddff';ctx.strokeStyle='#7aeeff';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
        ctx.beginPath();ctx.arc(0,0,r*.52,0,Math.PI*2);ctx.strokeStyle='#2687bc';ctx.stroke();
        ctx.fillStyle='#cefaff';ctx.beginPath();ctx.arc(-r*.2,-r*.25,1.7,0,Math.PI*2);ctx.fill();ctx.restore();
      });
      // Neck and shoulders emerge as a fading digital silhouette.
      const rows:number[][][]=[];
      for(let row=0;row<6;row++){
        const span= row<2?2.8+row*.5:3.3+(row-1)*3;
        rows.push(Array.from({length:17},(_,i)=>project([(i/16*2-1)*span,-9.2-row*1.65, row<2?-1:-2-Math.abs(i-8)*.12])));
      }
      for(let r=0;r<rows.length-1;r++){
        ctx.beginPath();for(let i=0;i<16;i++){const a=rows[r][i],b=rows[r][i+1],c=rows[r+1][i];ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.lineTo(a[0],a[1]);}
        ctx.strokeStyle=`rgba(53,188,231,${.19-r*.028})`;ctx.lineWidth=.7;ctx.stroke();
      }
      const fade=ctx.createLinearGradient(0,height*.76,0,height);fade.addColorStop(0,'#030f2100');fade.addColorStop(1,'#030f21');ctx.fillStyle=fade;ctx.fillRect(0,height*.76,width,height*.24);
    };
    frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility)};
  },[]);
  return <div className="nexus-presence" aria-label="NEXUS presente, rostro digital en movimiento">
    <canvas ref={canvasRef} aria-hidden="true"/>
    <div className="nexus-presence-label"><span>INTELIGENCIA DEL SISTEMA</span><p>NEXUS<span>—9</span></p><i/><small>EN LÍNEA</small></div>
    <div className="nexus-presence-caption">SANTIAGO · LEVEL 9</div>
  </div>;
}
