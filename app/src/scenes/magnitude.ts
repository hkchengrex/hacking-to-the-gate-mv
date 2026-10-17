// `magnitude` — #13 形而上のネクローシス, あなたには 瞬き程度の些事な等級 (docs/DESIGN.md).
// To you, a lifetime is a trivial magnitude, a blink. Powers of ten, in space and in time: from the lab's
// block in Akihabara the frame jumps out by orders of magnitude on every beat (Tokyo, the coast, the Earth,
// the Moon's orbit, the solar system, the nearest stars, the Milky Way, the Local Group, the cosmic web, the
// observable universe), and time runs faster with it, so every scale shows its own motion: a day sweeping
// across the Earth, the Moon's month, the planets' years, the galaxy's turn. 瞬: an eyelid shuts for three
// frames and opens on the solar system. The readout gives the frame's size, the time light takes to cross it
// and the time elapsed. At the end: on a cosmic calendar (13.8 billion years as one year) a lifetime lasts
// 0.18 s, a blink.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, prog, pulse } from '../engine/util';
import { Plate, charsOf, lyricRail, shakeAt } from './_kit';

const R_E = 6.371e6, R_SUN = 6.96e8, AU = 1.496e11, LY = 9.461e15, KLY = 1e3 * LY, MPC = 3.086e22;
const DAY = 86400, YEAR = 3.156e7;

/** The zoom: log₁₀ of the frame's width in metres at each beat. */
const STOPS = [3.3, 4.6, 6.0, 7.35, 9.2, 11.8, 13.1, 17.3, 18.6, 20.2, 21.35, 22.8, 24.0, 25.2, 26.2, 27.45];
/** How fast time runs at a zoom (log₁₀ s per s): each scale shows its own motion. */
const RATE: [number, number][] = [[3, 0.6], [7.35, 4.4], [9.2, 5.9], [11.8, 7.2], [13.1, 8.9], [16.9, 11.5], [21.35, 15.3], [24, 16.7], [27.45, 17.8]];
/** The planets: name, orbit (AU), phase. */
const PLANETS: [string, number, number][] = [
  ['MERCURY', 0.387, 1.1], ['VENUS', 0.723, 4.0], ['EARTH', 1, 2.3], ['MARS', 1.524, 5.1],
  ['JUPITER', 5.2, 0.6], ['SATURN', 9.58, 3.3], ['URANUS', 19.2, 1.9], ['NEPTUNE', 30.1, 4.6],
];
// Where things are from the Sun (metres, screen axes: y down).
const unit = (x: number, y: number, d: number): [number, number] => { const l = Math.hypot(x, y); return [(x / l) * d, (y / l) * d]; };
const GC = unit(-0.82, -0.57, 26 * KLY); // the centre of the Milky Way
const M31 = unit(0.9, 0.44, 2537 * KLY), M33 = unit(0.96, 0.27, 2730 * KLY), LMC = unit(-0.5, 0.86, 160 * KLY);
const ACEN = unit(-0.72, -0.3, 4.37 * LY), SIRIUS = unit(0.93, 0.2, 8.6 * LY);
const RU = 46.5e9 * LY; // the observable universe's radius

const ss = (a: number, b: number, x: number) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
/** 1 inside [a, b] of the zoom, fading over `f` decades either side. */
const span = (z: number, a: number, b: number, f = 0.35) => ss(a - f, a, z) * (1 - ss(b, b + f, z));

function rateLog(z: number) {
  if (z <= RATE[0]![0]) return RATE[0]![1];
  for (let i = 1; i < RATE.length; i++) {
    const [z1, r1] = RATE[i]!, [z0, r0] = RATE[i - 1]!;
    if (z <= z1) return lerp(r0, r1, (z - z0) / (z1 - z0));
  }
  return RATE[RATE.length - 1]![1];
}

