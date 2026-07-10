// upng-js tip bildirimi (paket kendi tipini taşımıyor). Yalnız kullandığımız
// encode imzası — PNG renk kuantizasyonu (cnum=0 lossless, >0 lossy).
declare module "upng-js" {
  export function encode(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cnum: number,
    dels?: number[],
  ): ArrayBuffer
  const UPNG: { encode: typeof encode }
  export default UPNG
}
