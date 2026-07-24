import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface JwtPayload extends JWTPayload {
  user_id: string
  role: 'player' | 'admin'
}

function getSecret(env: { JWT_SECRET: string }): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET)
}

export async function signToken(
  payload: JwtPayload,
  env: { JWT_SECRET: string }
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret(env))
}

export async function verifyToken(
  token: string,
  env: { JWT_SECRET: string }
): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(env))
  return payload as JwtPayload
}
