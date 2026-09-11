// One height function drives both the rendered sand and the physical support surface.
export function beachHeight(x: number, z: number) {
  const radius = Math.hypot(x, z - 20);
  const shore = Math.max(0, (radius - 112) / 30);
  const dune = (cx:number,cz:number,h:number,w:number) => h * Math.exp(-((x-cx)**2+(z-cz)**2)/(w*w));
  return 3 - shore * 7 + dune(-38,5,9,25) + dune(42,74,7,27) + dune(-65,88,4,18) - dune(-87,59,4.4,20);
}
export const BEACH_WATER = 0;
export const beachDrivable = (x:number,z:number) => beachHeight(x,z) >= -1.8;
