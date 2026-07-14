"""Author compact browser-ready rigs for the detailed EnglishMetro NPC cast.

The source Meshy characters already contain the visual detail we want. This
script keeps those meshes and textures, adds a predictable deform skeleton,
bakes a small action set, and exports Draco-compressed GLBs for Three.js.
"""

from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = REPO_ROOT / "public" / "play" / "public" / "assets" / "models"
REVIEW_DIR = Path(
    os.environ.get(
        "EM_BLENDER_OUTPUT_DIR",
        str(Path(tempfile.gettempdir()) / "englishmetro-blender"),
    )
) / "npc-rig-review"

CHARACTERS = [
    ("npc_tutor_conductor", "npc_tutor_conductor.glb", 1.78),
    ("npc_phrase_vendor", "npc_phrase_vendor.glb", 1.75),
    ("npc_bookshop_owner", "npc_bookshop_owner.glb", 1.72),
    ("npc_lost_tourist", "npc_lost_tourist.glb", 1.75),
    ("npc_commuter_rival", "npc_commuter_rival.glb", 1.76),
    ("npc_station_announcer", "npc_station_announcer.glb", 1.78),
    ("npc_ticket_inspector", "npc_ticket_inspector.glb", 1.78),
]

DEFORM_BONES = [
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "shoulder.L",
    "upper_arm.L",
    "forearm.L",
    "hand.L",
    "shoulder.R",
    "upper_arm.R",
    "forearm.R",
    "hand.R",
    "thigh.L",
    "shin.L",
    "foot.L",
    "thigh.R",
    "shin.R",
    "foot.R",
]


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def import_primary_mesh(path: Path) -> bpy.types.Object:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {path.name}")
    mesh = max(meshes, key=lambda obj: len(obj.data.vertices))
    for obj in imported:
        if obj is not mesh:
            bpy.data.objects.remove(obj, do_unlink=True)
    mesh.name = path.stem
    mesh.data.name = f"{path.stem}_mesh"
    return mesh


