export function tileWeight(bytes: number, max: number, readable: boolean) {
  return readable ? Math.max(Math.sqrt(bytes), Math.sqrt(max) * 0.15) : bytes;
}
