"""Build a repeatable Blender review scene for the EnglishMetro cast."""

from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = REPO_ROOT / "public" / "play" / "public" / "assets" / "models"
OUTPUT_DIR = Path(
    os.environ.get(
        "EM_BLENDER_OUTPUT_DIR",
        str(Path(tempfile.gettempdir()) / "englishmetro-blender"),
    )
)

CHARACTERS = [
    ("Wren", "hero_walk.glb"),
    ("Clara", "npc_tutor_conductor.glb"),
    ("PRON-3000", "npc_pronunciation_robot.glb"),
    ("Marek", "npc_phrase_vendor.glb"),
    ("Beatrice", "npc_bookshop_owner.glb"),
    ("Inspector", "npc_ticket_inspector.glb"),
    ("Announcer", "npc_station_announcer.glb"),
    ("Tourist", "npc_lost_tourist.glb"),
    ("Commuter", "npc_commuter_rival.glb"),
]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((float("inf"), float("inf"), float("inf")))
    maximum = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        if obj.type not in {"MESH", "CURVE", "FONT"}:
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    return minimum, maximum


def import_character(label: str, filename: str, x: float, y: float) -> bpy.types.Object:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(MODEL_DIR / filename))
    imported = [obj for obj in bpy.data.objects if obj not in before]

    root = bpy.data.objects.new(f"CHAR_{label}", None)
    bpy.context.scene.collection.objects.link(root)
    top_level = [obj for obj in imported if obj.parent is None]
    for obj in top_level:
        obj.parent = root

    minimum, maximum = world_bounds(imported)
    height = max(maximum.z - minimum.z, maximum.y - minimum.y, 0.001)
    # glTF characters use Y-up after import, so use the actual largest vertical
    # extent and correct after scaling from the evaluated world bounds.
    scale = 1.72 / height
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    minimum, maximum = world_bounds(imported)

    vertical_axis = "z" if (maximum.z - minimum.z) >= (maximum.y - minimum.y) else "y"
    center_x = (minimum.x + maximum.x) * 0.5
    center_y = (minimum.y + maximum.y) * 0.5
    center_z = (minimum.z + maximum.z) * 0.5
    root.location.x += x - center_x
    if vertical_axis == "z":
        root.location.y += y - center_y
        root.location.z += -minimum.z
    else:
        root.location.y += y - minimum.y
        root.location.z += -center_z

    for obj in imported:
        if obj.type == "MESH":
            obj.select_set(False)
            obj.data.name = f"{label}_{obj.data.name}"
            for material in obj.data.materials:
                if material:
                    material.name = f"{label}_{material.name}"
    return root


def add_material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 0.64
    principled.inputs["Metallic"].default_value = metallic
    return material


def add_label(text: str, x: float, y: float) -> None:
    bpy.ops.object.text_add(
        location=(x, y - 0.78, 0.05),
        rotation=(math.radians(68), 0, 0),
    )
    label = bpy.context.object
    label.name = f"LABEL_{text}"
    label.data.body = text
    label.data.align_x = "CENTER"
    label.data.align_y = "CENTER"
    label.data.size = 0.18
    label.data.extrude = 0.004
    label.data.materials.append(bpy.data.materials["Label White"])


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location: tuple[float, float, float], energy: float, size: float, color):
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    point_at(light, Vector((0, 0, 1.05)))
    return light


def build_scene() -> dict[str, object]:
    clear_scene()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    add_material("Floor Charcoal", (0.018, 0.028, 0.052, 1.0), metallic=0.08)
    add_material("Label White", (0.84, 0.93, 1.0, 1.0))

    spacing_x = 2.75
    spacing_y = 2.7
    roots = []
    for index, (label, filename) in enumerate(CHARACTERS):
        column = index % 3
        row = index // 3
        x = (column - 1) * spacing_x
        y = row * spacing_y
        roots.append(import_character(label, filename, x, y))
        add_label(label, x, y)

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.025))
    floor = bpy.context.object
    floor.name = "Studio Floor"
    floor.data.materials.append(bpy.data.materials["Floor Charcoal"])

    backdrop_material = add_material("Backdrop", (0.025, 0.046, 0.082, 1.0))
    bpy.ops.mesh.primitive_plane_add(
        size=30,
        location=(0, 2.0, 6.0),
        rotation=(math.pi / 2, 0, 0),
    )
    backdrop = bpy.context.object
    backdrop.name = "Studio Backdrop"
    backdrop.data.materials.append(backdrop_material)

    add_area_light("Key", (-5.5, -5.5, 7.0), 1850, 5.0, (0.55, 0.88, 1.0))
    add_area_light("Fill", (6.5, -2.0, 4.2), 1200, 4.0, (1.0, 0.42, 0.66))
    add_area_light("Rim", (0.0, 4.2, 5.5), 2200, 3.5, (0.24, 1.0, 0.84))

    camera_data = bpy.data.cameras.new("Review Camera")
    camera = bpy.data.objects.new("Review Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (0.0, -10.8, 7.6)
    camera_data.lens = 58
    point_at(camera, Vector((0.0, spacing_y, 0.9)))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.008, 0.012, 0.026)
    scene.view_settings.look = "AgX - Medium High Contrast"

    render_path = OUTPUT_DIR / "englishmetro-character-lineup.png"
    blend_path = OUTPUT_DIR / "englishmetro-character-lab.blend"
    scene.render.filepath = str(render_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)

    return {
        "characters": len(roots),
        "render": str(render_path),
        "blend": str(blend_path),
        "blender": bpy.app.version_string,
    }


RESULT = build_scene()
print(RESULT)