const FRAG = /* glsl */ `
  uniform float Z, kKm, kRe, kLy, kKly, kMpc, sim;
  uniform vec2 earthPx, sunPx;
  uniform float wLocal, wGlobe, wSky, wStars, wGal, wWeb;
  uniform vec3 sunV;
  uniform float gRot;
  uniform vec2 gc, m31, m33, lmc;

  // bright points of a fixed size in px, one per cell (of size cell, in the layer's units) with probability p
  float points(vec2 x, float cell, float pxPerUnit, float p, float seed) {
    vec2 id = floor(x / cell); vec2 f = x / cell - id;
    vec2 h = hash22(id + seed);
    float on = step(hash12(id * 1.37 + seed), p);
    vec2 d = (f - (0.15 + 0.7 * h)) * cell * pxPerUnit;
    return on * exp(-dot(d, d) / 1.1) * (0.25 + 0.75 * pow(hash12(id + seed + 5.1), 2.0));
  }
  float lineAA(float dKm, float halfKm, float pxKm) { return 1.0 - smoothstep(halfKm, halfKm + pxKm * 1.2, dKm); }

  // ---- Japan round the lab, in km (y down = south): Honshu as a bent band, the lab near its south-east coast ----
  float landKm(vec2 x) {
    vec2 along = vec2(0.72, -0.69), nrm = vec2(0.69, 0.72); // to the north-east, to the south-east
    vec2 d0 = x - vec2(-60.0, -90.0);
    float u = dot(d0, along), v = dot(d0, nrm) - 0.00045 * u * u;
    float halfW = 135.0 + 35.0 * fbm(vec2(u / 300.0, 1.7), 3);
    float land = halfW - abs(v) + 45.0 * fbm(x / 160.0 + vec2(2.7, 5.3), 6) + 6.0 * fbm(x / 9.0, 3);
    vec2 bay = (x - vec2(6.0, 30.0)) * vec2(1.0, 0.7);
    land -= 90.0 * exp(-dot(bay, bay) / 300.0); // Tokyo Bay, open to the south
    return land;
  }
  // how built-up a place is (0..1): the metropolis round the lab, Nagoya and Osaka down the coast, towns
  float cityKm(vec2 x) {
    float r = length(x);
    float metro = exp(-r * r / 1100.0) * (0.75 + 0.5 * fbm(x / 6.0, 4));
    vec2 n = x - vec2(-265.0, 60.0), o = x - vec2(-400.0, 95.0), s = x - vec2(300.0, -260.0);
    float cities = 0.9 * exp(-dot(n, n) / 500.0) + exp(-dot(o, o) / 800.0) + 0.6 * exp(-dot(s, s) / 150.0);
    // the Tokaido corridor along the coast to Osaka
    float tk = sdSegment(x, vec2(-30.0, 30.0), vec2(-400.0, 95.0));
    float towns = sat(fbm(x / 45.0 + 1.3, 5) * 1.7 - 0.15);
    return sat(metro + cities + 0.35 * exp(-tk * tk / 120.0) + towns * towns * 0.6);
  }

  // ---- Akihabara to the coast: a night map ----
  vec3 local(vec2 x, float pxKm) {
    float isLand = smoothstep(-pxKm * 1.2, pxKm * 1.2, landKm(x));
    // dark places: the Kanda river just south of the station, the Sumida to the east, the Imperial Palace
    float kanda = lineAA(abs(x.y - 0.22 - 0.05 * sin(x.x * 4.0)), 0.016, pxKm);
    float sumida = lineAA(abs(x.x - 2.4 - 0.5 * sin(x.y * 0.5)), 0.08, pxKm) * (1.0 - smoothstep(4.0, 6.0, abs(x.y + 1.0)));
    vec2 pp = (x - vec2(-2.3, 1.2)) * vec2(1.0, 1.25);
    float palace = 1.0 - smoothstep(0.7, 0.75 + pxKm, length(pp));
    float dark = max(max(kanda, sumida), palace);
    isLand *= 1.0 - max(kanda, sumida);
    float dens = isLand * cityKm(x) * (1.0 - palace);
    // lights over many cell sizes, each octave shown while its cells are a few px across; the rest is haze
    float L = 0.0, cell = 0.03;
    for (int o = 0; o < 10; o++) {
      float cpx = cell / pxKm;
      float w = smoothstep(1.5, 5.0, cpx) * (1.0 - smoothstep(60.0, 160.0, cpx));
      if (w > 0.001) L += w * points(x, cell, 1.0 / pxKm, dens * 0.75, float(o) * 13.1);
      cell *= 2.6;
    }
    float haze = dens * 0.07 * smoothstep(3.0, 30.0, pxKm * 1000.0);
    // the expressways: two rings and the radials, bright thin lines while the city is a field of lights
    float r = length(x), ang = atan(x.y, x.x);
    float dRing = min(abs(r - 7.5 - 0.6 * snoise(x / 5.0)), abs(r - 14.0 - 0.9 * snoise(x / 7.0 + 3.0)));
    float dRad = abs(fract(ang * 9.0 / TAU + 0.15 * snoise(x / 25.0)) - 0.5) * TAU / 9.0 * r + step(r, 2.0) * 9.0;
    float hw = (1.0 - smoothstep(0.5, 1.6, min(dRing, dRad) / pxKm)) * exp(-r / 45.0) * smoothstep(0.004, 0.015, pxKm) * (1.0 - smoothstep(0.4, 1.5, pxKm));
    vec3 col = mix(C_INK * 0.2, C_INK2 * 0.35, isLand);
    col += C_EMBER * (L * 0.9 + haze + hw * 0.55 * isLand);
    // close up: blocks with their roofs and signs, streets with their lamps, the main roads with their traffic,
    // the railways crossing at the station
    float near = 1.0 - smoothstep(0.004, 0.012, pxKm);
    if (near > 0.001) {
      vec2 xr = rot2(0.42) * x + 0.008 * vec2(snoise(x * 6.0), snoise(x * 6.0 + 3.0));
      float row = floor(xr.y / 0.085);
      float bw = 0.06 + 0.06 * hash11(row * 7.1);
      float col0 = floor((xr.x + hash11(row * 3.7) * 0.06) / bw);
      float gx = abs(fract((xr.x + hash11(row * 3.7) * 0.06) / bw + 0.5) - 0.5) * bw;
      float gy = abs(fract(xr.y / 0.085 + 0.5) - 0.5) * 0.085;
      float dSt = min(gx, gy);
      float street = lineAA(dSt, 0.0035, pxKm);
      float dMain = min(abs(xr.x - 0.05), min(abs(xr.y + 0.33), abs(xr.y - 0.52)));
      float road = lineAA(dMain, 0.011, pxKm);
      float bh = hash12(vec2(row, col0) + 17.0); // each block's roof
      vec3 roof = C_INK2 * (0.2 + 0.25 * bh) + (bh > 0.93 ? C_EMBER * 0.06 : vec3(0.0));
      float lamps = points(x, 0.018, 1.0 / pxKm, 0.9, 51.0) * lineAA(dSt, 0.007, pxKm);
      float car = points(vec2(xr.x - 0.05, xr.y + sim * 0.012), 0.01, 1.0 / pxKm, 0.55, 21.0) * lineAA(abs(xr.x - 0.05), 0.009, pxKm)
                + points(vec2(xr.x - sim * 0.012, xr.y + 0.33), 0.01, 1.0 / pxKm, 0.55, 22.0) * lineAA(abs(xr.y + 0.33), 0.009, pxKm);
      float dR1 = abs(x.x + 0.16 + 0.03 * sin(x.y * 2.0)), dR2 = abs(x.y + 0.1);
      float rails = lineAA(abs(dR1 - 0.004), 0.0012, pxKm) + lineAA(abs(dR2 - 0.004), 0.0012, pxKm);
      float train = step(0.84, fract((x.y + sim * 0.011) / 0.7)) * lineAA(dR1, 0.006, pxKm)
                  + step(0.84, fract((x.x - sim * 0.009) / 0.9)) * lineAA(dR2, 0.006, pxKm);
      float station = 1.0 - smoothstep(0.0, pxKm * 1.5, sdBox(rot2(0.1) * (x - vec2(-0.16, -0.1)), vec2(0.03, 0.11)));
      // signs: small lit boxes on the buildings, crowded along the main road (the Electric Town)
      float cs = 0.012;
      vec2 sid = floor(x / cs), sf = x - (sid + 0.5) * cs, sh = hash22(sid + 41.0);
      float sOn = step(hash12(sid * 1.9 + 3.0), 0.12 + 0.55 * exp(-dMain / 0.05)) * (1.0 - street) * (1.0 - road);
      float sm = 1.0 - smoothstep(0.0, pxKm * 1.2, sdBox(sf - (sh - 0.5) * cs * 0.4, vec2(0.0015 + 0.004 * sh.x, 0.001 + 0.002 * sh.y)));
      float hue = hash12(sid + 4.0);
      vec3 sc = hue < 0.2 ? C_NIXIE * 1.5 : hue < 0.6 ? C_EMBER * 1.1 : C_BONE;
      vec3 nc = mix(roof, C_INK * 0.2, max(street, road));
      nc += C_EMBER * (street * 0.07 + road * 0.16 + lamps * 0.9);
      nc += C_BONE * (car * 1.8 + train * 1.4 + rails * 0.25 + station * 0.45);
      nc += sc * sOn * sm;
      nc *= 1.0 - dark * 0.9;
      col = mix(col, nc, near);
    }
    return col;
  }

  // ---- the Earth, seen from above the lab (q in Earth radii, y down = south) ----
  vec3 globe(vec2 q, float pxRe, out float disc) {
    float r = length(q);
    disc = 1.0 - smoothstep(1.0 - pxRe, 1.0 + pxRe, r);
    vec3 col = vec3(0.0);
    if (r < 1.0) {
      vec3 n = vec3(q.x, -q.y, sqrt(1.0 - r * r));
      // the land: Japan from the map, Asia to the west and north-west, Australia at the southern limb
      vec2 km = q * 6371.0;
      float japan = mix(-1.0, landKm(km) / 60.0, 1.0 - smoothstep(0.2, 0.3, r));
      float asia = (-q.x - 0.3 - 0.35 * q.y) * 3.0 + fbm(n * 2.3 + vec3(3.1, 7.7, 1.9), 6) * 1.1;
      float aus = 1.1 - length((q - vec2(-0.12, 0.93)) * vec2(1.0, 1.7)) * 3.5 + fbm(n * 3.1, 4) * 0.8;
      float land = max(max(japan, asia), aus);
      float isLand = smoothstep(-pxRe * 20.0, pxRe * 20.0, land);
      float day = dot(n, sunV);
      float lit = smoothstep(-0.06, 0.16, day);
      vec3 ground = mix(C_ASH * 0.28, C_BONE * 0.36, sat(fbm(n * 7.0, 4) + 0.5));
      vec3 dayCol = mix(C_GUNMETAL * 0.22, ground, isLand);
      // clouds: long streaks curling round
      vec3 cn = n * vec3(4.0, 9.0, 4.0);
      float cloud = sat(fbm(cn + 0.6 * vec3(fbm(n * 3.0, 3), 0.0, 0.0) + vec3(0.0, 0.0, 9.0), 6) * 1.8 - 0.25);
      dayCol = mix(dayCol, C_BONE * 0.75, cloud * 0.8) * (0.15 + 0.95 * max(day, 0.0));
      // the night side: city lights (Japan from the map, the rest in clusters)
      float city = mix(sat(fbm(n * 16.0, 4) * 1.7 - 0.25), cityKm(km), 1.0 - smoothstep(0.15, 0.25, r));
      float speck = sat(snoise(n * 900.0) * 2.0 - 0.3) + 0.6 * sat(snoise(n * 260.0) * 2.0 - 0.5);
      vec3 night = C_INK2 * 0.25 * isLand + C_INK * 0.15 + C_EMBER * isLand * city * (0.2 + speck) * 1.6;
      col = mix(night, dayCol, lit);
      // a warm band along the terminator
      col += C_EMBER * 0.12 * exp(-day * day / 0.004) * (0.3 + cloud);
      col *= 0.7 + 0.3 * n.z;
    }
    vec2 dir = r > 1e-4 ? q / r : vec2(1.0, 0.0);
    float side = smoothstep(-0.3, 0.5, dot(vec3(dir.x, -dir.y, 0.0), sunV));
    float atm = exp(-abs(r - 1.0) / 0.01) * (r > 1.0 ? 1.0 : smoothstep(0.92, 1.0, r));
    col += mix(C_ASH, C_BONE, 0.6) * atm * (0.05 + 0.75 * side);
    return col;
  }

  // ---- a spiral galaxy (p in units of 10 kly) ----
  float galaxy(vec2 p, float rot, out float core) {
    float r = length(p);
    float th = atan(p.y, p.x) - rot;
    float disc = exp(-r / 1.4);
    float ph = 2.0 * (th + log(max(r, 0.08)) / 0.24);
    float arm = pow(0.5 + 0.5 * cos(ph), 3.0);
    float dust = pow(0.5 + 0.5 * cos(ph - 0.9), 10.0) * smoothstep(0.4, 1.2, r);
    float clump = 0.6 + 0.8 * sat(fbm(p * 2.2 + 3.0, 5) + 0.3);
    vec2 pb = rot2(rot) * p;
    float bar = exp(-pow(pb.x / 0.9, 2.0) - pow(pb.y / 0.25, 2.0)) * 0.7;
    core = exp(-r * r / 0.18) * 2.0 + bar;
    return (disc * (0.22 + 1.3 * arm * clump) * (1.0 - 0.6 * dust) + core) * (1.0 - smoothstep(4.0, 5.5, r));
  }
  // its density, cheaply (for the stars)
  float galaxyDens(vec2 p, float rot) {
    float r = length(p);
    float ph = 2.0 * (atan(p.y, p.x) - rot + log(max(r, 0.08)) / 0.24);
    return exp(-r / 1.4) * (0.3 + pow(0.5 + 0.5 * cos(ph), 3.0)) * (1.0 - smoothstep(4.0, 5.5, r));
  }

  // ---- the cosmic web (x in Mpc): voids, filaments, clusters where they meet ----
  vec2 worley(vec2 x) {
    vec2 id = floor(x), f = fract(x);
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      float d = length(g + hash22(id + g) - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return vec2(d1, d2);
  }
  float webDens(vec2 x) {
    vec2 w = x + 9.0 * vec2(snoise(x / 70.0), snoise(x / 70.0 + 5.2));
    vec2 a = worley(w / 40.0), b = worley(w / 13.0 + 7.3);
    float fa = exp(-(a.y - a.x) * 16.0) * (0.45 + 0.55 * snoise(x / 30.0 + 2.0) * 0.5 + 0.275);
    float fb = exp(-(b.y - b.x) * 14.0) * 0.45 * (0.3 + 1.2 * exp(-(a.y - a.x) * 4.0));
    // we sit in a sheet of galaxies (the Local Supercluster) rather than in a void
    return fa + fb + exp(-a.x * a.x * 150.0) * 1.5 + 0.9 * exp(-dot(x, x) / 500.0);
  }

  void main() {
    vec2 P = vec2(FRAG_PX.x, ${H}.0 - FRAG_PX.y);
    vec3 col = C_INK * 0.25;
    // Akihabara to the coast
    if (wLocal > 0.001) col = mix(col, local((P - earthPx) * kKm, kKm), wLocal);
    // the far stars, fixed behind the Earth and the planets (too far away to move with the zoom)
    float disc = 0.0;
    vec3 g = vec3(0.0);
    if (wGlobe > 0.001) g = globe((P - earthPx) * kRe, kRe, disc);
    if (wSky > 0.001) col += wSky * (1.0 - disc * wGlobe) * C_BONE * 0.55 * (points(P, 34.0, 1.0, 0.3, 3.0) + 0.6 * points(P, 13.0, 1.0, 0.2, 9.0));
    col = mix(col, g + col * (1.0 - disc), wGlobe);
    // the stars round the Sun, zooming, thickening into the galaxy
    vec2 xk = (P - sunPx) * kKly; // kly from the Sun
    if (wStars > 0.001) {
      vec2 xl = (P - sunPx) * kLy;
      float dens = galaxyDens((xk - gc) / 10.0, gRot) / 0.18;
      float s = 0.0, cell = 1.6;
      for (int o = 0; o < 12; o++) {
        float cpx = cell / kLy;
        float w = smoothstep(1.5, 5.0, cpx) * (1.0 - smoothstep(250.0, 600.0, cpx));
        if (w > 0.001) s += w * points(xl, cell, 1.0 / kLy, sat(0.3 * dens), float(o) * 7.7);
        cell *= 3.0;
      }
      col += wStars * mix(C_BONE, C_EMBER, 0.25) * s * 1.4;
    }
    // the Milky Way and its neighbours
    if (wGal > 0.001) {
      float core;
      float mw = galaxy((xk - gc) / 10.0, gRot, core);
      vec2 a = rot2(0.6) * (xk - m31); a.y /= 0.23;
      float c2; float an = galaxy(a / 22.0, 0.4, c2) * 2.5;
      vec2 b = rot2(-0.4) * (xk - m33); b.y /= 0.55;
      float c3; float tr = galaxy(b / 6.0, 1.1, c3) * 1.2;
      vec2 l = xk - lmc;
      float mc = exp(-dot(l, l) / 90.0) * (0.5 + 0.8 * sat(fbm(l / 4.0, 4) + 0.3));
      float cores = core + c2 * 1.8 + c3 * 1.2;
      vec3 gcol = mix(C_EMBER * 0.9, C_BONE, 0.55) * (mw + an + tr + mc - cores) + mix(C_EMBER, C_BONE, 0.7) * cores * 1.3;
      col += wGal * gcol * 0.55 * (1.0 + 1.5 * smoothstep(21.5, 22.8, Z)); // small and far: lift them so they read
    }
    // the cosmic web: galaxies as points along the filaments, a glow where they are too small to see,
    // and the edge of the observable universe with the cosmic microwave background
    vec2 xm = (P - sunPx) * kMpc;
    float RUm = ${(RU / MPC).toFixed(1)};
    float rU = length(xm);
    if (wWeb > 0.001) {
      float resolved = smoothstep(1.0, 6.0, 40.0 / kMpc); // web cells (40 Mpc) in px
      float wd = mix(0.42 * (0.6 + 0.8 * sat(fbm(xm / 250.0, 4) + 0.5)), webDens(xm), resolved);
      float gal = 0.0, cell = 0.5;
      for (int o = 0; o < 3; o++) {
        float cpx = cell / kMpc;
        float w = smoothstep(1.5, 4.0, cpx) * (1.0 - smoothstep(250.0, 500.0, cpx));
        if (w > 0.001) gal += w * points(xm, cell, 1.0 / kMpc, sat(wd * 0.6), 4.0 + float(o) * 3.3);
        cell *= 3.0;
      }
      float glow = wd * (1.0 - smoothstep(1.5, 8.0, 0.5 / kMpc)); // what the points can't show
      float inside = 1.0 - smoothstep(RUm * 0.995, RUm + kMpc * 1.5, rU);
      col += wWeb * inside * (C_BONE * gal * 1.1 + mix(C_EMBER, C_BONE, 0.45) * glow * 0.2);
    }
    if (abs(rU - RUm) < RUm * 0.12) {
      float shell = exp(-pow((rU - RUm) / (RUm * 0.022), 2.0)) * (0.45 + 0.9 * sat(fbm(xm / 900.0, 5) + 0.4));
      col += C_EMBER * shell * 0.9;
    }
    fragColor = vec4(col, 1.0);
  }`;

