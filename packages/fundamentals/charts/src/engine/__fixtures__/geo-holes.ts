// Hand-simplified outlines of three real places that have INNER rings (holes), for the geo tests and goldens.
// They are schematic (a few dozen vertices each, rounded to a tenth of a degree), NOT survey data: they exist so a
// golden shows an enclave or a lake cut out of its country. Longitude, latitude.
import type { GeoJson } from '../geo-web'

const ring = (...c: [number, number][]): number[][] => [...c, c[0]!]

/** South Africa, with Lesotho as an enclave (a hole), and Lesotho itself as its own feature filling it. */
const LESOTHO = ring([27.0, -29.6], [28.6, -28.6], [29.4, -29.2], [29.1, -30.5], [28.0, -30.6], [27.2, -30.0])
const SOUTH_AFRICA = ring(
  [16.5, -28.6], [18.2, -32.7], [18.5, -34.1], [20.0, -34.8], [22.5, -34.0], [25.7, -34.0], [27.0, -33.5], [28.5, -32.3],
  [30.2, -30.7], [31.0, -29.4], [32.8, -28.5], [32.9, -26.9], [32.0, -26.8], [31.9, -25.9], [31.3, -25.7], [31.0, -23.5],
  [29.5, -22.1], [28.0, -22.6], [26.0, -24.6], [25.0, -25.7], [23.0, -25.3], [20.8, -25.9], [20.0, -24.8], [20.0, -28.4], [19.0, -28.5],
)
export const SOUTH_AFRICA_LESOTHO: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'South Africa', iso: 'ZA' }, id: 710, geometry: { type: 'Polygon', coordinates: [SOUTH_AFRICA, LESOTHO] } },
    { type: 'Feature', properties: { name: 'Lesotho', iso: 'LS' }, id: 426, geometry: { type: 'Polygon', coordinates: [LESOTHO] } },
  ],
}

/** Italy with the San Marino and Vatican City enclaves cut out, each also its own feature. */
const ITALY = ring(
  [7.0, 43.8], [8.8, 44.4], [10.0, 44.0], [10.5, 42.9], [12.2, 41.7], [13.7, 41.2], [15.0, 40.2], [15.7, 39.9], [16.0, 38.0],
  [15.7, 37.9], [16.5, 38.4], [17.1, 39.0], [16.5, 39.6], [17.0, 40.5], [18.5, 40.1], [18.4, 39.8], [16.9, 41.0], [16.0, 41.9],
  [14.0, 42.5], [13.5, 43.6], [12.3, 44.3], [12.3, 45.3], [13.7, 45.7], [13.6, 46.5], [12.2, 47.0], [10.5, 46.8], [9.0, 46.0], [7.0, 45.9], [6.8, 45.2], [7.0, 44.2],
)
const SAN_MARINO = ring([12.40, 43.90], [12.50, 43.92], [12.52, 43.96], [12.45, 43.99], [12.41, 43.95])
const VATICAN = ring([12.44, 41.90], [12.46, 41.90], [12.46, 41.91], [12.44, 41.91])
export const ITALY_ENCLAVES: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Italy', iso: 'IT' }, id: 380, geometry: { type: 'Polygon', coordinates: [ITALY, SAN_MARINO, VATICAN] } },
    { type: 'Feature', properties: { name: 'San Marino', iso: 'SM' }, id: 674, geometry: { type: 'Polygon', coordinates: [SAN_MARINO] } },
    { type: 'Feature', properties: { name: 'Vatican City', iso: 'VA' }, id: 336, geometry: { type: 'Polygon', coordinates: [VATICAN] } },
  ],
}

/** Florida with Lake Okeechobee as a lake (a hole with no feature of its own). */
const FLORIDA = ring(
  [-87.6, 30.3], [-85.0, 29.7], [-84.0, 30.1], [-83.0, 29.2], [-82.7, 27.9], [-82.1, 26.5], [-81.2, 25.1], [-80.4, 25.3],
  [-80.0, 26.8], [-80.6, 28.4], [-81.4, 30.7], [-81.4, 30.8], [-81.7, 30.7], [-84.9, 30.7], [-87.5, 30.4],
)
const OKEECHOBEE = ring([-81.1, 26.7], [-80.8, 27.1], [-80.7, 26.9], [-80.9, 26.7])
export const FLORIDA_LAKE: GeoJson = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: 'Florida', usps: 'FL' }, id: '12', geometry: { type: 'Polygon', coordinates: [FLORIDA, OKEECHOBEE] } }],
}
