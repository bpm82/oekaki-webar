"""Blender batch script for the opaque, vertex-colored mesh exported by TripoSR."""
import math
import sys
from pathlib import Path

import bpy


def bake(source, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise ValueError("Expected one TripoSR mesh")
    obj = objects[0]
    mesh = obj.data
    color = mesh.color_attributes.active_color
    if color is None:
        raise ValueError("The input GLB has no vertex colors")
    color_name = color.name

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.uv_layers.new(name="BaseColorUV")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.012,
                             margin_method="FRACTION", scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    material = bpy.data.materials.new("Drawing color")
    material.use_nodes = True
    mesh.materials.clear()
    mesh.materials.append(material)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    output_node = nodes.get("Material Output")
    pbr = nodes.get("Principled BSDF")
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = color_name
    emission = nodes.new("ShaderNodeEmission")
    links.new(attribute.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs[0], output_node.inputs["Surface"])
    image = bpy.data.images.new("BaseColor", width=1024, height=1024, alpha=False)
    image.colorspace_settings.name = "sRGB"
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    nodes.active = texture

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    bpy.ops.object.bake(type="EMIT", margin=4, margin_type="EXTEND")
    image.file_format = "PNG"
    image.pack()

    nodes.remove(attribute)
    nodes.remove(emission)
    # glTF multiplies COLOR_0 by the base-color texture if both are exported.
    while mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes[0])
    links.new(texture.outputs["Color"], pbr.inputs["Base Color"])
    pbr.inputs["Metallic"].default_value = 0
    pbr.inputs["Roughness"].default_value = 1
    links.new(pbr.outputs["BSDF"], output_node.inputs["Surface"])
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB",
                              export_image_format="AUTO", export_animations=False)


if __name__ == "__main__":
    source, destination = sys.argv[sys.argv.index("--") + 1:]
    bake(Path(source).resolve(), Path(destination).resolve())
