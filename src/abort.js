export function checkAbort(signal) {
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
}
