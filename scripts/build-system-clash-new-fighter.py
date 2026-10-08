"""Deterministic genuine-body atlas packer. Copies source RGBA pixels, never repaints anatomy.
Input: build-plan.json with banks/clip source, columns/rows, native cells and measured landmarks.
Whole-source components are extracted before any nominal grid cut, so hats/tails crossing rows survive.
"""
import argparse,copy,hashlib,json,math,statistics
from collections import deque
from pathlib import Path
from PIL import Image,ImageDraw
def sha(data):return hashlib.sha256(data).hexdigest()
def pixels(im):return sha(im.convert('RGBA').tobytes())
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,data):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
def extract_cells(image,columns,rows,allow_clipped=False):
 w,h=image.size;alpha=image.getchannel('A').tobytes();seen=bytearray(255 if v>32 else 0 for v in alpha);parts=[]
 for start in range(w*h):
  if not seen[start]:continue
  seen[start]=0;q=deque([start]);indices=[];l=w;t=h;r=0;b=0
  while q:
   v=q.popleft();indices.append(v);x=v%w;y=v//w;l=min(l,x);r=max(r,x+1);t=min(t,y);b=max(b,y+1)
   for adj in (v-1 if x else -1,v+1 if x+1<w else -1,v-w if y else -1,v+w if y+1<h else -1):
    if adj>=0 and seen[adj]:seen[adj]=0;q.append(adj)
  parts.append({'indices':indices,'bounds':[l,t,r,b]})
 parts.sort(key=lambda p:len(p['indices']),reverse=True);count=columns*rows
 if len(parts)<count:raise ValueError('Too few full silhouettes')
 bodies=parts[:count]
 if min(len(p['indices']) for p in bodies)<max(len(p['indices']) for p in bodies)/30:raise ValueError('Missing body: only small component remains')
 bodies.sort(key=lambda p:(p['bounds'][1]+p['bounds'][3])/2)
 ordered=[]
 for row in range(rows):ordered+=sorted(bodies[row*columns:(row+1)*columns],key=lambda p:(p['bounds'][0]+p['bounds'][2])/2)
 def distance(a,b):
  al,at,ar,ab=a;bl,bt,br,bb=b
  return max(bl-ar,al-br,0)**2+max(bt-ab,at-bb,0)**2
 for small in parts[count:]:
  owner=min(ordered,key=lambda p:distance(p['bounds'],small['bounds']))
  owner['indices']+=small['indices'];a=owner['bounds'];b=small['bounds'];owner['bounds']=[min(a[0],b[0]),min(a[1],b[1]),max(a[2],b[2]),max(a[3],b[3])]
 # Allocate source alpha fringes to the nearest opaque source silhouette.
 # This is deterministic sprite extraction; every copied RGBA value is unchanged.
 labels=bytearray(w*h);queue=deque()
 for owner,body in enumerate(ordered,1):
  for v in body['indices']:labels[v]=owner;queue.append(v)
 while queue:
  v=queue.popleft();x=v%w;y=v//w
  for adj in (v-1 if x else -1,v+1 if x+1<w else -1,v-w if y else -1,v+w if y+1<h else -1):
   if adj>=0 and not labels[adj]:labels[adj]=labels[v];queue.append(adj)
 rgba=image.tobytes();cells=[]
 for owner,body in enumerate(ordered,1):
  l,t,r,b=body['bounds']
  clipped=min(l,t,w-r,h-b)<1
  if clipped and not allow_clipped:raise ValueError('Source silhouette reaches image boundary')
  rect=[max(0,l-3),max(0,t-3),min(w,r+3),min(h,b+3)];cw=rect[2]-rect[0];ch=rect[3]-rect[1];raw=bytearray(cw*ch*4)
  for y in range(rect[1],rect[3]):
   for x in range(rect[0],rect[2]):
    v=y*w+x
    if labels[v]==owner:
     dst=((y-rect[1])*cw+x-rect[0])*4;raw[dst:dst+4]=rgba[v*4:v*4+4]
  cells.append({'clipped':clipped,'bounds':body['bounds'],'sourceRect':[rect[0],rect[1],cw,ch],'image':Image.frombytes('RGBA',(cw,ch),bytes(raw))})
 return cells
