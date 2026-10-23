// Read-only snapshot of the PRODUCTION database for the DEV <-> production comparison.
//   node --env-file=.env.prod.local scripts/compare/prod-snapshot.mjs <out.json>
// PROD_DB_URL lives only in .env.prod.local (git-ignored). This script never
// prints it, nor a driver error message (they can name the host / user): codes only.
// Optional PROD_DB_CA = path to the project's CA certificate (dashboard → Database → SSL).
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const PRODUCTION_REF = "blycnuuomfqgvfczkbxc";

function fail(message) {
  console.error(`prod-snapshot: ${message}`);
  process.exit(1);
}

const out = process.argv[2];
if (!out) fail("usage: prod-snapshot.mjs <out.json>");
const raw = process.env.PROD_DB_URL;
if (!raw) fail("PROD_DB_URL is not set (expected in .env.prod.local)");
if (!raw.includes(PRODUCTION_REF)) fail("PROD_DB_URL is not the production project: refused");

// TLS is set here, not by a ?sslmode= left in the URL.
let connectionString;
try {
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  connectionString = url.toString();
} catch {
  fail("PROD_DB_URL is not a valid postgresql:// URL");
}
const ssl = process.env.PROD_DB_CA
  ? { rejectUnauthorized: true, ca: readFileSync(process.env.PROD_DB_CA, "utf8") }
  : { rejectUnauthorized: true };

const snapshot = readFileSync(new URL("./snapshot.sql", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const client = new pg.Client({ connectionString, ssl, application_name: "tasyiir-compare", statement_timeout: 120000 });

try {
  await client.connect();
  await client.query("begin transaction read only");
  const { rows: ro } = await client.query("show transaction_read_only");
  if (ro[0]?.transaction_read_only !== "on") throw Object.assign(new Error(), { code: "NOT_READ_ONLY" });

  const { rows: meta } = await client.query(
    "select current_setting('server_version') as version, current_database() as database",
  );
  const { rows } = await client.query(
    `with s as (${snapshot}) select category, key, coalesce(val, '') as val, md5(coalesce(val, '')) as md5 from s`,
  );
  const { rows: summary } = await client.query(
    `with s as (${snapshot})
     select category, count(*)::int as n,
            md5(string_agg(key || '=' || coalesce(val, ''), chr(10) order by key collate "C")) as md5
     from s group by category order by category`,
  );
  // Rows per table: production must hold reference data only (no seed, no fixture).
  const { rows: counts } = await client.query(
    `select table_schema || '.' || table_name as table,
            (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as n
     from information_schema.tables
     where table_schema in ('public', 'private') and table_type = 'BASE TABLE'
     order by 1`,
  );
  await client.query("rollback");

  writeFileSync(out, JSON.stringify({ meta: meta[0], summary, rows, counts }, null, 1));
  console.log(`prod-snapshot: read-only OK, ${rows.length} objects, ${summary.length} categories, ${counts.length} tables`);
} catch (error) {
  const code = error?.code ?? "unknown";
  const hints = {
    "28P01": "password rejected",
    "3D000": "database not found",
    ENOTFOUND: "host not found",
    ETIMEDOUT: "connection timed out (VPN?)",
    ECONNREFUSED: "connection refused",
    SELF_SIGNED_CERT_IN_CHAIN: "TLS: the server certificate is not trusted; set PROD_DB_CA to the project's CA file",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS: cannot verify the server certificate; set PROD_DB_CA",
    NOT_READ_ONLY: "the transaction is not read-only: stopped before reading anything",
  };
  fail(`failed (${code}${hints[code] ? `: ${hints[code]}` : ""})`);
} finally {
  await client.end().catch(() => {});
}
