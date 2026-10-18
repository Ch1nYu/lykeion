// The Node floor. pdfjs-dist declares ">=22.13.0 || >=24" and needs Promise.withResolvers, so on
// Node 20 `lykeion init` dies with "Promise.withResolvers is not a function" long after the user
// could have done anything about it. Check before the command imports its dependencies, and say
// so in one line. Keep this module dependency-free: it runs on the Node it is refusing.
export const MIN_NODE = '22.13';

const parse = (v) => {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v ?? '').trim().replace(/^v/, ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
};

// Returns the offending version when it is below the floor, null when it is fine — including when
// it cannot be parsed: a nightly or a vendor build must not be blocked by a string nobody can act
// on, and a genuinely old Node reports a version that parses.
export function tooOld(version) {
  const got = parse(version);
  if (!got) return null;
  const min = parse(MIN_NODE);
  for (let i = 0; i < min.length; i++) {
    if (got[i] !== min[i]) return got[i] < min[i] ? String(version) : null;
  }
  return null;
}

export function nodeFloorMessage(current) {
  return `lykeion needs Node ${MIN_NODE} or newer (this is ${current}). Install a current LTS, e.g. "mise use node@22".`;
}
