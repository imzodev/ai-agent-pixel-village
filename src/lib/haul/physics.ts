// Harvest Haul's physics: boxes and circles, stacked and tumbling, after
// Erin Catto's Box2D Lite (sequential impulses, warm starting, box clipping).
// The browser and the server must get the very same run, so, as in Whistle:
//   - only + − × ÷ and Math.sqrt; rotation is a unit pair (c, s), never an
//     angle, so there's no sin/cos/atan2 anywhere (a test checks this file);
//   - a fixed order: bodies by index, pairs (a < b) in loop order.
// Pure. Numbers: rules.ts.

import * as rules from "./rules";
import type { HaulArbiter, HaulBody, HaulContact } from "@/types/haul";

// Copied into locals: read through an import binding, every constant costs a
// property lookup in the hot loops.
const { BIAS_FACTOR, DT, GRAVITY, ITERATIONS, SLOP } = rules;
const INV_DT = 1 / DT;

const EDGE1 = 1, EDGE2 = 2, EDGE3 = 3, EDGE4 = 4;

/** A body's bounding radius (a quick "too far apart to touch"). */
export const radiusOf = (b: HaulBody): number =>
  b.shape.kind === "circle" ? b.shape.r : Math.sqrt(b.shape.hw * b.shape.hw + b.shape.hh * b.shape.hh);

/** Mass and inertia for a shape at a density (0 density: fixed, like the cart). */
export function massOf(shape: HaulBody["shape"], density: number): { invMass: number; invI: number } {
  if (density <= 0) return { invMass: 0, invI: 0 };
  if (shape.kind === "circle") {
    const m = density * shape.r * shape.r * 3.14159265;
    return { invMass: 1 / m, invI: 1 / (0.5 * m * shape.r * shape.r) };
  }
  const w = 2 * shape.hw, h = 2 * shape.hh, m = density * w * h;
  return { invMass: 1 / m, invI: 12 / (m * (w * w + h * h)) };
}

// ── Collision: the touching points between two bodies (normal from a to b) ──

type Clip = { x: number; y: number; in1: number; out1: number; in2: number; out2: number };
const featureOf = (c: Clip): number => c.in1 | (c.out1 << 4) | (c.in2 << 8) | (c.out2 << 12);

function clipSegment(vin: Clip[], nx: number, ny: number, offset: number, clipEdge: number): Clip[] {
  const out: Clip[] = [];
  const d0 = nx * vin[0].x + ny * vin[0].y - offset;
  const d1 = nx * vin[1].x + ny * vin[1].y - offset;
  if (d0 <= 0) out.push(vin[0]);
  if (d1 <= 0) out.push(vin[1]);
  if (d0 * d1 < 0) {
    const k = d0 / (d0 - d1);
    const x = vin[0].x + k * (vin[1].x - vin[0].x), y = vin[0].y + k * (vin[1].y - vin[0].y);
    if (d0 > 0) out.push({ ...vin[0], x, y, in1: clipEdge, in2: 0 });
    else out.push({ ...vin[1], x, y, out1: clipEdge, out2: 0 });
  }
  return out;
}

/** The incident box's edge most against the reference normal (nx, ny), in world space. */
function incidentEdge(hw: number, hh: number, b: HaulBody, nx: number, ny: number): Clip[] {
  // The normal in the incident box's frame, flipped.
  const lx = -(b.c * nx + b.s * ny), ly = -(-b.s * nx + b.c * ny);
  let v: Clip[];
  if (Math.abs(lx) > Math.abs(ly)) {
    v = lx > 0
      ? [{ x: hw, y: -hh, in1: 0, out1: 0, in2: EDGE3, out2: EDGE4 }, { x: hw, y: hh, in1: 0, out1: 0, in2: EDGE4, out2: EDGE1 }]
      : [{ x: -hw, y: hh, in1: 0, out1: 0, in2: EDGE1, out2: EDGE2 }, { x: -hw, y: -hh, in1: 0, out1: 0, in2: EDGE2, out2: EDGE3 }];
  } else {
    v = ly > 0
      ? [{ x: hw, y: hh, in1: 0, out1: 0, in2: EDGE4, out2: EDGE1 }, { x: -hw, y: hh, in1: 0, out1: 0, in2: EDGE1, out2: EDGE2 }]
      : [{ x: -hw, y: -hh, in1: 0, out1: 0, in2: EDGE2, out2: EDGE3 }, { x: hw, y: -hh, in1: 0, out1: 0, in2: EDGE3, out2: EDGE4 }];
  }
  return v.map((p) => ({ ...p, x: b.x + b.c * p.x - b.s * p.y, y: b.y + b.s * p.x + b.c * p.y }));
}

