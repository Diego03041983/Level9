"""Build complete MP4 reception phases with embedded voice; emit a deployment SQL manifest."""
import json, subprocess, unicodedata, shutil, sys
from pathlib import Path
if len(sys.argv)!=3:
    raise SystemExit('Usage: build_voiced_reception.py MEDIA_DIRECTORY AUDIT_JSON')
SOURCE=Path(sys.argv[1])
OUTPUT=SOURCE/'alta-con-audio-v3'
OUTPUT.mkdir(exist_ok=True)
EVENT='556ba287-bf5e-4b18-93b7-dd404f36092d'
def run(args): subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
def duration(p): return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(p)]))
def clip(label,video,audio=None):
    out=OUTPUT/(label+'.mp4')
    if out.exists(): return out
    v=SOURCE/video; a=SOURCE/audio if audio else v
    seconds=duration(a)
    run(['ffmpeg','-y','-loglevel','error','-i',str(v),'-i',str(a),'-map','0:v:0','-map','1:a:0','-vf','fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p,tpad=stop_mode=clone:stop_duration=60','-t',str(seconds),'-c:v','libx264','-preset','veryfast','-crf','24','-profile:v','main','-level','3.1','-c:a','aac','-ar','48000','-ac','2','-b:a','128k','-movflags','+faststart',str(out)])
    return out

def concat(parts,name):
    out=OUTPUT/name
    listing=OUTPUT/'concat.txt'; listing.write_text(''.join("file '%s'\n"%p for p in parts))
    run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(out)])
    return out

def norm(s): return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if c.isalnum())
players=json.load(open(sys.argv[2]))['rows'][0]['data']['players']
assets=[]
def record(p,key,player=None,role=None):
    assets.append(dict(file=str(p),path=f'{EVENT}/reception-voiced-v3/{p.name}',key=key,player=player,role=role,ms=round(duration(p)*1000)))
detect=clip('detection','detection.mp4','detection.wav'); scan=clip('scan','2 iniciando scaneo.mp4','scanning.wav'); nickname=clip('nickname','Nickname requerimiento.mp4')
record(concat([detect,scan,nickname],'before-nickname-generic.mp4'),'DETECTION')
record(concat([clip('confirmed','Indetidad confirmada.mp4'),clip('photo','solicitud de foto.mp4')],'before-photo.mp4'),'NICKNAME_CONFIRMED')
record(concat([clip('avatar','Avatar creado con exito.mp4'),clip('calibration','calibration-nexus9.mp4'),clip('unlocked','player-unlocked-nexus9.mp4')],'after-photo.mp4'),'AVATAR_PROCESSING')
for p in players:
    full=norm(p['first_name']+(p['last_name'] or ''))
    identities=[f for f in SOURCE.glob('*_identity.wav') if norm(f.stem.replace('_identity',''))==full]
    if full=='santiagopiana': identities=[SOURCE/'santiago-special-intro.wav']
    if identities:
        identity=clip('identity-'+p['id'],'revelacion de identidad.mp4',identities[0].name)
        record(concat([detect,scan,identity,nickname],p['id']+'.mp4'),'DETECTION',p['id'])
    names=[f for f in SOURCE.glob('*-name.wav') if norm(f.stem.replace('-name',''))==full]
    if full=='bernardobucci': names=[SOURCE/'BernandoBucci-name.wav']
    if full=='santiagopiana': names=[SOURCE/'Santiago-name.wav']
    if names:
        dest=OUTPUT/(p['id']+'-name.wav');shutil.copyfile(names[0],dest);record(dest,None,p['id'],'name')
(OUTPUT/'manifest.json').write_text(json.dumps(assets,indent=2))
print('Built',len(assets),'assets',flush=True)
