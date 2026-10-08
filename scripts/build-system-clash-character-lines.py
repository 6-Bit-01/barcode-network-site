"""Original synthetic character line; no cloned identity or external recording."""
from pathlib import Path
import argparse,array,subprocess,os,wave,json,hashlib,sys,math
def main():
 p=argparse.ArgumentParser();p.add_argument('--scratch',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 scratch=Path(a.scratch).resolve();output=Path(a.output).resolve()
 if scratch.drive.upper()!='D:' or output.drive.upper()!='D:' or 'CodexScratch' not in scratch.parts:raise ValueError('Use verified D: task paths')
 scratch.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
 raw=scratch/'doofnoobler-stay-kind-david-source.wav';text='Stay soft, stay fuzzy, and stay kind.'
 quote=lambda s:"'"+str(s).replace("'","''")+"'"
 cmd="$env:TEMP="+quote(scratch)+"; $env:TMP=$env:TEMP; Add-Type -AssemblyName System.Speech; $speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.SelectVoice('Microsoft David Desktop'); $speaker.Rate=-1; $speaker.SetOutputToWaveFile("+quote(raw)+"); $speaker.Speak("+quote(text)+"); $speaker.Dispose()"
 subprocess.run(['powershell','-NoProfile','-NonInteractive','-Command',cmd],check=True,env={**os.environ,'TEMP':str(scratch),'TMP':str(scratch)},creationflags=subprocess.CREATE_NO_WINDOW)
 with wave.open(str(raw),'rb') as f:
  assert f.getnchannels()==1 and f.getsampwidth()==2
  rate=f.getframerate();samples=array.array('h',f.readframes(f.getnframes()))
 if sys.byteorder!='little':samples.byteswap()
 data=[n/32768 for n in samples];audible=[i for i,n in enumerate(data) if abs(n)>.008]
 data=data[max(0,audible[0]-int(rate*.04)):min(len(data),audible[-1]+int(rate*.14))]
 speed=1.12;outRate=22050;n=int(len(data)/rate/speed*outRate)
 result=[];low=0.;alpha=1-math.exp(-2*math.pi*4100/outRate)
 for i in range(n):
  pos=i*rate*speed/outRate;k=int(pos);part=pos-k
  value=data[min(k,len(data)-1)]*(1-part)+data[min(k+1,len(data)-1)]*part
  low+=alpha*(value-low);result.append(low)
 peak=max(map(abs,result));result=[v*.66/peak*min(1,i/220,(n-i-1)/500) for i,v in enumerate(result)]
 pcm=array.array('h',(int(max(-1,min(1,v))*32767) for v in result));target=output/'doofnoobler-stay-kind.wav'
 if sys.byteorder!='little':pcm.byteswap()
 with wave.open(str(target),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(outRate);f.writeframes(pcm.tobytes())
 receipt={'path':target.name,'text':text,'origin':'Local Microsoft David Desktop SAPI synthesis; brighter puppet register, gentle lowpass and fades; no voice cloning','sampleRate':outRate,'seconds':n/outRate,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'source':str(raw),'sourceBytes':raw.stat().st_size}
 (output/'character-lines-origin.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');print(json.dumps(receipt))
if __name__=='__main__':main()
