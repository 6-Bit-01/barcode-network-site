"""Focused new-fighter asset packing checks; scratch stays in explicitly supplied D root."""
import importlib.util, json, os, tempfile, unittest
from contextlib import nullcontext
from pathlib import Path
from PIL import Image, ImageDraw
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/build-system-clash-new-fighter.py'
class AssetPacking(unittest.TestCase):
 def setUp(self):
  self.assertTrue(SCRIPT.exists(),'reusable new-fighter packer is missing')
  spec=importlib.util.spec_from_file_location('packer',SCRIPT);self.p=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.p)
 def source(self):
  im=Image.new('RGBA',(400,400));d=ImageDraw.Draw(im)
  for row in range(4):
   for col in range(4):
    # Full figure crosses the nominal row midpoint but does not touch another body.
    x=col*100+40;y=row*100+5
    d.rectangle((x,y,x+20,y+75),fill=(60+row*30,80+col*30,120,255))
    d.rectangle((x+18,y+25,x+40,y+35),fill=(60,80,120,255))
    d.rectangle((x+30,y+12,x+31,y+13),fill=(40,80,120,180)) # separate small ornament
  return im
 def test_full_source_components_and_small_detail_preserved(self):
  im=self.source();cells=self.p.extract_cells(im,4,4)
  self.assertEqual(len(cells),16)
  self.assertEqual(cells[0]['bounds'],[40,5,81,81])
  self.assertEqual(cells[0]['image'].getchannel('A').getextrema()[1],255)
  self.assertTrue(any(v==180 for v in cells[0]['image'].getchannel('A').getdata()))
 def test_source_touching_outer_edge_rejected(self):
  im=self.source();ImageDraw.Draw(im).rectangle((0,5,41,30),fill=(255,80,20,255))
  with self.assertRaisesRegex(ValueError,'boundary'):self.p.extract_cells(im,4,4)
 def test_complete_assets_roundtrip_and_seam(self):
  with nullcontext(tempfile.mkdtemp(prefix='new-fighter-packer-',dir=os.environ['TEMP'])) as tmp:
   root=Path(tmp);sources=root/'sources';sources.mkdir();self.source().save(sources/'source.png')
   pts={site:[50,45] for site in ['head','torso','legs','grip','strike','strikeStart']}
   def clip(right,left,**extra):return {'source':'source.png','columns':4,'rows':4,'cells':{'right':right,'left':left},'points':{f:[{s:[40+(i%4)*100+10,5+(i//4)*100+40] for s in pts} for i in cells] for f,cells in [('right',right),('left',left)]},'frameMs':[90,80,110,100],'contactMs':170,**extra}
   plan={'id':'test-cat','character':'Test Cat','height':320,'referenceHeight':152,'sourceReferenceHeights':{'source.png':76},'banks':{'fighters':{'clips':{'idle':clip([0,1,2,3],[4,5,6,7]),'knockdown':clip([8,9,10,11],[12,13,14,15]),'getup':clip([8,9,10,11],[12,13,14,15],seamFrom={'clip':'knockdown','index':3,'toIndex':0})}}}}
   plan['banks']['fighters']['clips']['getup']['frameSources']={f:[{'source':'source.png','columns':4,'rows':4,'cell':i,'points':{s:[50+(i%4)*100,45+(i//4)*100] for s in pts},'poseKind':'reused-native'} for i in indices] for f,indices in [('right',[8,9,10,11]),('left',[12,13,14,15])]}
   (sources/'build-plan.json').write_text(json.dumps(plan),encoding='utf-8')
   summary=self.p.build(root/'play',sources,root/'private',root/'reviews')
   manifest=json.loads((root/'play/assets/fighters/test-cat/manifest.json').read_text())
   self.assertEqual(manifest['scale'],1)
   a=manifest['clips']['knockdown'];b=manifest['clips']['getup']
   for facing in ['left','right']:
    self.assertEqual(a['frames'][facing][3]['canonicalPixelSha256'],b['frames'][facing][0]['canonicalPixelSha256'])
    self.assertEqual(a['frames'][facing][3],b['frames'][facing][0]);self.assertEqual(a['file'],b['file'])
   self.assertEqual(b['frames']['right'][1]['poseSource']['kind'],'reused-native')
   self.assertGreater(a['frames']['right'][0]['opaqueBounds'][3],310)
   self.assertEqual(a['contactMs'],170);self.assertEqual(a['activeEndMs'],280)
   self.assertEqual(summary['clips'],3)
   self.assertTrue((root/'play/assets/menu/test-cat-portrait.webp').exists())
   self.assertTrue((root/'private/assets/fighters/test-cat/manifest.json').exists())
   for target in (root/'play').rglob('*.webp'):
    relative=target.relative_to(root/'play');self.assertEqual(target.read_bytes(),(root/'private'/relative).read_bytes())
if __name__=='__main__':unittest.main()
