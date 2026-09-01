/**
 * Hand-written twins of the two emitted validators, so the typia gap can be
 * attributed to an ENGINE rather than to the harness.
 *
 *   for p in 1 2 3; do for v in ours typia ours-flat typia-stmt; do node contrib/moltar/pyreon/bench-vs-typia.mjs $v; done; done
 *   for p in 1 2 3; do for v in ours typia ours-flat typia-stmt; do bun  contrib/moltar/pyreon/bench-vs-typia.mjs $v; done; done
 *
 * ONE VARIANT PER PROCESS, on purpose. Running them in one process produced
 * unusable numbers — spreads of 5.4-12.5ns and, at one point, "both extra
 * checks" measuring FASTER than either alone, which is impossible and is the
 * tell that the variants were tiering differently by order. Interleave the
 * pairs rather than running all of one then all of the other.
 *
 * `ours` is copied verbatim from the emitted verdict function (dump it with
 * `schema.is(x)` then `(schema)._jitCheck.toString()`); `typia` is copied
 * verbatim from cases/typia/build/index.js in an upstream clone. Re-copy both
 * if either emitter changes — a stale twin measures nothing.
 *
 * Four variants, a 2x2 over the two things that differ between the emitters:
 *
 *   ours        statement shape (temporaries + early return), our checks
 *   typia       expression shape (one && chain), typia's checks
 *   ours-flat   expression shape, OUR checks      -> isolates SHAPE
 *   typia-stmt  statement shape, TYPIA's checks   -> isolates CHECKS
 *
 * Result at time of writing: V8 1.04x (tie), JSC 1.89x to typia — and on JSC
 * the 2x2 attributes most of that to SHAPE, not to the extra checks.
 */
const V = process.argv[2]
const POOL = Array.from({length:8},(_,i)=>({
  number:i, negNumber:-i, maxNumber:1e308-i, string:'s'+i,
  longString:'x'.repeat(1200), boolean:i%2===0,
  deeplyNested:{foo:'b'+i,num:i,bool:i%2===1},
}))
const ours = (input) => {
  if (typeof input!=="object"||input===null||Array.isArray(input)) { return false } else {
    if (Object.keys(input).length!==7) return false;
    let t1=input["number"]; if (typeof t1!=="number"||Number.isNaN(t1)) return false;
    let t2=input["negNumber"]; if (typeof t2!=="number"||Number.isNaN(t2)) return false;
    let t3=input["maxNumber"]; if (typeof t3!=="number"||Number.isNaN(t3)) return false;
    let t4=input["string"]; if (typeof t4!=="string") return false;
    let t5=input["longString"]; if (typeof t5!=="string") return false;
    let t6=input["boolean"]; if (typeof t6!=="boolean") return false;
    let t7=input["deeplyNested"];
    if (typeof t7!=="object"||t7===null||Array.isArray(t7)) { return false } else {
      if (Object.keys(t7).length!==3) return false;
      let t8=t7["foo"]; if (typeof t8!=="string") return false;
      let t9=t7["num"]; if (typeof t9!=="number"||Number.isNaN(t9)) return false;
      let t10=t7["bool"]; if (typeof t10!=="boolean") return false;
    } return true } }
const T1 = i => "string"===typeof i.foo && "number"===typeof i.num && "boolean"===typeof i.bool && 3===Object.keys(i).length
const T0 = i => "number"===typeof i.number && "number"===typeof i.negNumber && "number"===typeof i.maxNumber && "string"===typeof i.string && "string"===typeof i.longString && "boolean"===typeof i.boolean && ("object"===typeof i.deeplyNested && null!==i.deeplyNested && T1(i.deeplyNested)) && 7===Object.keys(i).length
const typia = i => "object"===typeof i && null!==i && T0(i)
// ours-flat: typia's expression shape carrying OUR checks. Isolates SHAPE.
const F1 = i => "string"===typeof i.foo && "number"===typeof i.num && !Number.isNaN(i.num) && "boolean"===typeof i.bool && 3===Object.keys(i).length
const F0 = i => "number"===typeof i.number && !Number.isNaN(i.number) && "number"===typeof i.negNumber && !Number.isNaN(i.negNumber) && "number"===typeof i.maxNumber && !Number.isNaN(i.maxNumber) && "string"===typeof i.string && "string"===typeof i.longString && "boolean"===typeof i.boolean && ("object"===typeof i.deeplyNested && null!==i.deeplyNested && !Array.isArray(i.deeplyNested) && F1(i.deeplyNested)) && 7===Object.keys(i).length
const oursFlat = i => "object"===typeof i && null!==i && !Array.isArray(i) && F0(i)

// typia-stmt: our statement shape carrying TYPIA's checks. Isolates CHECKS.
const typiaStmt = (input) => {
  if (typeof input!=="object"||input===null) { return false } else {
    if (Object.keys(input).length!==7) return false;
    let t1=input["number"]; if (typeof t1!=="number") return false;
    let t2=input["negNumber"]; if (typeof t2!=="number") return false;
    let t3=input["maxNumber"]; if (typeof t3!=="number") return false;
    let t4=input["string"]; if (typeof t4!=="string") return false;
    let t5=input["longString"]; if (typeof t5!=="string") return false;
    let t6=input["boolean"]; if (typeof t6!=="boolean") return false;
    let t7=input["deeplyNested"];
    if (typeof t7!=="object"||t7===null) { return false } else {
      if (Object.keys(t7).length!==3) return false;
      let t8=t7["foo"]; if (typeof t8!=="string") return false;
      let t9=t7["num"]; if (typeof t9!=="number") return false;
      let t10=t7["bool"]; if (typeof t10!=="boolean") return false;
    } return true } }

const VARIANTS = { ours, typia, 'ours-flat': oursFlat, 'typia-stmt': typiaStmt }
const fn = VARIANTS[V]
if (!fn) { console.error('usage: <ours|typia|ours-flat|typia-stmt>'); process.exit(2) }
if(!POOL.every(p=>fn(p)===true)){console.error('FAIL');process.exit(1)}
let SINK=0
for(let i=0;i<400000;i++) SINK^=fn(POOL[i&7])?1:0
const r=[]
for(let k=0;k<11;k++){const N=3_000_000,t0=process.hrtime.bigint();for(let i=0;i<N;i++)SINK^=fn(POOL[i&7])?1:0;r.push(Number(process.hrtime.bigint()-t0)/N)}
r.sort((a,b)=>a-b)
console.log(V.padEnd(6), r[5].toFixed(3),'ns  spread',r[0].toFixed(2)+'-'+r[10].toFixed(2))
if(SINK===12345678)console.log(SINK)
