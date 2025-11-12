import { defineConfig } from "drizzle-kit";
import "dotenv/config"; 

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle", // Thư mục chứa các file migration
  dialect: "postgresql", // Chỉ định là PostgreSQL
  dbCredentials: {
    // Đọc chuỗi kết nối từ file .env
    url: process.env.DATABASE_URL!,
  },
});