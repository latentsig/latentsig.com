import * as THREE from 'three';

const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
export const revealAt = (time: number, start: number, end: number) => smooth((time - start) / 2) * (1 - smooth((time - end + 2) / 2));

/** Shared geometry and instancing keep the moving anatomy inexpensive to render. */
export function createMechanisms() {
  const root = new THREE.Group(); root.name = 'ProceduralMechanisms';
  const metal = new THREE.MeshStandardMaterial({ color: 0x8694bd, metalness: .8, roughness: .28 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xb8c9e0, metalness: .42, roughness: .3 });
  const light = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8090bb, emissiveIntensity: .3, metalness: .2, roughness: .25 });
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const packetRotation = new THREE.Euler();
  const up = new THREE.Vector3(0, 1, 0), delta = new THREE.Vector3();
  const set = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    position.set(x, y, z); scale.set(sx, sy, sz); matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix);
  };
  const instances = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, parent: THREE.Group) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parent.add(mesh); return mesh;
  };
  const research = new THREE.Group(); research.position.set(-5.9, 1.85, .25); root.add(research);
  const seeds = Array.from({ length: 22 }, (_, i) => {
    const y = 1 - 2 * (i + .5) / 22, angle = i * Math.PI * (3 - Math.sqrt(5)), radius = Math.sqrt(1 - y * y);
    return new THREE.Vector3(Math.cos(angle) * radius * 1.13, y * 1.13, Math.sin(angle) * radius * 1.13);
  });
  const points = seeds.map(p => p.clone());
  const pairs: [number, number][] = [];
  seeds.forEach((p, i) => seeds.map((v, j) => ({ j, d: p.distanceToSquared(v) })).sort((a,b) => a.d - b.d).slice(1,4).forEach(({j}) => { if(j > i) pairs.push([i,j]); }));
  const nodes = instances(sphere, ceramic, 22, research);
  for(let i=0;i<22;i++) nodes.setColorAt(i, new THREE.Color(i%3 ? 0xdae2fd : 0x89ceff));
  const links = instances(new THREE.CylinderGeometry(1, 1, 1, 5), metal, pairs.length, research);
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(.29, 1), light); research.add(nucleus);

  const architecture = new THREE.Group(); architecture.position.set(2.55, 0, -5); root.add(architecture);
  const planes = instances(box, metal, 3, architecture);
  for(let i=0;i<3;i++) planes.setColorAt(i, new THREE.Color(i === 1 ? 0x56658b : 0xc5c9ee));
  const corners = instances(sphere, light, 12, architecture);
  for(let i=0;i<12;i++) corners.setColorAt(i, new THREE.Color(0xc0a2ff));
  const pins = instances(new THREE.CylinderGeometry(.008, .008, 1, 4), light, 4, architecture);
  const labelPoints = Array.from({ length:3 }, () => new THREE.Vector3());

  const deployment = new THREE.Group(); deployment.position.set(4.65, 0, 4.1); root.add(deployment);
  const archPoints = [[-1.1,.45],[-1.1,2.05],[-.76,2.4],[.76,2.4],[1.1,2.05],[1.1,.45]].map(([x,y])=>new THREE.Vector3(x,y,0));
  const path = new THREE.CurvePath<THREE.Vector3>();
  for(let i=1;i<archPoints.length;i++) path.add(new THREE.LineCurve3(archPoints[i-1],archPoints[i]));
  const gates = instances(new THREE.TubeGeometry(path, 30, .085, 6, false), metal, 3, deployment);
  const gateLights = instances(new THREE.TubeGeometry(path, 30, .018, 5, false), light, 3, deployment);
  for(let i=0;i<3;i++) gateLights.setColorAt(i,new THREE.Color(0xffc284));
  const packets = instances(box, ceramic, 4, deployment);
  for(let i=0;i<4;i++) packets.setColorAt(i,new THREE.Color(i%2 ? 0xffc284 : 0xdae2fd));
  const all = [nodes,links,planes,corners,pins,gates,gateLights,packets];
  let researchReveal = 0, architectureReveal = 0, deploymentReveal = 0;
  function update(time: number) {
    researchReveal = revealAt(time,15,25); architectureReveal = revealAt(time,28,38); deploymentReveal = revealAt(time,41,52);
    research.rotation.y = -time / 60 * Math.PI * 6;
    rotation.identity();
    points.forEach((p,i) => {
      const seed = seeds[i];
      p.copy(seed).multiplyScalar(1 + researchReveal * .26);
      p.y += (i%3 - 1) * researchReveal * .48;
      set(nodes,i,p.x,p.y,p.z,i%4 ? .085 : .12);
    });
    pairs.forEach(([a,b],i) => {
      delta.subVectors(points[b],points[a]); const length = delta.length(); rotation.setFromUnitVectors(up,delta.divideScalar(length));
      position.addVectors(points[a],points[b]).multiplyScalar(.5); scale.set(.013,length,.013);
      matrix.compose(position,rotation,scale); links.setMatrixAt(i,matrix);
    });
    nucleus.rotation.y = time * Math.PI / 5;
    rotation.identity();
    for(let i=0;i<3;i++) {
      const y = 2.4 + i*.22 + architectureReveal * i*.72;
      const x = (i-1) * architectureReveal * .17;
      set(planes,i,x,y,0,2.1,.045,2.1);
      for(let j=0;j<4;j++) set(corners,i*4+j,x+(j%2 ? .94:-.94),y+.045,j<2 ? -.94:.94,.035);
      labelPoints[i].set(2.55+x+1.15,y,-5);
    }
    const height=.44+architectureReveal*1.44;
    for(let j=0;j<4;j++) set(pins,j,j%2 ? .94:-.94,2.4+height/2,j<2 ? -.94:.94,1,height,1);
    pins.visible=architectureReveal>.04;
    for(let i=0;i<3;i++) {
      const z = (i-1)*(.69 + deploymentReveal*.48);
      const lift = deploymentReveal * (i%2 ? .18 : .03);
      set(gates,i,0,lift,z,1); set(gateLights,i,0,lift,z, .87,.93,1);
    }
    for(let i=0;i<4;i++) {
      const f=(time/5+i/4)%1;
      const fade=Math.min(1,f*9,(1-f)*9);
      packetRotation.set(.15,time/60*Math.PI*12+i,.18); rotation.setFromEuler(packetRotation);
      set(packets,i,0,1.2+Math.sin(f*Math.PI*2)*.08,(f-.5)*(2.25+deploymentReveal*1.4),.35*fade);
    }
    all.forEach(mesh=>mesh.instanceMatrix.needsUpdate=true);
  }
  return { root, update, labelPoints, state: () => ({researchReveal,architectureReveal,deploymentReveal}) };
}
