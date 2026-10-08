"""Pack approved transparent stage props; originals are read-only."""
import argparse,json,shutil,hashlib
from pathlib import Path
from PIL import Image
def boxes(im):
    a=im.getchannel('A')
    assert a.getextrema()[0]==0,'Missing true alpha'
    out=[]
    for col in range(2):
        x0=col*im.width//2;x1=(col+1)*im.width//2
        cut=a.crop((x0,0,x1,im.height))
        rows=[sum(v>16 for v in cut.crop((0,y,cut.width,y+1)).getdata())>3 for y in range(im.height)]
        gaps=[];start=None
        for y in range(int(im.height*.35),int(im.height*.82)):
            if not rows[y] and start is None:start=y
            if rows[y] and start is not None:gaps.append((y-start,start,y));start=None
        assert gaps,'No clear row separation'
        _,start,end=max(gaps);split=(start+end)//2
        for r,(y0,y1) in enumerate([(0,split),(split,im.height)]):
            local=a.crop((x0,y0,x1,y1));bbox=local.point(lambda v:255 if v>8 else 0).getbbox()
            assert bbox,'Empty stage object'
            lx,ly,rx,ry=bbox
            out.append((col,r,(x0+lx,y0+ly,x0+rx,y0+ry)))
    return sorted(out,key=lambda v:(v[1],v[0]))
def main():
    p=argparse.ArgumentParser();p.add_argument('--records',required=True);p.add_argument('--lab',required=True);p.add_argument('--output',required=True);args=p.parse_args()
    lab=Path(args.lab);output=Path(args.output);lab.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
    receipts=[]
    for entry in json.loads(Path(args.records).read_text(encoding='utf-8')):
        id=entry['id'];source=lab/(id+'-kit-source-20261008.png');shutil.copy2(entry['source'],source)
        im=Image.open(source).convert('RGBA');parts=boxes(im);names=['leftWall','rightWall','control','emitter']
        cells=[];frames={}
        for name,(_,_,bbox) in zip(names,parts):
            crop=im.crop(bbox)
            crop.thumbnail((480,650),Image.Resampling.LANCZOS)
            cells.append((name,crop))
        plate=Image.open(lab/(id+'-source-20261008.png')).convert('RGBA')
        floor=plate.crop((0,int(plate.height*.88),plate.width,int(plate.height*.98)))
        floor=floor.resize((640,60),Image.Resampling.LANCZOS);cells.append(('floorStrip',floor))
        width=1024;height=1536;atlas=Image.new('RGBA',(width,height))
        locations=[(16,16),(528,16),(16,700),(528,700),(16,1400)]
        for (name,part),(x,y) in zip(cells,locations):
            atlas.alpha_composite(part,(x,y));frames[name]={'rect':[x,y,part.width,part.height],'anchor':[part.width/2,part.height]}
        path=output/(id+'-kit.webp');atlas.save(path,'WEBP',quality=92,method=6,exact=True)
        metadata={'version':1,'id':id,'image':path.name,'width':width,'height':height,'frames':frames,
                  'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest()}
        meta=output/(id+'-layers.json');meta.write_text(json.dumps(metadata,separators=(',',':'))+'\n',encoding='utf-8')
        assert Image.open(path).getchannel('A').getextrema()[0]==0
        receipts.append({'id':id,'source':str(source),'sourceBytes':source.stat().st_size,'kitBytes':path.stat().st_size,'metadataBytes':meta.stat().st_size,'bounds':[p[2] for p in parts]})
    print(json.dumps(receipts))
if __name__=='__main__':main()
