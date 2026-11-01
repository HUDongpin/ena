// Instantiated as a SourceTextModule INSIDE the same restricted container VM realm.
// No host functions, prototypes, assertion library objects or error objects are passed in.
export const ASSERTION_MODULE = `
let count = 0;
function fail(message) { throw new Error(message || 'Assertion failed'); }
function equivalent(a,b) {
  if(Object.is(a,b)) return true;
  if(!a || !b || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.length===bk.length && ak.every((k,i)=>k===bk[i] && equivalent(a[k],b[k]));
}
function assert(value,message) { count++; if(!value)fail(message); }
assert.ok=assert;
assert.equal=assert.strictEqual=(actual,expected,message)=>{count++;if(!Object.is(actual,expected))fail(message || 'Expected values to be strictly equal');};
assert.notEqual=assert.notStrictEqual=(actual,expected,message)=>{count++;if(Object.is(actual,expected))fail(message || 'Expected values to differ');};
assert.deepEqual=assert.deepStrictEqual=(actual,expected,message)=>{count++;if(!equivalent(actual,expected))fail(message || 'Expected structures to be equal');};
assert.match=(actual,pattern,message)=>{count++;if(typeof actual!=='string'||!(pattern instanceof RegExp)||!pattern.test(actual))fail(message || 'Expected pattern to match');};
assert.throws=(action,expected)=>{count++;let caught;try{action();}catch(error){caught=error;}if(!caught)fail('Expected an exception');if(expected instanceof RegExp&&!expected.test(String(caught)))fail('Exception did not match');};
assert.rejects=async(action,expected)=>{count++;let caught;try{await (typeof action==='function'?action():action);}catch(error){caught=error;}if(!caught)fail('Expected a rejection');if(expected instanceof RegExp&&!expected.test(String(caught)))fail('Rejection did not match');};
Object.freeze(assert);
export { assert as default };
export const ok=assert.ok,equal=assert.equal,strictEqual=assert.strictEqual,notEqual=assert.notEqual,notStrictEqual=assert.notStrictEqual,deepEqual=assert.deepEqual,deepStrictEqual=assert.deepStrictEqual,match=assert.match,throws=assert.throws,rejects=assert.rejects;
export function assertionCount(){return count;}
`;