export default class Magnitude extends Plate {
  L = new Layer2D();
  pass = new FSPass(FRAG, {
    Z: { value: 0 }, kKm: { value: 1 }, kRe: { value: 1 }, kLy: { value: 1 }, kKly: { value: 1 }, kMpc: { value: 1 }, sim: { value: 0 },
    earthPx: { value: [0, 0] }, sunPx: { value: [0, 0] },
    wLocal: { value: 0 }, wGlobe: { value: 0 }, wSky: { value: 0 }, wStars: { value: 0 }, wGal: { value: 0 }, wWeb: { value: 0 },
    sunV: { value: [0, 0, -1] }, gRot: { value: 0 },
    gc: { value: [GC[0] / KLY, GC[1] / KLY] }, m31: { value: [M31[0] / KLY, M31[1] / KLY] },
    m33: { value: [M33[0] / KLY, M33[1] / KLY] }, lmc: { value: [LMC[0] / KLY, LMC[1] / KLY] },
  });
  /** When each stop starts (the blink's under the closed eyelid), and the beat after the plate's cut. */
  stopT: number[] = [];
  b0 = 0; tBlink = 0;

  override init() {
    const l = this.ctx.lyrics.get('あなたには');
    const cs = charsOf([l.words[1]!]);
    this.tBlink = cs[0]!.t; // 瞬
    this.b0 = this.B.at(this.ctx.start + 0.01) | 0;
    this.stopT = STOPS.map((_, k) => (k === 0 ? this.ctx.start : k === 5 ? this.tBlink - 0.05 : this.B.t(this.b0 + k)));
  }

