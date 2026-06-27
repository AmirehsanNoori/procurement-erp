/**
 * Jalali (Persian) ⇄ Gregorian conversion, ported from the prototype's engine.
 * Backend stores Gregorian DateTime; this is used for month-bucketing budgets
 * and (later) IOID Excel formatting. UI does its own rendering.
 */

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}
function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

function jalCal(jy: number) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324,
    2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;
  if (jy < jp || jy >= breaks[bl - 1]) return { leap: 0, gy, march: 20 };
  let i: number;
  for (i = 1; i < bl; i++) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ++;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): [number, number, number] {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return [gy, gm, gd];
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): [number, number, number] {
  const gy = d2g(jdn)[0];
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1];
    k -= 186;
  } else {
    jy--;
    k += 179;
    if (jalCal(jy).leap === 1) k++;
  }
  return [jy, 7 + div(k, 30), mod(k, 30) + 1];
}

export function isJalaliLeap(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jm <= 6 ? 31 : jm <= 11 ? 30 : isJalaliLeap(jy) ? 30 : 29;
}

/** Gregorian (y,m,d) → Jalali [jy,jm,jd] */
export function gregToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  return d2j(g2d(gy, gm, gd));
}

/** Jalali (y,m,d) → Gregorian [gy,gm,gd] */
export function jalaliToGreg(jy: number, jm: number, jd: number): [number, number, number] {
  return d2g(j2d(jy, jm, jd));
}

/** JS Date → Jalali [jy,jm,jd] (uses local date parts). */
export function dateToJalali(date: Date): [number, number, number] {
  return gregToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Jalali (y,m,d) → JS Date at local midnight. */
export function jalaliToDate(jy: number, jm: number, jd: number): Date {
  const [gy, gm, gd] = jalaliToGreg(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

export function todayJalali(): [number, number, number] {
  return dateToJalali(new Date());
}

const JMONTHS = [
  '',
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export function jalaliMonthName(m: number): string {
  return JMONTHS[m] ?? '';
}

/** Format a Date (or null) as Jalali "YYYY/MM/DD". */
export function jalaliStr(date: Date | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = dateToJalali(date);
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}
