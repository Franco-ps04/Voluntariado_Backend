const sql = require('mssql');
require('dotenv').config();
console.log('USER:', process.env.DB_USER);
console.log('PASS:', process.env.DB_PASSWORD);
const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '1433'),
    options: {
        encrypt: false,
        trustServerCertificate: true,
    }
};

//Reutiliza conexiones en vez de abrir una nueva por cada query
let pool;

async function getPool() {
    try {
        if (!pool) {
            pool = await sql.connect(config);
            console.log('Conectado a SQL Server');
        }

        return pool;

    } catch (error) {
        console.error('❌ Error SQL:', error);
        throw error;
    }
}

module.exports = { sql, getPool };
