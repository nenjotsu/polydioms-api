import { getDb } from "./_db.mjs";

export async function handler(event: any) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }
  try {
    const sql = getDb();
    const rows = await sql.query('SELECT * FROM favorite_coffee_blends;');
    return {
      statusCode: 200,
      body: JSON.stringify(rows),
    };
  } catch (error: Error | any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}