function contact(x: number, y: number, nx: number, ny: number, separation: number, feature: number): HaulContact {
  return { x, y, nx, ny, separation, pn: 0, pt: 0, massNormal: 0, massTangent: 0, bias: 0, feature };
}

function boxBox(A: HaulBody, B: HaulBody): HaulContact[] {
  if (A.shape.kind !== "box" || B.shape.kind !== "box") return [];
  const hAx = A.shape.hw, hAy = A.shape.hh, hBx = B.shape.hw, hBy = B.shape.hh;
  const dpx = B.x - A.x, dpy = B.y - A.y;
  // d in A's and B's frames.
  const dAx = A.c * dpx + A.s * dpy, dAy = -A.s * dpx + A.c * dpy;
  const dBx = B.c * dpx + B.s * dpy, dBy = -B.s * dpx + B.c * dpy;
  // C = RotAᵀ · RotB.
  const c11 = A.c * B.c + A.s * B.s, c12 = -A.c * B.s + A.s * B.c;
  const c21 = -A.s * B.c + A.c * B.s, c22 = A.s * B.s + A.c * B.c;
  const a11 = Math.abs(c11), a12 = Math.abs(c12), a21 = Math.abs(c21), a22 = Math.abs(c22);
  const faceAx = Math.abs(dAx) - hAx - (a11 * hBx + a12 * hBy);
  const faceAy = Math.abs(dAy) - hAy - (a21 * hBx + a22 * hBy);
  if (faceAx > 0 || faceAy > 0) return [];
  const faceBx = Math.abs(dBx) - (a11 * hAx + a21 * hAy) - hBx;
  const faceBy = Math.abs(dBy) - (a12 * hAx + a22 * hAy) - hBy;
  if (faceBx > 0 || faceBy > 0) return [];

  // The axis of least overlap (with a bias towards A's faces, for coherence).
  const relTol = 0.95, absTol = 0.01;
  let axis = 0, separation = faceAx;
  let nx = dAx > 0 ? A.c : -A.c, ny = dAx > 0 ? A.s : -A.s;
  if (faceAy > relTol * separation + absTol * hAy) { axis = 1; separation = faceAy; nx = dAy > 0 ? -A.s : A.s; ny = dAy > 0 ? A.c : -A.c; }
  if (faceBx > relTol * separation + absTol * hBx) { axis = 2; separation = faceBx; nx = dBx > 0 ? B.c : -B.c; ny = dBx > 0 ? B.s : -B.s; }
  if (faceBy > relTol * separation + absTol * hBy) { axis = 3; separation = faceBy; nx = dBy > 0 ? -B.s : B.s; ny = dBy > 0 ? B.c : -B.c; }

  let fx: number, fy: number, front: number, sx: number, sy: number, negSide: number, posSide: number, negEdge: number, posEdge: number, inc: Clip[];
  if (axis === 0) {
    fx = nx; fy = ny; front = A.x * fx + A.y * fy + hAx;
    sx = -A.s; sy = A.c; const side = A.x * sx + A.y * sy;
    negSide = -side + hAy; posSide = side + hAy; negEdge = EDGE3; posEdge = EDGE1;
    inc = incidentEdge(hBx, hBy, B, fx, fy);
  } else if (axis === 1) {
    fx = nx; fy = ny; front = A.x * fx + A.y * fy + hAy;
    sx = A.c; sy = A.s; const side = A.x * sx + A.y * sy;
    negSide = -side + hAx; posSide = side + hAx; negEdge = EDGE2; posEdge = EDGE4;
    inc = incidentEdge(hBx, hBy, B, fx, fy);
  } else if (axis === 2) {
    fx = -nx; fy = -ny; front = B.x * fx + B.y * fy + hBx;
    sx = -B.s; sy = B.c; const side = B.x * sx + B.y * sy;
    negSide = -side + hBy; posSide = side + hBy; negEdge = EDGE3; posEdge = EDGE1;
    inc = incidentEdge(hAx, hAy, A, fx, fy);
  } else {
    fx = -nx; fy = -ny; front = B.x * fx + B.y * fy + hBy;
    sx = B.c; sy = B.s; const side = B.x * sx + B.y * sy;
    negSide = -side + hBx; posSide = side + hBx; negEdge = EDGE2; posEdge = EDGE4;
    inc = incidentEdge(hAx, hAy, A, fx, fy);
  }
  const c1 = clipSegment(inc, -sx, -sy, negSide, negEdge);
  if (c1.length < 2) return [];
  const c2 = clipSegment(c1, sx, sy, posSide, posEdge);
  if (c2.length < 2) return [];
  const out: HaulContact[] = [];
  for (const p of c2) {
    const sep = fx * p.x + fy * p.y - front;
    if (sep > 0) continue;
    // Flip the feature when B was the reference, so it reads the same either way.
    const f = axis >= 2 ? { ...p, in1: p.in2, out1: p.out2, in2: p.in1, out2: p.out1 } : p;
    out.push(contact(p.x - sep * fx, p.y - sep * fy, nx, ny, sep, featureOf(f)));
  }
  return out;
}

