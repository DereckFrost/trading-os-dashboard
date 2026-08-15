type RequiredEnv =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY";

function readEnv(name: RequiredEnv): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta ${name} en .env.local.`);
  }

  return value;
}

export function getServerConfig() {
  return {
    supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: readEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  };
}

export function getOptionalConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
    cronSecret: process.env.CRON_SECRET?.trim() || null,
  };
}
