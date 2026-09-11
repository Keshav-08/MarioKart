import * as THREE from 'three';
import type { CourseId, RaceCourse } from './course';

export type Vehicle = 'kart' | 'bike' | 'buggy' | 'truck';
export const VEHICLES = {
  kart: { name: 'Comet Kart', description: 'Balanced grip and drift', acceleration: 1, steering: 1, grip: 1, mass: 100, rough: 1 },
  bike: { name: 'Vector Bike', description: 'Quick acceleration, agile turns', acceleration: 1.12, steering: 1.1, grip: .94, mass: 75, rough: 1.15 },
  buggy: { name: 'Dune Buggy', description: 'Stable grip, faster rough terrain', acceleration: .96, steering: .94, grip: 1.15, mass: 115, rough: .45 },
  truck: { name: 'Atlas Truck', description: 'Heavyweight, resists impacts', acceleration: .88, steering: .9, grip: 1.1, mass: 155, rough: .8 },
} satisfies Record<Vehicle, object>;
export interface Adventure {
  flight: [number, number]; height: number; flightName: string;
  tunnel: [number, number]; tunnelName: string;
  hover?: [number, number];
  hazards: { p: number; kind: 'wave' | 'truck' | 'steam' | 'gust'; period: number }[];
}
export const ADVENTURES: Record<CourseId, Adventure> = {
  beach: { flight: [.35,.52], height: 27, flightName: 'SEABIRD CANYON', tunnel: [.10,.21], tunnelName: 'TWIN TIDE CAVES', hover: [.65,.76], hazards: [{p:.07,kind:'wave',period:7},{p:.85,kind:'wave',period:6}] },
  cloudburst: { flight: [.27,.43], height: 35, flightName: 'STORM CLOUD RUN', tunnel: [.77,.86], tunnelName: 'CRYSTAL MOUNTAIN', hazards: [{p:.17,kind:'gust',period:8},{p:.68,kind:'gust',period:6}] },
  neon: { flight: [.35,.50], height: 32, flightName: 'ROOFTOP EXPRESS', tunnel: [.69,.79], tunnelName: 'AFTER HOURS ARCADE', hazards: [{p:.14,kind:'truck',period:8},{p:.58,kind:'truck',period:7}] },
  foundry: { flight: [.27,.43], height: 29, flightName: 'TURBINE AIRWAY', tunnel: [.68,.80], tunnelName: 'FURNACE HALL', hazards: [{p:.17,kind:'steam',period:6},{p:.55,kind:'steam',period:7}] },
};
export const inSection = (p: number, section: [number,number]) => p >= section[0] && p <= section[1];
export function flightHeight(track: RaceCourse, p: number) {
  const {flight,height}=ADVENTURES[track.id];
  const t=THREE.MathUtils.clamp((p-flight[0])/(flight[1]-flight[0]),0,1);
  return track.pointAt(p).y + 1 + Math.sin(t*Math.PI)*height;
}
// Warning first, active hazard second; rendering and collision share the same clock.
export function hazardState(track: RaceCourse, index: number, time: number, _lap=0) {
  const h=ADVENTURES[track.id].hazards[index], phase=((time+index*1.7)%h.period)/h.period;
  return { warning:phase>.35&&phase<.55, active:phase>=.55&&phase<.88,
    lane:h.kind==='truck'? Math.sin(phase*Math.PI*2)*track.width*.45 : Math.sin(index)*track.width*.22 };
}
