export function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) {
    throw new Error("OPENAI_API_KEY is missing or empty");
  }
  return key.trim();
}
