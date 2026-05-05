// اتصال Prisma CLI اختياري — عرّف DATABASE_URL في .env.local (Postgres محلي/مستضاف).
// تطبيق HR يعتمد Sequelize في backend/.env (MySQL / SQLite / Postgres).
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    directUrl: process.env["DIRECT_URL"],
  },
});
