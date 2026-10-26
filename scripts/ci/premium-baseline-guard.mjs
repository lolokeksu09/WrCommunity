// Fails closed: this diagnostic may inspect only a local isolated instance.
export function localBaselineOrigin(value){
  const url=new URL(value);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(host)||url.username||url.password||url.pathname!=='/'||url.search||url.hash){
    throw new Error('Visual baseline only accepts a local HTTP origin (localhost, 127.0.0.1 or ::1) without credentials/path');
  }
  return url.origin;
}
