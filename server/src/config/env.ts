import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  databaseUrl: required('DATABASE_URL', 'postgresql://erp:erp_password@localhost:5432/procurement_erp?schema=public'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'change-me-access-secret-please'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'change-me-refresh-secret-please'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),

  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 20),

  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@procurement.local',
    password: process.env.ADMIN_PASSWORD ?? 'Admin@12345',
    fullName: process.env.ADMIN_FULL_NAME ?? 'System Administrator',
  },
};