def local_bounds(mesh: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [vertex.co for vertex in mesh.data.vertices]
    minimum = Vector((
        min(point.x for point in points),
        min(point.y for point in points),
        min(point.z for point in points),
    ))
    maximum = Vector((
        max(point.x for point in points),
        max(point.y for point in points),
        max(point.z for point in points),
    ))
    return minimum, maximum


def normalize_mesh(mesh: bpy.types.Object, target_height: float) -> tuple[Vector, Vector]:
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    minimum, maximum = local_bounds(mesh)
    height = max(maximum.z - minimum.z, 0.001)
    mesh.scale = (target_height / height,) * 3
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    minimum, maximum = local_bounds(mesh)
    center = (minimum + maximum) * 0.5
    mesh.location = (-center.x, -center.y, -minimum.z)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    mesh.select_set(False)
    return local_bounds(mesh)


def add_edit_bone(
    armature: bpy.types.Armature,
    name: str,
    head: tuple[float, float, float],
    tail: tuple[float, float, float],
    parent: str | None = None,
    deform: bool = True,
) -> None:
    bone = armature.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.use_deform = deform
    if parent:
        bone.parent = armature.edit_bones[parent]


def build_armature(minimum: Vector, maximum: Vector, key: str) -> bpy.types.Object:
    height = maximum.z - minimum.z
    half_width = max(abs(minimum.x), abs(maximum.x))
    armature_data = bpy.data.armatures.new(f"{key}_armature")
    armature = bpy.data.objects.new(f"{key}_rig", armature_data)
    bpy.context.scene.collection.objects.link(armature)
    armature.show_in_front = True
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    add_edit_bone(armature_data, "root", (0, 0, 0), (0, 0, 0.08 * height), deform=False)
    add_edit_bone(armature_data, "hips", (0, 0, 0.46 * height), (0, 0, 0.55 * height), "root")
    add_edit_bone(armature_data, "spine", (0, 0, 0.55 * height), (0, 0, 0.65 * height), "hips")
    add_edit_bone(armature_data, "chest", (0, 0, 0.65 * height), (0, 0, 0.75 * height), "spine")
    add_edit_bone(armature_data, "neck", (0, 0, 0.75 * height), (0, 0, 0.85 * height), "chest")
    add_edit_bone(armature_data, "head", (0, 0, 0.85 * height), (0, 0, 0.98 * height), "neck")

    # The Meshy cast shares a high, forward presentation pose. Measured joint
    # centers keep the bind chain inside the sleeves and put the hand pivot at
    # the wrist instead of below it, which protects fingers during palm rolls.
    shoulder_x = half_width * 0.46
    elbow_x = half_width * 0.68
    wrist_x = half_width * 0.86
    hand_x = half_width * 0.98
    for side, sign in (("L", -1), ("R", 1)):
        add_edit_bone(
            armature_data,
            f"shoulder.{side}",
            (0, 0, 0.765 * height),
            (sign * shoulder_x, 0, 0.765 * height),
            "chest",
        )
        add_edit_bone(
            armature_data,
            f"upper_arm.{side}",
            (sign * shoulder_x, 0, 0.765 * height),
            (sign * elbow_x, -0.035 * height, 0.745 * height),
            f"shoulder.{side}",
        )
        add_edit_bone(
            armature_data,
            f"forearm.{side}",
            (sign * elbow_x, -0.035 * height, 0.745 * height),
            (sign * wrist_x, -0.135 * height, 0.72 * height),
            f"upper_arm.{side}",
        )
        add_edit_bone(
            armature_data,
            f"hand.{side}",
            (sign * wrist_x, -0.135 * height, 0.72 * height),
            (sign * hand_x, -0.195 * height, 0.72 * height),
            f"forearm.{side}",
        )

    leg_x = 0.075 * height
    for side, sign in (("L", -1), ("R", 1)):
        add_edit_bone(
            armature_data,
            f"thigh.{side}",
            (sign * leg_x, 0, 0.48 * height),
            (sign * leg_x, 0, 0.27 * height),
            "hips",
        )
        add_edit_bone(
            armature_data,
            f"shin.{side}",
            (sign * leg_x, 0, 0.27 * height),
            (sign * leg_x, 0, 0.075 * height),
            f"thigh.{side}",
        )
        add_edit_bone(
            armature_data,
            f"foot.{side}",
            (sign * leg_x, 0, 0.075 * height),
            (sign * leg_x, -0.14 * height, 0.035 * height),
            f"shin.{side}",
        )

    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    return armature


def smoothstep(a: float, b: float, value: float) -> float:
    if abs(b - a) < 1e-8:
        return 1.0 if value >= b else 0.0
    t = max(0.0, min(1.0, (value - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def add_weights(groups: dict[str, bpy.types.VertexGroup], index: int, weights: dict[str, float]) -> None:
    total = sum(max(value, 0.0) for value in weights.values())
    if total <= 1e-8:
        groups["hips"].add([index], 1.0, "REPLACE")
        return
    ranked = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
    kept_total = sum(value for _, value in ranked)
    for name, value in ranked:
        if value > 1e-5:
            groups[name].add([index], value / kept_total, "REPLACE")


def bind_mesh(mesh: bpy.types.Object, armature: bpy.types.Object, minimum: Vector, maximum: Vector) -> None:
    for group in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(group)
    groups = {name: mesh.vertex_groups.new(name=name) for name in DEFORM_BONES}
    height = maximum.z - minimum.z
    half_width = max(abs(minimum.x), abs(maximum.x))
    arm_inner = min(half_width * 0.46, 0.145 * height)

    for vertex in mesh.data.vertices:
        x, _, z = vertex.co
        ax = abs(x)
        ty = (z - minimum.z) / max(height, 0.001)
        side = "L" if x < 0 else "R"
        weights: dict[str, float] = {}
        is_arm = ty > 0.64 and ax > arm_inner

        if is_arm:
            reach = max(half_width - arm_inner, 0.001)
            u = max(0.0, min(1.0, (ax - arm_inner) / reach))
            shoulder_blend = 1.0 - smoothstep(0.02, 0.22, u)
            fore_blend = smoothstep(0.28, 0.60, u)
            hand_blend = smoothstep(0.69, 0.88, u)
            weights[f"shoulder.{side}"] = shoulder_blend * 0.45
            weights[f"upper_arm.{side}"] = (1.0 - fore_blend) * (1.0 - hand_blend)
            weights[f"forearm.{side}"] = fore_blend * (1.0 - hand_blend)
            weights[f"hand.{side}"] = hand_blend
        elif ty < 0.49:
            if ty < 0.10:
                foot = 1.0 - smoothstep(0.075, 0.13, ty)
                weights[f"foot.{side}"] = foot
                weights[f"shin.{side}"] = 1.0 - foot
            elif ty < 0.30:
                thigh = smoothstep(0.23, 0.34, ty)
                weights[f"shin.{side}"] = 1.0 - thigh
                weights[f"thigh.{side}"] = thigh
            else:
                hips = smoothstep(0.43, 0.51, ty)
                weights[f"thigh.{side}"] = 1.0 - hips
                weights["hips"] = hips
        elif ty < 0.60:
            spine = smoothstep(0.50, 0.61, ty)
            weights["hips"] = 1.0 - spine
            weights["spine"] = spine
        elif ty < 0.74:
            chest = smoothstep(0.62, 0.73, ty)
            weights["spine"] = 1.0 - chest
            weights["chest"] = chest
        elif ty < 0.84:
            neck = smoothstep(0.76, 0.84, ty)
            weights["chest"] = 1.0 - neck
            weights["neck"] = neck
        else:
            head = smoothstep(0.83, 0.89, ty)
            weights["neck"] = 1.0 - head
            weights["head"] = head
        add_weights(groups, vertex.index, weights)

    modifier = mesh.modifiers.new(name="EnglishMetro Armature", type="ARMATURE")
    modifier.object = armature
    mesh.parent = armature


def reset_pose(armature: bpy.types.Object) -> None:
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def key_pose(
    armature: bpy.types.Object,
    frame: int,
    rotations: dict[str, tuple[float, float, float]] | None = None,
    locations: dict[str, tuple[float, float, float]] | None = None,
) -> None:
    rotations = rotations or {}
    locations = locations or {}
    for name, values in rotations.items():
        bone = armature.pose.bones[name]
        bone.rotation_euler = values
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
    for name, values in locations.items():
        bone = armature.pose.bones[name]
        bone.location = values
        bone.keyframe_insert(data_path="location", frame=frame, group=name)


def new_action(armature: bpy.types.Object, name: str) -> bpy.types.Action:
    reset_pose(armature)
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    return action


def bake_actions(armature: bpy.types.Object, height: float) -> dict[str, bpy.types.Action]:
    actions: dict[str, bpy.types.Action] = {}

    actions["idle"] = new_action(armature, "idle")
    for frame, breath, look in ((1, 0, 0), (31, 0.018, -0.035), (61, 0, 0), (91, -0.012, 0.035), (121, 0, 0)):
        key_pose(
            armature,
            frame,
            {
                "chest": (breath, 0, 0),
                "head": (0, look, 0),
                "hand.L": (0, -look * 0.35, 0),
                "hand.R": (0, look * 0.35, 0),
            },
            {"hips": (0, 0, abs(breath) * 0.012 * height)},
        )

    actions["walk"] = new_action(armature, "walk")
    walk_keys = (
        (1, 0.42, -0.42, 0.08, 0.62),
        (9, 0.0, 0.0, 0.16, 0.16),
        (16, -0.42, 0.42, 0.62, 0.08),
        (24, 0.0, 0.0, 0.16, 0.16),
        (31, 0.42, -0.42, 0.08, 0.62),
    )
    for frame, left_leg, right_leg, left_knee, right_knee in walk_keys:
        key_pose(
            armature,
            frame,
            {
                "thigh.L": (left_leg, 0, 0),
                "thigh.R": (right_leg, 0, 0),
                "shin.L": (left_knee, 0, 0),
                "shin.R": (right_knee, 0, 0),
                "upper_arm.L": (-left_leg * 0.28, 0, 0),
                "upper_arm.R": (-right_leg * 0.28, 0, 0),
                "forearm.L": (0.08, 0, 0),
                "forearm.R": (0.08, 0, 0),
                "chest": (0, 0, (right_leg - left_leg) * 0.025),
            },
            {"hips": (0, 0, (0.012 if frame in (9, 24) else 0.0) * height)},
        )

    actions["run"] = new_action(armature, "run")
    run_keys = (
        (1, 0.62, -0.62, 0.12, 0.92),
        (7, 0.0, 0.0, 0.24, 0.24),
        (13, -0.62, 0.62, 0.92, 0.12),
        (19, 0.0, 0.0, 0.24, 0.24),
        (25, 0.62, -0.62, 0.12, 0.92),
    )
    for frame, left_leg, right_leg, left_knee, right_knee in run_keys:
        key_pose(
            armature,
            frame,
            {
                "thigh.L": (left_leg, 0, 0),
                "thigh.R": (right_leg, 0, 0),
                "shin.L": (left_knee, 0, 0),
                "shin.R": (right_knee, 0, 0),
                "upper_arm.L": (-left_leg * 0.48, 0, 0),
                "upper_arm.R": (-right_leg * 0.48, 0, 0),
                "forearm.L": (0.34, 0, 0),
                "forearm.R": (0.34, 0, 0),
                "chest": (0.09, 0, (right_leg - left_leg) * 0.035),
            },
            {"hips": (0, 0, (0.022 if frame in (7, 19) else 0.0) * height)},
        )

    actions["agree"] = new_action(armature, "agree")
    for frame, nod in ((1, 0), (8, 0.28), (15, 0), (23, 0.24), (31, 0)):
        key_pose(armature, frame, {"head": (nod, 0, 0)})

    actions["headShake"] = new_action(armature, "headShake")
    for frame, yaw in ((1, 0), (8, -0.38), (16, 0.38), (24, -0.28), (31, 0)):
        key_pose(armature, frame, {"head": (0, yaw, 0)})

    actions["Wave"] = new_action(armature, "Wave")
    for frame, arm, forearm, hand in (
        (1, 0, 0, 0),
        (8, -0.35, -0.55, -0.18),
        (16, -0.46, -0.82, 0.32),
        (23, -0.46, -0.82, -0.32),
        (30, -0.46, -0.82, 0.28),
        (39, -0.35, -0.55, 0),
        (46, 0, 0, 0),
    ):
        key_pose(
            armature,
            frame,
            {
                "upper_arm.R": (arm, 0, -0.18),
                "forearm.R": (forearm, 0, 0),
                "hand.R": (0, hand, 0),
            },
        )

    armature.animation_data.action = None
    return actions


def tune_materials(mesh: bpy.types.Object) -> None:
    for material in mesh.data.materials:
        if not material or not material.use_nodes:
            continue
        principled = material.node_tree.nodes.get("Principled BSDF")
        if not principled:
            continue
        principled.inputs["Roughness"].default_value = 0.58
        if "Metallic IOR" in principled.inputs:
            principled.inputs["Metallic IOR"].default_value = 1.45


def export_character(mesh: bpy.types.Object, armature: bpy.types.Object, output: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_range=False,
        export_skins=True,
        export_def_bones=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
    )


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location: tuple[float, float, float], energy: float, size: float, color) -> None:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    point_at(light, Vector((0, 0, 1.0)))


def render_review(
    key: str,
    armature: bpy.types.Object,
    actions: dict[str, bpy.types.Action],
) -> list[str]:
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    floor_material = bpy.data.materials.new("Review Floor")
    floor_material.diffuse_color = (0.025, 0.04, 0.075, 1)
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, -0.015))
    floor = bpy.context.object
    floor.data.materials.append(floor_material)
    add_area_light("Review Key", (-2.5, -3.5, 5.0), 1250, 4.0, (0.55, 0.88, 1.0))
    add_area_light("Review Fill", (3.0, -1.0, 3.0), 850, 3.0, (1.0, 0.45, 0.68))
    add_area_light("Review Rim", (0.0, 3.0, 4.0), 1400, 3.0, (0.25, 1.0, 0.82))

    camera_data = bpy.data.cameras.new("Review Camera")
    camera = bpy.data.objects.new("Review Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (2.45, -4.25, 2.15)
    camera_data.lens = 62
    point_at(camera, Vector((0, 0, 0.93)))

    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.008, 0.012, 0.026)
    paths = []
    checks = (
        (actions["idle"], 31, "idle"),
        (actions["walk"], 1, "walk-contact"),
        (actions["walk"], 16, "walk-opposite"),
        (actions["Wave"], 16, "greeting"),
    )
    for action, frame, suffix in checks:
        armature.animation_data.action = action
        scene.frame_set(frame)
        path = REVIEW_DIR / f"{key}-{suffix}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(str(path))
    armature.animation_data.action = None
    return paths


def author_character(key: str, source_name: str, target_height: float, review: bool) -> dict[str, object]:
    clear_scene()
    source = MODEL_DIR / source_name
    output = MODEL_DIR / f"{key}_rigged.glb"
    mesh = import_primary_mesh(source)
    minimum, maximum = normalize_mesh(mesh, target_height)
    tune_materials(mesh)
    armature = build_armature(minimum, maximum, key)
    bind_mesh(mesh, armature, minimum, maximum)
    actions = bake_actions(armature, maximum.z - minimum.z)
    export_character(mesh, armature, output)
    review_paths = render_review(key, armature, actions) if review else []
    return {
        "key": key,
        "output": str(output),
        "bytes": output.stat().st_size,
        "vertices": len(mesh.data.vertices),
        "bones": len([bone for bone in armature.data.bones if bone.use_deform]),
        "actions": sorted(actions),
        "review": review_paths,
    }


def run() -> list[dict[str, object]]:
    requested = {
        item.strip()
        for item in os.environ.get("EM_NPC_KEYS", "").split(",")
        if item.strip()
    }
    selected = [item for item in CHARACTERS if not requested or item[0] in requested]
    review_all = os.environ.get("EM_NPC_REVIEW_ALL") == "1"
    results = []
    for index, (key, source, height) in enumerate(selected):
        results.append(author_character(key, source, height, review_all or index == 0))
    return results


RESULT = run()
print(RESULT)
