import PG from "pg";

export const pool = new PG.Pool({
    host: "localhost",
    port: 5432,
    user: "kabi",
    password: "kabil@007",
    database: "pages",
});
