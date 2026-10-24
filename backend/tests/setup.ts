process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://app:app@localhost:5432/pickup_test";
process.env.WEBHOOK_SECRET = "test-secret";
process.env.ADMIN_TOKEN = "test-admin";
process.env.ENABLE_SIMULATOR = "true";
delete process.env.ANTHROPIC_API_KEY;
