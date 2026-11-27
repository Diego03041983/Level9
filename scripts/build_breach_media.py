import math,wave,struct,subprocess,sys
from pathlib import Path
# Usage: python3 scripts/build_breach_media.py MEDIA_DIRECTORY
root=Path(sys.argv[1])
out=root/'nexus-breach-v3';out.mkdir(exist_ok=True)
rate=24000
# Decode the dry voice to duck the alarm around speech, using the same timebase.
from array import array
voice=array('f',subprocess.check_output(['ffmpeg','-v','error','-i',str(root/'anomaly-detected.wav'),'-f','f32le','-ac','1','-ar',str(rate),'-']))
duration=len(voice)/rate
rms=[]
for start in range(0,len(voice),600):
 chunk=voice[start:start+600];rms.append(math.sqrt(sum(v*v for v in chunk)/len(chunk)))
with wave.open(str(out/'alarm.wav'),'wb') as w:
 w.setparams((1,2,rate,0,'NONE','not compressed'))
 frames=bytearray();phase=0;duck=1
 for i in range(len(voice)):
  t=i/rate;p=t/duration
  phase+=2*math.pi*(310+150*(.5+.5*math.sin(t*math.pi*(.7+p*.5))))/rate
  fade=min(1,t/.6,max(0,(duration-t)/.07))
  pulse=.4+.6*(.5+.5*math.sin(2*math.pi*(.65*t+.32*t*t/duration)))**2
  target=.4 if rms[min(len(rms)-1,i//600)]>.025 else 1
  duck+=(target-duck)*(1/(rate*(.025 if target<duck else .3)))
  siren=(math.sin(phase)+.22*math.sin(phase*2))*(.065+.14*p**1.2)*pulse
  low=math.sin(2*math.pi*65*t)*(.012+.045*p)*(.5+.5*math.sin(t*math.pi*1.5))**4
  val=(siren+low)*fade*duck
  frames.extend(struct.pack('<h',max(-32768,min(32767,round(val*32767)))))
 w.writeframes(frames)
subprocess.run(['ffmpeg','-y','-v','error','-i',str(root/'anomaly-detected.wav'),'-i',str(out/'alarm.wav'),'-filter_complex','[0:a][1:a]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.97:level=0:latency=1[a]','-map','[a]','-c:a','libmp3lame','-b:a','192k',str(out/'nexus-anomaly-alarm.mp3')],check=True)
print(out/'nexus-anomaly-alarm.mp3')
# The approved Glitch film is unchanged. Rebuild it only when explicitly requested.
if '--video' not in sys.argv: sys.exit(0)
subprocess.run(['ffmpeg','-y','-v','error','-i',str(root/'mensaje glicht.mp4'),'-map','0:v:0','-map','0:a:0','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25','-c:v','libx264','-preset','fast','-crf','24','-profile:v','baseline','-level:v','3.1','-pix_fmt','yuv420p','-bf','0','-g','50','-maxrate','1600k','-bufsize','3200k','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',str(out/'glitch-intervention-tv.mp4')],check=True)
