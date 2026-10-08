"""Pack genuine whole-body transitions with approved punch keys without editing source art.
Source requirements per fighter: approved-punch.json, punch-transitions-source.png,
punch-transitions-points.json. Built-in imagegen creates source poses; this builder
only crops, uniformly resamples new crops, packs and losslessly converts pixels.
"""
import argparse, copy, hashlib, json, statistics
from pathlib import Path
from PIL import Image, ImageDraw
from collections import deque
sha=lambda data:hashlib.sha256(data).hexdigest()
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def pixels(image):return sha(image.convert('RGBA').tobytes())
def crop_bounds(image):
    return image.getchannel('A').point(lambda p:255 if p>32 else 0).getbbox()
def main_bounds(image,limit=8):
    # Locate the largest connected silhouette only to choose its crop rectangle.
    # Source pixels and alpha remain untouched, including antialiasing.
    width,height=image.size;mask=bytearray(1 if p>32 else 0 for p in image.getchannel('A').tobytes());components=[]
    for start in range(width*height):
        if not mask[start]:continue
        mask[start]=0;queue=deque([start]);count=0;left=width;top=height;right=0;bottom=0
        while queue:
            value=queue.popleft();x=value%width;y=value//width;count+=1
            left=min(left,x);right=max(right,x+1);top=min(top,y);bottom=max(bottom,y+1)
            for adjacent in ((value-1 if x else -1),(value+1 if x+1<width else -1),(value-width if y else -1),(value+width if y+1<height else -1)):
                if adjacent>=0 and mask[adjacent]:mask[adjacent]=0;queue.append(adjacent)
        components.append((count,(left,top,right,bottom)))
    return [bounds for count,bounds in sorted(components,reverse=True)[:limit]]

def write_json(path,data):
    path.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