/** A box and a circle; the normal points from the box to the circle. */
function boxCircle(B: HaulBody, C: HaulBody): HaulContact[] {
  if (B.shape.kind !== "box" || C.shape.kind !== "circle") return [];
  const hw = B.shape.hw, hh = B.shape.hh, r = C.shape.r;
  const dx = C.x - B.x, dy = C.y - B.y;
  const lx = B.c * dx + B.s * dy, ly = -B.s * dx + B.c * dy;
  const qx = Math.min(hw, Math.max(-hw, lx)), qy = Math.min(hh, Math.max(-hh, ly));
  let nlx: number, nly: number, sep: number, px: number, py: number;
  if (qx !== lx || qy !== ly) {
    const ex = lx - qx, ey = ly - qy;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d > r) return [];
    nlx = d > 1e-9 ? ex / d : 0; nly = d > 1e-9 ? ey / d : 1;
    sep = d - r; px = qx; py = qy;
  } else {
    // The centre is inside the box: out through the nearest face.
    const ox = hw - Math.abs(lx), oy = hh - Math.abs(ly);
    if (ox < oy) { nlx = lx > 0 ? 1 : -1; nly = 0; px = nlx * hw; py = ly; sep = -ox - r; }
    else { nlx = 0; nly = ly > 0 ? 1 : -1; px = lx; py = nly * hh; sep = -oy - r; }
  }
  const nx = B.c * nlx - B.s * nly, ny = B.s * nlx + B.c * nly;
  return [contact(B.x + B.c * px - B.s * py, B.y + B.s * px + B.c * py, nx, ny, sep, 0)];
}

function circleCircle(A: HaulBody, B: HaulBody): HaulContact[] {
  if (A.shape.kind !== "circle" || B.shape.kind !== "circle") return [];
  const dx = B.x - A.x, dy = B.y - A.y;
  const d = Math.sqrt(dx * dx + dy * dy), rr = A.shape.r + B.shape.r;
  if (d > rr) return [];
  const nx = d > 1e-9 ? dx / d : 0, ny = d > 1e-9 ? dy / d : 1;
  return [contact(A.x + nx * A.shape.r, A.y + ny * A.shape.r, nx, ny, d - rr, 0)];
}

/** The contacts between a and b, normal from a to b. */
export function collide(a: HaulBody, b: HaulBody): HaulContact[] {
  if (a.shape.kind === "box" && b.shape.kind === "box") return boxBox(a, b);
  if (a.shape.kind === "circle" && b.shape.kind === "circle") return circleCircle(a, b);
  if (a.shape.kind === "box") return boxCircle(a, b);
  return boxCircle(b, a).map((c) => ({ ...c, nx: -c.nx, ny: -c.ny }));
}

// ── The solver ──

/** Which pairs touch now, keeping last tick's impulses for contacts that are still there. */
function broadphase(bodies: readonly HaulBody[], prev: readonly HaulArbiter[]): HaulArbiter[] {
  const old = new Map<number, HaulArbiter>();
  for (const a of prev) old.set(a.a * 4096 + a.b, a);
  const out: HaulArbiter[] = [];
  for (let i = 0; i < bodies.length; i++) {
    const A = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const B = bodies[j];
      if (A.invMass === 0 && B.invMass === 0) continue;
      const dx = B.x - A.x, dy = B.y - A.y, rr = radiusOf(A) + radiusOf(B);
      if (dx * dx + dy * dy > rr * rr) continue;
      const contacts = collide(A, B);
      if (!contacts.length) continue;
      const was = old.get(i * 4096 + j);
      if (was) for (const c of contacts) {
        const o = was.contacts.find((k) => k.feature === c.feature);
        if (o) { c.pn = o.pn; c.pt = o.pt; }
      }
      out.push({ a: i, b: j, contacts, friction: Math.sqrt(A.friction * B.friction) });
    }
  }
  return out;
}

function applyImpulse(A: HaulBody, B: HaulBody, px: number, py: number, r1x: number, r1y: number, r2x: number, r2y: number): void {
  A.vx -= A.invMass * px; A.vy -= A.invMass * py; A.w -= A.invI * (r1x * py - r1y * px);
  B.vx += B.invMass * px; B.vy += B.invMass * py; B.w += B.invI * (r2x * py - r2y * px);
}