  /** log₁₀ of the frame width in metres at t: a snap on every beat, from wherever the drift between beats got to. */
  zoomAt(t: number) {
    const D = 0.12; // decades per second of drift
    let k = 0;
    while (k + 1 < STOPS.length && this.stopT[k + 1]! <= t) k++;
    const tk = this.stopT[k]!;
    if (k === 0) return STOPS[0]! + D * (t - tk);
    const from = STOPS[k - 1]! + D * (tk - this.stopT[k - 1]!);
    return lerp(from, STOPS[k]!, ease.outExpo(prog(t, tk, tk + (k === 5 ? 0.05 : 0.28)))) + D * (t - tk);
  }

  /** Simulated seconds since the plate began: time runs faster as the frame grows. */
  simAt(t: number) {
    const a = this.ctx.start, n = 240, dt = Math.max(0, t - a) / n;
    let s = 0;
    for (let i = 0; i < n; i++) s += 10 ** rateLog(this.zoomAt(a + (i + 0.5) * dt)) * dt;
    return s;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const z = this.zoomAt(t), sim = this.simAt(t);
    const s = W / 10 ** z; // px per metre
    // the Earth on its orbit; the frame is centred on it, then (as the solar system comes in) on the Sun
    const orbit = (a: number, ph: number): [number, number] => {
      const th = ph + (2 * Math.PI * sim) / (a ** 1.5 * YEAR);
      return [Math.cos(th) * a * AU, Math.sin(th) * a * AU];
    };
    const E = orbit(1, PLANETS[2]![2]);
    const wSun = ss(10.2, 12.0, z);
    const cw: [number, number] = [E[0] * (1 - wSun), E[1] * (1 - wSun)];
    const px = (m: [number, number]): [number, number] => [W / 2 + (m[0] - cw[0]) * s, H / 2 + (m[1] - cw[1]) * s];
    const ePx = px(E), sPx = px([0, 0]);
    const u = this.pass.u;
    u.Z!.value = z;
    u.kKm!.value = 1 / (s * 1e3);
    u.kRe!.value = 1 / (s * R_E);
    u.kLy!.value = 1 / (s * LY);
    u.kKly!.value = 1 / (s * KLY);
    u.kMpc!.value = 1 / (s * MPC);
    u.sim!.value = sim % 1e4;
    u.earthPx!.value = ePx;
    u.sunPx!.value = sPx;
    u.wLocal!.value = 1 - ss(6.2, 6.9, z);
    u.wGlobe!.value = ss(6.2, 6.9, z) * (1 - ss(10.0, 10.6, z));
    u.wSky!.value = ss(6.5, 7.2, z) * (1 - ss(14, 15.5, z));
    u.wStars!.value = ss(14, 15.5, z) * (1 - ss(21.3, 22.3, z));
    u.wGal!.value = ss(18.2, 20.6, z) * (1 - ss(24.2, 25.2, z));
    u.wWeb!.value = ss(23.0, 24.6, z);
    // the Sun as seen from the Earth turns once a day; the lab starts at night
    const sa = -1.2 + (2 * Math.PI * sim) / DAY;
    const sv = [Math.sin(sa), -0.25, -Math.cos(sa)], sl = Math.hypot(...sv);
    u.sunV!.value = sv.map((v) => v / sl);
    u.gRot!.value = (2 * Math.PI * sim) / (230e6 * YEAR);
    this.pass.render(renderer, out);

    const c = this.L.ctx;
    this.L.clear();
    const on = (x: number, y: number, m = 60) => x > -m && x < W + m && y > -m && y < H + m;
    // the Moon's orbit and the Moon
    const aMoon = span(z, 8.4, 10.1);
    if (aMoon > 0.01) {
      const rm = 3.844e8 * s, th = 1.0 + (2 * Math.PI * sim) / (27.32 * DAY);
      c.strokeStyle = rgba('ash', 0.6 * aMoon);
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(ePx[0], ePx[1], rm, 0, Math.PI * 2); c.stroke();
      const mx = ePx[0] + Math.cos(th) * rm, my = ePx[1] + Math.sin(th) * rm;
      c.fillStyle = rgba('bone', aMoon);
      c.beginPath(); c.arc(mx, my, Math.max(1.737e6 * s, 3), 0, Math.PI * 2); c.fill();
    }
    // the planets' orbits (the Earth's is the world line) and the planets
    const aSol = span(z, 10.6, 14.4);
    if (aSol > 0.01) {
      PLANETS.forEach(([name, a, ph]) => {
        const r = a * AU * s;
        if (r < 3 || r > 6000) return;
        const earth = name === 'EARTH';
        c.strokeStyle = rgba(earth ? 'nixie' : 'ash', (earth ? 0.9 : 0.5) * aSol);
        c.lineWidth = earth ? 2.5 : 1.5;
        c.beginPath(); c.arc(sPx[0], sPx[1], r, 0, Math.PI * 2); c.stroke();
        const p = px(orbit(a, ph));
        c.fillStyle = rgba('bone', aSol);
        c.beginPath(); c.arc(p[0], p[1], earth ? 0 : 3.5, 0, Math.PI * 2); c.fill();
        const inner = a < 2;
      });
    }
    // the Sun: a glowing disc, then one star among stars
    if (on(sPx[0], sPx[1], 200) && z > 9.5) {
      const rs = Math.max(R_SUN * s, 3), glow = Math.max(rs * 5, 16 + 30 * (1 - ss(14, 16, z)));
      const g = c.createRadialGradient(sPx[0], sPx[1], 0, sPx[0], sPx[1], glow);
      g.addColorStop(0, rgba('bone', 1));
      g.addColorStop(Math.min(0.9, rs / glow), rgba('ember', 0.9));
      g.addColorStop(1, rgba('ember', 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(sPx[0], sPx[1], glow, 0, Math.PI * 2); c.fill();
    }
    // the nearest stars
    const aNear = span(z, 15.9, 17.9);
    if (aNear > 0.01) {
      ([[ACEN, 'α CENTAURI · 4.4 ly'], [SIRIUS, 'SIRIUS · 8.6 ly']] as const).forEach(([m, name]) => {
        const p = px(m);
        c.fillStyle = rgba('bone', aNear);
        c.beginPath(); c.arc(p[0], p[1], 3.5, 0, Math.PI * 2); c.fill();
      });
    }
    const ru = RU * s;
    // the lab, then the Earth, then us: the nixie point at the centre of it all
    const b = this.B.at(t), bt = this.B.t(Math.floor(b));
    const beat = pulse(t, bt, 0.18);
    c.fillStyle = rgba('nixie');
    c.beginPath(); c.arc(ePx[0], ePx[1], 5.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba('nixie', 0.8);
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(ePx[0], ePx[1], 13 + 10 * beat, 0, Math.PI * 2); c.stroke();
    // the readout: the frame's size (no captions)
    const n = Math.round(z);
    const k = 1 + 0.12 * pulse(t, bt, 0.12);
    c.save();
    c.translate(120, 175);
    c.scale(k, k);
    c.fillStyle = rgba('bone');
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(F.archivo(125, 800), 78);
    c.fillText('10', 0, 0);
    const w10 = c.measureText('10').width;
    c.font = font(F.archivo(125, 800), 42);
    c.fillText(String(n), w10 + 4, -38);
    const wn = c.measureText(String(n)).width;
    c.font = font(F.archivo(125, 800), 78);
    c.fillText(' m', w10 + wn + 6, 0);
    c.restore();
    lyricRail(c, this.lineWords, t, this.act, z < 7 ? { band: rgba('ink', 0.7) } : {});
    // the eyelid: closes just before 瞬, shut for 3 frames, opens on 瞬 onto the solar system
    const close = ease.inCubic(prog(t, this.tBlink - 0.18, this.tBlink - 0.05));
    const reopen = ease.outExpo(prog(t, this.tBlink, this.tBlink + 0.25));
    const lid = t < this.tBlink ? close : 1 - reopen;
    if (lid > 0) {
      c.fillStyle = rgba('ink');
      const hh = (H / 2) * lid;
      c.beginPath();
      c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, hh); c.quadraticCurveTo(W / 2, hh * 1.35, 0, hh); c.fill();
      c.beginPath();
      c.moveTo(0, H); c.lineTo(W, H); c.lineTo(W, H - hh); c.quadraticCurveTo(W / 2, H - hh * 1.35, 0, H - hh); c.fill();
    }
    comp.draw(renderer, this.L.upload(), out);
    const snap = pulse(t, bt, 0.08);
    return { shake: shakeAt(t, 5 * snap), ca: 0.5 + 2 * snap, bloom: 0.75, bloomThreshold: 0.8, vignette: 0.3, zoom: 1 + 0.015 * pulse(t, this.tBlink, 0.1) };
  }
}
