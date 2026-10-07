import * as THREE from 'three';
import type { TrackDefinition, Vec2 } from '../shared/track';
import { getTrackEvent, nearestDriveableTrack } from '../shared/track-events';

const terrainMaterials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string) {
  let m = terrainMaterials.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }); terrainMaterials.set(color, m); }
  return m;
}
const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);
function hull(points: Vec2[]) {
  const sorted = [...points].sort((a,b)=>a.x-b.x || a.z-b.z), lo: Vec2[] = [], hi: Vec2[] = [];
  for (const p of sorted) { while(lo.length>1 && cross(lo[lo.length-2]!,lo[lo.length-1]!,p)<=0) lo.pop(); lo.push(p); }
  for (const p of sorted.reverse()) { while(hi.length>1 && cross(hi[hi.length-2]!,hi[hi.length-1]!,p)<=0) hi.pop(); hi.push(p); }
  return lo.slice(0,-1).concat(hi.slice(0,-1));
}

/** The island follows the course footprint rather than placing every theme on the same circular disc.
 * All driving corridors (including future shortcuts) remain level and unobstructed.
 * Meshes are owned by the returned group; the renderer can merge and dispose them normally. */
export function buildTrackTerrain(track: TrackDefinition): THREE.Group {
  const group = new THREE.Group(); group.name = `terrain-${track.id}`;
  const routes = [...track.points, ...getTrackEvent(track.id,2,3).branches.flatMap(branch=>branch.points)];
  const margin = track.theme === 'neon' || track.theme === 'harbor' || track.theme === 'foundry' ? 28 : 39;
  const outline = hull(routes.flatMap((p,i)=> i%4 ? [] : Array.from({length:8},(_,j)=>({
    x:p.x+Math.cos(j*Math.PI/4)*margin,z:p.z+Math.sin(j*Math.PI/4)*margin }))));
  const cx = outline.reduce((s,p)=>s+p.x,0)/outline.length, cz=outline.reduce((s,p)=>s+p.z,0)/outline.length;
  // Sky is a chain of floating islets, with a broad shallow foundation below the road.
  // The road shoulders remain opaque; gaps are visual scenery, never hidden death traps.
  const underside = track.theme === 'sky' ? -21 : track.theme === 'ice' ? -7 : -5;
  const colors = track.theme === 'ice' ? ['#dceff0','#a4cfd5'] : track.theme === 'volcano' ? ['#534a46','#383e43']
    : track.theme === 'canyon' ? ['#cb8c60','#a56f50'] : track.theme === 'sky' ? ['#c1cdae','#9690ac']
    : track.theme === 'neon' ? ['#343f5a','#222e48'] : [track.palette.ground,track.theme === 'harbor' ? '#7c9390' : '#95876a'];
  const n=outline.length, rings=14, vertices:number[]=[], indices:number[]=[];
  const relief = track.theme === 'ice' ? 9 : track.theme === 'canyon' ? 7 : track.theme === 'forest' ? 4 : track.theme === 'volcano' ? 5 : 1.5;
  for(let r=0;r<=rings;r++) for(let i=0;i<n;i++) {
    const fraction=r/rings,p=outline[i]!,x=cx+(p.x-cx)*fraction,z=cz+(p.z-cz)*fraction;
    const near=nearestDriveableTrack(x,z,track.id,2,3);
    const free=Math.max(0,near.distance-near.width/2-26);
    const h=Math.min(1,free/26)*relief*(.45+.3*Math.sin(x*.036)+.25*Math.cos(z*.042));
    vertices.push(x, -.18+(r===rings ? -.5 : h), z);
    if(r<rings) { const a=r*n+i,b=r*n+(i+1)%n,c=(r+1)*n+i,d=(r+1)*n+(i+1)%n; indices.push(a,b,c,b,d,c); }
  }
  // Flatten every triangle whose conservative bounding circle touches a driving corridor.
  // This covers crossings between vertices, including all branches that may open later.
  for(let k=0;k<indices.length;k+=3) {
    const ids=indices.slice(k,k+3),x=ids.reduce((s,i)=>s+vertices[i*3]!,0)/3,z=ids.reduce((s,i)=>s+vertices[i*3+2]!,0)/3;
    const extent=Math.max(...ids.map(i=>Math.hypot(vertices[i*3]!-x,vertices[i*3+2]!-z)));
    const near=nearestDriveableTrack(x,z,track.id,2,3);
    if(near.distance<near.width/2+extent+12) for(const i of ids) vertices[i*3+1]=-.18;
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  const top=new THREE.Mesh(geo,material(colors[0]!));top.receiveShadow=true;group.add(top);
  const sides:number[]=[],sideIndices:number[]=[];
  for(let i=0;i<n;i++) {
    const p=outline[i]!,q=outline[(i+1)%n]!,base=sides.length/3;
    const inward=track.theme==='sky'?.78:1.025;
    sides.push(p.x,-.68,p.z,q.x,-.68,q.z,cx+(p.x-cx)*inward,underside,cz+(p.z-cz)*inward,cx+(q.x-cx)*inward,underside,cz+(q.z-cz)*inward);
    sideIndices.push(base,base+1,base+2,base+1,base+3,base+2);
  }
  const sideGeometry=new THREE.BufferGeometry();sideGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sides,3));sideGeometry.setIndex(sideIndices);sideGeometry.computeVertexNormals();
  const edge=new THREE.Mesh(sideGeometry,material(colors[1]!));edge.receiveShadow=true;group.add(edge);
  group.userData.role='landscape-terrain';group.userData.outlineVertices=n;
  return group;
}
