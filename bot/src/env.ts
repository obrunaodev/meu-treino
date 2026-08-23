const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} não configurado`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 3100),
  databaseUrl: required('DATABASE_URL'),
  internalToken: required('INTERNAL_TOKEN'),
}

if (env.internalToken.length < 32) throw new Error('INTERNAL_TOKEN precisa ter ao menos 32 caracteres')
