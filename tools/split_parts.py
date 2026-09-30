# Separa un .glb de una sola malla en sus partes sueltas, cada una con su pivote en su centro.
# Uso: blender -b --factory-startup -P split_parts.py -- entrada.glb salida.glb
import sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
src, dst = args[0], args[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in meshes:
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    # Aplica transformaciones heredadas para que todas las piezas compartan el mismo espacio
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0001)  # une costuras UV para no romper piezas
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for i, o in enumerate(sorted(parts, key=lambda o: -len(o.data.polygons))):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    # Al unir vértices se pierden las aristas duras: se recuperan suavizando solo por debajo de 35°
    bpy.ops.object.shade_smooth_by_angle(angle=0.61)
    o.name = f"pieza_{i:02d}"
    print(o.name, len(o.data.polygons), tuple(round(v, 1) for v in o.location))

# Quita los vacíos que dejó Sketchfab
for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY"]:
    bpy.data.objects.remove(o)

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=90)
print("OK", dst, len(parts), "piezas")