def build(play,source_root,fighter,private_root=None,review_root=None):
    directory=play/'assets/fighters'/fighter
    manifest_path=directory/'manifest.json';manifest=read(manifest_path)
    baseline=read(source_root/fighter/'approved-punch.json')
    approved=baseline['clip'];old_source=(directory/approved['file']).resolve()
    if sha(old_source.read_bytes())!=baseline['sourceSha256']:raise ValueError('Approved source changed: '+fighter)
    old_image=Image.open(old_source).convert('RGBA')
    points=read(source_root/fighter/'punch-transitions-points.json')
    new_source=source_root/fighter/points.get('sourceFile','punch-transitions-source.png')
    if 'rejected' in new_source.name:raise ValueError('Rejected source cannot enter runtime')
    new_image=Image.open(new_source).convert('RGBA')
    generated={}
    whole_heights=[]
    bodies=sorted(main_bounds(new_image,8),key=lambda box:(box[1]+box[3])/2)
    if len(bodies)!=8:raise ValueError(f'Expected eight intact silhouettes: {fighter} {bodies}')
    rows=[sorted(bodies[:4],key=lambda box:(box[0]+box[2])/2),sorted(bodies[4:],key=lambda box:(box[0]+box[2])/2)]
    if max(box[3] for box in rows[0])>=min(box[1] for box in rows[1]):raise ValueError(f'Rows overlap: {fighter}')
    for row,facing in enumerate(['right','left']):
        generated[facing]=[]
        for col in range(4):
            cell=new_image;x0=0;y0=0;bounds=rows[row][col]
            if not bounds:raise ValueError(f'Empty generated cell {fighter} {facing} {col}')
            if min(bounds[0],bounds[1],cell.width-bounds[2],cell.height-bounds[3])<1:raise ValueError(f'Generated anatomy reaches cell boundary {fighter} {facing} {col}: {bounds}')
            rect=(max(0,bounds[0]-3),max(0,bounds[1]-3),min(cell.width,bounds[2]+3),min(cell.height,bounds[3]+3))
            crop=cell.crop(rect);generated[facing].append((crop,bounds,rect,(x0,y0),points[facing][col]))
            whole_heights.append(bounds[3]-bounds[1])
    target_height=statistics.median(f['opaqueBounds'][3]-f['opaqueBounds'][1] for facing in ['right','left'] for f in approved['frames'][facing])
    factor=target_height/statistics.median(whole_heights)
    frames={};images={}
    for facing in ['right','left']:
        frames[facing]=[];images[facing]=[]
        for index in range(8):
            if index%2==0:
                key=index//2;frame=copy.deepcopy(approved['frames'][facing][key])
                sx,sy,w,h=frame['rect'];image=old_image.crop((sx,sy,sx+w,sy+h))
                frame['poseSource']={'kind':'approved','index':key,'pixelSha256':pixels(image),'originalRect':[sx,sy,w,h]}
            else:
                key=index//2;crop,bounds,rect,origin,measured=generated[facing][key]
                width=max(1,round(crop.width*factor));height=max(1,round(crop.height*factor))
                image=crop.resize((width,height),Image.Resampling.LANCZOS)
                fx=width/crop.width;fy=height/crop.height
                def point(point):
                    return [round((point[0]-origin[0]-rect[0])*fx,3),round((point[1]-origin[1]-rect[1])*fy,3)]
                opaque=crop_bounds(image)
                if not opaque:raise ValueError('Resampled pose empty')
                attachment={site:point(value) for site,value in measured.items()}
                required=['head','torso','legs','grip','strike','strikeStart']
                for site in required:
                    value=attachment[site]
                    if not (0<=value[0]<=width and 0<=value[1]<=height):raise ValueError(f'Anchor outside pose: {fighter} {facing} {key} {site} {value}')
                anchor=[(opaque[0]+opaque[2])/2,opaque[3]]
                frame={'anchor':anchor,'opaqueBounds':list(opaque),'attachments':attachment,'poseSource':{'kind':'generated','index':key,'sourceRect':[origin[0]+rect[0],origin[1]+rect[1],crop.width,crop.height],'uniformResample':round(factor,6)}}
            frame['pixelSha256']=pixels(image)
            frames[facing].append(frame);images[facing].append(image)
    cell_width=max(im.width for row in images.values() for im in row)
    cell_height=max(im.height for row in images.values() for im in row)
    atlas=Image.new('RGBA',(cell_width*8,cell_height*2))
    for row,facing in enumerate(['right','left']):
        for col,(frame,image) in enumerate(zip(frames[facing],images[facing])):
            atlas.paste(image,(col*cell_width,row*cell_height))
            frame['rect']=[col*cell_width,row*cell_height,image.width,image.height]
    old_order=approved.get('order',[0,1,2,3,0]);old_ms=approved['frameMs']
    if old_order!=[0,1,2,3,0] or len(old_ms)!=5:raise ValueError('Unsupported approved timing')
    split=lambda amount:[amount//2,amount-amount//2]
    timing=split(old_ms[0])+split(old_ms[1])+[old_ms[2]]+split(old_ms[3])+split(old_ms[4])
    contact=approved.get('contactMs',170)
    if sum(old_ms[:2])!=contact:raise ValueError('Approved contact does not match hold boundary')
    active_end=contact+old_ms[2]
    runtime=play/'assets/animation-polish'/fighter;runtime.mkdir(parents=True,exist_ok=True)
    target=runtime/'punch.webp'
    canonical=source_root/fighter/'punch-source-atlas.webp'
    atlas.save(canonical,'WEBP',lossless=True,quality=100,method=6,exact=True)
    atlas.save(target,'WEBP',quality=94,method=6,exact=True)
    hosted=Image.open(target).convert('RGBA')
    for facing in ['right','left']:
        for frame in frames[facing]:
            x,y,w,h=frame['rect'];frame['pixelSha256']=pixels(hosted.crop((x,y,x+w,y+h)))
    clip={**approved,'file':'../../animation-polish/'+fighter+'/punch.webp','frames':frames,'order':list(range(8))+[0],'frameMs':timing,'contactMs':contact,'activeEndMs':active_end,'sourceSize':list(atlas.size),'sourceSha256':sha(target.read_bytes()),'sourceRevision':sha(target.read_bytes())[:16],'animationPolish':{'version':1,'encoding':'webp-quality-94-alpha-preserved','approvedFile':approved['file'],'approvedSha256':baseline['sourceSha256'],'generatedSha256':sha(new_source.read_bytes()),'privateLosslessSha256':sha(canonical.read_bytes()),'approvedTiming':{'order':old_order,'frameMs':old_ms,'contactMs':contact,'activeEndMs':active_end,'duration':sum(old_ms)},'fullBodyPosesPerFacing':8}}
    manifest['clips']['punch']=clip;write_json(manifest_path,manifest)
    if private_root:
        private_manifest=private_root/'assets/fighters'/fighter/'manifest.json'
        if private_manifest.exists():
            private_data=read(private_manifest);private_data['clips']['punch']=clip;write_json(private_manifest,private_data)
            private_target=private_root/'assets/animation-polish'/fighter/'punch.webp';private_target.parent.mkdir(parents=True,exist_ok=True);private_target.write_bytes(target.read_bytes())
    if review_root:
        review_root.mkdir(parents=True,exist_ok=True)
        review=Image.new('RGB',(8*320,2*390),(20,22,27));draw=ImageDraw.Draw(review)
        preview_scale=min(.65,310/cell_width,340/cell_height)
        for row,facing in enumerate(['right','left']):
            for col,image in enumerate(images[facing]):
                frame=frames[facing][col];preview=image.resize((round(image.width*preview_scale),round(image.height*preview_scale)),Image.Resampling.LANCZOS)
                px=round(col*320+160-frame['anchor'][0]*preview_scale);py=round(row*390+365-frame['anchor'][1]*preview_scale)
                review.paste(preview,(px,py),preview.getchannel('A'))
                draw.text((col*320+8,row*390+8),f'{facing} {col}: '+frame['poseSource']['kind'],fill=(240,240,240))
        review.save(review_root/(fighter+'-punch-packed.jpg'),quality=86)
        host_review=Image.new('RGB',(640,390),(22,23,29))
        for column,source_image in enumerate([atlas,hosted]):
            frame=frames['right'][4];x,y,w,h=frame['rect'];piece=source_image.crop((x,y,x+w,y+h))
            preview=piece.resize((round(w*preview_scale),round(h*preview_scale)),Image.Resampling.LANCZOS)
            px=round(column*320+160-frame['anchor'][0]*preview_scale);py=round(365-frame['anchor'][1]*preview_scale)
            host_review.paste(preview,(px,py),preview.getchannel('A'))
        ImageDraw.Draw(host_review).text((8,8),'Exact source',fill=(240,240,240));ImageDraw.Draw(host_review).text((328,8),'Hosted WebP quality 94',fill=(240,240,240))
        host_review.save(review_root/(fighter+'-punch-compression.jpg'),quality=91)
    print(json.dumps({'id':fighter,'atlasBytes':target.stat().st_size,'atlasSize':atlas.size,'sourceBytes':new_source.stat().st_size,'newPoseScale':round(factor,6),'contactMs':contact,'activeEndMs':active_end,'duration':sum(timing),'facings':2,'posesPerFacing':8}))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--play',type=Path,required=True);parser.add_argument('--sources',type=Path,required=True);parser.add_argument('--private',type=Path);parser.add_argument('--review',type=Path);parser.add_argument('--ids',nargs='+');args=parser.parse_args()
    for item in read(args.play/'assets/menu/roster.json')['fighters']:
        if not args.ids or item['id'] in args.ids:build(args.play,args.sources,item['id'],args.private,args.review)
if __name__=='__main__':main()
