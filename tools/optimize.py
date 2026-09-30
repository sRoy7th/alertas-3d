# Reduce las texturas de un .glb y lo reexporta.
# Uso: blender -b --factory-startup -P optimize.py -- entrada.glb salida.glb [max_px]
import sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
src, dst = args[0], args[1]
max_px = int(args[2]) if len(args) > 2 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > max_px:
        k = max_px / max(w, h)
        img.scale(max(1, int(w * k)), max(1, int(h * k)))
        print(f"{img.name}: {w}x{h} -> {img.size[0]}x{img.size[1]}")
    else:
        print(f"{img.name}: {w}x{h} (sin cambio)")

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_apply=True,
)
print("OK", dst)
