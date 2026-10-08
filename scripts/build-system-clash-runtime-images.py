"""Build exact-pixel served copies without changing approved PNG sources.

Use the bundled Python/Pillow runtime with -B and task-local TEMP/TMP on D:.
Every manifest keeps its original file and source hashes. Only smaller verified
lossless copies are selected through the optional runtimeFile reference.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
from PIL import Image


def rgba_digest(image):
    return hashlib.sha256(image.convert('RGBA').tobytes()).hexdigest()


def reject_reparse_components(path):
    for component in [path, *path.parents]:
        try:
            attributes = getattr(component.lstat(), 'st_file_attributes', 0)
        except FileNotFoundError:
            continue
        if attributes & 0x400:
            raise RuntimeError(f'Reparse-linked output or source is not allowed: {component}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets-root', required=True, type=Path)
    parser.add_argument('--receipt', required=True, type=Path)
    args = parser.parse_args()
    if not args.assets_root.is_absolute() or not args.receipt.is_absolute():
        parser.error('Use absolute asset and receipt paths.')
    reject_reparse_components(args.assets_root)
    reject_reparse_components(args.receipt)
    root = args.assets_root.resolve(strict=True)
    manifests = sorted([*root.glob('fighters/*/manifest.json'), *root.glob('arcade/*/manifest.json')])
    records = {}
    manifest_data = []
    for file in manifests:
        reject_reparse_components(file)
        source_text = file.read_bytes()
        ending = b'\r\n' if source_text.endswith(b'\r\n') else b'\n' if source_text.endswith(b'\n') else b''
        data = json.loads(source_text.decode('utf-8-sig'))
        for clip in data.get('clips', {}).values():
            original = PurePosixPath(clip['file'])
            if original.suffix.lower() != '.png':
                continue
            source_path = file.parent / original
            reject_reparse_components(source_path)
            source = source_path.resolve(strict=True)
            source.relative_to(root)
            if source in records:
                continue
            destination = source.with_suffix('.runtime.webp')
            reject_reparse_components(destination)
            with Image.open(source) as original_image:
                image = original_image.convert('RGBA')
                source_rgba = rgba_digest(image)
                memory = io.BytesIO()
                options = dict(format='WEBP', lossless=True, quality=80, method=4, exact=True)
                if original_image.info.get('icc_profile'):
                    options['icc_profile'] = original_image.info['icc_profile']
                if destination.exists():
                    with Image.open(destination) as existing:
                        if existing.size != image.size or rgba_digest(existing) != source_rgba:
                            raise RuntimeError(f'Existing served copy differs; preserve and review: {destination}')
                    memory.write(destination.read_bytes())
                else:
                    image.save(memory, **options)
                encoded = memory.getvalue()
                with Image.open(io.BytesIO(encoded)) as decoded:
                    if decoded.size != image.size or rgba_digest(decoded) != source_rgba:
                        raise RuntimeError(f'Lossless verification failed: {source}')
                source_bytes = source.stat().st_size
                smaller = len(encoded) < source_bytes
                if smaller:
                    if destination.exists():
                        with Image.open(destination) as existing:
                            if existing.size != image.size or rgba_digest(existing) != source_rgba:
                                raise RuntimeError(f'Existing served copy differs; preserve and review: {destination}')
                        if destination.stat().st_size > len(encoded):
                            raise RuntimeError(f'Existing served copy uses another encoding; preserve and review: {destination}')
                    else:
                        destination.write_bytes(encoded)
                    with Image.open(destination) as saved:
                        if saved.size != image.size or rgba_digest(saved) != source_rgba:
                            raise RuntimeError(f'Saved served copy failed verification: {destination}')
                records[source] = dict(source=str(source), runtime=str(destination) if smaller else None,
                    sourceBytes=source_bytes, runtimeBytes=destination.stat().st_size if smaller else source_bytes,
                    dimensions=list(image.size), rgbaSha256=source_rgba,
                    sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    runtimeSha256=hashlib.sha256(destination.read_bytes()).hexdigest() if smaller else None)
                if len(records) % 20 == 0:
                    print(f'Verified {len(records)} unique PNG sheets', flush=True)
        manifest_data.append((file, data, ending))
    changed_manifests = []
    references = 0
    for file, data, ending in manifest_data:
        changed = False
        for clip in data.get('clips', {}).values():
            original = PurePosixPath(clip['file'])
            if original.suffix.lower() != '.png':
                continue
            record = records[(file.parent / original).resolve(strict=True)]
            if record['runtime']:
                runtime = str(original.with_suffix('.runtime.webp'))
                references += 1
                if clip.get('runtimeFile') != runtime:
                    clip['runtimeFile'] = runtime
                    changed = True
        if changed:
            file.write_bytes(json.dumps(data, separators=(',', ':')).encode('utf-8') + ending)
            changed_manifests.append(str(file))
    chosen = [record for record in records.values() if record['runtime']]
    receipt = dict(assetsRoot=str(root), selectedCopies=len(chosen), uniquePNGSheets=len(records),
        runtimeReferences=references, changedManifests=changed_manifests,
        originalBytes=sum(record['sourceBytes'] for record in chosen),
        runtimeBytes=sum(record['runtimeBytes'] for record in chosen),
        bytesSaved=sum(record['sourceBytes'] - record['runtimeBytes'] for record in chosen),
        verification='All selected copies have identical decoded RGBA SHA-256 and dimensions; every original PNG remains present.',
        images=list(records.values()))
    args.receipt.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: receipt[key] for key in ['selectedCopies', 'uniquePNGSheets', 'runtimeReferences', 'originalBytes', 'runtimeBytes', 'bytesSaved']}, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    main()
