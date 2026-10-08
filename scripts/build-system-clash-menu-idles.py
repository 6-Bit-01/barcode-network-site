"""Deterministically pack approved authored idle crops. Originals are never changed."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('--play',required=True);parser.add_argument('--ids',nargs='+');args=parser.parse_args();play=Path(args.play);menu=play/'assets/menu'
roster=json.loads((menu/'roster.json').read_text(encoding='utf-8-sig'))
for fighter in roster['fighters']:
    if args.ids and fighter['id'] not in args.ids:continue
    directory=play/'assets/fighters'/fighter['id'];manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8-sig'));idle=manifest['clips']['idle'];source=directory/idle['file'];image=Image.open(source).convert('RGBA')
    frames=idle['frames'];cell_w=max(frame['rect'][2] for bank in frames.values() for frame in bank);cell_h=max(frame['rect'][3] for bank in frames.values() for frame in bank);columns=max(len(bank) for bank in frames.values());atlas=Image.new('RGBA',(cell_w*columns,cell_h*2));packed={}
    for row,facing in enumerate(['right','left']):
        packed[facing]=[]
        for column,frame in enumerate(frames[facing]):
            x,y,w,h=frame['rect'];atlas.paste(image.crop((x,y,x+w,y+h)),(column*cell_w,row*cell_h));copy={key:frame[key] for key in ['anchor','offset','bodyCalibration'] if key in frame};copy['rect']=[column*cell_w,row*cell_h,w,h];copy['sourceRect']=frame['rect'];packed[facing].append(copy)
    name=fighter['id']+'-idle';atlas.save(menu/(name+'.webp'),'WEBP',quality=90,method=6,exact=True)
    scale=idle.get('scale',manifest.get('scale',manifest['height']/frames['right'][0]['rect'][3]))
    source_scale=scale
    extent=max((frame['anchor'][1]-frame.get('opaqueBounds',[0,0,0,0])[1]-frame.get('offset',[0,0])[1])*source_scale*frame.get('bodyCalibration',1) for bank in frames.values() for frame in bank)
    scale=source_scale*(320*fighter['heightScale'])/extent
    data={'version':1,'encoding':'webp-quality-90','sourceScale':source_scale,'id':fighter['id'],'file':name+'.webp','atlasSize':list(atlas.size),'canvasSize':fighter.get('menuCanvasSize',[320,440]),'groundY':430,'heightScale':fighter['heightScale'],'scale':scale,'order':idle.get('order',[0,1,2,3]),'frameMs':idle.get('frameMs',120),'frames':packed,'source':f'assets/fighters/{fighter["id"]}/{idle["file"]}','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    (menu/(name+'.json')).write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
print(json.dumps({'fighters':len(roster['fighters']),'atlasBytes':sum(p.stat().st_size for p in menu.glob('*-idle.webp'))}))