def feet_anchor(image):
 a=image.getchannel('A');box=a.point(lambda v:255 if v>32 else 0).getbbox()
 if not box:raise ValueError('Empty pose')
 # Measured lowest silhouette pixels identify the planted paw/boot without the extended fist shifting root.
 y=box[3]-1;xs=[x for x in range(image.width) if a.getpixel((x,y))>32]
 return [sum(xs)/len(xs),box[3]],list(box)
def build(play,sources,private=None,review=None):
 plan=read(sources/'build-plan.json');identity=plan['id'];height=plan['height'];cache={};prepared={};reference=plan.get('referenceHeight')
 def source(spec):
  path=(sources/spec['source']).resolve()
  if not path.is_relative_to(sources.resolve()) or 'rejected' in path.name:raise ValueError('Invalid source path')
  key=(path,spec['columns'],spec['rows'])
  if key not in cache:
   image=Image.open(path).convert('RGBA');cache[key]=(extract_cells(image,spec['columns'],spec['rows'],allow_clipped=True),sha(path.read_bytes()),image.size)
  return cache[key]
 if reference is None:
  idle=plan['banks']['fighters']['clips']['idle'];first=idle.get('frameSources',{}).get('right',[idle])[0];cells,_,_=source(first);b=cells[first.get('cell',idle.get('cells',{}).get('right',[0])[0])]['bounds'];reference=b[3]-b[1]
 factor=height/reference;total=0;byte_count=0
 for bank,bank_plan in plan['banks'].items():
  directory=play/'assets'/bank/identity;directory.mkdir(parents=True,exist_ok=True)
  clips={}
  for name,spec in bank_plan['clips'].items():
   frames={};images={};choices=spec.get('frameSources',spec.get('cells'));n=len(choices['right'])
   if n!=len(choices['left']):raise ValueError('Native banks have different counts')
   for facing in ['right','left']:
    frames[facing]=[];images[facing]=[]
    for index,choice in enumerate(choices[facing]):
     selected={**spec,**choice} if isinstance(choice,dict) else spec;cell_index=choice['cell'] if isinstance(choice,dict) else choice
     cells,source_hash,source_size=source(selected)
     factor=height/selected.get('sourceReferenceHeight',plan.get('sourceReferenceHeights',{}).get(selected['source'],reference))
     cell=cells[cell_index]
     if cell['clipped']:raise ValueError(f'Chosen source cell is clipped: {identity} {selected["source"]} {cell_index}')
     original=cell['image'];image=original.resize((max(1,round(original.width*factor)),max(1,round(original.height*factor))),Image.Resampling.LANCZOS)
     fx=image.width/original.width;fy=image.height/original.height;l,t,r,b=cell['bounds'];sx,sy,sw,sh=cell['sourceRect']
     points=choice['points'] if isinstance(choice,dict) else spec['points'][facing][index];attachments={}
     for site,point in points.items():
      if selected.get('pointSpace')=='bounds-fraction':point=[l+(r-l)*point[0],t+(b-t)*point[1]]
      elif selected.get('pointSpace')=='cell-fraction':point=[(cell_index%selected['columns']+point[0])*source_size[0]/selected['columns'],(cell_index//selected['columns']+point[1])*source_size[1]/selected['rows']]
      p=[round((point[0]-sx)*fx,3),round((point[1]-sy)*fy,3)]
      if not all(math.isfinite(v) for v in p) or not(0<=p[0]<=image.width and 0<=p[1]<=image.height):raise ValueError(f'Landmark outside pose {identity} {bank} {name} {facing} {index} {site} {p}')
      attachments[site]=p
     for site in ['head','torso','legs','grip']:
      if site not in attachments:raise ValueError('Missing measured landmark '+site)
     anchor,opaque=feet_anchor(image)
     if 'root' in attachments:anchor=attachments.pop('root')
     frame={'anchor':anchor,'opaqueBounds':opaque,'attachments':attachments,'canonicalPixelSha256':pixels(image),'poseSource':{'kind':selected.get('poseKind','generated'),'sourceFile':selected['source'],'cell':cell_index,'sourceRect':cell['sourceRect'],'sourceSha256':source_hash,'uniformResample':factor}}
     frames[facing].append(frame);images[facing].append(image)
   if spec.get('seamFrom'):
    seam=spec['seamFrom'];old_frames,old_images=prepared[(bank,seam['clip'])];to=seam.get('toIndex',0)
    for facing in ['right','left']:
     frames[facing][to]=copy.deepcopy(old_frames[facing][seam['index']]);images[facing][to]=old_images[facing][seam['index']].copy()
   prepared[(bank,name)]=(frames,images)
   seam=spec.get('seamFrom');atlas_frames={};atlas_images={}
   if seam:
    old_frames,old_images=prepared[(bank,seam['clip'])]
    for facing in ['right','left']:
     atlas_frames[facing]=old_frames[facing]+[f for i,f in enumerate(frames[facing]) if i!=seam.get('toIndex',0)]
     atlas_images[facing]=old_images[facing]+[im for i,im in enumerate(images[facing]) if i!=seam.get('toIndex',0)]
   else:atlas_frames=frames;atlas_images=images
   width_cells=len(atlas_images['right']);cw=max(im.width for row in atlas_images.values() for im in row);ch=max(im.height for row in atlas_images.values() for im in row);atlas=Image.new('RGBA',(cw*width_cells,ch*2))
   for row,facing in enumerate(['right','left']):
    for col,(frame,image) in enumerate(zip(atlas_frames[facing],atlas_images[facing])):
     atlas.paste(image,(col*cw,row*ch));frame['rect']=[col*cw,row*ch,image.width,image.height]
   canonical=sources/(bank+'-'+name+'-canonical.webp');atlas.save(canonical,'WEBP',lossless=True,quality=100,method=6,exact=True)
   target=directory/((seam['clip'] if seam else name)+'.webp');atlas.save(target,'WEBP',quality=94,method=6,exact=True);encoded=Image.open(target).convert('RGBA')
   for facing in ['right','left']:
    for frame in atlas_frames[facing]:
     x,y,w,h=frame['rect'];frame['pixelSha256']=pixels(encoded.crop((x,y,x+w,y+h)))
   if seam:
    for facing in ['right','left']:frames[facing][seam.get('toIndex',0)]=copy.deepcopy(old_frames[facing][seam['index']])
    clips[seam['clip']].update({'file':target.name,'frames':old_frames,'sourceSize':list(atlas.size),'sourceSha256':sha(target.read_bytes()),'sourceRevision':sha(target.read_bytes())[:16],'canonicalSourceSha256':sha(canonical.read_bytes())})
   order=spec.get('order',list(range(n)));ms=spec['frameMs']
   if len(order)!=len(ms) or any(i<0 or i>=n for i in order) or any(v<=0 for v in ms):raise ValueError('Invalid chronology/timing')
   clip={'file':target.name,'frames':frames,'order':order,'frameMs':ms,'label':spec.get('label',name),'loop':spec.get('loop',False),'sourceSize':list(atlas.size),'sourceSha256':sha(target.read_bytes()),'sourceRevision':sha(target.read_bytes())[:16],'generatedSourceSha256':source_hash,'canonicalSourceSha256':sha(canonical.read_bytes())}
   for key in ['contactMs','activeEndMs','offsets','reactionStartMs','description']:
    if key in spec:clip[key]=spec[key]
   if 'contactMs' in clip and 'activeEndMs' not in clip:
    cumulative=0
    for value in ms:
     if cumulative==clip['contactMs']:clip['activeEndMs']=cumulative+value;break
     cumulative+=value
   clips[name]=clip;total+=1;byte_count+=target.stat().st_size
   if private:
    dst=private/'assets'/bank/identity/target.name;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(target.read_bytes())
   if review:
    review.mkdir(parents=True,exist_ok=True);stride=max(260,round(max(im.width for row in images.values() for im in row)*.8)+16);row_height=max(370,round(max(im.height for row in images.values() for im in row)*.8)+40);canvas=Image.new('RGB',(n*stride,2*row_height),(21,25,35));draw=ImageDraw.Draw(canvas)
    for row,facing in enumerate(['right','left']):
     for col,(frame,image) in enumerate(zip(frames[facing],images[facing])):
      s=.8;piece=image.resize((round(image.width*s),round(image.height*s)),Image.Resampling.LANCZOS);px=round(col*stride+stride/2-frame['anchor'][0]*s);py=round(row*row_height+row_height-15-frame['anchor'][1]*s);canvas.paste(piece,(px,py),piece.getchannel('A'));draw.text((col*stride+5,row*row_height+5),f'{identity} {name} {facing} {col}',fill=(235,235,245))
    canvas.save(review/(identity+'-'+bank+'-'+name+'.jpg'),quality=85)
  manifest={'id':identity if bank=='fighters' else identity+('-arcade-actions' if bank=='arcade' else '-deletion-utilities'),'character':plan['character'],'baseId':identity,'fighterId':identity,'height':height,'scale':1,'status':'genuine whole-body native keys','description':plan.get('description','Independent whole-body poses, both native facings, measured landmarks and common root.'),'clips':clips}
  for key in ['pairDistance','contactMs','impactHoldMs','artFightingStyle']:
   if key in plan:manifest[key]=plan[key]
  write(directory/'manifest.json',manifest)
  if private:write(private/'assets'/bank/identity/'manifest.json',manifest)
 # Derive all menu images from the same approved idle source, never borrow another fighter.
 idle_frames,idle_images=prepared[('fighters','idle')];idle=read(play/'assets/fighters'/identity/'manifest.json')['clips']['idle'];menu=play/'assets/menu';menu.mkdir(parents=True,exist_ok=True)
 source_file=play/'assets/fighters'/identity/idle['file'];idle_target=menu/(identity+'-idle.webp');idle_target.write_bytes(source_file.read_bytes())
 menu_meta={'version':1,'id':identity,'file':idle_target.name,'encoding':'webp-quality-94-alpha-preserved','atlasSize':idle['sourceSize'],'canvasSize':[320,440],'groundY':430,'sourceScale':1,'scale':1,'heightScale':height/320,'order':idle['order'],'frameMs':idle['frameMs'],'frames':idle['frames'],'source':'assets/fighters/'+identity+'/'+idle['file'],'sourceSha256':idle['sourceSha256']}
 write(menu/(identity+'-idle.json'),menu_meta)
 image=idle_images['right'][0];frame=idle_frames['right'][0];standing=Image.new('RGBA',(320,440));standing.paste(image,(round(160-frame['anchor'][0]),round(430-frame['anchor'][1])));standing.save(menu/(identity+'-standing.webp'),'WEBP',quality=94,method=6,exact=True)
 head=frame['attachments']['head'];radius=height*.22;box=(max(0,round(head[0]-radius)),max(0,round(head[1]-radius*.8)),min(image.width,round(head[0]+radius)),min(image.height,round(head[1]+radius*1.15)))
 portrait=image.crop(box);portrait=portrait.resize((max(1,round(portrait.width*min(256/portrait.width,256/portrait.height))),max(1,round(portrait.height*min(256/portrait.width,256/portrait.height)))),Image.Resampling.LANCZOS);portrait_canvas=Image.new('RGBA',(256,256));portrait_canvas.paste(portrait,((256-portrait.width)//2,(256-portrait.height)//2));portrait_canvas.save(menu/(identity+'-portrait.webp'),'WEBP',quality=94,method=6,exact=True)
 if private:
  pm=private/'assets/menu';pm.mkdir(parents=True,exist_ok=True)
  for suffix in ['-idle.webp','-idle.json','-standing.webp','-portrait.webp']:(pm/(identity+suffix)).write_bytes((menu/(identity+suffix)).read_bytes())
 byte_count=sum(p.stat().st_size for bank in plan['banks'] for p in (play/'assets'/bank/identity).glob('*.webp'))
 summary={'id':identity,'clips':total,'atlasBytes':byte_count,'scale':factor,'sourceFiles':len(cache)};print(json.dumps(summary));return summary
def main():
 p=argparse.ArgumentParser();p.add_argument('--play',type=Path,required=True);p.add_argument('--sources',type=Path,required=True);p.add_argument('--private',type=Path);p.add_argument('--review',type=Path);a=p.parse_args();build(a.play,a.sources,a.private,a.review)
if __name__=='__main__':main()
