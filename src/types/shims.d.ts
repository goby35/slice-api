declare module "@hono/zod-validator" {
  // minimal shim for TS when the package/types aren't installed
  export function zValidator(location: string, schema: any): any
}

declare module "zod" {
  // very small shim so imports compile; prefer installing real 'zod' types
  const z: any
  export { z }
  export default z
}

declare module "@slice/types/jwt" {
  // project-specific jwt payload typing stub
  export type JwtPayload = any
}
