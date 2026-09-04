import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { buildLessonMetro } from '../src/design/v3/three/lessonMetroScene.js'

for (const [stations, lit, next] of [[1, 0, true], [24, 6, true], [24, 24, false], [60, 31, true]]) {
  test(`lesson city preserves all ${stations} stations and places the train at lesson ${lit}`, () => {
    const scene = new THREE.Scene()
    const model = buildLessonMetro(THREE, scene, { stations, lit, next, isDay: false })
    const platforms = scene.getObjectByName('lesson-stations')
    assert.equal(platforms.children.length, stations)
    assert.equal(platforms.children.at(-1).name, `lesson-${stations}`)
    model.placeTrain(model.target)
    const train = scene.getObjectByName('metro-train')
    const target = stations === 1 ? .5 : Math.max(0, lit - 1) / (stations - 1)
    assert.equal(train.position.x, (target - .5) * 10)
    if (next && lit < stations) {
      const nextEdge = platforms.children[lit].children[1]
      assert.equal(nextEdge.material.color.getHex(), 0x94ecd4)
    }
    if (lit > 0) assert.equal(platforms.children[0].children[1].material.color.getHex(), 0xe2a0f2)
    const geometries = new Set(), materials = new Set()
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry)
      if (object.material) materials.add(object.material)
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
  })
}