/** Masses along the normal and tangent, the push-apart bias, and last tick's impulses again. */
function preStep(arb: HaulArbiter, bodies: readonly HaulBody[]): void {
  const A = bodies[arb.a], B = bodies[arb.b];
  for (const c of arb.contacts) {
    const r1x = c.x - A.x, r1y = c.y - A.y, r2x = c.x - B.x, r2y = c.y - B.y;
    const rn1 = r1x * c.nx + r1y * c.ny, rn2 = r2x * c.nx + r2y * c.ny;
    const kn = A.invMass + B.invMass + A.invI * (r1x * r1x + r1y * r1y - rn1 * rn1) + B.invI * (r2x * r2x + r2y * r2y - rn2 * rn2);
    c.massNormal = 1 / kn;
    const tx = c.ny, ty = -c.nx;
    const rt1 = r1x * tx + r1y * ty, rt2 = r2x * tx + r2y * ty;
    const kt = A.invMass + B.invMass + A.invI * (r1x * r1x + r1y * r1y - rt1 * rt1) + B.invI * (r2x * r2x + r2y * r2y - rt2 * rt2);
    c.massTangent = 1 / kt;
    c.bias = -BIAS_FACTOR * INV_DT * Math.min(0, c.separation + SLOP);
    applyImpulse(A, B, c.pn * c.nx + c.pt * tx, c.pn * c.ny + c.pt * ty, r1x, r1y, r2x, r2y);
  }
}

function solve(arb: HaulArbiter, bodies: readonly HaulBody[]): void {
  const A = bodies[arb.a], B = bodies[arb.b];
  for (const c of arb.contacts) {
    const r1x = c.x - A.x, r1y = c.y - A.y, r2x = c.x - B.x, r2y = c.y - B.y;
    // Relative velocity at the contact.
    let dvx = B.vx - B.w * r2y - A.vx + A.w * r1y;
    let dvy = B.vy + B.w * r2x - A.vy - A.w * r1x;
    const vn = dvx * c.nx + dvy * c.ny;
    let dpn = c.massNormal * (-vn + c.bias);
    const pn0 = c.pn;
    c.pn = Math.max(pn0 + dpn, 0);
    dpn = c.pn - pn0;
    applyImpulse(A, B, dpn * c.nx, dpn * c.ny, r1x, r1y, r2x, r2y);

    dvx = B.vx - B.w * r2y - A.vx + A.w * r1y;
    dvy = B.vy + B.w * r2x - A.vy - A.w * r1x;
    const tx = c.ny, ty = -c.nx;
    const vt = dvx * tx + dvy * ty;
    let dpt = c.massTangent * -vt;
    const maxPt = arb.friction * c.pn;
    const pt0 = c.pt;
    c.pt = Math.max(-maxPt, Math.min(maxPt, pt0 + dpt));
    dpt = c.pt - pt0;
    applyImpulse(A, B, dpt * tx, dpt * ty, r1x, r1y, r2x, r2y);
  }
}

/**
 * The fastest any contact closes on each body this tick (for breaking eggs and
 * cakes), measured before the solver stops them. Index = body.
 */
function impacts(arbiters: readonly HaulArbiter[], bodies: readonly HaulBody[]): number[] {
  const out = new Array<number>(bodies.length).fill(0);
  for (const arb of arbiters) {
    const A = bodies[arb.a], B = bodies[arb.b];
    for (const c of arb.contacts) {
      const r1x = c.x - A.x, r1y = c.y - A.y, r2x = c.x - B.x, r2y = c.y - B.y;
      const dvx = B.vx - B.w * r2y - A.vx + A.w * r1y, dvy = B.vy + B.w * r2x - A.vy - A.w * r1x;
      const closing = -(dvx * c.nx + dvy * c.ny);
      if (closing > out[arb.a]) out[arb.a] = closing;
      if (closing > out[arb.b]) out[arb.b] = closing;
    }
  }
  return out;
}

/**
 * One tick for the free bodies: gravity (plus `ax`, the cart's pull felt by
 * everything, 0 when the world itself moves), contacts, then motion. Fixed
 * bodies (the cart) are moved by the caller. Returns each body's impact speed.
 */
export function stepWorld(bodies: HaulBody[], prev: readonly HaulArbiter[]): { arbiters: HaulArbiter[]; impact: number[] } {
  const arbiters = broadphase(bodies, prev);
  for (const b of bodies) if (b.invMass > 0) b.vy += GRAVITY * DT;
  const impact = impacts(arbiters, bodies);
  for (const arb of arbiters) preStep(arb, bodies);
  for (let k = 0; k < ITERATIONS; k++) for (const arb of arbiters) solve(arb, bodies);
  for (const b of bodies) {
    if (b.invMass === 0) continue;
    b.x += b.vx * DT; b.y += b.vy * DT;
    // Turn by w·dt and stay a unit pair.
    const t = b.w * DT;
    const c = b.c - b.s * t, s = b.s + b.c * t;
    const len = Math.sqrt(c * c + s * s);
    b.c = c / len; b.s = s / len;
  }
  return { arbiters, impact };
}
