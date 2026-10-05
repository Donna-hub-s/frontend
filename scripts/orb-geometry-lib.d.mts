export const STATES: Record<string, string>;
export type OrbGeometry = { prefix: string; disc: string[]; defs: string; halo: string; figure: string };
export function extractState(svg: string, state: string): OrbGeometry;
export function buildGeometry(sourceDir: string): Record<string, OrbGeometry>;
