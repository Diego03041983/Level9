import math,wave,struct,subprocess,sys
from pathlib import Path
# Usage: python3 scripts/build_breach_media.py MEDIA_DIRECTORY
root=Path(sys.argv[1])
out=root/'nexus-breach-v2';out.mkdir(exist_ok=True)
rate=24000;duration=47.84
with wave.open(str(out/'alarm.wav'),'wb') as w:
 w.setparams((1,2,rate,0,'NONE','not compressed'))
 frames=bytearray();phase=0
 for i in range(round(rate*duration)):
  t=i/rate
  phase+=2*math.pi*(300+90*(.5+.5*math.sin(t*math.pi)))/rate
  fade=min(1,t/.8,max(0,(duration-t)/1.6))
  pulse=.25+.75*(.5+.5*math.sin(2*math.pi*t*.8))**2
  val=(math.sin(phase)+.18*math.sin(phase*2))*.025*fade*pulse
  frames.extend(struct.pack('<h',round(val*32767)))
 w.writeframes(frames)
subprocess.run(['ffmpeg','-y','-v','error','-i',str(root/'anomaly-detected.wav'),'-i',str(out/'alarm.wav'),'-filter_complex','[0:a][1:a]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.97:level=0:latency=1[a]','-map','[a]','-c:a','libmp3lame','-b:a','160k',str(out/'nexus-anomaly-alarm.mp3')],check=True)
print(out/'nexus-anomaly-alarm.mp3')

subprocess.run(['ffmpeg','-y','-v','error','-i',str(root/'mensaje glicht.mp4'),'-map','0:v:0','-map','0:a:0','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25','-c:v','libx264','-preset','fast','-crf','24','-profile:v','baseline','-level:v','3.1','-pix_fmt','yuv420p','-bf','0','-g','50','-maxrate','1600k','-bufsize','3200k','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',str(out/'glitch-intervention-tv.mp4')],check=True)
