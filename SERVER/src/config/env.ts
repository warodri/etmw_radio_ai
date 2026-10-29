import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const booleanFromString = (defaultValue: "true" | "false") =>
  z
    .string()
    .default(defaultValue)
    .transform((value) =>
      ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()),
    );

/**
 * Admin emails are configured as a JSON array in the env file:
 *   ADMIN_EMAILS=["warodri@gmail.com","someone@example.com"]
 * A comma-separated list is accepted too, so older deployments keep working.
 */
function parseEmailList(raw: string): string[] {
  const value = raw.trim();

  if (!value) {
    return [];
  }

  let entries: string[];

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      entries = Array.isArray(parsed)
        ? parsed.map((entry) => String(entry))
        : [];
    } catch {
      entries = [];
    }
  } else {
    entries = value.split(",");
  }

  return [
    ...new Set(
      entries.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
    ),
  ];
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4330),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default("https://entertomyworld.com/apps/radio-ai"),
  CORS_ORIGINS: z
    .string()
    .default(
      "http://localhost:4200,http://127.0.0.1:4200,https://entertomyworld.com,https://www.entertomyworld.com",
    ),
  TRUST_PROXY: z.string().default("loopback"),

  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  MONGO_DB_NAME: z.string().min(1).default("etmw_radio_ai"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("30d"),

  SMTP_HOST: z.string().default("smtppro.zoho.eu"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: booleanFromString("true"),
  SMTP_USER: z.string().min(1, "SMTP_USER is required"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required"),
  SMTP_FROM: z.string().email().default("info@entertomyworld.com"),
  SMTP_FROM_NAME: z.string().default("ETMW Radio AI"),
  ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
  ADMIN_EMAILS: z.string().default('["warodri@gmail.com"]'),

  AUTH_CODE_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(10),
  AUTH_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().max(50).default(5),
  AUTH_CODE_RATE_EMAIL_MAX: z.coerce.number().int().positive().default(5),
  AUTH_CODE_RATE_IP_MAX: z.coerce.number().int().positive().default(20),
  AUTH_CODE_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  AUTH_DEV_RETURN_CODE: booleanFromString("false"),

  SONGS_API_URL: z
    .string()
    .url()
    .default("https://entertomyworld.com/apps/songs/api"),
  SONGS_API_KEY: z.string().default(""),
  SONGS_API_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  CREATOR_MAX_DURATION_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(240)
    .default(240),

  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2.5-sunburst"),
  OPENAI_IMAGE_SIZE: z.string().default("1024x1024"),
  OPENAI_IMAGE_QUALITY: z
    .enum(["low", "medium", "high", "auto"])
    .default("medium"),
  OPENAI_IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),

  OLLAMA_BASE_URL: z
    .string()
    .url()
    .default("https://ollama--warodri.entertomyworld.com"),
  PHONON_MODEL: z.string().default("phonon"),
  PHONON_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  OLLAMA_TEXT_MODEL: z.string().default('qwen3-vl:32b-instruct'),
  OLLAMA_TEXT_TIMEOUT_MS: z.coerce.number().int().positive().default(900000),

  POIROT_API_URL: z
    .string()
    .url()
    .default('https://entertomyworld.com/apps/poirot'),
  POIROT_API_KEY: z.string().default(''),
  POIROT_TIMEOUT_MS: z.coerce.number().int().positive().default(240000),

  VOICE_STUDIO_API_URL: z
    .string()
    .url()
    .default('https://voice-studio--warodri.entertomyworld.com'),
  VOICE_STUDIO_API_KEY: z.string().default(''),
  VOICE_STUDIO_TIMEOUT_MS: z.coerce.number().int().positive().default(900000),
  VOICE_STUDIO_ENGINE: z.string().trim().max(40).default(''),
  VOICE_STUDIO_PROFILE_OVERRIDE: z.string().trim().max(80).default(''),
  VOICE_STUDIO_EFFECT_PRESET: z.string().trim().max(40).default('raw'),
  VOICE_STUDIO_MAX_CHUNK_CHARS: z.coerce.number().int().min(0).default(0),
  VOICE_STUDIO_CROSSFADE_MS: z.coerce.number().int().min(0).max(1000).default(0),

  SCRIPT_MAX_WORDS: z.coerce.number().int().positive().default(1300),
  SCRIPT_MAX_HOSTS: z.coerce.number().int().positive().max(8).default(2),
  SCRIPT_MAX_DURATION_SECONDS: z.coerce.number().int().positive().default(600),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  isProduction: parsed.NODE_ENV === "production",
  corsOrigins: parsed.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  adminEmails: parseEmailList(parsed.ADMIN_EMAILS),
  devCodeEnabled:
    parsed.NODE_ENV !== "production" && parsed.AUTH_DEV_RETURN_CODE,
};
